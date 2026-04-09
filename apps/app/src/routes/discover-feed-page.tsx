import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { addFeedComment, createFeedPost, getBlockedCharacters, getFeed, likeFeedPost } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextAreaField, TextField } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { SocialPostCard } from "../components/social-post-card";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function DiscoverFeedPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const [text, setText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [successNotice, setSuccessNotice] = useState("");

  const feedQuery = useQuery({
    queryKey: ["app-feed", baseUrl],
    queryFn: () => getFeed(1, 20),
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
      setSuccessNotice("广场动态已发布。");
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

  const pendingLikePostId = likeMutation.isPending ? likeMutation.variables : null;
  const pendingCommentPostId = commentMutation.isPending ? commentMutation.variables : null;
  const blockedCharacterIds = new Set((blockedQuery.data ?? []).map((item) => item.characterId));
  const visiblePosts = (feedQuery.data?.posts ?? []).filter(
    (post) => post.authorType !== "character" || !blockedCharacterIds.has(post.authorId),
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

  return (
    <AppPage>
      <AppHeader
        eyebrow="发现"
        title="广场动态"
        description="这里是开放内容流，适合看更公共、更轻量的动态。"
        actions={
          <Button
            onClick={() => navigate({ to: "/tabs/discover" })}
            variant="ghost"
            size="icon"
            className="text-[color:var(--text-secondary)]"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">发一条广场动态</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">分享你的想法，等待角色或熟人的互动。</div>
        </div>
        <TextAreaField
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="分享你的想法..."
          className="min-h-28 resize-none"
        />
        <Button disabled={!text.trim() || createMutation.isPending} onClick={() => createMutation.mutate()} variant="primary">
          {createMutation.isPending ? "正在发布..." : "发布"}
        </Button>
        {createMutation.isError && createMutation.error instanceof Error ? <ErrorBlock message={createMutation.error.message} /> : null}
      </AppSection>

      <div className="space-y-4">
        {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
        {feedQuery.isLoading ? <LoadingBlock label="正在读取广场动态..." /> : null}
        {feedQuery.isError && feedQuery.error instanceof Error ? <ErrorBlock message={feedQuery.error.message} /> : null}

        {visiblePosts.map((post) => (
          <SocialPostCard
            key={post.id}
            authorName={post.authorName}
            authorAvatar={post.authorAvatar}
            meta={post.aiReacted ? "AI 已响应" : "等待 AI 互动"}
            body={post.text}
            summary={`${post.likeCount} 赞 · ${post.commentCount} 评论`}
            actions={
              <Button disabled={likeMutation.isPending} onClick={() => likeMutation.mutate(post.id)} variant="secondary" size="sm">
                {pendingLikePostId === post.id ? "处理中..." : "点赞"}
              </Button>
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
                  disabled={!(commentDrafts[post.id] ?? "").trim() || commentMutation.isPending}
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

        {likeMutation.isError && likeMutation.error instanceof Error ? <ErrorBlock message={likeMutation.error.message} /> : null}
        {commentMutation.isError && commentMutation.error instanceof Error ? <ErrorBlock message={commentMutation.error.message} /> : null}

        {!feedQuery.isLoading && !feedQuery.isError && !visiblePosts.length ? (
          <EmptyState title="广场还没有新动态" description="你先发一条，或者晚点再回来看看。" />
        ) : null}
      </div>
    </AppPage>
  );
}
