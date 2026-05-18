import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MomentsService } from './moments.service';
import { MomentsController } from './moments.controller';
import { MomentImageBudgetService } from './moment-image-budget.service';
import { MomentEntity } from './moment.entity';
import { MomentPostEntity } from './moment-post.entity';
import { MomentCommentEntity } from './moment-comment.entity';
import { MomentLikeEntity } from './moment-like.entity';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';
import { AuthModule } from '../auth/auth.module';
import { SocialModule } from '../social/social.module';
import { FriendRemarkResolverModule } from '../social/friend-remark-resolver.module';
import { FeedModule } from '../feed/feed.module';
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';
import { ReminderRuntimeModule } from '../reminder-runtime/reminder-runtime.module';
import { MinimaxModule } from '../minimax/minimax.module';
import { MomentsMinimaxCallbacks } from './moments-minimax.callbacks';
import { SystemConfigModule } from '../config/config.module';

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
    FriendRemarkResolverModule,
    FeedModule,
    forwardRef(() => CyberAvatarModule),
    ReminderRuntimeModule,
    MinimaxModule,
    SystemConfigModule,
  ],
  providers: [MomentsService, MomentsMinimaxCallbacks, MomentImageBudgetService],
  controllers: [MomentsController],
  exports: [MomentsService, MomentImageBudgetService],
})
export class MomentsModule {}
