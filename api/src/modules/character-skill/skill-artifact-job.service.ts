import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CloudWalletClient } from '../billing/cloud-wallet.client';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import {
  resolvePrimaryChatAttachmentStorageDir,
} from '../chat/chat-attachment-storage';
import { sanitizeChatAttachmentFileName } from '../chat/chat-attachment-file.utils';
import type { FileAttachment, Message } from '../chat/chat.types';
import {
  isSharedWorldMode,
  TenantContextStore,
} from '../tenancy/tenant-context';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';
import type { SkillArtifactJobInput } from './character-skill.types';
import { getRenderer } from './renderers/renderer-registry';
import { buildRenderFailedMessage } from './skill-messages';
import { getSkillForSourceKey } from './skill-registry';
import { SkillArtifactJobEntity } from './skill-artifact-job.entity';
import { SkillRunEntity } from './skill-run.entity';

const SKILL_JOB_BATCH_SIZE = 6;
const SKILL_JOB_PROCESSING_RETRY_MS = 3 * 60 * 1000;

// 规格生成的输出纪律：硬压住推理型模型的「思考过程」，直接吐可解析 JSON——否则 <think> 会
// 吃光 token 预算把 JSON 截断，解析失败回退空规格 → 近空文件（真 LLM e2e 发现 PPT 踩此坑）。
const SPEC_OUTPUT_DISCIPLINE =
  '\n\n【输出纪律】立即只输出最终 JSON 对象本身：不要任何思考过程/分析/解释，不要 <think> 标签，不要 markdown 代码块或 ``` 包裹。第一个字符必须是 {。';

// 异步渲染 job 处理器：仿 ReplyArtifactJobService 的范式（Cron + owner 帧 + 自旋锁 +
// stale 重排 + 存附件 + emit），但产物是 .pptx/.docx/.xlsx 文件消息，且渲染失败会退费。
@Injectable()
export class SkillArtifactJobService {
  private readonly logger = new Logger(SkillArtifactJobService.name);
  private processing = false;

  constructor(
    @InjectRepository(SkillArtifactJobEntity)
    private readonly jobRepo: Repository<SkillArtifactJobEntity>,
    @InjectRepository(SkillRunEntity)
    private readonly runRepo: Repository<SkillRunEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly wallet: CloudWalletClient,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  @Cron('*/3 * * * * *')
  async processDueJobs() {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.requeueStaleProcessingJobs();
      const dueJobs = await this.jobRepo.find({
        where: { status: 'pending', executeAfter: LessThanOrEqual(new Date()) },
        order: { executeAfter: 'ASC', createdAt: 'ASC' },
        take: SKILL_JOB_BATCH_SIZE,
      });
      for (const job of dueJobs) {
        await this.runJobInOwnerFrame(job.ownerId, () =>
          this.processJob(job.id),
        );
      }
    } finally {
      this.processing = false;
    }
  }

  private async runJobInOwnerFrame(
    ownerId: string | null | undefined,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (!isSharedWorldMode() || !ownerId) {
      await fn();
      return;
    }
    await TenantContextStore.run({ ownerId, phone: '' }, fn);
  }

  private async processJob(jobId: string) {
    const job = await this.jobRepo.findOneBy({ id: jobId, status: 'pending' });
    if (!job) return;

    job.status = 'processing';
    job.lastAttemptAt = new Date();
    await this.jobRepo.save(job);

    try {
      await this.processDocumentJob(job);
    } catch (error) {
      await this.handleRenderFailure(
        job,
        error instanceof Error ? error.message : String(error),
      );
      this.logger.error(
        `Skill artifact job ${job.id} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async processDocumentJob(job: SkillArtifactJobEntity) {
    const input = this.parseInput(job);
    const runId = input?.skillRunId ?? job.skillRunId;
    const run = await new TenantRepository(this.runRepo).findOneBy({
      id: runId,
    });
    if (!run) {
      await this.markJobFailed(job.id, 'skill_run_missing');
      return;
    }
    // 幂等：run 已终态 → 不重复渲染/重复发文件。
    if (run.status === 'completed' || run.status === 'cancelled') {
      await this.markJobCompleted(job.id, run.artifactMessageId ?? null);
      return;
    }

    // 会话仍在、未被清空、源消息仍是用户消息（仿 validateConversationJob）。
    const conversation = await new TenantRepository(
      this.conversationRepo,
    ).findOneBy({ id: job.conversationId });
    if (!conversation) {
      await this.handleRenderFailure(job, 'conversation_missing');
      return;
    }
    if (
      conversation.lastClearedAt &&
      job.sourceMessageCreatedAt &&
      new Date(conversation.lastClearedAt).getTime() >
        job.sourceMessageCreatedAt.getTime()
    ) {
      // 会话已被用户清空 → 不再投递；退费并收尾（不发道歉，用户已离开该话题）。
      await this.wallet.refund(job.billingIdempotencyKey).catch(() => undefined);
      run.status = 'cancelled';
      run.errorMessage = 'conversation_cleared';
      await this.runRepo.save(run);
      await this.markJobFailed(job.id, 'conversation_cleared');
      return;
    }

    const skill = getSkillForSourceKey(run.characterSourceKey);
    if (!skill) {
      await this.handleRenderFailure(job, 'skill_not_found');
      return;
    }

    run.status = 'rendering';
    await this.runRepo.save(run);

    this.chatGateway.emitTypingStart(
      job.conversationId,
      job.characterId,
      'document_generation',
    );
    try {
      const spec = await this.ai.generateJsonObject({
        prompt:
          skill.specPromptBuilder({
            characterName: job.characterName,
            userGoal: run.userGoal,
            slots: run.slotPayload ?? {},
            outline: run.outlineSpec ?? {},
          }) + SPEC_OUTPUT_DISCIPLINE,
        usageContext: {
          surface: 'app',
          scene: 'skill_document_spec',
          scopeType: 'conversation',
          scopeId: job.conversationId,
          ownerId: job.ownerId ?? undefined,
          characterId: job.characterId,
          characterName: job.characterName,
          conversationId: job.conversationId,
        },
        // 给足预算：推理型模型会先 <think> 再出 JSON，规格(尤其 deck)较大，4000 易被思考耗尽截断
        // 致 JSON 不闭合解析失败 → 空规格 → 近空文件。8000 容纳思考+完整规格。
        maxTokens: 8000,
        temperature: 0.4,
        fallback: {},
      });

      const renderer = getRenderer(skill.rendererKey);
      const buffer = await renderer.render(spec as never);

      const attachment = await this.saveGeneratedFileAttachment({
        buffer,
        mimeType: renderer.mimeType,
        ext: renderer.ext,
        fileName: skill.fileNameBuilder({
          characterName: job.characterName,
          userGoal: run.userGoal,
          slots: run.slotPayload ?? {},
        }),
      });

      const messageEntity = this.messageRepo.create({
        id: `msg_${Date.now()}_skill_${randomUUID().slice(0, 8)}`,
        conversationId: job.conversationId,
        senderType: 'character',
        senderId: job.characterId,
        senderName: job.characterName,
        type: 'file',
        text: '',
        attachmentKind: attachment.kind,
        attachmentPayload: JSON.stringify(attachment),
      });
      await this.messageRepo.save(messageEntity);
      await this.conversationRepo.save({
        ...conversation,
        lastActivityAt: messageEntity.createdAt ?? new Date(),
      });
      this.chatService.invalidateConversationHistory(job.conversationId);

      run.status = 'completed';
      run.artifactMessageId = messageEntity.id;
      await this.runRepo.save(run);
      await this.markJobCompleted(job.id, messageEntity.id);

      this.chatGateway.emitThreadMessage(
        job.conversationId,
        this.toConversationMessage(messageEntity, attachment, job.characterAvatar),
      );
    } finally {
      this.chatGateway.emitTypingStop(
        job.conversationId,
        job.characterId,
        'document_generation',
      );
    }
  }

  // 渲染失败：退费（同一幂等键，尽力而为）+ 发道歉消息 + 标记 run/job failed。
  private async handleRenderFailure(job: SkillArtifactJobEntity, reason: string) {
    await this.wallet.refund(job.billingIdempotencyKey).catch(() => undefined);

    const run = await new TenantRepository(this.runRepo).findOneBy({
      id: job.skillRunId,
    });
    const artifactName = run
      ? (getSkillForSourceKey(run.characterSourceKey)?.artifactName ?? '文件')
      : '文件';
    if (run && run.status !== 'completed' && run.status !== 'cancelled') {
      run.status = 'failed';
      run.errorMessage = reason.slice(0, 500);
      await this.runRepo.save(run);
    }

    try {
      const apology = this.messageRepo.create({
        id: `msg_${Date.now()}_skillfail_${randomUUID().slice(0, 8)}`,
        conversationId: job.conversationId,
        senderType: 'character',
        senderId: job.characterId,
        senderName: job.characterName,
        type: 'text',
        text: buildRenderFailedMessage(artifactName),
      });
      await this.messageRepo.save(apology);
      const conversation = await new TenantRepository(
        this.conversationRepo,
      ).findOneBy({ id: job.conversationId });
      if (conversation) {
        await this.conversationRepo.save({
          ...conversation,
          lastActivityAt: apology.createdAt ?? new Date(),
        });
      }
      this.chatService.invalidateConversationHistory(job.conversationId);
      this.chatGateway.emitThreadMessage(
        job.conversationId,
        this.toConversationMessage(apology, undefined, job.characterAvatar),
      );
    } catch (err) {
      this.logger.warn(
        `failed to post skill apology message: ${(err as Error).message}`,
      );
    }

    await this.markJobFailed(job.id, reason);
  }

  private async saveGeneratedFileAttachment(input: {
    buffer: Buffer;
    mimeType: string;
    ext: string;
    fileName: string;
  }): Promise<FileAttachment> {
    const extension = `.${input.ext.replace(/^\.+/, '')}`;
    const rawBase =
      path.basename(input.fileName?.trim() || '').replace(/\.[^.]+$/, '') ||
      'document';
    const displayName = `${rawBase}${extension}`;
    const storedFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeChatAttachmentFileName(rawBase)}${extension}`;
    const storageDir = resolvePrimaryChatAttachmentStorageDir();
    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, storedFileName), input.buffer);
    // 相对 URL（前端按当前 apiBaseUrl absolutize），与图片附件一致。
    return {
      kind: 'file',
      url: `/api/chat/attachments/${storedFileName}`,
      mimeType: input.mimeType || 'application/octet-stream',
      fileName: displayName,
      size: input.buffer.length,
    };
  }

  private toConversationMessage(
    entity: MessageEntity,
    attachment: FileAttachment | undefined,
    senderAvatar?: string | null,
  ): Message {
    return {
      id: entity.id,
      conversationId: entity.conversationId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderId: entity.senderId,
      senderName: entity.senderName,
      senderAvatar: senderAvatar?.trim() || undefined,
      type: entity.type as 'text' | 'file',
      text: entity.text,
      attachment,
      createdAt: entity.createdAt ?? new Date(),
    };
  }

  private async requeueStaleProcessingJobs() {
    const staleBefore = new Date(Date.now() - SKILL_JOB_PROCESSING_RETRY_MS);
    const staleJobs = await this.jobRepo.find({
      where: {
        status: 'processing',
        lastAttemptAt: LessThanOrEqual(staleBefore),
      },
      take: SKILL_JOB_BATCH_SIZE,
      order: { lastAttemptAt: 'ASC', executeAfter: 'ASC' },
    });
    if (!staleJobs.length) return;
    await this.jobRepo.save(
      staleJobs.map((job) => ({
        ...job,
        status: 'pending' as const,
        executeAfter: new Date(),
      })),
    );
  }

  private async markJobCompleted(
    jobId: string,
    artifactMessageId: string | null,
  ) {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job || job.status === 'completed' || job.status === 'cancelled') return;
    job.status = 'completed';
    job.artifactMessageId = artifactMessageId;
    job.completedAt = new Date();
    job.errorMessage = null;
    await this.jobRepo.save(job);
  }

  private async markJobFailed(jobId: string, errorMessage: string) {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job || job.status === 'completed' || job.status === 'cancelled') return;
    job.status = 'failed';
    job.errorMessage = errorMessage.slice(0, 1000);
    await this.jobRepo.save(job);
  }

  private parseInput(job: SkillArtifactJobEntity): SkillArtifactJobInput | null {
    try {
      return JSON.parse(job.inputPayload) as SkillArtifactJobInput;
    } catch {
      return null;
    }
  }
}
