import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  resolveCloudClientJwtAudience,
  resolveCloudJwtIssuer,
} from "../config/cloud-runtime-config";
import { CLOUD_CLIENT_ACCESS_TOKEN_PURPOSE } from "./cloud-jwt.constants";

type CloudRequest = {
  headers: Record<string, string | string[] | undefined>;
  cloudPhone?: string;
};

type CloudClientJwtPayload = {
  phone?: string;
  purpose?: string;
  sub?: string;
};

@Injectable()
export class CloudClientAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<CloudRequest>();
    const authorization = request.headers["authorization"];
    const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

    if (!token) {
      throw new UnauthorizedException("缺少云世界访问凭证。");
    }

    try {
      const payload = await this.jwtService.verifyAsync<CloudClientJwtPayload>(token, {
        issuer: resolveCloudJwtIssuer(this.configService),
        audience: resolveCloudClientJwtAudience(this.configService),
      });
      if (
        !payload.phone ||
        payload.purpose !== CLOUD_CLIENT_ACCESS_TOKEN_PURPOSE ||
        payload.sub !== payload.phone
      ) {
        throw new UnauthorizedException("访问凭证无效。");
      }
      request.cloudPhone = payload.phone;
      return true;
    } catch {
      throw new UnauthorizedException("访问凭证无效或已过期。");
    }
  }
}
