import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiSpeechAssetsService } from './ai-speech-assets.service';
import { AiController } from './ai.controller';
import { VoiceCloneController } from './voice-clone.controller';
import { VoiceCloneService } from './voice-clone.service';
import { VoiceCloneEntity } from './voice-clone.entity';
import { PromptBuilderService } from './prompt-builder.service';
import { ReplyLogicRulesService } from './reply-logic-rules.service';
import { MomentGenerationContextService } from './moment-generation-context.service';
import { WebSearchService } from './web-search.service';
import { SystemConfigModule } from '../config/config.module';
import { WorldModule } from '../world/world.module';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import { N1nPricingSyncService } from '../analytics/n1n-pricing-sync.service';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { MessageEntity } from '../chat/message.entity';
import { InferenceModule } from '../inference/inference.module';
import { MinimaxModule } from '../minimax/minimax.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    SystemConfigModule,
    InferenceModule,
    MinimaxModule,
    SubscriptionModule,
    forwardRef(() => WorldModule),
    TypeOrmModule.forFeature([
      AiUsageLedgerEntity,
      CharacterEntity,
      ConversationEntity,
      GroupEntity,
      MessageEntity,
      VoiceCloneEntity,
    ]),
  ],
  controllers: [AiController, VoiceCloneController],
  providers: [
    AiOrchestratorService,
    AiSpeechAssetsService,
    VoiceCloneService,
    PromptBuilderService,
    ReplyLogicRulesService,
    AiUsageLedgerService,
    N1nPricingSyncService,
    MomentGenerationContextService,
    WebSearchService,
  ],
  exports: [
    AiOrchestratorService,
    AiSpeechAssetsService,
    VoiceCloneService,
    PromptBuilderService,
    ReplyLogicRulesService,
    AiUsageLedgerService,
    N1nPricingSyncService,
    MomentGenerationContextService,
    WebSearchService,
  ],
})
export class AiModule {}
