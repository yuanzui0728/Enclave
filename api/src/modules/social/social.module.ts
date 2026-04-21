import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { ShakeDiscoveryService } from './shake-discovery.service';
import { FriendshipEntity } from './friendship.entity';
import { FriendRequestEntity } from './friend-request.entity';
import { AIRelationshipEntity } from './ai-relationship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { AiModule } from '../ai/ai.module';
import { NarrativeModule } from '../narrative/narrative.module';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { CharactersModule } from '../characters/characters.module';
import { EventsModule } from '../events/events.module';
import { SystemConfigModule } from '../config/config.module';
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FriendshipEntity,
      FriendRequestEntity,
      AIRelationshipEntity,
      CharacterEntity,
      ConversationEntity,
      MessageEntity,
      GroupEntity,
      GroupMemberEntity,
      GroupMessageEntity,
      MomentPostEntity,
      MomentCommentEntity,
      MomentLikeEntity,
      FeedPostEntity,
      FeedCommentEntity,
      UserFeedInteractionEntity,
    ]),
    forwardRef(() => AiModule),
    NarrativeModule,
    AuthModule,
    ChatModule,
    CharactersModule,
    EventsModule,
    SystemConfigModule,
    forwardRef(() => CyberAvatarModule),
  ],
  providers: [SocialService, ShakeDiscoveryService],
  controllers: [SocialController],
  exports: [SocialService],
})
export class SocialModule {}
