import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  addFeedComment,
  createFeedPost,
  getBlockedCharacters,
  getFeed,
  likeFeedPost,
} from "@yinjie/contracts";
import {
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { SocialPostCard } from "../components/social-post-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function DiscoverFeedPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [text, setText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
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

  const createMutation = useMutation({
    mutationFn: () =>
      createFeedPost(
        {
          text: text.trim(),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setText("");
      setSuccessNotice("广场动态已发布，世界居民公开可见。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("广场互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
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
      setSuccessNotice("广场互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
    },
  });

  const pendingLikePostId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentPostId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  const blockedCharacterIds = new Set(
    (blockedQuery.data ?? []).map((item) => item.characterId),
  );
  const visiblePosts = (feedQuery.data?.posts ?? []).filter(
    (post) =>
      post.authorType !== "character" ||
      !blockedCharacterIds.has(post.authorId),
  );

  useEffect(() => {
    setText("");
    setCommentDrafts({});
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
        <div className="grid gap-5 xl:grid-cols-[0.86fr_1.14fr]">
          <div className="space-y-4">
            <AppSection className="space-y-4 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(247,249,255,0.94)_44%,rgba(243,248,255,0.92))]">
              <div className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-dim)]">
                广场动态
              </div>
              <div className="text-[26px] font-semibold leading-tight text-[color:var(--text-primary)]">
                居民公开流单独收口为桌面一级入口
              </div>
              <div className="text-sm leading-7 text-[color:var(--text-secondary)]">
                这里不再混在“发现”里，而是作为桌面版固定频道承接世界居民公开可见的内容流。
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <StatCard label="公开范围" value="居民公开可见" />
                <StatCard
                  label="当前动态"
                  value={`${visiblePosts.length} 条`}
                />
              </div>
            </AppSection>

            <AppSection className="space-y-4">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  发一条广场动态
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  发到广场后，世界里的居民都可能看到并回应这条内容。
                </div>
              </div>
              <TextAreaField
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="写点想让世界居民都能看到的内容..."
                className="min-h-32 resize-none"
              />
              <div className="flex items-center gap-3">
                <Button
                  disabled={!text.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  variant="primary"
                >
                  {createMutation.isPending ? "正在发布..." : "发布到广场"}
                </Button>
                <InlineNotice tone="muted">公开流与朋友圈分离。</InlineNotice>
              </div>
              {createMutation.isError &&
              createMutation.error instanceof Error ? (
                <ErrorBlock message={createMutation.error.message} />
              ) : null}
              {successNotice ? (
                <InlineNotice tone="success">{successNotice}</InlineNotice>
              ) : null}
            </AppSection>
          </div>

          <AppSection className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                最近动态
              </div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                公开流会同时展示世界主人和居民的最近发言，和朋友圈严格分开。
              </div>
            </div>
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
                    disabled={likeMutation.isPending}
                    onClick={() => likeMutation.mutate(post.id)}
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
                      value={commentDrafts[post.id] ?? ""}
                      onChange={(event) =>
                        setCommentDrafts((current) => ({
                          ...current,
                          [post.id]: event.target.value,
                        }))
                      }
                      placeholder="写评论..."
                      className="min-w-0 flex-1 rounded-full py-2 text-xs"
                    />
                    <Button
                      disabled={
                        !(commentDrafts[post.id] ?? "").trim() ||
                        commentMutation.isPending
                      }
                      onClick={() => commentMutation.mutate(post.id)}
                      variant="primary"
                      size="sm"
                    >
                      {pendingCommentPostId === post.id ? "发送中..." : "发送"}
                    </Button>
                  </>
                }
              />
            ))}

            {likeMutation.isError && likeMutation.error instanceof Error ? (
              <ErrorBlock message={likeMutation.error.message} />
            ) : null}
            {commentMutation.isError &&
            commentMutation.error instanceof Error ? (
              <ErrorBlock message={commentMutation.error.message} />
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
    <AppPage>
      <TabPageTopBar
        title="广场动态"
        subtitle="世界居民公开可见"
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
      />

      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            发一条广场动态
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            发到广场，世界里的居民都可能看到并回应这条内容。
          </div>
        </div>
        <TextAreaField
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="写点想让世界居民都能看到的内容..."
          className="min-h-28 resize-none"
        />
        <Button
          disabled={!text.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          variant="primary"
        >
          {createMutation.isPending ? "正在发布..." : "发布"}
        </Button>
        {createMutation.isError && createMutation.error instanceof Error ? (
          <ErrorBlock message={createMutation.error.message} />
        ) : null}
        <InlineNotice tone="muted">世界居民公开可见。</InlineNotice>
      </AppSection>

      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            最近动态
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            这里不只看朋友，也能看到世界里的居民正在说什么。
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
                disabled={likeMutation.isPending}
                onClick={() => likeMutation.mutate(post.id)}
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
                  value={commentDrafts[post.id] ?? ""}
                  onChange={(event) =>
                    setCommentDrafts((current) => ({
                      ...current,
                      [post.id]: event.target.value,
                    }))
                  }
                  placeholder="写评论..."
                  className="min-w-0 flex-1 rounded-full py-2 text-xs"
                />
                <Button
                  disabled={
                    !(commentDrafts[post.id] ?? "").trim() ||
                    commentMutation.isPending
                  }
                  onClick={() => commentMutation.mutate(post.id)}
                  variant="primary"
                  size="sm"
                >
                  {pendingCommentPostId === post.id ? "发送中..." : "发送"}
                </Button>
              </>
            }
          />
        ))}

        {likeMutation.isError && likeMutation.error instanceof Error ? (
          <ErrorBlock message={likeMutation.error.message} />
        ) : null}
        {commentMutation.isError && commentMutation.error instanceof Error ? (
          <ErrorBlock message={commentMutation.error.message} />
        ) : null}

        {!feedQuery.isLoading && !feedQuery.isError && !visiblePosts.length ? (
          <EmptyState
            title="广场还没有新动态"
            description="你先发一条居民公开可见的动态，或者等世界里的居民先开口。"
          />
        ) : null}
      </AppSection>
    </AppPage>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white/88 p-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
