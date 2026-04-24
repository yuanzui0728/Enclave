import { Module } from '@nestjs/common';
import { ActionRuntimeModule } from '../action-runtime/action-runtime.module';
import { AuthModule } from '../auth/auth.module';
import { ReminderRuntimeModule } from '../reminder-runtime/reminder-runtime.module';
import { SelfAgentWorkspaceService } from './self-agent-workspace.service';
import { SelfAgentService } from './self-agent.service';

@Module({
  imports: [ActionRuntimeModule, AuthModule, ReminderRuntimeModule],
  providers: [SelfAgentService, SelfAgentWorkspaceService],
  exports: [SelfAgentService],
})
export class SelfAgentModule {}
