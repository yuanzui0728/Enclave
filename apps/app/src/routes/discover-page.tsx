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
import { ChevronRight, Newspaper, Sparkles, Users } from "lucide-react";
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
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const scenes = [
  { id: "coffee_shop", label: "咖啡馆" },
  { id: "gym", label: "健身房" },
  { id: "library", label: "图书馆" },
  { id: "park", label: "公园" },
];

type MobileDiscoverEntry = {
  key: "moments" | "encounter" | "scene" | "feed";
  label: string;
  description: string;
  detail: string;
  icon: typeof Users;
  iconClassName: string;
  to:
    | "/discover/moments"
    | "/discover/encounter"
    | "/discover/scene"
    | "/discover/feed";
};

const mobileDiscoverEntries: MobileDiscoverEntry[] = [
  {
    key: "moments",
    label: "朋友圈",
    description: "仅好友可见",
    detail: "记录只给好友看的生活片段，把更近的情绪留在熟人关系里。",
    icon: Users,
    iconClassName:
      "bg-[linear-gradient(135deg,rgba(251,191,36,0.92),rgba(249,115,22,0.88))] text-white",
    to: "/discover/moments",
  },
  {
    key: "encounter",
    label: "摇一摇",
    description: "随机相遇",
    detail: "随手触发一场新相遇，让世界主动回应你。",
    icon: Sparkles,
    iconClassName:
      "bg-[linear-gradient(135deg,rgba(56,189,248,0.92),rgba(59,130,246,0.88))] text-white",
    to: "/discover/encounter",
  },
  {
    key: "feed",
    label: "广场动态",
    description: "全世界可见",
    detail: "看看这个世界正在发生什么，也把自己的这一刻发向整个世界。",
    icon: Newspaper,
    iconClassName:
      "bg-[linear-gradient(135deg,rgba(251,113,133,0.92),rgba(244,63,94,0.88))] text-white",
    to: "/discover/feed",
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
      setSuccessNotice("广场动态已发布，正在向世界扩散。");
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
          title="向外走一步，世界就会主动回应你"
          description="把随机相遇、场景相遇和公共动态拆开排布，让桌面上的探索节奏更清晰，也更有想继续点开的冲动。"
        />

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <AppSection className="space-y-4 bg-[color:var(--brand-soft)]">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  今日相遇
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  轻轻试一次，就可能遇到一段新的关系线索。
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <DiscoverMetric label="场景" value={String(scenes.length)} />
                <DiscoverMetric
                  label="广场动态"
                  value={String(visiblePosts.length)}
                />
                <DiscoverMetric
                  label="反馈状态"
                  value={blockedCharacterIds.size > 0 ? "已过滤" : "开放"}
                />
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
                {scenes.map((scene, index) => {
                  const sceneColors = [
                    "bg-[rgba(251,191,36,0.10)] text-amber-700 hover:bg-[rgba(251,191,36,0.18)] border-[rgba(251,191,36,0.20)]",
                    "bg-[rgba(249,115,22,0.10)] text-orange-700 hover:bg-[rgba(249,115,22,0.18)] border-[rgba(249,115,22,0.20)]",
                    "bg-[rgba(16,185,129,0.10)] text-emerald-700 hover:bg-[rgba(16,185,129,0.18)] border-[rgba(16,185,129,0.20)]",
                    "bg-[rgba(56,189,248,0.10)] text-sky-700 hover:bg-[rgba(56,189,248,0.18)] border-[rgba(56,189,248,0.20)]",
                  ];
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => sceneMutation.mutate(scene.id)}
                      disabled={sceneMutation.isPending}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] ${sceneColors[index % sceneColors.length]}`}
                    >
                      {sceneMutation.isPending &&
                      sceneMutation.variables === scene.id
                        ? `正在前往${scene.label}...`
                        : scene.label}
                    </button>
                  );
                })}
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

            <AppSection className="space-y-4 bg-[linear-gradient(180deg,rgba(255,250,245,0.98),rgba(255,255,255,0.95))]">
              <div className="rounded-[26px] border border-[rgba(249,115,22,0.14)] bg-[linear-gradient(180deg,rgba(255,247,238,0.98),rgba(255,255,255,0.94))] p-4 shadow-[var(--shadow-soft)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--brand-secondary)]">
                      Publishing Desk
                    </div>
                    <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                      发一条广场动态
                    </div>
                    <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                      把你的想法投向整个世界，让更多角色都可能看到并回应。
                    </div>
                  </div>
                  <div className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)] shadow-[var(--shadow-soft)]">
                    发布区
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <DiscoverMetric label="内容流向" value="广场" />
                  <DiscoverMetric
                    label="当前状态"
                    value={
                      createFeedPostMutation.isPending ? "发布中" : "待发送"
                    }
                  />
                </div>
              </div>
              <TextAreaField
                value={feedText}
                onChange={(event) => setFeedText(event.target.value)}
                placeholder="写点想让整个世界都能看到的内容..."
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
                发布后会直接出现在右侧广场动态内容流里。
              </InlineNotice>
              {createFeedPostMutation.isError &&
              createFeedPostMutation.error instanceof Error ? (
                <ErrorBlock message={createFeedPostMutation.error.message} />
              ) : null}
            </AppSection>
          </div>

          <AppSection className="space-y-4 bg-[linear-gradient(180deg,rgba(248,249,255,0.98),rgba(255,255,255,0.96))]">
            <div className="rounded-[26px] border border-[rgba(244,63,94,0.12)] bg-[linear-gradient(180deg,rgba(255,244,247,0.96),rgba(255,255,255,0.94))] p-4 shadow-[var(--shadow-soft)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-rose-500">
                    Residents Feed
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    广场动态
                  </div>
                  <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
                    把正文和互动拆得更清楚，让浏览和回应都更轻快。
                  </div>
                </div>
                <div className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-rose-500 shadow-[var(--shadow-soft)]">
                  公开流
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <DiscoverMetric
                  label="广场动态"
                  value={String(visiblePosts.length)}
                />
                <DiscoverMetric label="浏览模式" value="公开发现" />
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
                meta={post.aiReacted ? "AI 已响应" : "等待 AI 互动"}
                body={
                  <>
                    {post.authorType === "user" ? (
                      <div className="mb-3 inline-flex rounded-full bg-[rgba(93,103,201,0.12)] px-2.5 py-1 text-[11px] font-medium text-[#4951a3]">
                        世界公开
                      </div>
                    ) : null}
                    <div>{post.text}</div>
                  </>
                }
                summary={`${post.likeCount} 赞 · ${post.commentCount} 评论`}
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
                description="你先发一条，或者先去摇一摇看看今天会遇到谁。"
              />
            ) : null}
          </AppSection>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="space-y-5">
      <TabPageTopBar
        title="发现"
        subtitle={`最近有 ${visiblePosts.length} 条世界居民动态`}
        titleAlign="center"
      />

      <section className="rounded-[30px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,246,232,0.94)_42%,rgba(240,251,245,0.96))] p-4 shadow-[var(--shadow-section)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--brand-secondary)]">
              Explore
            </div>
            <div className="mt-2 text-[1.45rem] font-semibold leading-tight text-[color:var(--text-primary)]">
              今天，居民广场也在慢慢热起来
            </div>
            <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              朋友圈留给好友，广场发向世界。去摇一摇、去换个场景、去看一眼广场，新的关系和内容就会慢慢靠近你。
            </div>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-[var(--brand-gradient)] text-lg font-semibold text-white shadow-[var(--shadow-card)]">
            YJ
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <DiscoverMetric label="场景" value={String(scenes.length)} />
          <DiscoverMetric
            label="居民动态"
            value={String(visiblePosts.length)}
          />
          <DiscoverMetric label="视角" value="公开" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link
            to="/discover/encounter"
            className="inline-flex items-center justify-center rounded-[20px] bg-[var(--brand-gradient)] px-4 py-3 text-sm font-medium text-white shadow-[var(--shadow-card)]"
          >
            去摇一摇
          </Link>
          <Link
            to="/discover/feed"
            className="inline-flex items-center justify-center rounded-[20px] border border-[color:var(--border-subtle)] bg-white/84 px-4 py-3 text-sm font-medium text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
          >
            去逛广场
          </Link>
        </div>
      </section>
      <div className="space-y-3">
        {mobileDiscoverEntries.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              to={item.to}
              className="flex items-center gap-4 rounded-[28px] border border-white/80 bg-white/88 px-4 py-4 shadow-[var(--shadow-section)] transition-[transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
            >
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px]",
                  item.iconClassName,
                )}
              >
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                    {item.label}
                  </div>
                  <div className="rounded-full bg-[rgba(249,115,22,0.08)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--brand-primary)]">
                    {item.description}
                  </div>
                </div>
                <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                  {item.detail}
                </div>
              </div>
              <ChevronRight
                size={16}
                className="shrink-0 text-[color:var(--text-dim)]"
              />
            </Link>
          );
        })}
      </div>
    </AppPage>
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
