import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  resolveCloudAdminJwtAudience,
  resolveCloudAdminSecret,
  resolveCloudJwtIssuer,
} from "../config/cloud-runtime-config";
import { matchesCloudAdminSecret } from "./admin-secret";
import { AdminAuthService } from "./admin-auth.service";
import {
  resolveAdminSessionAudit,
  type AdminSessionAuditRequest,
} from "./admin-session-audit";
import {
  CLOUD_ADMIN_ACCESS_TOKEN_PURPOSE,
  CLOUD_ADMIN_ACCESS_TOKEN_ROLE,
  CLOUD_ADMIN_ACCESS_TOKEN_SUBJECT,
} from "./cloud-jwt.constants";

export type AdminRequest = AdminSessionAuditRequest & {
  cloudAdminSessionId?: string | null;
};

type CloudAdminJwtPayload = {
  role?: string;
  purpose?: string;
  sid?: string;
  sub?: string;
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly adminAuthService: AdminAuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authorization = request.headers["authorization"];
    const bearerToken = typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

    if (bearerToken) {
      try {
        const payload = await this.jwtService.verifyAsync<CloudAdminJwtPayload>(bearerToken, {
          issuer: resolveCloudJwtIssuer(this.configService),
          audience: resolveCloudAdminJwtAudience(this.configService),
        });
        if (
          payload.role !== CLOUD_ADMIN_ACCESS_TOKEN_ROLE ||
          payload.purpose !== CLOUD_ADMIN_ACCESS_TOKEN_PURPOSE ||
          payload.sub !== CLOUD_ADMIN_ACCESS_TOKEN_SUBJECT ||
          !payload.sid
        ) {
          throw new UnauthorizedException("云世界管理平台未授权。");
        }

        await this.adminAuthService.requireSessionForAccess(
          payload.sid,
          resolveAdminSessionAudit(request),
        );
        request.cloudAdminSessionId = payload.sid;
        return true;
      } catch {
        throw new UnauthorizedException("云世界管理平台未授权。");
      }
    }

    const secret = request.headers["x-admin-secret"];
    const expected = resolveCloudAdminSecret(this.configService);

    if (
      typeof secret !== "string" ||
      !secret ||
      !matchesCloudAdminSecret(secret.trim(), expected)
    ) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    request.cloudAdminSessionId = null;
    return true;
  }
}
