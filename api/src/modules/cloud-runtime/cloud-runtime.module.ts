import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { MessageEntity } from '../chat/message.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { VideoChannelFollowEntity } from '../feed/video-channel-follow.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { AiModule } from '../ai/ai.module';
import { SystemConfigModule } from '../config/config.module';
import { CloudRuntimeReportingService } from './cloud-runtime-reporting.service';
import { CloudTokenUsageSyncService } from './cloud-token-usage-sync.service';

@Module({
  imports: [
    ConfigModule,
    AiModule,
    SystemConfigModule,
    TypeOrmModule.forFeature([
      AiUsageLedgerEntity,
      ConversationEntity,
      GroupEntity,
      MessageEntity,
      GroupMessageEntity,
      // 「上次交互时间」(lastUserBehaviorAt) 取这 5 张表的真人行为最新时间，
      // 与「用户行为」后台页同源（authorType='user' / ownerId）。
      MomentCommentEntity,
      MomentLikeEntity,
      FeedCommentEntity,
      UserFeedInteractionEntity,
      VideoChannelFollowEntity,
    ]),
  ],
  providers: [CloudRuntimeReportingService, CloudTokenUsageSyncService],
  exports: [CloudTokenUsageSyncService],
})
export class CloudRuntimeModule {}
