import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  getConversations,
  sendGroupMessage,
  type ConversationListItem,
} from "@yinjie/contracts";
import {
  AppPage,
  AppSection,
  Button,
  InlineNotice,
  cn,
} from "@yinjie/ui";
import {
  ArrowLeft,
  Clock3,
  Copy,
  Flame,
  Gift,
  Pin,
  Play,
  Share2,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopGamesWorkspace } from "../features/desktop/games/desktop-games-workspace";
import {
  gameCenterCategoryTabs,
  gameCenterEvents,
  gameCenterFeaturedGameIds,
  gameCenterFriendActivities,
  gameCenterGames,
  gameCenterHotRankings,
  gameCenterNewRankings,
  getGameCenterEventActionLabel,
  getGameCenterGame,
  getGameCenterEventStatusLabel,
  getGameCenterToneStyle,
  type GameCenterCategoryId,
  type GameCenterGame,
} from "../features/games/game-center-data";
import { GameCenterSessionPanel } from "../features/games/game-center-session-panel";
import { useGameCenterState } from "../features/games/use-game-center-state";
import { emitChatMessage, joinConversationRoom } from "../lib/socket";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { buildGameInvitePath } from "../features/games/game-invite-route";
import { AvatarChip } from "../components/avatar-chip";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  formatConversationTimestamp,
  formatTimestamp,
  parseTimestamp,
} from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import {
  isMobileWebShareSurface,
  isNativeMobileShareSurface,
} from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

function resolveGames(ids: string[]) {
  return ids
    .map((id) => getGameCenterGame(id))
    .filter((game): game is GameCenterGame => Boolean(game));
}

function resolveDefaultGameSelection() {
  return gameCenterFeaturedGameIds[0] ?? "signal-squad";
}

function resolveGameInviteActivityFromSearch(search: unknown) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  const inviteId = params.get("invite")?.trim();

  if (!inviteId) {
    return null;
  }

  return gameCenterFriendActivities.find((item) => item.id === inviteId) ?? null;
}

function resolveGameSelectionFromSearch(search: unknown) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  const inviteActivity = resolveGameInviteActivityFromSearch(search);
  const gameId = inviteActivity?.gameId ?? params.get("game")?.trim() ?? "";

  return getGameCenterGame(gameId) ? gameId : null;
}

export function GamesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDesktopLayout = useDesktopLayout();
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const mobileWebCopyFallback = isMobileWebShareSurface({
    isDesktopLayout,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerId = useWorldOwnerStore((state) => state.id);
  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  });
  const {
    activeGameId,
    eventActionStatusById,
    lastInviteConversationPathByActivityId,
    lastInviteConversationTitleByActivityId,
    friendInviteSentAtByActivityId,
    friendInviteStatusByActivityId,
    launchCountById,
    lastOpenedAtById,
    pinnedGameIds,
    recentGameIds,
    dismissActiveGame,
    applyEventAction,
    applyFriendInvite,
    markInviteDelivered,
    launchGame,
    togglePinned,
  } = useGameCenterState();
  const [activeCategory, setActiveCategory] =
    useState<GameCenterCategoryId>("featured");
  const selectedGameFromSearch = useMemo(
    () => resolveGameSelectionFromSearch(locationSearch),
    [locationSearch],
  );
  const inviteActivityFromSearch = useMemo(
    () => resolveGameInviteActivityFromSearch(locationSearch),
    [locationSearch],
  );
  const [selectedGameId, setSelectedGameId] = useState(
    selectedGameFromSearch ?? resolveDefaultGameSelection(),
  );
  const [activeInviteActivityId, setActiveInviteActivityId] = useState<string | null>(
    null,
  );
  const [successNotice, setSuccessNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
  });

  useEffect(() => {
    if (!getGameCenterGame(selectedGameId)) {
      setSelectedGameId(gameCenterFeaturedGameIds[0] ?? "signal-squad");
    }
  }, [selectedGameId]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2800);
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
    if (inviteActivityFromSearch) {
      setNoticeTone("info");
      setSuccessNotice(
        `已带上 ${inviteActivityFromSearch.friendName} 的组局邀约，可继续查看 ${getGameCenterGame(inviteActivityFromSearch.gameId)?.name ?? "当前游戏"}。`,
      );
    }
  }, [inviteActivityFromSearch]);

  const featuredGames = resolveGames(gameCenterFeaturedGameIds);
  const selectedGame =
    getGameCenterGame(selectedGameId) ?? featuredGames[0] ?? gameCenterGames[0];
  const mobileBrowseGames =
    activeCategory === "featured"
      ? gameCenterGames.slice(0, 5)
      : gameCenterGames.filter((game) => game.category === activeCategory);
  const recentGames = resolveGames(recentGameIds);
  const inviteConversationCandidates = useMemo(
    () =>
      [...(conversationsQuery.data ?? [])]
        .sort(
          (left, right) =>
            (parseTimestamp(right.lastActivityAt) ?? 0) -
            (parseTimestamp(left.lastActivityAt) ?? 0),
        )
        .slice(0, 5),
    [conversationsQuery.data],
  );

  const sendGroupInviteMutation = useMutation({
    mutationFn: (input: { conversationId: string; text: string }) =>
      sendGroupMessage(
        input.conversationId,
        {
          text: input.text,
        },
        baseUrl,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });

  function handleLaunchGame(gameId: string) {
    const game = getGameCenterGame(gameId);
    launchGame(gameId);
    setSelectedGameId(gameId);
    setNoticeTone("success");
    setSuccessNotice(
      `${game?.name ?? "该游戏"} 已加入最近玩过。首期先以游戏中心内容工作区承接，后续再接小游戏容器。`,
    );
  }

  function handleTogglePinnedGame(gameId: string) {
    const game = getGameCenterGame(gameId);
    const pinned = pinnedGameIds.includes(gameId);
    togglePinned(gameId);
    setNoticeTone("success");
    setSuccessNotice(
      `${game?.name ?? "该游戏"} 已${pinned ? "取消固定常玩" : "固定到常玩"}。`,
    );
  }

  function handleCompleteEventAction(eventId: string) {
    const event = gameCenterEvents.find((item) => item.id === eventId);
    if (!event) {
      return;
    }

    const nextStatus =
      event.actionKind === "reminder" ? "reminder_set" : event.actionKind === "join" ? "joined" : "task_started";

    applyEventAction(eventId, nextStatus);
    setSelectedGameId(event.relatedGameId);
    setNoticeTone("success");
    setSuccessNotice(
      `${event.title} 已标记为${getGameCenterEventStatusLabel(event)}。`,
    );
  }

  function handleInviteFriend(activityId: string) {
    const activity = gameCenterFriendActivities.find((item) => item.id === activityId);
    if (!activity) {
      return;
    }

    const game = getGameCenterGame(activity.gameId);
    const alreadyInvited = Boolean(friendInviteStatusByActivityId[activityId]);
    applyFriendInvite(activityId, "invited");
    setSelectedGameId(activity.gameId);
    setNoticeTone("success");
    setSuccessNotice(
      alreadyInvited
        ? `已再次邀请 ${activity.friendName} 一起玩${game?.name ?? "当前游戏"}。`
        : `已向 ${activity.friendName} 发出一起玩${game?.name ?? "当前游戏"} 的邀约。`,
    );
  }

  function handleOpenInviteToChat(activityId: string) {
    setActiveInviteActivityId((current) =>
      current === activityId ? null : activityId,
    );
  }

  function buildInviteMessage(
    activity: (typeof gameCenterFriendActivities)[number],
    game: GameCenterGame | null,
  ) {
    return [
      "【组局邀约】",
      `${activity.friendName} 正在玩《${game?.name ?? "当前游戏"}》`,
      activity.status,
      "要不要一起上？",
    ].join(" ");
  }

  function resolveConversationPath(conversation: ConversationListItem) {
    return isPersistedGroupConversation(conversation)
      ? `/group/${conversation.id}`
      : `/chat/${conversation.id}`;
  }

  async function handleSendInviteToConversation(
    activityId: string,
    conversationId: string,
  ) {
    const activity = gameCenterFriendActivities.find((item) => item.id === activityId);
    const conversation = inviteConversationCandidates.find(
      (item) => item.id === conversationId,
    );

    if (!activity || !conversation) {
      return;
    }

    const game = getGameCenterGame(activity.gameId);
    const text = buildInviteMessage(activity, game);
    const conversationPath = buildGameInvitePath(
      resolveConversationPath(conversation),
      {
        gameId: activity.gameId,
        inviteId: activity.id,
      },
    );

    if (isPersistedGroupConversation(conversation)) {
      await sendGroupInviteMutation.mutateAsync({
        conversationId: conversation.id,
        text,
      });
    } else {
      const characterId = conversation.participants[0];
      if (!characterId) {
        setNoticeTone("info");
        setSuccessNotice("这条单聊还没有可用的角色目标，暂时无法投递邀约。");
        return;
      }

      joinConversationRoom({ conversationId: conversation.id });
      emitChatMessage({
        conversationId: conversation.id,
        characterId,
        text,
      });
      window.setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      }, 500);
    }

    markInviteDelivered(
      activityId,
      conversation.id,
      conversationPath,
      conversation.title,
    );
    setSelectedGameId(activity.gameId);
    setActiveInviteActivityId(null);
    setNoticeTone("success");
    setSuccessNotice(`已把 ${activity.friendName} 的组局邀约发到 ${conversation.title}。`);
  }

  function handleOpenDeliveredConversation(activityId: string) {
    const path = lastInviteConversationPathByActivityId[activityId];
    const title = lastInviteConversationTitleByActivityId[activityId];
    if (!path) {
      setNoticeTone("info");
      setSuccessNotice("这条组局邀约还没有可回跳的会话。");
      return;
    }

    void navigate({ to: path });
    setNoticeTone("success");
    setSuccessNotice(title ? `正在回到 ${title}。` : "正在回到最近投递的会话。");
  }

  async function handleCopyInviteToMobile(activityId: string) {
    const activity = gameCenterFriendActivities.find((item) => item.id === activityId);
    if (!activity) {
      return;
    }

    const game = getGameCenterGame(activity.gameId);
    const path = `/discover/games?game=${activity.gameId}&invite=${activity.id}`;
    const link = resolveMobileHandoffLink(path);

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${activity.friendName} 的组局邀约`,
        text: `${activity.friendName} 正在玩 ${game?.name ?? "当前游戏"}，邀请你一起玩。\n${link}`,
        url: link,
      });

      if (shared) {
        setNoticeTone("success");
        setSuccessNotice("已打开系统分享面板。");
        return;
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setNoticeTone("info");
        setSuccessNotice("当前设备暂时无法打开系统分享，请稍后重试。");
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        applyFriendInvite(activityId, "invited");
        setSelectedGameId(activity.gameId);
        setNoticeTone("success");
        setSuccessNotice("系统分享暂时不可用，已复制组局链接。");
      } catch {
        setNoticeTone("info");
        setSuccessNotice("系统分享失败，请稍后重试。");
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
        setSuccessNotice("当前环境暂不支持复制组局链接。");
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        applyFriendInvite(activityId, "invited");
        setSelectedGameId(activity.gameId);
        setNoticeTone("success");
        setSuccessNotice("组局链接已复制。");
      } catch {
        setNoticeTone("info");
        setSuccessNotice("复制组局链接失败，请稍后重试。");
      }
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setSuccessNotice("当前环境暂不支持复制到手机。");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      applyFriendInvite(activityId, "invited");
      setSelectedGameId(activity.gameId);
      pushMobileHandoffRecord({
        description: `${activity.friendName} 正在玩 ${game?.name ?? "当前游戏"}，把这条组局邀约发到手机继续跟进。`,
        label: `${activity.friendName} 组局邀约`,
        path,
      });
      setNoticeTone("success");
      setSuccessNotice(`已把 ${activity.friendName} 的组局邀约复制到手机。`);
    } catch {
      setNoticeTone("info");
      setSuccessNotice("复制到手机失败，请稍后重试。");
    }
  }

  async function handleCopyGameToMobile(gameId: string) {
    const game = getGameCenterGame(gameId);
    const path = buildGameInvitePath("/discover/games", { gameId });
    const link = resolveMobileHandoffLink(path);

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${game?.name ?? "游戏中心"} 入口`,
        text: `${game?.name ?? "游戏中心"}\n${link}`,
        url: link,
      });

      if (shared) {
        setNoticeTone("success");
        setSuccessNotice("已打开系统分享面板。");
        return;
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setNoticeTone("info");
        setSuccessNotice("当前设备暂时无法打开系统分享，请稍后重试。");
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        setNoticeTone("success");
        setSuccessNotice("系统分享暂时不可用，已复制入口链接。");
      } catch {
        setNoticeTone("info");
        setSuccessNotice("系统分享失败，请稍后重试。");
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
        setSuccessNotice("当前环境暂不支持复制入口链接。");
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        setNoticeTone("success");
        setSuccessNotice("入口链接已复制。");
      } catch {
        setNoticeTone("info");
        setSuccessNotice("复制入口链接失败，请稍后重试。");
      }
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setSuccessNotice("当前环境暂不支持复制到手机。");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      pushMobileHandoffRecord({
        description: `把 ${game?.name ?? "游戏中心"} 的入口发到手机继续，保留最近玩过和活动状态。`,
        label: `${game?.name ?? "游戏中心"} 接力`,
        path,
      });
      setNoticeTone("success");
      setSuccessNotice(`${game?.name ?? "该游戏"} 已复制到手机接力链接。`);
    } catch {
      setNoticeTone("info");
      setSuccessNotice("复制到手机失败，请稍后重试。");
    }
  }

  if (isDesktopLayout) {
    return (
      <DesktopGamesWorkspace
        activeCategory={activeCategory}
        activeGameId={activeGameId}
        activeInviteActivityId={activeInviteActivityId}
        eventActionStatusById={eventActionStatusById}
        friendInviteSentAtByActivityId={friendInviteSentAtByActivityId}
        friendInviteStatusByActivityId={friendInviteStatusByActivityId}
        lastInviteConversationPathByActivityId={
          lastInviteConversationPathByActivityId
        }
        lastInviteConversationTitleByActivityId={
          lastInviteConversationTitleByActivityId
        }
        inviteConversationCandidates={inviteConversationCandidates}
        inviteConversationCandidatesLoading={conversationsQuery.isLoading}
        launchCountById={launchCountById}
        pinnedGameIds={pinnedGameIds}
        recentGameIds={recentGameIds}
        selectedGameId={selectedGameId}
        lastOpenedAtById={lastOpenedAtById}
        successNotice={successNotice}
        noticeTone={noticeTone}
        onCategoryChange={setActiveCategory}
        onCompleteEventAction={handleCompleteEventAction}
        onCopyInviteToMobile={handleCopyInviteToMobile}
        onOpenInviteToChat={handleOpenInviteToChat}
        onOpenDeliveredConversation={handleOpenDeliveredConversation}
        onSendInviteToConversation={handleSendInviteToConversation}
        onInviteFriend={handleInviteFriend}
        onCopyGameToMobile={handleCopyGameToMobile}
        onDismissActiveGame={dismissActiveGame}
        onLaunchGame={handleLaunchGame}
        onSelectGame={setSelectedGameId}
        onTogglePinnedGame={handleTogglePinnedGame}
      />
    );
  }

  if (!selectedGame) {
    return null;
  }

  const selectedTone = getGameCenterToneStyle(selectedGame.tone);

  return (
    <AppPage className="space-y-0 px-0 pb-0 pt-0">
      <TabPageTopBar
        title="游戏"
        subtitle="最近在玩与组局推荐"
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
            size="sm"
            className="h-8 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3.5 text-[12px] font-medium text-[color:var(--text-primary)] hover:bg-white"
            onClick={() => void handleCopyGameToMobile(selectedGame.id)}
            aria-label={
              nativeMobileShareSupported ? "分享当前游戏" : "复制游戏入口"
            }
          >
            {nativeMobileShareSupported ? <Share2 size={15} /> : <Copy size={15} />}
            {nativeMobileShareSupported ? "系统分享" : "复制入口"}
          </Button>
        }
      />

      <div className="space-y-2.5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
      <section
        className={cn(
          "relative overflow-hidden rounded-[18px] p-4 shadow-none",
          selectedTone.heroCardClassName,
        )}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-10 top-0 h-36 w-36 rounded-full bg-white/12 blur-3xl" />
          <div className="absolute bottom-0 left-8 h-28 w-28 rounded-full bg-black/10 blur-3xl" />
        </div>
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex rounded-full border border-white/18 bg-white/12 px-2.5 py-1 text-[10px] font-medium tracking-[0.12em] text-white/82">
                {selectedGame.badge}
              </div>
              <div className="mt-3 text-[24px] font-semibold leading-tight text-white">
                {selectedGame.name}
              </div>
              <div className="mt-1.5 text-[13px] leading-[1.35rem] text-white/82">
                {selectedGame.slogan}
              </div>
            </div>
            <div className="rounded-[16px] border border-white/18 bg-white/12 px-3 py-2.5 text-right backdrop-blur-sm">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/68">
                热度
              </div>
              <div className="mt-1.5 text-[13px] font-medium leading-5 text-white">
                {selectedGame.playersLabel}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <MobileMetric label="好友在玩" value={selectedGame.friendsLabel} />
            <MobileMetric label="更新状态" value={selectedGame.updateNote} />
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {selectedGame.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/18 bg-white/10 px-2.5 py-1 text-[10px] text-white/82"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 flex gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => handleLaunchGame(selectedGame.id)}
              className="h-9 flex-1 border-white/18 bg-white px-3.5 text-[12px] text-[color:var(--text-primary)] hover:bg-white/92"
            >
              <Play size={16} />
              开始游戏
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => handleTogglePinnedGame(selectedGame.id)}
              className="h-9 border-white/18 bg-white/10 px-3 text-[12px] text-white hover:bg-white/18"
            >
              <Pin size={15} />
            </Button>
          </div>
        </div>
      </section>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {gameCenterCategoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveCategory(tab.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition",
              activeCategory === tab.id
                ? "bg-[#07c160] text-white"
                : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-secondary)]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {successNotice ? (
        <InlineNotice className="text-[12px] leading-5" tone={noticeTone}>
          {successNotice}
        </InlineNotice>
      ) : null}

      <GameCenterSessionPanel
        game={selectedGame}
        isActive={activeGameId === selectedGame.id}
        launchCount={launchCountById[selectedGame.id] ?? 0}
        lastOpenedAt={lastOpenedAtById[selectedGame.id]}
        compact
        onDismiss={activeGameId === selectedGame.id ? dismissActiveGame : undefined}
        onCopyToMobile={handleCopyGameToMobile}
        copyActionIcon={
          nativeMobileShareSupported ? <Share2 size={16} /> : <Copy size={16} />
        }
        copyActionLabel={nativeMobileShareSupported ? "系统分享" : "复制入口"}
        onLaunch={handleLaunchGame}
      />

      <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--text-primary)]">
          <Clock3 size={15} className="text-[#15803d]" />
          最近玩过
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-0.5">
          {recentGames.map((game) => {
            const tone = getGameCenterToneStyle(game.tone);
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => setSelectedGameId(game.id)}
                className={cn(
                  "w-[210px] shrink-0 rounded-[18px] border px-3.5 py-3.5 text-left shadow-none",
                  tone.mutedPanelClassName,
                )}
              >
                <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                  {game.name}
                </div>
                <div className="mt-1 text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
                  {game.slogan}
                </div>
                <div className="mt-2 text-[10px] text-[color:var(--text-muted)]">
                  {lastOpenedAtById[game.id]
                    ? `上次打开 ${formatConversationTimestamp(lastOpenedAtById[game.id])}`
                    : "尚未打开"}
                </div>
              </button>
            );
          })}
        </div>
      </AppSection>

      <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--text-primary)]">
          <UsersRound size={15} className="text-[#15803d]" />
          好友在玩
        </div>
        <div className="space-y-2.5">
          {gameCenterFriendActivities.map((activity) => {
            const game = getGameCenterGame(activity.gameId);
            if (!game) {
              return null;
            }

            return (
              <div
                key={activity.id}
                className="flex w-full items-start gap-3 rounded-[18px] border border-[color:var(--border-subtle)] bg-white px-3.5 py-3.5 text-left shadow-none"
              >
                <button
                  type="button"
                  onClick={() => setSelectedGameId(game.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <AvatarChip name={activity.friendName} src={activity.friendAvatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-[color:var(--text-primary)]">
                        {activity.friendName}
                      </span>
                      <span className="text-[10px] text-[color:var(--text-muted)]">
                        正在玩 {game.name}
                      </span>
                      {friendInviteStatusByActivityId[activity.id] ? (
                        <span className="rounded-full bg-[rgba(47,122,63,0.1)] px-2 py-0.5 text-[9px] text-[#2f7a3f]">
                          已邀约
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
                      {activity.status}
                    </div>
                    <div className="mt-1 text-[10px] text-[color:var(--text-dim)]">
                      {friendInviteSentAtByActivityId[activity.id]
                        ? `上次邀约 ${formatConversationTimestamp(friendInviteSentAtByActivityId[activity.id])} · ${formatTimestamp(activity.updatedAt)}`
                        : formatTimestamp(activity.updatedAt)}
                    </div>
                  </div>
                </button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleInviteFriend(activity.id)}
                  className="h-8 shrink-0 rounded-full px-3 text-[11px]"
                >
                  {friendInviteStatusByActivityId[activity.id]
                    ? "再邀一次"
                    : "邀请一起玩"}
                </Button>
              </div>
            );
          })}
        </div>
      </AppSection>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <MobileRankingSection
          title="热门榜"
          entries={gameCenterHotRankings}
          icon={<Flame size={16} className="text-[#15803d]" />}
          onSelectGame={setSelectedGameId}
        />
        <MobileRankingSection
          title="新游榜"
          entries={gameCenterNewRankings}
          icon={<Sparkles size={16} className="text-[#15803d]" />}
          onSelectGame={setSelectedGameId}
        />
      </div>

      <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--text-primary)]">
          <Play size={15} className="text-[#15803d]" />
          为你推荐
        </div>
        <div className="space-y-2.5">
          {mobileBrowseGames.map((game) => {
            const tone = getGameCenterToneStyle(game.tone);
            const pinned = pinnedGameIds.includes(game.id);
            return (
              <article
                key={game.id}
                className={cn(
                  "rounded-[18px] border px-3.5 py-3.5 shadow-none",
                  tone.mutedPanelClassName,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGameId(game.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[9px] font-medium",
                          tone.badgeClassName,
                        )}
                      >
                        {game.deckLabel}
                      </div>
                      {pinned ? (
                        <div className="rounded-full bg-[rgba(47,122,63,0.1)] px-2 py-0.5 text-[9px] text-[#2f7a3f]">
                          常玩
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2.5 text-[14px] font-semibold text-[color:var(--text-primary)]">
                      {game.name}
                    </div>
                    <div className="mt-1.5 text-[12px] leading-[1.35rem] text-[color:var(--text-secondary)]">
                      {game.description}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {game.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-white/84 px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleLaunchGame(game.id)}
                    className="h-8 shrink-0 rounded-full px-3 text-[11px]"
                  >
                    秒开
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </AppSection>

      <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--text-primary)]">
          <Gift size={15} className="text-[#15803d]" />
          福利活动
        </div>
        <div className="space-y-2.5">
          {gameCenterEvents.map((event) => {
            const tone = getGameCenterToneStyle(event.tone);
            const engaged = Boolean(eventActionStatusById[event.id]);
            return (
              <article
                key={event.id}
                className={cn(
                  "rounded-[18px] border px-3.5 py-3.5 shadow-none",
                  tone.mutedPanelClassName,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[13px] font-semibold text-[color:var(--text-primary)]">
                        {event.title}
                      </div>
                      {engaged ? (
                        <div className="rounded-full bg-white/84 px-2 py-0.5 text-[9px] text-[color:var(--text-muted)]">
                          {getGameCenterEventStatusLabel(event)}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-1.5 text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
                      {event.description}
                    </div>
                    <div className={cn("mt-1.5 text-[10px]", tone.softTextClassName)}>
                      {event.meta}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCompleteEventAction(event.id)}
                    className="h-8 rounded-full px-3 text-[11px]"
                  >
                    {getGameCenterEventActionLabel(event, engaged)}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </AppSection>
      </div>
    </AppPage>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/18 bg-white/10 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-white/68">
        {label}
      </div>
      <div className="mt-1.5 text-[13px] font-medium leading-5 text-white">
        {value}
      </div>
    </div>
  );
}

function MobileRankingSection({
  title,
  entries,
  icon,
  onSelectGame,
}: {
  title: string;
  entries: typeof gameCenterHotRankings;
  icon: ReactNode;
  onSelectGame: (gameId: string) => void;
}) {
  return (
    <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--text-primary)]">
        {icon}
        {title}
      </div>
      <div className="space-y-2.5">
        {entries.map((entry) => {
          const game = getGameCenterGame(entry.gameId);
          if (!game) {
            return null;
          }

          const tone = getGameCenterToneStyle(game.tone);

          return (
            <button
              key={`${title}-${entry.gameId}`}
              type="button"
              onClick={() => onSelectGame(entry.gameId)}
              className="flex w-full items-start gap-3 rounded-[18px] border border-[color:var(--border-subtle)] bg-[rgba(248,250,252,0.9)] px-3.5 py-3.5 text-left shadow-none"
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border text-[13px] font-semibold",
                  tone.badgeClassName,
                )}
              >
                {entry.rank}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                    {game.name}
                  </div>
                  {entry.rank === 1 ? (
                    <Trophy size={13} className="text-[#15803d]" />
                  ) : null}
                </div>
                <div className="mt-0.5 text-[10px] text-[color:var(--text-muted)]">
                  {game.playersLabel}
                </div>
                <div className="mt-1.5 text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
                  {entry.note}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </AppSection>
  );
}
