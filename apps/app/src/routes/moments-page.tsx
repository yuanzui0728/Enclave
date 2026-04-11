import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  addMomentComment,
  createUserMoment,
  getBlockedCharacters,
  getMoments,
  toggleMomentLike,
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
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { DesktopMomentsWorkspace } from "../features/desktop/moments/desktop-moments-workspace";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function MomentsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerUsername = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [text, setText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [showCompose, setShowCompose] = useState(false);
  const [successNotice, setSuccessNotice] = useState("");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);

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
      createUserMoment(
        {
          text: text.trim(),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setText("");
      setShowCompose(false);
      setSuccessNotice("朋友圈已发布，仅好友可见。");
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (momentId: string) => {
      const text = commentDrafts[momentId]?.trim();
      if (!text) {
        throw new Error("请先输入评论内容。");
      }

      return addMomentComment(
        momentId,
        {
          text,
        },
        baseUrl,
      );
    },
    onSuccess: async (_, momentId) => {
      setCommentDrafts((current) => ({ ...current, [momentId]: "" }));
      setSuccessNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });
  const pendingLikeMomentId = likeMutation.isPending
    ? likeMutation.variables
    : null;
  const pendingCommentMomentId = commentMutation.isPending
    ? commentMutation.variables
    : null;
  const blockedCharacterIds = new Set(
    (blockedQuery.data ?? []).map((item) => item.characterId),
  );
  const visibleMoments = (momentsQuery.data ?? []).filter(
    (moment) =>
      moment.authorType !== "character" ||
      !blockedCharacterIds.has(moment.authorId),
  );
  const isDiscoverSubPage = pathname === "/discover/moments";

  useEffect(() => {
    setText("");
    setCommentDrafts({});
    setShowCompose(false);
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

  if (isDesktopLayout) {
    const errors: string[] = [];

    if (momentsQuery.isError && momentsQuery.error instanceof Error) {
      errors.push(momentsQuery.error.message);
    }

    if (blockedQuery.isError && blockedQuery.error instanceof Error) {
      errors.push(blockedQuery.error.message);
    }

    return (
      <DesktopMomentsWorkspace
        commentDrafts={commentDrafts}
        commentErrorMessage={
          commentMutation.isError && commentMutation.error instanceof Error
            ? commentMutation.error.message
            : null
        }
        commentPendingMomentId={pendingCommentMomentId}
        composeErrorMessage={
          createMutation.isError && createMutation.error instanceof Error
            ? createMutation.error.message
            : null
        }
        createPending={createMutation.isPending}
        errors={errors}
        isLoading={momentsQuery.isLoading}
        likeErrorMessage={
          likeMutation.isError && likeMutation.error instanceof Error
            ? likeMutation.error.message
            : null
        }
        likePendingMomentId={pendingLikeMomentId}
        moments={visibleMoments}
        ownerAvatar={ownerAvatar}
        ownerId={ownerId}
        ownerUsername={ownerUsername}
        showCompose={showCompose}
        successNotice={successNotice}
        text={text}
        isMomentFavorite={(momentId) =>
          favoriteSourceIds.includes(`moment-${momentId}`)
        }
        setShowCompose={setShowCompose}
        onCommentChange={(momentId, value) =>
          setCommentDrafts((current) => ({
            ...current,
            [momentId]: value,
          }))
        }
        onCommentSubmit={(momentId) => commentMutation.mutate(momentId)}
        onCreate={() => createMutation.mutate()}
        onLike={(momentId) => likeMutation.mutate(momentId)}
        onToggleFavorite={(momentId) => {
          const moment = visibleMoments.find((item) => item.id === momentId);
          if (!moment) {
            return;
          }

          const sourceId = `moment-${moment.id}`;
          const collected = favoriteSourceIds.includes(sourceId);
          const nextFavorites = collected
            ? removeDesktopFavorite(sourceId)
            : upsertDesktopFavorite({
                id: `favorite-${sourceId}`,
                sourceId,
                category: "moments",
                title: moment.authorName,
                description: moment.text,
                meta: `朋友圈 · ${formatTimestamp(moment.postedAt)}`,
                to: "/tabs/moments",
                badge: "朋友圈",
                avatarName: moment.authorName,
                avatarSrc: moment.authorAvatar,
              });

          setFavoriteSourceIds(
            nextFavorites.map((favorite) => favorite.sourceId),
          );
        }}
        onRefresh={() => {
          void momentsQuery.refetch();
          if (ownerId) {
            void blockedQuery.refetch();
          }
        }}
        onTextChange={setText}
      />
    );
  }

  return (
    <AppPage>
      {isDiscoverSubPage ? (
        <TabPageTopBar
          title="朋友圈"
          subtitle="仅好友可见"
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
      ) : (
        <TabPageTopBar title="朋友圈" subtitle="仅好友可见" />
      )}
      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            发一条朋友圈
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            发到朋友圈，只有好友能看到这条内容，适合留住更近一点的生活片段。
          </div>
        </div>
        <TextAreaField
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="写点只想留给好友看的内容..."
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
        <InlineNotice tone="muted">仅好友可见。</InlineNotice>
      </AppSection>

      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            最近动态
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            这里只展示你和好友之间的朋友圈内容，评论和互动都留在熟人范围里。
          </div>
        </div>
        {successNotice ? (
          <InlineNotice tone="success">{successNotice}</InlineNotice>
        ) : null}
        {momentsQuery.isLoading ? (
          <LoadingBlock label="正在读取朋友圈..." />
        ) : null}

        {momentsQuery.isError && momentsQuery.error instanceof Error ? (
          <ErrorBlock message={momentsQuery.error.message} />
        ) : null}

        {visibleMoments.map((moment) => {
          const sourceId = `moment-${moment.id}`;
          const collected = favoriteSourceIds.includes(sourceId);

          return (
            <SocialPostCard
              key={moment.id}
              authorName={moment.authorName}
              authorAvatar={moment.authorAvatar}
              meta={formatTimestamp(moment.postedAt)}
              body={
                <>
                  {moment.authorType === "user" ? (
                    <div className="mb-3 inline-flex rounded-full bg-[rgba(47,122,63,0.12)] px-2.5 py-1 text-[11px] font-medium text-[#2f7a3f]">
                      好友可见
                    </div>
                  ) : null}
                  <div>{moment.text}</div>
                </>
              }
              summary={`${moment.likeCount} 赞 · ${moment.commentCount} 评论`}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={likeMutation.isPending}
                    onClick={() => likeMutation.mutate(moment.id)}
                    variant="secondary"
                    size="sm"
                  >
                    {pendingLikeMomentId === moment.id ? "处理中..." : "点赞"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const nextFavorites = collected
                        ? removeDesktopFavorite(sourceId)
                        : upsertDesktopFavorite({
                            id: `favorite-${sourceId}`,
                            sourceId,
                            category: "moments",
                            title: moment.authorName,
                            description: moment.text,
                            meta: `朋友圈 · ${formatTimestamp(moment.postedAt)}`,
                            to: "/tabs/moments",
                            badge: "朋友圈",
                            avatarName: moment.authorName,
                            avatarSrc: moment.authorAvatar,
                          });

                      setFavoriteSourceIds(
                        nextFavorites.map((favorite) => favorite.sourceId),
                      );
                    }}
                  >
                    {collected ? "取消收藏" : "收藏"}
                  </Button>
                </div>
              }
              secondary={
                moment.comments.length > 0 ? (
                  <div className="space-y-2 rounded-[22px] bg-[color:var(--surface-soft)] p-3">
                    {moment.comments.slice(-3).map((comment) => (
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
                    disabled={
                      !(commentDrafts[moment.id] ?? "").trim() ||
                      commentMutation.isPending
                    }
                    onClick={() => commentMutation.mutate(moment.id)}
                    variant="primary"
                    size="sm"
                  >
                    {pendingCommentMomentId === moment.id
                      ? "发送中..."
                      : "发送"}
                  </Button>
                </>
              }
            />
          );
        })}

        {likeMutation.isError && likeMutation.error instanceof Error ? (
          <ErrorBlock message={likeMutation.error.message} />
        ) : null}

        {commentMutation.isError && commentMutation.error instanceof Error ? (
          <ErrorBlock message={commentMutation.error.message} />
        ) : null}

        {!momentsQuery.isLoading &&
        !momentsQuery.isError &&
        !visibleMoments.length ? (
          <EmptyState
            title="朋友圈还很安静"
            description="你先发一条仅好友可见的动态，或者等好友们先开口。"
          />
        ) : null}
      </AppSection>
    </AppPage>
  );
}
