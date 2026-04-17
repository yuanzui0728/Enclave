import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  createDefaultGameCenterOwnerState,
  GAME_CENTER_HOME_SEED,
  cloneGameCenterCurationSeed,
  cloneGameCenterHomeSeed,
} from './game-center.data';
import { GameCatalogEntity } from './game-catalog.entity';
import { GameCatalogRevisionEntity } from './game-catalog-revision.entity';
import { GameCenterCurationEntity } from './game-center-curation.entity';
import { GameOwnerStateEntity } from './game-owner-state.entity';
import { GameSubmissionEntity } from './game-submission.entity';

const MAX_RECENT_GAMES = 6;
const MAX_PINNED_GAMES = 8;

type SerializedGameCenterOwnerState = ReturnType<
  typeof createDefaultGameCenterOwnerState
>;

type SerializedGameCenterCuration = ReturnType<
  typeof cloneGameCenterCurationSeed
> & {
  updatedAt: string;
};

type SerializedGameCatalogSnapshot = {
  id: string;
  name: string;
  slogan: string;
  description: string;
  studio: string;
  heroLabel: string;
  category: 'featured' | 'party' | 'competitive' | 'relax' | 'strategy';
  tone: 'forest' | 'gold' | 'ocean' | 'violet' | 'sunset' | 'mint';
  badge: string;
  deckLabel: string;
  estimatedDuration: string;
  rewardLabel: string;
  sessionObjective: string;
  publisherKind: 'platform_official' | 'third_party' | 'character_creator';
  productionKind:
    | 'human_authored'
    | 'ai_assisted'
    | 'ai_generated'
    | 'character_generated';
  runtimeMode:
    | 'workspace_mock'
    | 'chat_native'
    | 'embedded_web'
    | 'remote_session';
  reviewStatus:
    | 'internal_seed'
    | 'pending_review'
    | 'approved'
    | 'rejected'
    | 'suspended';
  visibilityScope: 'featured' | 'published' | 'coming_soon' | 'internal';
  sortOrder: number;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  aiHighlights: string[];
  tags: string[];
  updateNote: string;
  playersLabel: string;
  friendsLabel: string;
};

type CreateAdminGameInput = {
  id?: string;
  name?: string;
  slogan?: string;
  description?: string;
  studio?: string;
  badge?: string;
  heroLabel?: string;
  category?: string;
  tone?: string;
  playersLabel?: string;
  friendsLabel?: string;
  updateNote?: string;
  deckLabel?: string;
  estimatedDuration?: string;
  rewardLabel?: string;
  sessionObjective?: string;
  tags?: string[] | null;
  publisherKind?: string;
  productionKind?: string;
  runtimeMode?: string;
  reviewStatus?: string;
  visibilityScope?: string;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  aiHighlights?: string[] | null;
  sortOrder?: number;
};

type UpdateAdminGameInput = Omit<CreateAdminGameInput, 'id'>;

type PublishAdminGameInput = {
  summary?: string;
  visibilityScope?: string;
};

type RestoreAdminGameRevisionInput = {
  summary?: string;
};

type UpdateAdminGameCenterCurationInput = {
  featuredGameIds?: string[];
  shelves?: Array<{
    id: string;
    title: string;
    description: string;
    gameIds: string[];
  }>;
  hotRankings?: Array<{
    gameId: string;
    rank: number;
    note: string;
  }>;
  newRankings?: Array<{
    gameId: string;
    rank: number;
    note: string;
  }>;
  events?: Array<{
    id: string;
    title: string;
    description: string;
    meta: string;
    ctaLabel: string;
    relatedGameId: string;
    actionKind: string;
    tone: string;
  }>;
  stories?: Array<{
    id: string;
    title: string;
    description: string;
    eyebrow: string;
    authorName: string;
    ctaLabel: string;
    publishedAt: string;
    kind: string;
    tone: string;
    relatedGameId?: string | null;
  }>;
};

type CreateAdminGameSubmissionInput = {
  sourceKind?: string;
  proposedGameId?: string;
  proposedName?: string;
  slogan?: string;
  description?: string;
  studio?: string;
  category?: string;
  tone?: string;
  runtimeMode?: string;
  productionKind?: string;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  submitterName?: string;
  submitterContact?: string;
  submissionNote?: string;
  aiHighlights?: string[] | null;
  tags?: string[] | null;
};

type UpdateAdminGameSubmissionInput = {
  sourceKind?: string;
  status?: string;
  proposedGameId?: string;
  proposedName?: string;
  slogan?: string;
  description?: string;
  studio?: string;
  category?: string;
  tone?: string;
  runtimeMode?: string;
  productionKind?: string;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  submitterName?: string;
  submitterContact?: string;
  submissionNote?: string;
  reviewNote?: string | null;
  linkedCatalogGameId?: string | null;
  aiHighlights?: string[] | null;
  tags?: string[] | null;
};

type ImportAdminGameSubmissionInput = {
  targetGameId?: string;
  sortOrder?: number;
};

type GameCatalogRevisionChangeSource =
  | 'draft_created'
  | 'draft_updated'
  | 'publish'
  | 'restore'
  | 'submission_ingest'
  | 'seed_backfill';

const GAME_SUBMISSION_SEED: Array<{
  id: string;
  sourceKind: 'platform_official' | 'third_party' | 'character_creator';
  status: 'pending_review' | 'draft_imported' | 'approved' | 'rejected';
  proposedGameId: string;
  proposedName: string;
  slogan: string;
  description: string;
  studio: string;
  category: 'featured' | 'party' | 'competitive' | 'relax' | 'strategy';
  tone: 'forest' | 'gold' | 'ocean' | 'violet' | 'sunset' | 'mint';
  runtimeMode: 'workspace_mock' | 'chat_native' | 'embedded_web' | 'remote_session';
  productionKind:
    | 'human_authored'
    | 'ai_assisted'
    | 'ai_generated'
    | 'character_generated';
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  submitterName: string;
  submitterContact: string;
  submissionNote: string;
  reviewNote?: string | null;
  aiHighlights: string[];
  tags: string[];
}> = [
  {
    id: 'submission-orbit-theatre',
    sourceKind: 'third_party',
    status: 'pending_review',
    proposedGameId: 'orbit-theatre',
    proposedName: '轨道剧场',
    slogan: '让 AI 导演、观众反馈和舞台调度一起推高每一场演出。',
    description:
      '一款偏经营与舞台编排的 AI 游戏，玩家需要根据观众画像安排卡司、节奏和舞台冲突。',
    studio: '北港互动',
    category: 'strategy',
    tone: 'ocean',
    runtimeMode: 'embedded_web',
    productionKind: 'ai_assisted',
    submitterName: '北港互动 BD',
    submitterContact: 'bd@beigang.example',
    submissionNote: '希望接入隐界的角色社交体系，让观众和演员都能成为可持续回访的 AI 角色。',
    aiHighlights: ['AI 导演排班', 'AI 观众反馈', 'AI 舞台事故生成'],
    tags: ['经营', '舞台', '排班'],
  },
  {
    id: 'submission-midnight-signal',
    sourceKind: 'character_creator',
    status: 'pending_review',
    proposedGameId: 'midnight-signal',
    proposedName: '午夜电台',
    slogan: '由角色主持的夜间情绪电台，每一晚都能生成新节目的互动冒险。',
    description:
      '角色主理人通过固定世界角色连续产出夜间节目，玩家在直播聊天室里决定剧情分叉和听众命运。',
    studio: '角色工坊',
    category: 'relax',
    tone: 'violet',
    runtimeMode: 'chat_native',
    productionKind: 'character_generated',
    sourceCharacterId: 'character-midnight-host',
    sourceCharacterName: '夜航主持人',
    submitterName: '夜航主持人',
    submitterContact: 'world://midnight-host',
    submissionNote: '角色本人连续生成了 12 期可复玩的夜间电台脚本，希望入库成长期栏目。',
    aiHighlights: ['角色自主演播', 'AI 听众热线', '连续剧式分支'],
    tags: ['夜聊', '直播', '剧情'],
  },
  {
    id: 'submission-proto-ferry',
    sourceKind: 'platform_official',
    status: 'pending_review',
    proposedGameId: 'proto-ferry',
    proposedName: '回声渡船',
    slogan: '官方孵化中的多人推理船班，AI 负责生成每一班乘客秘密。',
    description:
      '平台内测提案，玩家和 AI 乘客共享一班夜渡轮，围绕一桩未解事件进行群体推理与投票。',
    studio: '隐界游戏实验室',
    category: 'competitive',
    tone: 'sunset',
    runtimeMode: 'workspace_mock',
    productionKind: 'ai_generated',
    submitterName: '隐界游戏实验室',
    submitterContact: 'internal://game-lab',
    submissionNote: '当前还在验证多人房间节奏，先进入目录草稿池做内部评审。',
    aiHighlights: ['AI 乘客秘密生成', '房间内实时推理', '剧情证据动态重排'],
    tags: ['推理', '房间制', '多人'],
  },
];

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(GameOwnerStateEntity)
    private readonly ownerStateRepo: Repository<GameOwnerStateEntity>,
    @InjectRepository(GameCatalogEntity)
    private readonly catalogRepo: Repository<GameCatalogEntity>,
    @InjectRepository(GameCatalogRevisionEntity)
    private readonly revisionRepo: Repository<GameCatalogRevisionEntity>,
    @InjectRepository(GameCenterCurationEntity)
    private readonly curationRepo: Repository<GameCenterCurationEntity>,
    @InjectRepository(GameSubmissionEntity)
    private readonly submissionRepo: Repository<GameSubmissionEntity>,
    private readonly worldOwnerService: WorldOwnerService,
  ) {}

  async getGameCenterHome() {
    const seed = cloneGameCenterHomeSeed();
    const catalogEntries = await this.listCatalogEntities();
    const games = catalogEntries.map((entry) => this.serializeGame(entry));
    const knownGameIds = new Set(games.map((game) => game.id));
    const [curationEntity, ownerStateEntity] = await Promise.all([
      this.ensureCurationEntity(),
      this.ensureOwnerState(),
    ]);
    const curation = this.serializeGameCenterCuration(curationEntity, knownGameIds);
    const ownerState = this.serializeOwnerState(ownerStateEntity, knownGameIds);

    return {
      ...seed,
      featuredGameIds: curation.featuredGameIds,
      shelves: curation.shelves,
      hotRankings: curation.hotRankings,
      newRankings: curation.newRankings,
      friendActivities: seed.friendActivities.filter((item) =>
        knownGameIds.has(item.gameId),
      ),
      events: curation.events,
      stories: curation.stories,
      games,
      ownerState,
      generatedAt: new Date().toISOString(),
    };
  }

  async getOwnerState() {
    const [entity, knownGameIds] = await Promise.all([
      this.ensureOwnerState(),
      this.getKnownGameIdSet(),
    ]);

    return this.serializeOwnerState(entity, knownGameIds);
  }

  async launchGame(gameId: string) {
    const [entity, knownGameIds] = await Promise.all([
      this.ensureOwnerState(),
      this.getKnownGameIdSet(),
    ]);

    if (!knownGameIds.has(gameId)) {
      throw new NotFoundException('游戏不存在');
    }

    const current = this.serializeOwnerState(entity, knownGameIds);
    const openedAt = new Date().toISOString();

    return this.persistOwnerState(
      entity,
      {
        ...current,
        activeGameId: gameId,
        recentGameIds: [gameId, ...current.recentGameIds.filter((id) => id !== gameId)].slice(
          0,
          MAX_RECENT_GAMES,
        ),
        launchCountById: {
          ...current.launchCountById,
          [gameId]: (current.launchCountById[gameId] ?? 0) + 1,
        },
        lastOpenedAtById: {
          ...current.lastOpenedAtById,
          [gameId]: openedAt,
        },
        updatedAt: openedAt,
      },
      knownGameIds,
    );
  }

  async setPinnedState(gameId: string, pinned: boolean) {
    const [entity, knownGameIds] = await Promise.all([
      this.ensureOwnerState(),
      this.getKnownGameIdSet(),
    ]);

    if (!knownGameIds.has(gameId)) {
      throw new NotFoundException('游戏不存在');
    }

    const current = this.serializeOwnerState(entity, knownGameIds);
    const pinnedGameIds = pinned
      ? [gameId, ...current.pinnedGameIds.filter((id) => id !== gameId)].slice(
          0,
          MAX_PINNED_GAMES,
        )
      : current.pinnedGameIds.filter((id) => id !== gameId);

    return this.persistOwnerState(
      entity,
      {
        ...current,
        pinnedGameIds,
        updatedAt: new Date().toISOString(),
      },
      knownGameIds,
    );
  }

  async dismissActiveGame() {
    const [entity, knownGameIds] = await Promise.all([
      this.ensureOwnerState(),
      this.getKnownGameIdSet(),
    ]);
    const current = this.serializeOwnerState(entity, knownGameIds);

    return this.persistOwnerState(
      entity,
      {
        ...current,
        activeGameId: null,
        updatedAt: new Date().toISOString(),
      },
      knownGameIds,
    );
  }

  async getAdminCatalog() {
    const entries = await this.listCatalogEntities();
    const latestRevisionMap = await this.getLatestCatalogRevisionMap(
      entries.map((entry) => entry.id),
    );

    return entries.map((entry) =>
      this.serializeAdminCatalogItem(
        entry,
        latestRevisionMap.get(entry.id)?.id ?? null,
      ),
    );
  }

  async getAdminCatalogItem(id: string) {
    const entry = await this.getCatalogEntryOrThrow(id);
    const latestRevision = await this.getLatestCatalogRevision(id);
    return this.serializeAdminCatalogItem(entry, latestRevision?.id ?? null);
  }

  async getAdminCatalogRevisions(id: string) {
    await this.getCatalogEntryOrThrow(id);
    const revisions = await this.listCatalogRevisions(id);
    return revisions.map((revision) => this.toRevisionContract(revision));
  }

  async restoreAdminCatalogRevision(
    id: string,
    revisionId: string,
    input: RestoreAdminGameRevisionInput,
  ) {
    const [entry, revision] = await Promise.all([
      this.getCatalogEntryOrThrow(id),
      this.getCatalogRevisionOrThrow(id, revisionId),
    ]);

    this.applyCatalogSnapshot(entry, revision.snapshotPayload);
    const saved = await this.catalogRepo.save(entry);
    await this.createCatalogRevision(
      saved,
      'restore',
      this.normalizeNullableText(input.summary) ??
        `恢复到修订 #${revision.revisionSequence}`,
      null,
    );

    return this.getAdminCatalogItem(saved.id);
  }

  async createAdminCatalogItem(input: CreateAdminGameInput) {
    await this.ensureCatalogSeeded();
    const id = this.normalizeGameId(input.id);
    const name = this.normalizeRequiredText(input.name, 'name', '游戏名称');
    const existing = await this.catalogRepo.findOne({ where: { id } });
    if (existing) {
      throw new BadRequestException('游戏 ID 已存在');
    }

    const sortOrder =
      typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)
        ? input.sortOrder
        : await this.getNextSortOrder();

    const entry = this.catalogRepo.create({
      id,
      name,
      slogan: this.normalizeText(input.slogan, `${name} 的一句话介绍`),
      description: this.normalizeText(
        input.description,
        `${name} 的 AI 游戏说明待补充。`,
      ),
      studio: this.normalizeText(input.studio, '待定工作室'),
      badge: this.normalizeText(input.badge, '待发布'),
      heroLabel: this.normalizeText(input.heroLabel, 'AI 游戏草稿'),
      category: this.normalizeText(input.category, 'featured'),
      tone: this.normalizeText(input.tone, 'forest'),
      playersLabel: this.normalizeText(input.playersLabel, '0 人在玩'),
      friendsLabel: this.normalizeText(input.friendsLabel, '暂无好友在玩'),
      updateNote: this.normalizeText(input.updateNote, '等待首个版本说明'),
      deckLabel: this.normalizeText(input.deckLabel, '目录草稿'),
      estimatedDuration: this.normalizeText(input.estimatedDuration, '待定'),
      rewardLabel: this.normalizeText(input.rewardLabel, '待定'),
      sessionObjective: this.normalizeText(
        input.sessionObjective,
        '待补充本局目标与玩法重点。',
      ),
      tagsPayload: this.normalizeStringArray(input.tags),
      publisherKind: this.normalizeText(input.publisherKind, 'platform_official'),
      productionKind: this.normalizeText(input.productionKind, 'ai_assisted'),
      runtimeMode: this.normalizeText(input.runtimeMode, 'workspace_mock'),
      reviewStatus: this.normalizeText(input.reviewStatus, 'pending_review'),
      visibilityScope: this.normalizeText(input.visibilityScope, 'internal'),
      sourceCharacterId: this.normalizeNullableText(input.sourceCharacterId),
      sourceCharacterName: this.normalizeNullableText(input.sourceCharacterName),
      aiHighlightsPayload: this.normalizeStringArray(input.aiHighlights),
      sortOrder,
      publishedRevisionId: null,
      publishedVersion: 0,
      lastPublishedAt: null,
      lastPublishedSummary: null,
      originSubmissionId: null,
    });

    const saved = await this.catalogRepo.save(entry);
    await this.createCatalogRevision(saved, 'draft_created', null, null);
    return this.getAdminCatalogItem(saved.id);
  }

  async updateAdminCatalogItem(id: string, input: UpdateAdminGameInput) {
    const entry = await this.getCatalogEntryOrThrow(id);

    if (input.name !== undefined) {
      entry.name = this.normalizeRequiredText(input.name, 'name', '游戏名称');
    }
    if (input.slogan !== undefined) {
      entry.slogan = this.normalizeText(input.slogan, entry.slogan);
    }
    if (input.description !== undefined) {
      entry.description = this.normalizeText(input.description, entry.description);
    }
    if (input.studio !== undefined) {
      entry.studio = this.normalizeText(input.studio, entry.studio);
    }
    if (input.badge !== undefined) {
      entry.badge = this.normalizeText(input.badge, entry.badge);
    }
    if (input.heroLabel !== undefined) {
      entry.heroLabel = this.normalizeText(input.heroLabel, entry.heroLabel);
    }
    if (input.category !== undefined) {
      entry.category = this.normalizeText(input.category, entry.category);
    }
    if (input.tone !== undefined) {
      entry.tone = this.normalizeText(input.tone, entry.tone);
    }
    if (input.playersLabel !== undefined) {
      entry.playersLabel = this.normalizeText(input.playersLabel, entry.playersLabel);
    }
    if (input.friendsLabel !== undefined) {
      entry.friendsLabel = this.normalizeText(input.friendsLabel, entry.friendsLabel);
    }
    if (input.updateNote !== undefined) {
      entry.updateNote = this.normalizeText(input.updateNote, entry.updateNote);
    }
    if (input.deckLabel !== undefined) {
      entry.deckLabel = this.normalizeText(input.deckLabel, entry.deckLabel);
    }
    if (input.estimatedDuration !== undefined) {
      entry.estimatedDuration = this.normalizeText(
        input.estimatedDuration,
        entry.estimatedDuration,
      );
    }
    if (input.rewardLabel !== undefined) {
      entry.rewardLabel = this.normalizeText(input.rewardLabel, entry.rewardLabel);
    }
    if (input.sessionObjective !== undefined) {
      entry.sessionObjective = this.normalizeText(
        input.sessionObjective,
        entry.sessionObjective,
      );
    }
    if (input.publisherKind !== undefined) {
      entry.publisherKind = this.normalizeText(
        input.publisherKind,
        entry.publisherKind,
      );
    }
    if (input.productionKind !== undefined) {
      entry.productionKind = this.normalizeText(
        input.productionKind,
        entry.productionKind,
      );
    }
    if (input.runtimeMode !== undefined) {
      entry.runtimeMode = this.normalizeText(input.runtimeMode, entry.runtimeMode);
    }
    if (input.reviewStatus !== undefined) {
      entry.reviewStatus = this.normalizeText(
        input.reviewStatus,
        entry.reviewStatus,
      );
    }
    if (input.visibilityScope !== undefined) {
      entry.visibilityScope = this.normalizeText(
        input.visibilityScope,
        entry.visibilityScope,
      );
    }
    if (input.sourceCharacterId !== undefined) {
      entry.sourceCharacterId = this.normalizeNullableText(input.sourceCharacterId);
    }
    if (input.sourceCharacterName !== undefined) {
      entry.sourceCharacterName = this.normalizeNullableText(
        input.sourceCharacterName,
      );
    }
    if (input.tags !== undefined) {
      entry.tagsPayload = this.normalizeStringArray(input.tags);
    }
    if (input.aiHighlights !== undefined) {
      entry.aiHighlightsPayload = this.normalizeStringArray(input.aiHighlights);
    }
    if (
      typeof input.sortOrder === 'number' &&
      Number.isFinite(input.sortOrder)
    ) {
      entry.sortOrder = input.sortOrder;
    }

    const saved = await this.catalogRepo.save(entry);
    await this.createCatalogRevision(saved, 'draft_updated', null, null);
    return this.getAdminCatalogItem(saved.id);
  }

  async publishAdminCatalogItem(id: string, input: PublishAdminGameInput) {
    const entry = await this.getCatalogEntryOrThrow(id);
    const nextPublishedVersion = (entry.publishedVersion ?? 0) + 1;
    const summary = this.normalizeNullableText(input.summary);

    entry.reviewStatus = 'approved';
    entry.visibilityScope = this.resolvePublishedVisibilityScope(
      entry.visibilityScope,
      input.visibilityScope,
    );

    const revision = await this.createCatalogRevision(
      entry,
      'publish',
      summary,
      nextPublishedVersion,
    );

    entry.publishedRevisionId = revision.id;
    entry.publishedVersion = nextPublishedVersion;
    entry.lastPublishedAt = revision.createdAt;
    entry.lastPublishedSummary = summary;

    const saved = await this.catalogRepo.save(entry);
    await this.markOriginSubmissionPublished(saved);
    return this.getAdminCatalogItem(saved.id);
  }

  async getAdminGameCenterCuration() {
    const [entity, knownGameIds] = await Promise.all([
      this.ensureCurationEntity(),
      this.getKnownGameIdSet(),
    ]);

    return this.serializeGameCenterCuration(entity, knownGameIds);
  }

  async updateAdminGameCenterCuration(input: UpdateAdminGameCenterCurationInput) {
    const [entity, knownGameIds] = await Promise.all([
      this.ensureCurationEntity(),
      this.getKnownGameIdSet(),
    ]);
    const current = this.serializeGameCenterCuration(entity, knownGameIds);

    const nextState: SerializedGameCenterCuration = {
      featuredGameIds:
        input.featuredGameIds !== undefined
          ? this.normalizeFeaturedGameIds(input.featuredGameIds, knownGameIds)
          : current.featuredGameIds,
      shelves:
        input.shelves !== undefined
          ? this.normalizeShelves(input.shelves, knownGameIds)
          : current.shelves,
      hotRankings:
        input.hotRankings !== undefined
          ? this.normalizeRankings(input.hotRankings, knownGameIds, '热门榜')
          : current.hotRankings,
      newRankings:
        input.newRankings !== undefined
          ? this.normalizeRankings(input.newRankings, knownGameIds, '新游榜')
          : current.newRankings,
      events:
        input.events !== undefined
          ? this.normalizeEvents(input.events, knownGameIds)
          : current.events,
      stories:
        input.stories !== undefined
          ? this.normalizeStories(input.stories, knownGameIds)
          : current.stories,
      updatedAt: new Date().toISOString(),
    };

    return this.persistGameCenterCuration(entity, nextState, knownGameIds);
  }

  async getAdminGameSubmissions() {
    const entries = await this.listSubmissionEntities();
    return entries.map((entry) => this.serializeGameSubmission(entry));
  }

  async createAdminGameSubmission(input: CreateAdminGameSubmissionInput) {
    await this.ensureSubmissionSeeded();

    const entry = this.submissionRepo.create({
      id: `game-submission-${randomUUID()}`,
      sourceKind: this.normalizeText(input.sourceKind, 'third_party'),
      status: 'pending_review',
      proposedGameId: this.normalizeGameId(input.proposedGameId),
      proposedName: this.normalizeRequiredText(
        input.proposedName,
        'proposedName',
        '投稿游戏名',
      ),
      slogan: this.normalizeText(input.slogan, '待补充一句话卖点'),
      description: this.normalizeText(input.description, '待补充投稿游戏说明。'),
      studio: this.normalizeText(input.studio, '待定团队'),
      category: this.normalizeText(input.category, 'featured'),
      tone: this.normalizeText(input.tone, 'forest'),
      runtimeMode: this.normalizeText(input.runtimeMode, 'workspace_mock'),
      productionKind: this.normalizeText(input.productionKind, 'ai_assisted'),
      sourceCharacterId: this.normalizeNullableText(input.sourceCharacterId),
      sourceCharacterName: this.normalizeNullableText(input.sourceCharacterName),
      submitterName: this.normalizeText(input.submitterName, '匿名投稿'),
      submitterContact: this.normalizeText(input.submitterContact, '未提供联系方式'),
      submissionNote: this.normalizeText(
        input.submissionNote,
        '等待补充投稿说明与运营诉求。',
      ),
      reviewNote: null,
      linkedCatalogGameId: null,
      aiHighlightsPayload: this.normalizeStringArray(input.aiHighlights),
      tagsPayload: this.normalizeStringArray(input.tags),
    });

    const saved = await this.submissionRepo.save(entry);
    return this.serializeGameSubmission(saved);
  }

  async updateAdminGameSubmission(
    id: string,
    input: UpdateAdminGameSubmissionInput,
  ) {
    const entry = await this.getSubmissionOrThrow(id);

    if (input.sourceKind !== undefined) {
      entry.sourceKind = this.normalizeText(input.sourceKind, entry.sourceKind);
    }
    if (input.status !== undefined) {
      entry.status = this.normalizeText(input.status, entry.status);
    }
    if (input.proposedGameId !== undefined) {
      entry.proposedGameId = this.normalizeGameId(input.proposedGameId);
    }
    if (input.proposedName !== undefined) {
      entry.proposedName = this.normalizeRequiredText(
        input.proposedName,
        'proposedName',
        '投稿游戏名',
      );
    }
    if (input.slogan !== undefined) {
      entry.slogan = this.normalizeText(input.slogan, entry.slogan);
    }
    if (input.description !== undefined) {
      entry.description = this.normalizeText(input.description, entry.description);
    }
    if (input.studio !== undefined) {
      entry.studio = this.normalizeText(input.studio, entry.studio);
    }
    if (input.category !== undefined) {
      entry.category = this.normalizeText(input.category, entry.category);
    }
    if (input.tone !== undefined) {
      entry.tone = this.normalizeText(input.tone, entry.tone);
    }
    if (input.runtimeMode !== undefined) {
      entry.runtimeMode = this.normalizeText(input.runtimeMode, entry.runtimeMode);
    }
    if (input.productionKind !== undefined) {
      entry.productionKind = this.normalizeText(
        input.productionKind,
        entry.productionKind,
      );
    }
    if (input.sourceCharacterId !== undefined) {
      entry.sourceCharacterId = this.normalizeNullableText(input.sourceCharacterId);
    }
    if (input.sourceCharacterName !== undefined) {
      entry.sourceCharacterName = this.normalizeNullableText(
        input.sourceCharacterName,
      );
    }
    if (input.submitterName !== undefined) {
      entry.submitterName = this.normalizeText(input.submitterName, entry.submitterName);
    }
    if (input.submitterContact !== undefined) {
      entry.submitterContact = this.normalizeText(
        input.submitterContact,
        entry.submitterContact,
      );
    }
    if (input.submissionNote !== undefined) {
      entry.submissionNote = this.normalizeText(
        input.submissionNote,
        entry.submissionNote,
      );
    }
    if (input.reviewNote !== undefined) {
      entry.reviewNote = this.normalizeNullableText(input.reviewNote);
    }
    if (input.linkedCatalogGameId !== undefined) {
      entry.linkedCatalogGameId = this.normalizeNullableText(input.linkedCatalogGameId);
    }
    if (input.aiHighlights !== undefined) {
      entry.aiHighlightsPayload = this.normalizeStringArray(input.aiHighlights);
    }
    if (input.tags !== undefined) {
      entry.tagsPayload = this.normalizeStringArray(input.tags);
    }

    const saved = await this.submissionRepo.save(entry);
    return this.serializeGameSubmission(saved);
  }

  async importAdminGameSubmission(
    id: string,
    input: ImportAdminGameSubmissionInput,
  ) {
    const submission = await this.getSubmissionOrThrow(id);

    if (submission.status === 'rejected') {
      throw new BadRequestException('已拒绝的投稿不能导入目录草稿');
    }

    if (submission.linkedCatalogGameId) {
      const linkedEntry = await this.catalogRepo.findOne({
        where: { id: submission.linkedCatalogGameId },
      });
      if (linkedEntry) {
        return {
          submission: this.serializeGameSubmission(submission),
          game: await this.getAdminCatalogItem(linkedEntry.id),
        };
      }
    }

    await this.ensureCatalogSeeded();

    const gameId = this.normalizeGameId(
      input.targetGameId ?? submission.proposedGameId,
    );
    const existing = await this.catalogRepo.findOne({ where: { id: gameId } });
    if (existing) {
      throw new BadRequestException('目标游戏 ID 已存在');
    }

    const sortOrder =
      typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)
        ? input.sortOrder
        : await this.getNextSortOrder();

    const entry = this.catalogRepo.create({
      id: gameId,
      name: submission.proposedName,
      slogan: submission.slogan,
      description: submission.description,
      studio: submission.studio,
      badge: this.resolveSubmissionBadge(submission.sourceKind),
      heroLabel: this.resolveSubmissionHeroLabel(submission.sourceKind),
      category: submission.category,
      tone: submission.tone,
      playersLabel: '等待首批测试玩家',
      friendsLabel:
        submission.sourceKind === 'character_creator'
          ? '等待角色粉丝首轮试玩'
          : '暂无好友试玩',
      updateNote: this.normalizeText(submission.submissionNote, '投稿入库草稿'),
      deckLabel: '投稿入库草稿',
      estimatedDuration: '待补充',
      rewardLabel: '待补充',
      sessionObjective: this.normalizeText(
        submission.description,
        '待补充这一轮游玩的具体目标。',
      ),
      tagsPayload: [...submission.tagsPayload],
      publisherKind: submission.sourceKind,
      productionKind: submission.productionKind,
      runtimeMode: submission.runtimeMode,
      reviewStatus: 'pending_review',
      visibilityScope: 'internal',
      sourceCharacterId: submission.sourceCharacterId ?? null,
      sourceCharacterName: submission.sourceCharacterName ?? null,
      aiHighlightsPayload: [...submission.aiHighlightsPayload],
      sortOrder,
      publishedRevisionId: null,
      publishedVersion: 0,
      lastPublishedAt: null,
      lastPublishedSummary: null,
      originSubmissionId: submission.id,
    });

    const savedEntry = await this.catalogRepo.save(entry);
    await this.createCatalogRevision(
      savedEntry,
      'submission_ingest',
      `投稿入库：${submission.submitterName}`,
      null,
    );

    submission.status = 'draft_imported';
    submission.linkedCatalogGameId = savedEntry.id;
    if (!submission.reviewNote) {
      submission.reviewNote = '已导入目录草稿，等待审核与正式发布。';
    }
    const savedSubmission = await this.submissionRepo.save(submission);

    return {
      submission: this.serializeGameSubmission(savedSubmission),
      game: await this.getAdminCatalogItem(savedEntry.id),
    };
  }

  private async ensureCatalogSeeded() {
    const existingIds = new Set(
      (
        await this.catalogRepo.find({
          select: ['id'],
        })
      ).map((entry) => entry.id),
    );

    const missingSeedEntries = GAME_CENTER_HOME_SEED.games
      .map((game, index) => ({ game, sortOrder: index }))
      .filter(({ game }) => !existingIds.has(game.id))
      .map(({ game, sortOrder }) =>
        this.catalogRepo.create({
          id: game.id,
          name: game.name,
          slogan: game.slogan,
          description: game.description,
          studio: game.studio,
          badge: game.badge,
          heroLabel: game.heroLabel,
          category: game.category,
          tone: game.tone,
          playersLabel: game.playersLabel,
          friendsLabel: game.friendsLabel,
          updateNote: game.updateNote,
          deckLabel: game.deckLabel,
          estimatedDuration: game.estimatedDuration,
          rewardLabel: game.rewardLabel,
          sessionObjective: game.sessionObjective,
          tagsPayload: [...game.tags],
          publisherKind: game.publisherKind,
          productionKind: game.productionKind,
          runtimeMode: game.runtimeMode,
          reviewStatus: game.reviewStatus,
          visibilityScope: game.visibilityScope,
          sourceCharacterId: game.sourceCharacterId ?? null,
          sourceCharacterName: game.sourceCharacterName ?? null,
          aiHighlightsPayload: [...game.aiHighlights],
          sortOrder,
          publishedRevisionId: null,
          publishedVersion: 0,
          lastPublishedAt: null,
          lastPublishedSummary: null,
          originSubmissionId: null,
        }),
      );

    if (missingSeedEntries.length > 0) {
      const savedEntries = await this.catalogRepo.save(missingSeedEntries);
      for (const entry of savedEntries) {
        await this.createCatalogRevision(entry, 'seed_backfill', null, null);
      }
    }
  }

  private async listCatalogEntities() {
    await this.ensureCatalogSeeded();
    const entries = await this.catalogRepo.find({
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });
    await this.ensureCatalogRevisions(entries);
    return entries;
  }

  private async getCatalogEntryOrThrow(id: string) {
    await this.ensureCatalogSeeded();
    const entry = await this.catalogRepo.findOne({
      where: {
        id,
      },
    });

    if (!entry) {
      throw new NotFoundException('游戏不存在');
    }

    await this.ensureCatalogRevisions([entry]);
    return entry;
  }

  private async getCatalogRevisionOrThrow(gameId: string, revisionId: string) {
    const revision = await this.revisionRepo.findOne({
      where: {
        id: revisionId,
        gameId,
      },
    });

    if (!revision) {
      throw new NotFoundException('修订不存在');
    }

    return revision;
  }

  private async ensureCatalogRevisions(entries: GameCatalogEntity[]) {
    const gameIds = entries.map((entry) => entry.id);
    if (gameIds.length === 0) {
      return;
    }

    const latestRevisionMap = await this.getLatestCatalogRevisionMap(gameIds);
    for (const entry of entries) {
      if (!latestRevisionMap.has(entry.id)) {
        await this.createCatalogRevision(entry, 'seed_backfill', null, null);
      }
    }
  }

  private async listCatalogRevisions(gameId: string) {
    return this.revisionRepo.find({
      where: { gameId },
      order: {
        revisionSequence: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  private async getLatestCatalogRevision(gameId: string) {
    const entries = await this.revisionRepo.find({
      where: { gameId },
      order: {
        revisionSequence: 'DESC',
        createdAt: 'DESC',
      },
      take: 1,
    });

    return entries[0] ?? null;
  }

  private async getLatestCatalogRevisionMap(gameIds: string[]) {
    if (gameIds.length === 0) {
      return new Map<string, GameCatalogRevisionEntity>();
    }

    const revisions = await this.revisionRepo.find({
      where: {
        gameId: In(gameIds),
      },
      order: {
        gameId: 'ASC',
        revisionSequence: 'DESC',
        createdAt: 'DESC',
      },
    });

    const revisionMap = new Map<string, GameCatalogRevisionEntity>();
    revisions.forEach((revision) => {
      if (!revisionMap.has(revision.gameId)) {
        revisionMap.set(revision.gameId, revision);
      }
    });

    return revisionMap;
  }

  private async createCatalogRevision(
    entry: GameCatalogEntity,
    changeSource: GameCatalogRevisionChangeSource,
    summary: string | null,
    publishedVersion: number | null,
  ) {
    const latestRevision = await this.getLatestCatalogRevision(entry.id);
    const revision = this.revisionRepo.create({
      id: `game-revision-${randomUUID()}`,
      gameId: entry.id,
      revisionSequence: (latestRevision?.revisionSequence ?? 0) + 1,
      publishedVersion,
      summary,
      changeSource,
      snapshotPayload: this.serializeGameCatalogSnapshot(entry),
    });

    return this.revisionRepo.save(revision);
  }

  private applyCatalogSnapshot(
    entry: GameCatalogEntity,
    snapshot: SerializedGameCatalogSnapshot | GameCatalogRevisionEntity['snapshotPayload'],
  ) {
    entry.name = snapshot.name;
    entry.slogan = snapshot.slogan;
    entry.description = snapshot.description;
    entry.studio = snapshot.studio;
    entry.badge = snapshot.badge;
    entry.heroLabel = snapshot.heroLabel;
    entry.category = snapshot.category;
    entry.tone = snapshot.tone;
    entry.playersLabel = snapshot.playersLabel;
    entry.friendsLabel = snapshot.friendsLabel;
    entry.updateNote = snapshot.updateNote;
    entry.deckLabel = snapshot.deckLabel;
    entry.estimatedDuration = snapshot.estimatedDuration;
    entry.rewardLabel = snapshot.rewardLabel;
    entry.sessionObjective = snapshot.sessionObjective;
    entry.tagsPayload = [...snapshot.tags];
    entry.publisherKind = snapshot.publisherKind;
    entry.productionKind = snapshot.productionKind;
    entry.runtimeMode = snapshot.runtimeMode;
    entry.reviewStatus = snapshot.reviewStatus;
    entry.visibilityScope = snapshot.visibilityScope;
    entry.sourceCharacterId = snapshot.sourceCharacterId ?? null;
    entry.sourceCharacterName = snapshot.sourceCharacterName ?? null;
    entry.aiHighlightsPayload = [...snapshot.aiHighlights];
    entry.sortOrder = snapshot.sortOrder;
  }

  private async ensureCurationEntity() {
    const existing = await this.curationRepo.findOne({
      where: {
        id: 'default',
      },
    });

    if (existing) {
      return existing;
    }

    const seed = cloneGameCenterCurationSeed();
    const created = this.curationRepo.create({
      id: 'default',
      featuredGameIdsPayload: seed.featuredGameIds,
      shelvesPayload: seed.shelves,
      hotRankingsPayload: seed.hotRankings,
      newRankingsPayload: seed.newRankings,
      eventsPayload: seed.events,
      storiesPayload: seed.stories,
    });

    return this.curationRepo.save(created);
  }

  private async listSubmissionEntities() {
    await this.ensureSubmissionSeeded();
    return this.submissionRepo.find({
      order: {
        updatedAt: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  private async ensureSubmissionSeeded() {
    const existingIds = new Set(
      (
        await this.submissionRepo.find({
          select: ['id'],
        })
      ).map((entry) => entry.id),
    );

    const missingEntries = GAME_SUBMISSION_SEED.filter(
      (entry) => !existingIds.has(entry.id),
    ).map((entry) =>
      this.submissionRepo.create({
        id: entry.id,
        sourceKind: entry.sourceKind,
        status: entry.status,
        proposedGameId: entry.proposedGameId,
        proposedName: entry.proposedName,
        slogan: entry.slogan,
        description: entry.description,
        studio: entry.studio,
        category: entry.category,
        tone: entry.tone,
        runtimeMode: entry.runtimeMode,
        productionKind: entry.productionKind,
        sourceCharacterId: entry.sourceCharacterId ?? null,
        sourceCharacterName: entry.sourceCharacterName ?? null,
        submitterName: entry.submitterName,
        submitterContact: entry.submitterContact,
        submissionNote: entry.submissionNote,
        reviewNote: entry.reviewNote ?? null,
        linkedCatalogGameId: null,
        aiHighlightsPayload: [...entry.aiHighlights],
        tagsPayload: [...entry.tags],
      }),
    );

    if (missingEntries.length > 0) {
      await this.submissionRepo.save(missingEntries);
    }
  }

  private async getSubmissionOrThrow(id: string) {
    await this.ensureSubmissionSeeded();
    const entry = await this.submissionRepo.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException('投稿不存在');
    }

    return entry;
  }

  private async getKnownGameIdSet() {
    const entries = await this.listCatalogEntities();
    return new Set(entries.map((entry) => entry.id));
  }

  private async ensureOwnerState() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.ownerStateRepo.findOne({
      where: { ownerId: owner.id },
    });

    if (existing) {
      return existing;
    }

    const defaultState = createDefaultGameCenterOwnerState();
    const created = this.ownerStateRepo.create({
      ownerId: owner.id,
      activeGameId: defaultState.activeGameId ?? null,
      recentGameIdsPayload: defaultState.recentGameIds,
      pinnedGameIdsPayload: defaultState.pinnedGameIds,
      launchCountByIdPayload: defaultState.launchCountById,
      lastOpenedAtByIdPayload: defaultState.lastOpenedAtById,
    });

    return this.ownerStateRepo.save(created);
  }

  private normalizeText(value: unknown, fallback: string) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  private normalizeRequiredText(
    value: unknown,
    field: string,
    label: string,
  ) {
    const nextValue = typeof value === 'string' ? value.trim() : '';
    if (!nextValue) {
      throw new BadRequestException(`${label}不能为空 (${field})`);
    }

    return nextValue;
  }

  private normalizeNullableText(value: unknown) {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const nextValue = value.trim();
    return nextValue ? nextValue : null;
  }

  private normalizeGameId(value: unknown) {
    const nextValue =
      typeof value === 'string'
        ? value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '')
        : '';

    if (!nextValue) {
      throw new BadRequestException('游戏 ID 不能为空');
    }

    return nextValue;
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item): item is string => Boolean(item));
  }

  private ensureKnownGameIds(
    ids: string[],
    knownGameIds: Set<string>,
    label: string,
  ) {
    const missingIds = ids.filter((id) => !knownGameIds.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `${label} 包含不存在的游戏 ID：${missingIds.join(', ')}`,
      );
    }
  }

  private normalizeFeaturedGameIds(value: unknown, knownGameIds: Set<string>) {
    const gameIds = Array.from(new Set(this.normalizeStringArray(value)));
    this.ensureKnownGameIds(gameIds, knownGameIds, '主推位');
    return gameIds;
  }

  private normalizeShelves(
    value: UpdateAdminGameCenterCurationInput['shelves'],
    knownGameIds: Set<string>,
  ) {
    if (!Array.isArray(value)) {
      return [] as SerializedGameCenterCuration['shelves'];
    }

    return value.map((shelf, index) => {
      const gameIds = Array.from(
        new Set(this.normalizeStringArray(shelf?.gameIds ?? [])),
      );
      this.ensureKnownGameIds(gameIds, knownGameIds, `货架 ${index + 1}`);

      return {
        id: this.normalizeRequiredText(shelf?.id, `shelves[${index}].id`, '货架 ID'),
        title: this.normalizeRequiredText(
          shelf?.title,
          `shelves[${index}].title`,
          '货架标题',
        ),
        description: this.normalizeText(shelf?.description, ''),
        gameIds,
      };
    });
  }

  private normalizeRankings(
    value:
      | UpdateAdminGameCenterCurationInput['hotRankings']
      | UpdateAdminGameCenterCurationInput['newRankings'],
    knownGameIds: Set<string>,
    label: string,
  ) {
    if (!Array.isArray(value)) {
      return [] as SerializedGameCenterCuration['hotRankings'];
    }

    return value.map((entry, index) => {
      const gameId = this.normalizeRequiredText(
        entry?.gameId,
        `${label}[${index}].gameId`,
        `${label}游戏 ID`,
      );
      this.ensureKnownGameIds([gameId], knownGameIds, label);

      return {
        gameId,
        rank:
          typeof entry?.rank === 'number' && Number.isFinite(entry.rank)
            ? entry.rank
            : index + 1,
        note: this.normalizeText(entry?.note, ''),
      };
    });
  }

  private normalizeEvents(
    value: UpdateAdminGameCenterCurationInput['events'],
    knownGameIds: Set<string>,
  ) {
    if (!Array.isArray(value)) {
      return [] as SerializedGameCenterCuration['events'];
    }

    return value.map((event, index) => {
      const relatedGameId = this.normalizeRequiredText(
        event?.relatedGameId,
        `events[${index}].relatedGameId`,
        '活动关联游戏 ID',
      );
      this.ensureKnownGameIds([relatedGameId], knownGameIds, '活动卡');

      return {
        id: this.normalizeRequiredText(event?.id, `events[${index}].id`, '活动 ID'),
        title: this.normalizeRequiredText(
          event?.title,
          `events[${index}].title`,
          '活动标题',
        ),
        description: this.normalizeText(event?.description, ''),
        meta: this.normalizeText(event?.meta, ''),
        ctaLabel: this.normalizeText(event?.ctaLabel, '立即查看'),
        relatedGameId,
        actionKind: this.normalizeText(event?.actionKind, 'mission') as
          | 'mission'
          | 'reminder'
          | 'join',
        tone: this.normalizeText(event?.tone, 'forest') as
          | 'forest'
          | 'gold'
          | 'ocean'
          | 'violet'
          | 'sunset'
          | 'mint',
      };
    });
  }

  private normalizeStories(
    value: UpdateAdminGameCenterCurationInput['stories'],
    knownGameIds: Set<string>,
  ) {
    if (!Array.isArray(value)) {
      return [] as SerializedGameCenterCuration['stories'];
    }

    return value.map((story, index) => {
      const relatedGameId = this.normalizeNullableText(story?.relatedGameId);
      if (relatedGameId) {
        this.ensureKnownGameIds([relatedGameId], knownGameIds, '内容卡');
      }

      return {
        id: this.normalizeRequiredText(story?.id, `stories[${index}].id`, '内容 ID'),
        title: this.normalizeRequiredText(
          story?.title,
          `stories[${index}].title`,
          '内容标题',
        ),
        description: this.normalizeText(story?.description, ''),
        eyebrow: this.normalizeText(story?.eyebrow, '编辑精选'),
        authorName: this.normalizeText(story?.authorName, '隐界编辑部'),
        ctaLabel: this.normalizeText(story?.ctaLabel, '查看内容'),
        publishedAt: this.normalizeText(
          story?.publishedAt,
          new Date().toISOString(),
        ),
        kind: this.normalizeText(story?.kind, 'spotlight') as
          | 'spotlight'
          | 'guide'
          | 'update'
          | 'behind_the_scenes',
        tone: this.normalizeText(story?.tone, 'forest') as
          | 'forest'
          | 'gold'
          | 'ocean'
          | 'violet'
          | 'sunset'
          | 'mint',
        relatedGameId,
      };
    });
  }

  private sanitizeGameIds(
    value: unknown,
    knownGameIds: Set<string>,
    fallback: string[],
  ) {
    if (!Array.isArray(value)) {
      return [...fallback].filter((item) => knownGameIds.has(item));
    }

    return value.filter(
      (item): item is string =>
        typeof item === 'string' && knownGameIds.has(item),
    );
  }

  private sanitizeLaunchCounts(
    value: unknown,
    knownGameIds: Set<string>,
    fallback: Record<string, number>,
  ) {
    if (!value || typeof value !== 'object') {
      return Object.fromEntries(
        Object.entries(fallback).filter(([key]) => knownGameIds.has(key)),
      );
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          typeof entry[0] === 'string' &&
          knownGameIds.has(entry[0]) &&
          typeof entry[1] === 'number' &&
          Number.isFinite(entry[1]),
      ),
    );
  }

  private sanitizeTimestamps(
    value: unknown,
    knownGameIds: Set<string>,
    fallback: Record<string, string>,
  ) {
    if (!value || typeof value !== 'object') {
      return Object.fromEntries(
        Object.entries(fallback).filter(([key]) => knownGameIds.has(key)),
      );
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' &&
          knownGameIds.has(entry[0]) &&
          typeof entry[1] === 'string',
      ),
    );
  }

  private serializeOwnerState(
    entity: GameOwnerStateEntity,
    knownGameIds: Set<string>,
  ): SerializedGameCenterOwnerState {
    const fallback = createDefaultGameCenterOwnerState();

    return {
      activeGameId:
        entity.activeGameId && knownGameIds.has(entity.activeGameId)
          ? entity.activeGameId
          : null,
      recentGameIds: this.sanitizeGameIds(
        entity.recentGameIdsPayload,
        knownGameIds,
        fallback.recentGameIds,
      ).slice(0, MAX_RECENT_GAMES),
      pinnedGameIds: this.sanitizeGameIds(
        entity.pinnedGameIdsPayload,
        knownGameIds,
        fallback.pinnedGameIds,
      ).slice(0, MAX_PINNED_GAMES),
      launchCountById: this.sanitizeLaunchCounts(
        entity.launchCountByIdPayload,
        knownGameIds,
        fallback.launchCountById,
      ),
      lastOpenedAtById: this.sanitizeTimestamps(
        entity.lastOpenedAtByIdPayload,
        knownGameIds,
        fallback.lastOpenedAtById,
      ),
      updatedAt: entity.updatedAt?.toISOString() ?? fallback.updatedAt,
    };
  }

  private async persistOwnerState(
    entity: GameOwnerStateEntity,
    state: SerializedGameCenterOwnerState,
    knownGameIds: Set<string>,
  ) {
    entity.activeGameId =
      state.activeGameId && knownGameIds.has(state.activeGameId)
        ? state.activeGameId
        : null;
    entity.recentGameIdsPayload = state.recentGameIds
      .filter((id) => knownGameIds.has(id))
      .slice(0, MAX_RECENT_GAMES);
    entity.pinnedGameIdsPayload = state.pinnedGameIds
      .filter((id) => knownGameIds.has(id))
      .slice(0, MAX_PINNED_GAMES);
    entity.launchCountByIdPayload = Object.fromEntries(
      Object.entries(state.launchCountById).filter(([key]) => knownGameIds.has(key)),
    );
    entity.lastOpenedAtByIdPayload = Object.fromEntries(
      Object.entries(state.lastOpenedAtById).filter(([key]) => knownGameIds.has(key)),
    );

    const saved = await this.ownerStateRepo.save(entity);
    return this.serializeOwnerState(saved, knownGameIds);
  }

  private serializeGameCenterCuration(
    entity: GameCenterCurationEntity,
    knownGameIds: Set<string>,
  ): SerializedGameCenterCuration {
    const fallback = cloneGameCenterCurationSeed();

    return {
      featuredGameIds: this.sanitizeGameIds(
        entity.featuredGameIdsPayload,
        knownGameIds,
        fallback.featuredGameIds,
      ),
      shelves: (Array.isArray(entity.shelvesPayload)
        ? entity.shelvesPayload
        : fallback.shelves
      )
        .map((shelf) => ({
          id: typeof shelf?.id === 'string' ? shelf.id : '',
          title: typeof shelf?.title === 'string' ? shelf.title : '',
          description: typeof shelf?.description === 'string' ? shelf.description : '',
          gameIds: this.sanitizeGameIds(shelf?.gameIds, knownGameIds, []),
        }))
        .filter((shelf) => shelf.id && shelf.title && shelf.gameIds.length > 0),
      hotRankings: (Array.isArray(entity.hotRankingsPayload)
        ? entity.hotRankingsPayload
        : fallback.hotRankings
      ).filter(
        (entry): entry is { gameId: string; rank: number; note: string } =>
          typeof entry?.gameId === 'string' &&
          knownGameIds.has(entry.gameId) &&
          typeof entry.rank === 'number' &&
          Number.isFinite(entry.rank),
      ),
      newRankings: (Array.isArray(entity.newRankingsPayload)
        ? entity.newRankingsPayload
        : fallback.newRankings
      ).filter(
        (entry): entry is { gameId: string; rank: number; note: string } =>
          typeof entry?.gameId === 'string' &&
          knownGameIds.has(entry.gameId) &&
          typeof entry.rank === 'number' &&
          Number.isFinite(entry.rank),
      ),
      events: (Array.isArray(entity.eventsPayload)
        ? entity.eventsPayload
        : fallback.events
      ).filter(
        (event): event is SerializedGameCenterCuration['events'][number] =>
          typeof event?.id === 'string' &&
          typeof event.title === 'string' &&
          typeof event.relatedGameId === 'string' &&
          knownGameIds.has(event.relatedGameId),
      ),
      stories: (Array.isArray(entity.storiesPayload)
        ? entity.storiesPayload
        : fallback.stories
      ).filter(
        (story): story is SerializedGameCenterCuration['stories'][number] =>
          typeof story?.id === 'string' &&
          typeof story.title === 'string' &&
          (!story.relatedGameId || knownGameIds.has(story.relatedGameId)),
      ),
      updatedAt: entity.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  private async persistGameCenterCuration(
    entity: GameCenterCurationEntity,
    state: SerializedGameCenterCuration,
    knownGameIds: Set<string>,
  ) {
    entity.featuredGameIdsPayload = state.featuredGameIds;
    entity.shelvesPayload = state.shelves;
    entity.hotRankingsPayload = state.hotRankings;
    entity.newRankingsPayload = state.newRankings;
    entity.eventsPayload = state.events;
    entity.storiesPayload = state.stories;

    const saved = await this.curationRepo.save(entity);
    return this.serializeGameCenterCuration(saved, knownGameIds);
  }

  private serializeGame(entry: GameCatalogEntity) {
    return {
      id: entry.id,
      name: entry.name,
      slogan: entry.slogan,
      description: entry.description,
      studio: entry.studio,
      badge: entry.badge,
      heroLabel: entry.heroLabel,
      category: entry.category as
        | 'featured'
        | 'party'
        | 'competitive'
        | 'relax'
        | 'strategy',
      tone: entry.tone as
        | 'forest'
        | 'gold'
        | 'ocean'
        | 'violet'
        | 'sunset'
        | 'mint',
      playersLabel: entry.playersLabel,
      friendsLabel: entry.friendsLabel,
      updateNote: entry.updateNote,
      deckLabel: entry.deckLabel,
      estimatedDuration: entry.estimatedDuration,
      rewardLabel: entry.rewardLabel,
      sessionObjective: entry.sessionObjective,
      tags: [...entry.tagsPayload],
      publisherKind: entry.publisherKind as
        | 'platform_official'
        | 'third_party'
        | 'character_creator',
      productionKind: entry.productionKind as
        | 'human_authored'
        | 'ai_assisted'
        | 'ai_generated'
        | 'character_generated',
      runtimeMode: entry.runtimeMode as
        | 'workspace_mock'
        | 'chat_native'
        | 'embedded_web'
        | 'remote_session',
      reviewStatus: entry.reviewStatus as
        | 'internal_seed'
        | 'pending_review'
        | 'approved'
        | 'rejected'
        | 'suspended',
      visibilityScope: entry.visibilityScope as
        | 'featured'
        | 'published'
        | 'coming_soon'
        | 'internal',
      sourceCharacterId: entry.sourceCharacterId ?? null,
      sourceCharacterName: entry.sourceCharacterName ?? null,
      aiHighlights: [...entry.aiHighlightsPayload],
    };
  }

  private serializeGameCatalogSnapshot(
    entry: GameCatalogEntity,
  ): SerializedGameCatalogSnapshot {
    return {
      ...this.serializeGame(entry),
      sortOrder: entry.sortOrder,
    };
  }

  private serializeAdminCatalogItem(
    entry: GameCatalogEntity,
    latestRevisionId: string | null,
  ) {
    return {
      ...this.serializeGameCatalogSnapshot(entry),
      publishedVersion: entry.publishedVersion ?? 0,
      publishedRevisionId: entry.publishedRevisionId ?? null,
      hasUnpublishedChanges: latestRevisionId
        ? latestRevisionId !== (entry.publishedRevisionId ?? null)
        : false,
      lastPublishedAt: entry.lastPublishedAt?.toISOString() ?? null,
      lastPublishedSummary: entry.lastPublishedSummary ?? null,
      originSubmissionId: entry.originSubmissionId ?? null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  private toRevisionContract(revision: GameCatalogRevisionEntity) {
    return {
      id: revision.id,
      gameId: revision.gameId,
      revisionSequence: revision.revisionSequence,
      publishedVersion: revision.publishedVersion ?? null,
      summary: revision.summary ?? null,
      changeSource: revision.changeSource as GameCatalogRevisionChangeSource,
      snapshot: {
        ...revision.snapshotPayload,
        sourceCharacterId: revision.snapshotPayload.sourceCharacterId ?? null,
        sourceCharacterName: revision.snapshotPayload.sourceCharacterName ?? null,
        aiHighlights: [...revision.snapshotPayload.aiHighlights],
        tags: [...revision.snapshotPayload.tags],
      },
      createdAt: revision.createdAt.toISOString(),
    };
  }

  private serializeGameSubmission(entry: GameSubmissionEntity) {
    return {
      id: entry.id,
      sourceKind: entry.sourceKind as
        | 'platform_official'
        | 'third_party'
        | 'character_creator',
      status: entry.status as
        | 'pending_review'
        | 'draft_imported'
        | 'approved'
        | 'rejected',
      proposedGameId: entry.proposedGameId,
      proposedName: entry.proposedName,
      slogan: entry.slogan,
      description: entry.description,
      studio: entry.studio,
      category: entry.category as
        | 'featured'
        | 'party'
        | 'competitive'
        | 'relax'
        | 'strategy',
      tone: entry.tone as
        | 'forest'
        | 'gold'
        | 'ocean'
        | 'violet'
        | 'sunset'
        | 'mint',
      runtimeMode: entry.runtimeMode as
        | 'workspace_mock'
        | 'chat_native'
        | 'embedded_web'
        | 'remote_session',
      productionKind: entry.productionKind as
        | 'human_authored'
        | 'ai_assisted'
        | 'ai_generated'
        | 'character_generated',
      sourceCharacterId: entry.sourceCharacterId ?? null,
      sourceCharacterName: entry.sourceCharacterName ?? null,
      submitterName: entry.submitterName,
      submitterContact: entry.submitterContact,
      submissionNote: entry.submissionNote,
      reviewNote: entry.reviewNote ?? null,
      linkedCatalogGameId: entry.linkedCatalogGameId ?? null,
      aiHighlights: [...entry.aiHighlightsPayload],
      tags: [...entry.tagsPayload],
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  private resolvePublishedVisibilityScope(
    currentVisibilityScope: string,
    requestedVisibilityScope?: string,
  ) {
    if (typeof requestedVisibilityScope === 'string' && requestedVisibilityScope.trim()) {
      return requestedVisibilityScope.trim();
    }

    if (
      currentVisibilityScope === 'published' ||
      currentVisibilityScope === 'featured'
    ) {
      return currentVisibilityScope;
    }

    return 'published';
  }

  private resolveSubmissionBadge(sourceKind: string) {
    switch (sourceKind) {
      case 'character_creator':
        return '角色投稿';
      case 'platform_official':
        return '平台提案';
      case 'third_party':
      default:
        return '合作投稿';
    }
  }

  private resolveSubmissionHeroLabel(sourceKind: string) {
    switch (sourceKind) {
      case 'character_creator':
        return '角色产游提案';
      case 'platform_official':
        return '平台孵化草稿';
      case 'third_party':
      default:
        return '合作入库草稿';
    }
  }

  private async markOriginSubmissionPublished(entry: GameCatalogEntity) {
    if (!entry.originSubmissionId) {
      return;
    }

    const submission = await this.submissionRepo.findOne({
      where: { id: entry.originSubmissionId },
    });
    if (!submission) {
      return;
    }

    submission.status = 'approved';
    submission.linkedCatalogGameId = entry.id;
    if (!submission.reviewNote) {
      submission.reviewNote = `已随目录版本 v${entry.publishedVersion} 发布。`;
    }
    await this.submissionRepo.save(submission);
  }

  private async getNextSortOrder() {
    await this.ensureCatalogSeeded();
    const latest = await this.catalogRepo.find({
      order: { sortOrder: 'DESC', createdAt: 'DESC' },
      take: 1,
    });

    return (latest[0]?.sortOrder ?? 0) + 1;
  }
}
