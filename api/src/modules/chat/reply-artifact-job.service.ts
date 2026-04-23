import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  LessThanOrEqual,
  MoreThan,
  Repository,
} from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiSpeechAssetsService } from '../ai/ai-speech-assets.service';
import { ConversationEntity } from './conversation.entity';
import { GroupEntity } from './group.entity';
import { GroupMessageEntity } from './group-message.entity';
import { GroupReplyTaskEntity } from './group-reply-task.entity';
import { MessageEntity } from './message.entity';
import {
  buildAssistantSpeechInstructions,
  type AssistantReplyModalitiesPlan,
} from './assistant-reply-modalities';
import {
  normalizeChatAttachmentDisplayName,
  guessChatAttachmentExtension,
  resolveChatPublicApiBaseUrl,
  sanitizeChatAttachmentFileName,
} from './chat-attachment-file.utils';
import { resolvePrimaryChatAttachmentStorageDir } from './chat-attachment-storage';
import { ChatGateway } from './chat.gateway';
import type {
  GroupMessage,
  ImageAttachment,
  Message,
  MessageAttachment,
  VoiceAttachment,
} from './chat.types';
import {
  ReplyArtifactJobEntity,
  type ReplyArtifactJobStatus,
} from './reply-artifact-job.entity';

const REPLY_ARTIFACT_JOB_BATCH_SIZE = 12;
const REPLY_ARTIFACT_PROCESSING_RETRY_MS = 2 * 60 * 1000;
const DIRECT_REPLY_ARTIFACT_HOLD_MS = 60 * 1000;
const ACTIVE_REPLY_ARTIFACT_JOB_STATUSES: ReplyArtifactJobStatus[] = [
  'pending',
  'processing',
];

type ConversationImageJobInput = {
  imagePrompt: string;
};

type GroupVoiceJobInput = {
  text: string;
};

type GroupImageJobInput = {
  imagePrompt: string;
};

@Injectable()
export class ReplyArtifactJobService {
  private readonly logger = new Logger(ReplyArtifactJobService.name);
  private processing = false;

  constructor(
    @InjectRepository(ReplyArtifactJobEntity)
    private readonly jobRepo: Repository<ReplyArtifactJobEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMessageEntity)
    private readonly groupMessageRepo: Repository<GroupMessageEntity>,
    @InjectRepository(GroupReplyTaskEntity)
    private readonly groupReplyTaskRepo: Repository<GroupReplyTaskEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly speechAssets: AiSpeechAssetsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  async scheduleConversationImageReplyJob(input: {
    conversationId: string;
    sourceMessageId: string;
    sourceMessageCreatedAt: Date;
    characterId: string;
    characterName: string;
    characterAvatar?: string | null;
    imagePrompt: string;
  }) {
    const job = this.jobRepo.create({
      threadType: 'conversation',
      threadId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      sourceMessageCreatedAt: input.sourceMessageCreatedAt,
      groupReplyTaskId: null,
      characterId: input.characterId,
      characterName: input.characterName,
      characterAvatar: input.characterAvatar?.trim() || null,
      artifactType: 'image',
      status: 'pending',
      executeAfter: new Date(Date.now() + DIRECT_REPLY_ARTIFACT_HOLD_MS),
      inputPayload: JSON.stringify({
        imagePrompt: input.imagePrompt,
      } satisfies ConversationImageJobInput),
    });

    return this.jobRepo.save(job);
  }

  async scheduleGroupReplyArtifactJobs(input: {
    groupId: string;
    groupReplyTaskId: string;
    sourceMessageId: string;
    sourceMessageCreatedAt: Date;
    characterId: string;
    characterName: string;
    characterAvatar?: string | null;
    text: string;
    modalities: AssistantReplyModalitiesPlan;
  }) {
    const jobs: ReplyArtifactJobEntity[] = [];

    if (input.modalities.includeVoice) {
      jobs.push(
        this.jobRepo.create({
          threadType: 'group',
          threadId: input.groupId,
          sourceMessageId: input.sourceMessageId,
          sourceMessageCreatedAt: input.sourceMessageCreatedAt,
          groupReplyTaskId: input.groupReplyTaskId,
          characterId: input.characterId,
          characterName: input.characterName,
          characterAvatar: input.characterAvatar?.trim() || null,
          artifactType: 'voice',
          status: 'pending',
          executeAfter: new Date(),
          inputPayload: JSON.stringify({
            text: input.text,
          } satisfies GroupVoiceJobInput),
        }),
      );
    }

    if (input.modalities.imagePrompt) {
      jobs.push(
        this.jobRepo.create({
          threadType: 'group',
          threadId: input.groupId,
          sourceMessageId: input.sourceMessageId,
          sourceMessageCreatedAt: input.sourceMessageCreatedAt,
          groupReplyTaskId: input.groupReplyTaskId,
          characterId: input.characterId,
          characterName: input.characterName,
          characterAvatar: input.characterAvatar?.trim() || null,
          artifactType: 'image',
          status: 'pending',
          executeAfter: new Date(),
          inputPayload: JSON.stringify({
            imagePrompt: input.modalities.imagePrompt,
          } satisfies GroupImageJobInput),
        }),
      );
    }

    if (!jobs.length) {
      return [] as ReplyArtifactJobEntity[];
    }

    return this.jobRepo.save(jobs);
  }

  async activateJobs(jobIds: string[]) {
    const normalizedJobIds = jobIds.map((jobId) => jobId.trim()).filter(Boolean);
    if (!normalizedJobIds.length) {
      return 0;
    }

    const jobs = await this.jobRepo.find({
      where: {
        id: In(normalizedJobIds),
        status: 'pending',
      },
    });
    if (!jobs.length) {
      return 0;
    }

    const executeAfter = new Date();
    await this.jobRepo.save(
      jobs.map((job) => ({
        ...job,
        executeAfter,
      })),
    );
    void this.processDueJobs();
    return jobs.length;
  }

  async cancelConversationJobs(
    conversationId: string,
    reason: string,
    sourceMessageId?: string,
  ) {
    return this.cancelJobs(
      {
        threadType: 'conversation',
        threadId: conversationId,
        ...(sourceMessageId ? { sourceMessageId } : {}),
      },
      reason,
    );
  }

  async cancelGroupJobs(
    groupId: string,
    reason: string,
    options?: {
      sourceMessageId?: string;
      beforeSourceMessageCreatedAt?: Date;
      groupReplyTaskId?: string;
    },
  ) {
    const jobs = await this.jobRepo.find({
      where: {
        threadType: 'group',
        threadId: groupId,
        status: In(ACTIVE_REPLY_ARTIFACT_JOB_STATUSES),
      },
    });
    const filteredJobs = jobs.filter((job) => {
      if (options?.sourceMessageId && job.sourceMessageId !== options.sourceMessageId) {
        return false;
      }
      if (
        options?.groupReplyTaskId &&
        job.groupReplyTaskId !== options.groupReplyTaskId
      ) {
        return false;
      }
      if (
        options?.beforeSourceMessageCreatedAt &&
        job.sourceMessageCreatedAt.getTime() >=
          options.beforeSourceMessageCreatedAt.getTime()
      ) {
        return false;
      }
      return true;
    });
    if (!filteredJobs.length) {
      return 0;
    }

    return this.markJobsCancelled(filteredJobs, reason);
  }

  @Cron('*/3 * * * * *')
  async processDueJobs() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      await this.requeueStaleProcessingJobs();

      const dueJobs = await this.jobRepo.find({
        where: {
          status: 'pending',
          executeAfter: LessThanOrEqual(new Date()),
        },
        order: {
          executeAfter: 'ASC',
          createdAt: 'ASC',
        },
        take: REPLY_ARTIFACT_JOB_BATCH_SIZE,
      });

      for (const job of dueJobs) {
        await this.processJob(job.id);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processJob(jobId: string) {
    const job = await this.jobRepo.findOneBy({
      id: jobId,
      status: 'pending',
    });
    if (!job) {
      return;
    }

    job.status = 'processing';
    job.lastAttemptAt = new Date();
    await this.jobRepo.save(job);

    try {
      if (job.threadType === 'conversation' && job.artifactType === 'image') {
        await this.processConversationImageJob(job);
        return;
      }

      if (job.threadType === 'group' && job.artifactType === 'voice') {
        await this.processGroupVoiceJob(job);
        return;
      }

      if (job.threadType === 'group' && job.artifactType === 'image') {
        await this.processGroupImageJob(job);
        return;
      }

      await this.markJobFailed(job.id, 'unsupported_reply_artifact_job');
    } catch (error) {
      await this.markJobFailed(
        job.id,
        error instanceof Error ? error.message : String(error),
      );
      this.logger.error(
        `Failed to process reply artifact job ${job.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async processConversationImageJob(job: ReplyArtifactJobEntity) {
    const context = await this.validateConversationJob(job);
    if (!context) {
      return;
    }

    const input = this.parseInputPayload<ConversationImageJobInput>(job);
    if (!input?.imagePrompt?.trim()) {
      await this.markJobFailed(job.id, 'missing_image_prompt');
      return;
    }

    this.chatGateway.emitTypingStart(job.threadId, job.characterId, 'image_generation');
    try {
      const generated = await this.ai.generateImage({
        prompt: input.imagePrompt,
        conversationId: job.threadId,
        characterId: job.characterId,
      });

      const latestContext = await this.validateConversationJob(job);
      if (!latestContext) {
        return;
      }

      const attachment = await this.saveGeneratedImageAttachment({
        buffer: generated.buffer,
        mimeType: generated.mimeType,
        fileExtension: generated.fileExtension,
        originalName: `chat-reply-image.${generated.fileExtension}`,
      });
      const messageEntity = this.messageRepo.create({
        id: `msg_${Date.now()}_ai_image_${randomUUID().slice(0, 8)}`,
        conversationId: job.threadId,
        senderType: 'character',
        senderId: job.characterId,
        senderName: job.characterName,
        type: 'image',
        text: '',
        attachmentKind: attachment.kind,
        attachmentPayload: JSON.stringify(attachment),
      });
      await this.messageRepo.save(messageEntity);
      await this.conversationRepo.save({
        ...latestContext.conversation,
        lastActivityAt: messageEntity.createdAt ?? new Date(),
      });
      await this.markJobCompleted(job.id, messageEntity.id);
      this.chatGateway.emitThreadMessage(
        job.threadId,
        this.toConversationMessage(messageEntity, attachment, job.characterAvatar),
      );
    } finally {
      this.chatGateway.emitTypingStop(job.threadId, job.characterId, 'image_generation');
    }
  }

  private async processGroupVoiceJob(job: ReplyArtifactJobEntity) {
    const context = await this.validateGroupJob(job);
    if (!context) {
      return;
    }

    const input = this.parseInputPayload<GroupVoiceJobInput>(job);
    if (!input?.text?.trim()) {
      await this.markJobFailed(job.id, 'missing_voice_text');
      return;
    }

    const synthesized = await this.ai.synthesizeSpeech({
      text: input.text,
      conversationId: job.threadId,
      characterId: job.characterId,
      instructions: buildAssistantSpeechInstructions(job.characterName),
    });

    const latestContext = await this.validateGroupJob(job);
    if (!latestContext) {
      return;
    }

    const asset = await this.speechAssets.saveGeneratedSpeech(synthesized.buffer, {
      mimeType: synthesized.mimeType,
      fileExtension: synthesized.fileExtension,
      baseName: `group-reply-${job.characterId}`,
    });
    const attachment: VoiceAttachment = {
      kind: 'voice',
      url: asset.audioUrl,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      size: synthesized.buffer.length,
      durationMs: synthesized.durationMs,
      transcriptText: input.text,
    };
    const messageEntity = this.groupMessageRepo.create({
      groupId: job.threadId,
      senderId: job.characterId,
      senderType: 'character',
      senderName: job.characterName,
      senderAvatar: job.characterAvatar ?? undefined,
      text: input.text,
      type: 'voice',
      attachmentKind: attachment.kind,
      attachmentPayload: JSON.stringify(attachment),
    });
    await this.groupMessageRepo.save(messageEntity);
    await this.groupRepo.save({
      ...latestContext.group,
      lastActivityAt: messageEntity.createdAt ?? new Date(),
    });
    await this.markJobCompleted(job.id, messageEntity.id);
    this.chatGateway.emitThreadMessage(
      job.threadId,
      this.toGroupMessage(messageEntity, attachment),
    );
  }

  private async processGroupImageJob(job: ReplyArtifactJobEntity) {
    const context = await this.validateGroupJob(job);
    if (!context) {
      return;
    }

    const input = this.parseInputPayload<GroupImageJobInput>(job);
    if (!input?.imagePrompt?.trim()) {
      await this.markJobFailed(job.id, 'missing_image_prompt');
      return;
    }

    this.chatGateway.emitTypingStart(job.threadId, job.characterId, 'image_generation');
    try {
      const generated = await this.ai.generateImage({
        prompt: input.imagePrompt,
        conversationId: job.threadId,
        characterId: job.characterId,
      });

      const latestContext = await this.validateGroupJob(job);
      if (!latestContext) {
        return;
      }

      const attachment = await this.saveGeneratedImageAttachment({
        buffer: generated.buffer,
        mimeType: generated.mimeType,
        fileExtension: generated.fileExtension,
        originalName: `group-reply-image.${generated.fileExtension}`,
      });
      const messageEntity = this.groupMessageRepo.create({
        groupId: job.threadId,
        senderId: job.characterId,
        senderType: 'character',
        senderName: job.characterName,
        senderAvatar: job.characterAvatar ?? undefined,
        text: '',
        type: 'image',
        attachmentKind: attachment.kind,
        attachmentPayload: JSON.stringify(attachment),
      });
      await this.groupMessageRepo.save(messageEntity);
      await this.groupRepo.save({
        ...latestContext.group,
        lastActivityAt: messageEntity.createdAt ?? new Date(),
      });
      await this.markJobCompleted(job.id, messageEntity.id);
      this.chatGateway.emitThreadMessage(
        job.threadId,
        this.toGroupMessage(messageEntity, attachment),
      );
    } finally {
      this.chatGateway.emitTypingStop(job.threadId, job.characterId, 'image_generation');
    }
  }

  private async validateConversationJob(job: ReplyArtifactJobEntity) {
    const latestJob = await this.jobRepo.findOneBy({ id: job.id });
    if (!latestJob || this.isTerminalStatus(latestJob.status)) {
      return null;
    }

    const conversation = await this.conversationRepo.findOneBy({ id: job.threadId });
    if (!conversation) {
      await this.markJobCancelled(job.id, 'conversation_missing');
      return null;
    }

    if (
      conversation.lastClearedAt &&
      new Date(conversation.lastClearedAt).getTime() >
        latestJob.sourceMessageCreatedAt.getTime()
    ) {
      await this.markJobCancelled(job.id, 'conversation_cleared');
      return null;
    }

    const sourceMessage = await this.messageRepo.findOneBy({
      id: latestJob.sourceMessageId,
      conversationId: latestJob.threadId,
    });
    if (!sourceMessage || sourceMessage.senderType !== 'user') {
      await this.markJobCancelled(job.id, 'source_message_missing');
      return null;
    }

    return {
      job: latestJob,
      conversation,
      sourceMessage,
    };
  }

  private async validateGroupJob(job: ReplyArtifactJobEntity) {
    const latestJob = await this.jobRepo.findOneBy({ id: job.id });
    if (!latestJob || this.isTerminalStatus(latestJob.status)) {
      return null;
    }

    const group = await this.groupRepo.findOneBy({ id: job.threadId });
    if (!group) {
      await this.markJobCancelled(job.id, 'group_missing');
      return null;
    }

    if (
      group.lastClearedAt &&
      new Date(group.lastClearedAt).getTime() >
        latestJob.sourceMessageCreatedAt.getTime()
    ) {
      await this.markJobCancelled(job.id, 'group_cleared');
      return null;
    }

    const sourceMessage = await this.groupMessageRepo.findOneBy({
      id: latestJob.sourceMessageId,
      groupId: latestJob.threadId,
    });
    if (!sourceMessage || sourceMessage.senderType !== 'user') {
      await this.markJobCancelled(job.id, 'source_message_missing');
      return null;
    }

    if (latestJob.groupReplyTaskId) {
      const task = await this.groupReplyTaskRepo.findOneBy({
        id: latestJob.groupReplyTaskId,
      });
      if (!task) {
        await this.markJobCancelled(job.id, 'group_reply_task_missing');
        return null;
      }

      if (task.status === 'cancelled' || task.status === 'failed') {
        await this.markJobCancelled(job.id, 'group_reply_task_inactive');
        return null;
      }
    }

    const newerUserMessage = await this.groupMessageRepo.findOne({
      where: {
        groupId: latestJob.threadId,
        senderType: 'user',
        createdAt: MoreThan(latestJob.sourceMessageCreatedAt),
      },
      order: { createdAt: 'ASC' },
    });
    if (newerUserMessage) {
      await this.markJobCancelled(job.id, 'superseded_by_new_user_message');
      return null;
    }

    return {
      job: latestJob,
      group,
      sourceMessage,
    };
  }

  private async saveGeneratedImageAttachment(input: {
    buffer: Buffer;
    mimeType: string;
    fileExtension?: string;
    originalName: string;
  }): Promise<ImageAttachment> {
    const displayName = normalizeChatAttachmentDisplayName(
      input.originalName,
      'image',
      input.mimeType,
    );
    const extension =
      path.extname(displayName) ||
      (input.fileExtension?.trim()
        ? `.${input.fileExtension.trim().replace(/^\.+/, '')}`
        : guessChatAttachmentExtension(input.mimeType));
    const baseName = path.basename(displayName, extension) || 'attachment';
    const storedFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeChatAttachmentFileName(baseName)}${extension}`;
    const storageDir = resolvePrimaryChatAttachmentStorageDir();

    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, storedFileName), input.buffer);

    return {
      kind: 'image',
      url: `${resolveChatPublicApiBaseUrl()}/api/chat/attachments/${storedFileName}`,
      mimeType: input.mimeType || 'application/octet-stream',
      fileName: displayName,
      size: input.buffer.length,
    };
  }

  private toConversationMessage(
    entity: MessageEntity,
    attachment: MessageAttachment,
    senderAvatar?: string | null,
  ): Message {
    return {
      id: entity.id,
      conversationId: entity.conversationId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderId: entity.senderId,
      senderName: entity.senderName,
      senderAvatar: senderAvatar?.trim() || undefined,
      type: entity.type as
        | 'text'
        | 'system'
        | 'proactive'
        | 'sticker'
        | 'image'
        | 'file'
        | 'voice'
        | 'contact_card'
        | 'location_card'
        | 'note_card',
      text: entity.text,
      attachment,
      createdAt: entity.createdAt ?? new Date(),
    };
  }

  private toGroupMessage(
    entity: GroupMessageEntity,
    attachment: MessageAttachment,
  ): GroupMessage {
    return {
      id: entity.id,
      groupId: entity.groupId,
      senderId: entity.senderId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderName: entity.senderName,
      senderAvatar: entity.senderAvatar ?? undefined,
      text: entity.text,
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
      attachment,
      createdAt: entity.createdAt ?? new Date(),
    };
  }

  private async cancelJobs(
    where: Partial<
      Pick<ReplyArtifactJobEntity, 'threadType' | 'threadId' | 'sourceMessageId'>
    >,
    reason: string,
  ) {
    const jobs = await this.jobRepo.find({
      where: {
        ...where,
        status: In(ACTIVE_REPLY_ARTIFACT_JOB_STATUSES),
      },
    });
    if (!jobs.length) {
      return 0;
    }

    return this.markJobsCancelled(jobs, reason);
  }

  private async markJobsCancelled(
    jobs: ReplyArtifactJobEntity[],
    reason: string,
  ) {
    const cancelledAt = new Date();
    await this.jobRepo.save(
      jobs.map((job) => ({
        ...job,
        status: 'cancelled' as const,
        cancelReason: reason,
        cancelledAt,
      })),
    );
    return jobs.length;
  }

  private async markJobCancelled(jobId: string, reason: string) {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job || this.isTerminalStatus(job.status)) {
      return;
    }

    job.status = 'cancelled';
    job.cancelReason = reason;
    job.cancelledAt = new Date();
    await this.jobRepo.save(job);
  }

  private async markJobCompleted(jobId: string, artifactMessageId: string) {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job || this.isTerminalStatus(job.status)) {
      return;
    }

    job.status = 'completed';
    job.artifactMessageId = artifactMessageId;
    job.completedAt = new Date();
    job.cancelReason = null;
    job.errorMessage = null;
    await this.jobRepo.save(job);
  }

  private async markJobFailed(jobId: string, errorMessage: string) {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job || job.status === 'cancelled' || job.status === 'completed') {
      return;
    }

    job.status = 'failed';
    job.errorMessage = errorMessage.slice(0, 1000);
    await this.jobRepo.save(job);
  }

  private async requeueStaleProcessingJobs() {
    const staleBefore = new Date(Date.now() - REPLY_ARTIFACT_PROCESSING_RETRY_MS);
    const staleJobs = await this.jobRepo.find({
      where: {
        status: 'processing',
        lastAttemptAt: LessThanOrEqual(staleBefore),
      },
      take: REPLY_ARTIFACT_JOB_BATCH_SIZE,
      order: {
        lastAttemptAt: 'ASC',
        executeAfter: 'ASC',
      },
    });
    if (!staleJobs.length) {
      return;
    }

    await this.jobRepo.save(
      staleJobs.map((job) => ({
        ...job,
        status: 'pending' as const,
        executeAfter: new Date(),
        errorMessage: job.errorMessage ?? 'requeued_after_stale_processing',
      })),
    );
  }

  private parseInputPayload<T>(job: ReplyArtifactJobEntity): T | null {
    try {
      return JSON.parse(job.inputPayload) as T;
    } catch {
      return null;
    }
  }

  private isTerminalStatus(status: ReplyArtifactJobStatus) {
    return (
      status === 'completed' ||
      status === 'cancelled' ||
      status === 'failed'
    );
  }
}
