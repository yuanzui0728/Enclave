// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { CharacterPageEntity } from '../entities/character-page.entity';
import { WikiFieldProtectionEntity } from '../entities/wiki-field-protection.entity';
import { WIKI_ROLE_RANK, rankOf } from '../guards/wiki-role.guard';
import { WIKI_FIELD_PROTECTION_SEEDS } from '../seed/field-protections.seed';

export type FieldPolicyMap = Map<string, string>; // fieldPath -> minRole

@Injectable()
export class WikiFieldProtectionService implements OnModuleInit {
  private readonly logger = new Logger(WikiFieldProtectionService.name);

  constructor(
    @InjectRepository(WikiFieldProtectionEntity)
    private readonly repo: Repository<WikiFieldProtectionEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const seed of WIKI_FIELD_PROTECTION_SEEDS) {
      const existing = await this.repo.findOne({
        where: {
          characterId: seed.characterId!,
          fieldPath: seed.fieldPath!,
        },
      });
      if (!existing) {
        await this.repo.save(this.repo.create(seed));
      }
    }
  }

  async list(): Promise<WikiFieldProtectionEntity[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async listForCharacter(
    characterId: string,
  ): Promise<WikiFieldProtectionEntity[]> {
    return this.repo.find({
      where: { characterId: In([characterId, '*']) },
      order: { createdAt: 'ASC' },
    });
  }

  async getEffectivePolicy(characterId: string): Promise<FieldPolicyMap> {
    const rows = await this.listForCharacter(characterId);
    const map: FieldPolicyMap = new Map();
    // Apply global '*' first, then character-specific to override.
    for (const row of rows) {
      if (row.characterId === '*') {
        map.set(row.fieldPath, row.minRoleToEdit);
      }
    }
    for (const row of rows) {
      if (row.characterId !== '*') {
        // character-specific takes precedence (last write wins, ordered by createdAt)
        map.set(row.fieldPath, row.minRoleToEdit);
      }
    }
    return map;
  }

  async assertCanEditPaths(
    user: AuthenticatedUser,
    characterId: string,
    changedPaths: string[],
  ): Promise<void> {
    if (changedPaths.length === 0) return;
    const policy = await this.getEffectivePolicy(characterId);
    if (policy.size === 0) return;
    const userRank = rankOf(user.role);
    for (const path of changedPaths) {
      const violated = matchProtectedPath(path, policy);
      if (!violated) continue;
      const minRank = rankOf(violated.minRole);
      if (userRank < minRank) {
        throw new AppError('WIKI_FORBIDDEN', {
          status: HttpStatus.FORBIDDEN,
          params: {
            reason: `字段 ${violated.protectedPath} 受保护，至少需要 ${violated.minRole} 权限`,
          },
          legacyMessage: `字段 ${violated.protectedPath} 受保护，至少需要 ${violated.minRole} 权限`,
        });
      }
    }
  }

  async create(
    input: Pick<
      WikiFieldProtectionEntity,
      'characterId' | 'fieldPath' | 'minRoleToEdit' | 'reason'
    > & { createdBy?: string | null },
  ): Promise<WikiFieldProtectionEntity> {
    // 2026-05-16 R2 走查发现：缺 minRoleToEdit 时入库直接 500（SQLite NOT NULL），
    // 缺 fieldPath 或非法 characterId（不是 '*' 也不是真词条）时静默写入"幽灵"策略。
    // 这里把校验前置，让前端拿到 400 而不是 500，并禁止指向不存在的词条。
    //
    // typeof 守：客户端传 {"characterId":{"a":1}} 时 (x ?? '').trim() 抛
    // TypeError → 500 漏 stack。非字符串当空字符串处理。
    const characterId =
      typeof input.characterId === 'string' ? input.characterId.trim() : '';
    const fieldPath =
      typeof input.fieldPath === 'string' ? input.fieldPath.trim() : '';
    const minRoleToEdit =
      typeof input.minRoleToEdit === 'string' ? input.minRoleToEdit.trim() : '';
    if (!characterId) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: { detail: 'characterId 不能为空（用 "*" 表示全局）' },
        legacyMessage: 'characterId 不能为空（用 "*" 表示全局）',
      });
    }
    if (!fieldPath) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: { detail: 'fieldPath 不能为空' },
        legacyMessage: 'fieldPath 不能为空',
      });
    }
    if (!minRoleToEdit || !(minRoleToEdit in WIKI_ROLE_RANK)) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: {
          detail:
            'minRoleToEdit 必须是 newcomer / autoconfirmed / patroller / admin 之一',
        },
        legacyMessage:
          'minRoleToEdit 必须是 newcomer / autoconfirmed / patroller / admin 之一',
      });
    }
    if (characterId !== '*') {
      const page = await this.pageRepo.findOne({ where: { characterId } });
      if (!page) {
        throw new AppError('WIKI_PAGE_NOT_FOUND', {
          status: HttpStatus.NOT_FOUND,
          legacyMessage: `角色 ${characterId} 不存在`,
        });
      }
    }
    // (characterId, fieldPath) 同一对不允许多条 —— effective 计算虽然会去重
    // 取最严格，但 admin /admin/protection 列表里会展示两条，没人能看明白
    // 哪条在生效。要改保护级别用 PATCH 现有那条，不要另开新条。
    const dup = await this.repo.findOne({
      where: { characterId, fieldPath },
    });
    if (dup) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.CONFLICT,
        params: {
          detail: `(${characterId}, ${fieldPath}) 已有保护策略，请直接修改现有那条`,
        },
        legacyMessage: `(${characterId}, ${fieldPath}) 已有保护策略，请直接修改现有那条`,
      });
    }
    return this.repo.save(
      this.repo.create({
        ...input,
        characterId,
        fieldPath,
        minRoleToEdit,
      }),
    );
  }

  async update(
    id: string,
    patch: Partial<WikiFieldProtectionEntity>,
  ): Promise<WikiFieldProtectionEntity> {
    // create() 校验过的字段在这里也得校验，否则 admin PATCH 一个非法
    // minRoleToEdit (e.g. "banana") 后整条策略变成"任何角色都不匹配"，
    // assertCanEditPaths 永远算不出最严格保护，全员 bypass。R3 走查发现。
    if (
      patch.minRoleToEdit !== undefined &&
      (typeof patch.minRoleToEdit !== 'string' ||
        !(patch.minRoleToEdit in WIKI_ROLE_RANK))
    ) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: {
          detail:
            'minRoleToEdit 必须是 newcomer / autoconfirmed / patroller / admin 之一',
        },
        legacyMessage:
          'minRoleToEdit 必须是 newcomer / autoconfirmed / patroller / admin 之一',
      });
    }
    if (
      patch.fieldPath !== undefined &&
      (typeof patch.fieldPath !== 'string' || !patch.fieldPath.trim())
    ) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: { detail: 'fieldPath 不能为空' },
        legacyMessage: 'fieldPath 不能为空',
      });
    }
    if (
      patch.characterId !== undefined &&
      (typeof patch.characterId !== 'string' || !patch.characterId.trim())
    ) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: { detail: 'characterId 不能为空（用 "*" 表示全局）' },
        legacyMessage: 'characterId 不能为空（用 "*" 表示全局）',
      });
    }
    await this.repo.update({ id }, patch);
    const next = await this.repo.findOne({ where: { id } });
    if (!next) throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '字段保护策略不存在',
      });
    return next;
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}

/**
 * 找出哪个保护路径应用于当前 changed path：
 *   - 完全相等
 *   - changed path 是被保护路径的子路径（即被保护路径是 prefix，且分隔点在边界）
 * 返回最严格匹配（minRank 最大）。
 */
function matchProtectedPath(
  changedPath: string,
  policy: FieldPolicyMap,
): { protectedPath: string; minRole: string } | null {
  let best: { protectedPath: string; minRole: string; rank: number } | null =
    null;
  for (const [protectedPath, minRole] of policy.entries()) {
    if (
      changedPath === protectedPath ||
      changedPath.startsWith(`${protectedPath}.`) ||
      protectedPath.startsWith(`${changedPath}.`)
    ) {
      const rank = rankOf(minRole);
      if (!best || rank > best.rank) {
        best = { protectedPath, minRole, rank };
      }
    }
  }
  return best ? { protectedPath: best.protectedPath, minRole: best.minRole } : null;
}
// i18n-ignore-end
