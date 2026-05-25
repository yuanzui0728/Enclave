import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterEntity } from '../../characters/character.entity';
import { CharacterBlueprintService } from '../../characters/character-blueprint.service';
import type { CharacterBlueprintRecipeValue } from '../../characters/character-blueprint.types';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { CharacterPageEntity } from '../entities/character-page.entity';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  CharacterRevisionEntity,
  type WikiContentSnapshot,
} from '../entities/character-revision.entity';
import { rankOf } from '../guards/wiki-role.guard';
import {
  WIKI_CONTENT_FIELDS,
  type WikiContentField,
  diffPaths,
  snapshotFromCharacter,
} from '../wiki.types';

export type DriftReport = {
  hasDrift: boolean;
  contentDrift: WikiContentField[];
  recipeDrift: string[];
  source: 'admin_override' | 'unknown' | 'none';
};

export type WikiPageView = {
  characterId: string;
  page: CharacterPageEntity;
  currentRevision: CharacterRevisionEntity | null;
  stableRevision: CharacterRevisionEntity | null;
  latestRevision: CharacterRevisionEntity | null;
  content: WikiContentSnapshot;
  visibleContent: WikiContentSnapshot;
  recipe: CharacterBlueprintRecipeValue | null;
  // 社交参数住在 CharacterEntity 列上（不进 revision 快照 / recipe），阅读页要展示
  // 真实值就得在这里 surface 出来；character 为 null 时回落实体默认值。
  socialOpenness: string;
  proactiveBrowseChance: number;
  intimacyLevel: number;
  pendingRevision: CharacterRevisionEntity | null;
  pendingRevisions: CharacterRevisionEntity[];
  viewMode: 'stable' | 'current';
  viewerCanSeeCurrent: boolean;
  drift: DriftReport;
  exists: boolean;
};

type ListPagesRow = {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  relationship: string;
  relationshipType: string;
  sourceType: string;
  lifecycleStatus: string;
  protectionLevel: string;
};

// expertDomains 列是 simple-json；getRawMany 拿到的是未经实体水合的原始 JSON
// 字符串。脏数据（非数组 / 非法 JSON / null）一律退化成 []，绝不让搜索因一行
// 坏 expertDomains 抛错。
function parseExpertDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is string => typeof d === 'string' && d.length > 0);
  } catch {
    return [];
  }
}

// 截出一段以首个命中关键词为中心的性格摘要（≤120 字），让"只命中性格"的结果在卡片
// 上有可见依据，同时不把整段 personality（可能上千字）全量下发。窗口前后加省略号
// 标明是节选。无命中（理论上不会进来）退回开头 120 字。
function personalitySnippet(text: string, lowerTerms: string[]): string {
  if (!text) return '';
  const MAX = 120;
  if (text.length <= MAX) return text;
  const lower = text.toLowerCase();
  let idx = -1;
  for (const term of lowerTerms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0) return text.slice(0, MAX) + '…';
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, start + MAX);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

@Injectable()
export class WikiPageService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
    private readonly blueprints: CharacterBlueprintService,
  ) {}

  // listPages 是 wiki 首页唯一阻塞 API，三次全表扫 + 内存 sort。
  // 加 60s TTL 进程内缓存：冷启动一次后，二次访问 RTT 从几百 ms 降到 <10 ms。
  // 写路径都要主动 invalidate；TTL 是兜底，最坏陈旧 60s 可接受。
  private static readonly LIST_PAGES_TTL_MS = 60_000;
  private listPagesCache: { value: ListPagesRow[]; expiresAt: number } | null = null;

  invalidateListPagesCache(): void {
    this.listPagesCache = null;
  }

  async getOrInitPage(characterId: string): Promise<CharacterPageEntity> {
    let page = await this.pageRepo.findOne({ where: { characterId } });
    if (page) return page;
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: `角色 ${characterId} 不存在`,
      });
    }
    page = this.pageRepo.create({
      characterId,
      title: character.name,
      currentRevisionId: null,
      latestRevisionId: null,
      lifecycleStatus: 'active',
      reviewPolicy: 'open',
      protectionLevel: character.sourceType === 'ai_generated' ? 'semi' : 'none',
      isPatrolled: false,
      watcherCount: 0,
      editCount: 0,
      isDeleted: false,
    });
    const saved = await this.pageRepo.save(page);
    this.invalidateListPagesCache();
    return saved;
  }

  async getPageView(
    characterId: string,
    input: { view?: 'stable' | 'current'; user?: AuthenticatedUser } = {},
  ): Promise<WikiPageView> {
    // character / page 两条查询互不依赖，并行发；角色详情是 wiki 最热路径。
    const [character, existingPage] = await Promise.all([
      this.characterRepo.findOne({ where: { id: characterId } }),
      this.pageRepo.findOne({ where: { characterId } }),
    ]);
    if (!character && !existingPage) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: `角色 ${characterId} 不存在`,
      });
    }
    // 复用上面已查出的 existingPage：原写法 character 存在时无条件调
    // getOrInitPage，而它内部又 pageRepo.findOne({characterId}) 一次，等于每次
    // 详情访问都对 page 表查两遍同样的行。existingPage 命中直接用；只有 page
    // 行还不存在（首次访问某个 world 同步过来的角色）才走 getOrInitPage 建行，
    // 此时 existingPage 必为 null 且 character 必存在（否则上面已抛 404）。
    const page = existingPage ?? (await this.getOrInitPage(characterId));
    let stableRevision: CharacterRevisionEntity | null = null;
    if (page.currentRevisionId) {
      stableRevision = await this.revisionRepo.findOne({
        where: { id: page.currentRevisionId },
      });
    }
    let latestRevision: CharacterRevisionEntity | null = null;
    if (page.latestRevisionId) {
      latestRevision = await this.revisionRepo.findOne({
        where: { id: page.latestRevisionId },
      });
    }
    const pendingRevisions = await this.revisionRepo.find({
      where: { characterId, status: 'pending' },
      order: { version: 'DESC' },
      take: 50,
    });
    const pendingRevision = pendingRevisions[0] ?? null;
    if (!latestRevision) {
      latestRevision = pendingRevision ?? stableRevision;
    }
    const canViewCurrent =
      rankOf(input.user?.role) >= rankOf('autoconfirmed');
    const viewMode =
      input.view === 'current' && canViewCurrent ? 'current' : 'stable';
    const visibleRevision =
      viewMode === 'current' ? latestRevision ?? stableRevision : stableRevision;
    // drift 漂移横幅只对 patroller+ 渲染（前端 character-page 已 gate 在
    // hasRole(user,'patroller')）。匿名 / newcomer / autoconfirmed 占角色详情访
    // 问的绝大多数，对他们算 drift 纯属白算。
    const isPatroller = rankOf(input.user?.role) >= rankOf('patroller');
    // getFactorySnapshot 很重：重查一遍 character + 两次 cloneRecipe + 三段
    // diffSummary/fieldSources/publishDiff 构造，而本视图只取它的
    // publishedRecipe/draftRecipe 兜底 recipe（外加 patroller 算 drift 用）。
    // 仅在 (a) 当前可见版本没带 recipeSnapshot 需要兜底，或 (b) patroller 要算
    // drift 时才拉。命中"wiki 版本已自带 recipe 的普通访客读"路径直接跳过整个
    // 快照计算。注意 needFactory 用 !visibleRevision?.recipeSnapshot 而非把
    // pendingRevision 也算进来——factory 在 recipe 兜底链里优先级高于 pending，
    // 一旦可见版本缺 recipe 就必须拉 factory 才能保持原有兜底顺序不变。
    const needFactory =
      !!character && (!visibleRevision?.recipeSnapshot || isPatroller);
    const factorySnapshot = needFactory
      ? await this.blueprints.getFactorySnapshot(characterId).catch(() => null)
      : null;
    const recipe =
      visibleRevision?.recipeSnapshot ??
      factorySnapshot?.blueprint.publishedRecipe ??
      factorySnapshot?.blueprint.draftRecipe ??
      pendingRevision?.recipeSnapshot ??
      null;
    const rawContent = visibleRevision
      ? visibleRevision.contentSnapshot
      : character
        ? snapshotFromCharacter(character as unknown as Record<string, unknown>)
        : pendingRevision?.contentSnapshot;
    if (!rawContent) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: `角色 ${characterId} 不存在`,
      });
    }
    // region 回填：2026-05-22 起把 region 加入 WikiContentSnapshot，但**老**
    // revision 的 contentSnapshot 不带这个 key（typeof === 'undefined'）。如果直接
    // 把 undefined 喂回前端编辑器，hydrate 出来 region 输入框是空，用户编辑别的
    // 字段保存后，pickWikiContent 会把 region 写成 ""，applySnapshotToCharacter
    // 进而把已有的 character.region（preset / 历史填过的）清空。读路径上从
    // character row 兜一次，保证前端拿到的 visibleContent.region 与 character
    // 列一致，round-trip 不丢字段。clone 一份避免改坏 typeorm 返回的引用。
    const content: WikiContentSnapshot = { ...rawContent };
    if (typeof content.region !== 'string' && character?.region) {
      content.region = character.region;
    }
    const drift: DriftReport = isPatroller
      ? await this.computeDrift(
          character,
          stableRevision,
          factorySnapshot?.blueprint.publishedRecipe ?? null,
        )
      : { hasDrift: false, contentDrift: [], recipeDrift: [], source: 'none' };

    return {
      characterId,
      page,
      currentRevision: visibleRevision,
      stableRevision,
      latestRevision,
      content,
      visibleContent: content,
      recipe,
      socialOpenness: character?.socialOpenness ?? 'normal',
      proactiveBrowseChance: character?.proactiveBrowseChance ?? 0.3,
      intimacyLevel: character?.intimacyLevel ?? 0,
      pendingRevision,
      pendingRevisions,
      viewMode,
      viewerCanSeeCurrent: canViewCurrent,
      drift,
      exists: !page.isDeleted && page.lifecycleStatus !== 'pending_create',
    };
  }

  /**
   * Compares the live `character` row + published blueprint recipe to the
   * latest stable revision's snapshots. Drift = admin (or any non-wiki path)
   * touched the runtime state without going through wiki review.
   */
  private async computeDrift(
    character: CharacterEntity | null,
    stableRevision: CharacterRevisionEntity | null,
    publishedRecipe: CharacterBlueprintRecipeValue | null,
  ): Promise<DriftReport> {
    if (!character || !stableRevision) {
      return { hasDrift: false, contentDrift: [], recipeDrift: [], source: 'none' };
    }
    const liveContent = snapshotFromCharacter(
      character as unknown as Record<string, unknown>,
    );
    const contentDrift: WikiContentField[] = [];
    for (const field of WIKI_CONTENT_FIELDS) {
      const a = JSON.stringify(liveContent[field] ?? null);
      const b = JSON.stringify(stableRevision.contentSnapshot[field] ?? null);
      if (a !== b) contentDrift.push(field);
    }
    let recipeDrift: string[] = [];
    if (stableRevision.recipeSnapshot && publishedRecipe) {
      recipeDrift = diffPaths(stableRevision.recipeSnapshot, publishedRecipe);
    }
    const hasDrift = contentDrift.length > 0 || recipeDrift.length > 0;
    return {
      hasDrift,
      contentDrift,
      recipeDrift,
      source: hasDrift ? 'admin_override' : 'none',
    };
  }

  async listPages(): Promise<ListPagesRow[]> {
    const now = Date.now();
    if (this.listPagesCache && this.listPagesCache.expiresAt > now) {
      return this.listPagesCache.value;
    }
    const value = await this.computeListPages();
    this.listPagesCache = { value, expiresAt: now + WikiPageService.LIST_PAGES_TTL_MS };
    return value;
  }

  private async computeListPages(): Promise<ListPagesRow[]> {
    // 只投影目录卡片真正需要的 7 列，别 .find() 把整行实体拉出来。characters
    // 行带着 profile(JSON,均 ~3KB/最大 8KB) + expertDomains/aiRelationships 等
    // 大 TEXT 列，全表 ~97 行整实体水合下来是几百 KB + 38 列对象构造，而目录只
    // 用到 8 个小字段。和同文件 search() 一致走 getRawMany 投影。
    const characters = await this.characterRepo
      .createQueryBuilder('c')
      .select([
        'c.id AS id',
        'c.name AS name',
        'c.avatar AS avatar',
        'c.bio AS bio',
        'c.relationship AS relationship',
        'c.relationshipType AS relationshipType',
        'c.sourceType AS sourceType',
      ])
      .orderBy('c.name', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        avatar: string;
        bio: string;
        relationship: string;
        relationshipType: string;
        sourceType: string;
      }>();
    const pages = await this.pageRepo.find();
    // 和上面 characters 投影同理：目录卡片只读 contentSnapshot 的 name/avatar/bio/
    // relationship/relationshipType + characterId。recipeSnapshot(simple-json,
    // 单条 ~8KB，实测占本查询 JSON 体量 ~86%) 与 diffFromParent 在这里一概不用，
    // 默认 find() 却把它们整列水合进内存再反序列化。显式 select 把这两列丢掉——
    // 与 listRecentChanges 早先 drop recipeSnapshot 的优化保持一致（每个 newcomer
    // 待审创建都会往这张表加一条带满 recipe 的 pending 行，列表缓存每次重建都白载）。
    const pendingRevisions = await this.revisionRepo.find({
      where: { operation: 'create', status: 'pending' },
      order: { createdAt: 'DESC' },
      select: { id: true, characterId: true, contentSnapshot: true },
    });
    const pageMap = new Map(pages.map((page) => [page.characterId, page]));
    // private_import 是用户从 app 端 import 的私有角色（每个真实用户都会带一批
    // 测试 / smoke 数据），不属于公开 wiki 内容。原写法把所有 characters 表行
    // 都喂给 listPages，130/273 行变成了 `_xxx_smoke_*` 的乱码占位，公网访客
    // 打开 wiki 首页第一眼是测试数据。这里在 character 维度直接过滤掉。
    // 例外：如果该 private 角色已经被显式提到 wiki 维护（currentRevisionId !=
    // null），说明用户主动把它公开化了，保留。
    const rows = characters
      .filter((character) => {
        const page = pageMap.get(character.id);
        if (page?.isDeleted || page?.lifecycleStatus === 'deleted') return false;
        if (
          character.sourceType === 'private_import' &&
          !page?.currentRevisionId
        ) {
          return false;
        }
        return true;
      })
      .map((character) => {
        const page = pageMap.get(character.id);
        return {
          id: character.id,
          name: character.name,
          avatar: character.avatar,
          bio: character.bio,
          relationship: character.relationship,
          relationshipType: character.relationshipType,
          sourceType: character.sourceType,
          lifecycleStatus: page?.lifecycleStatus ?? 'active',
          protectionLevel: page?.protectionLevel ?? 'none',
        };
      });
    const existingIds = new Set(rows.map((row) => row.id));
    for (const revision of pendingRevisions) {
      if (existingIds.has(revision.characterId)) continue;
      rows.push({
        id: revision.characterId,
        name: revision.contentSnapshot.name,
        avatar: revision.contentSnapshot.avatar,
        bio: revision.contentSnapshot.bio,
        relationship: revision.contentSnapshot.relationship,
        relationshipType: revision.contentSnapshot.relationshipType,
        sourceType: 'wiki_contributed',
        lifecycleStatus: 'pending_create',
        protectionLevel: pageMap.get(revision.characterId)?.protectionLevel ?? 'none',
      });
      existingIds.add(revision.characterId);
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  /**
   * 验词条存在：要么 characters 表里有，要么 wiki page 有（被 wiki 创建出来的而非 world 同步过来的词条
   * 在 characters 表里可能没有对应行，但有 page）。任一存在即视为有效。
   */
  private async assertCharacterIdExists(characterId: string): Promise<void> {
    if (!characterId) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '词条不存在',
      });
    }
    const [hasCharacter, hasPage] = await Promise.all([
      this.characterRepo.count({ where: { id: characterId } }),
      this.pageRepo.count({ where: { characterId } }),
    ]);
    if (hasCharacter === 0 && hasPage === 0) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: `角色 ${characterId} 不存在`,
      });
    }
  }

  async getHistory(
    characterId: string,
    limit = 50,
  ): Promise<CharacterRevisionEntity[]> {
    // 词条不存在直接 404，否则 `[]` 让前端"以为这只是没历史"，掩盖 typo 之类的拼错 id。
    await this.assertCharacterIdExists(characterId);
    // 历史 tab 列表（character-page.tsx HistoryView）每行只渲染 pill / editSummary /
    // diffFromParent.changed / 编辑者；contentSnapshot 仅在点开"查看对比"时给
    // SnapshotDiff 用，recipeSnapshot 则只在再展开"查看角色逻辑快照"时用 ——
    // 但默认 find() 会把每行的 recipeSnapshot（完整角色蓝图）一起下发。实测一个
    // 64 修订的词条 recipeSnapshot 独占整包 ~49%（111KB 里 ~55KB），而用户一次
    // 通常只展开 0-1 条 diff。和 listRecentChanges(c6da6d10a) / listPages(245484943)
    // 同口径：显式 select 掉 recipeSnapshot，改由前端在点开 diff 时按需拉取单条
    // 修订（getRevision → pages/:id/revisions/:revisionId）。contentSnapshot 体量
    // 小(~11%)且 SnapshotDiff 需要 before/after 两版，留在列表里避免点开时再多发 N 个请求。
    return this.revisionRepo
      .createQueryBuilder('r')
      .select([
        'r.id',
        'r.characterId',
        'r.version',
        'r.parentRevisionId',
        'r.baseRevisionId',
        'r.contentSnapshot',
        'r.diffFromParent',
        'r.editorUserId',
        'r.editorRoleAtTime',
        'r.editSummary',
        'r.status',
        'r.revisionKind',
        'r.operation',
        'r.riskLevel',
        'r.changeSource',
        'r.isMinor',
        'r.isPatrolled',
        'r.patrolledBy',
        'r.patrolledAt',
        'r.revertedByRevisionId',
        'r.createdAt',
      ])
      .where('r.characterId = :characterId', { characterId })
      .orderBy('r.version', 'DESC')
      .take(Math.min(Math.max(limit, 1), 200))
      .getMany();
  }

  async getRevisionOrThrow(id: string): Promise<CharacterRevisionEntity> {
    const rev = await this.revisionRepo.findOne({ where: { id } });
    if (!rev) throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: `版本 ${id} 不存在`,
      });
    return rev;
  }

  async listRecentChanges(input: {
    limit?: number;
    onlyUnpatrolled?: boolean;
  }): Promise<CharacterRevisionEntity[]> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const qb = this.revisionRepo
      .createQueryBuilder('r')
      // recent-changes 列表只渲染 contentSnapshot.name + diffFromParent.changed
      // （见 recent-changes-page.tsx），但默认 getMany 会把每行的 recipeSnapshot
      // （完整角色蓝图）一起序列化下发 —— 实测占整包 ~50%（50 行 126KB 里
      // recipeSnapshot 独占 ~63KB）。WikiRevisionSummary.recipeSnapshot 本就是
      // optional，且 listRecentChanges 仅此一个调用方，显式 select 掉它纯赚网络体积。
      .select([
        'r.id',
        'r.characterId',
        'r.version',
        'r.parentRevisionId',
        'r.baseRevisionId',
        'r.contentSnapshot',
        'r.diffFromParent',
        'r.editorUserId',
        'r.editorRoleAtTime',
        'r.editSummary',
        'r.status',
        'r.revisionKind',
        'r.operation',
        'r.riskLevel',
        'r.changeSource',
        'r.isMinor',
        'r.isPatrolled',
        'r.patrolledBy',
        'r.patrolledAt',
        'r.revertedByRevisionId',
        'r.createdAt',
      ])
      .leftJoin(
        CharacterPageEntity,
        'p',
        'p.characterId = r.characterId',
      )
      // 同 listPages / search 的口径：私有 import 不参与公开动态时间线。
      // 私有角色（character.sourceType='private_import'）通常只在用户自己的
      // app 端被改，但若有人误把它公开化（page.currentRevisionId != null），
      // 就允许出现。LEFT JOIN characters 避免吞掉只在 wiki 端创建、characters
      // 表暂时还没行的 wiki_contributed pending_create 流程。
      .leftJoin(CharacterEntity, 'c', 'c.id = r.characterId')
      .where(
        '((p.isDeleted = 0 OR p.isDeleted IS NULL) OR r.operation IN (:...lifecycleOps))',
        { lifecycleOps: ['soft_delete', 'restore'] },
      )
      .andWhere(
        "(c.sourceType IS NULL OR c.sourceType != 'private_import' OR p.currentRevisionId IS NOT NULL)",
      )
      .orderBy('r.createdAt', 'DESC')
      .take(limit);
    if (input.onlyUnpatrolled) {
      qb.andWhere('r.status = :status AND r.isPatrolled = :patrolled', {
        status: 'approved',
        patrolled: false,
      });
    } else {
      qb.andWhere('r.status IN (:...statuses)', {
        statuses: ['approved', 'pending', 'reverted'],
      });
    }
    return qb.getMany();
  }

  async getPending(characterId: string): Promise<CharacterRevisionEntity[]> {
    await this.assertCharacterIdExists(characterId);
    return this.revisionRepo.find({
      where: { characterId, status: 'pending' },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getDiff(characterId: string, fromId: string, toId: string) {
    // 没传 from/to → getRevisionOrThrow('') 进了 typeorm 的 where:{id:''} 又被解释成"无 where"，
    // 命中表里第一行 revision 返回 200，让人误以为是合法 diff。直接 400 截断。
    if (!fromId || !toId) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: 'diff 需要 from 和 to 两个 revisionId' },
        legacyMessage: 'diff 需要 from 和 to 两个 revisionId',
      });
    }
    const [from, to] = await Promise.all([
      this.getRevisionOrThrow(fromId),
      this.getRevisionOrThrow(toId),
    ]);
    if (from.characterId !== to.characterId) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '版本不属于同一词条',
      });
    }
    if (characterId !== '_' && to.characterId !== characterId) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '版本不属于当前词条',
      });
    }
    return { from, to };
  }

  async search(query: string, limit = 20): Promise<
    Array<{
      characterId: string;
      name: string;
      bio: string;
      relationship: string;
      expertDomains: string[];
      personalityMatch: string | null;
      score: number;
    }>
  > {
    const q = query.trim();
    if (!q) return [];
    // 按空白拆成多个关键词做 AND 匹配：用户搜 "理性 朋友" / "finance management"
    // 期望两个词都命中（不要求连续），原来只做单一连续子串 LIKE 时这类查询一律
    // 0 结果。\s+ 同时覆盖普通空格和全角空格(U+3000)。上限 12 个词，挡住把整段
    // 话粘进来生成超长 SQL。单关键词时 terms=[q]，与原来的单一 LIKE 完全等价。
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 12);
    // 用 '!' 作 ESCAPE 字符而不是 '\\'。TypeORM 把 SQL 片段里的反斜杠再 escape 一次，
    // 实际跑到 SQLite 的是 ESCAPE '\\\\'（两字符）→ "ESCAPE expression must be a single
    // character"。改成 '!' 后两边都不需要再过 backslash quoting。
    const toLike = (s: string) => `%${s.replace(/[%_!]/g, (m) => `!${m}`)}%`;
    const qb = this.characterRepo
      .createQueryBuilder('c')
      .leftJoin(
        CharacterPageEntity,
        'p',
        'p.characterId = c.id',
      )
      // 删除可见性必须和 listPages 完全同口径：listPages 的过滤是
      // `page?.isDeleted || page?.lifecycleStatus === 'deleted'` 两者任一即隐藏，
      // 而这里原来只看 isDeleted。两个删除标记目前由 soft_delete 审批 /
      // setDeletedFlag 成对写入、恒同步，但只要哪天有路径只置 lifecycleStatus，
      // 搜索就会漏出一条目录里已隐藏的词条。补上 lifecycleStatus 判定让两条读路径
      // 对"什么算可见"达成一致（无 page 行时 leftJoin 出 NULL，按未删除放行）。
      .where(
        "(p.isDeleted = 0 OR p.isDeleted IS NULL) AND (p.lifecycleStatus != 'deleted' OR p.lifecycleStatus IS NULL)",
      )
      // 同 listPages 的口径：私有 import 不参与公开 wiki 搜索，否则用户搜
      // "smoke" / "测试" 会把所有人的私有测试数据全捞出来。已被显式 wiki
      // 化（page.currentRevisionId != null）的 private 行保留，让用户能搜到
      // 自己主动公开的内容。
      .andWhere(
        "(c.sourceType != 'private_import' OR p.currentRevisionId IS NOT NULL)",
      );
    // 每个关键词都必须至少命中一个可搜字段（AND 跨词、OR 跨字段）。每词独立
    // 占位符，避免共用 :like 被覆盖。
    terms.forEach((term, i) => {
      const key = `t${i}`;
      qb.andWhere(
        `(c.name LIKE :${key} ESCAPE '!' OR c.bio LIKE :${key} ESCAPE '!' OR c.relationship LIKE :${key} ESCAPE '!' OR c.personality LIKE :${key} ESCAPE '!' OR c.expertDomains LIKE :${key} ESCAPE '!')`,
        { [key]: toLike(term) },
      );
    });
    const rows = await qb
      .select([
        'c.id AS id',
        'c.name AS name',
        'c.bio AS bio',
        'c.relationship AS relationship',
        'c.personality AS personality',
        'c.expertDomains AS expertDomains',
      ])
      // 不在 SQL 里 limit —— 必须先对**全部**命中行打分排序再截断。SQL 这条没有
      // ORDER BY，若先 LIMIT 20 就是按 rowid 任意砍掉一批：命中数 > limit 时（如
      // 搜 "a" 命中 50 行），名称精确命中（score 10：OpenAI / Anthropic …）反而被
      // 排在前面 rowid 的低分 bio 命中（score 3）挤出 top-20。打分是 JS 侧做的，
      // 所以必须取齐命中行再排序、最后 slice。命中集已被 WHERE 收窄，量可控。
      .getRawMany<{
        id: string;
        name: string;
        bio: string;
        relationship: string;
        personality: string | null;
        expertDomains: string;
      }>();

    const lowerTerms = terms.map((t) => t.toLowerCase());
    const take = Math.min(Math.max(limit, 1), 100);
    return rows
      .map((r) => {
        // 逐词累加字段权重：命中的关键词越多、命中的字段越靠前，分越高。
        // 单关键词时只循环一次，与原打分（name10/关系6/专长5/简介3/性格2）等价。
        let score = 0;
        const name = r.name?.toLowerCase();
        const rel = r.relationship?.toLowerCase();
        // expertDomains 必须按**解析后的域值**匹配，不能拿原始 JSON 串。SQL WHERE
        // 是在原始 `["finance","management"]` 上做 LIKE 的——搜 JSON 结构字符（"["
        // / "," / "\"" / "]"）会命中几乎所有有专长的角色（搜 "," 命中 70 条全是假
        // 命中）。这里解析成域字符串数组逐个 includes，结构符不再误命中。
        const domains = parseExpertDomains(r.expertDomains);
        const domLower = domains.map((d) => d.toLowerCase());
        const bio = r.bio?.toLowerCase();
        const pers = r.personality?.toLowerCase();
        let matchedPersonality = false;
        // 在 JS 侧按真实字段内容重新校验"每个词都命中"：SQL WHERE 用原始
        // expertDomains JSON 做的 AND 会因结构符漏进假命中（如 "finance ," 里 ","
        // 命中 JSON 逗号），这里用解析后的域值复核，任一词无任何真实字段命中就丢弃。
        let allTermsMatch = true;
        for (const term of lowerTerms) {
          let termHit = false;
          if (name?.includes(term)) {
            score += 10;
            termHit = true;
          }
          if (rel?.includes(term)) {
            score += 6;
            termHit = true;
          }
          if (domLower.some((d) => d.includes(term))) {
            score += 5;
            termHit = true;
          }
          if (bio?.includes(term)) {
            score += 3;
            termHit = true;
          }
          if (pers?.includes(term)) {
            score += 2;
            matchedPersonality = true;
            termHit = true;
          }
          if (!termHit) allTermsMatch = false;
        }
        const result = {
          characterId: r.id,
          name: r.name,
          bio: r.bio,
          relationship: r.relationship,
          // expertDomains 是 simple-json 列，getRawMany 拿到的是原始 JSON 字符串。
          // 回传解析后的数组，让搜索结果卡能展示专长标签 —— 搜 "finance" / "general"
          // 这类只命中 expertDomains（隐藏字段）的查询，原本卡片上 name/关系/简介
          // 都没有该词，用户看不出为什么命中；把命中所在的专长标签亮出来就有了依据。
          expertDomains: domains,
          // 性格命中透明化：personality 也是可搜字段，但卡片上从不展示。搜只命中它
          // 的词（如 "逆向" 命中查理·芒格的"冷峻、短句、逆向…"）时，name/关系/简介/
          // 专长里都没有该词，用户同样看不出为什么命中。命中时回传一段以首个命中词为
          // 中心的性格摘要当可见依据，未命中给 null 省流量（不把全表 personality 下发）。
          personalityMatch: matchedPersonality
            ? personalitySnippet(r.personality ?? '', lowerTerms)
            : null,
          score,
        };
        // 只保留每个词都在真实字段命中、且总分 > 0 的行；过滤掉只靠 expertDomains
        // JSON 结构符蒙进 WHERE 的假命中（搜 "," / "[" / "\"" 这类）。
        return { result, keep: allTermsMatch && score > 0 };
      })
      .filter((x) => x.keep)
      .map((x) => x.result)
      // 二级键按 name 稳定排序：同分行有确定顺序，不随 SQL rowid 漂；截断点
      // 落在同分边界上时取哪些也就稳定可复现了。
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.name ?? '').localeCompare(b.name ?? '', 'zh-Hans-CN'),
      )
      .slice(0, take);
  }

  async setDeletedFlag(
    characterId: string,
    actorId: string,
    isDeleted: boolean,
  ): Promise<CharacterPageEntity> {
    const page = await this.getOrInitPage(characterId);
    if (page.isDeleted === isDeleted) return page;
    await this.pageRepo.update(
      { characterId },
      {
        isDeleted,
        lifecycleStatus: isDeleted ? 'deleted' : 'active',
        deletedAt: isDeleted ? new Date() : null,
        deletedBy: isDeleted ? actorId : null,
      },
    );
    this.invalidateListPagesCache();
    return (await this.pageRepo.findOne({ where: { characterId } }))!;
  }
}
// i18n-ignore-end
