// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import type { CharacterBlueprintRecipeValue } from '../../characters/character-blueprint.types';
import type { WikiContentSnapshot } from '../entities/character-revision.entity';
import { CharacterRevisionEntity } from '../entities/character-revision.entity';
import {
  AbuseFilterEntity,
  type AbuseFilterAction,
  type AbuseFilterPattern,
  type AbuseFilterScope,
} from '../entities/abuse-filter.entity';
import { AbuseFilterHitEntity } from '../entities/abuse-filter-hit.entity';
import { ABUSE_FILTER_SEEDS } from '../seed/abuse-filters.seed';

export type AbuseFilterCheckInput = {
  user: AuthenticatedUser;
  characterId: string;
  contentSnapshot?: WikiContentSnapshot | null;
  recipeSnapshot?: CharacterBlueprintRecipeValue | null;
  beforeContent?: WikiContentSnapshot | null;
  beforeRecipe?: CharacterBlueprintRecipeValue | null;
  operation: string;
  isCreate?: boolean;
};

export type AbuseFilterCheckResult = {
  action: 'pass' | AbuseFilterAction;
  hits: Array<{
    filterId: string;
    filterName: string;
    actionTaken: AbuseFilterAction;
    matchedText: string;
  }>;
  warnings: string[];
};

const ACTION_ORDER: Record<AbuseFilterAction | 'pass', number> = {
  pass: 0,
  log: 1,
  warn: 2,
  tag_high_risk: 3,
  block: 4,
};

const VALID_ACTIONS: AbuseFilterAction[] = [
  'log',
  'warn',
  'block',
  'tag_high_risk',
];
const VALID_SCOPES: AbuseFilterScope[] = ['content', 'recipe', 'all'];
const VALID_SEVERITIES = ['low', 'medium', 'high'] as const;

// 校验 createFilter / updateFilter 传入的 pattern 形状。pattern 列是 simple-json，
// TypeORM 不会兜底类型检查；如果接受了字符串或缺 type 的对象，filter 入库后
// evaluatePattern() 的 switch 全都落到 default 永不命中——脏数据。
function assertValidFilterPattern(pattern: unknown): asserts pattern is AbuseFilterPattern {
  if (!pattern || typeof pattern !== 'object') {
    throw new AppError('WIKI_VALIDATION_FAILED', {
      status: HttpStatus.BAD_REQUEST,
      params: { detail: 'pattern 必须是对象，含 type 字段' },
      legacyMessage: 'pattern 必须是对象，含 type 字段',
    });
  }
  const type = (pattern as { type?: unknown }).type;
  switch (type) {
    case 'regex': {
      const regex = (pattern as { regex?: unknown }).regex;
      if (typeof regex !== 'string' || regex.length === 0) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          status: HttpStatus.BAD_REQUEST,
          params: { detail: 'regex pattern 缺少 regex 字段' },
          legacyMessage: 'regex pattern 缺少 regex 字段',
        });
      }
      try {
        new RegExp(regex, (pattern as { flags?: string }).flags ?? '');
      } catch (err) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          status: HttpStatus.BAD_REQUEST,
          params: { detail: `regex 非法：${(err as Error).message}` },
          legacyMessage: `regex 非法：${(err as Error).message}`,
        });
      }
      return;
    }
    case 'shrink': {
      const field = (pattern as { field?: unknown }).field;
      const threshold = (pattern as { threshold?: unknown }).threshold;
      if (typeof field !== 'string' || !field) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          status: HttpStatus.BAD_REQUEST,
          params: { detail: 'shrink pattern 缺少 field' },
          legacyMessage: 'shrink pattern 缺少 field',
        });
      }
      if (typeof threshold !== 'number' || threshold <= 0 || threshold > 1) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          status: HttpStatus.BAD_REQUEST,
          params: { detail: 'shrink pattern.threshold 必须 (0,1]' },
          legacyMessage: 'shrink pattern.threshold 必须 (0,1]',
        });
      }
      return;
    }
    case 'frequency': {
      const w = (pattern as { windowSec?: unknown }).windowSec;
      const m = (pattern as { maxEdits?: unknown }).maxEdits;
      if (typeof w !== 'number' || w <= 0 || typeof m !== 'number' || m <= 0) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          status: HttpStatus.BAD_REQUEST,
          params: { detail: 'frequency pattern 需正数 windowSec / maxEdits' },
          legacyMessage: 'frequency pattern 需正数 windowSec / maxEdits',
        });
      }
      return;
    }
    case 'link_flood': {
      const t = (pattern as { threshold?: unknown }).threshold;
      if (typeof t !== 'number' || t <= 0) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          status: HttpStatus.BAD_REQUEST,
          params: { detail: 'link_flood pattern.threshold 必须 > 0' },
          legacyMessage: 'link_flood pattern.threshold 必须 > 0',
        });
      }
      return;
    }
    case 'keyword_list': {
      const kws = (pattern as { keywords?: unknown }).keywords;
      if (!Array.isArray(kws) || kws.length === 0 || kws.some((k) => typeof k !== 'string' || !k)) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          status: HttpStatus.BAD_REQUEST,
          params: { detail: 'keyword_list pattern 需 keywords: string[]' },
          legacyMessage: 'keyword_list pattern 需 keywords: string[]',
        });
      }
      return;
    }
    default:
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: {
          detail: 'pattern.type 必须是 regex / shrink / frequency / link_flood / keyword_list',
        },
        legacyMessage:
          'pattern.type 必须是 regex / shrink / frequency / link_flood / keyword_list',
      });
  }
}

const DEFAULT_REGEX_FIELDS = [
  'content.name',
  'content.bio',
  'content.personality',
  'content.relationship',
  'recipe.identity.name',
  'recipe.identity.bio',
  'recipe.identity.background',
  'recipe.identity.motivation',
  'recipe.identity.worldview',
  'recipe.tone.emotionalTone',
];

@Injectable()
export class AbuseFilterService implements OnModuleInit {
  private readonly logger = new Logger(AbuseFilterService.name);
  private cache: AbuseFilterEntity[] = [];

  constructor(
    @InjectRepository(AbuseFilterEntity)
    private readonly filterRepo: Repository<AbuseFilterEntity>,
    @InjectRepository(AbuseFilterHitEntity)
    private readonly hitRepo: Repository<AbuseFilterHitEntity>,
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
    await this.refreshCache();
  }

  async refreshCache(): Promise<void> {
    this.cache = await this.filterRepo.find({ where: { enabled: true } });
  }

  async check(input: AbuseFilterCheckInput): Promise<AbuseFilterCheckResult> {
    const matches: Array<{
      filter: AbuseFilterEntity;
      matchedText: string;
    }> = [];

    for (const filter of this.cache) {
      if (!matchesScope(filter.scope, input)) continue;
      const matchedText = await this.evaluatePattern(filter.pattern, input);
      if (matchedText !== null) {
        matches.push({ filter, matchedText });
      }
    }

    if (matches.length === 0) {
      return { action: 'pass', hits: [], warnings: [] };
    }

    let topAction: AbuseFilterAction = 'log';
    for (const { filter } of matches) {
      if (ACTION_ORDER[filter.action] > ACTION_ORDER[topAction]) {
        topAction = filter.action;
      }
    }

    const hits = matches.map(({ filter, matchedText }) => ({
      filterId: filter.id,
      filterName: filter.name,
      actionTaken: filter.action,
      matchedText: matchedText.slice(0, 500),
    }));

    const warnings = matches
      .filter(({ filter }) => filter.action === 'warn')
      .map(({ filter }) => `命中过滤器 [${filter.name}]：${filter.description}`);

    // Persist hits + bump filter counters (best-effort, don't block on write).
    try {
      for (const { filter, matchedText } of matches) {
        await this.hitRepo.save(
          this.hitRepo.create({
            filterId: filter.id,
            userId: input.user.id,
            characterId: input.characterId ?? null,
            matchedText: matchedText.slice(0, 500),
            actionTaken: filter.action,
            operation: input.operation,
          }),
        );
        await this.filterRepo.update(
          { id: filter.id },
          {
            hitCount: filter.hitCount + 1,
            lastHitAt: new Date(),
          },
        );
        filter.hitCount += 1;
        filter.lastHitAt = new Date();
      }
    } catch (err) {
      this.logger.warn(
        `Failed to persist abuse filter hit: ${(err as Error).message}`,
      );
    }

    if (topAction === 'block') {
      throw new AppError('WIKI_ABUSE_FILTER_TRIGGERED', {
        status: HttpStatus.FORBIDDEN,
        params: {
          filter: matches[0]?.filter.name ?? 'abuse_filter',
          hitCount: hits.length,
        },
        legacyMessage: `编辑被反破坏过滤器拦截：${matches[0]?.filter.name ?? 'abuse_filter'}`,
      });
    }

    return { action: topAction, hits, warnings };
  }

  /**
   * Returns matched text on hit, or null if no match.
   * Public for testability.
   */
  async evaluatePattern(
    pattern: AbuseFilterPattern,
    input: AbuseFilterCheckInput,
  ): Promise<string | null> {
    switch (pattern.type) {
      case 'regex': {
        const fields = pattern.fields ?? DEFAULT_REGEX_FIELDS;
        const re = new RegExp(pattern.regex, pattern.flags ?? 'i');
        for (const path of fields) {
          const value = readPath(input, path);
          if (typeof value === 'string' && re.test(value)) {
            return value.slice(0, 500);
          }
        }
        return null;
      }
      case 'shrink': {
        const before = readPath(input, `before.content.${pattern.field}`);
        const after = readPath(input, `content.${pattern.field}`);
        if (typeof before !== 'string' || typeof after !== 'string') return null;
        const beforeLen = before.length;
        const afterLen = after.length;
        if (beforeLen === 0) return null;
        const ratio = (beforeLen - afterLen) / beforeLen;
        if (ratio > pattern.threshold) {
          return `${pattern.field}: ${beforeLen} -> ${afterLen} (shrink ${(
            ratio * 100
          ).toFixed(0)}%)`;
        }
        return null;
      }
      case 'frequency': {
        if (!input.user?.id) return null;
        const cutoff = new Date(Date.now() - pattern.windowSec * 1000);
        const count = await this.revisionRepo.count({
          where: {
            editorUserId: input.user.id,
            createdAt: MoreThan(cutoff) as unknown as Date,
          },
        });
        if (count >= pattern.maxEdits) {
          return `frequency: ${count} edits in last ${pattern.windowSec}s`;
        }
        return null;
      }
      case 'link_flood': {
        const text = collectAllText(input);
        const matches = text.match(/https?:\/\//gi);
        if (matches && matches.length > pattern.threshold) {
          return `link_flood: ${matches.length} links`;
        }
        return null;
      }
      case 'keyword_list': {
        const text = collectAllText(input);
        const haystack = pattern.caseSensitive ? text : text.toLowerCase();
        for (const kw of pattern.keywords) {
          const needle = pattern.caseSensitive ? kw : kw.toLowerCase();
          if (haystack.includes(needle)) {
            return `keyword: ${kw}`;
          }
        }
        return null;
      }
      default:
        return null;
    }
  }

  // CRUD for admin

  async listFilters(): Promise<AbuseFilterEntity[]> {
    return this.filterRepo.find({ order: { createdAt: 'ASC' } });
  }

  async getFilter(id: string): Promise<AbuseFilterEntity> {
    const f = await this.filterRepo.findOne({ where: { id } });
    if (!f) throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '过滤器不存在',
      });
    return f;
  }

  async createFilter(
    input: Pick<
      AbuseFilterEntity,
      | 'name'
      | 'description'
      | 'enabled'
      | 'pattern'
      | 'scope'
      | 'action'
      | 'severity'
    > & { createdBy?: string | null },
  ): Promise<AbuseFilterEntity> {
    this.assertValidFilterShape(input);
    const created = this.filterRepo.create(input);
    const saved = await this.filterRepo.save(created);
    await this.refreshCache();
    return saved;
  }

  async updateFilter(
    id: string,
    patch: Partial<AbuseFilterEntity>,
  ): Promise<AbuseFilterEntity> {
    this.assertValidFilterShape(patch, { partial: true });
    await this.filterRepo.update({ id }, patch);
    await this.refreshCache();
    return this.getFilter(id);
  }

  // 校验 action / scope / severity / pattern 都是合法枚举。partial=true 时
  // 允许字段缺省（PATCH 半更新场景）。
  private assertValidFilterShape(
    input: Partial<
      Pick<
        AbuseFilterEntity,
        'name' | 'pattern' | 'scope' | 'action' | 'severity'
      >
    >,
    opts: { partial?: boolean } = {},
  ): void {
    const { partial } = opts;
    if (!partial) {
      // typeof 守：客户端传 {"name":{"a":1}} 时 (x ?? '').trim() 抛 TypeError → 500。
      const name =
        typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) {
        throw new AppError('WIKI_VALIDATION_FAILED', {
          status: HttpStatus.BAD_REQUEST,
          params: { detail: 'name 不能为空' },
          legacyMessage: 'name 不能为空',
        });
      }
    }
    if (input.action !== undefined && !VALID_ACTIONS.includes(input.action)) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: {
          detail: `action 必须是 ${VALID_ACTIONS.join(' / ')}`,
        },
        legacyMessage: `action 必须是 ${VALID_ACTIONS.join(' / ')}`,
      });
    }
    if (input.scope !== undefined && !VALID_SCOPES.includes(input.scope)) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: {
          detail: `scope 必须是 ${VALID_SCOPES.join(' / ')}`,
        },
        legacyMessage: `scope 必须是 ${VALID_SCOPES.join(' / ')}`,
      });
    }
    if (
      input.severity !== undefined &&
      !(VALID_SEVERITIES as readonly string[]).includes(input.severity)
    ) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        status: HttpStatus.BAD_REQUEST,
        params: {
          detail: `severity 必须是 ${VALID_SEVERITIES.join(' / ')}`,
        },
        legacyMessage: `severity 必须是 ${VALID_SEVERITIES.join(' / ')}`,
      });
    }
    if (!partial || input.pattern !== undefined) {
      assertValidFilterPattern(input.pattern);
    }
  }

  async deleteFilter(id: string): Promise<void> {
    await this.filterRepo.delete({ id });
    await this.refreshCache();
  }

  async listHits(opts: {
    filterId?: string;
    userId?: string;
    limit?: number;
  }): Promise<AbuseFilterHitEntity[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const where: Record<string, unknown> = {};
    if (opts.filterId) where.filterId = opts.filterId;
    if (opts.userId) where.userId = opts.userId;
    return this.hitRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async deleteHitsBefore(date: Date): Promise<number> {
    const result = await this.hitRepo.delete({
      createdAt: LessThan(date) as unknown as Date,
    });
    return result.affected ?? 0;
  }

  private async seedDefaults(): Promise<void> {
    for (const seed of ABUSE_FILTER_SEEDS) {
      const existing = await this.filterRepo.findOne({
        where: { name: seed.name },
      });
      if (!existing) {
        await this.filterRepo.save(this.filterRepo.create(seed));
      }
    }
  }
}

function matchesScope(
  scope: AbuseFilterScope,
  input: AbuseFilterCheckInput,
): boolean {
  if (scope === 'all') return true;
  if (scope === 'content') return Boolean(input.contentSnapshot);
  if (scope === 'recipe') return Boolean(input.recipeSnapshot);
  return true;
}

function readPath(input: AbuseFilterCheckInput, path: string): unknown {
  const segments = path.split('.');
  let cursor: unknown = input;
  let head = segments[0];
  if (head === 'content') {
    cursor = input.contentSnapshot;
    segments.shift();
  } else if (head === 'recipe') {
    cursor = input.recipeSnapshot;
    segments.shift();
  } else if (head === 'before') {
    segments.shift();
    head = segments[0];
    if (head === 'content') {
      cursor = input.beforeContent;
      segments.shift();
    } else if (head === 'recipe') {
      cursor = input.beforeRecipe;
      segments.shift();
    }
  }
  for (const segment of segments) {
    if (cursor && typeof cursor === 'object') {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function collectAllText(input: AbuseFilterCheckInput): string {
  const parts: string[] = [];
  const c = input.contentSnapshot;
  if (c) {
    parts.push(c.name, c.bio, c.personality ?? '', c.relationship);
    if (c.expertDomains) parts.push(...c.expertDomains);
    if (c.triggerScenes) parts.push(...c.triggerScenes);
  }
  const r = input.recipeSnapshot;
  if (r) {
    parts.push(
      r.identity?.name ?? '',
      r.identity?.bio ?? '',
      r.identity?.background ?? '',
      r.identity?.motivation ?? '',
      r.identity?.worldview ?? '',
      r.tone?.emotionalTone ?? '',
      r.tone?.workStyle ?? '',
      r.tone?.socialStyle ?? '',
      r.tone?.coreDirective ?? '',
      r.tone?.basePrompt ?? '',
      r.tone?.systemPrompt ?? '',
      r.prompting?.coreLogic ?? '',
      ...Object.values(r.prompting?.scenePrompts ?? {}),
      r.memorySeed?.memorySummary ?? '',
      r.memorySeed?.coreMemory ?? '',
    );
  }
  return parts.filter((p) => typeof p === 'string').join('\n');
}
// i18n-ignore-end
