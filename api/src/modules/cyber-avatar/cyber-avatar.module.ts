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
import { WorldContextHubService } from './world-context-hub.service';
import { PassiveProfileInferenceService } from './passive-profile-inference.service';
import { FeedPreferenceDigestService } from './feed-preference-digest.service';
import { OwnerOpenQuestionService } from './owner-open-question.service';
import { CyberAvatarMatchmakingSyncService } from './cyber-avatar-matchmaking-sync.service';
import { CyberAvatarEncounterService } from './cyber-avatar-encounter.service';
import { CyberAvatarMatchmakingController } from './cyber-avatar-matchmaking.controller';
import { CyberAvatarSelfController } from './cyber-avatar-self.controller';
import { CyberAvatarSelfService } from './cyber-avatar-self.service';
import { MatchmakingServiceTokenGuard } from './matchmaking-service-token.guard';
import { SystemConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { NeedDiscoveryModule } from '../need-discovery/need-discovery.module';
import { MessageEntity } from '../chat/message.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { CharacterEntity } from '../characters/character.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CyberAvatarProfileEntity,
      CyberAvatarRealWorldItemEntity,
      CyberAvatarRealWorldBriefEntity,
      CyberAvatarRunEntity,
      CyberAvatarSignalEntity,
      MessageEntity,
      UserFeedInteractionEntity,
      FeedPostEntity,
      CharacterEntity,
    ]),
    SystemConfigModule,
    AuthModule,
    forwardRef(() => AiModule),
    forwardRef(() => NeedDiscoveryModule),
  ],
  controllers: [CyberAvatarMatchmakingController, CyberAvatarSelfController],
  providers: [
    CyberAvatarRulesService,
    CyberAvatarService,
    WorldContextHubService,
    PassiveProfileInferenceService,
    FeedPreferenceDigestService,
    OwnerOpenQuestionService,
    CyberAvatarSelfService,
    CyberAvatarMatchmakingSyncService,
    CyberAvatarEncounterService,
    MatchmakingServiceTokenGuard,
    CyberAvatarRealWorldService,
    CyberAvatarAdminService,
  ],
  exports: [
    CyberAvatarRulesService,
    CyberAvatarService,
    WorldContextHubService,
    CyberAvatarRealWorldService,
    CyberAvatarAdminService,
  ],
})
export class CyberAvatarModule {}
