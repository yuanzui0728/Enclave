// i18n-ignore-start: backend service, errors are domain codes (no user-facing zh strings).
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterDraftEntity } from '../entities/character-draft.entity';
import type { PrivateCharacterDto } from './wiki-private-character.service';

export type DraftKind = 'private' | 'world';

export interface DraftSummary {
  id: string;
  kind: DraftKind;
  name: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftDetail extends DraftSummary {
  payload: PrivateCharacterDto;
}

@Injectable()
export class CharacterDraftService {
  private readonly logger = new Logger(CharacterDraftService.name);

  constructor(
    @InjectRepository(CharacterDraftEntity)
    private readonly repo: Repository<CharacterDraftEntity>,
  ) {}

  async createFromAi(
    ownerUserId: string,
    kind: DraftKind,
    payload: PrivateCharacterDto,
  ): Promise<DraftDetail> {
    const row = this.repo.create({
      ownerUserId,
      kind,
      source: 'ai_one_click',
      payload: JSON.stringify(payload ?? {}),
    });
    const saved = await this.repo.save(row);
    return this.toDetail(saved);
  }

  async listByOwner(ownerUserId: string): Promise<DraftSummary[]> {
    const rows = await this.repo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getById(ownerUserId: string, id: string): Promise<DraftDetail> {
    const row = await this.repo.findOne({ where: { id, ownerUserId } });
    if (!row) throw new NotFoundException('草稿不存在');
    return this.toDetail(row);
  }

  async delete(ownerUserId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, ownerUserId });
    if (!result.affected) throw new NotFoundException('草稿不存在或已被删除');
  }

  private parsePayload(raw: string): PrivateCharacterDto {
    try {
      const parsed = JSON.parse(raw ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as PrivateCharacterDto;
      }
    } catch (err) {
      this.logger.warn(
        `failed to parse draft payload: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { name: '' };
  }

  private extractName(payload: PrivateCharacterDto): string {
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    return name;
  }

  private toSummary(row: CharacterDraftEntity): DraftSummary {
    const payload = this.parsePayload(row.payload);
    return {
      id: row.id,
      kind: row.kind,
      name: this.extractName(payload),
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: CharacterDraftEntity): DraftDetail {
    const payload = this.parsePayload(row.payload);
    return {
      id: row.id,
      kind: row.kind,
      name: this.extractName(payload),
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      payload,
    };
  }
}
// i18n-ignore-end
