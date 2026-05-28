import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// world 侧验证：商城礼物注入只能由 cloud-api 用 CLOUD_SERVICE_TOKEN 发起。
// world 只绑 loopback，公网经 cloud-api 终结；这层是纵深防御，挡伪造的本地回环命中。
// 与 cloud-api 的 ServiceTokenGuard 对称（方向相反），同 FeedInternalServiceTokenGuard。
@Injectable()
export class GiftInternalServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim();
    if (!expected) {
      throw new UnauthorizedException('CLOUD_SERVICE_TOKEN 未配置。');
    }
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const header = request.headers['x-service-token'];
    const token = typeof header === 'string' ? header.trim() : null;
    if (!token || token !== expected) {
      throw new UnauthorizedException('服务间访问凭证不合法。');
    }
    return true;
  }
}
