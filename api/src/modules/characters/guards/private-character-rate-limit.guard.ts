// i18n-ignore-start: backend log + error message scaffolding, not user-facing UI.
import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';
// 注：本来想放在 wiki/guards 下（和 WikiRateLimitGuard 邻居），但 WikiModule
// 已经 import CharactersModule，反向 import 会形成循环依赖。挪到 characters 下
// 更通顺：guard 跨 wiki 私有 CRUD 与 characters/import-personal 两条路径，
// 本来就不属于 wiki 概念。

/**
 * 私有角色 / import-personal 的 rate limit。
 *
 * 与 WikiRateLimitGuard 区别：
 * - WikiRateLimitGuard 按 wiki role 分档（newcomer=5/h），是给"公开 wiki 编辑
 *   走巡查流"的硬上限。普通用户也是 newcomer，5/h 对真实写私有角色（一次
 *   保存几下、改几次就破）远远不够。
 * - 这里给所有登录用户统一 60/h，目的是挡脚本滥用（撑爆 user_private_characters
 *   表 / characters 表），不卡正常使用。
 *
 * 内存令牌桶仅在单进程内有效。多进程部署后续应换 Redis（同 WikiRateLimitGuard）。
 */
const HOURLY_QUOTA = 60;
const WINDOW_MS = 60 * 60 * 1000;

type Bucket = { count: number; windowStart: number };

@Injectable()
export class PrivateCharacterRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(PrivateCharacterRateLimitGuard.name);
  private readonly buckets = new Map<string, Bucket>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user?.id) {
      // JwtAuthGuard 应该已经先挡住了。这里再防一道，避免单 guard 顺序错配。
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.UNAUTHORIZED,
        params: { reason: '未登录用户禁止写入私有角色' },
        legacyMessage: '未登录用户禁止写入私有角色',
      });
    }

    const now = Date.now();
    let bucket = this.buckets.get(user.id);
    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(user.id, bucket);
    }
    bucket.count += 1;
    if (bucket.count > HOURLY_QUOTA) {
      const retryAfterSec = Math.ceil(
        (bucket.windowStart + WINDOW_MS - now) / 1000,
      );
      this.logger.warn(
        `private character rate limit hit user=${user.id} count=${bucket.count} quota=${HOURLY_QUOTA} retryAfter=${retryAfterSec}s`,
      );
      throw new AppError('WIKI_RATE_LIMITED', {
        status: HttpStatus.TOO_MANY_REQUESTS,
        params: { role: 'private_character', quota: HOURLY_QUOTA, retryAfterSec },
        legacyMessage: `私有角色操作过频：每小时上限 ${HOURLY_QUOTA} 次，${retryAfterSec} 秒后再试。`,
      });
    }
    return true;
  }
}
// i18n-ignore-end
