import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { HongbaoCloudClient } from './hongbao-cloud.client';
import { RedPacketAutoSendService } from './red-packet-auto-send.service';
import {
  ChatBackgroundAssetsController,
  ConversationBackgroundController,
  GroupBackgroundController,
} from './chat-backgrounds.controller';
import { ChatBackgroundsService } from './chat-backgrounds.service';
import {
  ChatAttachmentController,
  ChatController,
  ChatStickerController,
  DigitalHumanCallsController,
  FavoritesController,
  GroupController,
  GroupVoiceCallsController,
  MessageRemindersController,
  VoiceCallsController,
} from './chat.controller';
import { DigitalHumanCallsService } from './digital-human-calls.service';
import { MockDigitalHumanProviderAdapter } from './digital-human-provider';
import { FavoritesService } from './favorites.service';
import { GroupService } from './group.service';
import { MessageRemindersService } from './message-reminders.service';
import { SearchActivityController } from './search-activity.controller';
import { SearchActivityService } from './search-activity.service';
import { VoiceCallsService } from './voice-calls.service';
import { GroupVoiceCallsService } from './group-voice-calls.service';
import { GroupReplyPlannerService } from './group-reply-planner.service';
import { GroupReplyOrchestratorService } from './group-reply-orchestrator.service';
import { GroupReplyTaskService } from './group-reply-task.service';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { NarrativeModule } from '../narrative/narrative.module';
import { SystemConfigModule } from '../config/config.module';
import { ActionRuntimeModule } from '../action-runtime/action-runtime.module';
import { AgentDelegationModule } from '../agent-delegation/agent-delegation.module';
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ReminderRuntimeModule } from '../reminder-runtime/reminder-runtime.module';
import { SelfAgentModule } from '../self-agent/self-agent.module';
import { ConversationEntity } from './conversation.entity';
import { FavoriteEntity } from './favorite.entity';
import { FavoriteNoteEntity } from './favorite-note.entity';
import { MessageEntity } from './message.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import { GroupReplyTaskEntity } from './group-reply-task.entity';
import { ReplyArtifactJobEntity } from './reply-artifact-job.entity';
import { MediaInsightJobEntity } from './media-insight-job.entity';
import { ChatCustomStickerEntity } from './custom-sticker.entity';
import { CustomStickersService } from './custom-stickers.service';
import { CharacterEntity } from '../characters/character.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { AIRelationshipEntity } from '../social/ai-relationship.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { FriendRemarkResolverModule } from '../social/friend-remark-resolver.module';
import { CharacterSocialContextService } from './character-social-context.service';
import { ReplyArtifactJobService } from './reply-artifact-job.service';
import { MediaInsightJobService } from './media-insight-job.service';
import { DocumentExtractionService } from './document-extraction.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    forwardRef(() => AiModule),
    AuthModule,
    CharactersModule,
    NarrativeModule,
    SystemConfigModule,
    ActionRuntimeModule,
    forwardRef(() => CyberAvatarModule),
    KnowledgeModule,
    ReminderRuntimeModule,
    SelfAgentModule,
    forwardRef(() => AgentDelegationModule),
    EventsModule,
    FriendRemarkResolverModule,
    TypeOrmModule.forFeature([
      ConversationEntity,
      MessageEntity,
      GroupEntity,
      GroupMemberEntity,
      GroupMessageEntity,
      GroupReplyTaskEntity,
      ReplyArtifactJobEntity,
      MediaInsightJobEntity,
      ChatCustomStickerEntity,
      CharacterEntity,
      FriendshipEntity,
      AIRelationshipEntity,
      MomentPostEntity,
      MomentLikeEntity,
      MomentCommentEntity,
      FavoriteEntity,
      FavoriteNoteEntity,
    ]),
  ],
  providers: [
    ChatGateway,
    ChatService,
    ChatBackgroundsService,
    GroupService,
    GroupReplyPlannerService,
    GroupReplyOrchestratorService,
    GroupReplyTaskService,
    ReplyArtifactJobService,
    MediaInsightJobService,
    DocumentExtractionService,
    FavoritesService,
    SearchActivityService,
    MessageRemindersService,
    DigitalHumanCallsService,
    MockDigitalHumanProviderAdapter,
    VoiceCallsService,
    GroupVoiceCallsService,
    CustomStickersService,
    CharacterSocialContextService,
    HongbaoCloudClient,
    RedPacketAutoSendService,
  ],
  controllers: [
    ChatController,
    ChatAttachmentController,
    ChatStickerController,
    VoiceCallsController,
    GroupVoiceCallsController,
    DigitalHumanCallsController,
    FavoritesController,
    SearchActivityController,
    MessageRemindersController,
    ConversationBackgroundController,
    GroupBackgroundController,
    ChatBackgroundAssetsController,
    GroupController,
  ],
  exports: [
    ChatService,
    ChatBackgroundsService,
    GroupService,
    ChatGateway,
    GroupReplyTaskService,
    ReplyArtifactJobService,
    MediaInsightJobService,
    FavoritesService,
    SearchActivityService,
    MessageRemindersService,
    CharacterSocialContextService,
    HongbaoCloudClient,
  ],
})
export class ChatModule {}
