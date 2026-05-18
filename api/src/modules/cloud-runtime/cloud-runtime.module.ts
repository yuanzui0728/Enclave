import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { MessageEntity } from '../chat/message.entity';
import { CharacterRevisionEntity } from '../wiki/entities/character-revision.entity';
import { EditSubmissionEntity } from '../wiki/entities/edit-submission.entity';
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
      CharacterRevisionEntity,
      EditSubmissionEntity,
    ]),
  ],
  providers: [CloudRuntimeReportingService, CloudTokenUsageSyncService],
  exports: [CloudTokenUsageSyncService],
})
export class CloudRuntimeModule {}
