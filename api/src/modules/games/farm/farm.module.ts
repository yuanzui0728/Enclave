import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../../admin/admin.guard';
import { AuthModule } from '../../auth/auth.module';
import { CharactersModule } from '../../characters/characters.module';
import { FeedModule } from '../../feed/feed.module';
import { FarmAdminController } from './farm-admin.controller';
import { FarmCheckinService } from './farm-checkin.service';
import { FarmController } from './farm.controller';
import { FarmEventService } from './farm-event.service';
import { FarmLeaderboardService } from './farm-leaderboard.service';
import { FarmNpcService } from './farm-npc.service';
import { FarmNpcTickService } from './farm-npc-tick.service';
import { FarmQuestService } from './farm-quest.service';
import { FarmStateService } from './farm-state.service';
import { FarmCheckinEntity } from './entities/farm-checkin.entity';
import { FarmEventLogEntity } from './entities/farm-event-log.entity';
import { FarmNpcStateEntity } from './entities/farm-npc-state.entity';
import { FarmPlayerStateEntity } from './entities/farm-player-state.entity';
import { FarmQuestProgressEntity } from './entities/farm-quest-progress.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FarmPlayerStateEntity,
      FarmNpcStateEntity,
      FarmEventLogEntity,
      FarmCheckinEntity,
      FarmQuestProgressEntity,
    ]),
    AuthModule,
    CharactersModule,
    FeedModule,
  ],
  controllers: [FarmController, FarmAdminController],
  providers: [
    FarmStateService,
    FarmEventService,
    FarmNpcService,
    FarmNpcTickService,
    FarmLeaderboardService,
    FarmCheckinService,
    FarmQuestService,
    AdminGuard,
  ],
  exports: [
    FarmStateService,
    FarmEventService,
    FarmNpcService,
    FarmNpcTickService,
    FarmLeaderboardService,
    FarmCheckinService,
    FarmQuestService,
  ],
})
export class FarmModule {}
