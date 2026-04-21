import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CharacterEntity } from '../characters/character.entity';
import { CharactersModule } from '../characters/characters.module';
import { ChatModule } from '../chat/chat.module';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { MessageEntity } from '../chat/message.entity';
import { SystemConfigModule } from '../config/config.module';
import { CyberAvatarRealWorldBriefEntity } from '../cyber-avatar/cyber-avatar-real-world-brief.entity';
import { CyberAvatarRealWorldItemEntity } from '../cyber-avatar/cyber-avatar-real-world-item.entity';
import { EventsModule } from '../events/events.module';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { SocialModule } from '../social/social.module';
import { NeedDiscoveryCandidateEntity } from './need-discovery-candidate.entity';
import { NeedDiscoveryConfigService } from './need-discovery-config.service';
import { NeedDiscoveryLifecycleService } from './need-discovery-lifecycle.service';
import { NeedDiscoveryRunEntity } from './need-discovery-run.entity';
import { NeedDiscoveryService } from './need-discovery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NeedDiscoveryRunEntity,
      NeedDiscoveryCandidateEntity,
      CharacterEntity,
      ConversationEntity,
      GroupEntity,
      GroupMemberEntity,
      GroupMessageEntity,
      MessageEntity,
      CyberAvatarRealWorldItemEntity,
      CyberAvatarRealWorldBriefEntity,
      MomentPostEntity,
      MomentCommentEntity,
      MomentLikeEntity,
      FeedPostEntity,
      FeedCommentEntity,
      UserFeedInteractionEntity,
      FriendshipEntity,
    ]),
    forwardRef(() => AiModule),
    AuthModule,
    CharactersModule,
    forwardRef(() => ChatModule),
    SystemConfigModule,
    SocialModule,
    EventsModule,
  ],
  providers: [
    NeedDiscoveryConfigService,
    NeedDiscoveryService,
    NeedDiscoveryLifecycleService,
  ],
  exports: [NeedDiscoveryConfigService, NeedDiscoveryService],
})
export class NeedDiscoveryModule {}
