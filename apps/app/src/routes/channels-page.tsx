import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  MessageCircleMore,
  ThumbsUp,
} from "lucide-react";
import {
  addFeedComment,
  getBlockedCharacters,
  getFeed,
  likeFeedPost,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
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
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ChannelsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [successNotice, setSuccessNotice] = useState("");

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
      setSuccessNotice("视频号互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-channels", baseUrl] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (postId: string) =>
      addFeedComment(
        postId,
        {
          text: commentDrafts[postId].trim(),
        },
        baseUrl,
      ),
    onSuccess: async (_, postId) => {
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setSuccessNotice("视频号评论已发送。");
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
    setSuccessNotice("");
  }, [baseUrl]);

  useEffect(() => {
    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, []);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  function toggleFavorite(post: (typeof visiblePosts)[number]) {
    const sourceId = `channels-${post.id}`;
    const nextFavorites = favoriteSourceIds.includes(sourceId)
      ? removeDesktopFavorite(sourceId)
      : upsertDesktopFavorite({
          id: `favorite-${sourceId}`,
          sourceId,
          category: "channels",
          title: post.authorName,
          description: post.text,
          meta: `视频号 · ${formatTimestamp(post.createdAt)}`,
          to: "/tabs/channels",
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
        successNotice={successNotice}
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
          void queryClient.invalidateQueries({ queryKey: ["app-channels", baseUrl] })
        }
        onToggleFavorite={toggleFavorite}
      />
    );
  }

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      <TabPageTopBar
        title="视频号"
        subtitle="AI 视频与内容流"
        titleAlign="center"
        leftActions={
          <Button
            onClick={() => navigate({ to: "/tabs/discover" })}
            variant="ghost"
            size="icon"
            className="border border-white/70 bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <Button
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ["app-channels", baseUrl] })
            }
            variant="ghost"
            size="sm"
            className="border border-white/70 bg-white/82"
          >
            刷新
          </Button>
        }
      >
        <div className="mt-3 flex items-center gap-2">
          <div className="rounded-full bg-[rgba(255,138,61,0.12)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
            推荐
          </div>
          <div className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] text-[color:var(--text-muted)]">
            朋友
          </div>
          <div className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] text-[color:var(--text-muted)]">
            直播
          </div>
        </div>
      </TabPageTopBar>

      <div className="space-y-4 px-4 pb-5">
        <InlineNotice tone="muted">
          首轮只放 AI 生成内容和 AI 生成视频，交互节奏按微信视频号的推荐流来收口。
        </InlineNotice>
        {successNotice ? (
          <InlineNotice tone="success">{successNotice}</InlineNotice>
        ) : null}
        {errorMessage ? <ErrorBlock message={errorMessage} /> : null}
        {channelsQuery.isLoading ? (
          <LoadingBlock label="正在读取视频号内容..." />
        ) : null}

        {!channelsQuery.isLoading && !visiblePosts.length ? (
          <EmptyState
            title="视频号还没有内容"
            description="等系统注入第一批 AI 演示内容后，这里会出现沉浸式推荐流。"
          />
        ) : null}

        {visiblePosts.map((post) => (
          <article
            key={post.id}
            className="overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,239,0.94))] shadow-[var(--shadow-card)]"
          >
            <div className="relative bg-[#0f1115]">
              <video
                src={post.mediaUrl}
                controls
                playsInline
                preload="metadata"
                loop
                className="block h-[420px] w-full bg-black object-cover"
              />
              <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-[rgba(15,23,42,0.65)] px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-white">
                视频号推荐
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.78))] px-4 pb-4 pt-10">
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
                      {formatTimestamp(post.createdAt)} · AI 世界内容
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-sm leading-7 text-white">
                  {post.text}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-xs text-[color:var(--text-muted)]">
                  <span>{post.likeCount} 赞</span>
                  <span>{post.commentCount} 评论</span>
                  <span>{post.mediaType === "video" ? "短片" : "内容卡片"}</span>
                </div>

                <div className="space-y-2 rounded-[24px] bg-[rgba(255,248,239,0.82)] p-3">
                  {post.commentsPreview.length ? (
                    post.commentsPreview.map((comment) => (
                      <div key={comment.id} className="text-xs leading-6 text-[color:var(--text-secondary)]">
                        <span className="font-medium text-[color:var(--text-primary)]">
                          {comment.authorName}
                        </span>
                        {`：${comment.text}`}
                      </div>
                    ))
                  ) : (
                    <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                      这条内容还没有评论，先说点什么。
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 rounded-[24px] bg-[rgba(255,248,239,0.82)] p-2.5">
                  <TextField
                    value={commentDrafts[post.id] ?? ""}
                    onChange={(event) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [post.id]: event.target.value,
                      }))
                    }
                    placeholder="写评论..."
                    className="min-w-0 flex-1 rounded-full bg-white/90"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={
                      !(commentDrafts[post.id] ?? "").trim() ||
                      pendingCommentPostId === post.id
                    }
                    onClick={() => commentMutation.mutate(post.id)}
                  >
                    {pendingCommentPostId === post.id ? "发送中..." : "发送"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={() => likeMutation.mutate(post.id)}
                  disabled={pendingLikePostId === post.id}
                >
                  <ThumbsUp size={18} />
                </Button>
                <div className="text-[11px] text-[color:var(--text-muted)]">
                  {pendingLikePostId === post.id ? "处理中" : post.likeCount}
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={() =>
                    document
                      .getElementById(`channel-comment-${post.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                >
                  <MessageCircleMore size={18} />
                </Button>
                <div className="text-[11px] text-[color:var(--text-muted)]">
                  {post.commentCount}
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={() => toggleFavorite(post)}
                >
                  {favoriteSourceIds.includes(`channels-${post.id}`) ? (
                    <Bookmark size={18} className="fill-current" />
                  ) : (
                    <Bookmark size={18} />
                  )}
                </Button>
                <div className="text-[11px] text-[color:var(--text-muted)]">
                  收藏
                </div>
              </div>
            </div>

            <div id={`channel-comment-${post.id}`} className="sr-only" />
          </article>
        ))}
      </div>
    </AppPage>
  );
}
