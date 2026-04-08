import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const secret = request.headers["x-admin-secret"];
    const expected = process.env.CLOUD_ADMIN_SECRET ?? "cloud-admin-secret";

    if (typeof secret !== "string" || !secret || secret !== expected) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    return true;
  }
}
