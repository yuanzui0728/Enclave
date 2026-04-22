import {
  Suspense,
  lazy,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  addMomentComment,
  getBlockedCharacters,
  getCharacter,
  getFriends,
  getMoments,
  toggleMomentLike,
} from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { RouteRedirectState } from "../components/route-redirect-state";
import { buildDesktopContactsRouteHash } from "../features/contacts/contacts-route-state";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import {
  buildDesktopFriendMomentsPath,
  buildDesktopFriendMomentsRouteHash,
  parseDesktopFriendMomentsRouteState,
} from "../features/moments/friend-moments-route-state";
import { coerceToMobileFriendMomentsRouteHash } from "../features/moments/mobile-friend-moments-route-state";
import { getFriendDisplayName } from "../features/contacts/contact-utils";
import { getMomentSummaryText } from "../features/moments/moment-content";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { formatTimestamp } from "../lib/format";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const DesktopFriendMomentsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/moments/desktop-friend-moments-workspace");
  return { default: mod.DesktopFriendMomentsWorkspace };
});

const DesktopMessageAvatarPopover = lazy(async () => {
  const mod = await import("../features/chat/message-avatar-popover-shell");
  return { default: mod.DesktopMessageAvatarPopover };
});

export function FriendMomentsPage() {
  const { characterId } = useParams({
    from: "/desktop/friend-moments/$characterId",
  });
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
  const composeDraft = useMomentComposeDraft();
  const resetComposeDraft = useEffectEvent(() => {
    composeDraft.reset();
  });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [showCompose, setShowCompose] = useState(false);
  const [notice, setNotice] = useState("");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [desktopAvatarPopover, setDesktopAvatarPopover] = useState<{
    anchorElement: HTMLButtonElement;
    returnHash?: string;
  } | null>(null);
  const routeState = parseDesktopFriendMomentsRouteState(hash);
  const routeSelectedMomentId = routeState.momentId ?? null;

  useEffect(() => {
    setDesktopAvatarPopover(null);
  }, [characterId, hash, pathname]);

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId, baseUrl),
    enabled: isDesktopLayout,
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: isDesktopLayout,
  });
  const momentsQuery = useQuery({
    queryKey: ["app-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
    enabled: isDesktopLayout,
  });
  const blockedQuery = useQuery({
    queryKey: ["app-moments-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: isDesktopLayout && Boolean(ownerId),
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
      setNotice("朋友圈已发布。");
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });
  const likeMutation = useMutation({
    mutationFn: (momentId: string) => toggleMomentLike(momentId, baseUrl),
    onSuccess: async () => {
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
      setNotice("朋友圈互动已更新。");
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
    },
  });

  const friendItem = useMemo(
    () =>
      (friendsQuery.data ?? []).find(
        (item) => item.character.id === characterId,
      ) ?? null,
    [characterId, friendsQuery.data],
  );
  const character = characterQuery.data ?? friendItem?.character ?? null;
  const isBlocked = Boolean(
    (blockedQuery.data ?? []).some((item) => item.characterId === characterId),
  );
  const displayName = friendItem
    ? getFriendDisplayName(friendItem)
    : character?.name || "角色朋友圈";
  const signature =
    character?.currentStatus?.trim() ||
    character?.bio?.trim() ||
    "这个角色还没有个性签名。";
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
  const friendMoments = visibleMoments.filter(
    (moment) => moment.authorId === characterId,
  );

  useEffect(() => {
    resetComposeDraft();
    setCommentDrafts({});
    setShowCompose(false);
    setNotice("");
  }, [baseUrl, characterId, resetComposeDraft]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, [isDesktopLayout]);

  useEffect(() => {
    if (!isDesktopLayout || !nativeDesktopFavorites) {
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
  }, [isDesktopLayout, nativeDesktopFavorites]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
    if (isDesktopLayout) {
      return;
    }

    const mobileRedirectHash = coerceToMobileFriendMomentsRouteHash(hash);

    void navigate({
      to: "/friend-moments/$characterId",
      params: { characterId },
      ...(mobileRedirectHash ? { hash: mobileRedirectHash } : {}),
      replace: true,
    });
  }, [characterId, hash, isDesktopLayout, navigate]);

  function navigateToRouteStateReturn() {
    if (!routeState.returnPath) {
      return false;
    }

    if (!isDesktopLayout && isDesktopOnlyPath(routeState.returnPath)) {
      return false;
    }

    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
    });
    return true;
  }

  function handleBack() {
    navigateBackOrFallback(() => {
      if (navigateToRouteStateReturn()) {
        return;
      }

      if (routeState.source === "contacts") {
        void navigate({ to: "/tabs/contacts" });
        return;
      }

      if (routeState.source === "starred-friends") {
        if (isDesktopLayout) {
          void navigate({
            to: "/tabs/contacts",
            hash: buildDesktopContactsRouteHash({
              pane: "starred-friends",
              showWorldCharacters: false,
            }),
          });
          return;
        }

        void navigate({ to: "/contacts/starred" });
        return;
      }

      if (routeState.source === "tags") {
        if (isDesktopLayout) {
          void navigate({
            to: "/tabs/contacts",
            hash: buildDesktopContactsRouteHash({
              pane: "tags",
              showWorldCharacters: false,
            }),
          });
          return;
        }

        void navigate({ to: "/contacts/tags" });
        return;
      }

      if (routeState.source === "character-detail" && characterId) {
        void navigate({
          to: "/character/$characterId",
          params: { characterId },
        });
        return;
      }

      if (
        routeState.source === "chat-details" ||
        routeState.source === "avatar-popover"
      ) {
        void navigate({ to: "/tabs/chat" });
        return;
      }

      void navigate({ to: "/tabs/moments" });
    });
  }

  if (!isDesktopLayout) {
    return (
      <AppPage className="flex min-h-full items-center justify-center bg-[#f2f2f2] px-4 py-8">
        <LoadingBlock
          label="正在切换到手机端角色朋友圈..."
          className="w-full max-w-[360px] rounded-[24px] border-[color:var(--border-faint)] bg-white py-8 shadow-[var(--shadow-section)]"
        />
      </AppPage>
    );
  }

  const errors: string[] = [];
  if (characterQuery.isError && characterQuery.error instanceof Error) {
    errors.push(characterQuery.error.message);
  }
  if (friendsQuery.isError && friendsQuery.error instanceof Error) {
    errors.push(friendsQuery.error.message);
  }
  if (momentsQuery.isError && momentsQuery.error instanceof Error) {
    errors.push(momentsQuery.error.message);
  }
  if (blockedQuery.isError && blockedQuery.error instanceof Error) {
    errors.push(blockedQuery.error.message);
  }

  if (!character && (characterQuery.isLoading || friendsQuery.isLoading)) {
    return (
      <div className="flex h-full items-center justify-center bg-[rgba(244,247,246,0.98)] px-6">
        <LoadingBlock
          label="正在读取角色朋友圈..."
          className="w-full max-w-[420px] rounded-[24px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex h-full items-center justify-center bg-[rgba(244,247,246,0.98)] px-6">
        <div className="w-full max-w-[480px] rounded-[24px] border border-[color:var(--border-faint)] bg-white p-6 shadow-[var(--shadow-section)]">
          <div className="text-[18px] font-semibold text-[color:var(--text-primary)]">
            无法打开这位角色的朋友圈
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            角色资料不存在，或者当前资料还没有同步完成。
          </div>
          {errors.length > 0 ? (
            <div className="mt-4 space-y-3">
              {errors.map((message, index) => (
                <ErrorBlock key={`${message}-${index}`} message={message} />
              ))}
            </div>
          ) : null}
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={handleBack}>
              返回上一页
            </Button>
            <Button
              variant="primary"
              onClick={() => void navigate({ to: "/tabs/moments" })}
            >
              去朋友圈主页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <RouteRedirectState
          title="正在打开桌面好友朋友圈"
          description="正在载入桌面好友朋友圈工作区，马上显示角色动态详情。"
          loadingLabel="载入桌面好友朋友圈..."
        />
      }
    >
      <DesktopFriendMomentsWorkspace
        character={character}
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
        displayName={displayName}
        errors={errors}
        imageDrafts={composeDraft.imageDrafts}
        isBlocked={isBlocked}
        isLoading={momentsQuery.isLoading}
        likeErrorMessage={
          likeMutation.isError && likeMutation.error instanceof Error
            ? likeMutation.error.message
            : null
        }
        likePendingMomentId={pendingLikeMomentId}
        moments={friendMoments}
        ownerAvatar={ownerAvatar}
        ownerId={ownerId}
        ownerUsername={ownerUsername}
        routeSelectedMomentId={routeSelectedMomentId}
        showCompose={showCompose}
        signature={signature}
        successNotice={notice}
        text={composeDraft.text}
        videoDraft={composeDraft.videoDraft}
        isMomentFavorite={(momentId) =>
          favoriteSourceIds.includes(`moment-${momentId}`)
        }
        setShowCompose={setShowCompose}
        onBack={handleBack}
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
        onOpenMomentsHome={() => {
          void navigate({ to: "/tabs/moments" });
        }}
        onOpenProfilePopover={({ anchorElement, momentId }) => {
          setDesktopAvatarPopover({
            anchorElement,
            returnHash: buildDesktopFriendMomentsRouteHash({
              ...routeState,
              momentId: momentId ?? routeSelectedMomentId ?? undefined,
            }),
          });
        }}
        onOpenProfile={() => {
          void navigate({
            to: "/tabs/contacts",
            hash: buildDesktopContactsRouteHash({
              pane: friendItem ? "friend" : "world-character",
              characterId,
              showWorldCharacters: !friendItem,
            }),
          });
        }}
        onRouteStateChange={(state) => {
          const nextHash = buildDesktopFriendMomentsRouteHash({
            ...state,
            source: routeState.source,
            returnPath: routeState.returnPath,
            returnHash: routeState.returnHash,
          });
          const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

          if (normalizedHash === (nextHash ?? "")) {
            return;
          }

          void navigate({
            to: "/desktop/friend-moments/$characterId",
            params: { characterId },
            hash: nextHash,
            replace: true,
          });
        }}
        onTextChange={composeDraft.setText}
        onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
        onRemoveVideo={() => composeDraft.clearVideoDraft()}
        onToggleFavorite={(momentId) => {
          const moment = friendMoments.find((item) => item.id === momentId);
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
                description: getMomentSummaryText(moment),
                meta: `朋友圈 · ${formatTimestamp(moment.postedAt)}`,
                to: buildDesktopFriendMomentsPath(characterId, {
                  momentId: moment.id,
                  source: "moments",
                }),
                badge: "朋友圈",
                avatarName: moment.authorName,
                avatarSrc: moment.authorAvatar,
              });

          setFavoriteSourceIds(
            nextFavorites.map((favorite) => favorite.sourceId),
          );
        }}
        onVideoFileSelected={(file) => {
          void handleVideoFileSelected(file);
        }}
      />
      {desktopAvatarPopover ? (
        <Suspense fallback={null}>
          <DesktopMessageAvatarPopover
            anchorElement={desktopAvatarPopover.anchorElement}
            kind="character"
            characterId={characterId}
            fallbackAvatar={character?.avatar}
            fallbackName={displayName}
            navigationContext={{
              hideMomentsAction: true,
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
