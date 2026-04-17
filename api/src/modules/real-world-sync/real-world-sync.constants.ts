import type {
  RealWorldSyncRulesValue,
  RealWorldScenePatchPayloadValue,
} from './real-world-sync.types';

export const REAL_WORLD_SYNC_RULES_CONFIG_KEY = 'real_world_sync_runtime_rules';

export const DEFAULT_REAL_WORLD_SCENE_PATCH: RealWorldScenePatchPayloadValue =
  Object.freeze({
    chat: '',
    moments_post: '',
    moments_comment: '',
    feed_post: '',
    channel_post: '',
    feed_comment: '',
    greeting: '',
    proactive: '',
  });

export const DEFAULT_REAL_WORLD_SYNC_RULES: RealWorldSyncRulesValue =
  Object.freeze({
    providerMode: 'google_news_rss',
    defaultLocale: 'zh-CN',
    defaultSourceAllowlist: ['官方公告', '主流媒体', '公开采访'],
    defaultSourceBlocklist: [],
    defaultRecencyHours: 48,
    defaultMaxSignalsPerRun: 5,
    defaultMinimumConfidence: 0.65,
    googleNews: {
      editionLanguage: 'zh-CN',
      editionRegion: 'CN',
      editionCeid: 'CN:zh-Hans',
      maxEntriesPerQuery: 12,
      fallbackToMockOnEmpty: true,
    },
    promptTemplates: {
      signalNormalizationPrompt:
        '将候选新闻和公开动态压缩成可审计的事实卡片，保留来源、时间和角色相关性，不要虚构未出现的细节，也不要写成营销标题或空泛结论。',
      dailyDigestPrompt:
        '根据当天已接受的外部信号，整理出这个角色今天最该带进世界里的现实状态、关注点和行为倾向。写法像观察笔记，不像新闻播报或分析报告。',
      scenePatchPrompt:
        '把今日现实摘要翻译成 scene 级行为 patch，重点约束聊天、发圈、评论和主动提醒的语气与话题偏移。避免把角色推成客服腔、新闻腔或模板文案。',
      realityMomentPrompt:
        '基于今日现实摘要和角色人设，生成一条像真人发的朋友圈，不要写成新闻播报、标题复述、三点式总结，也不要带（动作）或舞台说明。',
    },
  });

function sanitizeString(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function sanitizeStringArray(value: string[] | undefined, fallback: string[]) {
  const normalized = (value ?? []).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : [...fallback];
}

function sanitizePositiveNumber(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function sanitizeProviderMode(
  value: RealWorldSyncRulesValue['providerMode'] | undefined,
  fallback: RealWorldSyncRulesValue['providerMode'],
) {
  return value === 'mock' || value === 'google_news_rss' ? value : fallback;
}

function sanitizeBoolean(value: boolean | undefined, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeRealWorldSyncRules(
  input?: Partial<RealWorldSyncRulesValue> | null,
): RealWorldSyncRulesValue {
  const defaults = DEFAULT_REAL_WORLD_SYNC_RULES;
  return {
    providerMode: sanitizeProviderMode(
      input?.providerMode,
      defaults.providerMode,
    ),
    defaultLocale: sanitizeString(input?.defaultLocale, defaults.defaultLocale),
    defaultSourceAllowlist: sanitizeStringArray(
      input?.defaultSourceAllowlist,
      defaults.defaultSourceAllowlist,
    ),
    defaultSourceBlocklist: sanitizeStringArray(
      input?.defaultSourceBlocklist,
      defaults.defaultSourceBlocklist,
    ),
    defaultRecencyHours: sanitizePositiveNumber(
      input?.defaultRecencyHours,
      defaults.defaultRecencyHours,
    ),
    defaultMaxSignalsPerRun: sanitizePositiveNumber(
      input?.defaultMaxSignalsPerRun,
      defaults.defaultMaxSignalsPerRun,
    ),
    defaultMinimumConfidence:
      typeof input?.defaultMinimumConfidence === 'number' &&
      input.defaultMinimumConfidence > 0 &&
      input.defaultMinimumConfidence <= 1
        ? input.defaultMinimumConfidence
        : defaults.defaultMinimumConfidence,
    googleNews: {
      editionLanguage: sanitizeString(
        input?.googleNews?.editionLanguage,
        defaults.googleNews.editionLanguage,
      ),
      editionRegion: sanitizeString(
        input?.googleNews?.editionRegion,
        defaults.googleNews.editionRegion,
      ),
      editionCeid: sanitizeString(
        input?.googleNews?.editionCeid,
        defaults.googleNews.editionCeid,
      ),
      maxEntriesPerQuery: sanitizePositiveNumber(
        input?.googleNews?.maxEntriesPerQuery,
        defaults.googleNews.maxEntriesPerQuery,
      ),
      fallbackToMockOnEmpty: sanitizeBoolean(
        input?.googleNews?.fallbackToMockOnEmpty,
        defaults.googleNews.fallbackToMockOnEmpty,
      ),
    },
    promptTemplates: {
      signalNormalizationPrompt: sanitizeString(
        input?.promptTemplates?.signalNormalizationPrompt,
        defaults.promptTemplates.signalNormalizationPrompt,
      ),
      dailyDigestPrompt: sanitizeString(
        input?.promptTemplates?.dailyDigestPrompt,
        defaults.promptTemplates.dailyDigestPrompt,
      ),
      scenePatchPrompt: sanitizeString(
        input?.promptTemplates?.scenePatchPrompt,
        defaults.promptTemplates.scenePatchPrompt,
      ),
      realityMomentPrompt: sanitizeString(
        input?.promptTemplates?.realityMomentPrompt,
        defaults.promptTemplates.realityMomentPrompt,
      ),
    },
  };
}
