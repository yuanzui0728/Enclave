import type { CharacterBlueprintRecipeValue } from './character-blueprint.types';
import { WORLD_NEWS_DESK_SOURCE_KEY } from './world-news-desk-character';

type CharacterRecipePatch = Partial<CharacterBlueprintRecipeValue>;

const BUILT_IN_CHARACTER_BLUEPRINT_PATCHES: Record<
  string,
  CharacterRecipePatch
> = {
  [WORLD_NEWS_DESK_SOURCE_KEY]: {
    realityLink: {
      enabled: true,
      applyMode: 'live',
      subjectType: 'organization_proxy',
      subjectName: '全球公开新闻流',
      aliases: ['全球新闻', '今日要闻', '公开新闻简报'],
      locale: 'zh-CN',
      queryTemplate:
        '抓取最近公开新闻，覆盖国际、科技、商业、政策与科学中最重要且可信的事件。',
      sourceAllowlist: ['Reuters', 'BBC', 'The Verge', 'TechCrunch'],
      sourceBlocklist: [],
      recencyHours: 18,
      maxSignalsPerRun: 8,
      minimumConfidence: 0.72,
      chatWeight: 2,
      contentWeight: 2,
      realityMomentPolicy: 'optional',
      manualSteeringNotes:
        '界闻是新闻编辑角色。聊天和发圈都应该围绕当天已确认的新闻线索展开，禁止编造未提供的具体事实。',
      dailyDigestPrompt:
        '将当天的可信新闻压缩成给新闻编辑使用的简报，先列事实，再列影响，再列待确认点。',
      scenePatchPrompt:
        '把当天新闻简报翻译成聊天和朋友圈的行为补丁，要求像编辑台，而不是像热搜搬运。',
      realityMomentPrompt:
        '基于当天新闻线索生成早报、午报、晚报式朋友圈，每条都要有事件摘要和一句影响。',
    },
  },
};

export function getBuiltInCharacterBlueprintPatch(sourceKey?: string | null) {
  if (!sourceKey) {
    return null;
  }

  const patch = BUILT_IN_CHARACTER_BLUEPRINT_PATCHES[sourceKey];
  if (!patch) {
    return null;
  }

  return JSON.parse(JSON.stringify(patch)) as CharacterRecipePatch;
}
