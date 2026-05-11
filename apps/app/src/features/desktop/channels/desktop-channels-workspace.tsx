import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator, translateRuntimeMessage } from "@yinjie/i18n";
import { useNavigate } from "@tanstack/react-router";
import type {
  FeedChannelAuthorProfile,
  FeedChannelHomeSection,
  FeedComment,
  FeedPostListItem,
} from "@yinjie/contracts";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MessageCircleMore,
  RadioTower,
  RefreshCcw,
  Share2,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AvatarChip } from "../../../components/avatar-chip";
import { AudioCard } from "../../../components/audio-card";
import { ChannelsForwardPicker } from "../../../components/channels-forward-picker";
import { EmptyState } from "../../../components/empty-state";
import { formatTimestamp } from "../../../lib/format";
import { resolveAppMediaUrl } from "../../../lib/media-url";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type DesktopChannelsWorkspaceProps = {
  activeSection: FeedChannelHomeSection;
  authorProfile: FeedChannelAuthorProfile | null;
  authorProfileErrorMessage?: string | null;
  authorProfileLoading: boolean;
  comments: FeedComment[];
  commentsErrorMessage?: string | null;
  commentsLoading: boolean;
  commentDrafts: Record<string, string>;
  commentLikePendingId: string | null;
  commentPendingPostId: string | null;
  commentReplyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  errorMessage?: string | null;
  isLoading: boolean;
  likePendingPostId: string | null;
  posts: FeedPostListItem[];
  routeSelectedAuthorId?: string | null;
  routeSelectedPostId?: string | null;
  successNotice?: string;
  isPostFavorite: (postId: string) => boolean;
  onCloseAuthor: () => void;
  onCancelCommentReply: () => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onOpenAuthor: (authorId: string) => void;
  onOpenAuthorPost: (postId: string, authorId: string) => void;
  onRefresh: () => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSectionChange: (section: FeedChannelHomeSection) => void;
  onSelectedPostChange: (postId: string | null) => void;
  onToggleAuthorFollow: (authorId: string, following: boolean) => void;
  onToggleFavorite: (post: FeedPostListItem) => void;
  onViewPost: (postId: string) => void;
  sections: Array<{
    key: FeedChannelHomeSection;
    label: string;
    count: number;
  }>;
};

const DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY =
  "yinjie:channels:desktop-comment-threads";

export function DesktopChannelsWorkspace({
  activeSection,
  authorProfile,
  authorProfileErrorMessage,
  authorProfileLoading,
  comments,
  commentsErrorMessage,
  commentsLoading,
  commentDrafts,
  commentLikePendingId,
  commentPendingPostId,
  commentReplyTarget,
  errorMessage,
  isLoading,
  likePendingPostId,
  posts,
  routeSelectedAuthorId = null,
  routeSelectedPostId = null,
  successNotice,
  isPostFavorite,
  onCloseAuthor,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onLikeComment,
  onOpenAuthor,
  onOpenAuthorPost,
  onRefresh,
  onReplyToComment,
  onSectionChange,
  onSelectedPostChange,
  onToggleAuthorFollow,
  onToggleFavorite,
  onViewPost,
  sections,
}: DesktopChannelsWorkspaceProps) {
  const navigate = useNavigate();
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  // 视频号转发面板：null = 关闭。点 Share 按钮 → 设当前帖摘要。
  const [forwardPickerPost, setForwardPickerPost] = useState<{
    id: string;
    excerpt: string;
  } | null>(null);
  const [forwardNotice, setForwardNotice] = useState<string | null>(null);
  const [commentDrawerPostId, setCommentDrawerPostId] = useState<string | null>(
    null,
  );

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef(new Map<string, HTMLDivElement>());
  const registerSlide = useCallback(
    (postId: string, node: HTMLDivElement | null) => {
      if (node) {
        slideRefs.current.set(postId, node);
      } else {
        slideRefs.current.delete(postId);
      }
    },
    [],
  );

  useEffect(() => {
    setSelectedPostId((current) =>
      current === routeSelectedPostId ? current : routeSelectedPostId,
    );
  }, [routeSelectedPostId]);

  useEffect(() => {
    if (!posts.length) {
      setSelectedPostId(null);
      return;
    }

    if (!selectedPostId || !posts.some((post) => post.id === selectedPostId)) {
      setSelectedPostId(posts[0]?.id ?? null);
    }
  }, [posts, selectedPostId]);

  const selectedPost =
    posts.find((post) => post.id === selectedPostId) ?? posts[0] ?? null;
  const selectedIndex = selectedPost
    ? posts.findIndex((post) => post.id === selectedPost.id)
    : -1;
  const authorPanelVisible = Boolean(routeSelectedAuthorId);

  useEffect(() => {
    onSelectedPostChange(selectedPost?.id ?? null);

    if (!selectedPost?.id) {
      return;
    }

    onViewPost(selectedPost.id);
  }, [onSelectedPostChange, onViewPost, selectedPost?.id]);

  // Close the comment drawer whenever the active post changes
  useEffect(() => {
    setCommentDrawerPostId((current) =>
      current && current === selectedPost?.id ? current : null,
    );
  }, [selectedPost?.id]);

  // IntersectionObserver: keep selectedPostId in sync with whichever slide
  // is currently filling the viewport.
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || posts.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) {
          return;
        }

        const postId = (visible.target as HTMLElement).dataset.postId;
        if (postId) {
          setSelectedPostId(postId);
        }
      },
      { root, threshold: [0.6] },
    );

    slideRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [posts]);

  // When routeSelectedPostId changes (e.g. opened via #post=xxx),
  // scroll the matching slide into view.
  useEffect(() => {
    if (!routeSelectedPostId) {
      return;
    }

    const node = slideRefs.current.get(routeSelectedPostId);
    if (node) {
      node.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [routeSelectedPostId, posts]);

  // Esc closes whichever overlay is on top (drawer first, then author panel).
  useEffect(() => {
    if (!commentDrawerPostId && !authorPanelVisible) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (commentDrawerPostId) {
        setCommentDrawerPostId(null);
      } else if (authorPanelVisible) {
        onCloseAuthor();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authorPanelVisible, commentDrawerPostId, onCloseAuthor]);

  const scrollToOffset = useCallback((delta: number) => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollBy({ top: delta, behavior: "smooth" });
  }, []);

  const handlePrev = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    scrollToOffset(-container.clientHeight);
  }, [scrollToOffset]);

  const handleNext = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    scrollToOffset(container.clientHeight);
  }, [scrollToOffset]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[rgba(244,247,246,0.98)]">
      <div className="border-b border-[color:var(--border-faint)] bg-white/92 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-4 px-6">
          <div className="flex h-full items-stretch gap-7">
            {sections.map((section) => {
              const active = activeSection === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSectionChange(section.key)}
                  className="relative flex h-full items-center text-[14px] outline-none"
                >
                  <span
                    className={cn(
                      "transition-colors",
                      active
                        ? "font-medium text-[color:var(--text-primary)]"
                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    {section.label}
                  </span>
                  {active ? (
                    <span className="pointer-events-none absolute bottom-0 left-1/2 h-[2px] w-7 -translate-x-1/2 rounded-full bg-[color:var(--brand-primary)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              <RefreshCcw size={14} />
              {t(msg`换一批`)}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                void navigate({ to: "/desktop/channels/live-companion" })
              }
            >
              <RadioTower size={14} />
              {t(msg`直播伴侣`)}
            </Button>
          </div>
        </div>

        {successNotice || errorMessage ? (
          <div className="space-y-2 border-t border-[color:var(--border-faint)] bg-white/76 px-6 py-2">
            {successNotice ? (
              <InlineNotice
                tone="success"
                className="border-[color:var(--border-faint)] bg-white"
              >
                {successNotice}
              </InlineNotice>
            ) : null}
            {errorMessage ? <ErrorBlock message={errorMessage} /> : null}
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#101013]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingBlock label={t(msg`正在读取视频号内容...`)} />
          </div>
        ) : null}

        {!isLoading && !posts.length ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title={t(msg`视频号还没有内容`)}
              description={t(msg`暂时还没有可看的内容。`)}
            />
          </div>
        ) : null}

        {!isLoading && posts.length ? (
          <>
            <div
              ref={scrollContainerRef}
              className="h-full snap-y snap-mandatory overflow-y-scroll scroll-smooth"
            >
              {posts.map((post) => (
                <ChannelFeedSlide
                  key={post.id}
                  post={post}
                  isActive={post.id === selectedPost?.id}
                  registerSlide={registerSlide}
                  isFavorite={isPostFavorite(post.id)}
                  likePending={likePendingPostId === post.id}
                  onLike={() => onLike(post.id)}
                  onOpenAuthor={() => onOpenAuthor(post.authorId)}
                  onShare={() =>
                    setForwardPickerPost({
                      id: post.id,
                      excerpt: `${post.authorName}：${post.text ?? ""}`.slice(
                        0,
                        80,
                      ),
                    })
                  }
                  onToggleAuthorFollow={() =>
                    onToggleAuthorFollow(
                      post.authorId,
                      Boolean(post.ownerState?.isFollowingAuthor),
                    )
                  }
                  onToggleCommentDrawer={() =>
                    setCommentDrawerPostId((current) =>
                      current === post.id ? null : post.id,
                    )
                  }
                  onToggleFavorite={() => onToggleFavorite(post)}
                />
              ))}
            </div>

            <FeedNavArrows
              canPrev={selectedIndex > 0}
              canNext={
                selectedIndex >= 0 && selectedIndex < posts.length - 1
              }
              onPrev={handlePrev}
              onNext={handleNext}
            />

            {selectedPost && commentDrawerPostId === selectedPost.id ? (
              <ChannelCommentsDrawer
                comments={comments}
                commentsErrorMessage={commentsErrorMessage}
                commentsLoading={commentsLoading}
                draft={commentDrafts[selectedPost.id] ?? ""}
                likePendingCommentId={commentLikePendingId}
                replyTarget={commentReplyTarget}
                selectedPost={selectedPost}
                submitPending={commentPendingPostId === selectedPost.id}
                onCancelReply={onCancelCommentReply}
                onClose={() => setCommentDrawerPostId(null)}
                onDraftChange={(value) =>
                  onCommentChange(selectedPost.id, value)
                }
                onLikeComment={onLikeComment}
                onReplyToComment={onReplyToComment}
                onSubmit={() => onCommentSubmit(selectedPost.id)}
              />
            ) : null}
          </>
        ) : null}

        {authorPanelVisible ? (
          <ChannelAuthorOverlay
            authorId={routeSelectedAuthorId}
            errorMessage={authorProfileErrorMessage}
            isLoading={authorProfileLoading}
            profile={authorProfile}
            selectedPostId={selectedPost?.id ?? null}
            onClose={onCloseAuthor}
            onOpenPost={onOpenAuthorPost}
            onToggleFollow={onToggleAuthorFollow}
          />
        ) : null}
      </div>

      <ChannelsForwardPicker
        open={Boolean(forwardPickerPost)}
        postId={forwardPickerPost?.id ?? null}
        postExcerpt={forwardPickerPost?.excerpt}
        baseUrl={baseUrl}
        onClose={() => setForwardPickerPost(null)}
        onForwarded={(target) => {
          setForwardNotice(t(msg`已转发给 ${target.name}。`));
          // 让 channels-home 数据刷新出新的 shareCount
          void queryClient.invalidateQueries({
            queryKey: ["app-channels-home", baseUrl],
          });
        }}
      />
      {forwardNotice ? (
        <ForwardNotice
          message={forwardNotice}
          onDismiss={() => setForwardNotice(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * 顶部短暂浮现的转发成功提示——3 秒自动消失。
 */
function ForwardNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div className="fixed left-1/2 top-6 z-[120] -translate-x-1/2 rounded-full bg-[rgba(17,24,39,0.92)] px-4 py-2 text-[13px] text-white shadow-lg">
      {message}
    </div>
  );
}

function ChannelActionButton({
  active = false,
  icon,
  label,
  pending = false,
  surface = "light",
  onClick,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  pending?: boolean;
  surface?: "light" | "dark";
  onClick: () => void;
}) {
  const isDark = surface === "dark";
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={pending}
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-1 outline-none",
        pending && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
          isDark
            ? active
              ? "border-[rgba(7,193,96,0.65)] bg-white/12 text-[color:var(--brand-primary)]"
              : "border-white/14 bg-white/12 text-white group-hover:bg-white/22"
            : active
              ? "border-[rgba(7,193,96,0.42)] bg-white text-[color:var(--brand-primary)] shadow-[var(--shadow-section)]"
              : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-[var(--shadow-section)] group-hover:bg-[color:var(--surface-console)] group-hover:text-[color:var(--text-primary)]",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[11px]",
          isDark
            ? active
              ? "font-medium text-[color:var(--brand-primary)]"
              : "text-white/72"
            : active
              ? "font-medium text-[color:var(--brand-primary)]"
              : "text-[color:var(--text-muted)]",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function ChannelMediaSurface({
  post,
  isActive,
}: {
  post: FeedPostListItem;
  isActive: boolean;
}) {
  const t = useRuntimeTranslator();
  const audioAsset = post.media?.find((asset) => asset.kind === "audio");
  const videoAsset = post.media?.find((asset) => asset.kind === "video");

  if (post.mediaType === "audio" && (audioAsset || post.mediaUrl)) {
    const backgroundCover = resolveAppMediaUrl(
      audioAsset?.posterUrl ?? post.coverUrl ?? undefined,
    );
    return (
      <div className="relative flex flex-1 items-center justify-center bg-gradient-to-b from-[#1f2533] to-[#0a0c10] px-6">
        {backgroundCover ? (
          // 浮在背景里的封面图（半透明），给音乐贴一些视觉氛围
          <img
            src={backgroundCover}
            alt={post.title ?? ""}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 blur-[1px]"
          />
        ) : null}
        <div className="relative">
          <AudioCard
            url={audioAsset?.url ?? post.mediaUrl ?? ""}
            posterUrl={audioAsset?.posterUrl ?? post.coverUrl ?? undefined}
            title={
              audioAsset?.title ?? post.title ?? `${post.authorName}·${t(msg`音乐`)}`
            }
            durationMs={audioAsset?.durationMs ?? post.durationMs ?? undefined}
            variant="feed"
          />
        </div>
      </div>
    );
  }

  if (post.mediaType === "video" && (videoAsset?.url || post.mediaUrl)) {
    const resolvedPoster = resolveAppMediaUrl(
      videoAsset?.posterUrl ?? post.coverUrl ?? undefined,
    );
    return (
      <ChannelVideoPlayer
        url={resolveAppMediaUrl(videoAsset?.url ?? post.mediaUrl ?? "")}
        posterUrl={resolvedPoster || undefined}
        isActive={isActive}
      />
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center text-center">
      <div className="px-6">
        <div className="text-[16px] font-semibold text-white">
          {t(msg`暂无可播放内容`)}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-white/72">
          {t(msg`稍后再来看看`)}
        </div>
      </div>
    </div>
  );
}

function ChannelVideoPlayer({
  url,
  posterUrl,
  isActive,
}: {
  url: string;
  posterUrl?: string;
  isActive: boolean;
}) {
  const t = useRuntimeTranslator();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);

  // React 的 muted prop 是异步设到 DOM 上的，浏览器评估 autoplay 时可能还没 muted →
  // autoplay 被策略拦截。用 callback ref 在 React 把 element 挂到 DOM 之前就把
  // muted 同步到 IDL 属性上。参考 facebook/react#10389。
  const setVideoNode = (node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node) {
      node.muted = true;
      node.defaultMuted = true;
    }
  };

  // 进入视口的 slide 自动播放，离开的暂停。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (isActive) {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {
          // 自动播放被阻断时静默失败；用户点击切换静音会再次触发 play。
        });
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isActive, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = muted;
    if (!muted && isActive) {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {
          // 取消静音后若浏览器仍阻断，回退到静音继续播放。
          setMuted(true);
        });
      }
    }
  }, [muted, isActive]);

  return (
    <>
      <video
        ref={setVideoNode}
        // key 让 src 变化时强制重建 video element，避免上一个视频的 buffered range 干扰
        key={url}
        src={url}
        poster={posterUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onClick={() => setMuted((current) => !current)}
        className="absolute inset-0 h-full w-full cursor-pointer bg-black object-contain"
      />
      <button
        type="button"
        aria-label={muted ? t(msg`取消静音`) : t(msg`静音`)}
        aria-pressed={!muted}
        onClick={(event) => {
          event.stopPropagation();
          setMuted((current) => !current);
        }}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/22 bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65"
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </>
  );
}

function ChannelFeedSlide({
  post,
  isActive,
  registerSlide,
  isFavorite,
  likePending,
  onLike,
  onOpenAuthor,
  onShare,
  onToggleAuthorFollow,
  onToggleCommentDrawer,
  onToggleFavorite,
}: {
  post: FeedPostListItem;
  isActive: boolean;
  registerSlide: (postId: string, node: HTMLDivElement | null) => void;
  isFavorite: boolean;
  likePending: boolean;
  onLike: () => void;
  onOpenAuthor: () => void;
  onShare: () => void;
  onToggleAuthorFollow: () => void;
  onToggleCommentDrawer: () => void;
  onToggleFavorite: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <div
      ref={(node) => registerSlide(post.id, node)}
      data-post-id={post.id}
      className="flex h-full min-h-[640px] snap-start snap-always items-center justify-center px-6 py-6"
    >
      <div className="flex max-h-full items-end gap-4">
        <article className="relative flex aspect-[9/16] h-[min(82vh,800px)] flex-shrink-0 overflow-hidden rounded-[20px] bg-[#0d0e12] shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
          <ChannelMediaSurface post={post} isActive={isActive} />
          <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-[rgba(15,23,42,0.68)] px-2.5 py-1 text-[11px] font-medium text-white">
            {t(msg`视频号推荐`)}
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(0,0,0,0.82)] via-[rgba(0,0,0,0.36)] to-transparent px-5 pb-5 pt-14">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenAuthor}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <AvatarChip
                  name={post.authorName}
                  src={post.authorAvatar}
                  size="wechat"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-white">
                    {post.authorName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/72">
                    {formatTimestamp(post.createdAt)} ·{" "}
                    {formatChannelMeta(post)}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={onToggleAuthorFollow}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] transition",
                  post.ownerState?.isFollowingAuthor
                    ? "border border-white/28 bg-transparent text-white/85 hover:bg-white/10"
                    : "bg-[color:var(--brand-primary)] text-white hover:opacity-95",
                )}
              >
                {post.ownerState?.isFollowingAuthor
                  ? t(msg`已关注`)
                  : t(msg`+ 关注`)}
              </button>
            </div>
            {post.title ? (
              <div className="mt-3 line-clamp-2 text-[15px] font-semibold text-white">
                {post.title}
              </div>
            ) : null}
            {post.text ? (
              <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-white/82">
                {post.text}
              </div>
            ) : null}
            {post.topicTags?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.topicTags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/14 px-2 py-0.5 text-[10px] text-white"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        <div className="flex w-12 flex-shrink-0 flex-col items-center gap-3 pb-12">
          <ChannelActionButton
            surface="dark"
            icon={<ThumbsUp size={18} />}
            label={`${post.likeCount}`}
            active={Boolean(post.ownerState?.hasLiked)}
            pending={likePending}
            onClick={onLike}
          />
          <ChannelActionButton
            surface="dark"
            icon={<MessageCircleMore size={18} />}
            label={`${post.commentCount}`}
            onClick={onToggleCommentDrawer}
          />
          <ChannelActionButton
            surface="dark"
            icon={<Share2 size={18} />}
            label={t(msg`转发`)}
            onClick={onShare}
          />
          <ChannelActionButton
            surface="dark"
            icon={<Bookmark size={18} />}
            label={isFavorite ? t(msg`已收藏`) : t(msg`收藏`)}
            active={isFavorite}
            onClick={onToggleFavorite}
          />
        </div>
      </div>
    </div>
  );
}

function ChannelCommentsDrawer({
  comments,
  commentsErrorMessage,
  commentsLoading,
  draft,
  likePendingCommentId,
  replyTarget,
  selectedPost,
  submitPending,
  onCancelReply,
  onClose,
  onDraftChange,
  onLikeComment,
  onReplyToComment,
  onSubmit,
}: {
  comments: FeedComment[];
  commentsErrorMessage?: string | null;
  commentsLoading: boolean;
  draft: string;
  likePendingCommentId: string | null;
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  selectedPost: FeedPostListItem;
  submitPending: boolean;
  onCancelReply: () => void;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6">
      <div className="pointer-events-auto flex max-h-[85vh] w-[380px] flex-col overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.32)] sm:translate-x-[260px]">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-faint)] px-4 py-3">
          <div>
            <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
              {t(msg`评论 ${selectedPost.commentCount}`)}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
              {selectedPost.authorName}
            </div>
          </div>
          <button
            type="button"
            aria-label={t(msg`关闭评论`)}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4 pt-2">
          {commentsErrorMessage ? (
            <div className="mt-3">
              <ErrorBlock message={commentsErrorMessage} />
            </div>
          ) : null}
          <DesktopChannelCommentsPanel
            comments={comments}
            commentsLoading={commentsLoading}
            draft={draft}
            likePendingCommentId={likePendingCommentId}
            replyTarget={replyTarget}
            selectedPost={selectedPost}
            submitPending={submitPending}
            onCancelReply={onCancelReply}
            onDraftChange={onDraftChange}
            onLikeComment={onLikeComment}
            onReplyToComment={onReplyToComment}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </div>
  );
}

function ChannelAuthorOverlay({
  authorId,
  errorMessage,
  isLoading,
  profile,
  selectedPostId,
  onClose,
  onOpenPost,
  onToggleFollow,
}: {
  authorId: string | null;
  errorMessage?: string | null;
  isLoading: boolean;
  profile: FeedChannelAuthorProfile | null;
  selectedPostId: string | null;
  onClose: () => void;
  onOpenPost: (postId: string, authorId: string) => void;
  onToggleFollow: (authorId: string, following: boolean) => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.55)] p-8 backdrop-blur-sm">
      <button
        type="button"
        aria-label={t(msg`关闭作者主页`)}
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-auto rounded-[24px] bg-white shadow-[var(--shadow-overlay)]">
        <DesktopChannelAuthorPanel
          authorId={authorId}
          errorMessage={errorMessage}
          isLoading={isLoading}
          profile={profile}
          selectedPostId={selectedPostId}
          onClose={onClose}
          onOpenPost={onOpenPost}
          onToggleFollow={onToggleFollow}
        />
      </div>
    </div>
  );
}

function FeedNavArrows({
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex flex-col gap-3">
      <button
        type="button"
        aria-label={t(msg`上一条`)}
        disabled={!canPrev}
        onClick={onPrev}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/22 bg-white/14 text-white transition hover:bg-white/24 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/14"
      >
        <ChevronUp size={20} />
      </button>
      <button
        type="button"
        aria-label={t(msg`下一条`)}
        disabled={!canNext}
        onClick={onNext}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/22 bg-white/14 text-white transition hover:bg-white/24 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/14"
      >
        <ChevronDown size={20} />
      </button>
    </div>
  );
}

function DesktopChannelAuthorPanel({
  authorId,
  errorMessage,
  isLoading,
  profile,
  selectedPostId,
  onClose,
  onOpenPost,
  onToggleFollow,
}: {
  authorId: string | null;
  errorMessage?: string | null;
  isLoading: boolean;
  profile: FeedChannelAuthorProfile | null;
  selectedPostId: string | null;
  onClose: () => void;
  onOpenPost: (postId: string, authorId: string) => void;
  onToggleFollow: (authorId: string, following: boolean) => void;
}) {
  const t = useRuntimeTranslator();
  const fallbackBio =
    profile?.authorType === "character"
      ? t(msg`这位居民暂时还没有填写视频号简介。`)
      : t(msg`这个视频号作者暂时还没有填写简介。`);
  const recentPosts = profile?.recentPosts.slice(0, 5) ?? [];
  const liveClipCount = (profile?.recentPosts ?? []).filter(
    (post) => post.sourceKind === "live_clip",
  ).length;

  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {t(msg`作者主页`)}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t(msg`回到内容`)}
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-4">
          <LoadingBlock label={t(msg`正在读取作者主页...`)} />
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4">
          <ErrorBlock message={errorMessage} />
        </div>
      ) : null}

      {!isLoading && !errorMessage && !profile ? (
        <div className="mt-4">
          <EmptyState
            title={t(msg`作者主页暂时不可用`)}
            description={t(msg`这位作者的信息还没有准备好，稍后再试。`)}
          />
        </div>
      ) : null}

      {!isLoading && !errorMessage && profile ? (
        <>
          <div className="mt-4 flex items-start gap-3">
            <AvatarChip
              name={profile.authorName}
              src={profile.authorAvatar}
              size="wechat"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-[16px] font-semibold text-[color:var(--text-primary)]">
                  {profile.authorName}
                </div>
                <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                  {profile.authorType === "character"
                    ? t(msg`居民作者`)
                    : t(msg`世界主人`)}
                </span>
              </div>
              <div className="mt-2 text-[12px] leading-6 text-[color:var(--text-secondary)]">
                {profile.bio?.trim() || fallbackBio}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {t(msg`${profile.followerCount} 关注者`)}
            </span>
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {t(msg`${profile.recentPosts.length} 条内容`)}
            </span>
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
              {t(msg`${liveClipCount} 条直播回放`)}
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant={profile.isFollowing ? "secondary" : "primary"}
              size="sm"
              onClick={() =>
                onToggleFollow(profile.authorId, profile.isFollowing)
              }
              className={
                profile.isFollowing
                  ? "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                  : "bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
              }
            >
              {profile.isFollowing ? t(msg`已关注`) : t(msg`+关注`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedPostId}
              onClick={onClose}
            >
              {t(msg`当前内容`)}
            </Button>
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`最近内容`)}
            </div>
            <div className="mt-3 space-y-2">
              {recentPosts.length ? (
                recentPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onOpenPost(post.id, profile.authorId)}
                    className={cn(
                      "w-full rounded-[16px] border px-3 py-3 text-left transition",
                      selectedPostId === post.id
                        ? "border-[rgba(7,193,96,0.14)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_8px_18px_rgba(15,23,42,0.04)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.04)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {post.title?.trim() || t(msg`查看这条内容`)}
                      </div>
                      <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                        {post.sourceKind === "live_clip"
                          ? t(msg`直播回放`)
                          : post.mediaType === "video"
                            ? t(msg`视频`)
                            : t(msg`动态`)}
                      </span>
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                      {post.text}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                      <span>{formatTimestamp(post.createdAt)}</span>
                      <span>·</span>
                      <span>{formatChannelMeta(post)}</span>
                      {selectedPostId === post.id ? (
                        <>
                          <span>·</span>
                          <span className="font-medium text-[color:var(--brand-primary)]">
                            {t(msg`当前内容`)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
                  {t(msg`这位作者暂时还没有可以展示的内容。`)}
                </div>
              )}
            </div>
          </div>

          {authorId && profile.authorId !== authorId ? (
            <div className="mt-4 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
              {t(msg`当前路由和作者数据还在同步，稍后会自动收敛到最新作者资料。`)}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function formatChannelMeta(post: FeedPostListItem) {
  const viewCount = post.viewCount ?? 0;
  const pieces = [translateRuntimeMessage(msg`${viewCount} 播放`)];

  if (typeof post.durationMs === "number" && post.durationMs > 0) {
    const seconds = Math.max(1, Math.round(post.durationMs / 1000));
    pieces.push(translateRuntimeMessage(msg`${seconds} 秒`));
  }

  if (post.topicTags?.length) {
    pieces.push(`#${post.topicTags[0]}`);
  }

  return pieces.join(" · ");
}

function DesktopChannelCommentsPanel({
  comments,
  commentsLoading,
  draft,
  likePendingCommentId,
  replyTarget,
  selectedPost,
  submitPending,
  onCancelReply,
  onDraftChange,
  onLikeComment,
  onReplyToComment,
  onSubmit,
}: {
  comments: FeedComment[];
  commentsLoading: boolean;
  draft: string;
  likePendingCommentId: string | null;
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
  selectedPost: FeedPostListItem | null;
  submitPending: boolean;
  onCancelReply: () => void;
  onDraftChange: (value: string) => void;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onSubmit: () => void;
}) {
  const t = useRuntimeTranslator();
  const selectedPostId = selectedPost?.id ?? null;
  const commentAuthorNameMap = useMemo(() => {
    const map = new Map<string, string>();
    comments.forEach((comment) => {
      map.set(comment.id, comment.authorName);
    });
    return map;
  }, [comments]);
  const commentThreads = useMemo(() => {
    const commentMap = new Map(comments.map((comment) => [comment.id, comment]));
    const rootComments = comments.filter(
      (comment) =>
        !comment.parentCommentId ||
        !commentMap.has(comment.parentCommentId),
    );
    const repliesByRoot = new Map<string, FeedComment[]>();

    comments.forEach((comment) => {
      if (!comment.parentCommentId || !commentMap.has(comment.parentCommentId)) {
        return;
      }

      const currentReplies = repliesByRoot.get(comment.parentCommentId) ?? [];
      currentReplies.push(comment);
      repliesByRoot.set(comment.parentCommentId, currentReplies);
    });

    return rootComments.map((rootComment) => ({
      rootComment,
      replies: repliesByRoot.get(rootComment.id) ?? [],
    }));
  }, [comments]);
  const threadIdsWithReplies = useMemo(
    () =>
      commentThreads
        .filter(({ replies }) => replies.length > 0)
        .map(({ rootComment }) => rootComment.id),
    [commentThreads],
  );
  const [collapsedThreadsByPostId, setCollapsedThreadsByPostId] = useState<
    Record<string, string[]>
  >(() => readStoredCollapsedChannelCommentThreads());
  const collapsedThreadIds = useMemo(() => {
    if (!selectedPostId) {
      return [];
    }

    return normalizeCollapsedThreadIds(
      collapsedThreadsByPostId[selectedPostId] ?? [],
      threadIdsWithReplies,
    );
  }, [collapsedThreadsByPostId, selectedPostId, threadIdsWithReplies]);

  function updateCollapsedThreadIds(
    updater: string[] | ((current: string[]) => string[]),
  ) {
    if (!selectedPostId) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = normalizeCollapsedThreadIds(
        current[selectedPostId] ?? [],
        threadIdsWithReplies,
      );
      const nextIdsRaw =
        typeof updater === "function" ? updater(currentIds) : updater;
      const nextIds = normalizeCollapsedThreadIds(
        nextIdsRaw,
        threadIdsWithReplies,
      );

      if (areThreadIdsEqual(currentIds, nextIds)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: nextIds,
      };
    });
  }

  useEffect(() => {
    if (!selectedPostId) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = current[selectedPostId] ?? [];
      const nextIds = normalizeCollapsedThreadIds(
        currentIds,
        threadIdsWithReplies,
      );
      if (areThreadIdsEqual(currentIds, nextIds)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: nextIds,
      };
    });
  }, [selectedPostId, threadIdsWithReplies]);

  useEffect(() => {
    writeStoredCollapsedChannelCommentThreads(collapsedThreadsByPostId);
  }, [collapsedThreadsByPostId]);

  useEffect(() => {
    if (!replyTarget || !selectedPostId) {
      return;
    }

    const matchingThread = commentThreads.find(
      ({ replies, rootComment }) =>
        rootComment.id === replyTarget.commentId ||
        replies.some((comment) => comment.id === replyTarget.commentId),
    );
    if (!matchingThread?.replies.length) {
      return;
    }

    setCollapsedThreadsByPostId((current) => {
      const currentIds = normalizeCollapsedThreadIds(
        current[selectedPostId] ?? [],
        threadIdsWithReplies,
      );

      if (!currentIds.includes(matchingThread.rootComment.id)) {
        return current;
      }

      return {
        ...current,
        [selectedPostId]: currentIds.filter(
          (threadId) => threadId !== matchingThread.rootComment.id,
        ),
      };
    });
  }, [commentThreads, replyTarget, selectedPostId, threadIdsWithReplies]);

  return (
    <div className="mt-3 space-y-3">
      {commentsLoading && !comments.length ? (
        <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
          {t(msg`正在读取评论...`)}
        </div>
      ) : null}
      {!commentsLoading && !comments.length ? (
        <div className="rounded-[14px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
          {t(msg`这条内容还没有评论，你可以先开口。`)}
        </div>
      ) : null}
      {threadIdsWithReplies.length ? (
        <div className="flex items-center justify-between rounded-[12px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[11px] text-[color:var(--text-secondary)]">
          <span>
            {t(msg`共 ${threadIdsWithReplies.length} 个可折叠线程`)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateCollapsedThreadIds([])}
              className="rounded-full border border-[color:var(--border-faint)] px-2.5 py-1 transition hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`全部展开`)}
            </button>
            <button
              type="button"
              onClick={() => updateCollapsedThreadIds(threadIdsWithReplies)}
              className="rounded-full border border-[color:var(--border-faint)] px-2.5 py-1 transition hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`全部收起`)}
            </button>
          </div>
        </div>
      ) : null}
      {commentThreads.length ? (
        <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
          {commentThreads.map(({ replies, rootComment }) => (
            <div
              key={rootComment.id}
              className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3"
            >
              <DesktopThreadCommentCard
                comment={rootComment}
                active={replyTarget?.commentId === rootComment.id}
                commentAuthorNameMap={commentAuthorNameMap}
                compact={false}
                likePendingCommentId={likePendingCommentId}
                onLikeComment={onLikeComment}
                onReplyToComment={onReplyToComment}
              />
              {replies.length ? (
                <DesktopCommentThreadReplies
                  collapsed={collapsedThreadIds.includes(rootComment.id)}
                  replies={replies}
                  replyTarget={replyTarget}
                  commentAuthorNameMap={commentAuthorNameMap}
                  likePendingCommentId={likePendingCommentId}
                  onLikeComment={onLikeComment}
                  onReplyToComment={onReplyToComment}
                  onToggleCollapsed={() =>
                    updateCollapsedThreadIds((current) =>
                      current.includes(rootComment.id)
                        ? current.filter((threadId) => threadId !== rootComment.id)
                        : [...current, rootComment.id],
                    )
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3">
        {replyTarget ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[12px] bg-[rgba(7,193,96,0.08)] px-3 py-2 text-[11px] text-[color:var(--brand-primary)]">
            <div className="truncate">
              {t(msg`正在回复 ${replyTarget.authorName}`)}
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="transition hover:opacity-75"
            >
              {t(msg`取消`)}
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <TextField
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={
              replyTarget
                ? t(msg`回复 ${replyTarget.authorName}...`)
                : selectedPost
                  ? t(msg`写下你对这条视频号内容的评论...`)
                  : t(msg`先选择一条内容`)
            }
            disabled={!selectedPost}
            className="min-w-0 flex-1 rounded-xl border-[color:var(--border-faint)] bg-white py-2.5 shadow-none hover:bg-white focus:border-[rgba(7,193,96,0.14)] focus:shadow-none"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedPost || !draft.trim() || submitPending}
            onClick={onSubmit}
            className="bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
          >
            {submitPending ? t(msg`发送中...`) : t(msg`发送`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DesktopCommentThreadReplies({
  collapsed,
  commentAuthorNameMap,
  likePendingCommentId,
  onLikeComment,
  onReplyToComment,
  onToggleCollapsed,
  replies,
  replyTarget,
}: {
  collapsed: boolean;
  commentAuthorNameMap: Map<string, string>;
  likePendingCommentId: string | null;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
  onToggleCollapsed: () => void;
  replies: FeedComment[];
  replyTarget: {
    authorId: string;
    authorName: string;
    commentId: string;
    postId: string;
  } | null;
}) {
  const t = useRuntimeTranslator();
  const latestReply = replies[replies.length - 1] ?? null;

  return (
    <div className="mt-3 rounded-[14px] border border-[rgba(7,193,96,0.12)] bg-white px-3 py-3">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 text-[10px] font-medium text-[color:var(--text-muted)]">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>{t(msg`楼中楼`)}</span>
        </div>
        <span className="text-[10px] text-[color:var(--text-muted)]">
          {collapsed
            ? t(msg`展开 ${replies.length} 条跟帖`)
            : t(msg`收起 ${replies.length} 条跟帖`)}
        </span>
      </button>
      {collapsed ? (
        <div className="mt-3 rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-[11px] leading-6 text-[color:var(--text-secondary)]">
          {latestReply ? (
            <>
              <span className="font-medium text-[color:var(--text-primary)]">
                {latestReply.authorName}
              </span>
              {`：${latestReply.text}`}
            </>
          ) : (
            t(msg`这个线程里还有跟帖。`)
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-l border-[rgba(7,193,96,0.14)] pl-3">
          {replies.map((comment) => (
            <DesktopThreadCommentCard
              key={comment.id}
              comment={comment}
              active={replyTarget?.commentId === comment.id}
              commentAuthorNameMap={commentAuthorNameMap}
              compact
              likePendingCommentId={likePendingCommentId}
              onLikeComment={onLikeComment}
              onReplyToComment={onReplyToComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DesktopThreadCommentCard({
  active,
  comment,
  commentAuthorNameMap,
  compact,
  likePendingCommentId,
  onLikeComment,
  onReplyToComment,
}: {
  active: boolean;
  comment: FeedComment;
  commentAuthorNameMap: Map<string, string>;
  compact: boolean;
  likePendingCommentId: string | null;
  onLikeComment: (comment: FeedComment) => void;
  onReplyToComment: (comment: FeedComment) => void;
}) {
  const t = useRuntimeTranslator();
  const replyTargetName = comment.replyToCommentId
    ? commentAuthorNameMap.get(comment.replyToCommentId) ?? null
    : null;

  return (
    <div
      className={cn(
        "rounded-[14px] border px-3 py-3 transition-colors",
        compact
          ? "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
          : "border-[color:var(--border-faint)] bg-white",
        active &&
          "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.06)] shadow-[inset_3px_0_0_0_var(--brand-primary)]",
      )}
    >
      <div className="flex items-start gap-3">
        <AvatarChip
          name={comment.authorName}
          src={comment.authorAvatar}
          size={compact ? "sm" : "wechat"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-[color:var(--text-primary)]">
              {comment.authorName}
            </span>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                comment.authorType === "character"
                  ? "border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] text-[color:var(--brand-primary)]"
                  : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)]",
              )}
            >
              {comment.authorType === "character"
                ? t(msg`居民`)
                : t(msg`世界主人`)}
            </span>
            {compact ? (
              <span className="rounded-md bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                {t(msg`回复层`)}
              </span>
            ) : (
              <span className="rounded-md bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                {t(msg`主评论`)}
              </span>
            )}
            <span className="text-[color:var(--text-dim)]">
              {formatTimestamp(comment.createdAt)}
            </span>
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
            {replyTargetName ? (
              <span className="text-[color:var(--text-muted)]">
                {t(msg`回复 ${replyTargetName}`)}
                {"："}
              </span>
            ) : null}
            {comment.text}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-[color:var(--text-muted)]">
            <button
              type="button"
              onClick={() => onReplyToComment(comment)}
              className="transition hover:text-[color:var(--text-primary)]"
            >
              {t(msg`回复`)}
            </button>
            <button
              type="button"
              disabled={
                comment.likedByOwner ||
                likePendingCommentId === comment.id
              }
              onClick={() => onLikeComment(comment)}
              className={cn(
                "inline-flex items-center gap-1 transition",
                comment.likedByOwner
                  ? "text-[color:var(--brand-primary)]"
                  : "hover:text-[color:var(--text-primary)]",
              )}
            >
              <ThumbsUp size={12} />
              {likePendingCommentId === comment.id
                ? t(msg`处理中`)
                : comment.likedByOwner
                  ? t(msg`已赞 ${comment.likeCount}`)
                  : t(msg`赞 ${comment.likeCount}`)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function readStoredCollapsedChannelCommentThreads() {
  if (typeof window === "undefined") {
    return {} as Record<string, string[]>;
  }

  try {
    const rawValue = window.localStorage.getItem(
      DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
    );
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([postId, threadIds]) => [
        postId,
        Array.isArray(threadIds)
          ? threadIds.filter((threadId): threadId is string => typeof threadId === "string")
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

function writeStoredCollapsedChannelCommentThreads(
  collapsedThreadsByPostId: Record<string, string[]>,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const sanitized = Object.fromEntries(
      Object.entries(collapsedThreadsByPostId).filter(
        ([, threadIds]) => threadIds.length > 0,
      ),
    );
    if (!Object.keys(sanitized).length) {
      window.localStorage.removeItem(
        DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
      );
      return;
    }

    window.localStorage.setItem(
      DESKTOP_CHANNEL_COMMENT_THREAD_STORAGE_KEY,
      JSON.stringify(sanitized),
    );
  } catch {
    return;
  }
}

function normalizeCollapsedThreadIds(
  threadIds: string[],
  availableThreadIds: string[],
) {
  const availableThreadIdSet = new Set(availableThreadIds);
  const nextThreadIds: string[] = [];

  threadIds.forEach((threadId) => {
    if (
      availableThreadIdSet.has(threadId) &&
      !nextThreadIds.includes(threadId)
    ) {
      nextThreadIds.push(threadId);
    }
  });

  return nextThreadIds;
}

function areThreadIdsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((threadId, index) => threadId === right[index]);
}
