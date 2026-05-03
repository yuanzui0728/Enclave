import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CharacterEntity } from '../characters/character.entity';
import { CharacterPageEntity } from './entities/character-page.entity';
import { CharacterRevisionEntity } from './entities/character-revision.entity';
import { EditSubmissionEntity } from './entities/edit-submission.entity';
import { UserWikiProfileEntity } from './entities/user-wiki-profile.entity';
import { WikiRoleGuard } from './guards/wiki-role.guard';
import { WikiPageService } from './services/wiki-page.service';
import { WikiEditService } from './services/wiki-edit.service';
import { WikiReviewService } from './services/wiki-review.service';
import { WikiPageController } from './controllers/wiki-page.controller';
import { WikiReviewController } from './controllers/wiki-review.controller';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      CharacterEntity,
      CharacterPageEntity,
      CharacterRevisionEntity,
      EditSubmissionEntity,
      UserWikiProfileEntity,
    ]),
  ],
  controllers: [WikiPageController, WikiReviewController],
  providers: [WikiPageService, WikiEditService, WikiReviewService, WikiRoleGuard],
  exports: [WikiPageService, WikiEditService, WikiReviewService],
})
export class WikiModule {}
