import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserPrivateCharacterEntity } from '../entities/user-private-character.entity';
import { UserEntity } from '../../auth/user.entity';
import type { CharacterBlueprintRecipeValue } from '../../characters/character-blueprint.types';
import { assertPrivateCharacterFieldLimits } from '../../characters/characters.service';
import type { PersonalityProfile } from '../../ai/ai.types';

export const PRIVATE_CHARACTER_EXPORT_SCHEMA =
  'yinjie-private-character/v1' as const;

/**
 * trim 后再剥掉零宽字符（U+200B-U+200D / U+FEFF / U+2060）和孤立 BOM。
 * 用来判定 name 是不是"视觉上为空"——纯 ZWS 名字会让列表里出现一行空标签
 * 且无法点击编辑（前端走 name 显示），是 UX 黑洞。
 *
 * 不强行 strip 进 DB，保留用户原文（万一 ZWS 是有意夹在中间的格式）；只在
 * 视觉为空时拒。
 */
function isVisuallyEmpty(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return trimmed.replace(/[​-‍﻿⁠]/g, '').length === 0;
}

/**
 * Recipe 里 wiki UI 已砍掉、admin character-editor-page 也不暴露的字段。
 * 2026-05-15 起所有写入 user_private_characters 的 recipe 都会通过本函数
 * 剥离这些字段，确保 DB 里 JSON 不残留 occupation / tone 子树 / memorySummary 等。
 *
 * 注意：CharacterBlueprintRecipeValue 类型本身保留这些字段（admin character-factory
 * 仍在用，preset 数据也依赖），所以这里只在 wiki 写入路径上 strip；
 * recipe schema 不动。
 *
 * 幂等：对已经 strip 过的 recipe 再 strip 一次完全等价。
 */
export function stripRejectedRecipeFields(
  recipe: CharacterBlueprintRecipeValue | null | undefined,
): CharacterBlueprintRecipeValue | null {
  if (!recipe || typeof recipe !== 'object') return null;
  const clone = { ...recipe } as Record<string, unknown>;
  // identity 子字段砍：occupation / background / motivation / worldview / region。
  if (clone.identity && typeof clone.identity === 'object') {
    const id = clone.identity as Record<string, unknown>;
    const {
      occupation: _occupation,
      background: _background,
      motivation: _motivation,
      worldview: _worldview,
      region: _region,
      ...kept
    } = id;
    void _occupation;
    void _background;
    void _motivation;
    void _worldview;
    void _region;
    clone.identity = kept;
  }
  // expertise 子字段砍：expertiseDescription / knowledgeLimits / refusalStyle。
  if (clone.expertise && typeof clone.expertise === 'object') {
    const ex = clone.expertise as Record<string, unknown>;
    const {
      expertiseDescription: _expertiseDescription,
      knowledgeLimits: _knowledgeLimits,
      refusalStyle: _refusalStyle,
      ...kept
    } = ex;
    void _expertiseDescription;
    void _knowledgeLimits;
    void _refusalStyle;
    clone.expertise = kept;
  }
  // tone 整段砍掉。
  delete clone.tone;
  // memorySeed 子字段砍：memorySummary / coreMemory / recentSummarySeed。
  if (clone.memorySeed && typeof clone.memorySeed === 'object') {
    const ms = clone.memorySeed as Record<string, unknown>;
    const {
      memorySummary: _memorySummary,
      coreMemory: _coreMemory,
      recentSummarySeed: _recentSummarySeed,
      ...kept
    } = ms;
    void _memorySummary;
    void _coreMemory;
    void _recentSummarySeed;
    clone.memorySeed = kept;
  }
  return clone as unknown as CharacterBlueprintRecipeValue;
}

export type PrivateCharacterDto = {
  name: string;
  avatar?: string;
  bio?: string;
  personality?: string | null;
  relationship?: string;
  relationshipType?: string;
  region?: string | null;
  expertDomains?: string[];
  recipe?: CharacterBlueprintRecipeValue | null;
  profile?: PersonalityProfile | null;
  // —— 2026-05-15 起对齐 admin character editor 的字段（不含 isOnline /
  // isTemplate / sourceType / sourceKey / deletionPolicy / 生活策略整组 /
  // aiRelationships —— 都是 admin-only，wiki 写入路径不接受） ——
  socialOpenness?: string;
  proactiveBrowseChance?: number;
  intimacyLevel?: number;
};

export type PrivateCharacterExportBundle = {
  $schema: typeof PRIVATE_CHARACTER_EXPORT_SCHEMA;
  name: string;
  avatar: string;
  bio: string;
  personality?: string | null;
  relationship: string;
  relationshipType: string;
  region?: string | null;
  expertDomains: string[];
  recipe?: CharacterBlueprintRecipeValue | null;
  profile?: PersonalityProfile | null;
  // export bundle 跟着 DTO 走，admin-only 字段不写出。
  socialOpenness?: string;
  proactiveBrowseChance?: number;
  intimacyLevel?: number;
  // 源私有角色 id：world 导入时落到 CharacterEntity.wikiSourceCharacterId，作为
  // 「私有角色视频」跨-world 扇出的关联键（cloud-api 据此把视频投到导入者视频号）。
  sourceCharacterId?: string;
  meta: {
    exportedAt: string;
    exportedBy: string;
    version: 1;
  };
};

/** 角色广场列表卡 / 详情用的对外摘要（不含 recipe/profile 等大 JSON 与 admin-only 字段）。 */
export type PublicCharacterSummary = {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  relationship: string;
  relationshipType: string;
  expertDomains: string[];
  viewCount: number;
  downloadCount: number;
  publishedAt: string | null;
  updatedAt: string;
  ownerUserId: string;
  ownerName: string;
};

export type PublicCharacterDetail = PublicCharacterSummary & {
  personality: string | null;
  region: string | null;
};

/** 管理员激励榜单：按 owner 聚合的公开角色统计。 */
export type CreatorPublicStats = {
  publicCount: number;
  totalViews: number;
  totalDownloads: number;
};

export type CreatorRewardStat = {
  ownerUserId: string;
  username: string;
  email: string | null;
  // cloudPhone：wiki 用户 ↔ cloud 会员账号的关联键。多数本地注册用户为 null，
  // 运营据此（或 email / username）去 cloud-console 人工赠送会员时长。
  cloudPhone: string | null;
  publicCharacterCount: number;
  totalViews: number;
  totalDownloads: number;
};

export type CreatorRewardListResponse = {
  items: CreatorRewardStat[];
  totalCreators: number;
  totalPublicCharacters: number;
  totalViews: number;
  totalDownloads: number;
};

@Injectable()
export class WikiPrivateCharacterService {
  constructor(
    @InjectRepository(UserPrivateCharacterEntity)
    private readonly repo: Repository<UserPrivateCharacterEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  listForOwner(ownerUserId: string): Promise<UserPrivateCharacterEntity[]> {
    return this.repo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * 列表视图（GET /wiki/my-characters）专用的轻量加载。
   *
   * /my-characters 列表卡只渲染 name / avatar / bio / relationship /
   * relationshipType / expertDomains / updatedAt，从不读 recipe / profile /
   * aiRelationships / triggerScenes 这几个大 JSON 列。原 listForOwner 走 find()
   * 全列加载——实测一个带「AI 一键生成」recipe（8 个场景提示词全文）的角色，单行
   * recipe ≈ 11 KB，5 个角色的列表响应里 recipe+profile 就占了 ~55 KB / 总 58 KB
   * （94%），而卡片真正用到的只有 ~1.1 KB。角色越多浪费越线性放大。
   *
   * 这里用 select 只取卡片需要的轻量列，把 4 个大 JSON 列排除在 SQL 读取 + JSON
   * 序列化 + 网络传输之外。编辑页走 getById 单独拉全量、admin 视图仍走 listForOwner
   * 全量，两者都不受影响。
   */
  listSummariesForOwner(
    ownerUserId: string,
  ): Promise<UserPrivateCharacterEntity[]> {
    return this.repo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
      // 排除重列：recipe / profile / aiRelationships / triggerScenes。
      // 其余皆为标量 / 小数组，字节可忽略，保留以免列表记录形状对消费方失真。
      select: {
        id: true,
        ownerUserId: true,
        name: true,
        avatar: true,
        bio: true,
        personality: true,
        relationship: true,
        relationshipType: true,
        region: true,
        expertDomains: true,
        isOnline: true,
        onlineMode: true,
        activityMode: true,
        currentActivity: true,
        sourceType: true,
        sourceKey: true,
        deletionPolicy: true,
        isTemplate: true,
        socialOpenness: true,
        proactiveBrowseChance: true,
        intimacyLevel: true,
        // 公开/统计列：列表卡要渲染公开开关 + 浏览·下载徽标。
        isPublic: true,
        viewCount: true,
        downloadCount: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 管理员视角：批量统计若干 owner 各自的私有角色数量。
   * 返回 Map<ownerUserId, count>；ownerIds 里没有任何私有角色的人不会出现在 Map 里（调用方按缺省 0 处理）。
   * 实现走 find + JS aggregate：避免 getRawMany 的 alias 行为在不同 TypeORM/driver 版本上
   * 漂移（错位时不会报错，counts 全部静默回落到 0）。每个用户私有角色数量本就很小（典型 < 10），
   * 加载行做内存计数完全够用。
   */
  async countByOwners(ownerIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const uniq = Array.from(new Set(ownerIds)).filter((x) => !!x);
    if (uniq.length === 0) return result;
    const records = await this.repo.find({
      where: { ownerUserId: In(uniq) },
      select: { id: true, ownerUserId: true },
    });
    for (const record of records) {
      result.set(record.ownerUserId, (result.get(record.ownerUserId) ?? 0) + 1);
    }
    return result;
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

  // —————————————————— 公开 / 角色广场 / 统计 ——————————————————

  /**
   * owner 切换自己私有角色的公开状态。首次公开写 publishedAt（再次公开不覆盖），
   * 取消公开保留 viewCount/downloadCount 历史累计不清零。
   */
  async setVisibility(
    ownerUserId: string,
    id: string,
    isPublic: boolean,
  ): Promise<UserPrivateCharacterEntity> {
    const row = await this.getById(ownerUserId, id);
    row.isPublic = isPublic;
    if (isPublic && !row.publishedAt) {
      row.publishedAt = new Date();
    }
    return this.repo.save(row);
  }

  /**
   * 管理员强制下架（不校验 owner）：公开角色不走巡查审核流，保留这个管控口子。
   * 同样不清零统计。返回是否实际改动（已是私有→false）。
   */
  async adminSetPublic(id: string, isPublic: boolean): Promise<boolean> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('私有角色不存在');
    if (row.isPublic === isPublic) return false;
    row.isPublic = isPublic;
    if (isPublic && !row.publishedAt) row.publishedAt = new Date();
    await this.repo.save(row);
    return true;
  }

  /**
   * 角色广场列表：所有 isPublic=true 的角色，按下载量、其次更新时间倒序。
   * 走轻量 select（不读 recipe/profile 大列），并批量补 owner 展示名。
   */
  async listPublic(limit = 200): Promise<PublicCharacterSummary[]> {
    const rows = await this.repo.find({
      where: { isPublic: true },
      order: { downloadCount: 'DESC', updatedAt: 'DESC' },
      take: Math.min(500, Math.max(1, limit)),
      select: {
        id: true,
        ownerUserId: true,
        name: true,
        avatar: true,
        bio: true,
        relationship: true,
        relationshipType: true,
        expertDomains: true,
        viewCount: true,
        downloadCount: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
    const ownerNames = await this.loadOwnerNames(rows.map((r) => r.ownerUserId));
    return rows.map((r) => this.toPublicSummary(r, ownerNames));
  }

  /** 角色广场详情：非公开角色一律 404（不泄露私有角色存在）。 */
  async getPublicById(id: string): Promise<PublicCharacterDetail> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || !row.isPublic) {
      throw new NotFoundException('该公开角色不存在或已下架');
    }
    const ownerNames = await this.loadOwnerNames([row.ownerUserId]);
    return {
      ...this.toPublicSummary(row, ownerNames),
      personality: row.personality ?? null,
      region: row.region ?? null,
    };
  }

  /**
   * 取一个公开角色的完整实体（供下载导出用）。非公开 → 404。
   * 与 getById 不同：不校验 owner（任何登录用户都能下载公开角色）。
   */
  async getPublicEntity(id: string): Promise<UserPrivateCharacterEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || !row.isPublic) {
      throw new NotFoundException('该公开角色不存在或已下架');
    }
    return row;
  }

  /** 原子自增浏览量。调用方负责排除 owner 自看。 */
  async incrementView(id: string): Promise<void> {
    await this.repo.increment({ id }, 'viewCount', 1);
  }

  /** 原子自增下载量。调用方负责排除 owner 自下。 */
  async incrementDownload(id: string): Promise<void> {
    await this.repo.increment({ id }, 'downloadCount', 1);
  }

  /**
   * 管理员激励榜单：按 owner 聚合公开角色数 / 总浏览 / 总下载。
   * 只统计 isPublic=true 的角色。返回 Map<ownerUserId, stats>。
   */
  async aggregatePublicStatsByOwner(): Promise<Map<string, CreatorPublicStats>> {
    const rows = await this.repo.find({
      where: { isPublic: true },
      select: {
        ownerUserId: true,
        viewCount: true,
        downloadCount: true,
      },
    });
    const result = new Map<string, CreatorPublicStats>();
    for (const r of rows) {
      const cur =
        result.get(r.ownerUserId) ??
        { publicCount: 0, totalViews: 0, totalDownloads: 0 };
      cur.publicCount += 1;
      cur.totalViews += r.viewCount ?? 0;
      cur.totalDownloads += r.downloadCount ?? 0;
      result.set(r.ownerUserId, cur);
    }
    return result;
  }

  /**
   * 创作者激励榜单：把公开角色的浏览/下载聚合到每个 owner，附联系方式
   * （username / email / cloudPhone），按下载量从高到低排序。运营据此到
   * cloud-console 人工赠送会员时长。供 wiki 后台（JWT admin）与 cloud-console
   * （x-admin-secret）两个 admin 入口共用。
   */
  async listCreatorRewardStats(): Promise<CreatorRewardListResponse> {
    const statsByOwner = await this.aggregatePublicStatsByOwner();
    const ownerIds = Array.from(statsByOwner.keys());
    const users = ownerIds.length
      ? await this.userRepo.find({
          where: { id: In(ownerIds) },
          select: { id: true, username: true, email: true, cloudPhone: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items: CreatorRewardStat[] = ownerIds.map((ownerUserId) => {
      const s = statsByOwner.get(ownerUserId)!;
      const u = userMap.get(ownerUserId);
      return {
        ownerUserId,
        username: u?.username ?? '',
        email: u?.email ?? null,
        cloudPhone: u?.cloudPhone ?? null,
        publicCharacterCount: s.publicCount,
        totalViews: s.totalViews,
        totalDownloads: s.totalDownloads,
      };
    });
    // 下载量优先、其次浏览量倒序：激励看重"被多少人真正拿走"。
    items.sort(
      (a, b) =>
        b.totalDownloads - a.totalDownloads || b.totalViews - a.totalViews,
    );

    return {
      items,
      totalCreators: items.length,
      totalPublicCharacters: items.reduce(
        (n, it) => n + it.publicCharacterCount,
        0,
      ),
      totalViews: items.reduce((n, it) => n + it.totalViews, 0),
      totalDownloads: items.reduce((n, it) => n + it.totalDownloads, 0),
    };
  }

  private async loadOwnerNames(
    ownerIds: string[],
  ): Promise<Map<string, string>> {
    const uniq = Array.from(new Set(ownerIds)).filter((x) => !!x);
    const map = new Map<string, string>();
    if (uniq.length === 0) return map;
    const users = await this.userRepo.find({
      where: { id: In(uniq) },
      select: { id: true, username: true },
    });
    for (const u of users) map.set(u.id, u.username);
    return map;
  }

  private toPublicSummary(
    r: UserPrivateCharacterEntity,
    ownerNames: Map<string, string>,
  ): PublicCharacterSummary {
    return {
      id: r.id,
      name: r.name,
      avatar: r.avatar ?? '',
      bio: r.bio ?? '',
      relationship: r.relationship ?? '',
      relationshipType: r.relationshipType ?? '',
      expertDomains: r.expertDomains ?? [],
      viewCount: r.viewCount ?? 0,
      downloadCount: r.downloadCount ?? 0,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      updatedAt: r.updatedAt.toISOString(),
      ownerUserId: r.ownerUserId,
      // owner 账号被删 / 查不到时回落到空串，前端按"匿名创作者"渲染。
      ownerName: ownerNames.get(r.ownerUserId) ?? '',
    };
  }

  /**
   * @deprecated 历史 API：等同 `upsertByName`，会无声覆盖同名旧记录。
   * 新代码请用 `createStrict`（重名抛 Conflict）或显式 `upsertByName`。
   * 暂保留是为不破坏其它内部调用方；外部 controller 已经迁移到 createStrict。
   */
  async create(
    ownerUserId: string,
    dto: PrivateCharacterDto,
  ): Promise<UserPrivateCharacterEntity> {
    const { record } = await this.upsertByName(ownerUserId, dto);
    return record;
  }

  /**
   * 严格新建：同名直接抛 Conflict。
   * `POST /wiki/my-characters` 入口走这里 —— 用户的"创建"语义就是新建一条，
   * 不要默默覆盖。覆盖语义留给 import 路径（用户上传文件意图明确）。
   */
  async createStrict(
    ownerUserId: string,
    dto: PrivateCharacterDto,
  ): Promise<UserPrivateCharacterEntity> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('请求体格式不正确');
    }
    // typeof 守一下：客户端传 {"name":{"a":1}} / [...] 时 (x ?? '').trim() 会
    // 抛 TypeError → 500，把原始 stack 漏出去。非字符串当空字符串处理，下面的
    // "角色名不能为空" 会接住。
    const trimmedName =
      typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!trimmedName || isVisuallyEmpty(trimmedName)) {
      throw new BadRequestException('角色名不能为空');
    }
    assertPrivateCharacterFieldLimits({ ...dto, name: trimmedName });
    const clash = await this.repo.findOne({
      where: { ownerUserId, name: trimmedName },
    });
    if (clash) {
      throw new ConflictException(
        `已存在同名私有角色 "${trimmedName}"。如需覆盖，请先删除旧角色或改用导入功能。`,
      );
    }
    const created = this.repo.create({ ownerUserId, name: trimmedName });
    this.applyDto(created, { ...dto, name: trimmedName });
    return this.repo.save(created);
  }

  async update(
    ownerUserId: string,
    id: string,
    dto: PrivateCharacterDto,
  ): Promise<UserPrivateCharacterEntity> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('请求体格式不正确');
    }
    const existing = await this.getById(ownerUserId, id);
    // 同 createStrict：非字符串 name 当 undefined，回退到 existing.name。
    const incomingName =
      typeof dto.name === 'string' ? dto.name : existing.name;
    const trimmedName = incomingName.trim();
    // 视觉为空（纯 ZWS / 空白）也拒，与 createStrict / upsertByName 对齐。
    // 否则用户能在编辑器把 name 改成 '​‌‍' 这种 trim 后非空但显示一行
    // 空白的"幽灵名"，列表卡片直接不可点。
    if (!trimmedName || isVisuallyEmpty(trimmedName)) {
      throw new BadRequestException('角色名不能为空');
    }
    assertPrivateCharacterFieldLimits({ ...dto, name: trimmedName });
    // 改名时若与另一行同名 → 拒绝（避免无声丢数据）
    if (trimmedName !== existing.name) {
      const clash = await this.repo.findOne({
        where: { ownerUserId, name: trimmedName },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(
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

  /**
   * 同名（trim 后大小写敏感）→ 覆盖；无则新建。
   * 返回 { record, overwrote }，方便调用方区分两种结果。
   */
  async upsertByName(
    ownerUserId: string,
    dto: PrivateCharacterDto,
  ): Promise<{ record: UserPrivateCharacterEntity; overwrote: boolean }> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('请求体格式不正确');
    }
    // 同 createStrict：typeof 守，避免 (x ?? '').trim() 抛 TypeError。
    const trimmedName =
      typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!trimmedName || isVisuallyEmpty(trimmedName)) {
      throw new BadRequestException('角色名不能为空');
    }
    assertPrivateCharacterFieldLimits({ ...dto, name: trimmedName });
    const existing = await this.repo.findOne({
      where: { ownerUserId, name: trimmedName },
    });
    if (existing) {
      this.applyDto(existing, { ...dto, name: trimmedName });
      const record = await this.repo.save(existing);
      return { record, overwrote: true };
    }
    const created = this.repo.create({ ownerUserId, name: trimmedName });
    this.applyDto(created, { ...dto, name: trimmedName });
    const record = await this.repo.save(created);
    return { record, overwrote: false };
  }

  toExportBundle(
    record: UserPrivateCharacterEntity,
    exportedBy: string,
  ): PrivateCharacterExportBundle {
    // 导出时再过一道 strip：库里历史脏数据 / 老 client 写入的废字段不会被导出，
    // 让 export → app 端 import-personal → buildProfileFromRecipe 链路只见到
    // admin 编辑器认识的子结构。
    return {
      $schema: PRIVATE_CHARACTER_EXPORT_SCHEMA,
      name: record.name,
      avatar: record.avatar,
      bio: record.bio,
      personality: record.personality ?? null,
      relationship: record.relationship,
      relationshipType: record.relationshipType,
      region: record.region ?? null,
      expertDomains: record.expertDomains ?? [],
      recipe: stripRejectedRecipeFields(record.recipe),
      profile: record.profile ?? null,
      // admin-only 字段（isOnline / isTemplate / sourceType / sourceKey /
      // deletionPolicy / 生活策略整组：onlineMode / activityMode / currentActivity /
      // triggerScenes / aiRelationships）不进 bundle —— wiki 用户既改不到也不应导出。
      socialOpenness: record.socialOpenness,
      proactiveBrowseChance: record.proactiveBrowseChance,
      intimacyLevel: record.intimacyLevel,
      // 源 id = 该私有角色自身 id。owner 自导出与角色广场导出都走这里，故导入者
      // 拿到的恒为原始角色 id，与创作者生成视频时的 sourceCharacterId 对齐。
      sourceCharacterId: record.id,
      meta: {
        exportedAt: new Date().toISOString(),
        exportedBy,
        version: 1,
      },
    };
  }

  /**
   * 解析上传的 JSON：兼容裸 DTO（无 $schema）与 v1 bundle。
   * 缺失字段一律返回 undefined（不返回 null/空），由 applyDto 决定是否跳过。
   * 这样 round-trip 后 bundle 里没写的字段不会把已存在私有角色的字段清空。
   */
  parseImportBundle(payload: unknown): PrivateCharacterDto {
    // Array.isArray 单独挡：typeof [] === 'object' 会让数组 payload 漏过去，
    // 然后下游报"没有 name 字段"——对用户来说是"我明明传了 JSON 啊"的迷惑提示。
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('文件内容不是合法的角色 JSON');
    }
    const p = payload as Record<string, unknown>;
    const schema = typeof p.$schema === 'string' ? p.$schema : null;
    if (schema && schema !== PRIVATE_CHARACTER_EXPORT_SCHEMA) {
      throw new BadRequestException(`不支持的 schema：${schema}`);
    }
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!name) {
      throw new BadRequestException('文件里没有有效的 name 字段');
    }
    return {
      name,
      avatar: typeof p.avatar === 'string' ? p.avatar : undefined,
      bio: typeof p.bio === 'string' ? p.bio : undefined,
      personality:
        typeof p.personality === 'string' ? p.personality : undefined,
      relationship:
        typeof p.relationship === 'string' ? p.relationship : undefined,
      relationshipType:
        typeof p.relationshipType === 'string'
          ? p.relationshipType
          : undefined,
      region: typeof p.region === 'string' ? p.region : undefined,
      expertDomains: Array.isArray(p.expertDomains)
        ? p.expertDomains.filter((x): x is string => typeof x === 'string')
        : undefined,
      // typeof null/array 都是 'object'，要再排掉 Array — 否则
      // {"recipe":[1,2,3]} 会被误当成合法 recipe 存进去，下游读
      // recipe.identity 会炸。
      recipe:
        p.recipe &&
        typeof p.recipe === 'object' &&
        !Array.isArray(p.recipe)
          ? (p.recipe as CharacterBlueprintRecipeValue)
          : undefined,
      profile:
        p.profile &&
        typeof p.profile === 'object' &&
        !Array.isArray(p.profile)
          ? (p.profile as PersonalityProfile)
          : undefined,
      // admin-only 字段（isOnline / isTemplate / sourceType / sourceKey /
      // deletionPolicy / 生活策略整组）就算上传文件里有也忽略：wiki 用户没权限设。
      socialOpenness:
        typeof p.socialOpenness === 'string' ? p.socialOpenness : undefined,
      proactiveBrowseChance:
        typeof p.proactiveBrowseChance === 'number'
          ? p.proactiveBrowseChance
          : undefined,
      intimacyLevel:
        typeof p.intimacyLevel === 'number' ? p.intimacyLevel : undefined,
    };
  }

  private applyDto(
    target: UserPrivateCharacterEntity,
    dto: PrivateCharacterDto,
  ): void {
    if (!dto || typeof dto !== 'object') return;
    // 所有字符串字段统一 trim：和前端 buildDto() 一致，避免 curl 直传 "  bio  "
    // 这种把空白带进 DB → AI prompt 里多出空行 / 列表显示对不齐。
    if (typeof dto.name === 'string') target.name = dto.name.trim();
    if (typeof dto.avatar === 'string') target.avatar = dto.avatar.trim();
    if (typeof dto.bio === 'string') target.bio = dto.bio.trim();
    if (dto.personality !== undefined) {
      target.personality =
        typeof dto.personality === 'string'
          ? dto.personality.trim() || null
          : (dto.personality ?? null);
    }
    if (typeof dto.relationship === 'string') {
      target.relationship = dto.relationship.trim();
    }
    if (typeof dto.relationshipType === 'string') {
      target.relationshipType = dto.relationshipType.trim();
    }
    // region：传入 string → trim 后写回（空字符串 → null，避免 "未设置" / "" 两种显示状态）；
    // 显式传 null → 清空。undefined 跳过（不动 entity 上现有值）。
    if (dto.region !== undefined) {
      if (typeof dto.region === 'string') {
        const trimmed = dto.region.trim();
        target.region = trimmed === '' ? null : trimmed;
      } else if (dto.region === null) {
        target.region = null;
      }
    }
    if (Array.isArray(dto.expertDomains)) {
      // trim + 去空 + 去重；和前端 splitCommaList() 行为对齐，否则同一用户在 UI
      // 看到的是 ["编程","音乐"]，curl 直传 ["  编程  ","编程","音乐 "," "] 会
      // 静默存成 4 个元素，下次回 wiki 看会看到 3 重「编程」。
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const item of dto.expertDomains) {
        if (typeof item !== 'string') continue;
        const t = item.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        cleaned.push(t);
      }
      target.expertDomains = cleaned;
    }
    // 同样防 PUT body 把 recipe/profile 传成 array 或非 object：
    // 入库前再用 stripRejectedRecipeFields 剥去 wiki 已砍掉的子字段（identity.occupation
    // 等），即便老前端 / 第三方脚本继续 PUT 也不会污染 DB。
    if (dto.recipe !== undefined) {
      const r = dto.recipe;
      const safe =
        r && typeof r === 'object' && !Array.isArray(r)
          ? (r as CharacterBlueprintRecipeValue)
          : null;
      target.recipe = stripRejectedRecipeFields(safe);
    }
    if (dto.profile !== undefined) {
      const pf = dto.profile;
      target.profile =
        pf && typeof pf === 'object' && !Array.isArray(pf) ? pf : null;
    }
    // admin-only 字段（isOnline / isTemplate / sourceType / sourceKey /
    // deletionPolicy / 生活策略整组：onlineMode / activityMode / currentActivity /
    // triggerScenes）不在这里 apply：即便 PUT body 强塞，也以 entity 默认 /
    // 已有值为准。
    if (typeof dto.socialOpenness === 'string') {
      target.socialOpenness = dto.socialOpenness;
    }
    if (typeof dto.proactiveBrowseChance === 'number') {
      target.proactiveBrowseChance = dto.proactiveBrowseChance;
    }
    if (typeof dto.intimacyLevel === 'number') {
      target.intimacyLevel = dto.intimacyLevel;
    }
    // aiRelationships 已于 2026-05-15 从 wiki 编辑路径下线（admin-only）；
    // 即便 PUT body 强塞也直接忽略。
  }
}
