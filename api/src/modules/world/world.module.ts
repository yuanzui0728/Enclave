import {
  forwardRef,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorldContextEntity } from './world-context.entity';
import { WorldService } from './world.service';
import { WorldController } from './world.controller';
import { AuthModule } from '../auth/auth.module';
import { SystemConfigModule } from '../config/config.module';
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';
import { WorldContextMiddleware } from './world-context.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorldContextEntity]),
    AuthModule,
    SystemConfigModule,
    forwardRef(() => CyberAvatarModule),
  ],
  providers: [WorldService, WorldContextMiddleware],
  controllers: [WorldController],
  exports: [WorldService],
})
export class WorldModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WorldContextMiddleware)
      .exclude({ path: 'health', method: RequestMethod.ALL })
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
