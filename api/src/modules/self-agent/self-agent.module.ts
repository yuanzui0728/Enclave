import { Module } from '@nestjs/common';
import { ActionRuntimeModule } from '../action-runtime/action-runtime.module';
import { ReminderRuntimeModule } from '../reminder-runtime/reminder-runtime.module';
import { SelfAgentService } from './self-agent.service';

@Module({
  imports: [ActionRuntimeModule, ReminderRuntimeModule],
  providers: [SelfAgentService],
  exports: [SelfAgentService],
})
export class SelfAgentModule {}
