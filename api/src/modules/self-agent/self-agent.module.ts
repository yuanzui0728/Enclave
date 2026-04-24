import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionRuntimeModule } from '../action-runtime/action-runtime.module';
import { AuthModule } from '../auth/auth.module';
import { SystemConfigModule } from '../config/config.module';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { ActionRunEntity } from '../action-runtime/action-run.entity';
import { FollowupOpenLoopEntity } from '../followup-runtime/followup-open-loop.entity';
import { ReminderTaskEntity } from '../reminder-runtime/reminder-task.entity';
import { ReminderRuntimeModule } from '../reminder-runtime/reminder-runtime.module';
import { SelfAgentHeartbeatRunEntity } from './self-agent-heartbeat-run.entity';
import { SelfAgentRunEntity } from './self-agent-run.entity';
import { SelfAgentRulesService } from './self-agent-rules.service';
import { SelfAgentWorkspaceService } from './self-agent-workspace.service';
import { SelfAgentService } from './self-agent.service';

@Module({
  imports: [
    ActionRuntimeModule,
    AuthModule,
    SystemConfigModule,
    ReminderRuntimeModule,
    TypeOrmModule.forFeature([
      UserEntity,
      CharacterEntity,
      ActionRunEntity,
      ReminderTaskEntity,
      FollowupOpenLoopEntity,
      SelfAgentHeartbeatRunEntity,
      SelfAgentRunEntity,
    ]),
  ],
  providers: [
    SelfAgentRulesService,
    SelfAgentService,
    SelfAgentWorkspaceService,
  ],
  exports: [SelfAgentRulesService, SelfAgentService],
})
export class SelfAgentModule {}
