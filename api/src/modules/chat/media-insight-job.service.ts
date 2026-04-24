import {
  BadGatewayException,
  BadRequestException,
  Inject,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { GroupMessageEntity } from './group-message.entity';
import {
  MediaInsightJobEntity,
  type MediaInsightJobStatus,
  type MediaInsightJobThreadType,
  type MediaInsightKind,
} from './media-insight-job.entity';
import { MessageEntity } from './message.entity';
import type {
  AttachmentInsight,
  DocumentAttachmentInsight,
  FileAttachment,
  MessageAttachment,
  VoiceAttachment,
} from './chat.types';
import { DocumentExtractionService } from './document-extraction.service';
import { ChatService } from './chat.service';

const MEDIA_INSIGHT_JOB_BATCH_SIZE = 12;
const MEDIA_INSIGHT_PROCESSING_RETRY_MS = 2 * 60 * 1000;
const MAX_MEDIA_INSIGHT_ATTEMPTS = 3;
const ACTIVE_MEDIA_INSIGHT_JOB_STATUSES: MediaInsightJobStatus[] = [
  'pending',
  'processing',
];

type MediaInsightResultPayload = {
  transcriptText?: string;
  extractedText?: string;
  provider?: string;
  documentInsight?: DocumentAttachmentInsight;
  errorCode?: string;
  errorMessage?: string;
};

type InsightDescriptor = {
  kind: MediaInsightKind;
  mimeType?: string;
  fileName?: string;
  sourceUrl: string;
};

@Injectable()
export class MediaInsightJobService {
  private readonly logger = new Logger(MediaInsightJobService.name);
  private processing = false;

  constructor(
    @InjectRepository(MediaInsightJobEntity)
    private readonly jobRepo: Repository<MediaInsightJobEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(GroupMessageEntity)
    private readonly groupMessageRepo: Repository<GroupMessageEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly documentExtraction: DocumentExtractionService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
  ) {}

  async ensureConversationMessageInsight(input: {
    conversationId: string;
    sourceMessageId: string;
    sourceMessageCreatedAt: Date;
    attachment?: MessageAttachment;
    characterId?: string | null;
  }): Promise<MessageAttachment | undefined> {
    return this.ensureMessageInsight({
      threadType: 'conversation',
      threadId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      sourceMessageCreatedAt: input.sourceMessageCreatedAt,
      attachment: input.attachment,
      characterId: input.characterId,
      mode: 'chat_attachment',
    });
  }

  async ensureGroupMessageInsight(input: {
    groupId: string;
    sourceMessageId: string;
    sourceMessageCreatedAt: Date;
    attachment?: MessageAttachment;
    characterId?: string | null;
  }): Promise<MessageAttachment | undefined> {
    return this.ensureMessageInsight({
      threadType: 'group',
      threadId: input.groupId,
      sourceMessageId: input.sourceMessageId,
      sourceMessageCreatedAt: input.sourceMessageCreatedAt,
      attachment: input.attachment,
      characterId: input.characterId,
      mode: 'group_attachment',
    });
  }

  async cancelConversationJobs(
    conversationId: string,
    reason: string,
    sourceMessageId?: string,
  ) {
    const jobs = await this.jobRepo.find({
      where: {
        threadType: 'conversation',
        threadId: conversationId,
        status: In(ACTIVE_MEDIA_INSIGHT_JOB_STATUSES),
        ...(sourceMessageId ? { sourceMessageId } : {}),
      },
    });
    if (!jobs.length) {
      return 0;
    }

    return this.markJobsCancelled(jobs, reason);
  }

  async cancelGroupJobs(
    groupId: string,
    reason: string,
    sourceMessageId?: string,
  ) {
    const jobs = await this.jobRepo.find({
      where: {
        threadType: 'group',
        threadId: groupId,
        status: In(ACTIVE_MEDIA_INSIGHT_JOB_STATUSES),
        ...(sourceMessageId ? { sourceMessageId } : {}),
      },
    });
    if (!jobs.length) {
      return 0;
    }

    return this.markJobsCancelled(jobs, reason);
  }

  @Cron('*/5 * * * * *')
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
        take: MEDIA_INSIGHT_JOB_BATCH_SIZE,
      });

      for (const job of dueJobs) {
        await this.processJob(job.id);
      }
    } finally {
      this.processing = false;
    }
  }

  private async ensureMessageInsight(input: {
    threadType: MediaInsightJobThreadType;
    threadId: string;
    sourceMessageId: string;
    sourceMessageCreatedAt: Date;
    attachment?: MessageAttachment;
    characterId?: string | null;
    mode: 'chat_attachment' | 'group_attachment';
  }): Promise<MessageAttachment | undefined> {
    if (!input.attachment) {
      return input.attachment;
    }

    const descriptor = this.describeAttachment(input.attachment);
    if (!descriptor) {
      return input.attachment;
    }

    const existingJob = await this.jobRepo.findOneBy({
      threadType: input.threadType,
      threadId: input.threadId,
      sourceMessageId: input.sourceMessageId,
    });

    if (existingJob?.status === 'completed' && existingJob.resultPayload) {
      const restoredAttachment = this.applyInsightResult(
        input.attachment,
        descriptor.kind,
        this.parseResultPayload(existingJob.resultPayload),
      );
      const completedAttachment = this.applyAttachmentInsightState(
        restoredAttachment,
        existingJob,
      );
      await this.persistAttachment(
        input.threadType,
        input.threadId,
        input.sourceMessageId,
        completedAttachment,
      );
      return completedAttachment;
    }

    let job =
      existingJob ??
      this.jobRepo.create({
        threadType: input.threadType,
        threadId: input.threadId,
        sourceMessageId: input.sourceMessageId,
        sourceMessageCreatedAt: input.sourceMessageCreatedAt,
        insightKind: descriptor.kind,
        status: 'pending',
        executeAfter: new Date(),
        sourceUrl: descriptor.sourceUrl,
        mimeType: descriptor.mimeType ?? null,
        fileName: descriptor.fileName ?? null,
        characterId: input.characterId?.trim() || null,
      });

    job.insightKind = descriptor.kind;
    job.sourceUrl = descriptor.sourceUrl;
    job.mimeType = descriptor.mimeType ?? null;
    job.fileName = descriptor.fileName ?? null;
    job.characterId = input.characterId?.trim() || null;
    job.cancelReason = null;
    job.cancelledAt = null;

    if (this.hasCompletedInsight(input.attachment, descriptor.kind)) {
      job.status = 'completed';
      job.executeAfter = new Date();
      job.errorMessage = null;
      job.errorCode = null;
      job.completedAt = new Date();
      const resultPayload = this.buildResultPayload(
        input.attachment,
        descriptor.kind,
      );
      job.resultPayload = JSON.stringify(resultPayload);
      job.resultProvider = resultPayload.provider ?? null;
      job = await this.jobRepo.save(job);
      const completedAttachment = this.applyAttachmentInsightState(
        input.attachment,
        job,
      );
      await this.persistAttachment(
        input.threadType,
        input.threadId,
        input.sourceMessageId,
        completedAttachment,
      );
      return completedAttachment;
    }

    job.status = 'pending';
    job.errorMessage = null;
    job.errorCode = null;
    job.completedAt = null;
    job.resultProvider = null;
    job.executeAfter = new Date();
    job = await this.jobRepo.save(job);

    const pendingAttachment = this.applyAttachmentInsightState(
      input.attachment,
      job,
    );
    await this.persistAttachment(
      input.threadType,
      input.threadId,
      input.sourceMessageId,
      pendingAttachment,
    );

    const processedAttachment = await this.processJob(job.id, input.mode);
    return processedAttachment ?? pendingAttachment;
  }

  private async processJob(
    jobId: string,
    explicitMode?: 'chat_attachment' | 'group_attachment',
  ) {
    const job = await this.jobRepo.findOneBy({
      id: jobId,
      status: 'pending',
    });
    if (!job) {
      return null;
    }

    job.status = 'processing';
    job.attemptCount += 1;
    job.lastAttemptAt = new Date();
    await this.jobRepo.save(job);

    try {
      const source = await this.loadSourceMessage(job);
      if (!source?.attachment) {
        await this.markJobCancelled(job, 'source_attachment_missing');
        return null;
      }

      const descriptor = this.describeAttachment(source.attachment);
      if (!descriptor || descriptor.kind !== job.insightKind) {
        await this.markJobCancelled(job, 'source_attachment_kind_mismatch');
        return null;
      }

      if (this.hasCompletedInsight(source.attachment, descriptor.kind)) {
        return this.completeJob(job, source.attachment);
      }

      const result = await this.resolveInsight(job, explicitMode);
      if (result && this.resultHasContent(result)) {
        const resolvedAttachment = this.applyInsightResult(
          source.attachment,
          descriptor.kind,
          result,
        );
        return this.completeJob(job, resolvedAttachment);
      }

      return this.requeueOrFailJob(
        job,
        source.attachment,
        result?.errorMessage,
        result?.errorCode,
      );
    } catch (error) {
      const classifiedError = this.classifyInsightError(error);
      this.logger.warn(`Failed to process media insight job ${job.id}`, {
        errorCode: classifiedError.errorCode,
        errorMessage: classifiedError.errorMessage,
      });
      return this.requeueOrFailJob(
        job,
        null,
        classifiedError.errorMessage,
        classifiedError.errorCode,
      );
    }
  }

  private async resolveInsight(
    job: MediaInsightJobEntity,
    explicitMode?: 'chat_attachment' | 'group_attachment',
  ): Promise<MediaInsightResultPayload | null> {
    if (
      job.insightKind === 'audio_transcription' ||
      job.insightKind === 'video_transcription'
    ) {
      const transcription = await this.ai.tryTranscribeMediaFromUrl({
        url: job.sourceUrl,
        mimeType: job.mimeType,
        fileName: job.fileName,
        conversationId: job.threadId,
        characterId: job.characterId ?? undefined,
        mode:
          explicitMode ??
          (job.threadType === 'group' ? 'group_attachment' : 'chat_attachment'),
        throwOnFailure: true,
      });
      return transcription?.text
        ? {
            transcriptText: transcription.text,
            provider: transcription.provider,
          }
        : null;
    }

    const extractedText = await this.documentExtraction.extractFromUrl({
      url: job.sourceUrl,
      mimeType: job.mimeType,
      fileName: job.fileName,
    });
    if (extractedText.status === 'completed') {
      return {
        extractedText: extractedText.extractedText,
        documentInsight: {
          extractionMode: extractedText.extractionMode,
          parser: extractedText.parser,
          previewText: extractedText.previewText,
          pageCount: extractedText.pageCount,
          characterCount: extractedText.characterCount,
          truncated: extractedText.truncated,
        },
      };
    }

    return {
      errorCode: extractedText.errorCode,
      errorMessage: extractedText.errorMessage,
    };
  }

  private async completeJob(
    job: MediaInsightJobEntity,
    attachment: MessageAttachment,
  ) {
    job.status = 'completed';
    job.completedAt = new Date();
    job.executeAfter = new Date();
    job.errorMessage = null;
    job.errorCode = null;
    job.cancelReason = null;
    job.cancelledAt = null;
    const resultPayload = this.buildResultPayload(attachment, job.insightKind);
    job.resultPayload = JSON.stringify(resultPayload);
    job.resultProvider = resultPayload.provider ?? null;
    const savedJob = await this.jobRepo.save(job);
    const completedAttachment = this.applyAttachmentInsightState(
      attachment,
      savedJob,
    );
    await this.persistAttachment(
      savedJob.threadType,
      savedJob.threadId,
      savedJob.sourceMessageId,
      completedAttachment,
    );
    return completedAttachment;
  }

  private async requeueOrFailJob(
    job: MediaInsightJobEntity,
    attachment: MessageAttachment | null,
    errorMessage?: string,
    errorCode?: string,
  ) {
    const finalStatus: MediaInsightJobStatus =
      job.attemptCount >= MAX_MEDIA_INSIGHT_ATTEMPTS ? 'failed' : 'pending';
    job.status = finalStatus;
    job.errorMessage = errorMessage?.trim() || 'insight_unavailable';
    job.errorCode = errorCode?.trim() || 'INSIGHT_UNAVAILABLE';
    job.resultProvider = null;
    job.executeAfter = new Date(Date.now() + MEDIA_INSIGHT_PROCESSING_RETRY_MS);
    if (finalStatus === 'failed') {
      job.completedAt = new Date();
    } else {
      job.completedAt = null;
    }
    const savedJob = await this.jobRepo.save(job);
    if (!attachment) {
      return null;
    }

    const nextAttachment = this.applyAttachmentInsightState(attachment, savedJob);
    await this.persistAttachment(
      savedJob.threadType,
      savedJob.threadId,
      savedJob.sourceMessageId,
      nextAttachment,
    );
    return nextAttachment;
  }

  private async requeueStaleProcessingJobs() {
    const staleBefore = new Date(Date.now() - MEDIA_INSIGHT_PROCESSING_RETRY_MS);
    const staleJobs = await this.jobRepo.find({
      where: {
        status: 'processing',
        lastAttemptAt: LessThanOrEqual(staleBefore),
      },
      take: MEDIA_INSIGHT_JOB_BATCH_SIZE,
    });
    if (!staleJobs.length) {
      return;
    }

    await this.jobRepo.save(
      staleJobs.map((job) => ({
        ...job,
        status: 'pending' as const,
        executeAfter: new Date(),
        errorCode: job.errorCode ?? 'STALE_PROCESSING_JOB_REQUEUED',
        errorMessage: job.errorMessage ?? 'stale_processing_job_requeued',
      })),
    );
  }

  private async loadSourceMessage(job: MediaInsightJobEntity): Promise<{
    attachment?: MessageAttachment;
  } | null> {
    if (job.threadType === 'conversation') {
      const entity = await this.messageRepo.findOneBy({
        id: job.sourceMessageId,
        conversationId: job.threadId,
      });
      return entity ? { attachment: this.parseAttachment(entity) } : null;
    }

    const entity = await this.groupMessageRepo.findOneBy({
      id: job.sourceMessageId,
      groupId: job.threadId,
    });
    return entity ? { attachment: this.parseAttachment(entity) } : null;
  }

  private async persistAttachment(
    threadType: MediaInsightJobThreadType,
    threadId: string,
    sourceMessageId: string,
    attachment: MessageAttachment,
  ) {
    if (threadType === 'conversation') {
      await this.messageRepo.update(
        {
          id: sourceMessageId,
          conversationId: threadId,
        },
        {
          attachmentKind: attachment.kind,
          attachmentPayload: JSON.stringify(attachment),
        },
      );
      this.chatService.invalidateConversationHistory(threadId);
      return;
    }

    await this.groupMessageRepo.update(
      {
        id: sourceMessageId,
        groupId: threadId,
      },
      {
        attachmentKind: attachment.kind,
        attachmentPayload: JSON.stringify(attachment),
      },
    );
  }

  private async markJobCancelled(
    job: MediaInsightJobEntity,
    reason: string,
  ) {
    job.status = 'cancelled';
    job.cancelReason = reason;
    job.cancelledAt = new Date();
    job.errorCode = null;
    job.errorMessage = null;
    await this.jobRepo.save(job);
  }

  private async markJobsCancelled(
    jobs: MediaInsightJobEntity[],
    reason: string,
  ) {
    if (!jobs.length) {
      return 0;
    }

    const cancelledAt = new Date();
    await this.jobRepo.save(
      jobs.map((job) => ({
        ...job,
        status: 'cancelled' as const,
        cancelReason: reason,
        cancelledAt,
        errorCode: null,
      })),
    );
    return jobs.length;
  }

  private describeAttachment(
    attachment: MessageAttachment,
  ): InsightDescriptor | null {
    if (attachment.kind === 'voice') {
      return {
        kind: 'audio_transcription',
        sourceUrl: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      };
    }

    if (attachment.kind !== 'file') {
      return null;
    }

    if (this.isAudioMimeType(attachment.mimeType)) {
      return {
        kind: 'audio_transcription',
        sourceUrl: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      };
    }

    if (this.isVideoMimeType(attachment.mimeType)) {
      return {
        kind: 'video_transcription',
        sourceUrl: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      };
    }

    if (this.isDocumentMimeType(attachment.mimeType, attachment.fileName)) {
      return {
        kind: 'document_text_extraction',
        sourceUrl: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      };
    }

    return null;
  }

  private hasCompletedInsight(
    attachment: MessageAttachment,
    insightKind: MediaInsightKind,
  ) {
    if (insightKind === 'document_text_extraction' && attachment.kind === 'file') {
      return Boolean(attachment.extractedText?.trim());
    }

    if (
      (insightKind === 'audio_transcription' ||
        insightKind === 'video_transcription') &&
      (attachment.kind === 'file' || attachment.kind === 'voice')
    ) {
      return Boolean(attachment.transcriptText?.trim());
    }

    return false;
  }

  private buildResultPayload(
    attachment: MessageAttachment,
    insightKind: MediaInsightKind,
  ): MediaInsightResultPayload {
    if (insightKind === 'document_text_extraction' && attachment.kind === 'file') {
      return {
        extractedText: attachment.extractedText,
        documentInsight: attachment.documentInsight,
      };
    }

    if (attachment.kind === 'file' || attachment.kind === 'voice') {
      return {
        transcriptText: attachment.transcriptText,
        provider: attachment.insight?.provider,
      };
    }

    return {};
  }

  private parseResultPayload(
    payload: string,
  ): MediaInsightResultPayload | null {
    try {
      const parsed = JSON.parse(payload) as MediaInsightResultPayload;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private resultHasContent(result: MediaInsightResultPayload) {
    return Boolean(result.transcriptText?.trim() || result.extractedText?.trim());
  }

  private applyInsightResult(
    attachment: MessageAttachment,
    insightKind: MediaInsightKind,
    result: MediaInsightResultPayload | null,
  ): MessageAttachment {
    if (!result) {
      return attachment;
    }

    if (
      (insightKind === 'audio_transcription' ||
        insightKind === 'video_transcription') &&
      (attachment.kind === 'file' || attachment.kind === 'voice') &&
      result.transcriptText?.trim()
    ) {
      return {
        ...attachment,
        transcriptText: result.transcriptText.trim(),
      };
    }

    if (
      insightKind === 'document_text_extraction' &&
      attachment.kind === 'file'
    ) {
      const extractedText = result.extractedText?.trim();
      return {
        ...attachment,
        ...(extractedText ? { extractedText } : {}),
        ...(result.documentInsight
          ? { documentInsight: result.documentInsight }
          : {}),
      };
    }

    return attachment;
  }

  private applyAttachmentInsightState(
    attachment: MessageAttachment,
    job: Pick<
      MediaInsightJobEntity,
      | 'id'
      | 'insightKind'
      | 'status'
      | 'updatedAt'
      | 'errorCode'
      | 'errorMessage'
      | 'resultProvider'
    >,
  ): MessageAttachment {
    if (attachment.kind !== 'file' && attachment.kind !== 'voice') {
      return attachment;
    }

    const insight: AttachmentInsight = {
      jobId: job.id,
      kind: job.insightKind,
      status: job.status,
      updatedAt: job.updatedAt.toISOString(),
      provider: job.resultProvider?.trim() || undefined,
      errorCode: job.errorCode?.trim() || undefined,
      errorMessage: job.errorMessage?.trim() || undefined,
    };

    return {
      ...attachment,
      insight,
    } satisfies FileAttachment | VoiceAttachment;
  }

  private parseAttachment(
    entity: Pick<MessageEntity | GroupMessageEntity, 'attachmentKind' | 'attachmentPayload'>,
  ): MessageAttachment | undefined {
    if (!entity.attachmentKind || !entity.attachmentPayload) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(entity.attachmentPayload) as MessageAttachment;
      return parsed.kind === entity.attachmentKind ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private isAudioMimeType(mimeType?: string | null) {
    return /^(audio)\//i.test(mimeType ?? '');
  }

  private isVideoMimeType(mimeType?: string | null) {
    return /^(video)\//i.test(mimeType ?? '');
  }

  private isDocumentMimeType(mimeType?: string | null, fileName?: string | null) {
    if (
      /(pdf|msword|officedocument|text\/plain|text\/markdown|application\/json|xml|csv|html)/i.test(
        mimeType ?? '',
      )
    ) {
      return true;
    }

    return /\.(txt|md|markdown|csv|json|xml|html|htm|pdf|docx?)$/i.test(
      fileName ?? '',
    );
  }

  private classifyInsightError(error: unknown) {
    if (error instanceof BadRequestException) {
      return {
        errorCode: 'BAD_REQUEST',
        errorMessage: error.message,
      };
    }

    if (error instanceof ServiceUnavailableException) {
      const status = this.extractHttpStatus(error);
      return {
        errorCode: status === 429 ? 'RATE_LIMITED' : 'TRANSIENT_PROVIDER_FAILURE',
        errorMessage: error.message,
      };
    }

    if (error instanceof BadGatewayException) {
      return {
        errorCode: 'UNSUPPORTED_OR_EMPTY_RESULT',
        errorMessage: error.message,
      };
    }

    if (error instanceof HttpException) {
      const status = this.extractHttpStatus(error);
      return {
        errorCode:
          status === 401 || status === 403
            ? 'AUTH_FAILURE'
            : status === 429
              ? 'RATE_LIMITED'
              : `HTTP_${status}`,
        errorMessage: error.message,
      };
    }

    if (error instanceof Error) {
      return {
        errorCode: 'UNEXPECTED_ERROR',
        errorMessage: error.message,
      };
    }

    return {
      errorCode: 'UNEXPECTED_ERROR',
      errorMessage: String(error),
    };
  }

  private extractHttpStatus(error: HttpException) {
    const status = error.getStatus?.();
    return typeof status === 'number' ? status : 500;
  }
}
