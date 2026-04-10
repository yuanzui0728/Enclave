import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { CharacterEntity } from '../characters/character.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { UserEntity } from '../auth/user.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { WorldService } from '../world/world.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { SocialService } from '../social/social.service';
import { FeedService } from '../feed/feed.service';
import { ChatGateway } from '../chat/chat.gateway';
import { AIRelationshipEntity } from '../social/ai-relationship.entity';
import { DEFAULT_CHARACTER_IDS } from '../characters/default-characters';

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
    @InjectRepository(ConversationEntity)
    private convRepo: Repository<ConversationEntity>,
    @InjectRepository(AIRelationshipEntity)
    private aiRelationshipRepo: Repository<AIRelationshipEntity>,
    private readonly worldService: WorldService,
    private readonly ai: AiOrchestratorService,
    private readonly socialService: SocialService,
    private readonly feedService: FeedService,
    private readonly chatGateway: ChatGateway,
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
        if (
          DEFAULT_CHARACTER_IDS.includes(
            char.id as (typeof DEFAULT_CHARACTER_IDS)[number],
          )
        ) {
          char.isOnline = true;
          char.currentActivity = 'free';
          await this.characterRepo.save(char);
          continue;
        }

        const start = char.activeHoursStart ?? 8;
        const end = char.activeHoursEnd ?? 23;
        const shouldBeOnline = hour >= start && hour <= end;
        const wasOnline = char.isOnline;
        char.isOnline = shouldBeOnline;
        if (wasOnline !== shouldBeOnline) {
          await this.characterRepo.save(char);
        }
      }

      await this.maybeStrengthenAiRelationships(
        chars.filter((char) => char.isOnline),
      );
    } catch (err) {
      this.logger.error('Failed to update AI active status', err);
    }
  }

  // Every 15 minutes: check if any character should post a moment
  @Cron('*/15 * * * *')
  async checkMomentSchedule() {
    try {
      const friendCharacterIds = new Set(
        await this.socialService.getFriendCharacterIds(),
      );
      if (!friendCharacterIds.size) {
        return;
      }

      const chars = (await this.characterRepo.find()).filter((char) =>
        friendCharacterIds.has(char.id),
      );
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

      const scenes = [
        'coffee_shop',
        'gym',
        'library',
        'bookstore',
        'park',
        'restaurant',
        'cafe',
      ];
      const scene = scenes[Math.floor(Math.random() * scenes.length)];

      const req = await this.socialService.triggerSceneFriendRequest(scene);
      if (req) {
        this.logger.debug(`Triggered scene friend request from scene ${scene}`);
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

  // Every 2 hours: update character activity state based on time of day
  @Cron('0 */2 * * *')
  async updateCharacterStatus() {
    try {
      const chars = await this.characterRepo.find();
      const hour = new Date().getHours();

      // Time-based activity mapping
      const getActivity = (): string => {
        if (hour >= 0 && hour <= 6) return 'sleeping';
        if (hour === 7 || hour === 8 || hour === 18 || hour === 19)
          return 'commuting';
        if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 17))
          return 'working';
        if (hour === 12 || hour === 13 || hour === 20) return 'eating';
        return 'free'; // 21-23
      };

      const baseActivity = getActivity();
      // Add some randomness: 20% chance to deviate
      const activities = [
        'working',
        'eating',
        'resting',
        'commuting',
        'free',
        'sleeping',
      ];

      for (const char of chars) {
        if (
          DEFAULT_CHARACTER_IDS.includes(
            char.id as (typeof DEFAULT_CHARACTER_IDS)[number],
          )
        ) {
          await this.characterRepo.update(char.id, {
            currentActivity: 'free',
            isOnline: true,
          });
          continue;
        }

        const activity =
          Math.random() < 0.8
            ? baseActivity
            : activities[Math.floor(Math.random() * activities.length)];
        await this.characterRepo.update(char.id, { currentActivity: activity });
        this.logger.debug(`Updated activity for ${char.name}: ${activity}`);
      }
    } catch (err) {
      this.logger.error('Failed to update character status', err);
    }
  }

  // Every day at 20:00: scan memories and send proactive messages
  @Cron('0 20 * * *')
  async triggerMemoryProactiveMessages() {
    try {
      const chars = await this.characterRepo.find();
      for (const char of chars) {
        try {
          const memory = char.profile?.memory;
          const memoryText = [memory?.coreMemory, memory?.recentSummary]
            .filter(Boolean)
            .join('\n');
          if (!memoryText) continue;

          // Ask LLM if there's something worth proactively reminding
          const checkPrompt = `以下是${char.name}对用户的记忆：\n${memoryText}\n\n今天是${new Date().toLocaleDateString('zh-CN')}。判断是否有值得主动提醒用户的事项（如考试、面试、生日、重要约定等）。\n\n如果有，输出一条自然的提醒消息（以${char.name}的口吻，不超过50字）。\n如果没有，只输出：NO_ACTION`;
          const model = await this.ai['configService'].getAiModel();
          const client = this.ai['client'] as import('openai').default;
          const resp = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: checkPrompt }],
            max_tokens: 100,
            temperature: 0.7,
          });
          const result = sanitizeAiText(
            resp.choices[0]?.message?.content ?? 'NO_ACTION',
          );
          if (result === 'NO_ACTION' || result.startsWith('NO_ACTION'))
            continue;

          // Find conversations for this character
          const convs = await this.convRepo.find();
          for (const conv of convs) {
            if (!conv.participants.includes(char.id)) continue;
            await this.chatGateway.sendProactiveMessage(
              conv.id,
              char.id,
              char.name,
              result,
            );
            this.logger.debug(
              `Sent proactive message from ${char.name} to conv ${conv.id}`,
            );
          }
        } catch {
          // ignore per-character errors
        }
      }
    } catch (err) {
      this.logger.error('Failed to trigger proactive messages', err);
    }
  }

  private async maybeStrengthenAiRelationships(chars: CharacterEntity[]) {
    if (chars.length < 2) {
      return;
    }

    for (let index = 0; index < chars.length; index += 1) {
      for (let inner = index + 1; inner < chars.length; inner += 1) {
        if (Math.random() > 0.08) {
          continue;
        }

        const left = chars[index];
        const right = chars[inner];
        if (!left || !right) {
          continue;
        }

        const [characterIdA, characterIdB] = [left.id, right.id].sort();
        const existing = await this.aiRelationshipRepo.findOne({
          where: [
            { characterIdA, characterIdB },
            { characterIdA: characterIdB, characterIdB: characterIdA },
          ],
        });

        if (existing) {
          existing.strength = Math.min(100, existing.strength + 4);
          await this.aiRelationshipRepo.save(existing);
          continue;
        }

        await this.aiRelationshipRepo.save(
          this.aiRelationshipRepo.create({
            characterIdA,
            characterIdB,
            relationshipType: 'acquaintance',
            strength: 18,
            backstory: 'They often overlap online and slowly become familiar.',
          }),
        );
      }
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
