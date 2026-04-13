import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  Copy,
  MessageCircleMore,
  Pause,
  Play,
  Share2,
  ThumbsUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  addFeedComment,
  generateChannelPost,
  getBlockedCharacters,
  getFeed,
  likeFeedPost,
  type FeedPostListItem,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  cn,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopChannelsWorkspace } from "../features/desktop/channels/desktop-channels-workspace";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ChannelsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const routeSelectedPostId = parseDesktopChannelsRouteHash(hash);

  const channelsQuery = useQuery({
    queryKey: ["app-channels", baseUrl],
    queryFn: () => getFeed(1, 20, baseUrl, { surface: "channels" }),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-channels-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNotice("视频号互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-channels", baseUrl] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (postId: string) => {
      const text = commentDrafts[postId]?.trim();
      if (!text) {
        throw new Error("请先输入评论内容。");
      }

      return addFeedComment(
        postId,
        {
          text,
        },
        baseUrl,
      );
    },
    onSuccess: async (_, postId) => {
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setNoticeTone("success");
      setNotice("视频号评论已发送。");
      await queryClient.invalidateQueries({ queryKey: ["app-channels", baseUrl] });
    },
  });
  const generateMutation = useMutation({
    mutationFn: () => generateChannelPost(baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNotice("已生成一条新的 AI 视频号内容。");
      await queryClient.invalidateQueries({ queryKey: ["app-channels", baseUrl] });
    },
  });

  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );
  const visiblePosts = useMemo(
    () =>
      (channelsQuery.data?.posts ?? []).filter(
        (post) =>
          post.authorType !== "character" ||
          !blockedCharacterIds.has(post.authorId),
      ),
    [blockedCharacterIds, channelsQuery.data?.posts],
  );
  const errorMessage =
    (channelsQuery.isError && channelsQuery.error instanceof Error
      ? channelsQuery.error.message
      : null) ??
    (blockedQuery.isError && blockedQuery.error instanceof Error
      ? blockedQuery.error.message
      : null) ??
    (likeMutation.isError && likeMutation.error instanceof Error
      ? likeMutation.error.message
      : null) ??
    (generateMutation.isError && generateMutation.error instanceof Error
      ? generateMutation.error.message
      : null) ??
    (commentMutation.isError && commentMutation.error instanceof Error
      ? commentMutation.error.message
      : null);
  const pendingLikePostId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentPostId = commentMutation.isPending
    ? commentMutation.variables
    : null;

  useEffect(() => {
    setCommentDrafts({});
    setNotice("");
  }, [baseUrl]);

  useEffect(() => {
    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, []);

  useEffect(() => {
    if (!nativeDesktopFavorites) {
      return;
    }

    let cancelled = false;

    async function syncFavoriteSourceIds() {
      const favoriteSourceIds = (await hydrateDesktopFavoritesFromNative()).map(
        (item) => item.sourceId,
      );
      if (cancelled) {
        return;
      }

      setFavoriteSourceIds((current) =>
        JSON.stringify(current) === JSON.stringify(favoriteSourceIds)
          ? current
          : favoriteSourceIds,
      );
    }

    const handleFocus = () => {
      void syncFavoriteSourceIds();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncFavoriteSourceIds();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [nativeDesktopFavorites]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function handleSharePost(post: (typeof visiblePosts)[number]) {
    const shareHash = buildDesktopChannelsRouteHash(post.id);
    const sharePath = `${pathname}${shareHash ? `#${shareHash}` : ""}`;
    const shareUrl =
      typeof window === "undefined"
        ? sharePath
        : `${window.location.origin}${sharePath}`;
    const summaryText = `${post.authorName}：${post.text}\n${shareUrl}`;

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${post.authorName} 的视频号动态`,
        text: `${post.authorName}：${post.text}`,
        url: shareUrl,
      });

      if (shared) {
        setNoticeTone("success");
        setNotice("已打开系统分享面板。");
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setNotice(
        nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制内容摘要。",
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(summaryText);
      setNoticeTone("success");
      setNotice(
        nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制内容摘要。"
          : "内容摘要已复制。",
      );
    } catch {
      setNoticeTone("info");
      setNotice(
        nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制内容摘要失败，请稍后重试。",
      );
    }
  }

  function toggleFavorite(post: (typeof visiblePosts)[number]) {
    const sourceId = `channels-${post.id}`;
    const routeHash = buildDesktopChannelsRouteHash(post.id);
    const nextFavorites = favoriteSourceIds.includes(sourceId)
      ? removeDesktopFavorite(sourceId)
      : upsertDesktopFavorite({
          id: `favorite-${sourceId}`,
          sourceId,
          category: "channels",
          title: post.authorName,
          description: post.text,
          meta: `视频号 · ${formatTimestamp(post.createdAt)}`,
          to: `/tabs/channels${routeHash ? `#${routeHash}` : ""}`,
          badge: "视频号",
          avatarName: post.authorName,
          avatarSrc: post.authorAvatar,
        });

    setFavoriteSourceIds(nextFavorites.map((item) => item.sourceId));
  }

  if (isDesktopLayout) {
    return (
      <DesktopChannelsWorkspace
        commentDrafts={commentDrafts}
        commentPendingPostId={pendingCommentPostId}
        errorMessage={errorMessage}
        isLoading={channelsQuery.isLoading}
        likePendingPostId={pendingLikePostId}
        posts={visiblePosts}
        routeSelectedPostId={routeSelectedPostId}
        successNotice={notice}
        isPostFavorite={(postId) =>
          favoriteSourceIds.includes(`channels-${postId}`)
        }
        onCommentChange={(postId, value) =>
          setCommentDrafts((current) => ({
            ...current,
            [postId]: value,
          }))
        }
        onCommentSubmit={(postId) => commentMutation.mutate(postId)}
        onLike={(postId) => likeMutation.mutate(postId)}
        onRefresh={() =>
          generateMutation.mutate()
        }
        onToggleFavorite={toggleFavorite}
      />
    );
  }

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      <TabPageTopBar
        title="视频号"
        subtitle="内容推荐与视频动态"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-black/6 bg-[rgba(247,247,247,0.92)] px-3 py-2.5 sm:mx-0 sm:px-3"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/discover" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] hover:bg-black/5"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <Button
            onClick={() => generateMutation.mutate()}
            variant="ghost"
            size="sm"
            className="h-9 rounded-full border border-black/5 bg-white px-4 text-[13px] font-medium text-[#111827] hover:bg-[#f5f5f5]"
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? "生成中..." : "换一批"}
          </Button>
        }
      >
        <div className="mt-3 flex items-center gap-2">
          <div className="rounded-full bg-[rgba(7,193,96,0.12)] px-3 py-1 text-[11px] font-medium text-[#07c160]">
            推荐
          </div>
          <div className="rounded-full border border-black/5 bg-white px-3 py-1 text-[11px] text-[color:var(--text-muted)]">
            朋友
          </div>
          <div className="rounded-full border border-black/5 bg-white px-3 py-1 text-[11px] text-[color:var(--text-muted)]">
            直播
          </div>
        </div>
      </TabPageTopBar>

      <div className="space-y-4 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        <InlineNotice tone="muted">
          当前先聚焦推荐流体验，系统会持续补充 AI 生成的视频内容与互动演示。
        </InlineNotice>
        {notice ? (
          <InlineNotice tone={noticeTone}>{notice}</InlineNotice>
        ) : null}
        {errorMessage ? <ErrorBlock message={errorMessage} /> : null}
        {channelsQuery.isLoading ? (
          <LoadingBlock label="正在读取视频号内容..." />
        ) : null}

        {!channelsQuery.isLoading && !visiblePosts.length ? (
          <EmptyState
            title="视频号还没有内容"
            description="再生成一批内容后，这里会逐步形成更连续的视频推荐流。"
          />
        ) : null}
        {!channelsQuery.isLoading && visiblePosts.length ? (
          <MobileChannelsViewport
            commentDrafts={commentDrafts}
            commentPendingPostId={pendingCommentPostId}
            favoriteSourceIds={favoriteSourceIds}
            likePendingPostId={pendingLikePostId}
            posts={visiblePosts}
            routeSelectedPostId={routeSelectedPostId}
            onCommentChange={(postId, value) =>
              setCommentDrafts((current) => ({
                ...current,
                [postId]: value,
              }))
            }
            onCommentSubmit={(postId) => commentMutation.mutate(postId)}
            onLike={(postId) => likeMutation.mutate(postId)}
            onShare={(post) => void handleSharePost(post)}
            onToggleFavorite={toggleFavorite}
          />
        ) : null}
      </div>
    </AppPage>
  );
}

function parseDesktopChannelsRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  return params.get("post")?.trim() || null;
}

function buildDesktopChannelsRouteHash(postId?: string | null) {
  if (!postId) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("post", postId);
  return params.toString();
}

type MobileChannelsViewportProps = {
  commentDrafts: Record<string, string>;
  commentPendingPostId: string | null;
  favoriteSourceIds: string[];
  likePendingPostId: string | null;
  posts: FeedPostListItem[];
  routeSelectedPostId: string | null;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onShare: (post: FeedPostListItem) => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
};

function MobileChannelsViewport({
  commentDrafts,
  commentPendingPostId,
  favoriteSourceIds,
  likePendingPostId,
  posts,
  routeSelectedPostId,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onShare,
  onToggleFavorite,
}: MobileChannelsViewportProps) {
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!posts.length) {
      setActivePostId(null);
      return;
    }

    if (!activePostId || !posts.some((post) => post.id === activePostId)) {
      setActivePostId(posts[0]?.id ?? null);
    }
  }, [activePostId, posts]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const nextPostId = nextEntry?.target.getAttribute("data-post-id");
        if (nextPostId) {
          setActivePostId(nextPostId);
        }
      },
      {
        threshold: [0.45, 0.65, 0.85],
        rootMargin: "-10% 0px -14% 0px",
      },
    );

    cardRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [posts]);

  useEffect(() => {
    if (!routeSelectedPostId) {
      return;
    }

    const targetNode = cardRefs.current.get(routeSelectedPostId);
    if (!targetNode) {
      return;
    }

    window.requestAnimationFrame(() => {
      targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
      setActivePostId(routeSelectedPostId);
    });
  }, [routeSelectedPostId, posts]);

  return (
    <div className="h-[calc(100dvh-10.75rem)] snap-y snap-mandatory space-y-3 overflow-y-auto overscroll-contain pb-4">
      {posts.map((post) => (
        <MobileChannelsCard
          key={post.id}
          active={activePostId === post.id}
          commentDraft={commentDrafts[post.id] ?? ""}
          commentPending={commentPendingPostId === post.id}
          favorite={favoriteSourceIds.includes(`channels-${post.id}`)}
          likePending={likePendingPostId === post.id}
          post={post}
          setCardRef={(node) => {
            if (node) {
              cardRefs.current.set(post.id, node);
              return;
            }

            cardRefs.current.delete(post.id);
          }}
          onCommentChange={(value) => onCommentChange(post.id, value)}
          onCommentSubmit={() => onCommentSubmit(post.id)}
          onLike={() => onLike(post.id)}
          onShare={() => onShare(post)}
          onToggleFavorite={() => onToggleFavorite(post)}
        />
      ))}
    </div>
  );
}

type MobileChannelsCardProps = {
  active: boolean;
  commentDraft: string;
  commentPending: boolean;
  favorite: boolean;
  likePending: boolean;
  post: FeedPostListItem;
  setCardRef: (node: HTMLElement | null) => void;
  onCommentChange: (value: string) => void;
  onCommentSubmit: () => void;
  onLike: () => void;
  onShare: () => void;
  onToggleFavorite: () => void;
};

function MobileChannelsCard({
  active,
  commentDraft,
  commentPending,
  favorite,
  likePending,
  post,
  setCardRef,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onShare,
  onToggleFavorite,
}: MobileChannelsCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [manuallyPaused, setManuallyPaused] = useState(false);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!active) {
      video.pause();
      setManuallyPaused(false);
      return;
    }

    if (manuallyPaused) {
      video.pause();
      return;
    }

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }, [active, manuallyPaused]);

  return (
    <article
      ref={setCardRef}
      data-post-id={post.id}
      className="snap-start overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-none"
    >
      <div className="relative min-h-[calc(100dvh-13rem)] bg-[#0f1115]">
        <video
          ref={videoRef}
          src={post.mediaUrl}
          loop
          muted
          playsInline
          preload="metadata"
          className="block h-[66dvh] w-full bg-black object-cover"
          onClick={() => setManuallyPaused((current) => !current)}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.88))]" />

        <div className="absolute left-4 top-4 flex items-center gap-2">
          <div className="rounded-full bg-[rgba(15,23,42,0.62)] px-3 py-1 text-[11px] font-medium tracking-[0.08em] text-white">
            视频号推荐
          </div>
          {post.aiReacted ? (
            <div className="rounded-full bg-[rgba(7,193,96,0.9)] px-3 py-1 text-[11px] font-medium text-white">
              AI 已互动
            </div>
          ) : null}
          {active ? (
            <div className="rounded-full bg-[rgba(7,193,96,0.82)] px-3 py-1 text-[11px] font-medium text-white">
              当前播放
            </div>
          ) : null}
        </div>

        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(15,23,42,0.62)] text-white backdrop-blur"
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setManuallyPaused((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(15,23,42,0.62)] text-white backdrop-blur"
          >
            {manuallyPaused ? <Play size={17} /> : <Pause size={17} />}
          </button>
        </div>

        <div className="absolute inset-y-0 right-0 flex items-center pr-4">
          <div className="flex flex-col items-center gap-3">
            <ActionRailButton
              label={likePending ? "处理中" : String(post.likeCount)}
              onClick={onLike}
            >
              <ThumbsUp size={18} />
            </ActionRailButton>
            <ActionRailButton
              label={String(post.commentCount)}
              onClick={() =>
                composerRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                })
              }
            >
              <MessageCircleMore size={18} />
            </ActionRailButton>
            <ActionRailButton
              active={favorite}
              label={favorite ? "已收藏" : "收藏"}
              onClick={onToggleFavorite}
            >
              {favorite ? (
                <Bookmark size={18} className="fill-current" />
              ) : (
                <Bookmark size={18} />
              )}
            </ActionRailButton>
            <ActionRailButton label="分享" onClick={onShare}>
              <Share2 size={18} />
            </ActionRailButton>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
          <div className="max-w-[calc(100%-5rem)]">
            <div className="flex items-center gap-3">
              <AvatarChip
                name={post.authorName}
                src={post.authorAvatar}
                size="wechat"
              />
              <div className="min-w-0 flex-1 text-white">
                <div className="truncate text-sm font-medium">
                  {post.authorName}
                </div>
                <div className="mt-1 text-xs text-white/72">
                  {formatTimestamp(post.createdAt)} · 视频号动态
                </div>
              </div>
            </div>
            <div className="mt-3 text-sm leading-7 text-white">{post.text}</div>
            <div className="mt-3 rounded-[22px] bg-[rgba(255,255,255,0.12)] px-3 py-2 text-xs leading-6 text-white/86 backdrop-blur">
              {post.commentsPreview.length ? (
                <>
                  <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-white/62">
                    最近评论
                  </div>
                  {post.commentsPreview.slice(0, 2).map((comment) => (
                    <div key={comment.id}>
                      <span className="font-medium">{comment.authorName}</span>
                      {`：${comment.text}`}
                    </div>
                  ))}
                </>
              ) : (
                <span>还没有评论，先和这条视频号内容聊一句。</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={composerRef}
        className="grid gap-3 border-t border-black/5 bg-white px-4 py-4"
      >
        <div className="flex items-center gap-3 text-[12px] text-[color:var(--text-muted)]">
          <span>{post.mediaType === "video" ? "短片" : "内容卡片"}</span>
          <span>{post.likeCount} 赞</span>
          <span>{post.commentCount} 评论</span>
        </div>
        <div className="flex items-center gap-2 rounded-[18px] bg-[#f5f5f5] p-2.5">
          <TextField
            value={commentDraft}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="写下你对这条视频号内容的评论..."
            className="min-w-0 flex-1 rounded-full border-black/5 bg-white"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!commentDraft.trim() || commentPending}
            onClick={onCommentSubmit}
            className="bg-[color:var(--brand-primary)] text-white hover:opacity-95"
          >
            {commentPending ? "发送中..." : "发送"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ActionRailButton({
  children,
  label,
  active = false,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 text-white"
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(15,23,42,0.62)] backdrop-blur",
          active && "bg-[color:var(--brand-primary)] shadow-[0_10px_24px_rgba(7,193,96,0.14)]",
        )}
      >
        {children}
      </span>
      <span className="text-[11px]">{label}</span>
    </button>
  );
}
