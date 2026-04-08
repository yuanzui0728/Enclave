import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

type CloudRequest = {
  headers: Record<string, string | string[] | undefined>;
  cloudPhone?: string;
};

@Injectable()
export class CloudClientAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

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
      const payload = await this.jwtService.verifyAsync<{ phone?: string }>(token);
      if (!payload.phone) {
        throw new UnauthorizedException("访问凭证无效。");
      }
      request.cloudPhone = payload.phone;
      return true;
    } catch {
      throw new UnauthorizedException("访问凭证无效或已过期。");
    }
  }
}
