import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Copy, PenSquare, Share2 } from "lucide-react";
import {
  addMomentComment,
  createUserMoment,
  getBlockedCharacters,
  getMoments,
  toggleMomentLike,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
} from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { MobileSocialComposerCard } from "../components/mobile-social-composer-card";
import { SocialPostCard } from "../components/social-post-card";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { DesktopMomentsWorkspace } from "../features/desktop/moments/desktop-moments-workspace";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const MOMENTS_COMPOSER_SECTION_ID = "moments-composer-card";
const MOMENTS_COMPOSER_TEXTAREA_ID = "moments-composer-input";

export function MomentsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerUsername = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const [text, setText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [showCompose, setShowCompose] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const routeSelectedMomentId = parseMomentsRouteHash(hash);

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
      setNoticeTone("success");
      setNotice("朋友圈已发布，仅好友可见。");
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNotice("朋友圈互动已更新。");
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
      setNoticeTone("success");
      setNotice("朋友圈互动已更新。");
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

  function focusComposer() {
    if (typeof document === "undefined") {
      return;
    }

    document
      .getElementById(MOMENTS_COMPOSER_SECTION_ID)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });

    window.requestAnimationFrame(() => {
      const textarea = document.getElementById(MOMENTS_COMPOSER_TEXTAREA_ID);
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
      }
    });
  }

  useEffect(() => {
    if (
      isDesktopLayout ||
      !routeSelectedMomentId ||
      typeof document === "undefined"
    ) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(`moment-post-${routeSelectedMomentId}`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    });
  }, [isDesktopLayout, routeSelectedMomentId, visibleMoments.length]);

  async function handleShareMoment(moment: (typeof visibleMoments)[number]) {
    const shareHash = buildMomentsRouteHash(moment.id);
    const sharePath = `${pathname}${shareHash ? `#${shareHash}` : ""}`;
    const shareUrl =
      typeof window === "undefined"
        ? sharePath
        : `${window.location.origin}${sharePath}`;
    const summaryText = `${moment.authorName}：${moment.text}${
      moment.location ? `\n位置：${moment.location}` : ""
    }\n${shareUrl}`;

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${moment.authorName} 的朋友圈`,
        text: `${moment.authorName}：${moment.text}${
          moment.location ? `\n位置：${moment.location}` : ""
        }`,
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
          : "当前环境暂不支持复制动态摘要。",
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(summaryText);
      setNoticeTone("success");
      setNotice(
        nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制动态摘要。"
          : "动态摘要已复制。",
      );
    } catch {
      setNoticeTone("info");
      setNotice(
        nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制动态摘要失败，请稍后重试。",
      );
    }
  }

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
        routeSelectedMomentId={routeSelectedMomentId}
        showCompose={showCompose}
        successNotice={notice}
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
                to: `/tabs/moments${buildMomentsRouteHash(moment.id) ? `#${buildMomentsRouteHash(moment.id)}` : ""}`,
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
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      {isDiscoverSubPage ? (
        <TabPageTopBar
          title="朋友圈"
          subtitle="仅好友可见"
          titleAlign="center"
          className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
          leftActions={
            <Button
              onClick={() =>
                navigateBackOrFallback(() => {
                  void navigate({ to: "/tabs/discover" });
                })
              }
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            >
              <ArrowLeft size={17} />
            </Button>
          }
          rightActions={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
              onClick={focusComposer}
              aria-label="发一条朋友圈"
            >
              <PenSquare size={17} />
            </Button>
          }
        />
      ) : (
        <TabPageTopBar
          title="朋友圈"
          subtitle="仅好友可见"
          className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
          rightActions={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
              onClick={focusComposer}
              aria-label="发一条朋友圈"
            >
              <PenSquare size={17} />
            </Button>
          }
        />
      )}

      <div className="space-y-2.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
        <MobileSocialComposerCard
          sectionId={MOMENTS_COMPOSER_SECTION_ID}
          textareaId={MOMENTS_COMPOSER_TEXTAREA_ID}
          title="发一条朋友圈"
          description="只让好友看到这一刻，比公开动态更近一点，也更像日常分享。"
          scopeLabel="好友可见"
          scopeClassName="bg-[rgba(47,122,63,0.12)] text-[#2f7a3f]"
          value={text}
          onChange={setText}
          placeholder="写点只想留给好友看的内容..."
          helperText="发出后仅好友可见，适合留住更私密一点的生活片段。"
          submitLabel="发布"
          submittingLabel="正在发布..."
          pending={createMutation.isPending}
          disabled={!text.trim() || createMutation.isPending}
          errorMessage={
            createMutation.isError && createMutation.error instanceof Error
              ? createMutation.error.message
              : null
          }
          onSubmit={() => createMutation.mutate()}
        />

        <section className="space-y-2.5">
          <div className="px-1">
            <div className="text-[12px] text-[color:var(--text-muted)]">最近动态</div>
            <div className="mt-0.5 text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
              这里只展示你和好友之间的朋友圈内容，互动也留在熟人范围里。
            </div>
          </div>
          {notice ? (
            <InlineNotice className="text-[12px] leading-5" tone={noticeTone}>
              {notice}
            </InlineNotice>
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
                cardId={`moment-post-${moment.id}`}
                key={moment.id}
                authorName={moment.authorName}
                authorAvatar={moment.authorAvatar}
                meta={formatTimestamp(moment.postedAt)}
                headerActions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-[color:var(--text-muted)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
                    onClick={() => void handleShareMoment(moment)}
                    aria-label={nativeMobileShareSupported ? "分享这条朋友圈" : "复制这条动态摘要"}
                  >
                    {nativeMobileShareSupported ? (
                      <Share2 size={15} />
                    ) : (
                      <Copy size={15} />
                    )}
                  </Button>
                }
                body={
                  <>
                    {moment.authorType === "user" ? (
                      <div className="mb-2 inline-flex rounded-full bg-[rgba(47,122,63,0.12)] px-2 py-0.5 text-[10px] font-medium text-[#2f7a3f]">
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
                    <div className="space-y-1.5 rounded-[14px] bg-[color:var(--surface-soft)] p-2.5">
                      {moment.comments.slice(-3).map((comment) => (
                        <div
                          key={comment.id}
                          className="text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]"
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
                      className="min-w-0 flex-1 rounded-full py-1.5 text-[12px]"
                    />
                    <Button
                      disabled={
                        !(commentDrafts[moment.id] ?? "").trim() ||
                        commentMutation.isPending
                      }
                      onClick={() => commentMutation.mutate(moment.id)}
                      variant="primary"
                      size="sm"
                      className="h-8 px-3 text-[12px]"
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
        </section>
      </div>
    </AppPage>
  );
}

function parseMomentsRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  return params.get("moment")?.trim() || null;
}

function buildMomentsRouteHash(momentId?: string | null) {
  if (!momentId) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("moment", momentId);
  return params.toString();
}
