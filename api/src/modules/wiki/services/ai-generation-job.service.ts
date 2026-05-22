// i18n-ignore-start: backend service, errors are domain codes (no user-facing zh strings).
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AiGenerationJobEntity } from '../entities/ai-generation-job.entity';
import type { PrivateCharacterDto } from './wiki-private-character.service';
import type { SectionKey } from './wiki-private-character-ai.prompts';
import type { AiGeneratedDraft } from './wiki-private-character-ai.service';

export type JobScope = 'private_create' | 'private_edit' | 'world_edit';

export interface JobView {
  id: string;
  ownerUserId: string;
  scope: JobScope;
  section: SectionKey;
  status: 'generating' | 'ready' | 'failed';
  result: AiGeneratedDraft | null;
  errorMessage: string | null;
  linkedDraftId: string | null;
  aiStartedAt: string;
  updatedAt: string;
}

@Injectable()
export class AiGenerationJobService {
  private readonly logger = new Logger(AiGenerationJobService.name);

  constructor(
    @InjectRepository(AiGenerationJobEntity)
    private readonly repo: Repository<AiGenerationJobEntity>,
  ) {}

  /**
   * 新建 generating job。controller 在同步阶段调；setImmediate 跑 runJobInBackground。
   */
  async enqueue(input: {
    ownerUserId: string;
    scope: JobScope;
    section: SectionKey;
    optimize: boolean;
    currentDraft: PrivateCharacterDto;
    targetCharacterId?: string | null;
  }): Promise<JobView> {
    const row = this.repo.create({
      ownerUserId: input.ownerUserId,
      scope: input.scope,
      targetCharacterId: input.targetCharacterId ?? null,
      section: input.section,
      optimize: input.optimize === true,
      currentDraftSnapshot: JSON.stringify(input.currentDraft ?? {}),
      status: 'generating',
      resultJson: null,
      linkedDraftId: null,
      errorMessage: null,
      aiStartedAt: new Date(),
    });
    const saved = await this.repo.save(row);
    return this.toView(saved);
  }

  /**
   * 给 runJobInBackground 用：只按 id 读，无 owner 校验（后台执行者已经过认证）。
   */
  async getByIdInternal(id: string): Promise<AiGenerationJobEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * 给前端 GET 端点用：按 ownerUserId 校验，越权返回 NotFound（不泄露存在性）。
   */
  async getViewForOwner(ownerUserId: string, id: string): Promise<JobView> {
    const row = await this.repo.findOne({ where: { id, ownerUserId } });
    if (!row) throw new NotFoundException('生成任务不存在');
    return this.toView(row);
  }

  async markReady(
    id: string,
    result: AiGeneratedDraft,
    linkedDraftId: string | null,
  ): Promise<void> {
    await this.repo.update(
      { id },
      {
        status: 'ready',
        resultJson: JSON.stringify(result ?? {}),
        linkedDraftId,
        errorMessage: null,
      },
    );
  }

  async markFailed(id: string, message: string): Promise<void> {
    // text 列不限长但留个保底，避免 OOM 级 stack 全塞库。
    const trimmed = message.length > 2000 ? message.slice(0, 2000) : message;
    await this.repo.update(
      { id },
      {
        status: 'failed',
        errorMessage: trimmed,
      },
    );
  }

  /**
   * sweeper 调：扫"超过 olderThanMs 还卡在 generating"的 job。
   */
  async listStaleGenerating(
    olderThanMs: number,
  ): Promise<AiGenerationJobEntity[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return this.repo.find({
      where: { status: 'generating', aiStartedAt: LessThan(cutoff) },
      take: 100,
    });
  }

  private parseResult(raw: string | null): AiGeneratedDraft | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as AiGeneratedDraft;
      }
    } catch (err) {
      this.logger.warn(
        `failed to parse job result: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }

  private toView(row: AiGenerationJobEntity): JobView {
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      scope: row.scope,
      section: row.section,
      status: row.status,
      result: this.parseResult(row.resultJson),
      errorMessage: row.errorMessage,
      linkedDraftId: row.linkedDraftId,
      aiStartedAt: row.aiStartedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
// i18n-ignore-end
