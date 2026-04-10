import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
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
import { SchedulerTelemetryService } from './scheduler-telemetry.service';
import type { SchedulerJobId } from './scheduler-telemetry.types';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';

type TrackedJobResult = {
  summary: string;
};

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(FriendRequestEntity)
    private readonly friendRequestRepo: Repository<FriendRequestEntity>,
    @InjectRepository(MomentPostEntity)
    private readonly momentPostRepo: Repository<MomentPostEntity>,
    @InjectRepository(FeedPostEntity)
    private readonly feedPostRepo: Repository<FeedPostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ConversationEntity)
    private readonly convRepo: Repository<ConversationEntity>,
    @InjectRepository(AIRelationshipEntity)
    private readonly aiRelationshipRepo: Repository<AIRelationshipEntity>,
    private readonly worldService: WorldService,
    private readonly ai: AiOrchestratorService,
    private readonly socialService: SocialService,
    private readonly feedService: FeedService,
    private readonly chatGateway: ChatGateway,
    private readonly telemetry: SchedulerTelemetryService,
    private readonly replyLogicRules: ReplyLogicRulesService,
  ) {}

  @Cron('*/30 * * * *')
  async updateWorldContext() {
    await this.runScheduledJob(
      'world_context_snapshot',
      () => this.handleUpdateWorldContext(),
      'Failed to update WorldContext',
    );
  }

  @Cron('59 23 * * *')
  async expireFriendRequests() {
    await this.runScheduledJob(
      'expire_friend_requests',
      () => this.handleExpireFriendRequests(),
      'Failed to expire friend requests',
    );
  }

  @Cron('*/10 * * * *')
  async updateAiActiveStatus() {
    await this.runScheduledJob(
      'update_ai_active_status',
      () => this.handleUpdateAiActiveStatus(),
      'Failed to update AI active status',
    );
  }

  @Cron('*/15 * * * *')
  async checkMomentSchedule() {
    await this.runScheduledJob(
      'check_moment_schedule',
      () => this.handleCheckMomentSchedule(),
      'Failed to check moment schedule',
    );
  }

  @Cron('0 10,14,19 * * *')
  async triggerSceneFriendRequests() {
    await this.runScheduledJob(
      'trigger_scene_friend_requests',
      () => this.handleTriggerSceneFriendRequests(),
      'Failed to trigger scene friend requests',
    );
  }

  @Cron('*/5 * * * *')
  async processPendingFeedReactions() {
    await this.runScheduledJob(
      'process_pending_feed_reactions',
      () => this.handleProcessPendingFeedReactions(),
      'Failed to process pending feed reactions',
    );
  }

  @Cron('*/20 * * * *')
  async checkChannelsSchedule() {
    await this.runScheduledJob(
      'check_channels_schedule',
      () => this.handleCheckChannelsSchedule(),
      'Failed to check channels schedule',
    );
  }

  @Cron('0 */2 * * *')
  async updateCharacterStatus() {
    await this.runScheduledJob(
      'update_character_status',
      () => this.handleUpdateCharacterStatus(),
      'Failed to update character status',
    );
  }

  @Cron('0 * * * *')
  async triggerMemoryProactiveMessages() {
    await this.runScheduledJob(
      'trigger_memory_proactive_messages',
      () => this.handleTriggerMemoryProactiveMessages(),
      'Failed to trigger proactive messages',
    );
  }

  async runJobNow(jobId: string) {
    try {
      const summary = await this.executeManualJob(jobId as SchedulerJobId);
      return {
        success: true,
        message: summary,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : `Failed to run scheduler job ${jobId}.`,
      };
    }
  }

  private async runScheduledJob(
    jobId: SchedulerJobId,
    handler: () => Promise<TrackedJobResult>,
    errorMessage: string,
  ) {
    try {
      await this.executeTrackedJob(jobId, handler);
    } catch (error) {
      this.logger.error(
        errorMessage,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async executeManualJob(jobId: SchedulerJobId) {
    switch (jobId) {
      case 'world_context_snapshot':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleUpdateWorldContext(),
        )).summary;
      case 'expire_friend_requests':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleExpireFriendRequests(),
        )).summary;
      case 'update_ai_active_status':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleUpdateAiActiveStatus(),
        )).summary;
      case 'check_moment_schedule':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleCheckMomentSchedule(),
        )).summary;
      case 'trigger_scene_friend_requests':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleTriggerSceneFriendRequests(),
        )).summary;
      case 'process_pending_feed_reactions':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleProcessPendingFeedReactions(),
        )).summary;
      case 'check_channels_schedule':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleCheckChannelsSchedule(),
        )).summary;
      case 'update_character_status':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleUpdateCharacterStatus(),
        )).summary;
      case 'trigger_memory_proactive_messages':
        return (await this.executeTrackedJob(jobId, () =>
          this.handleTriggerMemoryProactiveMessages(),
        )).summary;
      default:
        throw new Error(`Unknown scheduler job ${jobId}`);
    }
  }

  private async executeTrackedJob(
    jobId: SchedulerJobId,
    handler: () => Promise<TrackedJobResult>,
  ) {
    const handle = this.telemetry.startJob(jobId);
    try {
      const result = await handler();
      this.telemetry.finishJob(handle, result.summary);
      return result;
    } catch (error) {
      this.telemetry.failJob(handle, error);
      throw error;
    }
  }

  private async handleUpdateWorldContext(): Promise<TrackedJobResult> {
    await this.worldService.snapshot();
    this.logger.debug('WorldContext snapshot updated');
    return {
      summary: 'WorldContext 快照已更新。',
    };
  }

  private async handleExpireFriendRequests(): Promise<TrackedJobResult> {
    const now = new Date();
    const result = await this.friendRequestRepo.update(
      { status: 'pending', expiresAt: LessThan(now) },
      { status: 'expired' },
    );
    this.logger.debug('Expired old friend requests');
    return {
      summary: `已过期 ${(result.affected ?? 0).toString()} 条好友请求。`,
    };
  }

  private async handleUpdateAiActiveStatus(): Promise<TrackedJobResult> {
    const chars = await this.characterRepo.find();
    const hour = new Date().getHours();
    let changedCount = 0;
    let manualLockedCount = 0;

    for (const char of chars) {
      if (
        DEFAULT_CHARACTER_IDS.includes(
          char.id as (typeof DEFAULT_CHARACTER_IDS)[number],
        )
      ) {
        const nextOnline = true;
        const nextActivity = 'free';
        const onlineChanged = char.isOnline !== nextOnline;
        const activityChanged = char.currentActivity !== nextActivity;
        if (onlineChanged || activityChanged) {
          char.isOnline = nextOnline;
          char.currentActivity = nextActivity;
          await this.characterRepo.save(char);
          changedCount += 1;
          if (onlineChanged) {
            this.telemetry.recordCharacterEvent({
              characterId: char.id,
              characterName: char.name,
              kind: 'online_status_changed',
              title: '在线状态切换',
              summary: '默认角色已强制保持在线。',
              jobId: 'update_ai_active_status',
            });
          }
          if (activityChanged) {
            this.telemetry.recordCharacterEvent({
              characterId: char.id,
              characterName: char.name,
              kind: 'activity_changed',
              title: '活动状态刷新',
              summary: '默认角色活动已重置为空闲。',
              jobId: 'update_ai_active_status',
            });
          }
        }
        continue;
      }

      if (char.onlineMode === 'manual') {
        manualLockedCount += 1;
        continue;
      }

      const start = char.activeHoursStart ?? 8;
      const end = char.activeHoursEnd ?? 23;
      const shouldBeOnline = hour >= start && hour <= end;
      const wasOnline = char.isOnline;
      if (wasOnline !== shouldBeOnline) {
        char.isOnline = shouldBeOnline;
        await this.characterRepo.save(char);
        changedCount += 1;
        this.telemetry.recordCharacterEvent({
          characterId: char.id,
          characterName: char.name,
          kind: 'online_status_changed',
          title: '在线状态切换',
          summary: shouldBeOnline
            ? `已进入活跃时间窗 ${start}:00-${end}:00，切换为在线。`
            : `已离开活跃时间窗 ${start}:00-${end}:00，切换为离线。`,
          jobId: 'update_ai_active_status',
        });
      }
    }

    const relationshipUpdates = await this.maybeStrengthenAiRelationships(
      chars.filter((char) => char.isOnline),
    );

    return {
      summary: `检查 ${chars.length} 个角色，在线状态变更 ${changedCount} 次，人工锁定 ${manualLockedCount} 个，角色关系更新 ${relationshipUpdates} 次。`,
    };
  }

  private async handleCheckMomentSchedule(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const friendCharacterIds = new Set(
      await this.socialService.getFriendCharacterIds(),
    );
    if (!friendCharacterIds.size) {
      return {
        summary: '当前没有已建立好友关系的角色，跳过朋友圈调度。',
      };
    }

    const chars = (await this.characterRepo.find()).filter((char) =>
      friendCharacterIds.has(char.id),
    );
    const now = new Date();
    const hour = now.getHours();
    let generatedCount = 0;

    for (const char of chars) {
      if (!char.momentsFrequency || char.momentsFrequency < 1) {
        continue;
      }

      const start = char.activeHoursStart ?? 8;
      const end = char.activeHoursEnd ?? 22;
      if (hour < start || hour > end) {
        continue;
      }

      const todayCount = await this.momentPostRepo.count({
        where: { authorId: char.id, postedAt: LessThan(now) },
      });

      if (
        todayCount < char.momentsFrequency &&
        Math.random() < runtimeRules.momentGenerateChance
      ) {
        const post = await this.generateMomentForChar(char);
        if (post) {
          generatedCount += 1;
          this.telemetry.recordCharacterEvent({
            characterId: char.id,
            characterName: char.name,
            kind: 'moment_posted',
            title: '朋友圈已生成',
            summary: `调度器为该角色生成了新的朋友圈内容 ${post.id}。`,
            jobId: 'check_moment_schedule',
          });
        }
      }
    }

    return {
      summary: `检查 ${chars.length} 个好友角色，本轮生成 ${generatedCount} 条朋友圈内容。`,
    };
  }

  private async handleTriggerSceneFriendRequests(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    if (Math.random() > runtimeRules.sceneFriendRequestChance) {
      return {
        summary: '场景加好友命中概率门控，本轮未触发。',
      };
    }

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
    if (!req) {
      return {
        summary: `场景 ${scene} 本轮没有生成新的好友请求。`,
      };
    }

    this.telemetry.recordCharacterEvent({
      characterId: req.characterId,
      characterName: req.characterName,
      kind: 'scene_friend_request',
      title: '场景好友请求',
      summary: `在 ${scene} 场景触发了新的好友请求。`,
      jobId: 'trigger_scene_friend_requests',
    });
    this.logger.debug(`Triggered scene friend request from scene ${scene}`);

    return {
      summary: `已在 ${scene} 场景触发 ${req.characterName} 的好友请求。`,
    };
  }

  private async handleProcessPendingFeedReactions(): Promise<TrackedJobResult> {
    const pending = await this.feedService.getPendingAiReaction(30);
    let processedCount = 0;
    for (const post of pending) {
      await this.feedService.triggerAiReactionForPost(post);
      processedCount += 1;
      this.logger.debug(`Triggered AI reaction for feed post ${post.id}`);
    }

    return {
      summary: `已处理 ${processedCount} 条待执行广场互动。`,
    };
  }

  private async handleCheckChannelsSchedule(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const now = new Date();
    const hour = now.getHours();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const blockedCharacterIds = new Set(
      await this.socialService.getBlockedCharacterIds(),
    );
    const chars = (await this.characterRepo.find()).filter(
      (char) => char.feedFrequency > 0 && !blockedCharacterIds.has(char.id),
    );
    let generatedCount = 0;

    for (const char of chars) {
      const start = char.activeHoursStart ?? 9;
      const end = char.activeHoursEnd ?? 22;
      if (hour < start || hour > end) {
        continue;
      }

      const weeklyChannelsCount = await this.feedPostRepo.count({
        where: {
          authorId: char.id,
          createdAt: MoreThanOrEqual(weekStart),
          surface: 'channels',
        },
      });
      if (weeklyChannelsCount >= char.feedFrequency) {
        continue;
      }

      if (Math.random() > runtimeRules.channelGenerateChance) {
        continue;
      }

      const post = await this.feedService.generateChannelPost(char.id);
      if (post) {
        generatedCount += 1;
        this.telemetry.recordCharacterEvent({
          characterId: char.id,
          characterName: char.name,
          kind: 'channel_posted',
          title: '视频号内容生成',
          summary: `调度器为该角色生成了视频号内容 ${post.id}。`,
          jobId: 'check_channels_schedule',
        });
        this.logger.debug(`Generated channels post ${post.id} for ${char.name}`);
      }
    }

    await this.feedService.topUpChannelsIfNeeded();

    return {
      summary: `检查 ${chars.length} 个角色，生成 ${generatedCount} 条视频号内容，并执行内容池补足。`,
    };
  }

  private async handleUpdateCharacterStatus(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const chars = await this.characterRepo.find();
    const hour = new Date().getHours();
    let updatedCount = 0;
    let manualLockedCount = 0;

    const getActivity = (): string => {
      if (hour >= 0 && hour <= 6) return 'sleeping';
      if (hour === 7 || hour === 8 || hour === 18 || hour === 19) {
        return 'commuting';
      }
      if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 17)) {
        return 'working';
      }
      if (hour === 12 || hour === 13 || hour === 20) return 'eating';
      return 'free';
    };

    const baseActivity = getActivity();
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
        const activityChanged = char.currentActivity !== 'free';
        const onlineChanged = char.isOnline !== true;
        if (activityChanged || onlineChanged) {
          await this.characterRepo.update(char.id, {
            currentActivity: 'free',
            isOnline: true,
          });
          updatedCount += 1;
          if (activityChanged) {
            this.telemetry.recordCharacterEvent({
              characterId: char.id,
              characterName: char.name,
              kind: 'activity_changed',
              title: '活动状态刷新',
              summary: '默认角色活动已重置为空闲。',
              jobId: 'update_character_status',
            });
          }
        }
        continue;
      }

      if (char.activityMode === 'manual') {
        manualLockedCount += 1;
        continue;
      }

      const activity =
        Math.random() < runtimeRules.activityBaseWeight
          ? baseActivity
          : activities[Math.floor(Math.random() * activities.length)];
      if (char.currentActivity === activity) {
        continue;
      }

      await this.characterRepo.update(char.id, { currentActivity: activity });
      updatedCount += 1;
      this.telemetry.recordCharacterEvent({
        characterId: char.id,
        characterName: char.name,
        kind: 'activity_changed',
        title: '活动状态刷新',
        summary: `当前活动已更新为 ${activity}。`,
        jobId: 'update_character_status',
      });
      this.logger.debug(`Updated activity for ${char.name}: ${activity}`);
    }

    return {
      summary: `检查 ${chars.length} 个角色，活动状态变更 ${updatedCount} 次，人工锁定 ${manualLockedCount} 个。`,
    };
  }

  private async handleTriggerMemoryProactiveMessages(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const now = new Date();
    if (now.getHours() !== runtimeRules.proactiveReminderHour) {
      return {
        summary: `当前小时 ${now.getHours()} 不等于主动提醒小时 ${runtimeRules.proactiveReminderHour}，跳过本轮。`,
      };
    }

    const chars = await this.characterRepo.find();
    let memorySeededCount = 0;
    let sentMessages = 0;

    for (const char of chars) {
      try {
        const memory = char.profile?.memory;
        const memoryText = [memory?.coreMemory, memory?.recentSummary]
          .filter(Boolean)
          .join('\n');
        if (!memoryText) {
          continue;
        }

        memorySeededCount += 1;
        const checkPrompt = `以下是${char.name}对用户的记忆：\n${memoryText}\n\n今天是${now.toLocaleDateString('zh-CN')}。判断是否有值得主动提醒用户的事项（如考试、面试、生日、重要约定等）。\n\n如果有，输出一条自然的提醒消息（以${char.name}的口吻，不超过50字）。\n如果没有，只输出：NO_ACTION`;
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
        if (result === 'NO_ACTION' || result.startsWith('NO_ACTION')) {
          continue;
        }

        const convs = await this.convRepo.find();
        let sentForCharacter = 0;
        for (const conv of convs) {
          if (!conv.participants.includes(char.id)) continue;
          await this.chatGateway.sendProactiveMessage(
            conv.id,
            char.id,
            char.name,
            result,
          );
          sentForCharacter += 1;
          sentMessages += 1;
          this.logger.debug(
            `Sent proactive message from ${char.name} to conv ${conv.id}`,
          );
        }

        if (sentForCharacter > 0) {
          this.telemetry.recordCharacterEvent({
            characterId: char.id,
            characterName: char.name,
            kind: 'proactive_message',
            title: '主动提醒已发送',
            summary: `基于记忆向用户发出了 ${sentForCharacter} 条主动提醒。`,
            jobId: 'trigger_memory_proactive_messages',
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to evaluate proactive reminder for ${char.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      summary: `检查 ${memorySeededCount} 个有记忆种子的角色，发送 ${sentMessages} 条主动提醒消息。`,
    };
  }

  private async maybeStrengthenAiRelationships(chars: CharacterEntity[]) {
    if (chars.length < 2) {
      return 0;
    }

    let updates = 0;

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
          updates += 1;
          this.recordRelationshipEvent(left, right, existing.strength);
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
        updates += 1;
        this.recordRelationshipEvent(left, right, 18);
      }
    }

    return updates;
  }

  private recordRelationshipEvent(
    left: CharacterEntity,
    right: CharacterEntity,
    strength: number,
  ) {
    const summary = `与 ${right.name} 的 AI 关系强度已提升到 ${strength}。`;
    this.telemetry.recordCharacterEvent({
      characterId: left.id,
      characterName: left.name,
      kind: 'relationship_updated',
      title: 'AI 关系更新',
      summary,
      jobId: 'update_ai_active_status',
    });
    this.telemetry.recordCharacterEvent({
      characterId: right.id,
      characterName: right.name,
      kind: 'relationship_updated',
      title: 'AI 关系更新',
      summary: `与 ${left.name} 的 AI 关系强度已提升到 ${strength}。`,
      jobId: 'update_ai_active_status',
    });
  }

  private async generateMomentForChar(char: CharacterEntity) {
    try {
      const text = await this.ai.generateMoment({
        profile: char.profile,
        currentTime: new Date(),
      });
      if (!text) return null;

      const post = this.momentPostRepo.create({
        authorId: char.id,
        authorName: char.name,
        authorAvatar: char.avatar,
        authorType: 'character',
        text,
      });
      await this.momentPostRepo.save(post);
      this.logger.debug(`Auto-posted moment for ${char.name}`);
      return post;
    } catch (error) {
      this.logger.error(
        `Failed to auto-post moment for ${char.name}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
