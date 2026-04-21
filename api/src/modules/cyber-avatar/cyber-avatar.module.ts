import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CyberAvatarAdminService } from './cyber-avatar-admin.service';
import { CyberAvatarProfileEntity } from './cyber-avatar-profile.entity';
import { CyberAvatarRealWorldBriefEntity } from './cyber-avatar-real-world-brief.entity';
import { CyberAvatarRealWorldItemEntity } from './cyber-avatar-real-world-item.entity';
import { CyberAvatarRealWorldService } from './cyber-avatar-real-world.service';
import { CyberAvatarRunEntity } from './cyber-avatar-run.entity';
import { CyberAvatarSignalEntity } from './cyber-avatar-signal.entity';
import { CyberAvatarRulesService } from './cyber-avatar-rules.service';
import { CyberAvatarService } from './cyber-avatar.service';
import { SystemConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { NeedDiscoveryModule } from '../need-discovery/need-discovery.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CyberAvatarProfileEntity,
      CyberAvatarRealWorldItemEntity,
      CyberAvatarRealWorldBriefEntity,
      CyberAvatarRunEntity,
      CyberAvatarSignalEntity,
    ]),
    SystemConfigModule,
    AuthModule,
    forwardRef(() => AiModule),
    forwardRef(() => NeedDiscoveryModule),
  ],
  providers: [
    CyberAvatarRulesService,
    CyberAvatarService,
    CyberAvatarRealWorldService,
    CyberAvatarAdminService,
  ],
  exports: [
    CyberAvatarRulesService,
    CyberAvatarService,
    CyberAvatarRealWorldService,
    CyberAvatarAdminService,
  ],
})
export class CyberAvatarModule {}
