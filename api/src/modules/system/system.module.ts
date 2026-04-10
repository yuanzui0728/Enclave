import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { AIBehaviorLogEntity } from '../analytics/ai-behavior-log.entity';
import { SystemConfigModule } from '../config/config.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule,
    SystemConfigModule,
    SchedulerModule,
    TypeOrmModule.forFeature([
      UserEntity,
      CharacterEntity,
      NarrativeArcEntity,
      AIBehaviorLogEntity,
    ]),
  ],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
