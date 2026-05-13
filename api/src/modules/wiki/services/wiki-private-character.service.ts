import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPrivateCharacterEntity } from '../entities/user-private-character.entity';
import type { CharacterBlueprintRecipeValue } from '../../characters/character-blueprint.types';
import type { PersonalityProfile } from '../../ai/ai.types';

export const PRIVATE_CHARACTER_EXPORT_SCHEMA =
  'yinjie-private-character/v1' as const;

export type PrivateCharacterDto = {
  name: string;
  avatar?: string;
  bio?: string;
  personality?: string | null;
  relationship?: string;
  relationshipType?: string;
  expertDomains?: string[];
  triggerScenes?: string[] | null;
  recipe?: CharacterBlueprintRecipeValue | null;
  profile?: PersonalityProfile | null;
};

export type PrivateCharacterExportBundle = {
  $schema: typeof PRIVATE_CHARACTER_EXPORT_SCHEMA;
  name: string;
  avatar: string;
  bio: string;
  personality?: string | null;
  relationship: string;
  relationshipType: string;
  expertDomains: string[];
  triggerScenes?: string[] | null;
  recipe?: CharacterBlueprintRecipeValue | null;
  profile?: PersonalityProfile | null;
  meta: {
    exportedAt: string;
    exportedBy: string;
    version: 1;
  };
};

@Injectable()
export class WikiPrivateCharacterService {
  constructor(
    @InjectRepository(UserPrivateCharacterEntity)
    private readonly repo: Repository<UserPrivateCharacterEntity>,
  ) {}

  listForOwner(ownerUserId: string): Promise<UserPrivateCharacterEntity[]> {
    return this.repo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getById(
    ownerUserId: string,
    id: string,
  ): Promise<UserPrivateCharacterEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('私有角色不存在');
    if (row.ownerUserId !== ownerUserId) {
      throw new ForbiddenException('无权访问该私有角色');
    }
    return row;
  }

  async create(
    ownerUserId: string,
    dto: PrivateCharacterDto,
  ): Promise<UserPrivateCharacterEntity> {
    return this.upsertByName(ownerUserId, dto);
  }

  async update(
    ownerUserId: string,
    id: string,
    dto: PrivateCharacterDto,
  ): Promise<UserPrivateCharacterEntity> {
    const existing = await this.getById(ownerUserId, id);
    const trimmedName = (dto.name ?? existing.name).trim();
    if (!trimmedName) {
      throw new NotFoundException('角色名不能为空');
    }
    // 改名时若与另一行同名 → 拒绝（避免无声丢数据）
    if (trimmedName !== existing.name) {
      const clash = await this.repo.findOne({
        where: { ownerUserId, name: trimmedName },
      });
      if (clash && clash.id !== id) {
        throw new ForbiddenException(
          `已存在同名私有角色 "${trimmedName}"，请改名后再保存`,
        );
      }
    }
    this.applyDto(existing, { ...dto, name: trimmedName });
    return this.repo.save(existing);
  }

  async delete(ownerUserId: string, id: string): Promise<void> {
    const existing = await this.getById(ownerUserId, id);
    await this.repo.delete({ id: existing.id });
  }

  /** 同名（trim 后大小写敏感）→ 覆盖；无则新建。 */
  async upsertByName(
    ownerUserId: string,
    dto: PrivateCharacterDto,
  ): Promise<UserPrivateCharacterEntity> {
    const trimmedName = (dto.name ?? '').trim();
    if (!trimmedName) {
      throw new NotFoundException('角色名不能为空');
    }
    const existing = await this.repo.findOne({
      where: { ownerUserId, name: trimmedName },
    });
    if (existing) {
      this.applyDto(existing, { ...dto, name: trimmedName });
      return this.repo.save(existing);
    }
    const created = this.repo.create({ ownerUserId, name: trimmedName });
    this.applyDto(created, { ...dto, name: trimmedName });
    return this.repo.save(created);
  }

  toExportBundle(
    record: UserPrivateCharacterEntity,
    exportedBy: string,
  ): PrivateCharacterExportBundle {
    return {
      $schema: PRIVATE_CHARACTER_EXPORT_SCHEMA,
      name: record.name,
      avatar: record.avatar,
      bio: record.bio,
      personality: record.personality ?? null,
      relationship: record.relationship,
      relationshipType: record.relationshipType,
      expertDomains: record.expertDomains ?? [],
      triggerScenes: record.triggerScenes ?? null,
      recipe: record.recipe ?? null,
      profile: record.profile ?? null,
      meta: {
        exportedAt: new Date().toISOString(),
        exportedBy,
        version: 1,
      },
    };
  }

  /** 解析上传的 JSON：兼容裸 DTO（无 $schema）与 v1 bundle。 */
  parseImportBundle(payload: unknown): PrivateCharacterDto {
    if (!payload || typeof payload !== 'object') {
      throw new NotFoundException('文件内容不是合法的角色 JSON');
    }
    const p = payload as Record<string, unknown>;
    const schema = typeof p.$schema === 'string' ? p.$schema : null;
    if (schema && schema !== PRIVATE_CHARACTER_EXPORT_SCHEMA) {
      throw new NotFoundException(`不支持的 schema：${schema}`);
    }
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!name) {
      throw new NotFoundException('文件里没有有效的 name 字段');
    }
    return {
      name,
      avatar: typeof p.avatar === 'string' ? p.avatar : '',
      bio: typeof p.bio === 'string' ? p.bio : '',
      personality: typeof p.personality === 'string' ? p.personality : null,
      relationship: typeof p.relationship === 'string' ? p.relationship : '',
      relationshipType:
        typeof p.relationshipType === 'string' ? p.relationshipType : 'friend',
      expertDomains: Array.isArray(p.expertDomains)
        ? p.expertDomains.filter((x): x is string => typeof x === 'string')
        : [],
      triggerScenes: Array.isArray(p.triggerScenes)
        ? p.triggerScenes.filter((x): x is string => typeof x === 'string')
        : null,
      recipe:
        p.recipe && typeof p.recipe === 'object'
          ? (p.recipe as CharacterBlueprintRecipeValue)
          : null,
      profile:
        p.profile && typeof p.profile === 'object'
          ? (p.profile as PersonalityProfile)
          : null,
    };
  }

  private applyDto(
    target: UserPrivateCharacterEntity,
    dto: PrivateCharacterDto,
  ): void {
    if (typeof dto.name === 'string') target.name = dto.name.trim();
    if (typeof dto.avatar === 'string') target.avatar = dto.avatar;
    if (typeof dto.bio === 'string') target.bio = dto.bio;
    if (dto.personality !== undefined) {
      target.personality = dto.personality ?? null;
    }
    if (typeof dto.relationship === 'string') {
      target.relationship = dto.relationship;
    }
    if (typeof dto.relationshipType === 'string') {
      target.relationshipType = dto.relationshipType;
    }
    if (Array.isArray(dto.expertDomains)) {
      target.expertDomains = dto.expertDomains;
    }
    if (dto.triggerScenes !== undefined) {
      target.triggerScenes = dto.triggerScenes ?? null;
    }
    if (dto.recipe !== undefined) target.recipe = dto.recipe ?? null;
    if (dto.profile !== undefined) target.profile = dto.profile ?? null;
  }
}
