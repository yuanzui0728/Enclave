import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { getBuiltInCharacterBlueprintPatch } from '../characters/built-in-character-blueprints';
import { CharacterEntity } from '../characters/character.entity';
import { CharacterBlueprintEntity } from '../characters/character-blueprint.entity';
import {
  WORLD_NEWS_BULLETIN_GENERATION_KIND,
  WORLD_NEWS_DESK_SOURCE_KEY,
} from '../characters/world-news-desk-character';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { DEFAULT_REAL_WORLD_SCENE_PATCH } from './real-world-sync.constants';
import { CharacterRealWorldSignalEntity } from './character-real-world-signal.entity';
import { CharacterRealWorldDigestEntity } from './character-real-world-digest.entity';
import { CharacterRealWorldSyncRunEntity } from './character-real-world-sync-run.entity';
import { RealWorldSyncRulesService } from './real-world-sync-rules.service';
import type {
  RealityLinkApplyModeValue,
  RealityLinkConfigValue,
  RealWorldDigestApplyModeValue,
  RealWorldDigestStatusValue,
  RealWorldRuntimeContextValue,
  RealWorldScenePatchPayloadValue,
  RealWorldSignalStatusValue,
  RealWorldSignalTypeValue,
  RealWorldSyncRulesValue,
  RealWorldSyncRunStatusValue,
} from './real-world-sync.types';

function formatSyncDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value.map((item) => normalizeString(item)).filter(Boolean);
  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function normalizeRatio(value: unknown, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function isApplyMode(value: unknown): value is RealityLinkApplyModeValue {
  return value === 'disabled' || value === 'shadow' || value === 'live';
}

function createDefaultRealityLinkConfig(
  subjectName: string,
  rules: RealWorldSyncRulesValue,
): RealityLinkConfigValue {
  return {
    enabled: false,
    applyMode: 'disabled',
    subjectType: 'fictional_or_private',
    subjectName,
    aliases: [],
    locale: rules.defaultLocale,
    queryTemplate: '{{subjectName}} 最新新闻 公开动态',
    sourceAllowlist: [...rules.defaultSourceAllowlist],
    sourceBlocklist: [...rules.defaultSourceBlocklist],
    recencyHours: rules.defaultRecencyHours,
    maxSignalsPerRun: rules.defaultMaxSignalsPerRun,
    minimumConfidence: rules.defaultMinimumConfidence,
    chatWeight: 1,
    contentWeight: 1,
    realityMomentPolicy: 'disabled',
    manualSteeringNotes: '',
    dailyDigestPrompt: '',
    scenePatchPrompt: '',
    realityMomentPrompt: '',
  };
}

function normalizeRealityLinkConfig(
  raw: Partial<RealityLinkConfigValue> | null | undefined,
  subjectName: string,
  rules: RealWorldSyncRulesValue,
): RealityLinkConfigValue {
  const defaults = createDefaultRealityLinkConfig(subjectName, rules);
  const enabled = raw?.enabled === true;
  const applyMode =
    enabled && isApplyMode(raw?.applyMode) ? raw.applyMode : 'disabled';
  return {
    ...defaults,
    enabled,
    applyMode,
    subjectType:
      raw?.subjectType === 'living_public_figure' ||
      raw?.subjectType === 'organization_proxy' ||
      raw?.subjectType === 'historical_snapshot' ||
      raw?.subjectType === 'fictional_or_private'
        ? raw.subjectType
        : defaults.subjectType,
    subjectName: normalizeString(raw?.subjectName) || defaults.subjectName,
    aliases: normalizeStringArray(raw?.aliases),
    locale: normalizeString(raw?.locale) || defaults.locale,
    queryTemplate:
      normalizeString(raw?.queryTemplate) || defaults.queryTemplate,
    sourceAllowlist: normalizeStringArray(
      raw?.sourceAllowlist,
      defaults.sourceAllowlist,
    ),
    sourceBlocklist: normalizeStringArray(
      raw?.sourceBlocklist,
      defaults.sourceBlocklist,
    ),
    recencyHours: normalizePositiveNumber(
      raw?.recencyHours,
      defaults.recencyHours,
    ),
    maxSignalsPerRun: normalizePositiveNumber(
      raw?.maxSignalsPerRun,
      defaults.maxSignalsPerRun,
    ),
    minimumConfidence: normalizeRatio(
      raw?.minimumConfidence,
      defaults.minimumConfidence,
    ),
    chatWeight: normalizePositiveNumber(raw?.chatWeight, defaults.chatWeight),
    contentWeight: normalizePositiveNumber(
      raw?.contentWeight,
      defaults.contentWeight,
    ),
    realityMomentPolicy:
      raw?.realityMomentPolicy === 'optional' ||
      raw?.realityMomentPolicy === 'force_one_daily' ||
      raw?.realityMomentPolicy === 'disabled'
        ? raw.realityMomentPolicy
        : defaults.realityMomentPolicy,
    manualSteeringNotes: normalizeString(raw?.manualSteeringNotes),
    dailyDigestPrompt: normalizeString(raw?.dailyDigestPrompt),
    scenePatchPrompt: normalizeString(raw?.scenePatchPrompt),
    realityMomentPrompt: normalizeString(raw?.realityMomentPrompt),
  };
}

function cloneScenePatchPayload(
  payload?: Partial<RealWorldScenePatchPayloadValue> | null,
): RealWorldScenePatchPayloadValue {
  return {
    ...DEFAULT_REAL_WORLD_SCENE_PATCH,
    ...(payload ?? {}),
  };
}

type SignalSeed = {
  signalType: RealWorldSignalTypeValue;
  sourceName: string;
  title: string;
  snippet: string;
  normalizedSummary: string;
  credibilityScore: number;
  relevanceScore: number;
  identityMatchScore: number;
  status: RealWorldSignalStatusValue;
  sourceUrl?: string | null;
  publishedAt?: Date | null;
  metadataPayload?: Record<string, unknown> | null;
};

type ParsedFeedEntry = {
  sourceName: string;
  sourceUrl: string;
  publisherUrl?: string | null;
  title: string;
  snippet: string;
  publishedAt?: Date | null;
};

type WorldNewsBulletinSlot = 'morning' | 'noon' | 'evening';

type ArticleResolutionModeValue =
  | 'direct_source'
  | 'google_read'
  | 'bing_search'
  | 'unresolved';

type ArticleEnrichmentStatusValue =
  | 'direct_success'
  | 'resolved_success'
  | 'resolve_failed'
  | 'fetch_failed'
  | 'extract_failed';

type ArticleResolutionResult = {
  resolutionMode: ArticleResolutionModeValue;
  articleUrl?: string | null;
  resolutionQuery?: string | null;
  resolverTitle?: string | null;
  resolverSnippet?: string | null;
  resolverScore?: number | null;
  errorMessage?: string | null;
};

type ArticleEnrichmentResult = {
  status: ArticleEnrichmentStatusValue;
  resolutionMode: ArticleResolutionModeValue;
  articleUrl?: string | null;
  resolutionQuery?: string | null;
  resolverTitle?: string | null;
  resolverSnippet?: string | null;
  resolverScore?: number | null;
  articleTitle?: string | null;
  articleExcerpt?: string | null;
  articleTextLength?: number | null;
  errorMessage?: string | null;
};

const WORLD_NEWS_BULLETIN_SLOT_ORDER: WorldNewsBulletinSlot[] = [
  'morning',
  'noon',
  'evening',
];

const REALITY_LINKED_GENERATION_KINDS = [
  'reality_linked_ai',
  WORLD_NEWS_BULLETIN_GENERATION_KIND,
] as const;

const DEFAULT_WORLD_NEWS_SOURCE_LABELS = [
  'Reuters',
  'BBC',
  'The Verge',
  'TechCrunch',
];
const DEFAULT_WORLD_NEWS_SEARCH_QUERIES = [
  '国际要闻 最新',
  '科技新闻 AI 芯片 最新',
  '商业新闻 公司 市场 最新',
  '政策新闻 监管 最新',
  '科学新闻 研究 突破 最新',
];

const DEFAULT_GOOGLE_NEWS_SOURCE_NAME = 'Google News';

function readWorldNewsBulletinSlot(
  post: Pick<MomentPostEntity, 'generationKind' | 'generationMetadata'>,
): WorldNewsBulletinSlot | null {
  if (post.generationKind !== WORLD_NEWS_BULLETIN_GENERATION_KIND) {
    return null;
  }

  const slot = post.generationMetadata?.slot;
  return slot === 'morning' || slot === 'noon' || slot === 'evening'
    ? slot
    : null;
}

function sortWorldNewsBulletinSlots(slots: Iterable<WorldNewsBulletinSlot>) {
  return [...slots].sort(
    (left, right) =>
      WORLD_NEWS_BULLETIN_SLOT_ORDER.indexOf(left) -
      WORLD_NEWS_BULLETIN_SLOT_ORDER.indexOf(right),
  );
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ');
}

function normalizeFeedText(value: string) {
  return decodeXmlEntities(stripHtml(value)).replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value: string) {
  return normalizeFeedText(value)
    .toLowerCase()
    .replace(/[\s"'`‘’“”.,:;!?()[\]{}<>/\\|_+-]+/g, '');
}

function extractTagValue(block: string, tagName: string) {
  const match = block.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'),
  );
  return match ? normalizeFeedText(match[1]) : '';
}

function extractSourceTag(block: string, fallbackSourceName: string) {
  const match = block.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/i);
  if (!match) {
    return {
      sourceName: fallbackSourceName,
      publisherUrl: null,
    };
  }

  const publisherUrlMatch = match[1].match(/\burl=['"]([^'"]+)['"]/i);
  return {
    sourceName: normalizeFeedText(match[2]) || fallbackSourceName,
    publisherUrl: publisherUrlMatch?.[1]?.trim() ?? null,
  };
}

function extractAtomLink(block: string) {
  const match = block.match(/<link[^>]+href=['"]([^'"]+)['"][^>]*\/?>/i);
  return match?.[1]?.trim() ?? '';
}

function normalizeFeedDate(value?: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cleanupFeedSnippet(
  snippet: string,
  title: string,
  sourceName: string,
) {
  const normalizedSnippet = normalizeFeedText(snippet);
  if (!normalizedSnippet) {
    return '';
  }

  const withoutTitle = normalizedSnippet
    .replace(new RegExp(`^${escapeRegExp(title)}\\s*`, 'i'), '')
    .replace(new RegExp(`\\s*${escapeRegExp(sourceName)}$`, 'i'), '')
    .trim();
  return withoutTitle || normalizedSnippet;
}

function cleanupFeedTitle(title: string, sourceName: string) {
  return title
    .replace(new RegExp(`\\s+-\\s+${escapeRegExp(sourceName)}$`, 'i'), '')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clipText(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(limit - 1, 0)).trim()}…`;
}

function splitSearchQueries(value: string) {
  return value
    .split(/\r?\n|\|\|/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isGoogleNewsUrl(value?: string | null) {
  if (!value) {
    return false;
  }

  try {
    return new URL(value).hostname.endsWith('news.google.com');
  } catch {
    return false;
  }
}

function extractUrlHost(value?: string | null) {
  if (!value) {
    return '';
  }

  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function tokenizeComparableText(value: string) {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return [];
  }

  if (normalized.length < 3) {
    return [normalized];
  }

  return Array.from(
    new Set(
      Array.from({ length: normalized.length - 1 }, (_, index) =>
        normalized.slice(index, index + 2),
      ),
    ),
  );
}

function computeTitleSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    const shorterLength = Math.min(
      normalizedLeft.length,
      normalizedRight.length,
    );
    const longerLength = Math.max(
      normalizedLeft.length,
      normalizedRight.length,
    );
    return 0.82 + Math.min(shorterLength / Math.max(longerLength, 1), 0.16);
  }

  const leftTokens = new Set(tokenizeComparableText(normalizedLeft));
  const rightTokens = new Set(tokenizeComparableText(normalizedRight));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size, 1);
}

function sanitizeSearchTitle(value: string) {
  return value
    .replace(/[“”"'`‘’]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlMetaContent(
  html: string,
  key: string,
  attribute: 'property' | 'name' = 'property',
) {
  const match = html.match(
    new RegExp(
      `<meta[^>]+${attribute}=["']${escapeRegExp(key)}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
      'i',
    ),
  );
  return match ? normalizeFeedText(match[1]) : '';
}

function extractHtmlTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeFeedText(match[1]) : '';
}

function extractTagBlock(html: string, tagName: string) {
  const match = html.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'),
  );
  return match?.[1] ?? '';
}

function extractParagraphTexts(html: string) {
  return Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => normalizeFeedText(match[1]))
    .filter(
      (item) =>
        item.length >= 36 &&
        !/cookie|订阅|广告|newsletter|privacy|版权|版权所有/i.test(item),
    );
}

function hasConfiguredRealityLink(
  realityLink?: Partial<RealityLinkConfigValue> | null,
) {
  if (!realityLink) {
    return false;
  }

  return Boolean(
    realityLink.enabled ||
    (realityLink.queryTemplate && realityLink.queryTemplate.trim()) ||
    (realityLink.manualSteeringNotes &&
      realityLink.manualSteeringNotes.trim()) ||
    (realityLink.dailyDigestPrompt && realityLink.dailyDigestPrompt.trim()) ||
    (realityLink.scenePatchPrompt && realityLink.scenePatchPrompt.trim()) ||
    (realityLink.realityMomentPrompt &&
      realityLink.realityMomentPrompt.trim()) ||
    realityLink.aliases?.length ||
    realityLink.sourceAllowlist?.length ||
    realityLink.sourceBlocklist?.length,
  );
}

@Injectable()
export class RealWorldSyncService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterBlueprintEntity)
    private readonly blueprintRepo: Repository<CharacterBlueprintEntity>,
    @InjectRepository(CharacterRealWorldSignalEntity)
    private readonly signalRepo: Repository<CharacterRealWorldSignalEntity>,
    @InjectRepository(CharacterRealWorldDigestEntity)
    private readonly digestRepo: Repository<CharacterRealWorldDigestEntity>,
    @InjectRepository(CharacterRealWorldSyncRunEntity)
    private readonly runRepo: Repository<CharacterRealWorldSyncRunEntity>,
    @InjectRepository(MomentPostEntity)
    private readonly momentPostRepo: Repository<MomentPostEntity>,
    private readonly rulesService: RealWorldSyncRulesService,
  ) {}

  async getRules() {
    return this.rulesService.getRules();
  }

  async setRules(input: Partial<RealWorldSyncRulesValue>) {
    return this.rulesService.setRules(input);
  }

  async getOverview() {
    const rules = await this.rulesService.getRules();
    const today = formatSyncDate(new Date());
    const todayStart = startOfDay(new Date());
    const [
      characters,
      recentRuns,
      recentSignals,
      activeDigests,
      todayBulletins,
    ] = await Promise.all([
      this.characterRepo.find({ order: { name: 'ASC' } }),
      this.runRepo.find({
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.signalRepo.find({
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.digestRepo.find({
        where: { status: 'active' },
        order: { appliedAt: 'DESC', updatedAt: 'DESC' },
        take: 20,
      }),
      this.momentPostRepo.find({
        where: {
          generationKind: WORLD_NEWS_BULLETIN_GENERATION_KIND,
          postedAt: MoreThanOrEqual(todayStart),
        },
        order: { postedAt: 'DESC' },
        take: 60,
      }),
    ]);
    const todaySignals = recentSignals.filter(
      (item) => item.syncDate === today,
    );
    const realityLinkedMomentsToday = await this.momentPostRepo.count({
      where: {
        generationKind: In([...REALITY_LINKED_GENERATION_KINDS]),
        postedAt: MoreThanOrEqual(todayStart),
      },
    });
    const activeDigestByCharacterId = new Map(
      activeDigests.map((item) => [item.characterId, item]),
    );
    const latestRunByCharacterId = new Map<
      string,
      CharacterRealWorldSyncRunEntity
    >();
    for (const run of recentRuns) {
      if (!latestRunByCharacterId.has(run.characterId)) {
        latestRunByCharacterId.set(run.characterId, run);
      }
    }
    const acceptedSignalsTodayByCharacterId = new Map<string, number>();
    for (const signal of todaySignals) {
      if (signal.status !== 'accepted') {
        continue;
      }
      acceptedSignalsTodayByCharacterId.set(
        signal.characterId,
        (acceptedSignalsTodayByCharacterId.get(signal.characterId) ?? 0) + 1,
      );
    }
    const realityLinkedMoments = await this.momentPostRepo.find({
      where: {
        generationKind: In([...REALITY_LINKED_GENERATION_KINDS]),
      },
      order: { postedAt: 'DESC' },
      take: 200,
    });
    const todayRealityLinkedMoments = realityLinkedMoments.filter(
      (item) => formatSyncDate(item.postedAt) === today,
    );
    const charactersWithRealityMomentsToday = new Set(
      todayRealityLinkedMoments.map((item) => item.authorId),
    );
    const todayBulletinSlotsByCharacterId = new Map<
      string,
      Set<WorldNewsBulletinSlot>
    >();
    for (const post of todayBulletins) {
      const slot = readWorldNewsBulletinSlot(post);
      if (!slot) {
        continue;
      }
      if (!todayBulletinSlotsByCharacterId.has(post.authorId)) {
        todayBulletinSlotsByCharacterId.set(post.authorId, new Set());
      }
      todayBulletinSlotsByCharacterId.get(post.authorId)?.add(slot);
    }

    const characterSummaries = (
      await Promise.all(
        characters.map(async (character) => {
          const config = await this.getRealityLinkConfig(character, rules);
          const activeDigest = activeDigestByCharacterId.get(character.id);
          const latestRun = latestRunByCharacterId.get(character.id);
          return {
            characterId: character.id,
            characterName: character.name,
            characterAvatar: character.avatar,
            isWorldNewsDesk: character.sourceKey === WORLD_NEWS_DESK_SOURCE_KEY,
            enabled: config.enabled,
            applyMode: config.applyMode,
            subjectType: config.subjectType,
            subjectName: config.subjectName,
            hasActiveDigest: Boolean(activeDigest),
            activeDigestId: activeDigest?.id ?? null,
            latestRunStatus: latestRun?.status ?? null,
            latestRunAt: latestRun?.updatedAt.toISOString() ?? null,
            todayAcceptedSignalCount:
              acceptedSignalsTodayByCharacterId.get(character.id) ?? 0,
            hasRealityLinkedMomentToday: charactersWithRealityMomentsToday.has(
              character.id,
            ),
            todayBulletinSlots: sortWorldNewsBulletinSlots(
              todayBulletinSlotsByCharacterId.get(character.id) ?? [],
            ),
          };
        }),
      )
    ).filter((item) => item.enabled || item.hasActiveDigest);

    return {
      rules,
      stats: {
        enabledCharacters: characterSummaries.filter((item) => item.enabled)
          .length,
        liveCharacters: characterSummaries.filter(
          (item) => item.applyMode === 'live',
        ).length,
        activeDigests: activeDigests.length,
        signalsToday: todaySignals.filter((item) => item.status === 'accepted')
          .length,
        realityLinkedMomentsToday,
        newsBulletinsToday: todayBulletins.length,
      },
      recentRuns: recentRuns.map((item) => this.toRunRecord(item)),
      recentSignals: recentSignals.map((item) => this.toSignalRecord(item)),
      activeDigests: activeDigests.map((item) => this.toDigestRecord(item)),
      characters: characterSummaries,
    };
  }

  async getCharacterDetail(characterId: string) {
    const rules = await this.rulesService.getRules();
    const [character, runs, signals, digests, momentsToday, todayBulletins] =
      await Promise.all([
        this.characterRepo.findOneBy({ id: characterId }),
        this.runRepo.find({
          where: { characterId },
          order: { createdAt: 'DESC' },
          take: 12,
        }),
        this.signalRepo.find({
          where: { characterId },
          order: { createdAt: 'DESC' },
          take: 20,
        }),
        this.digestRepo.find({
          where: { characterId },
          order: { updatedAt: 'DESC' },
          take: 10,
        }),
        this.momentPostRepo.count({
          where: {
            authorId: characterId,
            generationKind: In([...REALITY_LINKED_GENERATION_KINDS]),
            postedAt: MoreThanOrEqual(startOfDay(new Date())),
          },
        }),
        this.momentPostRepo.find({
          where: {
            authorId: characterId,
            generationKind: WORLD_NEWS_BULLETIN_GENERATION_KIND,
            postedAt: MoreThanOrEqual(startOfDay(new Date())),
          },
          order: { postedAt: 'DESC' },
          take: 8,
        }),
      ]);

    if (!character) {
      return null;
    }

    const config = await this.getRealityLinkConfig(character, rules);
    const activeDigest =
      digests.find((item) => item.status === 'active') ?? null;
    const todayBulletinSlots = sortWorldNewsBulletinSlots(
      new Set(
        todayBulletins
          .map((post) => readWorldNewsBulletinSlot(post))
          .filter((slot): slot is WorldNewsBulletinSlot => Boolean(slot)),
      ),
    );

    return {
      characterId: character.id,
      characterName: character.name,
      characterAvatar: character.avatar,
      isWorldNewsDesk: character.sourceKey === WORLD_NEWS_DESK_SOURCE_KEY,
      config,
      activeDigest: activeDigest ? this.toDigestRecord(activeDigest) : null,
      recentRuns: runs.map((item) => this.toRunRecord(item)),
      recentSignals: signals.map((item) => this.toSignalRecord(item)),
      recentDigests: digests.map((item) => this.toDigestRecord(item)),
      hasRealityLinkedMomentToday: momentsToday > 0,
      todayBulletinSlots,
    };
  }

  async runSync(input?: { characterId?: string | null; force?: boolean }) {
    const rules = await this.rulesService.getRules();
    const characters = await this.characterRepo.find(
      input?.characterId ? { where: { id: input.characterId } } : {},
    );
    let successCount = 0;
    let failedCount = 0;
    const touchedCharacterIds: string[] = [];

    for (const character of characters) {
      const config = await this.getRealityLinkConfig(character, rules);
      if (!config.enabled || config.applyMode === 'disabled') {
        continue;
      }

      const result = await this.runCharacterSync(
        character,
        config,
        rules,
        input?.force === true,
      );
      touchedCharacterIds.push(character.id);
      if (result === 'success') {
        successCount += 1;
      } else {
        failedCount += 1;
      }
    }

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
      touchedCharacterIds,
    };
  }

  async resolveRuntimeContext(
    characterId: string,
  ): Promise<RealWorldRuntimeContextValue | null> {
    const character = await this.characterRepo.findOneBy({ id: characterId });
    if (!character) {
      return null;
    }

    const rules = await this.rulesService.getRules();
    const config = await this.getRealityLinkConfig(character, rules);
    if (!config.enabled || config.applyMode !== 'live') {
      return null;
    }

    let digest = await this.digestRepo.findOne({
      where: {
        characterId,
        status: 'active',
      },
      order: {
        appliedAt: 'DESC',
        updatedAt: 'DESC',
      },
    });
    if (!digest && character.sourceKey === WORLD_NEWS_DESK_SOURCE_KEY) {
      await this.runCharacterSync(character, config, rules, false);
      digest = await this.digestRepo.findOne({
        where: {
          characterId,
          status: 'active',
        },
        order: {
          appliedAt: 'DESC',
          updatedAt: 'DESC',
        },
      });
    }
    if (!digest) {
      return null;
    }

    const signals = digest.signalIds.length
      ? await this.signalRepo.find({
          where: { id: In(digest.signalIds) },
          order: { publishedAt: 'DESC', createdAt: 'DESC' },
        })
      : [];

    return {
      enabled: true,
      applyMode: config.applyMode,
      subjectType: config.subjectType,
      subjectName: config.subjectName,
      digestId: digest.id,
      syncDate: digest.syncDate,
      dailySummary: digest.dailySummary,
      behaviorSummary: digest.behaviorSummary ?? undefined,
      stanceShiftSummary: digest.stanceShiftSummary ?? undefined,
      globalOverlay: digest.globalOverlay ?? undefined,
      realityMomentBrief: digest.realityMomentBrief ?? null,
      sceneOverlays: cloneScenePatchPayload(digest.scenePatchPayload),
      signalTitles: signals.map((item) => item.title),
    };
  }

  async getActiveDigestSnapshot(characterId: string) {
    const digest = await this.digestRepo.findOne({
      where: {
        characterId,
        status: 'active',
      },
      order: {
        appliedAt: 'DESC',
        updatedAt: 'DESC',
      },
    });
    if (!digest) {
      return null;
    }

    const signals = digest.signalIds.length
      ? await this.signalRepo.find({
          where: { id: In(digest.signalIds) },
          order: { publishedAt: 'DESC', createdAt: 'DESC' },
        })
      : [];

    return {
      digestId: digest.id,
      syncDate: digest.syncDate,
      signalIds: [...digest.signalIds],
      signalTitles: signals.map((item) => item.title),
      sourceNames: Array.from(new Set(signals.map((item) => item.sourceName))),
    };
  }

  private async getRealityLinkConfig(
    character: Pick<CharacterEntity, 'id' | 'name' | 'sourceKey'>,
    rules: RealWorldSyncRulesValue,
  ) {
    const blueprint = await this.blueprintRepo.findOneBy({
      characterId: character.id,
    });
    const builtInRealityLink =
      getBuiltInCharacterBlueprintPatch(character.sourceKey)?.realityLink ??
      null;
    const storedRealityLink =
      blueprint?.publishedRecipe?.realityLink ??
      blueprint?.draftRecipe?.realityLink;
    return normalizeRealityLinkConfig(
      hasConfiguredRealityLink(storedRealityLink)
        ? storedRealityLink
        : builtInRealityLink,
      character.name,
      rules,
    );
  }

  private async runCharacterSync(
    character: CharacterEntity,
    config: RealityLinkConfigValue,
    rules: RealWorldSyncRulesValue,
    force = false,
  ): Promise<RealWorldSyncRunStatusValue> {
    const now = new Date();
    const syncDate = formatSyncDate(now);
    if (!force) {
      const existingDigest = await this.digestRepo.findOne({
        where: {
          characterId: character.id,
          syncDate,
        },
        order: {
          updatedAt: 'DESC',
        },
      });
      if (existingDigest) {
        return 'success';
      }
    }

    const run = this.runRepo.create({
      id: `real_world_run_${randomUUID()}`,
      characterId: character.id,
      runType: force ? 'manual_resync' : 'digest_generate',
      status: 'running',
      startedAt: now,
      searchQuery: this.renderSearchQuerySummary(character, config),
      acceptedSignalCount: 0,
      filteredSignalCount: 0,
    });
    await this.runRepo.save(run);

    try {
      const signalSeeds = await this.collectSignalSeeds(
        character,
        config,
        rules,
        now,
      );
      const savedSignals = await Promise.all(
        signalSeeds.map((seed, index) =>
          this.signalRepo.save(
            this.signalRepo.create({
              id: `real_world_signal_${randomUUID()}`,
              characterId: character.id,
              syncDate,
              signalType: seed.signalType,
              title: seed.title,
              sourceName: seed.sourceName,
              sourceUrl:
                seed.sourceUrl ??
                `https://example.com/real-world/${character.id}/${syncDate}/${index + 1}`,
              publishedAt:
                seed.publishedAt ??
                new Date(now.getTime() - index * 60 * 60 * 1000),
              capturedAt: now,
              snippet: seed.snippet,
              normalizedSummary: seed.normalizedSummary,
              credibilityScore: seed.credibilityScore,
              relevanceScore: seed.relevanceScore,
              identityMatchScore: seed.identityMatchScore,
              dedupeHash: `${character.id}:${syncDate}:${seed.title}`,
              status: seed.status,
              metadataPayload: {
                providerMode:
                  seed.metadataPayload?.providerMode ?? rules.providerMode,
                subjectName: config.subjectName,
                ...(seed.metadataPayload ?? {}),
              },
            }),
          ),
        ),
      );
      const acceptedSignals = savedSignals.filter(
        (item) => item.status === 'accepted',
      );
      const digest = await this.createDigest(
        character,
        config,
        acceptedSignals,
        now,
      );

      run.status = 'success';
      run.acceptedSignalCount = acceptedSignals.length;
      run.filteredSignalCount = savedSignals.length - acceptedSignals.length;
      run.digestId = digest.id;
      run.finishedAt = new Date();
      await this.runRepo.save(run);
      return 'success';
    } catch (error) {
      run.status = 'failed';
      run.errorMessage =
        error instanceof Error ? error.message.slice(0, 1000) : String(error);
      run.errorPayload = {
        name: error instanceof Error ? error.name : 'Error',
      };
      run.finishedAt = new Date();
      await this.runRepo.save(run);
      return 'failed';
    }
  }

  private async collectSignalSeeds(
    character: CharacterEntity,
    config: RealityLinkConfigValue,
    rules: RealWorldSyncRulesValue,
    now: Date,
  ): Promise<SignalSeed[]> {
    if (character.sourceKey === WORLD_NEWS_DESK_SOURCE_KEY) {
      const liveSignals = await this.buildWorldNewsDeskSignals(
        config,
        rules,
        now,
      );
      if (liveSignals.length > 0) {
        return liveSignals;
      }

      return this.buildMockSignals(character, config, rules, now);
    }

    if (rules.providerMode === 'google_news_rss') {
      const liveSignals = await this.buildGoogleNewsSignals(config, rules, now);
      const hasAcceptedSignals = liveSignals.some(
        (item) => item.status === 'accepted',
      );
      if (hasAcceptedSignals || !rules.googleNews.fallbackToMockOnEmpty) {
        return liveSignals;
      }
    }

    return this.buildMockSignals(character, config, rules, now);
  }

  private async buildWorldNewsDeskSignals(
    config: RealityLinkConfigValue,
    rules: RealWorldSyncRulesValue,
    now: Date,
  ): Promise<SignalSeed[]> {
    const queries = this.renderWorldNewsDeskSearchQueries(config);
    if (queries.length === 0) {
      return [];
    }

    const queryEntryGroups = await Promise.all(
      queries.map(async (query) => ({
        query,
        entries: await this.fetchFeedEntries(
          DEFAULT_GOOGLE_NEWS_SOURCE_NAME,
          this.buildGoogleNewsSearchUrl(query, rules),
        ),
      })),
    );
    const maxEntriesPerQuery = Math.max(
      rules.googleNews.maxEntriesPerQuery,
      config.maxSignalsPerRun,
      1,
    );
    const recencyCutoff = new Date(
      now.getTime() - config.recencyHours * 60 * 60 * 1000,
    );
    const candidates = new Map<
      string,
      {
        rankingScore: number;
        publishedAtTs: number;
        seed: SignalSeed;
      }
    >();

    for (const group of queryEntryGroups) {
      for (const entry of group.entries
        .slice()
        .sort((left, right) => {
          const leftTs = left.publishedAt?.getTime() ?? 0;
          const rightTs = right.publishedAt?.getTime() ?? 0;
          return rightTs - leftTs;
        })
        .slice(0, maxEntriesPerQuery)) {
        if (entry.publishedAt && entry.publishedAt < recencyCutoff) {
          continue;
        }

        if (
          this.matchesSourcePattern(
            entry.sourceName,
            entry.publisherUrl,
            config.sourceBlocklist,
          )
        ) {
          continue;
        }

        const dedupeKey = normalizeComparableText(entry.title);
        if (!dedupeKey) {
          continue;
        }

        const enrichment = await this.enrichFeedEntry(entry);
        const preferredSnippet = enrichment.articleExcerpt ?? entry.snippet;
        const allowlistMatched = this.matchesSourcePattern(
          entry.sourceName,
          entry.publisherUrl,
          config.sourceAllowlist,
        );
        const credibilityScore = this.computeGoogleNewsCredibilityScore(
          entry,
          allowlistMatched,
          enrichment,
        );
        const relevanceScore = this.computeGoogleNewsRelevanceScore(
          entry,
          now,
          recencyCutoff,
          0.99,
          allowlistMatched,
          enrichment,
        );
        const rankingScore =
          (credibilityScore + relevanceScore + 0.99) / 3 +
          (allowlistMatched ? 0.03 : 0);
        const seed = {
          signalType: 'news_article' as const,
          sourceName: entry.sourceName,
          title: entry.title,
          snippet: preferredSnippet,
          normalizedSummary: this.composeNormalizedSummary(
            entry.title,
            preferredSnippet,
          ),
          credibilityScore,
          relevanceScore,
          identityMatchScore: 0.99,
          status: 'accepted' as const,
          sourceUrl: enrichment.articleUrl ?? entry.sourceUrl,
          publishedAt: entry.publishedAt ?? now,
          metadataPayload: {
            providerMode: 'google_news_search',
            searchQuery: group.query,
            searchScope: 'world_news_desk',
            rawFeedTitle: entry.title,
            rawFeedSnippet: entry.snippet,
            publisherUrl: entry.publisherUrl ?? null,
            allowlistMatched,
            compositeScore: rankingScore,
            ...this.buildArticleDebugMetadata(enrichment),
          },
        } satisfies SignalSeed;
        const publishedAtTs = seed.publishedAt?.getTime() ?? 0;
        const existing = candidates.get(dedupeKey);
        if (
          !existing ||
          rankingScore > existing.rankingScore ||
          (rankingScore === existing.rankingScore &&
            publishedAtTs > existing.publishedAtTs)
        ) {
          candidates.set(dedupeKey, {
            rankingScore,
            publishedAtTs,
            seed,
          });
        }
      }
    }

    return [...candidates.values()]
      .sort((left, right) => {
        if (right.rankingScore !== left.rankingScore) {
          return right.rankingScore - left.rankingScore;
        }

        return right.publishedAtTs - left.publishedAtTs;
      })
      .slice(0, Math.max(config.maxSignalsPerRun, 1))
      .map((item) => item.seed);
  }

  private async buildGoogleNewsSignals(
    config: RealityLinkConfigValue,
    rules: RealWorldSyncRulesValue,
    now: Date,
  ): Promise<SignalSeed[]> {
    const query = this.renderQuery(config);
    const feedEntries = await this.fetchFeedEntries(
      DEFAULT_GOOGLE_NEWS_SOURCE_NAME,
      this.buildGoogleNewsSearchUrl(query, rules),
    );
    if (feedEntries.length === 0) {
      return [];
    }

    const acceptedLimit = Math.max(config.maxSignalsPerRun, 1);
    const maxEntries = Math.max(
      acceptedLimit,
      rules.googleNews.maxEntriesPerQuery,
      1,
    );
    const recencyCutoff = new Date(
      now.getTime() - config.recencyHours * 60 * 60 * 1000,
    );
    const dedupe = new Set<string>();
    const seeds: SignalSeed[] = [];
    let acceptedCount = 0;

    for (const entry of feedEntries
      .slice()
      .sort((left, right) => {
        const leftTs = left.publishedAt?.getTime() ?? 0;
        const rightTs = right.publishedAt?.getTime() ?? 0;
        return rightTs - leftTs;
      })
      .slice(0, maxEntries)) {
      const seed = await this.classifyGoogleNewsSignal(
        entry,
        config,
        rules,
        now,
        recencyCutoff,
        dedupe,
        query,
      );
      if (!seed) {
        continue;
      }

      if (seed.status === 'accepted' && acceptedCount >= acceptedLimit) {
        continue;
      }

      seeds.push(seed);
      if (seed.status === 'accepted') {
        acceptedCount += 1;
      }
    }

    return seeds;
  }

  private buildGoogleNewsSearchUrl(
    query: string,
    rules: RealWorldSyncRulesValue,
  ) {
    const url = new URL('https://news.google.com/rss/search');
    url.searchParams.set('q', query);
    url.searchParams.set('hl', rules.googleNews.editionLanguage);
    url.searchParams.set('gl', rules.googleNews.editionRegion);
    url.searchParams.set('ceid', rules.googleNews.editionCeid);
    return url.toString();
  }

  private async classifyGoogleNewsSignal(
    entry: ParsedFeedEntry,
    config: RealityLinkConfigValue,
    rules: RealWorldSyncRulesValue,
    now: Date,
    recencyCutoff: Date,
    dedupe: Set<string>,
    searchQuery: string,
  ): Promise<SignalSeed | null> {
    if (entry.publishedAt && entry.publishedAt < recencyCutoff) {
      return null;
    }

    if (
      this.matchesSourcePattern(
        entry.sourceName,
        entry.publisherUrl,
        config.sourceBlocklist,
      )
    ) {
      return null;
    }

    const titleKey = normalizeComparableText(entry.title);
    if (!titleKey) {
      return null;
    }

    if (dedupe.has(titleKey)) {
      return {
        signalType: this.inferSignalType(entry.title, entry.snippet),
        sourceName: entry.sourceName,
        title: entry.title,
        snippet: entry.snippet,
        normalizedSummary: `${entry.title} 与已有候选重复，未进入今日摘要。`,
        credibilityScore: 0.2,
        relevanceScore: 0.2,
        identityMatchScore: 0.2,
        status: 'filtered_duplicate',
        sourceUrl: entry.sourceUrl,
        publishedAt: entry.publishedAt ?? now,
        metadataPayload: {
          providerMode: 'google_news_rss',
          searchQuery,
          rawFeedTitle: entry.title,
          rawFeedSnippet: entry.snippet,
          publisherUrl: entry.publisherUrl ?? null,
          rejectionReason: 'duplicate_title',
        },
      };
    }
    dedupe.add(titleKey);

    const enrichment = await this.enrichFeedEntry(entry);
    const preferredSnippet = enrichment.articleExcerpt ?? entry.snippet;
    const allowlistMatched = this.matchesSourcePattern(
      entry.sourceName,
      entry.publisherUrl,
      config.sourceAllowlist,
    );
    const identityMatchScore = this.computeIdentityMatchScore(
      config,
      entry,
      `${enrichment.articleTitle ?? ''} ${enrichment.articleExcerpt ?? ''}`,
    );
    const credibilityScore = this.computeGoogleNewsCredibilityScore(
      entry,
      allowlistMatched,
      enrichment,
    );
    const relevanceScore = this.computeGoogleNewsRelevanceScore(
      entry,
      now,
      recencyCutoff,
      identityMatchScore,
      allowlistMatched,
      enrichment,
    );
    const compositeScore =
      (credibilityScore + relevanceScore + identityMatchScore) / 3;

    let status: RealWorldSignalStatusValue = 'accepted';
    let rejectionReason: string | null = null;
    if (identityMatchScore < 0.55) {
      status = 'filtered_identity_mismatch';
      rejectionReason = 'identity_mismatch';
    } else if (compositeScore < config.minimumConfidence) {
      status = 'filtered_low_confidence';
      rejectionReason = 'below_minimum_confidence';
    }

    return {
      signalType: this.inferSignalType(entry.title, preferredSnippet),
      sourceName: entry.sourceName,
      title: entry.title,
      snippet: preferredSnippet,
      normalizedSummary: this.composeNormalizedSummary(
        entry.title,
        preferredSnippet,
      ),
      credibilityScore,
      relevanceScore,
      identityMatchScore,
      status,
      sourceUrl: enrichment.articleUrl ?? entry.sourceUrl,
      publishedAt: entry.publishedAt ?? now,
      metadataPayload: {
        providerMode: 'google_news_rss',
        searchQuery,
        rawFeedTitle: entry.title,
        rawFeedSnippet: entry.snippet,
        publisherUrl: entry.publisherUrl ?? null,
        editionLanguage: rules.googleNews.editionLanguage,
        editionRegion: rules.googleNews.editionRegion,
        allowlistMatched,
        compositeScore,
        rejectionReason,
        ...this.buildArticleDebugMetadata(enrichment),
      },
    };
  }

  private matchesSourcePattern(
    sourceName: string,
    publisherUrl: string | null | undefined,
    patterns: string[],
  ) {
    if (patterns.length === 0) {
      return false;
    }

    const haystacks = [
      normalizeComparableText(sourceName),
      normalizeComparableText(publisherUrl ?? ''),
    ].filter(Boolean);
    return patterns.some((pattern) => {
      const normalizedPattern = normalizeComparableText(pattern);
      return (
        normalizedPattern.length > 0 &&
        haystacks.some((haystack) => haystack.includes(normalizedPattern))
      );
    });
  }

  private computeIdentityMatchScore(
    config: RealityLinkConfigValue,
    entry: ParsedFeedEntry,
    extraText = '',
  ) {
    const haystack = normalizeComparableText(
      `${entry.title} ${entry.snippet} ${entry.publisherUrl ?? ''} ${extraText}`,
    );
    const candidates = Array.from(
      new Set(
        [config.subjectName, ...config.aliases]
          .flatMap((value) => this.expandIdentityCandidates(value))
          .map((value) => normalizeComparableText(value))
          .filter(Boolean),
      ),
    );
    if (candidates.length === 0) {
      return 0.6;
    }

    let matchCount = 0;
    let strongestCandidateLength = 0;
    for (const candidate of candidates) {
      if (!haystack.includes(candidate)) {
        continue;
      }

      matchCount += 1;
      strongestCandidateLength = Math.max(
        strongestCandidateLength,
        candidate.length,
      );
    }

    if (matchCount === 0) {
      return config.subjectType === 'organization_proxy' ? 0.5 : 0.36;
    }

    const base = config.subjectType === 'organization_proxy' ? 0.7 : 0.78;
    return Math.min(
      0.99,
      base +
        Math.min(matchCount, 3) * 0.07 +
        Math.min(strongestCandidateLength, 12) * 0.006,
    );
  }

  private expandIdentityCandidates(value: string) {
    const normalized = normalizeString(value);
    if (!normalized) {
      return [];
    }

    return Array.from(
      new Set(
        [
          normalized,
          ...normalized
            .split(/[\s/()（）,，、;；]+/)
            .map((item) => item.trim())
            .filter((item) => item.length >= 2),
        ].filter(Boolean),
      ),
    );
  }

  private computeGoogleNewsCredibilityScore(
    entry: ParsedFeedEntry,
    allowlistMatched: boolean,
    enrichment: ArticleEnrichmentResult,
  ) {
    const sourceFingerprint = normalizeComparableText(
      `${entry.sourceName} ${entry.publisherUrl ?? ''}`,
    );
    let score = 0.72;

    if (allowlistMatched) {
      score += 0.12;
    }
    if (
      sourceFingerprint.includes('reuters') ||
      sourceFingerprint.includes('bbc') ||
      sourceFingerprint.includes('apnews') ||
      sourceFingerprint.includes('techcrunch') ||
      sourceFingerprint.includes('theverge')
    ) {
      score += 0.08;
    }
    if (
      sourceFingerprint.includes('blog') ||
      sourceFingerprint.includes('forum') ||
      sourceFingerprint.includes('rumor')
    ) {
      score -= 0.1;
    }
    if (
      enrichment.status === 'direct_success' ||
      enrichment.status === 'resolved_success'
    ) {
      score += 0.05;
    }

    return Math.max(0.2, Math.min(0.96, score));
  }

  private computeGoogleNewsRelevanceScore(
    entry: ParsedFeedEntry,
    now: Date,
    recencyCutoff: Date,
    identityMatchScore: number,
    allowlistMatched: boolean,
    enrichment: ArticleEnrichmentResult,
  ) {
    const recencyWindowMs = Math.max(
      now.getTime() - recencyCutoff.getTime(),
      1,
    );
    const publishedAtTs = entry.publishedAt?.getTime() ?? now.getTime();
    const ageMs = Math.max(0, now.getTime() - publishedAtTs);
    const freshnessRatio = Math.max(0, 1 - ageMs / recencyWindowMs);

    let score = 0.45 + freshnessRatio * 0.24 + identityMatchScore * 0.26;
    if (entry.snippet) {
      score += 0.04;
    }
    if (allowlistMatched) {
      score += 0.04;
    }
    if (enrichment.articleExcerpt) {
      score += 0.06;
    }

    return Math.max(0.2, Math.min(0.98, score));
  }

  private composeNormalizedSummary(title: string, snippet: string) {
    return `${title}${snippet ? `：${clipText(snippet, 240)}` : ''}`;
  }

  private inferSignalType(
    title: string,
    snippet: string,
  ): RealWorldSignalTypeValue {
    const haystack = `${title} ${snippet}`.toLowerCase();
    if (/采访|专访|受访|访谈|interview/.test(haystack)) {
      return 'interview';
    }
    if (/发布|上线|推出|launch|release|发布会|新品/.test(haystack)) {
      return 'product_release';
    }
    if (/发文|发帖|tweet|post|公告|声明|宣布/.test(haystack)) {
      return 'official_post';
    }
    if (/出席|现身|演讲|appearance|attend|visit/.test(haystack)) {
      return 'public_appearance';
    }
    return 'news_article';
  }

  private buildArticleDebugMetadata(enrichment: ArticleEnrichmentResult) {
    return {
      articleEnrichmentStatus: enrichment.status,
      articleResolutionMode: enrichment.resolutionMode,
      resolvedArticleUrl: enrichment.articleUrl ?? null,
      articleResolutionQuery: enrichment.resolutionQuery ?? null,
      resolverTitle: enrichment.resolverTitle ?? null,
      resolverSnippet: enrichment.resolverSnippet ?? null,
      resolverScore: enrichment.resolverScore ?? null,
      articleTitle: enrichment.articleTitle ?? null,
      articleExcerpt: enrichment.articleExcerpt ?? null,
      articleTextLength: enrichment.articleTextLength ?? null,
      articleErrorMessage: enrichment.errorMessage ?? null,
    };
  }

  private async enrichFeedEntry(
    entry: ParsedFeedEntry,
  ): Promise<ArticleEnrichmentResult> {
    const resolution = await this.resolveArticleUrl(entry);
    if (!resolution.articleUrl) {
      return {
        status: 'resolve_failed',
        resolutionMode: resolution.resolutionMode,
        articleUrl: null,
        resolutionQuery: resolution.resolutionQuery ?? null,
        resolverTitle: resolution.resolverTitle ?? null,
        resolverSnippet: resolution.resolverSnippet ?? null,
        resolverScore: resolution.resolverScore ?? null,
        errorMessage: resolution.errorMessage ?? 'article_url_unresolved',
      };
    }

    try {
      const response = await fetch(resolution.articleUrl, {
        headers: {
          'user-agent': 'YinjieApp/1.0 (+https://yinjie.app)',
          accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return {
          status: 'fetch_failed',
          resolutionMode: resolution.resolutionMode,
          articleUrl: resolution.articleUrl,
          resolutionQuery: resolution.resolutionQuery ?? null,
          resolverTitle: resolution.resolverTitle ?? null,
          resolverSnippet: resolution.resolverSnippet ?? null,
          resolverScore: resolution.resolverScore ?? null,
          errorMessage: `http_${response.status}`,
        };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        return {
          status: 'fetch_failed',
          resolutionMode: resolution.resolutionMode,
          articleUrl: response.url || resolution.articleUrl,
          resolutionQuery: resolution.resolutionQuery ?? null,
          resolverTitle: resolution.resolverTitle ?? null,
          resolverSnippet: resolution.resolverSnippet ?? null,
          resolverScore: resolution.resolverScore ?? null,
          errorMessage: `unsupported_content_type:${contentType || 'unknown'}`,
        };
      }

      const html = await response.text();
      const articleTitle =
        extractHtmlMetaContent(html, 'og:title') ||
        extractHtmlMetaContent(html, 'twitter:title', 'name') ||
        extractHtmlTitle(html);
      const articleExcerpt = this.extractArticleExcerpt(html);
      if (!articleExcerpt) {
        return {
          status: 'extract_failed',
          resolutionMode: resolution.resolutionMode,
          articleUrl: response.url || resolution.articleUrl,
          resolutionQuery: resolution.resolutionQuery ?? null,
          resolverTitle: resolution.resolverTitle ?? null,
          resolverSnippet: resolution.resolverSnippet ?? null,
          resolverScore: resolution.resolverScore ?? null,
          articleTitle: articleTitle || null,
          errorMessage: 'article_excerpt_empty',
        };
      }

      return {
        status:
          resolution.resolutionMode === 'direct_source'
            ? 'direct_success'
            : 'resolved_success',
        resolutionMode: resolution.resolutionMode,
        articleUrl: response.url || resolution.articleUrl,
        resolutionQuery: resolution.resolutionQuery ?? null,
        resolverTitle: resolution.resolverTitle ?? null,
        resolverSnippet: resolution.resolverSnippet ?? null,
        resolverScore: resolution.resolverScore ?? null,
        articleTitle: articleTitle || null,
        articleExcerpt,
        articleTextLength: articleExcerpt.length,
      };
    } catch (error) {
      return {
        status: 'fetch_failed',
        resolutionMode: resolution.resolutionMode,
        articleUrl: resolution.articleUrl,
        resolutionQuery: resolution.resolutionQuery ?? null,
        resolverTitle: resolution.resolverTitle ?? null,
        resolverSnippet: resolution.resolverSnippet ?? null,
        resolverScore: resolution.resolverScore ?? null,
        errorMessage:
          error instanceof Error ? error.message : 'article_fetch_failed',
      };
    }
  }

  private async resolveArticleUrl(
    entry: ParsedFeedEntry,
  ): Promise<ArticleResolutionResult> {
    if (entry.sourceUrl && !isGoogleNewsUrl(entry.sourceUrl)) {
      return {
        resolutionMode: 'direct_source',
        articleUrl: entry.sourceUrl,
      };
    }

    if (entry.sourceUrl && isGoogleNewsUrl(entry.sourceUrl)) {
      const googleReadUrl = this.toGoogleReadUrl(entry.sourceUrl);
      const host = extractUrlHost(entry.publisherUrl);
      const searchTitle = sanitizeSearchTitle(entry.title);
      const candidateQueries = [
        host ? `site:${host} ${searchTitle}` : '',
        `${searchTitle} ${entry.sourceName}`,
      ]
        .map((item) => item.trim())
        .filter(Boolean);

      for (const query of candidateQueries) {
        const searchEntries = await this.fetchFeedEntries(
          'Bing Search',
          this.buildBingSearchRssUrl(query),
        );
        const resolved = this.pickBestResolvedArticle(
          entry,
          searchEntries,
          host,
        );
        if (resolved) {
          return {
            resolutionMode: 'bing_search',
            articleUrl: resolved.sourceUrl,
            resolutionQuery: query,
            resolverTitle: resolved.title,
            resolverSnippet: resolved.snippet,
            resolverScore: resolved.score,
          };
        }
      }

      return {
        resolutionMode: 'google_read',
        articleUrl: googleReadUrl,
        errorMessage: 'google_news_article_only',
      };
    }

    return {
      resolutionMode: 'unresolved',
      articleUrl: null,
      errorMessage: 'source_url_missing',
    };
  }

  private toGoogleReadUrl(sourceUrl: string) {
    try {
      const url = new URL(sourceUrl);
      url.pathname = url.pathname.replace('/rss/articles/', '/read/');
      if (!url.searchParams.has('hl')) {
        url.searchParams.set('hl', 'zh-CN');
      }
      if (!url.searchParams.has('gl')) {
        url.searchParams.set('gl', 'CN');
      }
      if (!url.searchParams.has('ceid')) {
        url.searchParams.set('ceid', 'CN:zh-Hans');
      }
      return url.toString();
    } catch {
      return sourceUrl;
    }
  }

  private buildBingSearchRssUrl(query: string) {
    const url = new URL('https://www.bing.com/search');
    url.searchParams.set('format', 'rss');
    url.searchParams.set('q', query);
    return url.toString();
  }

  private pickBestResolvedArticle(
    entry: ParsedFeedEntry,
    candidates: ParsedFeedEntry[],
    preferredHost: string,
  ) {
    let bestMatch:
      | (ParsedFeedEntry & {
          score: number;
        })
      | null = null;
    for (const candidate of candidates) {
      const titleScore = computeTitleSimilarity(entry.title, candidate.title);
      const hostScore =
        preferredHost &&
        extractUrlHost(candidate.sourceUrl).includes(preferredHost)
          ? 0.12
          : 0;
      const publisherScore = normalizeComparableText(
        candidate.sourceName,
      ).includes(normalizeComparableText(entry.sourceName))
        ? 0.04
        : 0;
      const score = Math.min(1, titleScore + hostScore + publisherScore);
      if (score < 0.62) {
        continue;
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          ...candidate,
          score,
        };
      }
    }

    return bestMatch;
  }

  private extractArticleExcerpt(html: string) {
    const metaDescription =
      extractHtmlMetaContent(html, 'og:description') ||
      extractHtmlMetaContent(html, 'description', 'name') ||
      extractHtmlMetaContent(html, 'twitter:description', 'name');
    const scopedHtml =
      extractTagBlock(html, 'article') || extractTagBlock(html, 'main') || html;
    const paragraphs = extractParagraphTexts(scopedHtml);
    const fallbackParagraphs =
      paragraphs.length > 0 ? paragraphs : extractParagraphTexts(html);
    const preferredParts = [metaDescription, ...fallbackParagraphs].filter(
      (item, index, items) => item && items.indexOf(item) === index,
    );
    const excerpt = preferredParts.join(' ');
    return excerpt ? clipText(excerpt, 420) : '';
  }

  private async fetchFeedEntries(sourceName: string, feedUrl: string) {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          'user-agent': 'YinjieApp/1.0 (+https://yinjie.app)',
          accept: 'application/rss+xml, application/xml, text/xml',
        },
      });
      if (!response.ok) {
        return [];
      }

      const xml = await response.text();
      return this.parseFeedEntries(xml, sourceName);
    } catch {
      return [];
    }
  }

  private parseFeedEntries(xml: string, sourceName: string): ParsedFeedEntry[] {
    const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
    if (itemBlocks.length > 0) {
      return itemBlocks.flatMap((block) => {
        const source = extractSourceTag(block, sourceName);
        const title = cleanupFeedTitle(
          extractTagValue(block, 'title'),
          source.sourceName,
        );
        const sourceUrl = extractTagValue(block, 'link');
        const snippet = cleanupFeedSnippet(
          extractTagValue(block, 'description') ||
            extractTagValue(block, 'content:encoded'),
          title,
          source.sourceName,
        );
        if (!title || !sourceUrl) {
          return [];
        }

        return [
          {
            sourceName: source.sourceName,
            sourceUrl,
            publisherUrl: source.publisherUrl,
            title,
            snippet,
            publishedAt:
              normalizeFeedDate(extractTagValue(block, 'pubDate')) ??
              normalizeFeedDate(extractTagValue(block, 'dc:date')),
          } satisfies ParsedFeedEntry,
        ];
      });
    }

    const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
    return entryBlocks.flatMap((block) => {
      const source = extractSourceTag(block, sourceName);
      const title = cleanupFeedTitle(
        extractTagValue(block, 'title'),
        source.sourceName,
      );
      const sourceUrl = extractAtomLink(block);
      const snippet = cleanupFeedSnippet(
        extractTagValue(block, 'summary') || extractTagValue(block, 'content'),
        title,
        source.sourceName,
      );
      if (!title || !sourceUrl) {
        return [];
      }

      return [
        {
          sourceName: source.sourceName,
          sourceUrl,
          publisherUrl: source.publisherUrl,
          title,
          snippet,
          publishedAt:
            normalizeFeedDate(extractTagValue(block, 'updated')) ??
            normalizeFeedDate(extractTagValue(block, 'published')),
        } satisfies ParsedFeedEntry,
      ];
    });
  }

  private buildMockSignals(
    character: CharacterEntity,
    config: RealityLinkConfigValue,
    rules: RealWorldSyncRulesValue,
    now: Date,
  ): SignalSeed[] {
    if (character.sourceKey === WORLD_NEWS_DESK_SOURCE_KEY) {
      return this.buildMockWorldNewsSignals(config, now);
    }

    const subjectName = config.subjectName || character.name;
    const sourcePool = config.sourceAllowlist.length
      ? config.sourceAllowlist
      : rules.defaultSourceAllowlist;
    const subjectLabel =
      config.subjectType === 'organization_proxy' ? '该组织' : subjectName;
    const acceptedSeeds: SignalSeed[] = [
      {
        signalType: 'interview',
        sourceName: sourcePool[0] ?? '公开采访',
        title: `${subjectName} 在公开表达里继续强调长期节奏与产品判断`,
        snippet: `${subjectLabel} 今天的公开表达更偏克制、聚焦和长期导向。`,
        normalizedSummary: `${subjectName} 今天在公开场域再次释放了“长期主义、节奏控制和选择性发声”的信号。`,
        credibilityScore: 0.88,
        relevanceScore: 0.92,
        identityMatchScore: 0.95,
        status: 'accepted',
      },
      {
        signalType: 'official_post',
        sourceName: sourcePool[1] ?? sourcePool[0] ?? '官方公告',
        title: `${subjectName} 相关公开动态呈现出更强的执行推进和结果导向`,
        snippet: `${subjectLabel} 的外部动态表现为继续推进重点事项，而不是分散扩张。`,
        normalizedSummary: `${subjectName} 今天更像是在推进已经选定的重点，不适合在世界里表现成闲散或完全失焦。`,
        credibilityScore: 0.84,
        relevanceScore: 0.9,
        identityMatchScore: 0.93,
        status: 'accepted',
      },
      {
        signalType: 'news_article',
        sourceName: sourcePool[2] ?? sourcePool[0] ?? '主流媒体',
        title: `${subjectName} 今日外部舆论焦点集中在其最新表态与动作后续`,
        snippet: `${subjectLabel} 的公开动作正在被持续解读，说明今天更适合带一点现实温度。`,
        normalizedSummary: `${subjectName} 今天外部关注度不低，角色在聊天和内容里可以轻微带出现实关联，但不能变成新闻复读。`,
        credibilityScore: 0.8,
        relevanceScore: 0.86,
        identityMatchScore: 0.9,
        status: 'accepted',
      },
    ];
    const filteredSeed: SignalSeed = {
      signalType: 'other',
      sourceName: '低可信来源',
      title: `${subjectName} 的一条模糊传闻未被采纳`,
      snippet: `${subjectLabel} 有一条低可信传闻，但没有进入今日摘要。`,
      normalizedSummary: `${subjectName} 的一条低可信信号被系统过滤。`,
      credibilityScore: 0.28,
      relevanceScore: 0.35,
      identityMatchScore: 0.46,
      status: 'filtered_low_confidence',
    };

    return [...acceptedSeeds, filteredSeed].slice(
      0,
      Math.max(config.maxSignalsPerRun, 1),
    );
  }

  private buildMockWorldNewsSignals(
    config: RealityLinkConfigValue,
    now: Date,
  ): SignalSeed[] {
    const sourcePool = config.sourceAllowlist.length
      ? config.sourceAllowlist
      : DEFAULT_WORLD_NEWS_SOURCE_LABELS;
    const seeds: SignalSeed[] = [
      {
        signalType: 'news_article',
        sourceName: sourcePool[0] ?? 'Reuters',
        title: '全球市场关注主要经济体最新政策信号',
        snippet: '市场更关心政策落地节奏和后续传导，而不是单次表态本身。',
        normalizedSummary:
          '今日全球经济新闻的重点在于政策信号开始影响市场预期，后续看执行细节。',
        credibilityScore: 0.88,
        relevanceScore: 0.94,
        identityMatchScore: 0.99,
        status: 'accepted',
        sourceUrl: 'https://example.com/world-news/mock-policy',
        publishedAt: now,
        metadataPayload: {
          providerMode: 'mock',
          deskMode: 'world_news',
        },
      },
      {
        signalType: 'news_article',
        sourceName: sourcePool[1] ?? sourcePool[0] ?? 'BBC',
        title: '科技公司新动作继续把 AI 竞争推向应用层',
        snippet: '今天更值得看的是谁在真正落地产品，而不是谁又喊了新口号。',
        normalizedSummary:
          '科技线新闻的主线仍是 AI 从模型竞争转向应用、分发和商业化落地。',
        credibilityScore: 0.86,
        relevanceScore: 0.9,
        identityMatchScore: 0.99,
        status: 'accepted',
        sourceUrl: 'https://example.com/world-news/mock-ai',
        publishedAt: new Date(now.getTime() - 60 * 60 * 1000),
        metadataPayload: {
          providerMode: 'mock',
          deskMode: 'world_news',
        },
      },
      {
        signalType: 'news_article',
        sourceName: sourcePool[2] ?? sourcePool[0] ?? 'The Verge',
        title: '多地公共议题进入“先试点、再放量”的观察阶段',
        snippet: '真正重要的变量不是口头方向，而是试点之后会不会快速扩散。',
        normalizedSummary:
          '政策与社会议题今天的看点不在口号，而在是否出现可持续推进的试点信号。',
        credibilityScore: 0.83,
        relevanceScore: 0.86,
        identityMatchScore: 0.99,
        status: 'accepted',
        sourceUrl: 'https://example.com/world-news/mock-policy-trial',
        publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        metadataPayload: {
          providerMode: 'mock',
          deskMode: 'world_news',
        },
      },
    ];

    return seeds.slice(0, Math.max(config.maxSignalsPerRun, 1));
  }

  private async createDigest(
    character: CharacterEntity,
    config: RealityLinkConfigValue,
    acceptedSignals: CharacterRealWorldSignalEntity[],
    now: Date,
  ) {
    const syncDate = formatSyncDate(now);
    const isWorldNewsDesk = character.sourceKey === WORLD_NEWS_DESK_SOURCE_KEY;
    const scenePatchPayload = this.buildScenePatch(character, acceptedSignals);
    const globalOverlay = acceptedSignals.length
      ? isWorldNewsDesk
        ? `今天已确认的新闻线索有：${acceptedSignals
            .map((item) => item.title)
            .join(
              '；',
            )}。聊天、发圈和公开内容都只围着这些线索展开；能说清就说清，没把握的地方直接承认。`
        : `今天与 ${config.subjectName || character.name} 相关的外部现实锚点集中在：${acceptedSignals
            .map((item) => item.title)
            .join('；')}。表达时带着这层现实背景，但不要变成新闻播报。`
      : '';
    const status: RealWorldDigestStatusValue =
      config.applyMode === 'live' ? 'active' : 'draft';
    const appliedMode: RealWorldDigestApplyModeValue | null =
      config.applyMode === 'live' ? 'live' : 'shadow';

    if (config.applyMode === 'live') {
      await this.digestRepo.update(
        {
          characterId: character.id,
          status: 'active',
        },
        {
          status: 'superseded',
        },
      );
    }

    const digest = this.digestRepo.create({
      id: `real_world_digest_${randomUUID()}`,
      characterId: character.id,
      syncDate,
      status,
      signalIds: acceptedSignals.map((item) => item.id),
      dailySummary: acceptedSignals.length
        ? isWorldNewsDesk
          ? `今天值得看的新闻动向：${acceptedSignals
              .map((item) => item.normalizedSummary ?? item.title)
              .join(' ')}`
          : `${config.subjectName || character.name} 今天的现实概况：${acceptedSignals
              .map((item) => item.normalizedSummary ?? item.title)
              .join(' ')}`
        : isWorldNewsDesk
          ? '今天暂时没有抓到足够可信的新鲜公开新闻。'
          : `${config.subjectName || character.name} 今天暂无可用外部现实信号。`,
      behaviorSummary: acceptedSignals.length
        ? isWorldNewsDesk
          ? '今天说新闻时先把事实捋顺，再带影响和还没坐实的地方。'
          : `${config.subjectName || character.name} 今天更适合表现为关注现实进展、表达克制但有明确态度。`
        : null,
      stanceShiftSummary: acceptedSignals.length
        ? isWorldNewsDesk
          ? '今天别写成播报稿，也别像热搜搬运；更像一个真的在盯新闻的人。'
          : `今天的公开动作让角色更像“带着现实背景在交流”，而不是脱离现实的静态人设。`
        : null,
      scenePatchPayload,
      globalOverlay,
      realityMomentAnchorSignalId: acceptedSignals[0]?.id ?? null,
      realityMomentBrief: acceptedSignals[0]
        ? isWorldNewsDesk
          ? `如果这会儿要发更新，先从「${acceptedSignals[0].title}」说起。`
          : `优先用「${acceptedSignals[0].title}」作为今天的现实发圈锚点。`
        : null,
      appliedMode,
      appliedAt: config.applyMode === 'live' ? now : null,
      generationTracePayload: {
        signalCount: acceptedSignals.length,
        providerMode:
          (acceptedSignals[0]?.metadataPayload?.providerMode as string) ??
          'mock',
      },
    });

    return this.digestRepo.save(digest);
  }

  private buildScenePatch(
    character: Pick<CharacterEntity, 'name' | 'sourceKey'>,
    acceptedSignals: CharacterRealWorldSignalEntity[],
  ): RealWorldScenePatchPayloadValue {
    if (character.sourceKey === WORLD_NEWS_DESK_SOURCE_KEY) {
      const signalSummary = acceptedSignals
        .map(
          (item) =>
            `${item.title}${item.sourceName ? `（${item.sourceName}）` : ''}`,
        )
        .join('；');
      return {
        ...DEFAULT_REAL_WORLD_SCENE_PATCH,
        chat: signalSummary
          ? `今天你盯到的新闻线索是：${signalSummary}。聊天时就围着这些事说，先把事实捋顺，再补背景和影响；没把握的地方直接说。`
          : '今天暂时没有足够可信的新鲜新闻，聊天时直接说明目前没有新的高置信度更新。',
        moments_post: signalSummary
          ? `今天发朋友圈时，只能基于这些线索选材：${signalSummary}。挑当前时段最值得看的 2-4 件事，写得像顺手整理，不要像播报稿。`
          : '如果今天发朋友圈，明确说明暂时没有抓到足够可信的新鲜新闻，不要编造条目。',
        moments_comment:
          '评论别人朋友圈时，只有在你真能补事实、背景或影响时再开口，别把评论区当小播音间。',
        feed_post:
          '如果要输出更公开的内容，优先把一个值得看的变化讲透，不做情绪站队。',
        channel_post:
          '如果在更公开场域说话，挑一个今天最值得继续盯的主线讲清楚。',
        feed_comment: '只在你能补一条关键事实或关键变量时评论。',
        greeting: '',
        proactive: signalSummary
          ? '只有遇到显著重要且与用户关注方向相关的新闻时才主动提醒，不刷存在感。'
          : '',
      };
    }

    const subjectName = character.name;
    const signalSummary = acceptedSignals.map((item) => item.title).join('；');
    return {
      ...DEFAULT_REAL_WORLD_SCENE_PATCH,
      chat: signalSummary
        ? `今天与 ${subjectName} 相关的现实锚点是：${signalSummary}。聊天时可以自然带出今天更贴近现实的关注点，但不要直接复述新闻标题。`
        : '',
      moments_post: signalSummary
        ? `今天如果发朋友圈，优先从「${acceptedSignals[0]?.title ?? signalSummary}」延展成角色自己的观察、情绪或一句话判断，不要写成公告。`
        : '',
      moments_comment: signalSummary
        ? `今天评论用户朋友圈时，可以轻微带出现实世界里的关注点，但仍然要像熟人自然接话。`
        : '',
      feed_post: signalSummary
        ? `今天在公开内容场域更适合输出和现实进展有关的观点，不要空泛。`
        : '',
      channel_post: signalSummary
        ? `今天的视频号或公开内容可以围绕现实进展展开，但要保持角色化表达。`
        : '',
      feed_comment: signalSummary
        ? `今天评论公开内容时，可适度体现角色今天的现实焦点与判断倾向。`
        : '',
      greeting: '',
      proactive: signalSummary
        ? `今天如果主动联系用户，理由应当和今天的现实锚点有关，而不是无缘无故打扰。`
        : '',
    };
  }

  private renderQuery(config: RealityLinkConfigValue) {
    return (
      config.queryTemplate || '{{subjectName}} 最新新闻 公开动态'
    ).replace(/\{\{subjectName\}\}/g, config.subjectName);
  }

  private renderWorldNewsDeskSearchQueries(config: RealityLinkConfigValue) {
    const rendered = this.renderQuery(config);
    const queries = splitSearchQueries(rendered);
    return queries.length > 0
      ? queries
      : [...DEFAULT_WORLD_NEWS_SEARCH_QUERIES];
  }

  private renderSearchQuerySummary(
    character: Pick<CharacterEntity, 'sourceKey'>,
    config: RealityLinkConfigValue,
  ) {
    if (character.sourceKey === WORLD_NEWS_DESK_SOURCE_KEY) {
      return this.renderWorldNewsDeskSearchQueries(config).join(' | ');
    }

    return this.renderQuery(config);
  }

  private toSignalRecord(signal: CharacterRealWorldSignalEntity) {
    return {
      id: signal.id,
      characterId: signal.characterId,
      syncDate: signal.syncDate,
      signalType: signal.signalType,
      title: signal.title,
      sourceName: signal.sourceName,
      sourceUrl: signal.sourceUrl ?? null,
      publishedAt: signal.publishedAt?.toISOString() ?? null,
      capturedAt: signal.capturedAt.toISOString(),
      snippet: signal.snippet ?? null,
      normalizedSummary: signal.normalizedSummary ?? null,
      credibilityScore: signal.credibilityScore,
      relevanceScore: signal.relevanceScore,
      identityMatchScore: signal.identityMatchScore,
      status: signal.status,
      metadata: signal.metadataPayload ?? null,
    };
  }

  private toDigestRecord(digest: CharacterRealWorldDigestEntity) {
    return {
      id: digest.id,
      characterId: digest.characterId,
      syncDate: digest.syncDate,
      status: digest.status,
      signalIds: [...(digest.signalIds ?? [])],
      dailySummary: digest.dailySummary,
      behaviorSummary: digest.behaviorSummary ?? null,
      stanceShiftSummary: digest.stanceShiftSummary ?? null,
      scenePatchPayload: cloneScenePatchPayload(digest.scenePatchPayload),
      globalOverlay: digest.globalOverlay ?? null,
      realityMomentAnchorSignalId: digest.realityMomentAnchorSignalId ?? null,
      realityMomentBrief: digest.realityMomentBrief ?? null,
      appliedMode: digest.appliedMode ?? null,
      appliedAt: digest.appliedAt?.toISOString() ?? null,
      createdAt: digest.createdAt.toISOString(),
      updatedAt: digest.updatedAt.toISOString(),
    };
  }

  private toRunRecord(run: CharacterRealWorldSyncRunEntity) {
    return {
      id: run.id,
      characterId: run.characterId,
      runType: run.runType,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      searchQuery: run.searchQuery ?? null,
      acceptedSignalCount: run.acceptedSignalCount,
      filteredSignalCount: run.filteredSignalCount,
      digestId: run.digestId ?? null,
      errorMessage: run.errorMessage ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }
}
