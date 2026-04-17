import { createHash } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  CYBER_AVATAR_REAL_WORLD_SYNC_CRON,
} from './cyber-avatar.constants';
import { CyberAvatarRealWorldBriefEntity } from './cyber-avatar-real-world-brief.entity';
import { CyberAvatarRealWorldItemEntity } from './cyber-avatar-real-world-item.entity';
import { CyberAvatarRunEntity } from './cyber-avatar-run.entity';
import { CyberAvatarRulesService } from './cyber-avatar-rules.service';
import { CyberAvatarService } from './cyber-avatar.service';
import type {
  CyberAvatarInteractionRules,
  CyberAvatarRealWorldBriefStatus,
  CyberAvatarRealWorldItemStatus,
  CyberAvatarRealWorldProviderMode,
  CyberAvatarRunTrigger,
} from './cyber-avatar.types';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown, limit = 6) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => normalizeString(item))
      .filter(Boolean),
  )].slice(0, limit);
}

function safeDate(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function formatSyncDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function renderTemplate(
  template: string,
  variables: Record<string, string | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

type QueryPlanEntry = {
  queryText: string;
  topicTags: string[];
};

type ParsedFeedEntry = {
  sourceName: string;
  sourceUrl: string;
  publisherUrl?: string | null;
  title: string;
  snippet: string;
  publishedAt?: Date | null;
};

type RealWorldItemSeed = {
  providerMode: CyberAvatarRealWorldProviderMode;
  status: CyberAvatarRealWorldItemStatus;
  queryText: string;
  sourceName: string;
  sourceUrl?: string | null;
  title: string;
  snippet: string;
  normalizedSummary: string;
  topicTags: string[];
  credibilityScore: number;
  relevanceScore: number;
  compositeScore: number;
  publishedAt?: Date | null;
  metadata: Record<string, unknown> | null;
};

type RealWorldBriefDraft = {
  title: string;
  summary: string;
  bulletPoints: string[];
  queryHints: string[];
  needSignals: string[];
};

@Injectable()
export class CyberAvatarRealWorldService {
  private readonly logger = new Logger(CyberAvatarRealWorldService.name);

  constructor(
    @InjectRepository(CyberAvatarRealWorldItemEntity)
    private readonly itemRepo: Repository<CyberAvatarRealWorldItemEntity>,
    @InjectRepository(CyberAvatarRealWorldBriefEntity)
    private readonly briefRepo: Repository<CyberAvatarRealWorldBriefEntity>,
    @InjectRepository(CyberAvatarRunEntity)
    private readonly runRepo: Repository<CyberAvatarRunEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly rulesService: CyberAvatarRulesService,
    private readonly cyberAvatar: CyberAvatarService,
  ) {}

  @Cron(CYBER_AVATAR_REAL_WORLD_SYNC_CRON)
  async runSyncCron() {
    const rules = await this.rulesService.getRules();
    if (
      !rules.enabled ||
      !rules.interaction.enabled ||
      !rules.interaction.realWorldSyncEnabled ||
      rules.pauseAutoUpdates
    ) {
      return;
    }

    await this.runSync({ trigger: 'scheduler' });
  }

  async getOverview() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const rules = await this.rulesService.getRules();
    const profile = await this.cyberAvatar.getProfile();
    const [recentItems, recentBriefs, latestAccepted, latestBrief] =
      await Promise.all([
        this.itemRepo.find({
          where: { ownerId: owner.id },
          order: { capturedAt: 'DESC', createdAt: 'DESC' },
          take: 12,
        }),
        this.briefRepo.find({
          where: { ownerId: owner.id },
          order: { createdAt: 'DESC', updatedAt: 'DESC' },
          take: 8,
        }),
        this.itemRepo.findOne({
          where: { ownerId: owner.id, status: 'accepted' },
          order: { capturedAt: 'DESC', createdAt: 'DESC' },
        }),
        this.briefRepo.findOne({
          where: { ownerId: owner.id },
          order: { createdAt: 'DESC', updatedAt: 'DESC' },
        }),
      ]);

    return {
      rules: rules.interaction,
      stats: {
        acceptedItems: recentItems.filter((item) => item.status === 'accepted')
          .length,
        filteredItems: recentItems.filter((item) => item.status !== 'accepted')
          .length,
        activeBriefs: recentBriefs.filter((item) => item.status === 'active')
          .length,
        latestAcceptedAt: safeDate(latestAccepted?.capturedAt),
        latestBriefAt: safeDate(latestBrief?.createdAt),
      },
      recentItems: recentItems.map((item) => this.serializeItem(item)),
      recentBriefs: recentBriefs.map((item) => this.serializeBrief(item)),
      latestBrief: latestBrief ? this.serializeBrief(latestBrief) : null,
      queryPreview: this.buildQueryPlan(profile, owner.username ?? '', rules.interaction).map(
        (item) => item.queryText,
      ),
    };
  }

  async listItems(limit?: number) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const items = await this.itemRepo.find({
      where: { ownerId: owner.id },
      order: { capturedAt: 'DESC', createdAt: 'DESC' },
      take: limit ?? 30,
    });
    return items.map((item) => this.serializeItem(item));
  }

  async listBriefs(limit?: number) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const briefs = await this.briefRepo.find({
      where: { ownerId: owner.id },
      order: { createdAt: 'DESC', updatedAt: 'DESC' },
      take: limit ?? 20,
    });
    return briefs.map((item) => this.serializeBrief(item));
  }

  async runSync(options?: { trigger?: CyberAvatarRunTrigger }) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const rules = await this.rulesService.getRules();
    const profile = await this.cyberAvatar.getProfile();
    const trigger = options?.trigger ?? 'manual';

    if (!rules.enabled || !rules.interaction.enabled) {
      return this.createSkippedRun(owner.id, trigger, profile.version, 'disabled');
    }
    if (!rules.interaction.realWorldSyncEnabled) {
      return this.createSkippedRun(
        owner.id,
        trigger,
        profile.version,
        'real_world_sync_disabled',
      );
    }
    if (trigger === 'scheduler') {
      const lastSuccess = await this.runRepo.findOne({
        where: {
          ownerId: owner.id,
          mode: 'real_world_sync',
          status: 'success',
        },
        order: { createdAt: 'DESC' },
      });
      if (
        lastSuccess?.createdAt &&
        Date.now() - lastSuccess.createdAt.getTime() <
          rules.interaction.syncEveryHours * 60 * 60 * 1000
      ) {
        return this.createSkippedRun(
          owner.id,
          trigger,
          profile.version,
          'real_world_sync_cooldown',
        );
      }
    }

    const queryPlan = this.buildQueryPlan(
      profile,
      owner.username ?? '',
      rules.interaction,
    );
    if (!queryPlan.length) {
      return this.createSkippedRun(
        owner.id,
        trigger,
        profile.version,
        'no_real_world_queries',
      );
    }

    const now = new Date();
    let promptSnapshot: Record<string, unknown> | null = null;
    let llmOutputPayload: Record<string, unknown> | null = null;

    try {
      const seeds = await this.collectSeeds(queryPlan, rules.interaction, now);
      const savedItems = await this.saveItems(owner.id, seeds, now);
      const acceptedItems = savedItems
        .filter((item) => item.status === 'accepted')
        .sort((left, right) => {
          if (left.capturedAt.getTime() !== right.capturedAt.getTime()) {
            return right.capturedAt.getTime() - left.capturedAt.getTime();
          }
          return right.createdAt.getTime() - left.createdAt.getTime();
        })
        .slice(0, rules.interaction.maxAcceptedItemsPerRun);

      let briefEntity: CyberAvatarRealWorldBriefEntity | null = null;
      if (acceptedItems.length > 0) {
        const briefInputItems = acceptedItems.slice(
          0,
          rules.interaction.maxItemsPerBrief,
        );
        const briefPrompt = renderTemplate(
          rules.interaction.promptTemplates.realWorldBriefPrompt,
          {
            profile: JSON.stringify(profile, null, 2),
            items: JSON.stringify(
              briefInputItems.map((item) => this.serializeItem(item)),
              null,
              2,
            ),
          },
        );
        promptSnapshot = {
          realWorldBriefPrompt: briefPrompt,
          queryPlan: queryPlan.map((item) => item.queryText),
        };
        llmOutputPayload = await this.ai.generateJsonObject({
          prompt: briefPrompt,
          maxTokens: 1200,
          temperature: 0.25,
          fallback: this.buildFallbackBriefDraft(briefInputItems, queryPlan),
          usageContext: {
            surface: trigger === 'scheduler' ? 'scheduler' : 'admin',
            scene: 'cyber_avatar_real_world_brief',
            scopeType: 'world',
            scopeId: owner.id,
            scopeLabel: owner.username?.trim() || 'world-owner',
            ownerId: owner.id,
          },
        });
        const normalizedBrief = this.normalizeBriefDraft(
          llmOutputPayload,
          briefInputItems,
          queryPlan,
        );
        await this.briefRepo.update(
          { ownerId: owner.id, status: 'active' },
          { status: 'archived' },
        );
        briefEntity = await this.briefRepo.save(
          this.briefRepo.create({
            ownerId: owner.id,
            status: 'active',
            briefDate: formatSyncDate(now),
            title: normalizedBrief.title,
            summary: normalizedBrief.summary,
            bulletPoints: normalizedBrief.bulletPoints,
            queryHints: normalizedBrief.queryHints,
            needSignals: normalizedBrief.needSignals,
            relatedItemIds: briefInputItems.map((item) => item.id),
            metadataPayload: {
              acceptedItemCount: acceptedItems.length,
              providerMode: rules.interaction.providerMode,
            },
          }),
        );
      }

      let createdSignalCount = 0;
      if (rules.interaction.createSignals) {
        for (const item of acceptedItems) {
          const captured = await this.cyberAvatar.captureSignal({
            ownerId: owner.id,
            signalType: 'real_world_item',
            sourceSurface: 'real_world',
            sourceEntityType: 'cyber_avatar_real_world_item',
            sourceEntityId: item.id,
            dedupeKey: `cyber_avatar_real_world_item:${item.dedupeHash ?? item.id}`,
            summaryText: `[真实世界条目] ${item.normalizedSummary}`,
            payload: {
              sourceName: item.sourceName,
              sourceUrl: item.sourceUrl ?? null,
              topicTags: item.topicTags ?? [],
              compositeScore: item.compositeScore,
            },
            occurredAt: item.publishedAt ?? item.capturedAt,
          });
          if (captured) {
            createdSignalCount += 1;
          }
        }

        if (briefEntity) {
          const captured = await this.cyberAvatar.captureSignal({
            ownerId: owner.id,
            signalType: 'real_world_brief',
            sourceSurface: 'real_world',
            sourceEntityType: 'cyber_avatar_real_world_brief',
            sourceEntityId: briefEntity.id,
            dedupeKey: `cyber_avatar_real_world_brief:${briefEntity.briefDate}:${(
              briefEntity.relatedItemIds ?? []
            ).join(',')}`,
            summaryText: `[真实世界简报] ${briefEntity.summary}`,
            payload: {
              bulletPoints: briefEntity.bulletPoints ?? [],
              queryHints: briefEntity.queryHints ?? [],
              needSignals: briefEntity.needSignals ?? [],
            },
            occurredAt: briefEntity.createdAt,
          });
          if (captured) {
            createdSignalCount += 1;
          }
        }
      }

      const run = await this.runRepo.save(
        this.runRepo.create({
          ownerId: owner.id,
          mode: 'real_world_sync',
          trigger,
          status: 'success',
          signalCount: acceptedItems.length,
          profileVersion: profile.version,
          windowStartedAt:
            acceptedItems[acceptedItems.length - 1]?.publishedAt ?? now,
          windowEndedAt: acceptedItems[0]?.publishedAt ?? now,
          inputSnapshot: {
            queryPlan,
            providerMode: rules.interaction.providerMode,
          },
          aggregationPayload: {
            totalItems: savedItems.length,
            acceptedItems: acceptedItems.length,
            filteredItems: savedItems.length - acceptedItems.length,
            itemIds: savedItems.map((item) => item.id),
            briefId: briefEntity?.id ?? null,
            needSignals:
              briefEntity?.needSignals ??
              llmOutputPayload?.needSignals ??
              [],
          },
          promptSnapshot,
          llmOutputPayload,
          mergeDiffPayload: {
            createdSignalCount,
            relatedBriefId: briefEntity?.id ?? null,
            relatedItemIds: acceptedItems.map((item) => item.id),
            feedNeedDiscoveryEnabled: rules.interaction.feedNeedDiscoveryEnabled,
          },
        }),
      );
      return this.serializeRunDetail(run);
    } catch (error) {
      this.logger.error('Cyber avatar real world sync failed', error);
      const run = await this.runRepo.save(
        this.runRepo.create({
          ownerId: owner.id,
          mode: 'real_world_sync',
          trigger,
          status: 'failed',
          signalCount: 0,
          profileVersion: profile.version,
          inputSnapshot: {
            queryPlan: queryPlan.map((item) => item.queryText),
            providerMode: rules.interaction.providerMode,
          },
          promptSnapshot,
          llmOutputPayload,
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : 'Cyber avatar real world sync failed',
        }),
      );
      return this.serializeRunDetail(run);
    }
  }

  private buildQueryPlan(
    profile: Awaited<ReturnType<CyberAvatarService['getProfile']>>,
    ownerName: string,
    rules: CyberAvatarInteractionRules,
  ): QueryPlanEntry[] {
    const manualQueries = rules.ownerQueryOverrides
      .map((item) => normalizeString(item))
      .filter(Boolean);
    if (manualQueries.length > 0) {
      return manualQueries.slice(0, rules.maxQueriesPerRun).map((queryText) => ({
        queryText,
        topicTags: [queryText],
      }));
    }

    const topicSeeds = [
      ...profile.liveState.focus,
      ...profile.liveState.activeTopics,
      ...profile.recentState.recurringTopics,
      ...profile.recentState.recentGoals,
      ...normalizeStringArray((ownerName || '').split(/[，,、/]/), 4),
    ]
      .map((item) => normalizeString(item))
      .filter((item) => item.length >= 2);
    const dedupedTopics = [...new Set(topicSeeds)].slice(0, rules.maxQueriesPerRun);

    return dedupedTopics.map((topic) => ({
      queryText: `${topic} 最新进展`,
      topicTags: [topic],
    }));
  }

  private async collectSeeds(
    queryPlan: QueryPlanEntry[],
    rules: CyberAvatarInteractionRules,
    now: Date,
  ) {
    if (rules.providerMode === 'google_news_rss') {
      const liveSeeds = await this.collectGoogleNewsSeeds(queryPlan, rules, now);
      const hasAccepted = liveSeeds.some((item) => item.status === 'accepted');
      if (hasAccepted || !rules.googleNews.fallbackToMockOnEmpty) {
        return liveSeeds;
      }
    }

    return this.buildMockSeeds(queryPlan, rules, now);
  }

  private async collectGoogleNewsSeeds(
    queryPlan: QueryPlanEntry[],
    rules: CyberAvatarInteractionRules,
    now: Date,
  ) {
    const allSeeds = await Promise.all(
      queryPlan.map(async (plan) => {
        const entries = await this.fetchFeedEntries(
          'Google News',
          this.buildGoogleNewsSearchUrl(plan.queryText, rules),
        );
        const recencyCutoff = new Date(
          now.getTime() - rules.defaultRecencyHours * 60 * 60 * 1000,
        );
        const dedupe = new Set<string>();
        return entries
          .slice(0, Math.max(rules.googleNews.maxEntriesPerQuery, 1))
          .map((entry) =>
            this.classifyGoogleNewsEntry(
              entry,
              plan,
              rules,
              now,
              recencyCutoff,
              dedupe,
            ),
          )
          .filter((item): item is RealWorldItemSeed => Boolean(item));
      }),
    );

    return allSeeds
      .flat()
      .sort((left, right) => {
        if (left.compositeScore !== right.compositeScore) {
          return right.compositeScore - left.compositeScore;
        }
        const leftTs = left.publishedAt?.getTime() ?? 0;
        const rightTs = right.publishedAt?.getTime() ?? 0;
        return rightTs - leftTs;
      });
  }

  private buildMockSeeds(
    queryPlan: QueryPlanEntry[],
    rules: CyberAvatarInteractionRules,
    now: Date,
  ) {
    return queryPlan.flatMap((plan, index) => {
      const topic = plan.topicTags[0] ?? plan.queryText;
      return [
        {
          providerMode: 'mock' as const,
          status: 'accepted' as const,
          queryText: plan.queryText,
          sourceName: 'Mock Intelligence',
          sourceUrl: `https://example.com/cyber-avatar/${encodeURIComponent(topic)}`,
          title: `${topic} 进入新的公开讨论周期`,
          snippet: `围绕“${topic}”的公开信息正在增加，适合整理给世界主人做后续观察。`,
          normalizedSummary: `${topic} 最近在公开讨论中热度上升，值得继续跟踪。`,
          topicTags: plan.topicTags,
          credibilityScore: 0.72,
          relevanceScore: Math.max(0.6, 0.86 - index * 0.04),
          compositeScore: Math.max(0.62, 0.82 - index * 0.03),
          publishedAt: new Date(now.getTime() - index * 90 * 60 * 1000),
          metadata: {
            providerMode: 'mock',
            fallbackReason: `provider:${rules.providerMode}`,
          },
        },
      ];
    });
  }

  private buildGoogleNewsSearchUrl(
    query: string,
    rules: CyberAvatarInteractionRules,
  ) {
    const url = new URL('https://news.google.com/rss/search');
    url.searchParams.set('q', query);
    url.searchParams.set('hl', rules.googleNews.editionLanguage);
    url.searchParams.set('gl', rules.googleNews.editionRegion);
    url.searchParams.set('ceid', rules.googleNews.editionCeid);
    return url.toString();
  }

  private classifyGoogleNewsEntry(
    entry: ParsedFeedEntry,
    plan: QueryPlanEntry,
    rules: CyberAvatarInteractionRules,
    now: Date,
    recencyCutoff: Date,
    dedupe: Set<string>,
  ): RealWorldItemSeed | null {
    if (
      entry.publishedAt &&
      entry.publishedAt.getTime() < recencyCutoff.getTime()
    ) {
      return null;
    }

    if (
      this.matchesSourcePattern(
        entry.sourceName,
        entry.publisherUrl,
        rules.sourceBlocklist,
      )
    ) {
      return {
        providerMode: 'google_news_rss',
        status: 'filtered_blocked_source',
        queryText: plan.queryText,
        sourceName: entry.sourceName,
        sourceUrl: entry.sourceUrl,
        title: entry.title,
        snippet: entry.snippet,
        normalizedSummary: `${entry.title}${entry.snippet ? `：${entry.snippet}` : ''}`,
        topicTags: plan.topicTags,
        credibilityScore: 0.1,
        relevanceScore: 0.1,
        compositeScore: 0.1,
        publishedAt: entry.publishedAt ?? now,
        metadata: {
          providerMode: 'google_news_rss',
          publisherUrl: entry.publisherUrl ?? null,
        },
      };
    }

    const dedupeKey = normalizeComparableText(
      `${entry.title} ${entry.sourceName} ${entry.sourceUrl}`,
    );
    if (!dedupeKey) {
      return null;
    }
    if (dedupe.has(dedupeKey)) {
      return {
        providerMode: 'google_news_rss',
        status: 'filtered_duplicate',
        queryText: plan.queryText,
        sourceName: entry.sourceName,
        sourceUrl: entry.sourceUrl,
        title: entry.title,
        snippet: entry.snippet,
        normalizedSummary: `${entry.title}${entry.snippet ? `：${entry.snippet}` : ''}`,
        topicTags: plan.topicTags,
        credibilityScore: 0.2,
        relevanceScore: 0.2,
        compositeScore: 0.2,
        publishedAt: entry.publishedAt ?? now,
        metadata: {
          providerMode: 'google_news_rss',
          publisherUrl: entry.publisherUrl ?? null,
        },
      };
    }
    dedupe.add(dedupeKey);

    const allowlistMatched = this.matchesSourcePattern(
      entry.sourceName,
      entry.publisherUrl,
      rules.sourceAllowlist,
    );
    const queryMatchScore = this.computeQueryMatchScore(plan.queryText, entry);
    const credibilityScore = this.computeCredibilityScore(
      entry,
      allowlistMatched,
    );
    const relevanceScore = this.computeRelevanceScore(
      queryMatchScore,
      entry,
      now,
      recencyCutoff,
      allowlistMatched,
    );
    const compositeScore =
      (queryMatchScore + credibilityScore + relevanceScore) / 3;

    return {
      providerMode: 'google_news_rss',
      status:
        compositeScore >= rules.minimumItemScore
          ? 'accepted'
          : 'filtered_low_score',
      queryText: plan.queryText,
      sourceName: entry.sourceName,
      sourceUrl: entry.sourceUrl,
      title: entry.title,
      snippet: entry.snippet,
      normalizedSummary: `${entry.title}${entry.snippet ? `：${entry.snippet}` : ''}`,
      topicTags: plan.topicTags,
      credibilityScore,
      relevanceScore,
      compositeScore,
      publishedAt: entry.publishedAt ?? now,
      metadata: {
        providerMode: 'google_news_rss',
        publisherUrl: entry.publisherUrl ?? null,
        allowlistMatched,
        queryMatchScore,
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

  private computeQueryMatchScore(queryText: string, entry: ParsedFeedEntry) {
    const queryTokens = normalizeFeedText(queryText)
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);
    if (queryTokens.length === 0) {
      return 0.66;
    }

    const haystack = normalizeComparableText(`${entry.title} ${entry.snippet}`);
    const matched = queryTokens.filter((token) =>
      haystack.includes(normalizeComparableText(token)),
    ).length;
    if (matched === 0) {
      return 0.34;
    }

    return Math.min(0.98, 0.48 + (matched / queryTokens.length) * 0.46);
  }

  private computeCredibilityScore(
    entry: ParsedFeedEntry,
    allowlistMatched: boolean,
  ) {
    const sourceFingerprint = normalizeComparableText(
      `${entry.sourceName} ${entry.publisherUrl ?? ''}`,
    );
    let score = 0.7;
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
      score -= 0.12;
    }

    return Math.max(0.2, Math.min(0.96, score));
  }

  private computeRelevanceScore(
    queryMatchScore: number,
    entry: ParsedFeedEntry,
    now: Date,
    recencyCutoff: Date,
    allowlistMatched: boolean,
  ) {
    const recencyWindowMs = Math.max(now.getTime() - recencyCutoff.getTime(), 1);
    const publishedAtTs = entry.publishedAt?.getTime() ?? now.getTime();
    const ageMs = Math.max(0, now.getTime() - publishedAtTs);
    const freshnessRatio = Math.max(0, 1 - ageMs / recencyWindowMs);

    let score = 0.4 + queryMatchScore * 0.34 + freshnessRatio * 0.18;
    if (entry.snippet) {
      score += 0.04;
    }
    if (allowlistMatched) {
      score += 0.04;
    }

    return Math.max(0.2, Math.min(0.98, score));
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

      return this.parseFeedEntries(await response.text(), sourceName);
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
            normalizeFeedDate(extractTagValue(block, 'published')) ??
            normalizeFeedDate(extractTagValue(block, 'updated')),
        } satisfies ParsedFeedEntry,
      ];
    });
  }

  private async saveItems(
    ownerId: string,
    seeds: RealWorldItemSeed[],
    now: Date,
  ) {
    const saved: CyberAvatarRealWorldItemEntity[] = [];
    for (const seed of seeds) {
      const dedupeHash = createHash('sha1')
        .update(
          `${ownerId}:${seed.title}:${seed.sourceName}:${seed.sourceUrl ?? seed.queryText}`,
        )
        .digest('hex');
      const existing = await this.itemRepo.findOne({
        where: { ownerId, dedupeHash },
      });
      if (existing) {
        saved.push(existing);
        continue;
      }

      saved.push(
        await this.itemRepo.save(
          this.itemRepo.create({
            ownerId,
            status: seed.status,
            providerMode: seed.providerMode,
            queryText: seed.queryText,
            sourceName: seed.sourceName,
            sourceUrl: seed.sourceUrl ?? null,
            title: seed.title,
            snippet: seed.snippet,
            normalizedSummary: seed.normalizedSummary,
            topicTags: seed.topicTags,
            credibilityScore: seed.credibilityScore,
            relevanceScore: seed.relevanceScore,
            compositeScore: seed.compositeScore,
            dedupeHash,
            publishedAt: seed.publishedAt ?? now,
            capturedAt: now,
            metadataPayload: seed.metadata,
          }),
        ),
      );
    }
    return saved;
  }

  private buildFallbackBriefDraft(
    items: CyberAvatarRealWorldItemEntity[],
    queryPlan: QueryPlanEntry[],
  ) {
    return {
      title: '外部世界最近值得关注的变化',
      summary:
        items[0]?.normalizedSummary ??
        '这轮真实世界回流拿到了新的公开信息，适合继续观察。',
      bulletPoints: items
        .slice(0, 4)
        .map((item) => item.normalizedSummary)
        .filter(Boolean),
      queryHints: queryPlan.slice(0, 4).map((item) => item.queryText),
      needSignals: items
        .slice(0, 3)
        .map((item) => `围绕“${item.topicTags?.[0] ?? item.title}”的外部支持和新联系人值得继续补位。`),
    };
  }

  private normalizeBriefDraft(
    raw: Record<string, unknown> | null,
    items: CyberAvatarRealWorldItemEntity[],
    queryPlan: QueryPlanEntry[],
  ): RealWorldBriefDraft {
    const fallback = this.buildFallbackBriefDraft(items, queryPlan);
    return {
      title: normalizeString(raw?.title) || fallback.title,
      summary: normalizeString(raw?.summary) || fallback.summary,
      bulletPoints:
        normalizeStringArray(raw?.bulletPoints, 6).length > 0
          ? normalizeStringArray(raw?.bulletPoints, 6)
          : fallback.bulletPoints,
      queryHints:
        normalizeStringArray(raw?.queryHints, 4).length > 0
          ? normalizeStringArray(raw?.queryHints, 4)
          : fallback.queryHints,
      needSignals:
        normalizeStringArray(raw?.needSignals, 4).length > 0
          ? normalizeStringArray(raw?.needSignals, 4)
          : fallback.needSignals,
    };
  }

  private async createSkippedRun(
    ownerId: string,
    trigger: CyberAvatarRunTrigger,
    profileVersion: number,
    reason: string,
  ) {
    const run = await this.runRepo.save(
      this.runRepo.create({
        ownerId,
        mode: 'real_world_sync',
        trigger,
        status: 'skipped',
        signalCount: 0,
        profileVersion,
        skipReason: reason,
      }),
    );
    return this.serializeRunDetail(run);
  }

  private serializeItem(entity: CyberAvatarRealWorldItemEntity) {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      status: entity.status,
      providerMode: entity.providerMode,
      queryText: entity.queryText,
      sourceName: entity.sourceName,
      sourceUrl: entity.sourceUrl ?? null,
      title: entity.title,
      snippet: entity.snippet,
      normalizedSummary: entity.normalizedSummary,
      topicTags: entity.topicTags ?? [],
      credibilityScore: entity.credibilityScore,
      relevanceScore: entity.relevanceScore,
      compositeScore: entity.compositeScore,
      publishedAt: safeDate(entity.publishedAt),
      capturedAt: entity.capturedAt.toISOString(),
      metadata: entity.metadataPayload ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private serializeBrief(entity: CyberAvatarRealWorldBriefEntity) {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      status: entity.status as CyberAvatarRealWorldBriefStatus,
      briefDate: entity.briefDate,
      title: entity.title,
      summary: entity.summary,
      bulletPoints: entity.bulletPoints ?? [],
      queryHints: entity.queryHints ?? [],
      needSignals: entity.needSignals ?? [],
      relatedItemIds: entity.relatedItemIds ?? [],
      metadata: entity.metadataPayload ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private serializeRunDetail(entity: CyberAvatarRunEntity) {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      mode: entity.mode,
      trigger: entity.trigger,
      status: entity.status,
      signalCount: entity.signalCount,
      profileVersion: entity.profileVersion,
      skipReason: entity.skipReason ?? null,
      errorMessage: entity.errorMessage ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      windowStartedAt: safeDate(entity.windowStartedAt),
      windowEndedAt: safeDate(entity.windowEndedAt),
      inputSnapshot: entity.inputSnapshot ?? null,
      aggregationPayload: entity.aggregationPayload ?? null,
      promptSnapshot: entity.promptSnapshot ?? null,
      llmOutputPayload: entity.llmOutputPayload ?? null,
      mergeDiffPayload: entity.mergeDiffPayload ?? null,
    };
  }
}
