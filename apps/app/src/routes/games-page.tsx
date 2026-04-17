import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  dismissGameCenterActiveGame,
  getConversations,
  getGameCenterHome,
  launchGameCenterGame,
  sendGroupMessage,
  setGameCenterPinned,
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
  defaultGameCenterHomeResponse,
  getGameCenterEventActionLabel,
  getGameCenterGame,
  getGameCenterEventStatusLabel,
  getGameCenterToneStyle,
  type GameCenterCategoryId,
  type GameCenterFriendActivity,
  type GameCenterGame,
  type GameCenterPrimarySectionId,
  type GameCenterRankingEntry,
  type GameCenterShelf,
  type GameCenterStory,
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

function resolveGames(ids: string[], games: GameCenterGame[]) {
  return ids
    .map((id) => getGameCenterGame(id, games))
    .filter((game): game is GameCenterGame => Boolean(game));
}

function resolveShelfGames(shelf: GameCenterShelf, games: GameCenterGame[]) {
  return resolveGames(shelf.gameIds, games);
}

function resolveDefaultGameSelection(featuredGameIds: string[]) {
  return featuredGameIds[0] ?? "signal-squad";
}

function resolveGameInviteActivityFromSearch(
  search: unknown,
  friendActivities: GameCenterFriendActivity[],
) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  const inviteId = params.get("invite")?.trim();

  if (!inviteId) {
    return null;
  }

  return friendActivities.find((item) => item.id === inviteId) ?? null;
}

function resolveGameSelectionFromSearch(
  search: unknown,
  friendActivities: GameCenterFriendActivity[],
  games: GameCenterGame[],
) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  const inviteActivity = resolveGameInviteActivityFromSearch(
    search,
    friendActivities,
  );
  const gameId = inviteActivity?.gameId ?? params.get("game")?.trim() ?? "";

  return getGameCenterGame(gameId, games) ? gameId : null;
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
  const gameCenterHomeQuery = useQuery({
    queryKey: ["app-game-center-home", baseUrl],
    queryFn: () => getGameCenterHome(baseUrl),
  });
  const {
    eventActionStatusById,
    lastInviteConversationPathByActivityId,
    lastInviteConversationTitleByActivityId,
    friendInviteSentAtByActivityId,
    friendInviteStatusByActivityId,
    applyEventAction,
    applyFriendInvite,
    markInviteDelivered,
  } = useGameCenterState();
  const gameCenterHome = gameCenterHomeQuery.data ?? defaultGameCenterHomeResponse;
  const ownerState = gameCenterHome.ownerState;
  const activeGameId = ownerState.activeGameId ?? null;
  const categoryTabs = gameCenterHome.categoryTabs;
  const events = gameCenterHome.events;
  const featuredGameIds = gameCenterHome.featuredGameIds;
  const friendActivities = gameCenterHome.friendActivities;
  const games = gameCenterHome.games;
  const hotRankings = gameCenterHome.hotRankings;
  const newRankings = gameCenterHome.newRankings;
  const pinnedGameIds = ownerState.pinnedGameIds;
  const primarySections = gameCenterHome.primarySections;
  const recentGameIds = ownerState.recentGameIds;
  const launchCountById = ownerState.launchCountById;
  const lastOpenedAtById = ownerState.lastOpenedAtById;
  const shelves = gameCenterHome.shelves;
  const stories = gameCenterHome.stories;
  const [activeCategory, setActiveCategory] =
    useState<GameCenterCategoryId>("featured");
  const [activeSection, setActiveSection] =
    useState<GameCenterPrimarySectionId>("home");
  const selectedGameFromSearch = useMemo(
    () => resolveGameSelectionFromSearch(locationSearch, friendActivities, games),
    [friendActivities, games, locationSearch],
  );
  const inviteActivityFromSearch = useMemo(
    () => resolveGameInviteActivityFromSearch(locationSearch, friendActivities),
    [friendActivities, locationSearch],
  );
  const [selectedGameId, setSelectedGameId] = useState(
    selectedGameFromSearch ?? resolveDefaultGameSelection(featuredGameIds),
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
    if (!getGameCenterGame(selectedGameId, games)) {
      setSelectedGameId(resolveDefaultGameSelection(featuredGameIds));
    }
  }, [featuredGameIds, games, selectedGameId]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => {
    const nextSelectedGameId =
      selectedGameFromSearch ?? resolveDefaultGameSelection(featuredGameIds);

    setSelectedGameId((current) =>
      current === nextSelectedGameId ? current : nextSelectedGameId,
    );
  }, [featuredGameIds, selectedGameFromSearch]);

  useEffect(() => {
    if (inviteActivityFromSearch) {
      setNoticeTone("info");
      setSuccessNotice(
        `已带上 ${inviteActivityFromSearch.friendName} 的组局邀约，可继续查看 ${getGameCenterGame(inviteActivityFromSearch.gameId, games)?.name ?? "当前游戏"}。`,
      );
    }
  }, [games, inviteActivityFromSearch]);

  useEffect(() => {
    if (!primarySections.some((section) => section.id === activeSection)) {
      setActiveSection(primarySections[0]?.id ?? "home");
    }
  }, [activeSection, primarySections]);

  const featuredGames = resolveGames(featuredGameIds, games);
  const selectedGame =
    getGameCenterGame(selectedGameId, games) ?? featuredGames[0] ?? games[0];
  const mobileBrowseGames =
    activeCategory === "featured"
      ? games.slice(0, 5)
      : games.filter((game) => game.category === activeCategory);
  const pinnedGames = resolveGames(pinnedGameIds, games);
  const recentGames = resolveGames(recentGameIds, games);
  const totalLaunchCount = Object.values(launchCountById).reduce(
    (total, count) => total + count,
    0,
  );
  const mostPlayedGames = useMemo(
    () =>
      [...games]
        .sort(
          (left, right) =>
            (launchCountById[right.id] ?? 0) - (launchCountById[left.id] ?? 0),
        )
        .filter((game) => (launchCountById[game.id] ?? 0) > 0)
        .slice(0, 4),
    [games, launchCountById],
  );
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

  const launchGameMutation = useMutation({
    mutationFn: (gameId: string) => launchGameCenterGame(gameId, baseUrl),
    onSuccess: (nextOwnerState) => {
      queryClient.setQueryData<typeof defaultGameCenterHomeResponse>(
        ["app-game-center-home", baseUrl],
        (current) =>
          current
            ? {
                ...current,
                ownerState: nextOwnerState,
              }
            : {
                ...defaultGameCenterHomeResponse,
                ownerState: nextOwnerState,
              },
      );
    },
  });

  const togglePinnedMutation = useMutation({
    mutationFn: (input: { gameId: string; pinned: boolean }) =>
      setGameCenterPinned(input.gameId, input.pinned, baseUrl),
    onSuccess: (nextOwnerState) => {
      queryClient.setQueryData<typeof defaultGameCenterHomeResponse>(
        ["app-game-center-home", baseUrl],
        (current) =>
          current
            ? {
                ...current,
                ownerState: nextOwnerState,
              }
            : {
                ...defaultGameCenterHomeResponse,
                ownerState: nextOwnerState,
              },
      );
    },
  });

  const dismissActiveGameMutation = useMutation({
    mutationFn: () => dismissGameCenterActiveGame(baseUrl),
    onSuccess: (nextOwnerState) => {
      queryClient.setQueryData<typeof defaultGameCenterHomeResponse>(
        ["app-game-center-home", baseUrl],
        (current) =>
          current
            ? {
                ...current,
                ownerState: nextOwnerState,
              }
            : {
                ...defaultGameCenterHomeResponse,
                ownerState: nextOwnerState,
              },
      );
    },
  });

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

  async function handleLaunchGame(gameId: string) {
    const game = getGameCenterGame(gameId, games);
    try {
      await launchGameMutation.mutateAsync(gameId);
      setSelectedGameId(gameId);
      setNoticeTone("success");
      setSuccessNotice(
        `${game?.name ?? "该游戏"} 已加入最近玩过。首期先以游戏中心内容工作区承接，后续再接小游戏容器。`,
      );
    } catch {
      setNoticeTone("info");
      setSuccessNotice("写入游戏状态失败，请稍后重试。");
    }
  }

  async function handleTogglePinnedGame(gameId: string) {
    const game = getGameCenterGame(gameId, games);
    const pinned = pinnedGameIds.includes(gameId);
    try {
      await togglePinnedMutation.mutateAsync({
        gameId,
        pinned: !pinned,
      });
      setNoticeTone("success");
      setSuccessNotice(
        `${game?.name ?? "该游戏"} 已${pinned ? "取消固定常玩" : "固定到常玩"}。`,
      );
    } catch {
      setNoticeTone("info");
      setSuccessNotice("更新常玩状态失败，请稍后重试。");
    }
  }

  async function handleDismissActiveGame() {
    try {
      await dismissActiveGameMutation.mutateAsync();
      setNoticeTone("info");
      setSuccessNotice("已收起当前游戏会话。");
    } catch {
      setNoticeTone("info");
      setSuccessNotice("收起游戏会话失败，请稍后重试。");
    }
  }

  function handleCompleteEventAction(eventId: string) {
    const event = events.find((item) => item.id === eventId);
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
    const activity = friendActivities.find((item) => item.id === activityId);
    if (!activity) {
      return;
    }

    const game = getGameCenterGame(activity.gameId, games);
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
    activity: GameCenterFriendActivity,
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
    const activity = friendActivities.find((item) => item.id === activityId);
    const conversation = inviteConversationCandidates.find(
      (item) => item.id === conversationId,
    );

    if (!activity || !conversation) {
      return;
    }

    const game = getGameCenterGame(activity.gameId, games);
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
    const activity = friendActivities.find((item) => item.id === activityId);
    if (!activity) {
      return;
    }

    const game = getGameCenterGame(activity.gameId, games);
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
    const game = getGameCenterGame(gameId, games);
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
        activeSection={activeSection}
        activeCategory={activeCategory}
        activeGameId={activeGameId}
        activeInviteActivityId={activeInviteActivityId}
        categoryTabs={categoryTabs}
        eventActionStatusById={eventActionStatusById}
        events={events}
        friendActivities={friendActivities}
        friendInviteSentAtByActivityId={friendInviteSentAtByActivityId}
        friendInviteStatusByActivityId={friendInviteStatusByActivityId}
        games={games}
        hotRankings={hotRankings}
        lastInviteConversationPathByActivityId={
          lastInviteConversationPathByActivityId
        }
        lastInviteConversationTitleByActivityId={
          lastInviteConversationTitleByActivityId
        }
        inviteConversationCandidates={inviteConversationCandidates}
        inviteConversationCandidatesLoading={conversationsQuery.isLoading}
        launchCountById={launchCountById}
        newRankings={newRankings}
        pinnedGameIds={pinnedGameIds}
        primarySections={primarySections}
        recentGameIds={recentGameIds}
        selectedGameId={selectedGameId}
        shelves={shelves}
        stories={stories}
        lastOpenedAtById={lastOpenedAtById}
        successNotice={successNotice}
        noticeTone={noticeTone}
        onSectionChange={setActiveSection}
        onCategoryChange={setActiveCategory}
        onCompleteEventAction={handleCompleteEventAction}
        onCopyInviteToMobile={handleCopyInviteToMobile}
        onOpenInviteToChat={handleOpenInviteToChat}
        onOpenDeliveredConversation={handleOpenDeliveredConversation}
        onSendInviteToConversation={handleSendInviteToConversation}
        onInviteFriend={handleInviteFriend}
        onCopyGameToMobile={handleCopyGameToMobile}
        onDismissActiveGame={handleDismissActiveGame}
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

      <div className="space-y-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2.5">
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
                onClick={() => void handleLaunchGame(selectedGame.id)}
                className="h-9 flex-1 border-white/18 bg-white px-3.5 text-[12px] text-[color:var(--text-primary)] hover:bg-white/92"
              >
                <Play size={16} />
                开始游戏
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void handleTogglePinnedGame(selectedGame.id)}
                className="h-9 border-white/18 bg-white/10 px-3 text-[12px] text-white hover:bg-white/18"
              >
                <Pin size={15} />
              </Button>
            </div>
          </div>
        </section>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {primarySections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                activeSection === section.id
                  ? "bg-[#07c160] text-white"
                  : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-secondary)]",
              )}
            >
              {section.label}
            </button>
          ))}
        </div>

        {activeSection === "discover" ? (
          <div className="flex gap-1.25 overflow-x-auto pb-0.5">
            {categoryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-medium transition",
                  activeCategory === tab.id
                    ? "bg-[#07c160] text-white"
                    : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-secondary)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {successNotice ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone={noticeTone}
          >
            {successNotice}
          </InlineNotice>
        ) : null}

        {activeSection === "home" ? (
          <>
            <GameCenterSessionPanel
              game={selectedGame}
              isActive={activeGameId === selectedGame.id}
              launchCount={launchCountById[selectedGame.id] ?? 0}
              lastOpenedAt={lastOpenedAtById[selectedGame.id]}
              compact
              onDismiss={
                activeGameId === selectedGame.id
                  ? handleDismissActiveGame
                  : undefined
              }
              onCopyToMobile={handleCopyGameToMobile}
              copyActionIcon={
                nativeMobileShareSupported ? (
                  <Share2 size={16} />
                ) : (
                  <Copy size={16} />
                )
              }
              copyActionLabel={nativeMobileShareSupported ? "系统分享" : "复制入口"}
              onLaunch={handleLaunchGame}
            />

            <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
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
                      <div className="text-[13px] font-semibold text-[color:var(--text-primary)]">
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
              <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
                <UsersRound size={15} className="text-[#15803d]" />
                好友在玩
              </div>
              <div className="space-y-2">
                {friendActivities.map((activity) => {
                  const game = getGameCenterGame(activity.gameId, games);
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
                        <AvatarChip
                          name={activity.friendName}
                          src={activity.friendAvatar}
                        />
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

            <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
                <Gift size={15} className="text-[#15803d]" />
                福利活动
              </div>
              <div className="space-y-2">
                {events.map((event) => {
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
          </>
        ) : null}

        {activeSection === "discover" ? (
          <>
            {shelves.map((shelf) => (
              <AppSection
                key={shelf.id}
                className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none"
              >
                <div>
                  <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                    {shelf.title}
                  </div>
                  <div className="mt-1 text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
                    {shelf.description}
                  </div>
                </div>
                <div className="space-y-2">
                  {resolveShelfGames(shelf, games).map((game) => (
                    <MobileGameCard
                      key={`${shelf.id}-${game.id}`}
                      game={game}
                      pinned={pinnedGameIds.includes(game.id)}
                      onLaunch={handleLaunchGame}
                      onSelectGame={setSelectedGameId}
                    />
                  ))}
                </div>
              </AppSection>
            ))}

            <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
                <Play size={15} className="text-[#15803d]" />
                当前频道
              </div>
              <div className="space-y-2">
                {mobileBrowseGames.map((game) => (
                  <MobileGameCard
                    key={game.id}
                    game={game}
                    pinned={pinnedGameIds.includes(game.id)}
                    onLaunch={handleLaunchGame}
                    onSelectGame={setSelectedGameId}
                  />
                ))}
              </div>
            </AppSection>
          </>
        ) : null}

        {activeSection === "rankings" ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <MobileRankingSection
              title="热门榜"
              entries={hotRankings}
              games={games}
              icon={<Flame size={16} className="text-[#15803d]" />}
              onSelectGame={setSelectedGameId}
            />
            <MobileRankingSection
              title="新游榜"
              entries={newRankings}
              games={games}
              icon={<Sparkles size={16} className="text-[#15803d]" />}
              onSelectGame={setSelectedGameId}
            />
          </div>
        ) : null}

        {activeSection === "content" ? (
          <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
              <Sparkles size={15} className="text-[#15803d]" />
              看内容
            </div>
            <div className="space-y-2">
              {stories.map((story) => (
                <MobileStoryCard
                  key={story.id}
                  story={story}
                  games={games}
                  onSelectGame={setSelectedGameId}
                />
              ))}
            </div>
          </AppSection>
        ) : null}

        {activeSection === "mine" ? (
          <>
            <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
                <Pin size={15} className="text-[#15803d]" />
                我的游戏轨迹
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <MobileSummaryMetric label="常玩" value={String(pinnedGames.length)} />
                <MobileSummaryMetric label="最近" value={String(recentGames.length)} />
                <MobileSummaryMetric label="启动" value={String(totalLaunchCount)} />
              </div>
            </AppSection>

            <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                固定常玩
              </div>
              <div className="space-y-2">
                {pinnedGames.length ? (
                  pinnedGames.map((game) => (
                    <MobileGameCard
                      key={`mine-pinned-${game.id}`}
                      game={game}
                      pinned
                      onLaunch={handleLaunchGame}
                      onSelectGame={setSelectedGameId}
                    />
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[color:var(--border-subtle)] px-3.5 py-4 text-[11px] leading-[1.35rem] text-[color:var(--text-muted)]">
                    还没有固定常玩的游戏，可以从首页或找游戏里先固定几个入口。
                  </div>
                )}
              </div>
            </AppSection>

            <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                打开最多
              </div>
              <div className="space-y-2">
                {mostPlayedGames.length ? (
                  mostPlayedGames.map((game) => (
                    <button
                      key={`mine-launch-${game.id}`}
                      type="button"
                      onClick={() => setSelectedGameId(game.id)}
                      className="flex w-full items-center justify-between rounded-[18px] border border-[color:var(--border-subtle)] bg-white px-3.5 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                          {game.name}
                        </div>
                        <div className="mt-1 text-[10px] text-[color:var(--text-muted)]">
                          {lastOpenedAtById[game.id]
                            ? `最近打开 ${formatConversationTimestamp(lastOpenedAtById[game.id])}`
                            : "还没有最近打开记录"}
                        </div>
                      </div>
                      <div className="rounded-full bg-[rgba(47,122,63,0.1)] px-2.5 py-1 text-[10px] text-[#2f7a3f]">
                        {launchCountById[game.id] ?? 0} 次
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[color:var(--border-subtle)] px-3.5 py-4 text-[11px] leading-[1.35rem] text-[color:var(--text-muted)]">
                    还没有启动记录，先从上面的主推入口打开一局。
                  </div>
                )}
              </div>
            </AppSection>
          </>
        ) : null}
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

function MobileSummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border-subtle)] bg-white px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1.5 text-[15px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function MobileGameCard({
  game,
  pinned,
  onLaunch,
  onSelectGame,
}: {
  game: GameCenterGame;
  pinned: boolean;
  onLaunch: (gameId: string) => void | Promise<void>;
  onSelectGame: (gameId: string) => void;
}) {
  const tone = getGameCenterToneStyle(game.tone);

  return (
    <article
      className={cn(
        "rounded-[18px] border px-3.5 py-3.5 shadow-none",
        tone.mutedPanelClassName,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelectGame(game.id)}
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
          <div className="mt-2.5 text-[13px] font-semibold text-[color:var(--text-primary)]">
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
          onClick={() => onLaunch(game.id)}
          className="h-8 shrink-0 rounded-full px-3 text-[11px]"
        >
          秒开
        </Button>
      </div>
    </article>
  );
}

function MobileStoryCard({
  story,
  games,
  onSelectGame,
}: {
  story: GameCenterStory;
  games: GameCenterGame[];
  onSelectGame: (gameId: string) => void;
}) {
  const tone = getGameCenterToneStyle(story.tone);
  const relatedGame = story.relatedGameId
    ? getGameCenterGame(story.relatedGameId, games)
    : null;

  return (
    <article
      className={cn(
        "rounded-[18px] border px-3.5 py-3.5 shadow-none",
        tone.mutedPanelClassName,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[9px] font-medium",
                tone.badgeClassName,
              )}
            >
              {story.eyebrow}
            </span>
            <span className="text-[10px] text-[color:var(--text-muted)]">
              {formatTimestamp(story.publishedAt)}
            </span>
          </div>
          <div className="mt-2 text-[13px] font-semibold text-[color:var(--text-primary)]">
            {story.title}
          </div>
          <div className="mt-1.5 text-[12px] leading-[1.35rem] text-[color:var(--text-secondary)]">
            {story.description}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--text-muted)]">
            <span>{story.authorName}</span>
            {relatedGame ? (
              <button
                type="button"
                onClick={() => onSelectGame(relatedGame.id)}
                className="rounded-full bg-white/84 px-2 py-0.5 text-[#15803d]"
              >
                {relatedGame.name}
              </button>
            ) : null}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 shrink-0 rounded-full px-3 text-[11px]"
          onClick={() => relatedGame && onSelectGame(relatedGame.id)}
        >
          {story.ctaLabel}
        </Button>
      </div>
    </article>
  );
}

function MobileRankingSection({
  title,
  entries,
  games,
  icon,
  onSelectGame,
}: {
  title: string;
  entries: GameCenterRankingEntry[];
  games: GameCenterGame[];
  icon: ReactNode;
  onSelectGame: (gameId: string) => void;
}) {
  return (
    <AppSection className="space-y-3 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none">
      <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--text-primary)]">
        {icon}
        {title}
      </div>
      <div className="space-y-2">
        {entries.map((entry) => {
          const game = getGameCenterGame(entry.gameId, games);
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
