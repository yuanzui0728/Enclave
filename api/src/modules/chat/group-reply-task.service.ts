import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { type AiMessagePart, type ChatMessage } from '../ai/ai.types';
import { CharacterEntity } from '../characters/character.entity';
import { SystemConfigService } from '../config/config.service';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';
import { ChatGateway } from './chat.gateway';
import { GroupEntity } from './group.entity';
import { GroupMessageEntity } from './group-message.entity';
import {
  GroupReplyTaskEntity,
  type GroupReplyTaskStatus,
} from './group-reply-task.entity';
import {
  type GroupReplyPlannerDecision,
  type GroupUserMessageContext,
} from './group-reply.types';
import {
  buildGroupReplyIssueSummaryFromTasks,
  createEmptyGroupReplyTaskArchiveBucket,
  createEmptyGroupReplyTaskArchiveStore,
  GROUP_REPLY_TASK_ARCHIVE_STATS_CONFIG_KEY,
  mergeGroupReplyIssueSummaries,
  type GroupReplyTaskArchiveStore,
} from './group-reply-task-observability';
import { GroupReplyOrchestratorService } from './group-reply-orchestrator.service';

const GROUP_REPLY_TASK_BATCH_SIZE = 12;
const GROUP_REPLY_PROCESSING_RETRY_MS = 2 * 60 * 1000;
const GROUP_REPLY_TASK_RETENTION_DAYS = 14;
const GROUP_REPLY_TASK_TERMINAL_STATUSES: GroupReplyTaskStatus[] = [
  'sent',
  'cancelled',
  'failed',
];

@Injectable()
export class GroupReplyTaskService {
  private readonly logger = new Logger(GroupReplyTaskService.name);
  private processing = false;

  constructor(
    @InjectRepository(GroupReplyTaskEntity)
    private readonly taskRepo: Repository<GroupReplyTaskEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMessageEntity)
    private readonly groupMessageRepo: Repository<GroupMessageEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    private readonly systemConfig: SystemConfigService,
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly chatGateway: ChatGateway,
    private readonly groupReplyOrchestrator: GroupReplyOrchestratorService,
  ) {}

  async scheduleTurn(input: {
    groupId: string;
    triggerMessageId: string;
    triggerMessageCreatedAt: Date;
    plannerDecision: GroupReplyPlannerDecision;
    conversationHistory: ChatMessage[];
    currentUserContext: GroupUserMessageContext;
  }) {
    const {
      groupId,
      triggerMessageId,
      triggerMessageCreatedAt,
      plannerDecision,
      conversationHistory,
      currentUserContext,
    } = input;
    await this.cancelPendingTasksForGroup(
      groupId,
      'superseded_by_new_user_message',
    );
    const selectedActors = plannerDecision.selectedActors;
    if (!selectedActors.length) {
      return;
    }

    const runtimeRules = await this.replyLogicRules.getRules();
    const turnId = randomUUID();
    let executeAt = new Date();
    const conversationHistoryPayload = JSON.stringify(conversationHistory);
    const userMessagePartsPayload = currentUserContext.parts.length
      ? JSON.stringify(currentUserContext.parts)
      : null;
    const plannerContextPayload = JSON.stringify({
      maxSpeakers: plannerDecision.maxSpeakers,
      explicitInterest: plannerDecision.explicitInterest,
      hasMentionAll: plannerDecision.hasMentionAll,
      mentionTargets: plannerDecision.mentionTargets,
      replyTargetCharacterId: plannerDecision.replyTargetCharacterId ?? null,
    });
    const plannerCandidatesPayload = JSON.stringify(
      plannerDecision.candidateDiagnostics,
    );

    const tasks = selectedActors.map((actor, index) => {
      const delayMs = this.groupReplyOrchestrator.pickReplyDelay(
        index,
        runtimeRules,
      );
      executeAt = new Date(executeAt.getTime() + Math.round(delayMs));
      const candidateDiagnostic = plannerDecision.candidateDiagnostics.find(
        (candidate) => candidate.characterId === actor.character.id,
      );
      return this.taskRepo.create({
        turnId,
        groupId,
        triggerMessageId,
        triggerMessageCreatedAt,
        actorCharacterId: actor.character.id,
        actorName: actor.character.name,
        score: actor.score,
        randomPassed: actor.randomPassed,
        isExplicitTarget: actor.isExplicitTarget,
        isReplyTarget: actor.isReplyTarget,
        recentSpeakerIndex: actor.recentSpeakerIndex,
        selectionDisposition:
          candidateDiagnostic?.selectionDisposition ?? 'selected_fallback',
        sequenceIndex: index,
        status: 'pending',
        executeAfter: new Date(executeAt),
        conversationHistoryPayload,
        userPromptText: currentUserContext.promptText,
        userMessagePartsPayload,
        plannerContextPayload,
        plannerCandidatesPayload,
      });
    });

    await this.taskRepo.save(tasks);
  }

  async cancelPendingTasksForGroup(
    groupId: string,
    reason: string,
    beforeExecuteAfter?: Date,
  ) {
    const where = beforeExecuteAfter
      ? {
          groupId,
          status: 'pending' as GroupReplyTaskStatus,
          executeAfter: LessThanOrEqual(beforeExecuteAfter),
        }
      : {
          groupId,
          status: 'pending' as GroupReplyTaskStatus,
        };

    const pendingTasks = await this.taskRepo.find({ where });
    if (!pendingTasks.length) {
      return;
    }

    const cancelledAt = new Date();
    await this.taskRepo.save(
      pendingTasks.map((task) => ({
        ...task,
        status: 'cancelled' as const,
        cancelReason: reason,
        cancelledAt,
      })),
    );
  }

  async retryTask(taskId: string) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) {
      throw new NotFoundException(`Group reply task ${taskId} not found`);
    }
    if (task.status === 'pending' || task.status === 'processing') {
      throw new BadRequestException('Task is already queued or processing');
    }
    if (task.status === 'sent') {
      throw new BadRequestException('Sent task cannot be retried');
    }
    if (await this.hasNewerUserMessage(task)) {
      throw new BadRequestException(
        'Task is stale because a newer user message already arrived',
      );
    }

    task.status = 'pending';
    task.executeAfter = new Date();
    task.lastAttemptAt = null;
    task.sentAt = null;
    task.cancelledAt = null;
    task.cancelReason = null;
    task.errorMessage = null;
    await this.taskRepo.save(task);
    return task;
  }

  async retryTurn(turnId: string) {
    const tasks = await this.taskRepo.find({
      where: { turnId },
      order: { sequenceIndex: 'ASC', createdAt: 'ASC' },
    });
    if (!tasks.length) {
      throw new NotFoundException(`Group reply turn ${turnId} not found`);
    }

    const [primaryTask] = tasks;
    if (await this.hasNewerUserMessage(primaryTask)) {
      throw new BadRequestException(
        'Turn is stale because a newer user message already arrived',
      );
    }

    const retryableTasks = tasks.filter(
      (task) => task.status === 'failed' || task.status === 'cancelled',
    );
    if (!retryableTasks.length) {
      throw new BadRequestException('Turn has no retryable tasks');
    }

    const now = new Date();
    const skippedTaskIds = tasks
      .filter((task) => !retryableTasks.some((candidate) => candidate.id === task.id))
      .map((task) => task.id);
    const retriedTaskIds: string[] = [];

    for (const [index, task] of retryableTasks.entries()) {
      task.status = 'pending';
      task.executeAfter = new Date(now.getTime() + index * 1000);
      task.lastAttemptAt = null;
      task.sentAt = null;
      task.cancelledAt = null;
      task.cancelReason = null;
      task.errorMessage = null;
      retriedTaskIds.push(task.id);
    }

    await this.taskRepo.save(retryableTasks);
    return {
      turnId,
      groupId: primaryTask.groupId,
      retriedTaskCount: retriedTaskIds.length,
      skippedTaskCount: skippedTaskIds.length,
      retriedTaskIds,
      skippedTaskIds,
    };
  }

  async cleanupTasks(input?: {
    olderThanDays?: number;
    groupId?: string;
    statuses?: GroupReplyTaskStatus[];
  }) {
    const olderThanDays = Math.max(
      1,
      Math.round(input?.olderThanDays ?? GROUP_REPLY_TASK_RETENTION_DAYS),
    );
    const statuses = (input?.statuses?.length
      ? input.statuses
      : GROUP_REPLY_TASK_TERMINAL_STATUSES
    ).filter((status): status is GroupReplyTaskStatus =>
      GROUP_REPLY_TASK_TERMINAL_STATUSES.includes(status),
    );
    if (!statuses.length) {
      throw new BadRequestException('Cleanup requires terminal task statuses');
    }

    const cutoff = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    );
    const staleTasks = await this.taskRepo.find({
      where: {
        ...(input?.groupId ? { groupId: input.groupId } : {}),
        status: In(statuses),
        updatedAt: LessThanOrEqual(cutoff),
      },
      take: 1000,
      order: {
        updatedAt: 'ASC',
      },
    });
    if (!staleTasks.length) {
      return {
        deletedCount: 0,
        cutoff,
        statuses,
        groupId: input?.groupId ?? null,
      };
    }

    await this.archiveTasksBeforeCleanup(staleTasks, cutoff);
    await this.taskRepo.delete(staleTasks.map((task) => task.id));
    return {
      deletedCount: staleTasks.length,
      cutoff,
      statuses,
      groupId: input?.groupId ?? null,
    };
  }

  @Cron('*/3 * * * * *')
  async processDueTasks() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      await this.requeueStaleProcessingTasks();

      const dueTasks = await this.taskRepo.find({
        where: {
          status: 'pending',
          executeAfter: LessThanOrEqual(new Date()),
        },
        order: {
          executeAfter: 'ASC',
          sequenceIndex: 'ASC',
          createdAt: 'ASC',
        },
        take: GROUP_REPLY_TASK_BATCH_SIZE,
      });

      for (const task of dueTasks) {
        await this.processTask(task.id);
      }
    } finally {
      this.processing = false;
    }
  }

  @Cron('17 4 * * *')
  async cleanupTerminalTasks() {
    const result = await this.cleanupTasks();
    if (result.deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${result.deletedCount} stale group reply tasks older than ${GROUP_REPLY_TASK_RETENTION_DAYS} days`,
      );
    }
  }

  private async processTask(taskId: string) {
    const task = await this.taskRepo.findOneBy({
      id: taskId,
      status: 'pending',
    });
    if (!task) {
      return;
    }

    task.status = 'processing';
    task.lastAttemptAt = new Date();
    await this.taskRepo.save(task);

    try {
      const existingActorReply = await this.findExistingActorReply(task);
      if (existingActorReply) {
        await this.markTaskSent(task, existingActorReply.createdAt ?? new Date());
        return;
      }

      if (await this.hasNewerUserMessage(task)) {
        await this.markTaskCancelled(task, 'superseded_by_new_user_message');
        return;
      }

      const character = await this.characterRepo.findOneBy({
        id: task.actorCharacterId,
      });
      if (!character?.profile) {
        await this.markTaskCancelled(task, 'actor_missing');
        return;
      }

      const conversationHistory = this.parseHistoryPayload(
        task.conversationHistoryPayload,
      );
      const userMessageParts = this.parsePartsPayload(
        task.userMessagePartsPayload,
      );
      const followupReplies = await this.groupMessageRepo.find({
        where: {
          groupId: task.groupId,
          senderType: 'character',
          createdAt: MoreThan(task.triggerMessageCreatedAt),
        },
        order: { createdAt: 'ASC' },
      });

      const reply = await this.groupReplyOrchestrator.generateTaskReply({
        actor: {
          character,
          profile: character.profile,
          score: 0,
          randomPassed: true,
          isExplicitTarget: false,
          isReplyTarget: false,
          recentSpeakerIndex: -1,
        },
        conversationHistory,
        baseUserPrompt: task.userPromptText,
        userMessageParts,
        followupReplies: followupReplies.map((message) => ({
          senderName: message.senderName,
          text: message.text,
        })),
      });

      if (await this.hasNewerUserMessage(task)) {
        await this.markTaskCancelled(task, 'superseded_by_new_user_message');
        return;
      }

      const sentAt = await this.persistCharacterReply(
        task.groupId,
        character,
        reply.text,
      );
      await this.markTaskSent(task, sentAt);
    } catch (error) {
      task.status = 'failed';
      task.errorMessage =
        error instanceof Error ? error.message.slice(0, 1000) : String(error);
      await this.taskRepo.save(task);
      this.logger.error(
        `Failed to process group reply task ${task.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async requeueStaleProcessingTasks() {
    const staleBefore = new Date(Date.now() - GROUP_REPLY_PROCESSING_RETRY_MS);
    const staleTasks = await this.taskRepo.find({
      where: {
        status: 'processing',
        lastAttemptAt: LessThanOrEqual(staleBefore),
      },
      take: GROUP_REPLY_TASK_BATCH_SIZE,
      order: {
        lastAttemptAt: 'ASC',
        executeAfter: 'ASC',
      },
    });
    if (!staleTasks.length) {
      return;
    }

    await this.taskRepo.save(
      staleTasks.map((task) => ({
        ...task,
        status: 'pending' as const,
        errorMessage: task.errorMessage ?? 'requeued_after_stale_processing',
      })),
    );
  }

  private parseHistoryPayload(payload: string) {
    try {
      const parsed = JSON.parse(payload) as ChatMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parsePartsPayload(payload?: string | null): AiMessagePart[] {
    if (!payload) {
      return [];
    }

    try {
      const parsed = JSON.parse(payload);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async hasNewerUserMessage(task: GroupReplyTaskEntity) {
    const newerUserMessage = await this.groupMessageRepo.findOne({
      where: {
        groupId: task.groupId,
        senderType: 'user',
        createdAt: MoreThan(task.triggerMessageCreatedAt),
      },
      order: { createdAt: 'ASC' },
    });

    return Boolean(newerUserMessage);
  }

  private async findExistingActorReply(task: GroupReplyTaskEntity) {
    return this.groupMessageRepo.findOne({
      where: {
        groupId: task.groupId,
        senderType: 'character',
        senderId: task.actorCharacterId,
        createdAt: MoreThan(task.triggerMessageCreatedAt),
      },
      order: { createdAt: 'ASC' },
    });
  }

  private async persistCharacterReply(
    groupId: string,
    character: CharacterEntity,
    text: string,
  ): Promise<Date> {
    const group = await this.groupRepo.findOneBy({ id: groupId });
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const message = this.groupMessageRepo.create({
      groupId,
      senderId: character.id,
      senderType: 'character',
      senderName: character.name,
      senderAvatar: character.avatar ?? undefined,
      text,
      type: 'text',
    });
    await this.groupMessageRepo.save(message);
    await this.touchGroupActivity(group, message.createdAt ?? new Date());
    this.chatGateway.emitThreadMessage(groupId, {
      id: message.id,
      groupId,
      senderId: message.senderId,
      senderType: 'character',
      senderName: message.senderName,
      senderAvatar: message.senderAvatar ?? undefined,
      type: 'text',
      text,
      createdAt: message.createdAt,
    });
    return message.createdAt ?? new Date();
  }

  private async markTaskCancelled(task: GroupReplyTaskEntity, reason: string) {
    task.status = 'cancelled';
    task.cancelReason = reason;
    task.cancelledAt = new Date();
    await this.taskRepo.save(task);
  }

  private async markTaskSent(task: GroupReplyTaskEntity, sentAt: Date) {
    task.status = 'sent';
    task.cancelReason = null;
    task.cancelledAt = null;
    task.errorMessage = null;
    task.sentAt = sentAt;
    await this.taskRepo.save(task);
  }

  private async archiveTasksBeforeCleanup(
    tasks: GroupReplyTaskEntity[],
    cutoff: Date,
  ) {
    const store = await this.readArchiveStore();
    this.mergeArchiveBucket(store.global, tasks, cutoff);

    const tasksByGroup = new Map<string, GroupReplyTaskEntity[]>();
    for (const task of tasks) {
      const bucket = tasksByGroup.get(task.groupId) ?? [];
      bucket.push(task);
      tasksByGroup.set(task.groupId, bucket);
    }

    for (const [groupId, groupTasks] of tasksByGroup.entries()) {
      const groupBucket =
        store.groups[groupId] ?? createEmptyGroupReplyTaskArchiveBucket();
      this.mergeArchiveBucket(groupBucket, groupTasks, cutoff);
      store.groups[groupId] = groupBucket;
    }

    await this.systemConfig.setConfig(
      GROUP_REPLY_TASK_ARCHIVE_STATS_CONFIG_KEY,
      JSON.stringify(store),
    );
  }

  private mergeArchiveBucket(
    bucket: GroupReplyTaskArchiveStore['global'],
    tasks: GroupReplyTaskEntity[],
    cutoff: Date,
  ) {
    bucket.archivedTaskCount += tasks.length;
    bucket.archivedTurnCount += new Set(tasks.map((task) => task.turnId)).size;

    for (const task of tasks) {
      if (task.status === 'sent') {
        bucket.statusCounts.sent += 1;
      } else if (task.status === 'cancelled') {
        bucket.statusCounts.cancelled += 1;
      } else if (task.status === 'failed') {
        bucket.statusCounts.failed += 1;
      }
    }

    bucket.issueSummary = mergeGroupReplyIssueSummaries(
      bucket.issueSummary,
      buildGroupReplyIssueSummaryFromTasks(tasks, 12),
      12,
    );
    bucket.lastArchivedAt = new Date().toISOString();
    bucket.lastCutoff = cutoff.toISOString();
  }

  private async readArchiveStore(): Promise<GroupReplyTaskArchiveStore> {
    const raw = await this.systemConfig.getConfig(
      GROUP_REPLY_TASK_ARCHIVE_STATS_CONFIG_KEY,
    );
    if (!raw) {
      return createEmptyGroupReplyTaskArchiveStore();
    }

    try {
      const parsed = JSON.parse(raw) as GroupReplyTaskArchiveStore;
      if (parsed?.version === 1) {
        const emptyBucket = createEmptyGroupReplyTaskArchiveBucket();
        return {
          version: 1,
          global: {
            ...emptyBucket,
            ...parsed.global,
            statusCounts: {
              ...emptyBucket.statusCounts,
              ...(parsed.global?.statusCounts ?? {}),
            },
            issueSummary: parsed.global?.issueSummary ?? [],
          },
          groups: Object.fromEntries(
            Object.entries(parsed.groups ?? {}).map(([groupId, value]) => [
              groupId,
              {
                ...emptyBucket,
                ...value,
                statusCounts: {
                  ...emptyBucket.statusCounts,
                  ...(value?.statusCounts ?? {}),
                },
                issueSummary: value?.issueSummary ?? [],
              },
            ]),
          ),
        };
      }
    } catch {
      // ignore invalid archived stats payload and recreate it
    }

    return createEmptyGroupReplyTaskArchiveStore();
  }

  private async touchGroupActivity(group: GroupEntity, at: Date) {
    group.lastActivityAt = at;
    if (group.isHidden) {
      group.isHidden = false;
      group.hiddenAt = null;
    }
    await this.groupRepo.save(group);
  }
}
