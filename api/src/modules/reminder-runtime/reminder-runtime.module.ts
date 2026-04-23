import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MessageEntity } from '../chat/message.entity';
import { SystemConfigModule } from '../config/config.module';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { WorldModule } from '../world/world.module';
import { ReminderRuntimeController } from './reminder-runtime.controller';
import { ReminderRuntimeRulesService } from './reminder-runtime-rules.service';
import { ReminderRuntimeService } from './reminder-runtime.service';
import { ReminderTaskEntity } from './reminder-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReminderTaskEntity, MessageEntity, MomentPostEntity]),
    AuthModule,
    SystemConfigModule,
    forwardRef(() => WorldModule),
  ],
  providers: [ReminderRuntimeRulesService, ReminderRuntimeService],
  controllers: [ReminderRuntimeController],
  exports: [ReminderRuntimeService, ReminderRuntimeRulesService],
})
export class ReminderRuntimeModule {}
