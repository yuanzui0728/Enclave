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
    if (isDesktopLayout) {
      void navigate({ to: "/tabs/channels" });
      return;
    }

    void navigate({ to: "/discover/channels" });
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
          <div className="mx-auto max-w-[820px] overflow-hidden rounded-[26px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
            <section
              className={cn(
                "bg-[linear-gradient(180deg,#ffffff,#f7faf8)]",
                isDesktopLayout ? "px-6 pb-6 pt-6" : "px-4 pb-5 pt-5",
              )}
            >
              <div className="flex items-start gap-4">
                <AvatarChip
                  name={profile.authorName}
                  src={profile.authorAvatar}
                  size="xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-[24px] font-semibold text-[color:var(--text-primary)]">
                      {profile.authorName}
                    </div>
                    <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                      {profile.authorType === "character" ? "居民作者" : "世界主人"}
                    </span>
                  </div>
                  <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                    {profile.bio?.trim() || fallbackBio}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ChannelAuthorHeaderStat
                      icon={<Users size={14} />}
                      label="关注者"
                      value={String(profile.followerCount)}
                    />
                    <ChannelAuthorHeaderStat
                      icon={<Clapperboard size={14} />}
                      label="最近内容"
                      value={String(profile.recentPosts.length)}
                    />
                    <ChannelAuthorHeaderStat
                      icon={<RadioTower size={14} />}
                      label="直播回放"
                      value={String(
                        (profile.recentPosts ?? []).filter(
                          (post) => post.sourceKind === "live_clip",
                        ).length,
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant={profile.isFollowing ? "secondary" : "primary"}
                  size="lg"
                  disabled={followMutation.isPending}
                  onClick={() => followMutation.mutate()}
                  className={cn(
                    "h-11 rounded-full px-5 shadow-none",
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
                  className="h-11 rounded-full border-[color:var(--border-faint)] bg-white px-5 text-[color:var(--text-primary)] shadow-none"
                >
                  返回视频号
                </Button>
              </div>
            </section>

            {featuredLivePost ? (
              <button
                type="button"
                onClick={() => openChannelPost(featuredLivePost)}
                className="flex w-full items-start justify-between gap-3 border-t border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(127,29,29,0.04),rgba(127,29,29,0.01))] px-4 py-4 text-left transition hover:bg-[rgba(127,29,29,0.06)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(127,29,29,0.08)] px-3 py-1 text-[11px] font-medium text-[#7f1d1d]">
                    <RadioTower size={13} />
                    最近直播回放
                  </div>
                  <div className="mt-3 line-clamp-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
                    {featuredLivePost.title?.trim() || "查看作者最近一次直播回放"}
                  </div>
                  <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                    {formatTimestamp(featuredLivePost.createdAt)} · {featuredLivePost.viewCount} 播放
                  </div>
                  <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                    {featuredLivePost.text}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[rgba(127,29,29,0.12)] bg-white px-3 py-1 text-[11px] font-medium text-[#7f1d1d]">
                  查看回放
                </span>
              </button>
            ) : null}

            <section>
              <div className="border-y border-[color:var(--border-faint)] bg-white px-3">
                <div className="flex overflow-x-auto">
                  {collectionTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveCollection(tab.key)}
                      className={cn(
                        "relative shrink-0 px-4 py-3 text-[14px] transition",
                        activeCollection === tab.key
                          ? "font-medium text-[color:var(--text-primary)]"
                          : "text-[color:var(--text-secondary)]",
                      )}
                    >
                      {tab.label}
                      <span className="ml-1 text-[11px] opacity-70">
                        {tab.count}
                      </span>
                      {activeCollection === tab.key ? (
                        <span className="absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--brand-primary)]" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[color:var(--surface-console)] px-4 py-3 text-[12px] text-[color:var(--text-secondary)]">
                当前分栏：{activeCollectionLabel}，共 {visiblePosts.length} 条内容。
              </div>

              {visiblePosts.length ? (
                <div className="divide-y divide-[color:var(--border-faint)] bg-white">
                  {visiblePosts.map((post) => {
                    const postStatus = resolveChannelPostCardStatus(post);

                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => openChannelPost(post)}
                        className="flex w-full items-start gap-4 px-4 py-4 text-left transition hover:bg-[rgba(15,23,42,0.02)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium",
                                postStatus.primaryBadgeClassName,
                              )}
                            >
                              {postStatus.label}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px]",
                                postStatus.secondaryBadgeClassName,
                              )}
                            >
                              {postStatus.secondaryLabel}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-[color:var(--text-dim)]">
                            <span>{formatTimestamp(post.createdAt)}</span>
                            <span>·</span>
                            <span>{postStatus.metaLabel}</span>
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
                        <ChannelPostCover post={post} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white p-6">
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

function ChannelAuthorHeaderStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-white px-3.5 py-2 text-[color:var(--text-primary)]">
      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(7,193,96,0.1)] text-[color:var(--brand-primary)]">
        {icon}
      </div>
      <div>
        <div className="text-[14px] font-semibold">{value}</div>
        <div className="text-[11px] text-[color:var(--text-secondary)]">
          {label}
        </div>
      </div>
    </div>
  );
}

function ChannelPostCover({ post }: { post: FeedPostListItem }) {
  const coverPresentation = resolveChannelPostCoverPresentation(post);

  if (post.coverUrl?.trim()) {
    return (
      <div className="relative h-[8.75rem] w-[7rem] shrink-0 overflow-hidden rounded-[18px] bg-[#d8e5de]">
        <img
          src={post.coverUrl}
          alt={post.title || post.authorName}
          className="h-full w-full object-cover"
        />
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex items-center justify-between px-2.5 py-2 text-white",
            coverPresentation.overlayClassName,
          )}
        >
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
              coverPresentation.badgeClassName,
            )}
          >
            {coverPresentation.icon}
            {coverPresentation.label}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.86))] px-2.5 py-2">
          <div className="text-[10px] text-white/88">
            {coverPresentation.secondaryLabel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-[8.75rem] w-[7rem] shrink-0 flex-col justify-between rounded-[18px] px-3 py-3 text-white",
        coverPresentation.panelClassName,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/12">
          {coverPresentation.icon}
        </div>
        <div
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-medium",
            coverPresentation.badgeClassName,
          )}
        >
          {coverPresentation.label}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-medium text-white/86">
          {coverPresentation.title}
        </div>
        <div className="mt-1 text-[10px] text-white/62">
          {coverPresentation.secondaryLabel}
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

function resolveChannelPostCoverPresentation(post: FeedPostListItem) {
  if (post.sourceKind === "live_clip") {
    return {
      badgeClassName: "bg-[rgba(255,255,255,0.14)] text-white",
      icon: <RadioTower size={14} />,
      label: "直播回放",
      overlayClassName:
        "bg-[linear-gradient(180deg,rgba(120,24,24,0.82),rgba(120,24,24,0))]",
      panelClassName:
        "bg-[linear-gradient(180deg,#7f1d1d,#451a03)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
      secondaryLabel: `${formatTimestamp(post.createdAt)} · ${post.viewCount} 播放`,
      title: "直播精选",
    };
  }

  if (post.mediaType === "video") {
    return {
      badgeClassName: "bg-[rgba(255,255,255,0.14)] text-white",
      icon: <PlaySquare size={14} />,
      label: "视频",
      overlayClassName:
        "bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0))]",
      panelClassName:
        "bg-[linear-gradient(180deg,#1f2937,#0f172a)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
      secondaryLabel: post.durationMs
        ? `${Math.max(1, Math.round(post.durationMs / 1000))} 秒 · ${post.viewCount} 播放`
        : `${post.viewCount} 播放`,
      title: "视频号短片",
    };
  }

  return {
    badgeClassName: "bg-[rgba(7,193,96,0.18)] text-white",
    icon: <MessageCircleMore size={14} />,
    label: "动态",
    overlayClassName:
      "bg-[linear-gradient(180deg,rgba(22,101,52,0.72),rgba(22,101,52,0))]",
    panelClassName:
      "bg-[linear-gradient(180deg,#166534,#14532d)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
    secondaryLabel: `${formatTimestamp(post.createdAt)} · 内容更新`,
    title: "内容卡片",
  };
}

function resolveChannelPostCardStatus(post: FeedPostListItem) {
  if (post.sourceKind === "live_clip") {
    return {
      label: "直播回放",
      metaLabel: "直播精选",
      primaryBadgeClassName:
        "border-[rgba(185,28,28,0.12)] bg-[rgba(185,28,28,0.08)] text-[#991b1b]",
      secondaryBadgeClassName:
        "border-[rgba(127,29,29,0.1)] bg-[rgba(127,29,29,0.05)] text-[#7f1d1d]",
      secondaryLabel: post.durationMs
        ? `${Math.max(1, Math.round(post.durationMs / 60000))} 分钟回放`
        : "作者直播内容",
    };
  }

  if (post.mediaType === "video") {
    return {
      label: "视频",
      metaLabel: "短片更新",
      primaryBadgeClassName:
        "border-[rgba(15,23,42,0.08)] bg-[rgba(15,23,42,0.05)] text-[#0f172a]",
      secondaryBadgeClassName:
        "border-[rgba(15,23,42,0.08)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
      secondaryLabel: post.durationMs
        ? `${Math.max(1, Math.round(post.durationMs / 1000))} 秒短片`
        : "视频号短片",
    };
  }

  return {
    label: "动态",
    metaLabel: "内容卡片",
    primaryBadgeClassName:
      "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]",
    secondaryBadgeClassName:
      "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
    secondaryLabel: post.topicTags?.length
      ? `#${post.topicTags[0]}`
      : "内容更新",
  };
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
