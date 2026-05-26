import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Repository, ObjectLiteral } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SocialService } from '../social/social.service';
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
  ): Promise<void> {
    const owners = await this.worldOwner.listTenantOwners();
    for (const owner of owners) {
      const ctx: TenantContext = {
        ownerId: owner.id,
        phone: owner.cloudPhone ?? '',
      };
      try {
        await TenantContextStore.run(ctx, () => fn(ctx));
      } catch (error) {
        this.logger.warn(
          `tenant job failed owner=${owner.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // 首触种子：避免 Auth ↔ Social 模块循环，通过 ModuleRef 懒解析 SocialService。
  // ensureDefaultFriendships 自身幂等（已存在则不重复补），失败只告警不阻断请求。
  private async seedNewOwner(ownerId: string, phone: string): Promise<void> {
    try {
      const social = this.moduleRef.get(SocialService, { strict: false });
      await TenantContextStore.run({ ownerId, phone }, () =>
        social.ensureDefaultFriendships(ownerId),
      );
    } catch (error) {
      this.logger.warn(
        `seed new owner failed owner=${ownerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
