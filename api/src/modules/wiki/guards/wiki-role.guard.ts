import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard';

export const WIKI_ROLE_KEY = 'wiki_required_role';

export const WIKI_ROLE_RANK: Record<string, number> = {
  newcomer: 0,
  autoconfirmed: 1,
  patroller: 2,
  admin: 3,
};

export function rankOf(role: string | undefined): number {
  if (!role) return -1;
  return WIKI_ROLE_RANK[role] ?? -1;
}

@Injectable()
export class WikiRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(WIKI_ROLE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = req.user?.role;
    if (rankOf(role) < rankOf(required)) {
      throw new ForbiddenException(`需要 ${required} 及以上权限`);
    }
    return true;
  }
}
