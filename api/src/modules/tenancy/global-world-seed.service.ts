import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  GLOBAL_WORLD_OWNER_ID,
  GLOBAL_WORLD_OWNER_PHONE,
  isSharedWorldMode,
} from './tenant-context';
import { TenantService } from './tenant.service';

// 「世界居民」全局共享池的引导。仅 shared 模式生效：
//   1. 幂等建哨兵 owner 行（getOwnerOrThrow 依赖它存在）
//   2. 在全局帧里种世界居民（preset 角色 + 好友 + 角色关系），让全局广场有发帖主体
//      且角色间能互相点赞/评论
// boot 时跑一次；全程幂等，重启 / 多进程并发都安全（建行 UNIQUE 兜底、seed 按复合主键幂等）。
// 全局广场内容的「持续生成」由 scheduler 的全局 pass 驱动（Phase 2），这里只负责把世界种出来。
@Injectable()
export class GlobalWorldSeedService implements OnModuleInit {
  private readonly logger = new Logger(GlobalWorldSeedService.name);

  constructor(
    private readonly worldOwner: WorldOwnerService,
    private readonly tenantService: TenantService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isSharedWorldMode()) return;
    try {
      await this.worldOwner.ensureGlobalOwnerRow();
      await this.tenantService.seedOwnerWorld(
        GLOBAL_WORLD_OWNER_ID,
        GLOBAL_WORLD_OWNER_PHONE,
      );
      this.logger.log('global world residents seeded');
    } catch (error) {
      this.logger.warn(
        `global world seed failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
