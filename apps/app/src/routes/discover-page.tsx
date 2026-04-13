import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  addFeedComment,
  createFeedPost,
  getBlockedCharacters,
  getFeed,
  likeFeedPost,
  sendFriendRequest,
  shake,
  triggerSceneFriendRequest,
} from "@yinjie/contracts";
import {
  Blocks,
  ChevronRight,
  Gamepad2,
  Newspaper,
  PlaySquare,
  Sparkles,
  Users,
} from "lucide-react";
import {
  AppHeader,
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  TextField,
  cn,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { SocialPostCard } from "../components/social-post-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const scenes = [
  { id: "coffee_shop", label: "咖啡馆" },
  { id: "gym", label: "健身房" },
  { id: "library", label: "图书馆" },
  { id: "park", label: "公园" },
];

type MobileDiscoverEntry = {
  key:
    | "moments"
    | "encounter"
    | "scene"
    | "feed"
    | "channels"
    | "games"
    | "miniPrograms";
  label: string;
  badge: string;
  summary: string;
  icon: typeof Users;
  iconClassName: string;
  to:
    | "/discover/moments"
    | "/discover/encounter"
    | "/discover/scene"
    | "/discover/feed"
    | "/discover/channels"
    | "/discover/games"
    | "/discover/mini-programs";
};

const socialDiscoverEntries: MobileDiscoverEntry[] = [
  {
    key: "moments",
    label: "朋友圈",
    badge: "朋友",
    summary: "只给朋友看的生活片段和熟人近况。",
    icon: Users,
    iconClassName: "bg-[linear-gradient(135deg,#38b16d,#1f9d55)] text-white",
    to: "/discover/moments",
  },
  {
    key: "encounter",
    label: "摇一摇",
    badge: "随机",
    summary: "让世界主动给你一场新的相遇。",
    icon: Sparkles,
    iconClassName:
      "bg-[linear-gradient(135deg,#22c55e,#07c160)] text-[color:var(--text-on-brand)]",
    to: "/discover/encounter",
  },
  {
    key: "scene",
    label: "场景相遇",
    badge: "地点",
    summary: "先选地点，再让角色按场景靠近你。",
    icon: Sparkles,
    iconClassName: "bg-[linear-gradient(135deg,#16a34a,#0f766e)] text-white",
    to: "/discover/scene",
  },
  {
    key: "feed",
    label: "广场动态",
    badge: "公开",
    summary: "看看居民们正在说什么，也发一条给世界看。",
    icon: Newspaper,
    iconClassName: "bg-[linear-gradient(135deg,#4f7cff,#2f5fe6)] text-white",
    to: "/discover/feed",
  },
];

const contentDiscoverEntries: MobileDiscoverEntry[] = [
  {
    key: "channels",
    label: "视频号",
    badge: "内容",
    summary: "浏览 AI 生成短视频和持续更新的内容流。",
    icon: PlaySquare,
    iconClassName: "bg-[linear-gradient(135deg,#ff8a3d,#ff5f45)] text-white",
    to: "/discover/channels",
  },
  {
    key: "games",
    label: "游戏",
    badge: "娱乐",
    summary: "进入游戏中心，继续最近玩过和推荐内容。",
    icon: Gamepad2,
    iconClassName: "bg-[linear-gradient(135deg,#1f6d42,#49a36e)] text-white",
    to: "/discover/games",
  },
  {
    key: "miniPrograms",
    label: "小程序",
    badge: "工具",
    summary: "最近使用、我的小程序和推荐入口都在这里。",
    icon: Blocks,
    iconClassName:
      "bg-[linear-gradient(135deg,#d56c18,#ffab3d)] text-white",
    to: "/discover/mini-programs",
  },
];

export function DiscoverPage() {
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [feedText, setFeedText] = useState("");
  const [shakeMessage, setShakeMessage] = useState("");
  const [sceneMessage, setSceneMessage] = useState("");
  const [feedCommentDrafts, setFeedCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [successNotice, setSuccessNotice] = useState("");

  const feedQuery = useQuery({
    queryKey: ["app-feed", baseUrl],
    queryFn: () => getFeed(1, 20, baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-discover-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const createFeedPostMutation = useMutation({
    mutationFn: () =>
      createFeedPost(
        {
          text: feedText.trim(),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setFeedText("");
      setSuccessNotice("广场动态已发布，世界居民公开可见。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const shakeMutation = useMutation({
    mutationFn: async () => {
      const result = await shake(baseUrl);
      if (!result) {
        return null;
      }

      await sendFriendRequest(
        {
          characterId: result.character.id,
          greeting: result.greeting,
        },
        baseUrl,
      );

      return result;
    },
    onSuccess: (result) => {
      if (!result) {
        setShakeMessage("附近暂时没有新的相遇。");
        return;
      }

      setSuccessNotice("新的好友申请已发送。");
      setShakeMessage(
        `${result.character.name} 向你发来了好友申请：${result.greeting}`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
  });

  const sceneMutation = useMutation({
    mutationFn: async (scene: string) => {
      const result = await triggerSceneFriendRequest(
        {
          scene,
        },
        baseUrl,
      );
      return { request: result, scene };
    },
    onSuccess: ({ request, scene }) => {
      const sceneLabel =
        scenes.find((item) => item.id === scene)?.label ?? scene;

      if (!request) {
        setSceneMessage(`${sceneLabel} 里暂时没有新的相遇。`);
        return;
      }

      setSuccessNotice("场景相遇已写入好友申请列表。");
      setSceneMessage(
        `${request.characterName} 在${sceneLabel}里注意到了你：${request.greeting ?? "对你产生了兴趣。"}`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
  });

  const likeFeedMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("广场互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const commentFeedMutation = useMutation({
    mutationFn: (postId: string) =>
      addFeedComment(
        postId,
        {
          text: feedCommentDrafts[postId].trim(),
        },
        baseUrl,
      ),
    onSuccess: async (_, postId) => {
      setFeedCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setSuccessNotice("广场互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );
  const visiblePosts = useMemo(
    () =>
      (feedQuery.data?.posts ?? []).filter(
        (post) =>
          post.authorType !== "character" ||
          !blockedCharacterIds.has(post.authorId),
      ),
    [blockedCharacterIds, feedQuery.data?.posts],
  );
  const pendingLikePostId = likeFeedMutation.isPending
    ? likeFeedMutation.variables
    : null;
  const pendingCommentPostId = commentFeedMutation.isPending
    ? commentFeedMutation.variables
    : null;

  useEffect(() => {
    setFeedText("");
    setShakeMessage("");
    setSceneMessage("");
    setFeedCommentDrafts({});
    setSuccessNotice("");
  }, [baseUrl]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  if (isDesktopLayout) {
    return (
      <AppPage className="space-y-5 px-6 py-6">
        <AppHeader
          eyebrow="发现"
          title="朋友圈给好友，广场给居民"
          description="发现页把随机相遇、场景相遇和居民公开动态拆开排布，让桌面上的探索节奏更清晰，也把熟人私域和居民公开流分得更明白。"
        />

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <AppSection className="space-y-4 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,247,236,0.94)_44%,rgba(240,251,245,0.92))]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--brand-secondary)]">
                    内容视角
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    先决定发给好友，还是发给居民
                  </div>
                  <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                    朋友圈和广场动态共用同一套发现入口，但可见范围完全不同，桌面端先把这层分界讲清楚。
                  </div>
                </div>
                <div className="rounded-full bg-white/84 px-3 py-1 text-[11px] font-medium text-[color:var(--text-muted)] shadow-[var(--shadow-soft)]">
                  Discover
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[26px] border border-[rgba(47,122,63,0.16)] bg-[linear-gradient(180deg,rgba(247,252,248,0.98),rgba(255,255,255,0.96))] px-4 py-4 shadow-[var(--shadow-soft)]">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[#2f7a3f]">
                    朋友圈
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    仅好友可见
                  </div>
                  <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                    更近一点的生活片段，留在熟人关系里慢慢流动。
                  </div>
                </div>
                <div className="rounded-[26px] border border-[rgba(93,103,201,0.16)] bg-[linear-gradient(180deg,rgba(246,247,255,0.98),rgba(255,255,255,0.96))] px-4 py-4 shadow-[var(--shadow-soft)]">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[#4951a3]">
                    广场动态
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    世界居民公开可见
                  </div>
                  <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                    把这一刻发到居民广场，让世界里的居民也能看见并回应。
                  </div>
                </div>
              </div>
            </AppSection>

            <AppSection className="space-y-4 bg-[color:var(--brand-soft)]">
              <div className="rounded-[26px] border border-[rgba(34,197,94,0.12)] bg-[linear-gradient(180deg,rgba(244,252,247,0.98),rgba(255,255,255,0.94))] p-4 shadow-[var(--shadow-soft)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-600">
                      Encounter Desk
                    </div>
                    <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                      今日相遇
                    </div>
                    <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                      轻轻试一次，就可能遇到一段新的关系线索。
                    </div>
                  </div>
                  <div className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-emerald-600 shadow-[var(--shadow-soft)]">
                    探索区
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <DiscoverMetric label="场景" value={String(scenes.length)} />
                  <DiscoverMetric
                    label="居民动态"
                    value={String(visiblePosts.length)}
                  />
                  <DiscoverMetric
                    label="反馈状态"
                    value={blockedCharacterIds.size > 0 ? "已过滤" : "开放"}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => shakeMutation.mutate()}
                  disabled={shakeMutation.isPending}
                  variant="primary"
                >
                  {shakeMutation.isPending ? "正在寻找..." : "摇一摇"}
                </Button>
                <div className="text-xs text-[color:var(--text-muted)]">
                  随机相遇会从不同场景里发生。
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {scenes.map((scene) => (
                  <Button
                    key={scene.id}
                    onClick={() => sceneMutation.mutate(scene.id)}
                    disabled={sceneMutation.isPending}
                    variant="secondary"
                    size="sm"
                  >
                    {sceneMutation.isPending &&
                    sceneMutation.variables === scene.id
                      ? `正在前往${scene.label}...`
                      : scene.label}
                  </Button>
                ))}
              </div>

              {shakeMessage ? (
                <InlineNotice tone="success">{shakeMessage}</InlineNotice>
              ) : null}
              {sceneMessage ? (
                <InlineNotice tone="info">{sceneMessage}</InlineNotice>
              ) : null}
              {shakeMutation.isError && shakeMutation.error instanceof Error ? (
                <ErrorBlock message={shakeMutation.error.message} />
              ) : null}
              {sceneMutation.isError && sceneMutation.error instanceof Error ? (
                <ErrorBlock message={sceneMutation.error.message} />
              ) : null}
            </AppSection>

            <AppSection className="space-y-4 border-black/5 bg-white shadow-none">
              <div className="rounded-[24px] border border-[rgba(7,193,96,0.14)] bg-[linear-gradient(180deg,rgba(246,252,248,0.98),rgba(255,255,255,0.96))] p-4 shadow-none">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] tracking-[0.14em] text-[#15803d]">
                      广场发布
                    </div>
                    <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                      发一条广场动态
                    </div>
                    <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                      把你的想法发到居民广场，让世界里的居民都可能看到并回应。
                    </div>
                  </div>
                  <div className="rounded-full bg-[rgba(7,193,96,0.1)] px-3 py-1 text-[11px] font-medium text-[#15803d]">
                    发帖区
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <DiscoverMetric label="范围" value="居民公开" />
                  <DiscoverMetric
                    label="发布状态"
                    value={
                      createFeedPostMutation.isPending ? "发布中" : "待发送"
                    }
                  />
                </div>
              </div>

              <TextAreaField
                value={feedText}
                onChange={(event) => setFeedText(event.target.value)}
                placeholder="写点想让世界居民都能看到的内容..."
                className="min-h-36 resize-none"
              />
              <Button
                disabled={!feedText.trim() || createFeedPostMutation.isPending}
                onClick={() => createFeedPostMutation.mutate()}
                variant="primary"
              >
                {createFeedPostMutation.isPending
                  ? "正在发布..."
                  : "发布到广场"}
              </Button>
              <InlineNotice tone="muted">
                发布后会直接进入右侧公开流，世界居民公开可见。
              </InlineNotice>
              {createFeedPostMutation.isError &&
              createFeedPostMutation.error instanceof Error ? (
                <ErrorBlock message={createFeedPostMutation.error.message} />
              ) : null}
            </AppSection>
          </div>

          <AppSection className="space-y-4 bg-[linear-gradient(180deg,rgba(248,249,255,0.98),rgba(255,255,255,0.96))]">
            <div className="rounded-[26px] border border-[rgba(93,103,201,0.14)] bg-[linear-gradient(180deg,rgba(245,247,255,0.98),rgba(255,255,255,0.94))] p-4 shadow-[var(--shadow-soft)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#4951a3]">
                    Residents Feed
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    广场动态
                  </div>
                  <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                    这里不只看朋友，也能看到世界里的居民正在说什么。
                  </div>
                </div>
                <div className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-[#4951a3] shadow-[var(--shadow-soft)]">
                  公开流
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <DiscoverMetric
                  label="可见动态"
                  value={String(visiblePosts.length)}
                />
                <DiscoverMetric label="范围" value="居民公开" />
              </div>
            </div>

            {successNotice ? (
              <InlineNotice tone="success">{successNotice}</InlineNotice>
            ) : null}
            {feedQuery.isLoading ? (
              <LoadingBlock label="正在读取广场动态..." />
            ) : null}
            {feedQuery.isError && feedQuery.error instanceof Error ? (
              <ErrorBlock message={feedQuery.error.message} />
            ) : null}

            {visiblePosts.map((post) => (
              <SocialPostCard
                key={post.id}
                authorName={post.authorName}
                authorAvatar={post.authorAvatar}
                meta={`${formatTimestamp(post.createdAt)} · ${post.authorType === "user" ? "世界主人" : "居民动态"}`}
                body={
                  <>
                    {post.authorType === "user" ? (
                      <div className="mb-3 inline-flex rounded-full bg-[rgba(93,103,201,0.12)] px-2.5 py-1 text-[11px] font-medium text-[#4951a3]">
                        居民公开可见
                      </div>
                    ) : null}
                    <div>{post.text}</div>
                  </>
                }
                summary={`${post.likeCount} 赞 · ${post.commentCount} 评论${post.aiReacted ? " · AI 已参与回应" : ""}`}
                actions={
                  <Button
                    disabled={likeFeedMutation.isPending}
                    onClick={() => likeFeedMutation.mutate(post.id)}
                    variant="secondary"
                    size="sm"
                  >
                    {pendingLikePostId === post.id ? "处理中..." : "点赞"}
                  </Button>
                }
                secondary={
                  post.commentsPreview.length > 0 ? (
                    <div className="space-y-2 rounded-[22px] bg-[color:var(--surface-soft)] p-3">
                      {post.commentsPreview.map((comment) => (
                        <div
                          key={comment.id}
                          className="text-xs leading-6 text-[color:var(--text-secondary)]"
                        >
                          <span className="text-[color:var(--text-primary)]">
                            {comment.authorName}
                          </span>
                          {`：${comment.text}`}
                        </div>
                      ))}
                    </div>
                  ) : null
                }
                composer={
                  <>
                    <TextField
                      value={feedCommentDrafts[post.id] ?? ""}
                      onChange={(event) =>
                        setFeedCommentDrafts((current) => ({
                          ...current,
                          [post.id]: event.target.value,
                        }))
                      }
                      placeholder="写评论..."
                      className="min-w-0 flex-1 rounded-full py-2 text-xs"
                    />
                    <Button
                      disabled={
                        !(feedCommentDrafts[post.id] ?? "").trim() ||
                        commentFeedMutation.isPending
                      }
                      onClick={() => commentFeedMutation.mutate(post.id)}
                      variant="primary"
                      size="sm"
                    >
                      {pendingCommentPostId === post.id ? "发送中..." : "发送"}
                    </Button>
                  </>
                }
              />
            ))}

            {likeFeedMutation.isError &&
            likeFeedMutation.error instanceof Error ? (
              <ErrorBlock message={likeFeedMutation.error.message} />
            ) : null}
            {commentFeedMutation.isError &&
            commentFeedMutation.error instanceof Error ? (
              <ErrorBlock message={commentFeedMutation.error.message} />
            ) : null}

            {!feedQuery.isLoading &&
            !feedQuery.isError &&
            !visiblePosts.length ? (
              <EmptyState
                title="广场还没有新动态"
                description="你先发一条居民公开可见的动态，或者等世界里的居民先开口。"
              />
            ) : null}
          </AppSection>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar title="发现" titleAlign="center" />

      <div className="pb-8">
        <div className="px-4 py-2 text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
          从这里继续打开朋友动态、世界相遇和内容入口。
        </div>

        <DiscoverMobileSection
          title="社交与动态"
          items={socialDiscoverEntries}
        />
        <DiscoverMobileSection
          title="内容与服务"
          items={contentDiscoverEntries}
        />
      </div>
    </AppPage>
  );
}

function DiscoverMobileSection({
  title,
  items,
}: {
  title: string;
  items: MobileDiscoverEntry[];
}) {
  return (
    <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
      <div className="px-4 py-1.5 text-[11px] font-medium tracking-[0.04em] text-[color:var(--text-muted)]">
        {title}
      </div>
      {items.map((item, index) => (
        <DiscoverMobileEntryRow
          key={item.key}
          item={item}
          index={index}
        />
      ))}
    </section>
  );
}

function DiscoverMobileEntryRow({
  item,
  index,
}: {
  item: MobileDiscoverEntry;
  index: number;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]",
        index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
          item.iconClassName,
        )}
      >
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[14px] text-[color:var(--text-primary)]">
            {item.label}
          </div>
          <div className="rounded-full bg-[rgba(7,193,96,0.08)] px-1.5 py-0.5 text-[10px] font-medium tracking-[0.04em] text-[#15803d]">
            {item.badge}
          </div>
        </div>
        <div className="mt-0.5 truncate text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
          {item.summary}
        </div>
      </div>
      <ChevronRight
        size={14}
        className="shrink-0 text-[color:var(--text-dim)]"
      />
    </Link>
  );
}

function DiscoverMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-white/82 px-3 py-3 shadow-[var(--shadow-soft)]">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
