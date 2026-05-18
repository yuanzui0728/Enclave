// i18n-ignore-start: backend guard, throws domain error codes (not user-facing strings).
import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';

/**
 * 私有角色 AI 自动生成的 rate limit。
 *
 * 与 PrivateCharacterRateLimitGuard (CRUD, 60/h) 区别：
 * - AI 生成每次都触发真实 LLM 调用（实打实 token 成本），需要更严的桶
 * - 单独桶不抢 CRUD 配额：用户即使 AI 用完了，仍可以手动 CRUD 60 次/小时
 *
 * 内存令牌桶仅在单进程内有效。多进程部署后续应换 Redis（同 WikiRateLimitGuard）。
 */
const HOURLY_QUOTA = 50;
const WINDOW_MS = 60 * 60 * 1000;

type Bucket = { count: number; windowStart: number };

@Injectable()
export class WikiAiGenerateRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WikiAiGenerateRateLimitGuard.name);
  private readonly buckets = new Map<string, Bucket>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user?.id) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.UNAUTHORIZED,
        params: { reason: '未登录用户禁止调用 AI 生成' },
        legacyMessage: '未登录用户禁止调用 AI 生成',
      });
    }

    // admin 完全跳过 hourly 配额：本项目里 admin 是运营/项目维护者
    // (yuanzui0728_5999) + wiki 系统机器人 (antivandal / admin_sync)。
    // 运营自己测 prompt / 演示需要不被卡；机器人不调 AI 生成，给也无害。
    // 不增 bucket count，否则 admin 把所有用户共用的 LLM 配额提前打满。
    if (user.role === 'admin') {
      return true;
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
        `wiki AI generate rate limit hit user=${user.id} count=${bucket.count} quota=${HOURLY_QUOTA} retryAfter=${retryAfterSec}s`,
      );
      throw new AppError('WIKI_AI_RATE_LIMITED', {
        status: HttpStatus.TOO_MANY_REQUESTS,
        params: { quota: HOURLY_QUOTA, retryAfterSec },
        legacyMessage: `AI 生成额度用完：每小时上限 ${HOURLY_QUOTA} 次，${retryAfterSec} 秒后再试。`,
      });
    }
    return true;
  }
}
// i18n-ignore-end
