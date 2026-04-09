import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { addMomentComment, createUserMoment, getBlockedCharacters, getMoments, toggleMomentLike } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextAreaField, TextField } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { SocialPostCard } from "../components/social-post-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function MomentsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const [text, setText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [successNotice, setSuccessNotice] = useState("");

  const momentsQuery = useQuery({
    queryKey: ["app-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createUserMoment({
        text: text.trim(),
      }, baseUrl),
    onSuccess: async () => {
      setText("");
      setSuccessNotice("朋友圈已发布。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (momentId: string) =>
      toggleMomentLike(momentId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (momentId: string) =>
      addMomentComment(momentId, {
        text: commentDrafts[momentId].trim(),
      }, baseUrl),
    onSuccess: async (_, momentId) => {
      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setSuccessNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
    },
  });
  const pendingLikeMomentId = likeMutation.isPending ? likeMutation.variables : null;
  const pendingCommentMomentId = commentMutation.isPending ? commentMutation.variables : null;
  const blockedCharacterIds = new Set((blockedQuery.data ?? []).map((item) => item.characterId));
  const visibleMoments = (momentsQuery.data ?? []).filter(
    (moment) => moment.authorType !== "character" || !blockedCharacterIds.has(moment.authorId),
  );
  const isDiscoverSubPage = pathname === "/discover/moments";

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
        <AppHeader eyebrow="朋友圈" title="把这一刻留在桌面视野里" description="发布入口固定在左侧，动态流在右侧保持连续滚动，更适合桌面端的阅读节奏。" />
        <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
          <AppSection className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">发一条朋友圈</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">桌面端把发布区单独留下，方便边看边写。</div>
            </div>
            <TextAreaField
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="这一刻的想法..."
              className="min-h-40 resize-none"
            />
            <Button
              disabled={!text.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              variant="primary"
            >
              {createMutation.isPending ? "正在发布..." : "发布"}
            </Button>
            {createMutation.isError && createMutation.error instanceof Error ? <ErrorBlock message={createMutation.error.message} /> : null}
            <InlineNotice tone="muted">朋友圈更偏生活感内容，桌面端会保留更宽的正文阅读区域。</InlineNotice>
          </AppSection>

          <AppSection className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">最近动态</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">正文优先，互动控件退到辅助位置，不抢阅读注意力。</div>
            </div>
            {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
            {momentsQuery.isLoading ? <LoadingBlock label="正在读取朋友圈..." /> : null}
            {momentsQuery.isError && momentsQuery.error instanceof Error ? <ErrorBlock message={momentsQuery.error.message} /> : null}
            {visibleMoments.map((moment) => (
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
                    <div className="space-y-2 rounded-[22px] bg-[color:var(--surface-soft)] p-3">
                      {moment.comments.slice(-3).map((comment) => (
                        <div key={comment.id} className="text-xs leading-6 text-[color:var(--text-secondary)]">
                          <span className="text-[color:var(--text-primary)]">{comment.authorName}</span>
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
            {!momentsQuery.isLoading && !momentsQuery.isError && !visibleMoments.length ? (
              <EmptyState title="朋友圈还很安静" description="你先发一条，或者等世界里的其他人先开口。" />
            ) : null}
          </AppSection>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage>
      {isDiscoverSubPage ? (
        <AppHeader
          eyebrow="发现"
          title="朋友圈"
          description="从发现里进入熟人动态，阅读和发布都留在这个独立页面里。"
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
      ) : (
        <TabPageTopBar title="朋友圈" />
      )}
      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">发一条朋友圈</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">这里更偏向熟人视角，适合留住细一点、慢一点的生活片段。</div>
        </div>
        <TextAreaField
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="这一刻的想法..."
          className="min-h-28 resize-none"
        />
        <Button
          disabled={!text.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          variant="primary"
        >
          {createMutation.isPending ? "正在发布..." : "发布"}
        </Button>
        {createMutation.isError && createMutation.error instanceof Error ? <ErrorBlock message={createMutation.error.message} /> : null}
      </AppSection>

      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">最近动态</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">生活流内容应该更轻一点，评论和互动只做辅助，不压过正文。</div>
        </div>
        {successNotice ? <InlineNotice tone="success">{successNotice}</InlineNotice> : null}
        {momentsQuery.isLoading ? <LoadingBlock label="正在读取朋友圈..." /> : null}

        {momentsQuery.isError && momentsQuery.error instanceof Error ? <ErrorBlock message={momentsQuery.error.message} /> : null}

        {visibleMoments.map((moment) => (
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
                <div className="space-y-2 rounded-[22px] bg-[color:var(--surface-soft)] p-3">
                  {moment.comments.slice(-3).map((comment) => (
                    <div key={comment.id} className="text-xs leading-6 text-[color:var(--text-secondary)]">
                      <span className="text-[color:var(--text-primary)]">{comment.authorName}</span>
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

        {!momentsQuery.isLoading && !momentsQuery.isError && !visibleMoments.length ? (
          <EmptyState title="朋友圈还很安静" description="你先发一条，或者等世界里的其他人先开口。" />
        ) : null}
      </AppSection>
    </AppPage>
  );
}
