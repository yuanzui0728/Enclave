import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addFeedComment, createFeedPost, getFeed, likeFeedPost, sendFriendRequest, shake, triggerSceneFriendRequest } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextAreaField, TextField } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { SocialPostCard } from "../components/social-post-card";
import { useSessionStore } from "../store/session-store";

const scenes = [
  { id: "coffee_shop", label: "咖啡馆" },
  { id: "gym", label: "健身房" },
  { id: "library", label: "图书馆" },
  { id: "park", label: "公园" },
];

export function DiscoverPage() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);
  const username = useSessionStore((state) => state.username);
  const avatar = useSessionStore((state) => state.avatar);
  const [text, setText] = useState("");
  const [shakeMessage, setShakeMessage] = useState<string>("");
  const [sceneMessage, setSceneMessage] = useState<string>("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [successNotice, setSuccessNotice] = useState("");

  const feedQuery = useQuery({
    queryKey: ["app-feed"],
    queryFn: () => getFeed(1, 20),
  });

  const createPostMutation = useMutation({
    mutationFn: () =>
      createFeedPost({
        authorId: userId!,
        authorName: username ?? "我",
        authorAvatar: avatar,
        text: text.trim(),
      }),
    onSuccess: async () => {
      setText("");
      setSuccessNotice("发现页动态已发布。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed"] });
    },
  });

  const shakeMutation = useMutation({
    mutationFn: async () => {
      const result = await shake({ userId: userId! });
      if (!result) {
        return null;
      }
      await sendFriendRequest(
        {
          userId: userId!,
          characterId: result.character.id,
          greeting: result.greeting,
        },
      );
      return result;
    },
    onSuccess: (result) => {
      if (!result) {
        setShakeMessage("附近暂时没有新的相遇。");
        return;
      }

      setSuccessNotice("新的好友申请已发送。");
      setShakeMessage(`${result.character.name} 向你发来了好友申请：${result.greeting}`);
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", userId] });
    },
  });

  const sceneMutation = useMutation({
    mutationFn: async (scene: string) => {
      const result = await triggerSceneFriendRequest({
        userId: userId!,
        scene,
      });
      return { request: result, scene };
    },
    onSuccess: ({ request, scene }) => {
      const sceneLabel = scenes.find((item) => item.id === scene)?.label ?? scene;

      if (!request) {
        setSceneMessage(`${sceneLabel} 里暂时没有新的相遇。`);
        return;
      }

      setSuccessNotice("场景相遇已写入好友申请列表。");
      setSceneMessage(
        `${request.characterName} 在${sceneLabel}里注意到了你：${request.greeting ?? "对你产生了兴趣。"}`
      );
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", userId] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => likeFeedPost(postId, { userId: userId! }),
    onSuccess: async () => {
      setSuccessNotice("发现页互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed"] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (postId: string) =>
      addFeedComment(postId, {
        authorId: userId!,
        authorName: username ?? "我",
        authorAvatar: avatar,
        text: commentDrafts[postId].trim(),
      }),
    onSuccess: async (_, postId) => {
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setSuccessNotice("发现页互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-feed"] });
    },
  });
  const pendingLikePostId = likeMutation.isPending ? likeMutation.variables : null;
  const pendingCommentPostId = commentMutation.isPending ? commentMutation.variables : null;

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  return (
    <AppPage>
      <AppHeader eyebrow="发现" title="试着摇一摇" description="这个世界不会把所有人直接摆在你面前，相遇需要一点偶然。" />
      <AppSection className="bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(249,115,22,0.14))]">
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={() => shakeMutation.mutate()}
            disabled={shakeMutation.isPending}
            variant="primary"
          >
            {shakeMutation.isPending ? "正在寻找..." : "摇一摇"}
          </Button>
          <div className="text-xs text-[color:var(--text-muted)]">随机相遇会从不同场景里发生。</div>
        </div>
        {shakeMessage ? <InlineNotice className="mt-3" tone="success">{shakeMessage}</InlineNotice> : null}
        {shakeMutation.isError && shakeMutation.error instanceof Error ? <ErrorBlock className="mt-3" message={shakeMutation.error.message} /> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {scenes.map((scene) => (
            <Button
              key={scene.id}
              onClick={() => sceneMutation.mutate(scene.id)}
              disabled={sceneMutation.isPending}
              variant="secondary"
              size="sm"
            >
              {sceneMutation.isPending && sceneMutation.variables === scene.id ? `正在前往${scene.label}...` : scene.label}
            </Button>
          ))}
        </div>
        {sceneMessage ? <InlineNotice className="mt-3" tone="info">{sceneMessage}</InlineNotice> : null}
        {sceneMutation.isError && sceneMutation.error instanceof Error ? <ErrorBlock className="mt-3" message={sceneMutation.error.message} /> : null}
      </AppSection>

      <AppSection>
        <div className="text-sm font-medium text-white">发一条发现页动态</div>
        <TextAreaField
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="分享你的想法..."
          className="mt-3 min-h-28 resize-none"
        />
        <Button
          disabled={!text.trim() || createPostMutation.isPending}
          onClick={() => createPostMutation.mutate()}
          variant="primary"
          className="mt-3"
        >
          {createPostMutation.isPending ? "正在发布..." : "发布"}
        </Button>
        {createPostMutation.isError && createPostMutation.error instanceof Error ? <ErrorBlock className="mt-3" message={createPostMutation.error.message} /> : null}
      </AppSection>

      <section className="space-y-3">
        {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
        {feedQuery.isLoading ? <LoadingBlock label="正在读取发现页动态..." /> : null}

        {feedQuery.isError && feedQuery.error instanceof Error ? <ErrorBlock message={feedQuery.error.message} /> : null}

        {(feedQuery.data?.posts ?? []).map((post) => (
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

        {!feedQuery.isLoading && !feedQuery.isError && !(feedQuery.data?.posts.length ?? 0) ? (
          <EmptyState title="发现页还没有新动态" description="你先发一条，或者再摇一摇看看会遇到谁。" />
        ) : null}
      </section>
    </AppPage>
  );
}
