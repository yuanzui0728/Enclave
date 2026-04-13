import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { type AiMessagePart, type ChatMessage } from '../ai/ai.types';
import { CharacterEntity } from '../characters/character.entity';
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
import { GroupReplyOrchestratorService } from './group-reply-orchestrator.service';

const GROUP_REPLY_TASK_BATCH_SIZE = 12;
const GROUP_REPLY_PROCESSING_RETRY_MS = 2 * 60 * 1000;

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

  private async touchGroupActivity(group: GroupEntity, at: Date) {
    group.lastActivityAt = at;
    if (group.isHidden) {
      group.isHidden = false;
      group.hiddenAt = null;
    }
    await this.groupRepo.save(group);
  }
}
