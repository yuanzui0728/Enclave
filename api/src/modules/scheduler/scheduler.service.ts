import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { CharacterEntity } from '../characters/character.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { UserEntity } from '../auth/user.entity';
import { WorldService } from '../world/world.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { SocialService } from '../social/social.service';
import { FeedService } from '../feed/feed.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(CharacterEntity)
    private characterRepo: Repository<CharacterEntity>,
    @InjectRepository(FriendRequestEntity)
    private friendRequestRepo: Repository<FriendRequestEntity>,
    @InjectRepository(MomentPostEntity)
    private momentPostRepo: Repository<MomentPostEntity>,
    @InjectRepository(FeedPostEntity)
    private feedPostRepo: Repository<FeedPostEntity>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    private readonly worldService: WorldService,
    private readonly ai: AiOrchestratorService,
    private readonly socialService: SocialService,
    private readonly feedService: FeedService,
  ) {}

  // Every 30 minutes: update WorldContext snapshot
  @Cron('*/30 * * * *')
  async updateWorldContext() {
    try {
      await this.worldService.snapshot();
      this.logger.debug('WorldContext snapshot updated');
    } catch (err) {
      this.logger.error('Failed to update WorldContext', err);
    }
  }

  // Every day at 23:59: expire pending friend requests
  @Cron('59 23 * * *')
  async expireFriendRequests() {
    try {
      const now = new Date();
      await this.friendRequestRepo.update(
        { status: 'pending', expiresAt: LessThan(now) },
        { status: 'expired' },
      );
      this.logger.debug('Expired old friend requests');
    } catch (err) {
      this.logger.error('Failed to expire friend requests', err);
    }
  }

  // Every 10 minutes: update AI online status based on activity schedule
  @Cron('*/10 * * * *')
  async updateAiActiveStatus() {
    try {
      const chars = await this.characterRepo.find();
      const hour = new Date().getHours();
      for (const char of chars) {
        const start = char.activeHoursStart ?? 8;
        const end = char.activeHoursEnd ?? 23;
        const shouldBeOnline = hour >= start && hour <= end;
        if (char.isOnline !== shouldBeOnline) {
          char.isOnline = shouldBeOnline;
          await this.characterRepo.save(char);
        }
      }
    } catch (err) {
      this.logger.error('Failed to update AI active status', err);
    }
  }

  // Every 15 minutes: check if any character should post a moment
  @Cron('*/15 * * * *')
  async checkMomentSchedule() {
    try {
      const chars = await this.characterRepo.find();
      const now = new Date();
      const hour = now.getHours();

      for (const char of chars) {
        if (!char.momentsFrequency || char.momentsFrequency < 1) continue;
        // Only post during active hours
        const start = char.activeHoursStart ?? 8;
        const end = char.activeHoursEnd ?? 22;
        if (hour < start || hour > end) continue;

        // Check if already posted today
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayCount = await this.momentPostRepo.count({
          where: { authorId: char.id, postedAt: LessThan(now) },
        });

        if (todayCount < char.momentsFrequency && Math.random() < 0.15) {
          await this.generateMomentForChar(char);
        }
      }
    } catch (err) {
      this.logger.error('Failed to check moment schedule', err);
    }
  }

  // Every day at random times (10:00, 14:00, 19:00): trigger scene-based friend requests
  @Cron('0 10,14,19 * * *')
  async triggerSceneFriendRequests() {
    try {
      // Only trigger with 40% probability each run
      if (Math.random() > 0.4) return;

      const users = await this.userRepo.find();
      if (users.length === 0) return;

      const scenes = ['coffee_shop', 'gym', 'library', 'bookstore', 'park', 'restaurant', 'cafe'];
      const scene = scenes[Math.floor(Math.random() * scenes.length)];

      // Pick 1-2 random users to receive friend requests
      const targetUsers = users.sort(() => Math.random() - 0.5).slice(0, Math.min(2, users.length));
      for (const user of targetUsers) {
        const req = await this.socialService.triggerSceneFriendRequest(user.id, scene);
        if (req) {
          this.logger.debug(`Triggered scene friend request for user ${user.id} from scene ${scene}`);
        }
      }
    } catch (err) {
      this.logger.error('Failed to trigger scene friend requests', err);
    }
  }

  // Every 5 minutes: trigger AI reactions for pending feed posts
  @Cron('*/5 * * * *')
  async processPendingFeedReactions() {
    try {
      const pending = await this.feedService.getPendingAiReaction(30);
      for (const post of pending) {
        await this.feedService.triggerAiReactionForPost(post);
        this.logger.debug(`Triggered AI reaction for feed post ${post.id}`);
      }
    } catch (err) {
      this.logger.error('Failed to process pending feed reactions', err);
    }
  }

  // Every 2 hours: generate AI dynamic status for online characters
  @Cron('0 */2 * * *')
  async updateCharacterStatus() {
    try {
      const chars = await this.characterRepo.find({ where: { isOnline: true } });
      for (const char of chars) {
        try {
          const status = await this.ai.generateMoment({
            profile: char.profile,
            currentTime: new Date(),
          });
          if (status) {
            const trimmed = status.slice(0, 15);
            await this.characterRepo.update(char.id, { currentStatus: trimmed });
            this.logger.debug(`Updated status for ${char.name}: ${trimmed}`);
          }
        } catch {
          // ignore per-character errors
        }
      }
    } catch (err) {
      this.logger.error('Failed to update character status', err);
    }
  }

  private async generateMomentForChar(char: CharacterEntity) {
    try {
      const text = await this.ai.generateMoment({
        profile: char.profile,
        currentTime: new Date(),
      });
      if (!text) return;

      const post = this.momentPostRepo.create({
        authorId: char.id,
        authorName: char.name,
        authorAvatar: char.avatar,
        authorType: 'character',
        text,
      });
      await this.momentPostRepo.save(post);
      this.logger.debug(`Auto-posted moment for ${char.name}`);
    } catch (err) {
      this.logger.error(`Failed to auto-post moment for ${char.name}`, err);
    }
  }
}
