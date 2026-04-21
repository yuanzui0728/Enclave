import { getBuiltInCharacterBlueprintPatch } from '../characters/built-in-character-blueprints';
import { WORLD_NEWS_DESK_SOURCE_KEY } from '../characters/world-news-desk-character';
import { DEFAULT_REAL_WORLD_SYNC_RULES } from './real-world-sync.constants';
import { RealWorldSyncService } from './real-world-sync.service';
import type { RealityLinkConfigValue } from './real-world-sync.types';

function createService() {
  return new RealWorldSyncService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('RealWorldSyncService world news desk search', () => {
  it('uses search queries instead of fixed rss feeds', async () => {
    const service = createService();
    const fetchFeedEntriesMock = jest
      .spyOn(service as any, 'fetchFeedEntries')
      .mockResolvedValue([]);
    const config = getBuiltInCharacterBlueprintPatch(WORLD_NEWS_DESK_SOURCE_KEY)
      ?.realityLink as RealityLinkConfigValue;

    await (service as any).buildWorldNewsDeskSignals(
      config,
      DEFAULT_REAL_WORLD_SYNC_RULES,
      new Date('2026-04-21T12:00:00.000Z'),
    );

    const calledUrls = fetchFeedEntriesMock.mock.calls.map(([, url]) =>
      String(url),
    );
    const calledQueries = calledUrls.map(
      (url) => new URL(url).searchParams.get('q') ?? '',
    );

    expect(calledUrls).toHaveLength(5);
    expect(
      calledUrls.every((url) =>
        url.startsWith('https://news.google.com/rss/search'),
      ),
    ).toBe(true);
    expect(calledUrls.some((url) => url.includes('feeds.reuters.com'))).toBe(
      false,
    );
    expect(calledQueries).toEqual(
      expect.arrayContaining([
        '国际要闻 最新',
        '科技新闻 AI 芯片 最新',
        '商业新闻 公司 市场 最新',
        '政策新闻 监管 最新',
        '科学新闻 研究 突破 最新',
      ]),
    );
  });
});
