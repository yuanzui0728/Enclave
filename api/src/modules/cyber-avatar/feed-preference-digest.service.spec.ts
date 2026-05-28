// i18n-ignore-start: test fixtures — not user-facing UI.
import { FeedPreferenceDigestService } from './feed-preference-digest.service';

describe('FeedPreferenceDigestService.runForCurrentOwner (P4 feed 偏好摘要)', () => {
  function make(opts: {
    interactions?: Array<{ postId: string; type: string }>;
    posts?: Array<{ id: string; topicTags?: string[]; authorName?: string }>;
    captureImpl?: jest.Mock;
  }) {
    const captureSignal = opts.captureImpl ?? jest.fn(async () => ({}));
    const interactionRepo = {
      find: jest.fn(async () =>
        (opts.interactions ?? []).map((i) => ({
          ...i,
          createdAt: new Date(),
        })),
      ),
    } as any;
    const postRepo = {
      find: jest.fn(async () => opts.posts ?? []),
    } as any;
    const worldOwnerService = {
      getOwnerOrThrow: jest.fn(async () => ({ id: 'owner-1' })),
    } as any;
    const rulesService = {} as any;
    const cyberAvatar = { captureSignal } as any;
    const svc = new FeedPreferenceDigestService(
      interactionRepo,
      postRepo,
      worldOwnerService,
      rulesService,
      cyberAvatar,
    );
    return { svc, captureSignal };
  }

  it('蒸出 topic/creator/dislike 三段摘要，weight 0.6 + 2h 桶 dedupeKey', async () => {
    const { svc, captureSignal } = make({
      interactions: [
        { postId: 'p1', type: 'like' },
        { postId: 'p2', type: 'favorite' },
        { postId: 'p1', type: 'comment_like' },
        { postId: 'p3', type: 'not_interested' },
      ],
      posts: [
        { id: 'p1', topicTags: ['心理', '职场'], authorName: '夜灯' },
        { id: 'p2', topicTags: ['心理'], authorName: 'Lia' },
        { id: 'p3', topicTags: ['带货'], authorName: 'X' },
      ],
    });

    await svc.runForCurrentOwner();
    expect(captureSignal).toHaveBeenCalledTimes(1);
    const arg = captureSignal.mock.calls[0][0];
    expect(arg.signalType).toBe('feed_preference_digest');
    expect(arg.weight).toBe(0.6);
    expect(arg.ownerId).toBe('owner-1');
    expect(arg.dedupeKey).toMatch(/^feed_preference_digest:owner-1:\d+$/);
    expect(arg.summaryText).toContain('偏爱 心理');
    expect(arg.summaryText).toContain('高频回看创作者');
    expect(arg.summaryText).toContain('明确划掉 带货');
  });

  it('无互动 → 不发信号', async () => {
    const { svc, captureSignal } = make({ interactions: [], posts: [] });
    await svc.runForCurrentOwner();
    expect(captureSignal).not.toHaveBeenCalled();
  });

  it('有互动但帖子缺标签 → 不发信号（没有可注入偏好）', async () => {
    const { svc, captureSignal } = make({
      interactions: [{ postId: 'p1', type: 'like' }],
      posts: [{ id: 'p1', topicTags: [], authorName: '' }],
    });
    await svc.runForCurrentOwner();
    expect(captureSignal).not.toHaveBeenCalled();
  });

  it('只有 like 创作者、无话题标签 → 仍按创作者出摘要', async () => {
    const { svc, captureSignal } = make({
      interactions: [{ postId: 'p1', type: 'like' }],
      posts: [{ id: 'p1', topicTags: [], authorName: '夜灯' }],
    });
    await svc.runForCurrentOwner();
    expect(captureSignal).toHaveBeenCalledTimes(1);
    expect(captureSignal.mock.calls[0][0].summaryText).toContain('夜灯');
  });
});
// i18n-ignore-end
