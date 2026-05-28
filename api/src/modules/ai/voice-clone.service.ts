import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../common/app-error.exception';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { VoiceCloneEntity } from './voice-clone.entity';

export type VoiceCloneSummary = {
  id: string;
  displayName: string;
  // 仅 ready 的克隆有可用 voice_id；pending/failed 为 null。
  voiceId: string | null;
  status: VoiceCloneEntity['status'];
};

// MiniMax voice_id 约束：字母开头、字母数字、≥8 位。
function generateVoiceId(): string {
  return `vc${randomUUID().replace(/-/g, '')}`.slice(0, 24);
}

@Injectable()
export class VoiceCloneService {
  private readonly logger = new Logger(VoiceCloneService.name);

  constructor(
    @InjectRepository(VoiceCloneEntity)
    private readonly repo: Repository<VoiceCloneEntity>,
    private readonly orchestrator: AiOrchestratorService,
  ) {}

  private get scopedRepo(): TenantRepository<VoiceCloneEntity> {
    return new TenantRepository(this.repo);
  }

  async listForOwner(): Promise<VoiceCloneSummary[]> {
    const rows = await this.scopedRepo.find({ order: { createdAt: 'DESC' } });
    return rows.map((r) => this.toSummary(r));
  }

  /** 仅 ready 的克隆音色（供 GET /ai/voices 合并到候选列表）。 */
  async listReadyForOwner(): Promise<Array<{ id: string; displayName: string }>> {
    let rows: VoiceCloneEntity[];
    try {
      rows = await this.scopedRepo.find({ order: { createdAt: 'DESC' } });
    } catch (error) {
      // voice_clones 表缺失（shared 模式部署新码但迁移还没跑）时，不要让
      // /ai/voices 整个 500——降级成「只有预设音色」。
      this.logger.warn('listReadyForOwner failed (table missing?)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
    return rows
      .filter((r) => r.status === 'ready' && !!r.minimaxVoiceId)
      .map((r) => ({ id: r.minimaxVoiceId as string, displayName: r.displayName }));
  }

  async createClone(input: {
    displayName: string;
    buffer: Buffer;
    mime: string;
    fileName: string;
  }): Promise<VoiceCloneSummary> {
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new AppError('VOICE_CLONE_NAME_REQUIRED', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '请给克隆的音色起个名字。',
      });
    }
    const voiceId = generateVoiceId();
    // 先落 pending 行（owner-scoped 写盖章），克隆是耗时+计费操作，留痕便于排查。
    const created = await this.scopedRepo.save(
      this.repo.create({ displayName, status: 'pending', minimaxVoiceId: voiceId }),
    );
    try {
      const { fileId } = await this.orchestrator.cloneVoiceFromSample({
        buffer: input.buffer,
        mime: input.mime,
        fileName: input.fileName,
        voiceId,
      });
      created.status = 'ready';
      created.sampleFileId = fileId;
      created.failReason = null;
      const ready = await this.scopedRepo.save(created);
      return this.toSummary(ready);
    } catch (error) {
      created.status = 'failed';
      created.failReason =
        error instanceof Error ? error.message.slice(0, 500) : 'clone failed';
      await this.scopedRepo.save(created).catch(() => {
        // 落 failed 状态本身失败不应淹没原始克隆错误。
      });
      this.logger.warn('voice clone failed', {
        displayName,
        error: created.failReason,
      });
      throw error;
    }
  }

  async deleteClone(id: string): Promise<void> {
    const existing = await this.scopedRepo.findOne({ where: { id } });
    if (!existing) {
      throw new AppError('VOICE_CLONE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '没有找到该克隆音色。',
      });
    }
    await this.repo.remove(existing);
  }

  private toSummary(row: VoiceCloneEntity): VoiceCloneSummary {
    return {
      id: row.id,
      displayName: row.displayName,
      voiceId: row.status === 'ready' ? (row.minimaxVoiceId ?? null) : null,
      status: row.status,
    };
  }
}
