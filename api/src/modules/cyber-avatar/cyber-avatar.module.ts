import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CyberAvatarAdminService } from './cyber-avatar-admin.service';
import { CyberAvatarProfileEntity } from './cyber-avatar-profile.entity';
import { CyberAvatarRunEntity } from './cyber-avatar-run.entity';
import { CyberAvatarSignalEntity } from './cyber-avatar-signal.entity';
import { CyberAvatarRulesService } from './cyber-avatar-rules.service';
import { CyberAvatarService } from './cyber-avatar.service';
import { SystemConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CyberAvatarProfileEntity,
      CyberAvatarRunEntity,
      CyberAvatarSignalEntity,
    ]),
    SystemConfigModule,
    AuthModule,
    AiModule,
  ],
  providers: [
    CyberAvatarRulesService,
    CyberAvatarService,
    CyberAvatarAdminService,
  ],
  exports: [
    CyberAvatarRulesService,
    CyberAvatarService,
    CyberAvatarAdminService,
  ],
})
export class CyberAvatarModule {}
