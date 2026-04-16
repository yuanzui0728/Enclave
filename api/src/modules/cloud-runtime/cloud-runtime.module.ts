import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationEntity } from '../chat/conversation.entity';
import { GroupEntity } from '../chat/group.entity';
import { CloudRuntimeReportingService } from './cloud-runtime-reporting.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ConversationEntity, GroupEntity]),
  ],
  providers: [CloudRuntimeReportingService],
})
export class CloudRuntimeModule {}
