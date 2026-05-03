import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
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
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少访问令牌');
    }
    const token = header.slice(7).trim();
    if (!token) throw new UnauthorizedException('缺少访问令牌');

    let payload;
    try {
      payload = await this.auth.verifyToken(token);
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }
    const user = await this.auth.findById(payload.sub);
    if (!user) throw new UnauthorizedException('用户不存在');

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      userType: user.userType,
    };
    return true;
  }
}
