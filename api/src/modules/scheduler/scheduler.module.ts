import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { CharacterEntity } from '../characters/character.entity';
import { UserEntity } from '../auth/user.entity';
import { WorldModule } from '../world/world.module';
import { AiModule } from '../ai/ai.module';
import { SocialModule } from '../social/social.module';
import { FeedModule } from '../feed/feed.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MomentPostEntity, FeedPostEntity, FriendRequestEntity, CharacterEntity, UserEntity]),
    WorldModule,
    AiModule,
    SocialModule,
    FeedModule,
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
