import { Module } from '@nestjs/common';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { PromptBuilderService } from './prompt-builder.service';
import { SystemConfigModule } from '../config/config.module';

@Module({
  imports: [SystemConfigModule],
  providers: [AiOrchestratorService, PromptBuilderService],
  exports: [AiOrchestratorService, PromptBuilderService],
})
export class AiModule {}
