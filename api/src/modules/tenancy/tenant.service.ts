import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type Repository, type ObjectLiteral } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SocialService } from '../social/social.service';
import { CharacterFriendshipService } from '../social/character-friendship.service';
import { seedCharacters } from '../../database/seed';
import { ensureAiRelationshipSeed } from '../../database/relationship-seed';
import { TenantContext, TenantContextStore } from './tenant-context';
import { TenantRepository } from './tenant-scoped.repository';

// 共享 world 多租户的运行时入口。负责：
//   - 建立 / 读取请求级 TenantContext（AsyncLocalStorage 帧）
//   - phone → owner 建档（首触种子）
//   - cron / 后台 job 的 runAsTenant / runForAllTenants fan-out
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly worldOwner: WorldOwnerService,
    private readonly moduleRef: ModuleRef,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  getContext(): TenantContext {
    return TenantContextStore.getOrThrow();
  }

  getOwnerId(): string {
    return TenantContextStore.getOrThrow().ownerId;
  }

  getPhone(): string {
    return TenantContextStore.getOrThrow().phone;
  }

  tryGetOwnerId(): string | undefined {
    return TenantContextStore.get()?.ownerId;
  }

  scoped<T extends ObjectLiteral>(repo: Repository<T>): TenantRepository<T> {
    return new TenantRepository<T>(repo);
  }

  // 按 phone 建档（首触种子）并返回 TenantContext，但不建立 ALS 帧。用于 WS 连接握手
  // 时把租户身份绑到 socket（之后每个 WS 事件再用 TenantContextStore.run 短暂建帧）。
  async ensureTenant(phone: string): Promise<TenantContext> {
    const { owner, created } = await this.worldOwner.ensureOwnerForPhone(phone);
    if (created) {
      await this.seedNewOwner(owner.id, phone);
    }
    return { ownerId: owner.id, phone };
  }

  // 在指定 phone 的租户帧里跑 fn。新建 owner 时跑一次 owner 级首触种子（默认好友）。
  async runAsTenant<T>(phone: string, fn: () => Promise<T>): Promise<T> {
    const ctx = await this.ensureTenant(phone);
    return TenantContextStore.run(ctx, fn);
  }

  // 已知 ownerId + phone 时直接建帧（cron fan-out 用，省一次按 phone 回查）。
  async runForOwner<T>(
    ownerId: string,
    phone: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return TenantContextStore.run({ ownerId, phone }, fn);
  }

  // cron fan-out：逐 owner 在各自租户帧里跑 fn；一个 owner 抛错只记录、不连累其余。
  async runForAllTenants(
    fn: (ctx: TenantContext) => Promise<void>,
    options?: {
      // 在「建立租户帧之前」对每个 owner 做的轻量预筛（命中会员缓存时是 Map 查找）。
      // 返回 false 的 owner 直接跳过——不建 ALS 帧、不跑 fn，省掉到期 owner 每 tick 的
      // 全角色 DB 读 + LLM 抛错风暴 + per-owner 日志洪流。AI 重活类 cron 用它在枚举阶段
      // 就排除到期 owner（见 SchedulerService.AI_HEAVY_GATED_JOBS）。预筛抛错按「放行进帧」
      // 处理，让帧内原有 gate 兜底，绝不因预筛抖动漏跑正常 owner。
      filter?: (ctx: TenantContext) => boolean | Promise<boolean>;
    },
  ): Promise<{ ran: number; skipped: number }> {
    const owners = await this.worldOwner.listTenantOwners();
    let ran = 0;
    let skipped = 0;
    for (const owner of owners) {
      const ctx: TenantContext = {
        ownerId: owner.id,
        phone: owner.cloudPhone ?? '',
      };
      if (options?.filter) {
        let eligible = true;
        try {
          eligible = await options.filter(ctx);
        } catch {
          eligible = true;
        }
        if (!eligible) {
          // 跳过的 owner 不建帧、不跑 fn。预筛冷缓存命中 cloud-api 时 await 天然让出，
          // 暖缓存是同步 Map 查找——一串跳过不会饿死事件循环，无需额外 setImmediate。
          skipped += 1;
          continue;
        }
      }
      try {
        await TenantContextStore.run(ctx, () => fn(ctx));
        ran += 1;
      } catch (error) {
        this.logger.warn(
          `tenant job failed owner=${owner.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      // 每个 owner 之间让出事件循环：per-owner cron 里一长串 await 的同步 better-sqlite3
      // 查询是微任务，会饿死宏任务队列(I/O/HTTP)，整轮 fan-out 期间 :4100 不响应 → 全员
      // 504。setImmediate(宏任务)强制服务待处理 I/O，把整块阻塞打散。详见
      // WorldOwnerService.forEachOwner 同款注释。
      await new Promise((resolve) => setImmediate(resolve));
    }
    return { ran, skipped };
  }

  // 首触种子：在 owner 租户帧里按依赖顺序把这个新用户的「私有世界」种起来。各步都幂等
  // （已存在则不重复），失败只告警不阻断请求。用 ModuleRef 懒解析 service，避开
  // Auth ↔ Social ↔ Characters 的模块循环。
  //   1. seedCharacters(owner)         —— 默认保底角色 + 自动 preset，每行盖 ownerId
  //   2. ensureDefaultFriendships(owner)—— owner↔默认角色好友（依赖 1 的角色行存在）
  //   3. ensureAiRelationshipSeed(owner)—— 角色-角色关系（按 owner 的角色建，依赖 1）
  //   4. seedFromAiRelationships(owner) —— character_friendship 亲密度种子（依赖 1/3）
  private async seedNewOwner(ownerId: string, phone: string): Promise<void> {
    try {
      await this.seedOwnerWorld(ownerId, phone);
    } catch (error) {
      this.logger.warn(
        `seed new owner failed owner=${ownerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 在 owner 租户帧里按依赖顺序种「私有世界」（角色 + 好友 + 角色关系 + 亲密度）。
  // 抽出来供首触种子 (seedNewOwner) 和「世界居民」全局哨兵种子 (GlobalWorldSeedService)
  // 共用，保证两条路径种出的世界结构一致。各步幂等，可重复跑。调用方负责 try/catch。
  async seedOwnerWorld(ownerId: string, phone: string): Promise<void> {
    const social = this.moduleRef.get(SocialService, { strict: false });
    const charFriendship = this.moduleRef.get(CharacterFriendshipService, {
      strict: false,
    });
    await TenantContextStore.run({ ownerId, phone }, async () => {
      await seedCharacters(this.dataSource, ownerId);
      await social.ensureDefaultFriendships(ownerId);
      await ensureAiRelationshipSeed(this.dataSource, ownerId);
      await charFriendship.seedFromAiRelationships(ownerId);
    });
  }
}
