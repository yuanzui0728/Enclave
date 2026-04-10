import { Module } from '@nestjs/common';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiSpeechAssetsService } from './ai-speech-assets.service';
import { AiController } from './ai.controller';
import { PromptBuilderService } from './prompt-builder.service';
import { ReplyLogicRulesService } from './reply-logic-rules.service';
import { SystemConfigModule } from '../config/config.module';
import { WorldModule } from '../world/world.module';

@Module({
  imports: [SystemConfigModule, WorldModule],
  controllers: [AiController],
  providers: [
    AiOrchestratorService,
    AiSpeechAssetsService,
    PromptBuilderService,
    ReplyLogicRulesService,
  ],
  exports: [
    AiOrchestratorService,
    AiSpeechAssetsService,
    PromptBuilderService,
    ReplyLogicRulesService,
  ],
})
export class AiModule {}
