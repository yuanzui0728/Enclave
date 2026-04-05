import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMomentComment, createUserMoment, getMoments, toggleMomentLike } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextAreaField, TextField } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { SocialPostCard } from "../components/social-post-card";
import { formatTimestamp } from "../lib/format";
import { useSessionStore } from "../store/session-store";

export function MomentsPage() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);
  const username = useSessionStore((state) => state.username);
  const avatar = useSessionStore((state) => state.avatar);
  const [text, setText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [successNotice, setSuccessNotice] = useState("");

  const momentsQuery = useQuery({
    queryKey: ["app-moments"],
    queryFn: () => getMoments(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createUserMoment({
        userId: userId!,
        authorName: username ?? "我",
        authorAvatar: avatar,
        text: text.trim(),
      }),
    onSuccess: async () => {
      setText("");
      setSuccessNotice("朋友圈已发布。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments"] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (momentId: string) =>
      toggleMomentLike(momentId, {
        authorId: userId!,
        authorName: username ?? "我",
        authorAvatar: avatar,
      }),
    onSuccess: async () => {
      setSuccessNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments"] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (momentId: string) =>
      addMomentComment(momentId, {
        authorId: userId!,
        authorName: username ?? "我",
        authorAvatar: avatar,
        text: commentDrafts[momentId].trim(),
      }),
    onSuccess: async (_, momentId) => {
      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setSuccessNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments"] });
    },
  });
  const pendingLikeMomentId = likeMutation.isPending ? likeMutation.variables : null;
  const pendingCommentMomentId = commentMutation.isPending ? commentMutation.variables : null;

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  return (
    <AppPage>
      <AppHeader eyebrow="朋友圈" title="把这一刻留在世界里" description="更偏生活感的动态会留在这里，等待熟人和角色回应。" />
      <AppSection>
        <div className="text-sm font-medium text-white">发一条朋友圈</div>
        <TextAreaField
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="这一刻的想法..."
          className="mt-3 min-h-28 resize-none"
        />
        <Button
          disabled={!text.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          variant="primary"
          className="mt-3"
        >
          {createMutation.isPending ? "正在发布..." : "发布"}
        </Button>
        {createMutation.isError && createMutation.error instanceof Error ? <ErrorBlock className="mt-3" message={createMutation.error.message} /> : null}
      </AppSection>

      <section className="space-y-3">
        {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
        {momentsQuery.isLoading ? <LoadingBlock label="正在读取朋友圈..." /> : null}

        {momentsQuery.isError && momentsQuery.error instanceof Error ? <ErrorBlock message={momentsQuery.error.message} /> : null}

        {(momentsQuery.data ?? []).map((moment) => (
          <SocialPostCard
            key={moment.id}
            authorName={moment.authorName}
            authorAvatar={moment.authorAvatar}
            meta={formatTimestamp(moment.postedAt)}
            body={moment.text}
            summary={`${moment.likeCount} 赞 · ${moment.commentCount} 评论`}
            actions={
              <Button disabled={likeMutation.isPending} onClick={() => likeMutation.mutate(moment.id)} variant="secondary" size="sm">
                {pendingLikeMomentId === moment.id ? "处理中..." : "点赞"}
              </Button>
            }
            secondary={
              moment.comments.length > 0 ? (
                <div className="space-y-2 rounded-[22px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] p-3">
                  {moment.comments.slice(-3).map((comment) => (
                    <div key={comment.id} className="text-xs leading-6 text-[color:var(--text-secondary)]">
                      <span className="text-white">{comment.authorName}</span>
                      {`：${comment.text}`}
                    </div>
                  ))}
                </div>
              ) : null
            }
            composer={
              <>
                <TextField
                  value={commentDrafts[moment.id] ?? ""}
                  onChange={(event) =>
                    setCommentDrafts((current) => ({
                      ...current,
                      [moment.id]: event.target.value,
                    }))
                  }
                  placeholder="写评论..."
                  className="min-w-0 flex-1 rounded-full py-2 text-xs"
                />
                <Button
                  disabled={!(commentDrafts[moment.id] ?? "").trim() || commentMutation.isPending}
                  onClick={() => commentMutation.mutate(moment.id)}
                  variant="primary"
                  size="sm"
                >
                  {pendingCommentMomentId === moment.id ? "发送中..." : "发送"}
                </Button>
              </>
            }
          />
        ))}

        {likeMutation.isError && likeMutation.error instanceof Error ? <ErrorBlock message={likeMutation.error.message} /> : null}

        {commentMutation.isError && commentMutation.error instanceof Error ? <ErrorBlock message={commentMutation.error.message} /> : null}

        {!momentsQuery.isLoading && !momentsQuery.isError && !momentsQuery.data?.length ? (
          <EmptyState title="朋友圈还很安静" description="你先发一条，或者等世界里的其他人先开口。" />
        ) : null}
      </section>
    </AppPage>
  );
}
