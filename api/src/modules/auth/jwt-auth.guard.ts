// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../../common/app-error.exception';
import { AuthService } from './auth.service';

export type AuthenticatedUser = {
  id: string;
  username: string;
  role: string;
  userType: string;
};

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    // RFC 6750 §2.1：Bearer scheme 名是大小写不敏感（"Authorization: bearer xxx"
    // 与 "Bearer xxx" 等价）。某些 SDK / 反代会改大小写，硬卡 'Bearer ' 会无故 401。
    if (!header || !/^Bearer\s+/i.test(header)) {
      throw new AppError('AUTH_TOKEN_MISSING', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '缺少访问令牌',
      });
    }
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new AppError('AUTH_TOKEN_MISSING', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '缺少访问令牌',
      });
    }

    let payload;
    try {
      payload = await this.auth.verifyToken(token);
    } catch {
      throw new AppError('AUTH_TOKEN_INVALID', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '访问令牌无效或已过期',
      });
    }
    const user = await this.auth.findById(payload.sub);
    if (!user) {
      throw new AppError('AUTH_USER_NOT_FOUND', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '用户不存在',
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      userType: user.userType,
    };
    return true;
  }
}
// i18n-ignore-end
