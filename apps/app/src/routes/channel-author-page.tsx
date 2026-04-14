import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Clapperboard,
  MessageCircleMore,
  PlaySquare,
  RadioTower,
  Users,
} from "lucide-react";
import {
  followChannelAuthor,
  getChannelAuthorProfile,
  unfollowChannelAuthor,
  type FeedPostListItem,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type ChannelAuthorCollectionTab = "all" | "videos" | "updates" | "live";
const CHANNEL_AUTHOR_COLLECTION_STORAGE_KEY =
  "yinjie:channels:author-collections";

export function ChannelAuthorPage() {
  const { authorId } = useParams({ from: "/channels/authors/$authorId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [notice, setNotice] = useState<{
    message: string;
    tone: "success" | "info";
  } | null>(null);
  const [activeCollection, setActiveCollection] =
    useState<ChannelAuthorCollectionTab>("all");

  const profileQuery = useQuery({
    queryKey: ["app-channel-author", baseUrl, authorId],
    queryFn: () => getChannelAuthorProfile(authorId, baseUrl),
  });
  const followMutation = useMutation({
    mutationFn: () =>
      profileQuery.data?.isFollowing
        ? unfollowChannelAuthor(authorId, baseUrl)
        : followChannelAuthor(authorId, baseUrl),
    onSuccess: async () => {
      setNotice({
        message: profileQuery.data?.isFollowing ? "已取消关注。" : "已关注该视频号作者。",
        tone: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-channel-author", baseUrl, authorId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-channels-home", baseUrl],
        }),
      ]);
    },
  });

  useEffect(() => {
    setNotice(null);
    setActiveCollection(readStoredChannelAuthorCollection(authorId));
  }, [authorId, baseUrl]);

  useEffect(() => {
    writeStoredChannelAuthorCollection(authorId, activeCollection);
  }, [activeCollection, authorId]);

  function navigateBackToChannels() {
    navigateBackOrFallback(() => {
      if (isDesktopLayout) {
        void navigate({ to: "/tabs/channels" });
        return;
      }

      void navigate({ to: "/discover/channels" });
    });
  }

  function openChannelPost(post: FeedPostListItem) {
    const hash = buildChannelsRouteHash(post.id);

    if (isDesktopLayout) {
      void navigate({
        to: "/tabs/channels",
        hash,
      });
      return;
    }

    void navigate({
      to: "/discover/channels",
      hash,
    });
  }

  const profile = profileQuery.data;
  const fallbackBio =
    profile?.authorType === "character"
      ? "这位居民暂时还没有填写视频号简介。"
      : "这个视频号作者暂时还没有填写简介。";
  const collectionTabs = useMemo(
    () =>
      (
        [
          { key: "all", label: "全部" },
          { key: "videos", label: "视频" },
          { key: "updates", label: "动态" },
          { key: "live", label: "直播回放" },
        ] satisfies Array<{
          key: ChannelAuthorCollectionTab;
          label: string;
        }>
      ).map((tab) => ({
        ...tab,
        count: (profile?.recentPosts ?? []).filter((post) =>
          matchesChannelAuthorCollection(post, tab.key),
        ).length,
      })),
    [profile?.recentPosts],
  );
  const visiblePosts = useMemo(
    () =>
      (profile?.recentPosts ?? []).filter((post) =>
        matchesChannelAuthorCollection(post, activeCollection),
      ),
    [activeCollection, profile?.recentPosts],
  );
  const activeCollectionLabel =
    collectionTabs.find((tab) => tab.key === activeCollection)?.label ?? "全部";
  const featuredLivePost = useMemo(
    () =>
      (profile?.recentPosts ?? []).find((post) => post.sourceKind === "live_clip") ??
      null,
    [profile?.recentPosts],
  );

  return (
    <AppPage
      className={cn(
        "space-y-0 px-0 py-0",
        isDesktopLayout ? "bg-[rgba(244,247,246,0.98)]" : "bg-[#f5f5f5]",
      )}
    >
      <TabPageTopBar
        title={profile?.authorName ?? "视频号作者"}
        subtitle="作者主页"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={navigateBackToChannels}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
      />

      <div className={cn("mx-auto w-full", isDesktopLayout ? "max-w-[1180px] px-6 py-6" : "px-4 py-4")}>
        {notice ? (
          <InlineNotice
            tone={notice.tone}
            className="mb-4 rounded-[14px] border-[color:var(--border-faint)] bg-white"
          >
            {notice.message}
          </InlineNotice>
        ) : null}
        {profileQuery.isLoading ? (
          <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white px-5 py-8 shadow-[var(--shadow-section)]">
            <LoadingBlock label="正在读取作者主页..." />
          </div>
        ) : null}
        {profileQuery.isError && profileQuery.error instanceof Error ? (
          <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white px-5 py-8 shadow-[var(--shadow-section)]">
            <ErrorBlock message={profileQuery.error.message} />
          </div>
        ) : null}
        {followMutation.isError && followMutation.error instanceof Error ? (
          <div className="mb-4 rounded-[22px] border border-[color:var(--border-faint)] bg-white px-5 py-5 shadow-[var(--shadow-section)]">
            <ErrorBlock message={followMutation.error.message} />
          </div>
        ) : null}

        {!profileQuery.isLoading && !profileQuery.isError && profile ? (
          <div
            className={cn(
              "grid gap-4",
              isDesktopLayout ? "grid-cols-[320px_minmax(0,1fr)] items-start" : "grid-cols-1",
            )}
          >
            <aside className="rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,246,0.96))] p-5 shadow-[var(--shadow-section)]">
              <div className="rounded-[22px] bg-[linear-gradient(180deg,#1f4132,#132721)] px-5 py-6 text-white">
                <div className="flex items-start justify-between gap-4">
                  <AvatarChip
                    name={profile.authorName}
                    src={profile.authorAvatar}
                    size="xl"
                  />
                  <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/84">
                    {profile.authorType === "character" ? "居民作者" : "世界主人"}
                  </div>
                </div>
                <div className="mt-4 text-[22px] font-semibold">
                  {profile.authorName}
                </div>
                <div className="mt-2 text-[13px] leading-6 text-white/76">
                  {profile.bio?.trim() || fallbackBio}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <AuthorMetricCard
                  icon={<Users size={15} />}
                  label="关注者"
                  value={String(profile.followerCount)}
                />
                <AuthorMetricCard
                  icon={<Clapperboard size={15} />}
                  label="最近内容"
                  value={String(profile.recentPosts.length)}
                />
              </div>

              <div className="mt-4 overflow-hidden rounded-[22px] border border-[rgba(31,65,50,0.12)] bg-[linear-gradient(180deg,rgba(22,48,38,0.98),rgba(17,34,28,0.98))] text-white shadow-[0_18px_34px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between px-4 pt-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/84">
                    <RadioTower size={13} />
                    直播入口
                  </div>
                  <div className="text-[11px] text-white/58">
                    {featuredLivePost ? "最近直播" : "等待开播"}
                  </div>
                </div>
                <div className="px-4 pb-4 pt-3">
                  <div className="text-[16px] font-semibold">
                    {featuredLivePost?.title?.trim() || "作者暂时还没有直播回放"}
                  </div>
                  <div className="mt-2 text-[12px] leading-6 text-white/70">
                    {featuredLivePost
                      ? `${formatTimestamp(featuredLivePost.createdAt)} · ${featuredLivePost.viewCount} 播放 · 从作者主页直接回到直播内容`
                      : "先把直播入口卡片放进作者主页，后续接真实直播状态和开播中入口。"}
                  </div>
                  <div className="mt-3 rounded-[16px] bg-white/8 px-3.5 py-3 text-[12px] leading-6 text-white/82">
                    {featuredLivePost?.text ||
                      "当前还没有直播回放内容，等作者下一次开播后，这里会优先展示最新回放。"}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!featuredLivePost}
                      onClick={() => {
                        if (featuredLivePost) {
                          openChannelPost(featuredLivePost);
                        }
                      }}
                      className="h-9 rounded-full bg-white px-4 text-[12px] text-[#163026] shadow-none hover:bg-white/92 disabled:bg-white/16 disabled:text-white/45"
                    >
                      {featuredLivePost ? "查看回放" : "暂无回放"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveCollection("live")}
                      className="h-9 rounded-full border border-white/14 bg-white/8 px-4 text-[12px] text-white shadow-none hover:bg-white/12"
                    >
                      浏览直播分栏
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                variant={profile.isFollowing ? "secondary" : "primary"}
                size="lg"
                disabled={followMutation.isPending}
                onClick={() => followMutation.mutate()}
                className={cn(
                  "mt-4 h-11 w-full rounded-full shadow-none",
                  profile.isFollowing
                    ? "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)]"
                    : "bg-[color:var(--brand-primary)] text-white hover:opacity-95",
                )}
              >
                {followMutation.isPending
                  ? "处理中..."
                  : profile.isFollowing
                    ? "已关注"
                    : "+关注"}
              </Button>

              <Button
                variant="secondary"
                size="lg"
                onClick={navigateBackToChannels}
                className="mt-3 h-11 w-full rounded-full border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] shadow-none"
              >
                返回视频号
              </Button>
            </aside>

            <section className="space-y-4">
              <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-dim)]">
                  Recent Posts
                </div>
                <div className="mt-2 text-[20px] font-semibold text-[color:var(--text-primary)]">
                  作品合集
                </div>
                <div className="mt-1 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                  对齐微信作者主页，先把作者最近内容按作品类型拆成分栏，方便从作者页继续下钻。
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {collectionTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveCollection(tab.key)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12px] transition",
                        activeCollection === tab.key
                          ? "border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.1)] font-medium text-[color:var(--brand-primary)]"
                          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] hover:bg-white",
                      )}
                    >
                      {tab.label}
                      <span className="ml-1 text-[11px] opacity-70">
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3 text-[12px] text-[color:var(--text-secondary)]">
                  当前分栏：{activeCollectionLabel}，共 {visiblePosts.length} 条内容。
                </div>
              </div>

              {visiblePosts.length ? (
                <div
                  className={cn(
                    "grid gap-3",
                    isDesktopLayout ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {visiblePosts.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => openChannelPost(post)}
                      className="overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white text-left shadow-[var(--shadow-section)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(15,23,42,0.08)]"
                    >
                      <div className="flex min-h-[10.5rem] gap-4 px-4 py-4">
                        <ChannelPostCover post={post} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[10px] text-[color:var(--text-dim)]">
                            <span>{formatTimestamp(post.createdAt)}</span>
                            <span>·</span>
                            <span>{post.mediaType === "video" ? "短片" : "内容卡片"}</span>
                          </div>
                          {post.title ? (
                            <div className="mt-2 line-clamp-2 text-[16px] font-semibold leading-6 text-[color:var(--text-primary)]">
                              {post.title}
                            </div>
                          ) : null}
                          <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                            {post.text}
                          </div>
                          {post.topicTags?.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {post.topicTags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2 py-1 text-[10px] text-[color:var(--text-secondary)]"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-console)] px-2.5 py-1">
                              <PlaySquare size={12} />
                              {post.viewCount} 播放
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-console)] px-2.5 py-1">
                              <MessageCircleMore size={12} />
                              {post.commentCount} 评论
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-white p-6 shadow-[var(--shadow-section)]">
                  <EmptyState
                    title={`${activeCollectionLabel}分栏暂时没有内容`}
                    description="切换其他分栏看看，或者等作者发布新的内容后再回来。"
                  />
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function AuthorMetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-4 text-[color:var(--text-primary)]">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(7,193,96,0.1)] text-[color:var(--brand-primary)]">
        {icon}
      </div>
      <div className="mt-3 text-[22px] font-semibold">{value}</div>
      <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
        {label}
      </div>
    </div>
  );
}

function ChannelPostCover({ post }: { post: FeedPostListItem }) {
  if (post.coverUrl?.trim()) {
    return (
      <div className="h-[8.75rem] w-[7rem] shrink-0 overflow-hidden rounded-[18px] bg-[#d8e5de]">
        <img
          src={post.coverUrl}
          alt={post.title || post.authorName}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex h-[8.75rem] w-[7rem] shrink-0 flex-col justify-between rounded-[18px] bg-[linear-gradient(180deg,#1c1f24,#0f1115)] px-3 py-3 text-white">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
        <PlaySquare size={16} />
      </div>
      <div>
        <div className="text-[11px] font-medium text-white/86">
          {post.mediaType === "video" ? "视频号短片" : "内容卡片"}
        </div>
        <div className="mt-1 text-[10px] text-white/62">
          {post.durationMs
            ? `${Math.max(1, Math.round(post.durationMs / 1000))} 秒`
            : "等待补充封面"}
        </div>
      </div>
    </div>
  );
}

function buildChannelsRouteHash(postId?: string | null) {
  if (!postId) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("post", postId);
  return params.toString();
}

function matchesChannelAuthorCollection(
  post: FeedPostListItem,
  tab: ChannelAuthorCollectionTab,
) {
  if (tab === "all") {
    return true;
  }

  if (tab === "live") {
    return post.sourceKind === "live_clip";
  }

  if (tab === "videos") {
    return post.mediaType === "video" && post.sourceKind !== "live_clip";
  }

  return post.mediaType !== "video";
}

function readStoredChannelAuthorCollection(authorId: string) {
  if (typeof window === "undefined") {
    return "all" as ChannelAuthorCollectionTab;
  }

  try {
    const rawValue = window.localStorage.getItem(
      CHANNEL_AUTHOR_COLLECTION_STORAGE_KEY,
    );
    if (!rawValue) {
      return "all";
    }

    const parsed = JSON.parse(rawValue) as Record<string, string>;
    const storedValue = parsed[authorId];
    if (storedValue === "videos" || storedValue === "updates" || storedValue === "live") {
      return storedValue;
    }
  } catch {
    return "all";
  }

  return "all";
}

function writeStoredChannelAuthorCollection(
  authorId: string,
  tab: ChannelAuthorCollectionTab,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(
      CHANNEL_AUTHOR_COLLECTION_STORAGE_KEY,
    );
    const currentMap = rawValue
      ? (JSON.parse(rawValue) as Record<string, string>)
      : {};

    currentMap[authorId] = tab;
    window.localStorage.setItem(
      CHANNEL_AUTHOR_COLLECTION_STORAGE_KEY,
      JSON.stringify(currentMap),
    );
  } catch {
    return;
  }
}
