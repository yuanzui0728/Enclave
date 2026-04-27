import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedService } from './feed.service';
import { FeedController } from './feed.controller';
import { FeedPostEntity } from './feed-post.entity';
import { FeedCommentEntity } from './feed-comment.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { VideoChannelFollowEntity } from './video-channel-follow.entity';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';
import { AuthModule } from '../auth/auth.module';
import { SocialModule } from '../social/social.module';
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';
import { SystemConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedPostEntity,
      FeedCommentEntity,
      UserFeedInteractionEntity,
      VideoChannelFollowEntity,
    ]),
    forwardRef(() => AiModule),
    CharactersModule,
    AuthModule,
    SocialModule,
    SystemConfigModule,
    forwardRef(() => CyberAvatarModule),
  ],
  providers: [FeedService],
  controllers: [FeedController],
  exports: [FeedService],
})
export class FeedModule {}
