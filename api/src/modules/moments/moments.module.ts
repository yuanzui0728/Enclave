import { forwardRef, Module } from '@nestjs/common';
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
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MomentEntity,
      MomentPostEntity,
      MomentCommentEntity,
      MomentLikeEntity,
    ]),
    forwardRef(() => AiModule),
    CharactersModule,
    AuthModule,
    SocialModule,
    FeedModule,
    forwardRef(() => CyberAvatarModule),
  ],
  providers: [MomentsService],
  controllers: [MomentsController],
  exports: [MomentsService],
})
export class MomentsModule {}
