import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CharacterEntity } from '../characters/character.entity';
import { CharactersModule } from '../characters/characters.module';
import { UserEntity } from '../auth/user.entity';
import { ModerationReportEntity } from '../moderation/moderation-report.entity';
import { AbuseFilterEntity } from './entities/abuse-filter.entity';
import { AbuseFilterHitEntity } from './entities/abuse-filter-hit.entity';
import { WikiFieldProtectionEntity } from './entities/wiki-field-protection.entity';
import { CharacterPageEntity } from './entities/character-page.entity';
import { CharacterRevisionEntity } from './entities/character-revision.entity';
import { EditSubmissionEntity } from './entities/edit-submission.entity';
import { UserWikiProfileEntity } from './entities/user-wiki-profile.entity';
import { WikiBlockEntity } from './entities/wiki-block.entity';
import { WikiProtectionLogEntity } from './entities/wiki-protection-log.entity';
import { WikiTalkThreadEntity } from './entities/wiki-talk-thread.entity';
import { WikiTalkPostEntity } from './entities/wiki-talk-post.entity';
import { WikiWatchlistEntity } from './entities/wiki-watchlist.entity';
import { UserPrivateCharacterEntity } from './entities/user-private-character.entity';
import { WikiRateLimitGuard } from './guards/wiki-rate-limit.guard';
import { WikiRoleGuard } from './guards/wiki-role.guard';
import { AbuseFilterService } from './services/abuse-filter.service';
import { AbuseFilterController } from './controllers/abuse-filter.controller';
import { WikiFieldProtectionService } from './services/wiki-field-protection.service';
import { WikiFieldProtectionController } from './controllers/wiki-field-protection.controller';
import { WikiSystemUserService } from './services/wiki-system-user.service';
import { WikiAntivandalBotService } from './services/wiki-antivandal-bot.service';
import { WikiStatsService } from './services/wiki-stats.service';
import { WikiStatsController } from './controllers/wiki-stats.controller';
import { WikiPageService } from './services/wiki-page.service';
import { WikiEditService } from './services/wiki-edit.service';
import { WikiReviewService } from './services/wiki-review.service';
import { WikiBlockService } from './services/wiki-block.service';
import { WikiProtectionService } from './services/wiki-protection.service';
import { WikiRoleService } from './services/wiki-role.service';
import { WikiTalkService } from './services/wiki-talk.service';
import { WikiWatchlistService } from './services/wiki-watchlist.service';
import { WikiPrivateCharacterService } from './services/wiki-private-character.service';
import { WikiReportService } from './services/wiki-report.service';
import { WikiPageController } from './controllers/wiki-page.controller';
import { WikiReviewController } from './controllers/wiki-review.controller';
import { WikiRevertController } from './controllers/wiki-revert.controller';
import { WikiBlockController } from './controllers/wiki-block.controller';
import { WikiProtectionController } from './controllers/wiki-protection.controller';
import { WikiUserController } from './controllers/wiki-user.controller';
import { WikiTalkController } from './controllers/wiki-talk.controller';
import { WikiWatchlistController } from './controllers/wiki-watchlist.controller';
import { WikiPrivateCharacterController } from './controllers/wiki-private-character.controller';
import { WikiSoftDeleteController } from './controllers/wiki-soft-delete.controller';
import { WikiReportController } from './controllers/wiki-report.controller';

@Module({
  imports: [
    AuthModule,
    CharactersModule,
    forwardRef(() => AiModule),
    TypeOrmModule.forFeature([
      CharacterEntity,
      UserEntity,
      CharacterPageEntity,
      CharacterRevisionEntity,
      EditSubmissionEntity,
      UserWikiProfileEntity,
      WikiBlockEntity,
      WikiProtectionLogEntity,
      WikiTalkThreadEntity,
      WikiTalkPostEntity,
      WikiWatchlistEntity,
      ModerationReportEntity,
      AbuseFilterEntity,
      AbuseFilterHitEntity,
      WikiFieldProtectionEntity,
      UserPrivateCharacterEntity,
    ]),
  ],
  controllers: [
    WikiPageController,
    WikiReviewController,
    WikiRevertController,
    WikiBlockController,
    WikiProtectionController,
    WikiUserController,
    WikiTalkController,
    WikiWatchlistController,
    WikiSoftDeleteController,
    WikiReportController,
    AbuseFilterController,
    WikiFieldProtectionController,
    WikiStatsController,
    WikiPrivateCharacterController,
  ],
  providers: [
    WikiPageService,
    WikiEditService,
    WikiReviewService,
    WikiBlockService,
    WikiProtectionService,
    WikiRoleService,
    WikiTalkService,
    WikiWatchlistService,
    WikiReportService,
    AbuseFilterService,
    WikiFieldProtectionService,
    WikiSystemUserService,
    WikiAntivandalBotService,
    WikiStatsService,
    WikiPrivateCharacterService,
    WikiRoleGuard,
    WikiRateLimitGuard,
  ],
  exports: [
    WikiPageService,
    WikiEditService,
    WikiReviewService,
    WikiBlockService,
    WikiProtectionService,
    WikiRoleService,
    WikiTalkService,
    WikiWatchlistService,
    WikiReportService,
    AbuseFilterService,
    WikiFieldProtectionService,
    WikiSystemUserService,
  ],
})
export class WikiModule {}
