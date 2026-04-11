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

function renderTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

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
        throw new Error('Unknown scheduler job');
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
    const runtimeRules = await this.replyLogicRules.getRules();
    await this.worldService.snapshot();
    this.logger.debug('WorldContext snapshot updated');
    return {
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummaryWorldContextUpdated,
        {},
      ),
    };
  }

  private async handleExpireFriendRequests(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const now = new Date();
    const result = await this.friendRequestRepo.update(
      { status: 'pending', expiresAt: LessThan(now) },
      { status: 'expired' },
    );
    this.logger.debug('Expired old friend requests');
    return {
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummaryExpiredFriendRequests,
        { count: result.affected ?? 0 },
      ),
    };
  }

  private async handleUpdateAiActiveStatus(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
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
        const nextOnline = runtimeRules.defaultCharacterRules.isOnline;
        const nextActivity = runtimeRules.defaultCharacterRules.activity;
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
              title: runtimeRules.schedulerTextTemplates.eventTitleOnlineStatusChanged,
              summary: renderTemplate(
                runtimeRules.schedulerTextTemplates.eventSummaryDefaultOnlineKept,
                { onlineState: nextOnline ? '在线' : '离线' },
              ),
              jobId: 'update_ai_active_status',
            });
          }
          if (activityChanged) {
            const activityLabel =
              runtimeRules.semanticLabels.activityLabels[
                nextActivity as keyof typeof runtimeRules.semanticLabels.activityLabels
              ] ?? nextActivity;
            this.telemetry.recordCharacterEvent({
              characterId: char.id,
              characterName: char.name,
              kind: 'activity_changed',
              title: runtimeRules.schedulerTextTemplates.eventTitleActivityChanged,
              summary: renderTemplate(
                runtimeRules.schedulerTextTemplates.eventSummaryDefaultActivityReset,
                { activity: activityLabel },
              ),
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
          title: runtimeRules.schedulerTextTemplates.eventTitleOnlineStatusChanged,
          summary: renderTemplate(
            shouldBeOnline
              ? runtimeRules.schedulerTextTemplates.eventSummaryOnlineWindowEntered
              : runtimeRules.schedulerTextTemplates.eventSummaryOnlineWindowExited,
            {
              startHour: start,
              endHour: end,
            },
          ),
          jobId: 'update_ai_active_status',
        });
      }
    }

    const relationshipUpdates = await this.maybeStrengthenAiRelationships(
      chars.filter((char) => char.isOnline),
      runtimeRules,
    );

    return {
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummaryUpdateAiActiveStatus,
        {
          characterCount: chars.length,
          changedCount,
          manualLockedCount,
          relationshipUpdates,
        },
      ),
    };
  }

  private async handleCheckMomentSchedule(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const friendCharacterIds = new Set(
      await this.socialService.getFriendCharacterIds(),
    );
    if (!friendCharacterIds.size) {
      return {
        summary: renderTemplate(
          runtimeRules.schedulerTextTemplates.jobSummaryNoFriendCharactersForMoments,
          {},
        ),
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
            title: runtimeRules.schedulerTextTemplates.eventTitleMomentPosted,
            summary: renderTemplate(
              runtimeRules.schedulerTextTemplates.eventSummaryMomentPosted,
              { postId: post.id },
            ),
            jobId: 'check_moment_schedule',
          });
        }
      }
    }

    return {
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummaryCheckMomentSchedule,
        {
          characterCount: chars.length,
          generatedCount,
        },
      ),
    };
  }

  private async handleTriggerSceneFriendRequests(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    if (Math.random() > runtimeRules.sceneFriendRequestChance) {
      return {
        summary: renderTemplate(
          runtimeRules.schedulerTextTemplates.jobSummarySceneRequestSkipped,
          {},
        ),
      };
    }

    const scenes = runtimeRules.sceneFriendRequestScenes;
    const scene = scenes[Math.floor(Math.random() * scenes.length)];
    const req = await this.socialService.triggerSceneFriendRequest(scene);
    if (!req) {
      return {
        summary: renderTemplate(
          runtimeRules.schedulerTextTemplates.jobSummarySceneRequestNoMatch,
          { scene },
        ),
      };
    }

    this.telemetry.recordCharacterEvent({
      characterId: req.characterId,
      characterName: req.characterName,
      kind: 'scene_friend_request',
      title: runtimeRules.schedulerTextTemplates.eventTitleSceneFriendRequest,
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.eventSummarySceneFriendRequest,
        { scene },
      ),
      jobId: 'trigger_scene_friend_requests',
    });
    this.logger.debug(`Triggered scene friend request from scene ${scene}`);

    return {
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummarySceneRequestTriggered,
        {
          scene,
          characterName: req.characterName,
        },
      ),
    };
  }

  private async handleProcessPendingFeedReactions(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const pending = await this.feedService.getPendingAiReaction(30);
    let processedCount = 0;
    for (const post of pending) {
      await this.feedService.triggerAiReactionForPost(post);
      processedCount += 1;
      this.logger.debug(`Triggered AI reaction for feed post ${post.id}`);
    }

    return {
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummaryProcessPendingFeedReactions,
        { processedCount },
      ),
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
          title: runtimeRules.schedulerTextTemplates.eventTitleChannelPosted,
          summary: renderTemplate(
            runtimeRules.schedulerTextTemplates.eventSummaryChannelPosted,
            { postId: post.id },
          ),
          jobId: 'check_channels_schedule',
        });
        this.logger.debug(`Generated channels post ${post.id} for ${char.name}`);
      }
    }

    await this.feedService.topUpChannelsIfNeeded();

    return {
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummaryCheckChannelsSchedule,
        {
          characterCount: chars.length,
          generatedCount,
        },
      ),
    };
  }

  private async handleUpdateCharacterStatus(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const chars = await this.characterRepo.find();
    const hour = new Date().getHours();
    let updatedCount = 0;
    let manualLockedCount = 0;

    const getActivity = (): string => {
      const schedule = runtimeRules.activityScheduleHours;
      if (schedule.sleeping.includes(hour)) return 'sleeping';
      if (schedule.commuting.includes(hour)) {
        return 'commuting';
      }
      if (schedule.working.includes(hour)) {
        return 'working';
      }
      if (schedule.eating.includes(hour)) return 'eating';
      return 'free';
    };

    const baseActivity = getActivity();
    const activities = runtimeRules.activityRandomPool;

    for (const char of chars) {
      if (
        DEFAULT_CHARACTER_IDS.includes(
          char.id as (typeof DEFAULT_CHARACTER_IDS)[number],
        )
      ) {
        const defaultActivity = runtimeRules.defaultCharacterRules.activity;
        const defaultOnline = runtimeRules.defaultCharacterRules.isOnline;
        const activityChanged = char.currentActivity !== defaultActivity;
        const onlineChanged = char.isOnline !== defaultOnline;
        if (activityChanged || onlineChanged) {
          await this.characterRepo.update(char.id, {
            currentActivity: defaultActivity,
            isOnline: defaultOnline,
          });
          updatedCount += 1;
          if (activityChanged) {
            const activityLabel =
              runtimeRules.semanticLabels.activityLabels[
                defaultActivity as keyof typeof runtimeRules.semanticLabels.activityLabels
              ] ?? defaultActivity;
            this.telemetry.recordCharacterEvent({
              characterId: char.id,
              characterName: char.name,
              kind: 'activity_changed',
              title: runtimeRules.schedulerTextTemplates.eventTitleActivityChanged,
              summary: renderTemplate(
                runtimeRules.schedulerTextTemplates.eventSummaryDefaultActivityReset,
                { activity: activityLabel },
              ),
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
      const activityLabel =
        runtimeRules.semanticLabels.activityLabels[
          activity as keyof typeof runtimeRules.semanticLabels.activityLabels
        ] ?? activity;
      this.telemetry.recordCharacterEvent({
        characterId: char.id,
        characterName: char.name,
        kind: 'activity_changed',
        title: runtimeRules.schedulerTextTemplates.eventTitleActivityChanged,
        summary: renderTemplate(
          runtimeRules.schedulerTextTemplates.eventSummaryActivityChanged,
          { activity: activityLabel },
        ),
        jobId: 'update_character_status',
      });
      this.logger.debug(`Updated activity for ${char.name}: ${activity}`);
    }

    return {
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummaryUpdateCharacterStatus,
        {
          characterCount: chars.length,
          updatedCount,
          manualLockedCount,
        },
      ),
    };
  }

  private async handleTriggerMemoryProactiveMessages(): Promise<TrackedJobResult> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const now = new Date();
    if (now.getHours() !== runtimeRules.proactiveReminderHour) {
      return {
        summary: renderTemplate(
          runtimeRules.schedulerTextTemplates.jobSummaryProactiveReminderSkipped,
          {
            currentHour: now.getHours(),
            targetHour: runtimeRules.proactiveReminderHour,
          },
        ),
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
        const checkPrompt = renderTemplate(
          runtimeRules.schedulerTextTemplates.proactiveReminderCheckPrompt,
          {
            characterName: char.name,
            memoryText,
            today: now.toLocaleDateString('zh-CN'),
            noActionToken:
              runtimeRules.schedulerTextTemplates.proactiveReminderNoActionToken,
          },
        );
        const model = await this.ai['configService'].getAiModel();
        const client = this.ai['client'];
        const resp = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: checkPrompt }],
          max_tokens: 100,
          temperature: 0.7,
        });
        const result = sanitizeAiText(
          resp.choices[0]?.message?.content ??
            runtimeRules.schedulerTextTemplates.proactiveReminderNoActionToken,
        );
        const noActionToken =
          runtimeRules.schedulerTextTemplates.proactiveReminderNoActionToken;
        if (result === noActionToken || result.startsWith(noActionToken)) {
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
            title: runtimeRules.schedulerTextTemplates.eventTitleProactiveMessage,
            summary: renderTemplate(
              runtimeRules.schedulerTextTemplates.eventSummaryProactiveMessage,
              { sentCount: sentForCharacter },
            ),
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
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.jobSummaryTriggerMemoryProactiveMessages,
        {
          memorySeededCount,
          sentMessages,
        },
      ),
    };
  }

  private async maybeStrengthenAiRelationships(
    chars: CharacterEntity[],
    runtimeRules: Awaited<ReturnType<ReplyLogicRulesService['getRules']>>,
  ) {
    if (chars.length < 2) {
      return 0;
    }

    let updates = 0;

    for (let index = 0; index < chars.length; index += 1) {
      for (let inner = index + 1; inner < chars.length; inner += 1) {
        if (Math.random() > runtimeRules.relationshipUpdateChance) {
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
          existing.strength = Math.min(
            runtimeRules.relationshipStrengthMax,
            existing.strength + runtimeRules.relationshipUpdateStep,
          );
          await this.aiRelationshipRepo.save(existing);
          updates += 1;
          this.recordRelationshipEvent(left, right, existing.strength, runtimeRules);
          continue;
        }

        await this.aiRelationshipRepo.save(
          this.aiRelationshipRepo.create({
            characterIdA,
            characterIdB,
            relationshipType: runtimeRules.relationshipInitialType,
            strength: runtimeRules.relationshipInitialStrength,
            backstory: renderTemplate(
              runtimeRules.relationshipInitialBackstory,
              {
                leftName: left.name,
                rightName: right.name,
              },
            ),
          }),
        );
        updates += 1;
        this.recordRelationshipEvent(
          left,
          right,
          runtimeRules.relationshipInitialStrength,
          runtimeRules,
        );
      }
    }

    return updates;
  }

  private recordRelationshipEvent(
    left: CharacterEntity,
    right: CharacterEntity,
    strength: number,
    runtimeRules: Awaited<ReturnType<ReplyLogicRulesService['getRules']>>,
  ) {
    const leftSummary = renderTemplate(
      runtimeRules.schedulerTextTemplates.eventSummaryRelationshipUpdated,
      {
        otherName: right.name,
        strength,
      },
    );
    this.telemetry.recordCharacterEvent({
      characterId: left.id,
      characterName: left.name,
      kind: 'relationship_updated',
      title: runtimeRules.schedulerTextTemplates.eventTitleRelationshipUpdated,
      summary: leftSummary,
      jobId: 'update_ai_active_status',
    });
    this.telemetry.recordCharacterEvent({
      characterId: right.id,
      characterName: right.name,
      kind: 'relationship_updated',
      title: runtimeRules.schedulerTextTemplates.eventTitleRelationshipUpdated,
      summary: renderTemplate(
        runtimeRules.schedulerTextTemplates.eventSummaryRelationshipUpdated,
        {
          otherName: left.name,
          strength,
        },
      ),
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
