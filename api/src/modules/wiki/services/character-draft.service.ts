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
    // 列表只展示 name，不需要 payload。早先用 repo.find() = SELECT *，会把每行可能
    // 很大的 AI 生成 payload（recipe + profile，单条可达几十 KB）整列读进内存再
    // JSON.parse 仅为取一个 name —— 草稿多的用户每次开列表都白读/白解析一大坨。
    // 改成只 select 轻量列 + 在 SQLite 里用 json_extract 取 name（与私有角色列表
    // 轻量化 6657d12ef 同思路）。
    //
    // json_valid 兜底：payload 理论上恒为合法 JSON（createFromAi 只走
    // JSON.stringify），但若被外部篡改成非法 JSON，裸 json_extract 会抛
    // "malformed JSON" 直接拖垮整条列表查询；包一层 json_valid 退化成 NULL，
    // 行为与旧 parsePayload 的 try/catch 一致（解析失败 → name 空串）。
    const { entities, raw } = await this.repo
      .createQueryBuilder('d')
      .select(['d.id', 'd.kind', 'd.source', 'd.createdAt', 'd.updatedAt'])
      .addSelect(
        "CASE WHEN json_valid(d.payload) THEN json_extract(d.payload, '$.name') ELSE NULL END",
        'draftName',
      )
      .where('d.ownerUserId = :ownerUserId', { ownerUserId })
      .orderBy('d.updatedAt', 'DESC')
      .getRawAndEntities();

    return entities.map((row, i) => {
      const rawName = (raw[i] as { draftName?: unknown } | undefined)?.draftName;
      return {
        id: row.id,
        kind: row.kind,
        name: typeof rawName === 'string' ? rawName.trim() : '',
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
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
