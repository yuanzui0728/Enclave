import {
  Suspense,
  lazy,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Copy, PenSquare, Share2 } from "lucide-react";
import {
  addMomentComment,
  getBlockedCharacters,
  getMoments,
  toggleMomentLike,
} from "@yinjie/contracts";
import { AppPage, Button, InlineNotice, TextField } from "@yinjie/ui";
import { MomentMediaGallery } from "../components/moment-media-gallery";
import { RouteRedirectState } from "../components/route-redirect-state";
import { SocialPostCard } from "../components/social-post-card";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import { buildDesktopFriendMomentsRouteHash } from "../features/moments/friend-moments-route-state";
import { buildMobileFriendMomentsRouteHash } from "../features/moments/mobile-friend-moments-route-state";
import { buildMobileMomentsPublishRouteHash } from "../features/moments/mobile-moments-publish-route-state";
import {
  buildDesktopMomentsRouteHash,
  parseDesktopMomentsRouteState,
} from "../features/moments/moments-route-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { consumeMomentPublishFlash } from "../features/moments/moment-publish-flash";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import { getMomentSummaryText } from "../features/moments/moment-content";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { normalizePathname } from "../lib/normalize-pathname";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const DesktopMomentsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/moments/desktop-moments-workspace");
  return { default: mod.DesktopMomentsWorkspace };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import("../features/chat/message-avatar-popover-shell");
  return { default: mod.DesktopMessageAvatarPopover };
});

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
  const normalizedPathname = normalizePathname(pathname);
  const composeDraft = useMomentComposeDraft();
  const resetComposeDraft = composeDraft.reset;
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [showCompose, setShowCompose] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const [noticeActionLabel, setNoticeActionLabel] = useState<string | null>(
    null,
  );
  const [noticeAction, setNoticeAction] = useState<(() => void) | null>(null);
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [desktopAvatarPopover, setDesktopAvatarPopover] = useState<{
    anchorElement: HTMLButtonElement;
    characterId: string;
    fallbackAvatar?: string | null;
    fallbackName: string;
    returnHash?: string;
  } | null>(null);
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const routeState = parseDesktopMomentsRouteState(hash);
  const routeSelectedAuthorId = routeState.authorId ?? null;
  const routeSelectedMomentId = routeState.momentId ?? null;
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildDesktopMomentsRouteHash({
        authorId: routeSelectedAuthorId ?? undefined,
        momentId: routeSelectedMomentId ?? undefined,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [
      routeSelectedAuthorId,
      routeSelectedMomentId,
      safeReturnHash,
      safeReturnPath,
    ],
  );

  useEffect(() => {
    setDesktopAvatarPopover(null);
  }, [hash, pathname]);

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
      publishMomentComposeDraft({
        text: composeDraft.text,
        imageDrafts: composeDraft.imageDrafts,
        videoDraft: composeDraft.videoDraft,
        baseUrl,
      }),
    onSuccess: async () => {
      composeDraft.reset();
      setShowCompose(false);
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice("朋友圈已发布。");
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onSuccess: async () => {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
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
      setNoticeActionLabel(null);
      setNoticeAction(null);
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
  const routeSelectedMoment = routeSelectedMomentId
    ? visibleMoments.find((moment) => moment.id === routeSelectedMomentId) ?? null
    : null;
  const routeSelectedAuthorMoment = routeSelectedAuthorId
    ? routeSelectedMoment?.authorId === routeSelectedAuthorId
      ? routeSelectedMoment
      : visibleMoments.find((moment) => moment.authorId === routeSelectedAuthorId) ??
        null
    : null;
  const syncedRouteSelectedAuthorId =
    routeSelectedAuthorId &&
    routeSelectedAuthorMoment?.authorType === "character"
      ? routeSelectedAuthorId
      : undefined;
  const isDiscoverSubPage = normalizedPathname === "/discover/moments";
  const desktopMomentsPath = "/tabs/moments";
  const isDesktopMomentsRoute =
    normalizedPathname === desktopMomentsPath ||
    normalizedPathname === "/moments" ||
    normalizedPathname === "/discover/moments";
  const interactionActionLabel = safeReturnPath ? "返回上一页" : "重试读取";
  const handleDesktopRouteStateChange = useEffectEvent(
    (state: { momentId?: string }) => {
      const nextHash = buildDesktopMomentsRouteHash(state);
      const currentNormalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

      if (currentNormalizedHash === (nextHash ?? "")) {
        return;
      }

      void navigate({
        to: desktopMomentsPath,
        hash: nextHash,
        replace: true,
      });
    },
  );

  function openMobileMomentsPublishPage() {
    void navigate({
      to: "/discover/moments/publish",
      hash: buildMobileMomentsPublishRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function openMobileFriendMoments(characterId: string) {
    void navigate({
      to: "/friend-moments/$characterId",
      params: { characterId },
      hash: buildMobileFriendMomentsRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function navigateToRouteStateReturn() {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void momentsQuery.refetch();
    void blockedQuery.refetch();
  }

  function handleRetryLoad() {
    void momentsQuery.refetch();
    void blockedQuery.refetch();
  }

  function handleEmptyStateAction() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    openMobileMomentsPublishPage();
  }

  useEffect(() => {
    resetComposeDraft();
    setCommentDrafts({});
    setShowCompose(false);
    const flashNotice = consumeMomentPublishFlash();
    if (flashNotice) {
      setNoticeTone("success");
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(flashNotice);
      return;
    }

    setNoticeActionLabel(null);
    setNoticeAction(null);
    setNotice("");
  }, [baseUrl, resetComposeDraft]);

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

    const timer = window.setTimeout(() => {
      setNotice("");
      setNoticeActionLabel(null);
      setNoticeAction(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const desktopPathMismatch = pathname !== desktopMomentsPath;

    if (
      !isDesktopLayout ||
      !isDesktopMomentsRoute ||
      syncedRouteSelectedAuthorId ||
      (!desktopPathMismatch && currentRouteHash === normalizedHash)
    ) {
      return;
    }

    void navigate({
      to: desktopMomentsPath,
      hash: currentRouteHash || undefined,
      replace: true,
    });
  }, [
    currentRouteHash,
    isDesktopLayout,
    isDesktopMomentsRoute,
    navigate,
    normalizedHash,
    pathname,
    syncedRouteSelectedAuthorId,
    desktopMomentsPath,
  ]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      !isDesktopMomentsRoute ||
      !syncedRouteSelectedAuthorId
    ) {
      return;
    }

    void navigate({
      to: "/desktop/friend-moments/$characterId",
      params: { characterId: syncedRouteSelectedAuthorId },
      hash: buildDesktopFriendMomentsRouteHash({
        momentId: routeSelectedMomentId ?? undefined,
        source: "moments",
        returnPath: desktopMomentsPath,
        returnHash: buildDesktopMomentsRouteHash({
          momentId: routeSelectedMomentId ?? undefined,
        }),
      }),
      replace: true,
    });
  }, [
    isDesktopLayout,
    isDesktopMomentsRoute,
    navigate,
    routeSelectedMomentId,
    syncedRouteSelectedAuthorId,
    desktopMomentsPath,
  ]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      !routeSelectedAuthorId ||
      syncedRouteSelectedAuthorId === routeSelectedAuthorId
    ) {
      return;
    }

    const nextHash = buildDesktopMomentsRouteHash({
      momentId: routeSelectedMomentId ?? undefined,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    });

    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    void navigate({
      to: pathname,
      hash: nextHash,
      replace: true,
    });
  }, [
    isDesktopLayout,
    navigate,
    normalizedHash,
    pathname,
    routeSelectedAuthorId,
    routeSelectedMomentId,
    safeReturnHash,
    safeReturnPath,
    syncedRouteSelectedAuthorId,
  ]);

  async function handleImageFilesSelected(files: FileList | null) {
    try {
      await composeDraft.addImageFiles(files);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : "图片选择失败，请稍后重试。",
      );
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    try {
      await composeDraft.replaceVideoFile(file);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : "视频选择失败，请稍后重试。",
      );
    }
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
    const summaryBody = getMomentSummaryText(moment);
    const shareHash = buildDesktopMomentsRouteHash({
      momentId: moment.id,
    });
    const sharePath = `${pathname}${shareHash ? `#${shareHash}` : ""}`;
    const shareUrl =
      typeof window === "undefined"
        ? sharePath
        : `${window.location.origin}${sharePath}`;
    const summaryText = `${moment.authorName}：${summaryBody}${
      moment.location ? `\n位置：${moment.location}` : ""
    }\n${shareUrl}`;

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${moment.authorName} 的朋友圈`,
        text: `${moment.authorName}：${summaryBody}${
          moment.location ? `\n位置：${moment.location}` : ""
        }`,
        url: shareUrl,
      });

      if (shared) {
        setNoticeTone("success");
        setNoticeActionLabel(null);
        setNoticeAction(null);
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
      setNoticeActionLabel(nativeMobileShareSupported ? "重试分享" : "重试复制");
      setNoticeAction(() => () => {
        void handleShareMoment(moment);
      });
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
      setNoticeActionLabel(null);
      setNoticeAction(null);
      setNotice(
        nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制动态摘要。"
          : "动态摘要已复制。",
      );
    } catch {
      setNoticeTone("info");
      setNoticeActionLabel(nativeMobileShareSupported ? "重试分享" : "重试复制");
      setNoticeAction(() => () => {
        void handleShareMoment(moment);
      });
      setNotice(
        nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制动态摘要失败，请稍后重试。",
      );
    }
  }

  if (isDesktopLayout) {
    if (syncedRouteSelectedAuthorId) {
      return (
        <RouteRedirectState
          title="正在打开好友朋友圈"
          description="正在切换到桌面好友朋友圈工作区，马上显示对应居民的动态。"
          loadingLabel="正在切换到桌面朋友圈..."
        />
      );
    }

    const errors: string[] = [];

    if (momentsQuery.isError && momentsQuery.error instanceof Error) {
      errors.push(momentsQuery.error.message);
    }

    if (blockedQuery.isError && blockedQuery.error instanceof Error) {
      errors.push(blockedQuery.error.message);
    }

    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在打开桌面朋友圈"
            description="正在载入桌面朋友圈工作区，马上显示动态和详情。"
            loadingLabel="载入桌面朋友圈..."
          />
        }
      >
        <DesktopMomentsWorkspace
          commentDrafts={commentDrafts}
          commentErrorMessage={
            commentMutation.isError && commentMutation.error instanceof Error
              ? commentMutation.error.message
              : null
          }
          commentPendingMomentId={pendingCommentMomentId}
          composeErrorMessage={
            composeDraft.mediaError ??
            (createMutation.isError && createMutation.error instanceof Error
              ? createMutation.error.message
              : null)
          }
          createPending={createMutation.isPending}
          errors={errors}
          imageDrafts={composeDraft.imageDrafts}
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
          text={composeDraft.text}
          videoDraft={composeDraft.videoDraft}
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
          onImageFilesSelected={(files) => {
            void handleImageFilesSelected(files);
          }}
          onLike={(momentId) => likeMutation.mutate(momentId)}
          onOpenAuthorPopover={({ anchorElement, moment }) => {
            if (moment.authorType !== "character") {
              return;
            }

            setDesktopAvatarPopover({
              anchorElement,
              characterId: moment.authorId,
              fallbackAvatar: moment.authorAvatar,
              fallbackName: moment.authorName,
              returnHash: buildDesktopMomentsRouteHash({
                authorId: routeSelectedAuthorId ?? undefined,
                momentId: moment.id,
                returnPath: safeReturnPath,
                returnHash: safeReturnHash,
              }),
            });
          }}
          onOpenAuthorMoments={({ authorId, momentId }) => {
            const targetMoment =
              (momentId
                ? visibleMoments.find((item) => item.id === momentId)
                : visibleMoments.find((item) => item.authorId === authorId)) ??
              null;

            if (targetMoment?.authorType !== "character") {
              void navigate({
                to: pathname,
                hash: buildDesktopMomentsRouteHash({
                  momentId: targetMoment?.id ?? momentId ?? undefined,
                  returnPath: safeReturnPath,
                  returnHash: safeReturnHash,
                }),
                replace: true,
              });
              return;
            }

            void navigate({
              to: "/desktop/friend-moments/$characterId",
              params: { characterId: targetMoment.authorId },
              hash: buildDesktopFriendMomentsRouteHash({
                momentId: targetMoment.id,
                source: "moments",
                returnPath: desktopMomentsPath,
                returnHash: buildDesktopMomentsRouteHash({
                  momentId: targetMoment.id,
                }),
              }),
            });
          }}
          onToggleFavorite={(momentId) => {
            const moment = visibleMoments.find((item) => item.id === momentId);
            if (!moment) {
              return;
            }

            const sourceId = `moment-${moment.id}`;
            const collected = favoriteSourceIds.includes(sourceId);
            const routeHash = buildDesktopMomentsRouteHash({
              momentId: moment.id,
            });
            const nextFavorites = collected
              ? removeDesktopFavorite(sourceId)
              : upsertDesktopFavorite({
                  id: `favorite-${sourceId}`,
                  sourceId,
                  category: "moments",
                  title: moment.authorName,
                  description: getMomentSummaryText(moment),
                  meta: `朋友圈 · ${formatTimestamp(moment.postedAt)}`,
                  to: `/tabs/moments${routeHash ? `#${routeHash}` : ""}`,
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
          onRouteStateChange={handleDesktopRouteStateChange}
          onTextChange={composeDraft.setText}
          onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
          onRemoveVideo={() => composeDraft.clearVideoDraft()}
          onVideoFileSelected={(file) => {
            void handleVideoFileSelected(file);
          }}
        />
        {desktopAvatarPopover ? (
          <Suspense fallback={null}>
            <DesktopMessageAvatarPopover
              anchorElement={desktopAvatarPopover.anchorElement}
              kind="character"
              characterId={desktopAvatarPopover.characterId}
              fallbackAvatar={desktopAvatarPopover.fallbackAvatar}
              fallbackName={desktopAvatarPopover.fallbackName}
              navigationContext={{
                momentsReturnHash: desktopAvatarPopover.returnHash,
                momentsReturnPath: pathname,
                profileReturnHash: desktopAvatarPopover.returnHash,
                profileReturnPath: pathname,
              }}
              onClose={() => setDesktopAvatarPopover(null)}
            />
          </Suspense>
        ) : null}
      </Suspense>
    );
  }

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      {isDiscoverSubPage ? (
        <TabPageTopBar
          title="朋友圈"
          subtitle="世界角色动态"
          titleAlign="center"
          className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
          leftActions={
            <Button
              onClick={() =>
                navigateBackOrFallback(() => {
                  if (safeReturnPath) {
                    void navigate({
                      to: safeReturnPath,
                      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
                    });
                    return;
                  }

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
              onClick={openMobileMomentsPublishPage}
              aria-label="发一条朋友圈"
            >
              <PenSquare size={17} />
            </Button>
          }
        />
      ) : (
        <TabPageTopBar
          title="朋友圈"
          subtitle="世界角色动态"
          className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
          rightActions={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
              onClick={openMobileMomentsPublishPage}
              aria-label="发一条朋友圈"
            >
              <PenSquare size={17} />
            </Button>
          }
        />
      )}

      <div className="space-y-2.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
        <section className="space-y-2">
          <div className="px-1">
            <div className="text-[11px] text-[color:var(--text-muted)]">
              最近动态
            </div>
            <div className="mt-0.5 text-[10px] leading-4 text-[color:var(--text-muted)]">
              这里会展示世界里的角色和你最近发布的朋友圈内容。
            </div>
          </div>
          {notice ? (
            <MobileMomentsInlineNotice
              tone={noticeTone}
              action={
                noticeTone === "info" ? (
                  <div className="flex items-center gap-1.5">
                    {noticeAction && noticeActionLabel ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[11px]"
                        onClick={noticeAction}
                      >
                        {noticeActionLabel}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[11px]"
                      onClick={handleStatusBack}
                    >
                      {interactionActionLabel}
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {notice}
            </MobileMomentsInlineNotice>
          ) : null}
          {momentsQuery.isLoading ? (
            <MobileMomentsStatusCard
              badge="读取中"
              title="正在刷新朋友圈"
              description="稍等一下，正在同步世界里的最新动态。"
              tone="loading"
            />
          ) : null}
          {momentsQuery.isError && momentsQuery.error instanceof Error ? (
            <MobileMomentsStatusCard
              badge="读取失败"
              title="朋友圈暂时不可用"
              description={momentsQuery.error.message}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleRetryLoad}
                  >
                    重试读取
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? "返回上一页" : "重试读取"}
                  </Button>
                </div>
              }
            />
          ) : null}

          {visibleMoments.map((moment) => {
            const sourceId = `moment-${moment.id}`;
            const collected = favoriteSourceIds.includes(sourceId);
            const routeHash = buildDesktopMomentsRouteHash({
              momentId: moment.id,
            });

            return (
              <SocialPostCard
                cardId={`moment-post-${moment.id}`}
                key={moment.id}
                authorName={moment.authorName}
                authorAvatar={moment.authorAvatar}
                authorActionAriaLabel={
                  moment.authorType === "character"
                    ? `查看 ${moment.authorName} 的朋友圈`
                    : undefined
                }
                meta={formatTimestamp(moment.postedAt)}
                onAuthorClick={
                  moment.authorType === "character"
                    ? () => openMobileFriendMoments(moment.authorId)
                    : undefined
                }
                headerActions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-[color:var(--text-muted)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
                    onClick={() => void handleShareMoment(moment)}
                    aria-label={
                      nativeMobileShareSupported
                        ? "分享这条朋友圈"
                        : "复制这条动态摘要"
                    }
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
                        我的动态
                      </div>
                    ) : null}
                    {moment.text.trim() ? <div>{moment.text}</div> : null}
                    {moment.media.length > 0 ? (
                      <div className={moment.text.trim() ? "mt-3" : ""}>
                        <MomentMediaGallery
                          contentType={moment.contentType}
                          media={moment.media}
                          variant="mobile"
                        />
                      </div>
                    ) : null}
                  </>
                }
                summary={`${moment.likeCount} 赞 · ${moment.commentCount} 评论`}
                actions={
                  <div className="flex flex-wrap gap-2">
                    {moment.authorType === "character" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openMobileFriendMoments(moment.authorId)}
                      >
                        Ta 的朋友圈
                      </Button>
                    ) : null}
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
                              description: getMomentSummaryText(moment),
                              meta: `朋友圈 · ${formatTimestamp(moment.postedAt)}`,
                              to: `/tabs/moments${routeHash ? `#${routeHash}` : ""}`,
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
            <MobileMomentsInlineNotice
              tone="info"
              action={
                <button
                  type="button"
                  onClick={handleStatusBack}
                  className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {interactionActionLabel}
                </button>
              }
            >
              {likeMutation.error.message}
            </MobileMomentsInlineNotice>
          ) : null}
          {commentMutation.isError && commentMutation.error instanceof Error ? (
            <MobileMomentsInlineNotice
              tone="info"
              action={
                <button
                  type="button"
                  onClick={handleStatusBack}
                  className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {interactionActionLabel}
                </button>
              }
            >
              {commentMutation.error.message}
            </MobileMomentsInlineNotice>
          ) : null}

          {!momentsQuery.isLoading &&
          !momentsQuery.isError &&
          !visibleMoments.length ? (
            <MobileMomentsStatusCard
              badge="朋友圈"
              title="还很安静"
              description="你先发一条动态，或者等世界里的角色们先开口。"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  className="h-8 rounded-full bg-[#07c160] px-3.5 text-[11px] text-white hover:bg-[#06ad56]"
                  onClick={handleEmptyStateAction}
                >
                  {safeReturnPath ? "返回上一页" : "发一条朋友圈"}
                </Button>
              }
            />
          ) : null}
        </section>
      </div>
    </AppPage>
  );
}

function MobileMomentsStatusCard({
  badge,
  title,
  description,
  tone = "default",
  action,
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
  action?: ReactNode;
}) {
  const loading = tone === "loading";
  return (
    <section
      className={
        tone === "danger"
          ? "rounded-[18px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-4 py-5 text-center shadow-none"
          : "rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-5 text-center shadow-none"
      }
    >
      <div
        className={
          tone === "danger"
            ? "mx-auto inline-flex rounded-full bg-[rgba(220,38,38,0.08)] px-2.5 py-1 text-[9px] font-medium tracking-[0.04em] text-[color:var(--state-danger-text)]"
            : "mx-auto inline-flex rounded-full bg-[rgba(7,193,96,0.1)] px-2.5 py-1 text-[9px] font-medium tracking-[0.04em] text-[#07c160]"
        }
      >
        {badge}
      </div>
      {loading ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-black/15 animate-pulse" />
          <span className="h-2 w-2 rounded-full bg-black/25 animate-pulse [animation-delay:120ms]" />
          <span className="h-2 w-2 rounded-full bg-[#8ecf9d] animate-pulse [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-3 text-[15px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-2 max-w-[18rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

function MobileMomentsInlineNotice({
  children,
  tone,
  action,
}: {
  children: ReactNode;
  tone: "success" | "info";
  action?: ReactNode;
}) {
  return (
    <InlineNotice
      tone={tone}
      className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
    >
      {action ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1">{children}</span>
          {action}
        </div>
      ) : (
        children
      )}
    </InlineNotice>
  );
}
