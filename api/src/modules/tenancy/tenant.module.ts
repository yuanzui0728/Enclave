import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GlobalWorldSeedService } from './global-world-seed.service';
import { registerAllScopedEntities } from './scoped-entities';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantService } from './tenant.service';

// 模块加载即填充 scoped 实体注册表（subscriber / TenantRepository / CI 守卫共用）。
registerAllScopedEntities();

// @Global：TenantService 全局可注入，避免改 30+ 个 service 的 module imports。
// 只 import AuthModule 取 WorldOwnerService；SocialService 在运行时经 ModuleRef 懒解析，
// 不静态 import SocialModule，避免循环依赖。
@Global()
@Module({
  imports: [AuthModule],
  providers: [TenantService, TenantContextMiddleware, GlobalWorldSeedService],
  exports: [TenantService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .exclude({ path: 'health', method: RequestMethod.ALL })
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
