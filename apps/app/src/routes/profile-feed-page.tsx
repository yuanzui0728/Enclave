import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  deleteFeedPost,
  getOwnFeed,
  isApiRequestError,
  listFeedComments,
  type FeedComment,
  type FeedPostListItem,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { MomentMediaGallery } from "../components/moment-media-gallery";
import { SocialPostCard } from "../components/social-post-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  getFeedSummaryText,
  resolveFeedMomentContentType,
} from "../features/feed/feed-media";
import { stripToolCallSyntax } from "../features/moments/moment-content";
import { translateAppErrorCode } from "../lib/error-translate";
import { formatTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

// 「我的广场动态」聚合 + 管理页。照 profile-moments-page（我的朋友圈）那套补齐——
// 之前广场只有混合公共流（discover-feed-page），用户发完既无法集中查看也无法删除
// 自己的广场内容，跟朋友圈侧能力不对称。这里只读自己发的广场帖（GET /feed?mine=true，
// 仅 surface='feed'，不含视频号），每条可删（DELETE /feed/:id，后端校验仅本人可删）。
const FEED_MINE_QUERY_KEY = "app-feed-mine";
// discover-feed-page 的无限分页 queryKey；删成功后一并 invalidate，让主广场流同步消失。
const FEED_PAGED_QUERY_KEY = "app-feed-paged";

type FeedNotice = {
  tone: "success" | "info" | "danger";
  message: string;
  actionLabel?: string | null;
  action?: (() => void) | null;
};

export function ProfileFeedPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const [notice, setNotice] = useState<FeedNotice | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // 同帧双击 / notice 重试与卡片按钮重复触发同一条删除时去重。
  const deleteInflightRef = useRef<Record<string, boolean>>({});
  // mid-flight 切账户防卫：mutation 起飞时记下当时 baseUrl，回包时和最新 baseUrl
  // 比对——账户已切走就不要把上一个账户的成功/失败 notice 弹到新账户界面。
  const mutationBaseUrlRef = useRef(baseUrl);
  useEffect(() => {
    mutationBaseUrlRef.current = baseUrl;
  }, [baseUrl]);

  const feedQuery = useQuery({
    queryKey: [FEED_MINE_QUERY_KEY, baseUrl],
    queryFn: () => getOwnFeed(baseUrl),
  });
  // useMemo 固定引用：feedQuery.data 为空时 `?? []` 每次 render 都 new 一个新数组，
  // 会让下面 processedComments 的 useMemo 依赖每帧变化、白白重算。
  const feedData = feedQuery.data;
  const ownPosts = useMemo(() => feedData ?? [], [feedData]);

  // 「查看全部评论」展开后按 postId 缓存 listFeedComments 全量结果；未展开用
  // 后端给的 commentsPreview（最后 3 条）。
  const [fullCommentsByPostId, setFullCommentsByPostId] = useState<
    Record<string, FeedComment[]>
  >({});
  const [expandingPostId, setExpandingPostId] = useState<string | null>(null);
  const expandInflightRef = useRef<Record<string, boolean>>({});

  // 清洗评论：gpt-4.1 等非推理模型会把整段 CoT prose 当评论存进来、历史还有
  // text="" 的鬼影评论；stripToolCallSyntax 后为空的一律过掉，避免渲出「作者：」
  // 这种只剩冒号的空行（和 discover-feed-page processedCommentsByPostId 同款）。
  const processedComments = useMemo(() => {
    const map = new Map<
      string,
      Array<{ comment: FeedComment; cleanText: string }>
    >();
    for (const post of ownPosts) {
      const source = fullCommentsByPostId[post.id] ?? post.commentsPreview ?? [];
      const cleaned = source
        .map((comment) => ({
          comment,
          cleanText: stripToolCallSyntax(comment.text ?? ""),
        }))
        .filter((entry) => entry.cleanText.trim().length > 0);
      map.set(post.id, cleaned);
    }
    return map;
  }, [ownPosts, fullCommentsByPostId]);

  const handleExpandComments = async (postId: string) => {
    if (fullCommentsByPostId[postId] || expandInflightRef.current[postId]) {
      return;
    }
    expandInflightRef.current[postId] = true;
    setExpandingPostId(postId);
    const reqBaseUrl = baseUrl;
    try {
      const all = await listFeedComments(postId, baseUrl);
      // mid-flight 切账户防卫：别把 A 账户的评论塞进 B 账户的 state。
      if (reqBaseUrl !== mutationBaseUrlRef.current) return;
      setFullCommentsByPostId((current) => ({ ...current, [postId]: all }));
    } catch (error) {
      if (reqBaseUrl !== mutationBaseUrlRef.current) return;
      setNotice({
        tone: "danger",
        message:
          (isApiRequestError(error) ? translateAppErrorCode(error) : null) ??
          describeRequestError(error, t(msg`评论加载失败，请稍后重试。`)),
      });
    } finally {
      delete expandInflightRef.current[postId];
      setExpandingPostId((current) => (current === postId ? null : current));
    }
  };

  // notice 2.4s 自清，和朋友圈/我-tab 各页通道一致。
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 切账户：清掉残留 notice / 待确认删除 / 已展开评论，避免把 A 账户的状态带到 B。
  useEffect(() => {
    setNotice(null);
    setPendingDeleteId(null);
    setFullCommentsByPostId({});
    setExpandingPostId(null);
  }, [baseUrl]);

  // 删除确认弹层：Esc 关闭，和点遮罩取消对齐。
  useEffect(() => {
    if (!pendingDeleteId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingDeleteId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDeleteId]);

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => deleteFeedPost(postId, baseUrl),
    onMutate: async (postId: string) => {
      await queryClient.cancelQueries({
        queryKey: [FEED_MINE_QUERY_KEY, baseUrl],
      });
      const snapshots = queryClient.getQueriesData<FeedPostListItem[]>({
        queryKey: [FEED_MINE_QUERY_KEY, baseUrl],
      });
      // 乐观删除：先从 cache 抹掉，列表立刻少一条。
      snapshots.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<FeedPostListItem[]>(
          key,
          data.filter((post) => post.id !== postId),
        );
      });
      return { snapshots, mutationBaseUrl: baseUrl };
    },
    onError: (error, postId, context) => {
      if (context && context.mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      // 回滚 cache。
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      const localized =
        (isApiRequestError(error) ? translateAppErrorCode(error) : null) ??
        describeRequestError(error, t(msg`删除失败，请稍后重试。`));
      setNotice({
        tone: "danger",
        message: localized,
        actionLabel: t(msg`重试删除`),
        action: () => {
          if (deleteInflightRef.current[postId]) return;
          deleteInflightRef.current[postId] = true;
          deleteMutation.mutate(postId, {
            onSettled: () => {
              delete deleteInflightRef.current[postId];
            },
          });
        },
      });
    },
    onSuccess: (_data, _postId, context) => {
      const mutationBaseUrl = context?.mutationBaseUrl ?? baseUrl;
      void queryClient.invalidateQueries({
        queryKey: [FEED_MINE_QUERY_KEY, mutationBaseUrl],
      });
      // 主广场流（discover-feed-page）也同步把这条移除。
      void queryClient.invalidateQueries({
        queryKey: [FEED_PAGED_QUERY_KEY, mutationBaseUrl],
      });
      if (mutationBaseUrl !== mutationBaseUrlRef.current) {
        return;
      }
      setNotice({
        tone: "success",
        message: t(msg`已删除这条广场动态。`),
      });
    },
  });

  const runDelete = (postId: string) => {
    setPendingDeleteId(null);
    if (deleteInflightRef.current[postId]) return;
    deleteInflightRef.current[postId] = true;
    deleteMutation.mutate(postId, {
      onSettled: () => {
        delete deleteInflightRef.current[postId];
      },
    });
  };

  const goBack = () =>
    navigateBackOrFallback(
      () => navigate({ to: "/tabs/profile", replace: true }),
      "/tabs/profile",
    );

  const renderContent = () => {
    if (feedQuery.isLoading) {
      return <LoadingBlock />;
    }
    if (feedQuery.isError) {
      return (
        <ErrorBlock
          message={
            (isApiRequestError(feedQuery.error)
              ? translateAppErrorCode(feedQuery.error)
              : null) ??
            describeRequestError(
              feedQuery.error,
              t(msg`广场动态加载失败，请稍后重试。`),
            )
          }
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void feedQuery.refetch()}
          >
            {t(msg`重试`)}
          </Button>
        </ErrorBlock>
      );
    }
    if (ownPosts.length === 0) {
      return (
        <EmptyState
          title={t(msg`还没有发布广场动态`)}
          description={t(msg`你在广场发布的动态会出现在这里，可随时删除管理。`)}
        />
      );
    }

    return (
      <div className="space-y-3">
        {ownPosts.map((post) => {
          const displayText = stripToolCallSyntax(post.text ?? "").trim();
          const summaryText = displayText ? "" : getFeedSummaryText(post);
          return (
            <SocialPostCard
              key={post.id}
              cardId={`profile-feed-post-${post.id}`}
              authorName={post.authorName}
              authorAvatar={post.authorAvatar}
              meta={formatTimestamp(post.createdAt)}
              headerActions={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-[color:var(--text-muted)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--state-danger-text)]"
                  onClick={() => setPendingDeleteId(post.id)}
                  aria-label={t(msg`删除这条广场动态`)}
                >
                  <Trash2 size={15} />
                </Button>
              }
              body={
                <div className="space-y-3">
                  {displayText ? (
                    <div className="whitespace-pre-wrap break-words">
                      {displayText}
                    </div>
                  ) : null}
                  {post.media.length > 0 ? (
                    <MomentMediaGallery
                      contentType={resolveFeedMomentContentType(post.media)}
                      media={post.media}
                      variant="mobile"
                    />
                  ) : null}
                </div>
              }
              summary={(() => {
                const parts: string[] = [];
                if (post.likeCount > 0) {
                  parts.push(t(msg`${post.likeCount} 赞`));
                }
                if (post.commentCount > 0) {
                  parts.push(t(msg`${post.commentCount} 评论`));
                }
                if (parts.length > 0) {
                  return parts.join(" · ");
                }
                return summaryText || undefined;
              })()}
              secondary={(() => {
                const rendered = processedComments.get(post.id) ?? [];
                const expanded = Boolean(fullCommentsByPostId[post.id]);
                const showExpand =
                  !expanded && post.commentCount > rendered.length;
                if (rendered.length === 0 && !showExpand) {
                  return null;
                }
                return (
                  <div className="overflow-hidden rounded-[8px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]">
                    <div className="space-y-1 px-3 py-2 text-[12px] leading-[20px]">
                      {rendered.map(({ comment, cleanText }) => {
                        const replyToName = comment.replyToAuthorName ?? null;
                        return (
                          <div
                            key={comment.id}
                            className="break-words text-[color:var(--text-primary)]"
                          >
                            <span className="text-[#576B95]">
                              {comment.authorName}
                            </span>
                            {replyToName ? (
                              <>
                                <span> {t(msg`回复`)} </span>
                                <span className="text-[#576B95]">
                                  {replyToName}
                                </span>
                              </>
                            ) : null}
                            <span>：{cleanText}</span>
                          </div>
                        );
                      })}
                      {showExpand ? (
                        <button
                          type="button"
                          onClick={() => void handleExpandComments(post.id)}
                          disabled={expandingPostId === post.id}
                          className="text-[12px] text-[#576B95] disabled:opacity-60"
                        >
                          {expandingPostId === post.id
                            ? t(msg`加载中…`)
                            : t(msg`查看全部 ${post.commentCount} 条评论`)}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })()}
            />
          );
        })}
      </div>
    );
  };

  return (
    <AppPage className="relative space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`我的广场动态`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 pb-1.5 pt-1.5 shadow-none"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
      />

      {notice ? (
        <div className="px-4 pt-3">
          <InlineNotice
            tone={notice.tone}
            role={notice.tone === "danger" ? "alert" : "status"}
            className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-[12px] shadow-none"
          >
            <span>{notice.message}</span>
            {notice.actionLabel && notice.action ? (
              <button
                type="button"
                onClick={notice.action}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                {notice.actionLabel}
              </button>
            ) : null}
          </InlineNotice>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {renderContent()}
      </div>

      {pendingDeleteId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8 sm:items-center"
          role="presentation"
          onClick={() => setPendingDeleteId(null)}
        >
          <div
            className="w-full max-w-sm rounded-[16px] bg-[color:var(--bg-canvas-elevated)] p-5 shadow-lg"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              {t(msg`删除这条广场动态？`)}
            </div>
            <p className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
              {t(msg`删除后将一并移除它的评论与互动记录，且无法恢复。`)}
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setPendingDeleteId(null)}
              >
                {t(msg`取消`)}
              </Button>
              <Button
                type="button"
                className="flex-1 bg-[color:var(--state-danger-text)] text-white hover:opacity-90"
                onClick={() => runDelete(pendingDeleteId)}
              >
                {t(msg`删除`)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}
