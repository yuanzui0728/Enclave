import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorldContextEntity } from './world-context.entity';
import { WorldService } from './world.service';
import { WorldController } from './world.controller';
import { AuthModule } from '../auth/auth.module';
import { SystemConfigModule } from '../config/config.module';
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorldContextEntity]),
    AuthModule,
    SystemConfigModule,
    CyberAvatarModule,
  ],
  providers: [WorldService],
  controllers: [WorldController],
  exports: [WorldService],
})
export class WorldModule {}
