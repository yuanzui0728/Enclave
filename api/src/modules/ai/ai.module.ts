import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiSpeechAssetsService } from './ai-speech-assets.service';
import { AiController } from './ai.controller';
import { PromptBuilderService } from './prompt-builder.service';
import { ReplyLogicRulesService } from './reply-logic-rules.service';
import { SystemConfigModule } from '../config/config.module';
import { WorldModule } from '../world/world.module';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';

@Module({
  imports: [
    SystemConfigModule,
    WorldModule,
    TypeOrmModule.forFeature([
      AiUsageLedgerEntity,
      CharacterEntity,
      ConversationEntity,
      GroupEntity,
    ]),
  ],
  controllers: [AiController],
  providers: [
    AiOrchestratorService,
    AiSpeechAssetsService,
    PromptBuilderService,
    ReplyLogicRulesService,
    AiUsageLedgerService,
  ],
  exports: [
    AiOrchestratorService,
    AiSpeechAssetsService,
    PromptBuilderService,
    ReplyLogicRulesService,
    AiUsageLedgerService,
  ],
})
export class AiModule {}
