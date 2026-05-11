import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";
import { ArrowLeft, ChevronRight, Play } from "lucide-react";

const t = translateRuntimeMessage;
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { RouteRedirectState } from "../components/route-redirect-state";
import {
  gameCenterFeaturedGameIds,
  gameCenterFriendActivities,
  gameCenterGames,
  gameCenterHotRankings,
  gameCenterNewRankings,
  getGameCenterGame,
  getGameCenterToneStyle,
  type GameCenterGame,
} from "../features/games/game-center-data";
import {
  EmbeddedGameSlot,
  hasEmbeddedGame,
} from "../features/games/embedded-game-registry";
import { useGameCenterState } from "../features/games/use-game-center-state";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { buildGameInvitePath } from "../features/games/game-invite-route";
import { AvatarChip } from "../components/avatar-chip";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { normalizePathname } from "../lib/normalize-pathname";
import { searchStringToObject } from "../lib/route-search";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import {
  isMobileWebShareSurface,
  isNativeMobileShareSurface,
} from "../runtime/mobile-share-surface";
import {
  buildMobileGamesRouteSearch,
  parseMobileGamesRouteSearch,
} from "../features/games/mobile-games-route-state";

const DesktopGamesWorkspace = lazy(async () => {
  const mod = await import("../features/desktop/games/desktop-games-workspace");
  return { default: mod.DesktopGamesWorkspace };
});

function resolveGames(ids: string[]) {
  return ids
    .map((id) => getGameCenterGame(id))
    .filter((game): game is GameCenterGame => Boolean(game));
}

function resolveDefaultGameSelection() {
  return gameCenterFeaturedGameIds[0] ?? "signal-squad";
}

export function GamesPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const mobileWebCopyFallback = isMobileWebShareSurface({
    isDesktopLayout,
  });
  const locationSearch = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const routeState = useMemo(
    () => parseMobileGamesRouteSearch(locationSearch),
    [locationSearch],
  );
  const {
    activeGameId,
    friendInviteStatusByActivityId,
    recentGameIds,
    dismissActiveGame,
    applyFriendInvite,
    launchGame,
  } = useGameCenterState();
  const selectedGameFromSearch = routeState.gameId ?? null;
  const inviteActivityFromSearch = useMemo(
    () =>
      routeState.inviteId
        ? gameCenterFriendActivities.find(
            (item) => item.id === routeState.inviteId,
          ) ?? null
        : null,
    [routeState.inviteId],
  );
  const [selectedGameId, setSelectedGameId] = useState(
    selectedGameFromSearch ?? resolveDefaultGameSelection(),
  );
  const [activeInviteActivityId, setActiveInviteActivityId] = useState<
    string | null
  >(inviteActivityFromSearch?.id ?? null);
  const [successNotice, setSuccessNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const [noticeActionState, setNoticeActionState] = useState<{
    label: string;
    message: string;
    onAction: () => void;
  } | null>(null);
  const normalizedPathname = normalizePathname(pathname);
  const isDesktopGamesRoute =
    normalizedPathname === "/tabs/games" ||
    normalizedPathname === "/games" ||
    normalizedPathname === "/discover/games";
  const normalizedDesktopReturnPath =
    isDesktopLayout &&
    (routeState.returnPath === "/games" ||
      routeState.returnPath === "/discover/games")
      ? "/tabs/games"
      : routeState.returnPath;
  const safeReturnPath =
    normalizedDesktopReturnPath &&
    !isDesktopOnlyPath(normalizedDesktopReturnPath)
      ? normalizedDesktopReturnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const activeInviteActivity = useMemo(
    () =>
      activeInviteActivityId
        ? (gameCenterFriendActivities.find(
            (item) => item.id === activeInviteActivityId,
          ) ?? null)
        : null,
    [activeInviteActivityId],
  );

  useEffect(() => {
    if (!getGameCenterGame(selectedGameId)) {
      setSelectedGameId(gameCenterFeaturedGameIds[0] ?? "signal-squad");
    }
  }, [selectedGameId]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccessNotice("");
      setNoticeActionState(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => {
    const nextSelectedGameId =
      selectedGameFromSearch ?? resolveDefaultGameSelection();

    setSelectedGameId((current) =>
      current === nextSelectedGameId ? current : nextSelectedGameId,
    );
  }, [selectedGameFromSearch]);

  useEffect(() => {
    const nextInviteActivityId = inviteActivityFromSearch?.id ?? null;
    setActiveInviteActivityId((current) =>
      current === nextInviteActivityId ? current : nextInviteActivityId,
    );
  }, [inviteActivityFromSearch?.id]);

  useEffect(() => {
    if (!activeInviteActivityId) {
      return;
    }

    const activity = gameCenterFriendActivities.find(
      (item) => item.id === activeInviteActivityId,
    );
    if (activity && activity.gameId === selectedGameId) {
      return;
    }

    setActiveInviteActivityId(null);
  }, [activeInviteActivityId, selectedGameId]);

  useEffect(() => {
    if (inviteActivityFromSearch) {
      setNoticeTone("info");
      const inviteFriendName = inviteActivityFromSearch.friendName;
      const inviteGameName =
        getGameCenterGame(inviteActivityFromSearch.gameId)?.name ?? t(msg`当前游戏`);
      setSuccessNotice(
        t(msg`已带上 ${inviteFriendName} 的组局邀约，可继续查看 ${inviteGameName}。`),
      );
    }
  }, [inviteActivityFromSearch]);

  useEffect(() => {
    if (!isDesktopLayout || !isDesktopGamesRoute || !selectedGameId) {
      return;
    }

    const nextSearch = buildMobileGamesRouteSearch({
      gameId: selectedGameId,
      inviteId:
        activeInviteActivity?.gameId === selectedGameId
          ? activeInviteActivity?.id
          : undefined,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    });

    if (
      pathname === "/tabs/games" &&
      (locationSearch || "") === (nextSearch || "")
    ) {
      return;
    }

    void navigate({
      to: "/tabs/games",
      search: searchStringToObject(nextSearch),
      replace: true,
    });
  }, [
    activeInviteActivity?.gameId,
    activeInviteActivity?.id,
    isDesktopGamesRoute,
    isDesktopLayout,
    locationSearch,
    navigate,
    pathname,
    safeReturnHash,
    safeReturnPath,
    selectedGameId,
  ]);

  useEffect(() => {
    if (
      isDesktopLayout ||
      normalizedPathname !== "/discover/games" ||
      !selectedGameId
    ) {
      return;
    }

    const nextSearch = buildMobileGamesRouteSearch({
      gameId: selectedGameId,
      inviteId:
        activeInviteActivity?.gameId === selectedGameId
          ? activeInviteActivity?.id
          : undefined,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    });

    if ((locationSearch || "") === (nextSearch || "")) {
      return;
    }

    void navigate({
      to: pathname,
      search: searchStringToObject(nextSearch),
      replace: true,
    });
  }, [
    activeInviteActivity?.gameId,
    activeInviteActivity?.id,
    isDesktopLayout,
    locationSearch,
    navigate,
    pathname,
    normalizedPathname,
    safeReturnHash,
    safeReturnPath,
    selectedGameId,
  ]);

  const featuredGames = resolveGames(gameCenterFeaturedGameIds);
  const selectedGame =
    getGameCenterGame(selectedGameId) ?? featuredGames[0] ?? gameCenterGames[0];
  const recentGames = resolveGames(recentGameIds);
  const myGames =
    recentGames.length > 0 ? recentGames : featuredGames.slice(0, 6);
  const bannerGame = featuredGames[0] ?? selectedGame;
  const featuredRest = featuredGames.slice(1);

  function handleLaunchGame(gameId: string) {
    const game = getGameCenterGame(gameId);
    launchGame(gameId);
    setSelectedGameId(gameId);
    if (gameId === "yinjie-farm") {
      void navigate({ to: "/tabs/games/yinjie-farm" });
      return;
    }
    if (hasEmbeddedGame(gameId)) {
      // 内嵌小游戏：launchGame 已写入 activeGameId，渲染处会自动出 embedded UI，无需 toast
      return;
    }
    setNoticeTone("success");
    const launchedName = game?.name ?? t(msg`该游戏`);
    setSuccessNotice(
      t(msg`${launchedName} 已加入最近玩过。首期先以游戏中心内容工作区承接，后续再接小游戏容器。`),
    );
  }

  function handleInviteFriend(activityId: string) {
    const activity = gameCenterFriendActivities.find(
      (item) => item.id === activityId,
    );
    if (!activity) {
      return;
    }

    const game = getGameCenterGame(activity.gameId);
    const alreadyInvited = Boolean(friendInviteStatusByActivityId[activityId]);
    applyFriendInvite(activityId, "invited");
    setSelectedGameId(activity.gameId);
    setNoticeTone("success");
    const inviteFriendName = activity.friendName;
    const inviteGameName = game?.name ?? t(msg`当前游戏`);
    setSuccessNotice(
      alreadyInvited
        ? t(msg`已再次邀请 ${inviteFriendName} 一起玩${inviteGameName}。`)
        : t(msg`已向 ${inviteFriendName} 发出一起玩${inviteGameName} 的邀约。`),
    );
  }

  async function handleCopyGameToMobile(gameId: string) {
    const game = getGameCenterGame(gameId);
    const conversationPath = buildGameInvitePath("/discover/games", { gameId });
    const link = resolveMobileHandoffLink(conversationPath);

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${game?.name ?? t(msg`游戏中心`)} ${t(msg`入口`)}`,
        text: `${game?.name ?? t(msg`游戏中心`)}\n${link}`,
        url: link,
      });

      if (shared) {
        setNoticeTone("success");
        setNoticeActionState(null);
        setSuccessNotice(t(msg`已打开系统分享面板。`));
        return;
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setNoticeTone("info");
        setNoticeActionState({
          label: t(msg`重试分享`),
          message: t(msg`当前设备暂时无法打开系统分享，请稍后重试。`),
          onAction: () => {
            void handleCopyGameToMobile(gameId);
          },
        });
        setSuccessNotice(t(msg`当前设备暂时无法打开系统分享，请稍后重试。`));
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        setNoticeTone("success");
        setNoticeActionState(null);
        setSuccessNotice(t(msg`系统分享暂时不可用，已复制入口链接。`));
      } catch {
        setNoticeActionState({
          label: t(msg`重试分享`),
          message: t(msg`系统分享失败，请稍后重试。`),
          onAction: () => {
            void handleCopyGameToMobile(gameId);
          },
        });
        setNoticeTone("info");
        setSuccessNotice(t(msg`系统分享失败，请稍后重试。`));
      }
      return;
    }

    if (mobileWebCopyFallback) {
      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setNoticeTone("info");
        setNoticeActionState({
          label: t(msg`重试复制`),
          message: t(msg`当前环境暂不支持复制入口链接。`),
          onAction: () => {
            void handleCopyGameToMobile(gameId);
          },
        });
        setSuccessNotice(t(msg`当前环境暂不支持复制入口链接。`));
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        setNoticeTone("success");
        setNoticeActionState(null);
        setSuccessNotice(t(msg`入口链接已复制。`));
      } catch {
        setNoticeActionState({
          label: t(msg`重试复制`),
          message: t(msg`复制入口链接失败，请稍后重试。`),
          onAction: () => {
            void handleCopyGameToMobile(gameId);
          },
        });
        setNoticeTone("info");
        setSuccessNotice(t(msg`复制入口链接失败，请稍后重试。`));
      }
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setNoticeActionState({
        label: t(msg`重试复制到手机`),
        message: t(msg`当前环境暂不支持复制到手机。`),
        onAction: () => {
          void handleCopyGameToMobile(gameId);
        },
      });
      setSuccessNotice(t(msg`当前环境暂不支持复制到手机。`));
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      const handoffName = game?.name ?? t(msg`游戏中心`);
      pushMobileHandoffRecord({
        category: "games",
        description: t(msg`把 ${handoffName} 的入口发到手机继续，保留最近玩过和活动状态。`),
        label: `${handoffName} ${t(msg`接力`)}`,
        path: conversationPath,
      });
      setNoticeTone("success");
      setNoticeActionState(null);
      const copiedName = game?.name ?? t(msg`该游戏`);
      setSuccessNotice(t(msg`${copiedName} 已复制到手机接力链接。`));
    } catch {
      setNoticeActionState({
        label: t(msg`重试复制到手机`),
        message: t(msg`复制到手机失败，请稍后重试。`),
        onAction: () => {
          void handleCopyGameToMobile(gameId);
        },
      });
      setNoticeTone("info");
      setSuccessNotice(t(msg`复制到手机失败，请稍后重试。`));
    }
  }

  function handleBack() {
    navigateBackOrFallback(() => {
      if (safeReturnPath) {
        void navigate({
          to: safeReturnPath,
          ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        });
        return;
      }

      void navigate({ to: "/tabs/discover" });
    });
  }

  if (!selectedGame) {
    return (
      <AppPage className="space-y-0 px-0 pb-0 pt-0">
        {/* 暂时隐藏「功能开发中」蒙板 */} // i18n-ignore-line
      </AppPage>
    );
  }

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开游戏中心`)}
            description={t(msg`正在载入桌面端游戏中心。`)}
            loadingLabel={t(msg`载入桌面游戏中心...`)}
          />
        }
      >
        <DesktopGamesWorkspace
          selectedGameId={selectedGame.id}
          activeGameId={activeGameId}
          recentGameIds={recentGameIds}
          friendInviteStatusByActivityId={friendInviteStatusByActivityId}
          successNotice={successNotice}
          noticeTone={noticeTone}
          noticeActionState={noticeActionState}
          onSelectGame={setSelectedGameId}
          onLaunchGame={handleLaunchGame}
          onInviteFriend={handleInviteFriend}
          onCopyGameToMobile={handleCopyGameToMobile}
          onDismissActiveGame={dismissActiveGame}
          nativeMobileShareSupported={nativeMobileShareSupported}
        />
      </Suspense>
    );
  }

  const statusBackLabel = safeReturnPath ? t(msg`返回上一页`) : null;
  const isEmbeddedActive =
    activeGameId === selectedGame.id && hasEmbeddedGame(activeGameId);
  const friendActivities = gameCenterFriendActivities.filter((activity) =>
    Boolean(getGameCenterGame(activity.gameId)),
  );

  function handleSelectAndLaunch(gameId: string) {
    setSelectedGameId(gameId);
    handleLaunchGame(gameId);
  }

  return (
    <AppPage className="space-y-0 bg-white px-0 pb-0 pt-0">
      <TabPageTopBar
        title={t(msg`游戏`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-white px-4 pb-2 pt-2 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={handleBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
      />

      <div className="bg-white pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {myGames.length > 0 ? (
          <div className="border-b border-[color:var(--border-faint)] bg-white">
            <SectionHeader title={t(msg`我的游戏`)} />
            <div className="flex gap-4 overflow-x-auto px-4 pb-3 pt-1">
              {myGames.map((game) => (
                <GameIconTile
                  key={`my-${game.id}`}
                  game={game}
                  onClick={() => handleSelectAndLaunch(game.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {bannerGame ? (
          <div className="border-b border-[color:var(--border-faint)] bg-white px-4 py-3">
            <BannerCard
              game={bannerGame}
              onLaunch={() => handleSelectAndLaunch(bannerGame.id)}
            />
          </div>
        ) : null}

        {successNotice ? (
          <div className="bg-white px-4 pt-3">
            <InlineNotice
              className="rounded-[10px] px-3 py-2 text-[12px] leading-[1.35rem] shadow-none"
              tone={noticeTone}
            >
              {noticeTone === "info" &&
              ((noticeActionState &&
                noticeActionState.message === successNotice) ||
                statusBackLabel) ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">{successNotice}</span>
                  <div className="flex items-center gap-1.5">
                    {noticeActionState &&
                    noticeActionState.message === successNotice ? (
                      <button
                        type="button"
                        onClick={noticeActionState.onAction}
                        className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[11px] font-medium text-[color:var(--text-secondary)]"
                      >
                        {noticeActionState.label}
                      </button>
                    ) : null}
                    {statusBackLabel ? (
                      <button
                        type="button"
                        onClick={handleBack}
                        className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[11px] font-medium text-[color:var(--text-secondary)]"
                      >
                        {statusBackLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                successNotice
              )}
            </InlineNotice>
          </div>
        ) : null}

        {isEmbeddedActive && activeGameId ? (
          <div className="border-b border-[color:var(--border-faint)] bg-white px-4 py-3">
            <div className="overflow-hidden rounded-[16px] border border-[color:var(--border-subtle)]">
              <EmbeddedGameSlot
                gameId={activeGameId}
                onExit={dismissActiveGame}
              />
            </div>
          </div>
        ) : null}

        {friendActivities.length > 0 ? (
          <div className="border-b border-[color:var(--border-faint)] bg-white">
            <SectionHeader title={t(msg`好友在玩`)} />
            <ul className="bg-white">
              {friendActivities.map((activity) => {
                const game = getGameCenterGame(activity.gameId);
                if (!game) return null;
                return (
                  <FriendActivityRow
                    key={activity.id}
                    activity={activity}
                    game={game}
                    invited={Boolean(
                      friendInviteStatusByActivityId[activity.id],
                    )}
                    onSelect={() => setSelectedGameId(game.id)}
                    onInvite={() => handleInviteFriend(activity.id)}
                  />
                );
              })}
            </ul>
          </div>
        ) : null}

        {featuredRest.length > 0 ? (
          <div className="border-b border-[color:var(--border-faint)] bg-white">
            <SectionHeader title={t(msg`精选小游戏`)} trailing={t(msg`更多`)} />
            <ul className="bg-white">
              {featuredRest.map((game) => (
                <GameListRow
                  key={`featured-${game.id}`}
                  game={game}
                  onLaunch={() => handleSelectAndLaunch(game.id)}
                  onSelect={() => setSelectedGameId(game.id)}
                />
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-b border-[color:var(--border-faint)] bg-white">
          <SectionHeader title={t(msg`热门小游戏`)} trailing={t(msg`更多`)} />
          <ul className="bg-white">
            {gameCenterHotRankings.map((entry) => {
              const game = getGameCenterGame(entry.gameId);
              if (!game) return null;
              return (
                <GameListRow
                  key={`hot-${entry.gameId}`}
                  game={game}
                  onLaunch={() => handleSelectAndLaunch(game.id)}
                  onSelect={() => setSelectedGameId(game.id)}
                />
              );
            })}
          </ul>
        </div>

        <div className="bg-white">
          <SectionHeader title={t(msg`新游榜`)} trailing={t(msg`更多`)} />
          <ul className="bg-white">
            {gameCenterNewRankings.map((entry) => {
              const game = getGameCenterGame(entry.gameId);
              if (!game) return null;
              return (
                <GameListRow
                  key={`new-${entry.gameId}`}
                  game={game}
                  onLaunch={() => handleSelectAndLaunch(game.id)}
                  onSelect={() => setSelectedGameId(game.id)}
                />
              );
            })}
          </ul>
        </div>
      </div>
    </AppPage>
  );
}

function SectionHeader({
  title,
  trailing,
  onTrailingClick,
}: {
  title: string;
  trailing?: string;
  onTrailingClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-4 text-[14px] font-medium text-[color:var(--text-primary)]">
      <span>{title}</span>
      {trailing ? (
        <button
          type="button"
          onClick={onTrailingClick}
          className="inline-flex items-center gap-0.5 text-[12px] font-normal text-[color:var(--text-muted)] active:text-[color:var(--text-secondary)]"
        >
          {trailing}
          <ChevronRight size={13} />
        </button>
      ) : null}
    </div>
  );
}

function GameAvatar({
  game,
  size = "md",
}: {
  game: GameCenterGame;
  size?: "sm" | "md" | "lg";
}) {
  const tone = getGameCenterToneStyle(game.tone);
  const sizeClass =
    size === "sm"
      ? "h-10 w-10 rounded-[10px] text-[15px]"
      : size === "lg"
        ? "h-14 w-14 rounded-[14px] text-[20px]"
        : "h-[52px] w-[52px] rounded-[14px] text-[18px]";
  const initial = [...game.name][0] ?? "?";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold",
        sizeClass,
        tone.iconClassName,
      )}
    >
      {initial}
    </div>
  );
}

function GameIconTile({
  game,
  onClick,
}: {
  game: GameCenterGame;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-14 shrink-0 flex-col items-center gap-1.5 text-center"
    >
      <GameAvatar game={game} size="md" />
      <span className="w-full truncate text-[11px] leading-tight text-[color:var(--text-secondary)]">
        {game.name}
      </span>
    </button>
  );
}

function BannerCard({
  game,
  onLaunch,
}: {
  game: GameCenterGame;
  onLaunch: () => void;
}) {
  const tone = getGameCenterToneStyle(game.tone);
  return (
    <button
      type="button"
      onClick={onLaunch}
      className={cn(
        "relative block w-full overflow-hidden rounded-[14px] text-left shadow-none",
        tone.heroCardClassName,
      )}
      style={{ aspectRatio: "2 / 1" }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-10 top-0 h-32 w-32 rounded-full bg-white/12 blur-3xl" />
        <div className="absolute bottom-0 left-8 h-24 w-24 rounded-full bg-black/10 blur-3xl" />
      </div>
      <div className="relative flex h-full flex-col justify-between p-4">
        <div>
          <div className="inline-flex rounded-full border border-white/18 bg-white/15 px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-white/85">
            {game.badge}
          </div>
          <div className="mt-2 text-[18px] font-semibold leading-tight text-white">
            {game.name}
          </div>
          <div className="mt-1 line-clamp-1 text-[12px] leading-snug text-white/82">
            {game.slogan}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/72">{game.playersLabel}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[color:var(--text-primary)]">
            <Play size={13} />
            {t(msg`开始`)}
          </span>
        </div>
      </div>
    </button>
  );
}

function GameListRow({
  game,
  onLaunch,
  onSelect,
  trailingLabel,
}: {
  game: GameCenterGame;
  onLaunch: () => void;
  onSelect?: () => void;
  trailingLabel?: string;
}) {
  const resolvedTrailingLabel = trailingLabel ?? t(msg`开始`);
  const visibleTags = game.tags.slice(0, 2);
  return (
    <li className="flex items-center gap-3 border-b border-[color:var(--border-faint)] px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={onSelect ?? onLaunch}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <GameAvatar game={game} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
            {game.name}
          </div>
          <div className="mt-0.5 line-clamp-1 text-[12px] text-[color:var(--text-muted)]">
            {game.slogan}
          </div>
          {visibleTags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-[color:var(--bg-canvas-muted,rgba(0,0,0,0.04))] px-1.5 py-px text-[10px] text-[color:var(--text-muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        onClick={onLaunch}
        className="h-7 shrink-0 rounded-full bg-[#07C160] px-4 text-[12px] font-medium text-white active:bg-[#06ad57]"
      >
        {resolvedTrailingLabel}
      </button>
    </li>
  );
}

function FriendActivityRow({
  activity,
  game,
  invited,
  onSelect,
  onInvite,
}: {
  activity: (typeof gameCenterFriendActivities)[number];
  game: GameCenterGame;
  invited: boolean;
  onSelect: () => void;
  onInvite: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-[color:var(--border-faint)] px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <AvatarChip
          name={activity.friendName}
          src={activity.friendAvatar}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
            {activity.friendName}
          </div>
          <div className="mt-0.5 line-clamp-1 text-[12px] text-[color:var(--text-muted)]">
            {t(msg`正在玩`)} {game.name} · {activity.status}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onInvite}
        className={cn(
          "h-7 shrink-0 rounded-full px-4 text-[12px] font-medium",
          invited
            ? "border border-[color:var(--border-subtle)] bg-white text-[color:var(--text-secondary)]"
            : "bg-[#07C160] text-white active:bg-[#06ad57]",
        )}
      >
        {invited ? t(msg`已邀约`) : t(msg`邀请`)}
      </button>
    </li>
  );
}
