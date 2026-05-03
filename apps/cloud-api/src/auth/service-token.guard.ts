import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const expected = this.configService.get<string>("CLOUD_SERVICE_TOKEN")?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        "云端未配置 CLOUD_SERVICE_TOKEN，无法处理服务间请求。",
      );
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const header = request.headers["x-service-token"];
    const token = typeof header === "string" ? header.trim() : null;
    if (!token || token !== expected) {
      throw new UnauthorizedException("服务间访问凭证不合法。");
    }
    return true;
  }
}
