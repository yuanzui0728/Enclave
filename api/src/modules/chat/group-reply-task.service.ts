import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiSpeechAssetsService } from '../ai/ai-speech-assets.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { type AiMessagePart, type ChatMessage } from '../ai/ai.types';
import { CharacterEntity } from '../characters/character.entity';
import { CharactersService } from '../characters/characters.service';
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
  buildAssistantSpeechInstructions,
  type AssistantReplyModalitiesPlan,
} from './assistant-reply-modalities';
import {
  buildGroupReplyIssueSummaryFromTasks,
  createEmptyGroupReplyTaskArchiveActorStat,
  createEmptyGroupReplyTaskArchiveBucket,
  createEmptyGroupReplyTaskArchiveDailyStat,
  createEmptyGroupReplyTaskArchiveStore,
  GROUP_REPLY_TASK_ARCHIVE_STATS_CONFIG_KEY,
  mergeGroupReplyIssueSummaries,
  normalizeGroupReplyTaskArchiveStore,
  type GroupReplyTaskArchiveStore,
} from './group-reply-task-observability';
import { GroupReplyOrchestratorService } from './group-reply-orchestrator.service';
import { ChatService } from './chat.service';
import {
  type GroupMessage,
  type MessageAttachment,
  type VoiceAttachment,
} from './chat.types';

const GROUP_REPLY_TASK_BATCH_SIZE = 12;
const GROUP_REPLY_PROCESSING_RETRY_MS = 2 * 60 * 1000;
const GROUP_REPLY_TASK_RETENTION_DAYS = 14;
const GROUP_REPLY_TASK_TERMINAL_STATUSES: GroupReplyTaskStatus[] = [
  'sent',
  'cancelled',
  'failed',
];

type DeferredGroupReplyMedia = {
  groupId: string;
  character: CharacterEntity;
  text: string;
  modalities: AssistantReplyModalitiesPlan;
};

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
    private readonly ai: AiOrchestratorService,
    private readonly speechAssets: AiSpeechAssetsService,
    private readonly charactersService: CharactersService,
    private readonly systemConfig: SystemConfigService,
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly chatGateway: ChatGateway,
    private readonly groupReplyOrchestrator: GroupReplyOrchestratorService,
    private readonly chatService: ChatService,
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
      const group = await this.groupRepo.findOneBy({ id: task.groupId });
      if (!character?.profile) {
        await this.markTaskCancelled(task, 'actor_missing');
        return;
      }
      const runtimeProfile =
        (await this.charactersService.getRuntimeProfileFromCharacter(
          character,
        )) ?? character.profile;

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
          type: 'text',
          createdAt: MoreThan(task.triggerMessageCreatedAt),
        },
        order: { createdAt: 'ASC' },
      });

      this.chatGateway.emitTypingStart(task.groupId, character.id, 'reply');
      try {
        const reply = await this.groupReplyOrchestrator.generateTaskReply({
          actor: {
            character,
            profile: runtimeProfile,
            score: 0,
            randomPassed: true,
            isExplicitTarget: false,
            isReplyTarget: false,
            recentSpeakerIndex: -1,
          },
          groupId: task.groupId,
          groupName: group?.name,
          conversationHistory,
          baseUserPrompt: task.userPromptText,
          userMessageParts,
          followupReplies: followupReplies.map((message) => ({
            senderName: message.senderName,
            text: message.text,
          })),
          allowMultiModal:
            task.sequenceIndex === 0 ||
            task.isExplicitTarget ||
            task.isReplyTarget,
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
        if (reply.modalities.includeVoice || reply.modalities.imagePrompt) {
          void this.completeDeferredCharacterReplyMedia({
            groupId: task.groupId,
            character,
            text: reply.text,
            modalities: reply.modalities,
          });
        }
      } finally {
        this.chatGateway.emitTypingStop(task.groupId, character.id, 'reply');
      }
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
        type: 'text',
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
    this.chatGateway.emitThreadMessage(groupId, this.toGroupMessage(message));
    return message.createdAt ?? new Date();
  }

  private async completeDeferredCharacterReplyMedia(
    input: DeferredGroupReplyMedia,
  ) {
    if (input.modalities.includeVoice) {
      await this.persistCharacterVoiceReply(input);
    }

    if (input.modalities.imagePrompt) {
      await this.persistCharacterImageReply({
        ...input,
        imagePrompt: input.modalities.imagePrompt,
      });
    }
  }

  private async persistCharacterVoiceReply(input: DeferredGroupReplyMedia) {
    try {
      const synthesized = await this.ai.synthesizeSpeech({
        text: input.text,
        conversationId: input.groupId,
        characterId: input.character.id,
        instructions: buildAssistantSpeechInstructions(input.character.name),
      });
      const asset = await this.speechAssets.saveGeneratedSpeech(
        synthesized.buffer,
        {
          mimeType: synthesized.mimeType,
          fileExtension: synthesized.fileExtension,
          baseName: `group-reply-${input.character.id}`,
        },
      );
      const attachment: VoiceAttachment = {
        kind: 'voice',
        url: asset.audioUrl,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        size: synthesized.buffer.length,
        durationMs: synthesized.durationMs,
        transcriptText: input.text,
      };
      await this.persistCharacterAttachmentMessage({
        groupId: input.groupId,
        character: input.character,
        type: 'voice',
        text: input.text,
        attachment,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to synthesize group voice reply for ${input.character.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async persistCharacterImageReply(
    input: DeferredGroupReplyMedia & { imagePrompt: string },
  ) {
    this.chatGateway.emitTypingStart(
      input.groupId,
      input.character.id,
      'image_generation',
    );
    try {
      const generated = await this.ai.generateImage({
        prompt: input.imagePrompt,
        conversationId: input.groupId,
        characterId: input.character.id,
      });
      const attachment = await this.chatService.saveUploadedAttachment(
        {
          buffer: generated.buffer,
          mimetype: generated.mimeType,
          originalname: `group-reply-image.${generated.fileExtension}`,
          size: generated.buffer.length,
        },
        {},
      );
      if (attachment.kind !== 'image') {
        return;
      }

      await this.persistCharacterAttachmentMessage({
        groupId: input.groupId,
        character: input.character,
        type: 'image',
        text: '',
        attachment,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to generate group image reply for ${input.character.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.chatGateway.emitTypingStop(
        input.groupId,
        input.character.id,
        'image_generation',
      );
    }
  }

  private async persistCharacterAttachmentMessage(input: {
    groupId: string;
    character: CharacterEntity;
    type: 'image' | 'voice';
    text: string;
    attachment: MessageAttachment;
  }) {
    const group = await this.groupRepo.findOneBy({ id: input.groupId });
    if (!group) {
      throw new Error(`Group ${input.groupId} not found`);
    }

    const message = this.groupMessageRepo.create({
      groupId: input.groupId,
      senderId: input.character.id,
      senderType: 'character',
      senderName: input.character.name,
      senderAvatar: input.character.avatar ?? undefined,
      text: input.text,
      type: input.type,
      attachmentKind: input.attachment.kind,
      attachmentPayload: JSON.stringify(input.attachment),
    });
    await this.groupMessageRepo.save(message);
    await this.touchGroupActivity(group, message.createdAt ?? new Date());
    this.chatGateway.emitThreadMessage(input.groupId, this.toGroupMessage(message));
  }

  private toGroupMessage(entity: GroupMessageEntity): GroupMessage {
    return {
      id: entity.id,
      groupId: entity.groupId,
      senderId: entity.senderId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderName: entity.senderName,
      senderAvatar: entity.senderAvatar ?? undefined,
      type: entity.type as
        | 'text'
        | 'system'
        | 'sticker'
        | 'image'
        | 'file'
        | 'voice'
        | 'contact_card'
        | 'location_card'
        | 'note_card',
      text:
        entity.senderType === 'user'
          ? entity.text
          : sanitizeAiText(entity.text),
      attachment: this.parseAttachment(entity),
      createdAt: entity.createdAt,
    };
  }

  private parseAttachment(
    entity: GroupMessageEntity,
  ): MessageAttachment | undefined {
    if (!entity.attachmentKind || !entity.attachmentPayload) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(entity.attachmentPayload) as MessageAttachment;
      if (parsed.kind !== entity.attachmentKind) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
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
    const turnIdsByDate = new Map<string, Set<string>>();
    const turnIdsByActor = new Map<string, Set<string>>();
    const turnIdsByActorDate = new Map<string, Map<string, Set<string>>>();
    const tasksByActor = new Map<string, GroupReplyTaskEntity[]>();

    for (const task of tasks) {
      if (task.status === 'sent') {
        bucket.statusCounts.sent += 1;
      } else if (task.status === 'cancelled') {
        bucket.statusCounts.cancelled += 1;
      } else if (task.status === 'failed') {
        bucket.statusCounts.failed += 1;
      }

      const archiveDate = task.triggerMessageCreatedAt
        .toISOString()
        .slice(0, 10);
      const dailyStat =
        bucket.dailyStats[archiveDate] ??
        createEmptyGroupReplyTaskArchiveDailyStat(archiveDate);
      dailyStat.taskCount += 1;
      if (task.status === 'sent') {
        dailyStat.statusCounts.sent += 1;
      } else if (task.status === 'cancelled') {
        dailyStat.statusCounts.cancelled += 1;
      } else if (task.status === 'failed') {
        dailyStat.statusCounts.failed += 1;
      }
      bucket.dailyStats[archiveDate] = dailyStat;

      const turnIds = turnIdsByDate.get(archiveDate) ?? new Set<string>();
      turnIds.add(task.turnId);
      turnIdsByDate.set(archiveDate, turnIds);

      const actorStat =
        bucket.actorStats[task.actorCharacterId] ??
        createEmptyGroupReplyTaskArchiveActorStat(
          task.actorCharacterId,
          task.actorName,
        );
      actorStat.actorName = task.actorName;
      actorStat.taskCount += 1;
      if (task.status === 'sent') {
        actorStat.statusCounts.sent += 1;
      } else if (task.status === 'cancelled') {
        actorStat.statusCounts.cancelled += 1;
      } else if (task.status === 'failed') {
        actorStat.statusCounts.failed += 1;
      }

      const actorDailyStat =
        actorStat.dailyStats[archiveDate] ??
        createEmptyGroupReplyTaskArchiveDailyStat(archiveDate);
      actorDailyStat.taskCount += 1;
      if (task.status === 'sent') {
        actorDailyStat.statusCounts.sent += 1;
      } else if (task.status === 'cancelled') {
        actorDailyStat.statusCounts.cancelled += 1;
      } else if (task.status === 'failed') {
        actorDailyStat.statusCounts.failed += 1;
      }
      actorStat.dailyStats[archiveDate] = actorDailyStat;
      bucket.actorStats[task.actorCharacterId] = actorStat;

      const actorTurnIds =
        turnIdsByActor.get(task.actorCharacterId) ?? new Set<string>();
      actorTurnIds.add(task.turnId);
      turnIdsByActor.set(task.actorCharacterId, actorTurnIds);

      const actorTurnIdsByDate =
        turnIdsByActorDate.get(task.actorCharacterId) ??
        new Map<string, Set<string>>();
      const actorDateTurnIds =
        actorTurnIdsByDate.get(archiveDate) ?? new Set<string>();
      actorDateTurnIds.add(task.turnId);
      actorTurnIdsByDate.set(archiveDate, actorDateTurnIds);
      turnIdsByActorDate.set(task.actorCharacterId, actorTurnIdsByDate);

      const actorTasks = tasksByActor.get(task.actorCharacterId) ?? [];
      actorTasks.push(task);
      tasksByActor.set(task.actorCharacterId, actorTasks);
    }

    for (const [date, turnIds] of turnIdsByDate.entries()) {
      const dailyStat =
        bucket.dailyStats[date] ??
        createEmptyGroupReplyTaskArchiveDailyStat(date);
      dailyStat.turnCount += turnIds.size;
      bucket.dailyStats[date] = dailyStat;
    }

    for (const [actorCharacterId, turnIds] of turnIdsByActor.entries()) {
      const actorStat = bucket.actorStats[actorCharacterId];
      if (!actorStat) {
        continue;
      }

      actorStat.turnCount += turnIds.size;
      const actorDailyTurns = turnIdsByActorDate.get(actorCharacterId);
      if (actorDailyTurns) {
        for (const [date, actorDateTurnIds] of actorDailyTurns.entries()) {
          const actorDailyStat =
            actorStat.dailyStats[date] ??
            createEmptyGroupReplyTaskArchiveDailyStat(date);
          actorDailyStat.turnCount += actorDateTurnIds.size;
          actorStat.dailyStats[date] = actorDailyStat;
        }
      }

      actorStat.issueSummary = mergeGroupReplyIssueSummaries(
        actorStat.issueSummary,
        buildGroupReplyIssueSummaryFromTasks(
          tasksByActor.get(actorCharacterId) ?? [],
          8,
        ),
        8,
      );
      bucket.actorStats[actorCharacterId] = actorStat;
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
      return normalizeGroupReplyTaskArchiveStore(JSON.parse(raw));
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
