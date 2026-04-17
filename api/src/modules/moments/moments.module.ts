import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MomentsService } from './moments.service';
import { MomentsController } from './moments.controller';
import { MomentEntity } from './moment.entity';
import { MomentPostEntity } from './moment-post.entity';
import { MomentCommentEntity } from './moment-comment.entity';
import { MomentLikeEntity } from './moment-like.entity';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';
import { AuthModule } from '../auth/auth.module';
import { SocialModule } from '../social/social.module';
import { FeedModule } from '../feed/feed.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MomentEntity,
      MomentPostEntity,
      MomentCommentEntity,
      MomentLikeEntity,
    ]),
    AiModule,
    CharactersModule,
    AuthModule,
    SocialModule,
    FeedModule,
  ],
  providers: [MomentsService],
  controllers: [MomentsController],
  exports: [MomentsService],
})
export class MomentsModule {}
