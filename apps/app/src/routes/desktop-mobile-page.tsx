import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  getConversations,
  getOfficialAccountArticle,
  getSystemStatus,
  listOfficialAccounts,
  type ConversationListItem,
  type OfficialAccountSummary,
} from "@yinjie/contracts";
import {
  BookOpenText,
  ArrowUpRight,
  Blocks,
  CheckCircle2,
  Copy,
  MessageSquareText,
  RefreshCw,
  RadioTower,
  Smartphone,
  Wifi,
} from "lucide-react";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { DesktopLayoutRequiredState } from "../components/desktop-layout-required-state";
import { EmptyState } from "../components/empty-state";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import { useLocalChatMessageActionState } from "../features/chat/local-chat-message-actions";
import {
  hydrateLiveCompanionFromNative,
  readLiveDraft,
  readLiveHistory,
  type LiveSessionRecord,
} from "../features/desktop/channels/live-companion-storage";
import {
  getMiniProgramEntry,
  getMiniProgramWorkspaceTasks,
  resolveMiniProgramEntries,
  type MiniProgramEntry,
} from "../features/mini-programs/mini-programs-data";
import {
  hydrateMiniProgramsStateFromNative,
  readMiniProgramsState,
} from "../features/mini-programs/mini-programs-storage";
import { DesktopUtilityShell } from "../features/desktop/desktop-utility-shell";
import {
  buildDesktopMobileCallHandoffHash,
  parseDesktopMobileCallHandoffHash,
} from "../features/desktop/chat/desktop-mobile-call-handoff-route-state";
import {
  buildDesktopMobileOfficialHandoffHash,
  type DesktopMobileOfficialHandoffState,
  parseDesktopMobileOfficialHandoffHash,
  resolveDesktopMobileOfficialHandoffPath,
} from "../features/desktop/official-accounts/desktop-mobile-official-handoff-route-state";
import {
  buildDesktopChatThreadPath,
  buildDesktopChatThreadPathFromConversationPath,
  buildDesktopOfficialServiceThreadPath,
  buildDesktopSubscriptionInboxPath,
} from "../features/desktop/chat/desktop-chat-route-state";
import { buildDesktopContactsRouteHash } from "../features/desktop/contacts/desktop-contacts-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { getConversationPreviewParts } from "../lib/conversation-preview";
import {
  hydrateMobileHandoffHistoryFromNative,
  pushMobileHandoffRecord,
  readMobileHandoffHistory,
  resolveMobileHandoffLink,
  type MobileHandoffRecord,
} from "../features/shell/mobile-handoff-storage";
import {
  formatConversationTimestamp,
  formatTimestamp,
  parseTimestamp,
} from "../lib/format";
import {
  getConversationThreadLabel,
  isPersistedGroupConversation,
} from "../lib/conversation-route";
import {
  hydrateGroupInviteDeliveryFromNative,
  readGroupInviteDeliveryRecord,
  readGroupInviteReopenRecords,
  type GroupInviteDeliveryRecord,
  type GroupInviteReopenRecord,
} from "../lib/group-invite-delivery";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type QuickEntry = {
  id: string;
  label: string;
  description: string;
  to: string;
  desktopTo?: string;
};

type MobileHandoffCategory =
  | "messages"
  | "group_invite"
  | "official"
  | "mini_program"
  | "games"
  | "channel"
  | "shortcut"
  | "other";

const mobileHandoffCategoryMeta: Array<{
  id: MobileHandoffCategory;
  label: string;
  description: string;
}> = [
  {
    id: "messages",
    label: "消息",
    description: "单聊、群聊和消息列表入口。",
  },
  {
    id: "group_invite",
    label: "群聊邀请",
    description: "群二维码、群邀请卡和群入口接力。",
  },
  {
    id: "official",
    label: "公众号",
    description: "公众号主页和文章阅读入口。",
  },
  {
    id: "mini_program",
    label: "小程序",
    description: "小程序工作台和最近使用入口。",
  },
  {
    id: "games",
    label: "游戏",
    description: "游戏中心、组局邀约和继续游玩入口。",
  },
  {
    id: "channel",
    label: "视频号 / 直播",
    description: "频道内容和直播接力入口。",
  },
  {
    id: "shortcut",
    label: "快捷入口",
    description: "通讯录、发现、设置等全局入口。",
  },
  {
    id: "other",
    label: "其他",
    description: "未归入主链路的补充接力入口。",
  },
];

const quickEntries: QuickEntry[] = [
  {
    id: "chat",
    label: "消息",
    description: "回到手机端消息列表，继续处理最近会话。",
    to: "/tabs/chat",
  },
  {
    id: "contacts",
    label: "通讯录",
    description: "在手机端继续查看联系人、星标朋友和公众号入口。",
    to: "/tabs/contacts",
  },
  {
    id: "discover",
    label: "发现",
    description: "切回手机端发现页，继续进入朋友圈与广场动态。",
    to: "/tabs/discover",
  },
  {
    id: "settings",
    label: "设置",
    description: "把资料编辑、API Key 和世界配置切到手机端继续处理。",
    to: "/profile/settings",
    desktopTo: "/desktop/settings",
  },
];

export function DesktopMobilePage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopHandoff = runtimeConfig.appPlatform === "desktop";
  const baseUrl = runtimeConfig.apiBaseUrl;
  const hash = useRouterState({ select: (state) => state.location.hash });
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerSignature = useWorldOwnerStore((state) => state.signature);
  const [notice, setNotice] = useState<string | null>(null);
  const [handoffHistory, setHandoffHistory] = useState<MobileHandoffRecord[]>(
    () => readMobileHandoffHistory(),
  );
  const [liveDraft, setLiveDraft] = useState(() => readLiveDraft());
  const [liveHistory, setLiveHistory] = useState<LiveSessionRecord[]>(() =>
    readLiveHistory(),
  );
  const [miniProgramsState, setMiniProgramsState] = useState(() =>
    readMiniProgramsState(),
  );
  const [currentGroupInviteDelivery, setCurrentGroupInviteDelivery] =
    useState<GroupInviteDeliveryRecord | null>(null);
  const [currentGroupInviteReopens, setCurrentGroupInviteReopens] = useState<
    GroupInviteReopenRecord[]
  >([]);
  const localMessageActionState = useLocalChatMessageActionState();
  const callHandoffState = useMemo(
    () => parseDesktopMobileCallHandoffHash(hash),
    [hash],
  );
  const officialHandoffState = useMemo(
    () => parseDesktopMobileOfficialHandoffHash(hash),
    [hash],
  );

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: isDesktopLayout,
  });

  const officialAccountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
    enabled: isDesktopLayout,
  });
  const officialHandoffArticleQuery = useQuery({
    queryKey: [
      "desktop-mobile-official-handoff-article",
      baseUrl,
      officialHandoffState?.articleId,
    ],
    queryFn: () => getOfficialAccountArticle(officialHandoffState!.articleId!, baseUrl),
    enabled: isDesktopLayout && Boolean(officialHandoffState?.articleId),
    retry: false,
  });

  const systemStatusQuery = useQuery({
    queryKey: ["desktop-mobile-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    enabled: isDesktopLayout,
  });

  const recentConversations = useMemo(
    () =>
      [...(conversationsQuery.data ?? [])]
        .sort(
          (left, right) =>
            (parseTimestamp(right.lastActivityAt) ?? 0) -
            (parseTimestamp(left.lastActivityAt) ?? 0),
        )
        .slice(0, 4),
    [conversationsQuery.data],
  );
  const conversationPathSet = useMemo(
    () =>
      new Set(
        (conversationsQuery.data ?? []).map((conversation) =>
          isPersistedGroupConversation(conversation)
            ? `/group/${conversation.id}`
            : `/chat/${conversation.id}`,
        ),
      ),
    [conversationsQuery.data],
  );
  const conversationDesktopPathMap = useMemo(
    () =>
      new Map(
        (conversationsQuery.data ?? []).map((conversation) => [
          isPersistedGroupConversation(conversation)
            ? `/group/${conversation.id}`
            : `/chat/${conversation.id}`,
          buildDesktopChatThreadPath({
            conversationId: conversation.id,
          }),
        ]),
      ),
    [conversationsQuery.data],
  );

  const recentArticles = useMemo(
    () =>
      (officialAccountsQuery.data ?? [])
        .filter((account) => account.recentArticle)
        .sort(
          (left, right) =>
            (parseTimestamp(right.recentArticle?.publishedAt) ?? 0) -
            (parseTimestamp(left.recentArticle?.publishedAt) ?? 0),
        )
        .slice(0, 4),
    [officialAccountsQuery.data],
  );
  const callHandoffConversation = useMemo(() => {
    if (!callHandoffState) {
      return null;
    }

    return (
      (conversationsQuery.data ?? []).find((conversation) => {
        if (conversation.id !== callHandoffState.conversationId) {
          return false;
        }

        return callHandoffState.conversationType === "group"
          ? isPersistedGroupConversation(conversation)
          : !isPersistedGroupConversation(conversation);
      }) ?? null
    );
  }, [callHandoffState, conversationsQuery.data]);
  const callHandoffConversationExists = Boolean(callHandoffConversation);
  const callHandoffMobilePath = callHandoffConversation
    ? isPersistedGroupConversation(callHandoffConversation)
      ? `/group/${callHandoffConversation.id}`
      : `/chat/${callHandoffConversation.id}`
    : callHandoffState
      ? callHandoffState.conversationType === "group"
        ? `/group/${callHandoffState.conversationId}`
        : `/chat/${callHandoffState.conversationId}`
      : null;
  const callHandoffDesktopPath = callHandoffConversation
    ? buildDesktopChatThreadPath({
        conversationId: callHandoffConversation.id,
      })
    : callHandoffState
      ? buildDesktopChatThreadPath({
          conversationId: callHandoffState.conversationId,
        })
      : null;
  const callHandoffKindLabel = callHandoffState
    ? callHandoffState.kind === "video"
      ? "视频通话"
      : "语音通话"
    : "";
  const officialHandoffAccountId =
    officialHandoffArticleQuery.data?.account.id ?? officialHandoffState?.accountId;

  useEffect(() => {
    if (!isDesktopLayout || !callHandoffState || !callHandoffConversation) {
      return;
    }

    const nextHash = buildDesktopMobileCallHandoffHash({
      kind: callHandoffState.kind,
      conversationId: callHandoffConversation.id,
      conversationType: isPersistedGroupConversation(callHandoffConversation)
        ? "group"
        : "direct",
      title: callHandoffConversation.title,
    });
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (normalizedHash === nextHash) {
      return;
    }

    void navigate({
      to: "/desktop/mobile",
      hash: nextHash,
      replace: true,
    });
  }, [
    callHandoffConversation,
    callHandoffState,
    hash,
    isDesktopLayout,
    navigate,
  ]);

  useEffect(() => {
    if (!nativeDesktopHandoff) {
      return;
    }

    let cancelled = false;

    async function hydrateHandoffHistory() {
      const history = await hydrateMobileHandoffHistoryFromNative();
      if (cancelled) {
        return;
      }

      setHandoffHistory(history);
    }

    void hydrateHandoffHistory();

    return () => {
      cancelled = true;
    };
  }, [nativeDesktopHandoff]);

  useEffect(() => {
    if (!isDesktopLayout || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const syncLiveCompanionState = async () => {
      const store = await hydrateLiveCompanionFromNative();
      if (cancelled) {
        return;
      }

      setLiveDraft(store.draft);
      setLiveHistory(store.history);
    };

    const handleFocus = () => {
      void syncLiveCompanionState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncLiveCompanionState();
      }
    };

    void syncLiveCompanionState();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isDesktopLayout]);

  useEffect(() => {
    if (!isDesktopLayout || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const syncMiniProgramsState = async () => {
      const nextMiniProgramsState = await hydrateMiniProgramsStateFromNative();
      if (cancelled) {
        return;
      }

      setMiniProgramsState(nextMiniProgramsState);
    };

    const handleFocus = () => {
      void syncMiniProgramsState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncMiniProgramsState();
      }
    };

    void syncMiniProgramsState();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isDesktopLayout]);
  const callHandoffTitle =
    callHandoffConversation?.title?.trim() ||
    callHandoffState?.title?.trim() ||
    (callHandoffState?.conversationType === "group" ? "当前群聊" : "当前聊天");
  const officialHandoffAccount = useMemo(
    () =>
      officialHandoffAccountId
        ? ((officialAccountsQuery.data ?? []).find(
            (account) => account.id === officialHandoffAccountId,
          ) ?? null)
        : null,
    [officialAccountsQuery.data, officialHandoffAccountId],
  );
  const officialHandoffArticleMissing = isOfficialAccountArticleMissingError(
    officialHandoffArticleQuery.error,
  );
  const resolvedOfficialHandoffState = useMemo(() => {
    if (!officialHandoffState) {
      return null;
    }

    if (officialHandoffArticleQuery.data) {
      return {
        surface: officialHandoffState.surface,
        accountId: officialHandoffArticleQuery.data.account.id,
        articleId: officialHandoffArticleQuery.data.id,
        accountName: officialHandoffArticleQuery.data.account.name,
        articleTitle: officialHandoffArticleQuery.data.title,
        accountType: officialHandoffArticleQuery.data.account.accountType,
      } as DesktopMobileOfficialHandoffState;
    }

    if (officialHandoffState.articleId && officialHandoffArticleMissing) {
      if (officialHandoffState.surface === "subscription") {
        return {
          surface: "subscription",
        } as DesktopMobileOfficialHandoffState;
      }

      if (!officialHandoffAccount) {
        return null;
      }

      return {
        surface: officialHandoffState.surface,
        accountId: officialHandoffAccount.id,
        accountName: officialHandoffAccount.name,
        accountType: officialHandoffAccount.accountType,
      } as DesktopMobileOfficialHandoffState;
    }

    if (
      !officialHandoffState.articleId &&
      officialHandoffState.surface !== "subscription" &&
      officialHandoffState.accountId &&
      !officialHandoffAccount &&
      !officialAccountsQuery.isLoading &&
      !officialAccountsQuery.isError
    ) {
      return null;
    }

    if (officialHandoffAccount) {
      return {
        ...officialHandoffState,
        accountId: officialHandoffAccount.id,
        accountName: officialHandoffAccount.name,
        accountType: officialHandoffAccount.accountType,
      } as DesktopMobileOfficialHandoffState;
    }

    return officialHandoffState;
  }, [
    officialAccountsQuery.isError,
    officialAccountsQuery.isLoading,
    officialHandoffAccount,
    officialHandoffArticleMissing,
    officialHandoffArticleQuery.data,
    officialHandoffState,
  ]);
  const officialHandoffPath = resolvedOfficialHandoffState
    ? resolveDesktopMobileOfficialHandoffPath(resolvedOfficialHandoffState)
    : null;
  const officialHandoffTitle =
    resolvedOfficialHandoffState?.articleTitle?.trim() ||
    officialHandoffAccount?.name ||
    resolvedOfficialHandoffState?.accountName?.trim() ||
    "公众号";
  const officialHandoffTypeLabel = resolvedOfficialHandoffState?.articleId
    ? "公众号文章"
    : resolvedOfficialHandoffState?.surface === "service"
      ? "服务号消息"
      : resolvedOfficialHandoffState?.surface === "subscription"
        ? "订阅号消息"
        : resolvedOfficialHandoffState?.accountType === "service"
          ? "服务号主页"
          : "公众号主页";
  const officialHandoffDescription = resolvedOfficialHandoffState
    ? resolvedOfficialHandoffState.articleId
      ? `把 ${officialHandoffTitle} 发到手机继续阅读。`
      : resolvedOfficialHandoffState.surface === "service"
        ? `把 ${officialHandoffTitle} 的服务消息入口带到手机继续。`
        : resolvedOfficialHandoffState.surface === "subscription"
          ? "把当前订阅号聚合阅读入口带到手机继续。"
          : `把 ${officialHandoffTitle} 的公众号主页带到手机继续查看。`
    : "";
  const activeLiveSession =
    liveHistory.find((item) => item.status === "live") ?? null;
  const activeMiniProgram = miniProgramsState.activeMiniProgramId
    ? getMiniProgramEntry(miniProgramsState.activeMiniProgramId)
    : null;
  const recentMiniPrograms = resolveMiniProgramEntries(
    miniProgramsState.recentMiniProgramIds,
  ).slice(0, 4);

  const syncTimestamp = useMemo(() => {
    const candidates = [
      systemStatusQuery.data?.scheduler.lastWorldSnapshotAt,
      systemStatusQuery.data?.inferenceGateway.lastSuccessAt,
      recentConversations[0]?.lastActivityAt,
      recentArticles[0]?.recentArticle?.publishedAt,
    ]
      .map((value) => parseTimestamp(value))
      .filter((value): value is number => value !== null);

    if (!candidates.length) {
      return null;
    }

    return new Date(Math.max(...candidates)).toISOString();
  }, [recentArticles, recentConversations, systemStatusQuery.data]);

  const connectedLabel = systemStatusQuery.data?.coreApi.healthy
    ? "已连接"
    : "待检查";
  const syncLabel = syncTimestamp ? formatTimestamp(syncTimestamp) : "暂无记录";
  const activeHandoffHistory = useMemo(
    () =>
      handoffHistory.filter((item) =>
        isDesktopMobileHandoffPathActive(item.path, conversationPathSet),
      ),
    [conversationPathSet, handoffHistory],
  );
  const handoffLabel = activeHandoffHistory[0]
    ? formatTimestamp(activeHandoffHistory[0].sentAt)
    : "还没有发送记录";
  const groupedHandoffHistory = useMemo(
    () =>
      mobileHandoffCategoryMeta
        .map((group) => ({
          ...group,
          items: activeHandoffHistory.filter(
            (item) => resolveMobileHandoffCategory(item) === group.id,
          ),
        }))
        .filter((group) => group.items.length),
    [activeHandoffHistory],
  );

  function handleOpenOfficialHandoffOnDesktop() {
    if (!resolvedOfficialHandoffState) {
      return;
    }

    if (
      resolvedOfficialHandoffState.surface === "service" &&
      resolvedOfficialHandoffState.accountId
    ) {
      void navigate({
        to: buildDesktopOfficialServiceThreadPath({
          accountId: resolvedOfficialHandoffState.accountId,
          articleId: resolvedOfficialHandoffState.articleId,
        }),
      });
      return;
    }

    if (resolvedOfficialHandoffState.surface === "subscription") {
      void navigate({
        to: buildDesktopSubscriptionInboxPath({
          articleId: resolvedOfficialHandoffState.articleId,
        }),
      });
      return;
    }

    void navigate({
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "official-accounts",
        accountId: resolvedOfficialHandoffState.accountId,
        articleId: resolvedOfficialHandoffState.articleId,
        officialMode: "accounts",
        showWorldCharacters: false,
      }),
    });
  }
  const recentGroupInviteHandoffs = useMemo(
    () =>
      activeHandoffHistory
        .filter((item) => resolveMobileHandoffCategory(item) === "group_invite")
        .slice(0, 3),
    [activeHandoffHistory],
  );
  const currentGroupInviteHandoff = recentGroupInviteHandoffs[0] ?? null;
  const archivedGroupInviteHandoffs = recentGroupInviteHandoffs.slice(1);
  const currentGroupInviteId = currentGroupInviteHandoff
    ? resolveGroupIdFromHandoffPath(currentGroupInviteHandoff.path)
    : null;
  const currentGroupInviteDesktopPath = currentGroupInviteHandoff
    ? resolveGroupInviteDesktopOpenPath(currentGroupInviteHandoff.path)
    : null;
  const activeGroupInviteDelivery =
    currentGroupInviteDelivery &&
    conversationPathSet.has(currentGroupInviteDelivery.conversationPath)
      ? currentGroupInviteDelivery
      : null;
  const activeGroupInviteDeliveryDesktopPath = activeGroupInviteDelivery
    ? conversationDesktopPathMap.get(activeGroupInviteDelivery.conversationPath) ??
      buildDesktopChatThreadPath({
        conversationId: activeGroupInviteDelivery.conversationId,
      })
    : null;
  const activeGroupInviteReopens = useMemo(
    () =>
      currentGroupInviteReopens.filter((record) =>
        conversationPathSet.has(record.conversationPath),
      ),
    [conversationPathSet, currentGroupInviteReopens],
  );
  const resolveGroupInviteDesktopConversationPath = (conversationPath: string) =>
    conversationDesktopPathMap.get(conversationPath) ??
    buildDesktopChatThreadPathFromConversationPath(conversationPath) ??
    conversationPath;

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    if (
      !callHandoffState ||
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      callHandoffConversationExists
    ) {
      return;
    }

    void navigate({
      to: "/desktop/mobile",
      hash: "",
      replace: true,
    });
  }, [
    callHandoffConversationExists,
    callHandoffState,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    isDesktopLayout,
    navigate,
  ]);

  useEffect(() => {
    if (!isDesktopLayout || !officialHandoffState) {
      return;
    }

    if (officialHandoffState.articleId && officialHandoffArticleQuery.isLoading) {
      return;
    }

    if (
      !officialHandoffState.articleId &&
      officialHandoffState.surface !== "subscription" &&
      officialHandoffState.accountId &&
      (officialAccountsQuery.isLoading || officialAccountsQuery.isError)
    ) {
      return;
    }

    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
    const nextHash = resolvedOfficialHandoffState
      ? buildDesktopMobileOfficialHandoffHash(resolvedOfficialHandoffState)
      : "";

    if (normalizedHash === nextHash) {
      return;
    }

    void navigate({
      to: "/desktop/mobile",
      hash: nextHash,
      replace: true,
    });
  }, [
    hash,
    isDesktopLayout,
    navigate,
    officialAccountsQuery.isError,
    officialAccountsQuery.isLoading,
    officialHandoffArticleQuery.isLoading,
    officialHandoffState,
    resolvedOfficialHandoffState,
  ]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    if (!currentGroupInviteId) {
      setCurrentGroupInviteDelivery(null);
      setCurrentGroupInviteReopens([]);
      return;
    }

    let cancelled = false;

    const syncDelivery = async () => {
      await hydrateGroupInviteDeliveryFromNative();
      if (cancelled) {
        return;
      }

      setCurrentGroupInviteDelivery(
        readGroupInviteDeliveryRecord(currentGroupInviteId),
      );
      setCurrentGroupInviteReopens(
        readGroupInviteReopenRecords(currentGroupInviteId),
      );
    };

    void syncDelivery();

    const handleFocus = () => {
      void syncDelivery();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
    };
  }, [currentGroupInviteId, isDesktopLayout]);

  if (!isDesktopLayout) {
    return (
      <DesktopLayoutRequiredState
        title="手机接力当前仅提供桌面布局"
        description="手机接力面板目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到消息页继续处理会话。"
        actionLabel="返回消息"
        fallbackTo="/tabs/chat"
      />
    );
  }

  return (
    <DesktopUtilityShell
      title="手机接力"
      subtitle="把桌面内容带到移动端继续处理。"
      toolbar={
        <div className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
          {activeHandoffHistory.length} 条最近接力
        </div>
      }
      sidebarClassName="w-[300px]"
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-4 py-4 backdrop-blur-xl">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              手机接力
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              用当前世界的真实会话、公众号和运行状态做跨端继续。
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-4 py-4">
            <div className="space-y-4">
              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
                <div className="flex items-center gap-4">
                  <AvatarChip
                    name={ownerName ?? "世界主人"}
                    src={ownerAvatar}
                    size="xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      {ownerName ?? "世界主人"}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                      {ownerSignature?.trim() || "这台桌面端正在承接你的世界。"}
                    </div>
                  </div>
                </div>
              </div>

              <MetricCard label="连接状态" value={connectedLabel} />
              <MetricCard label="最近同步" value={syncLabel} />
              <MetricCard label="最近接力" value={handoffLabel} />

              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <div className="text-xs font-medium text-[color:var(--text-muted)]">
                  活跃接力链路
                </div>
                <div className="mt-3 space-y-2">
                  {groupedHandoffHistory.length ? (
                    groupedHandoffHistory.slice(0, 4).map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2.5"
                      >
                        <div className="text-xs text-[color:var(--text-secondary)]">
                          {group.label}
                        </div>
                        <div className="text-xs font-medium text-[color:var(--text-primary)]">
                          {group.items.length} 条
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-5 text-[color:var(--text-muted)]">
                      还没有形成稳定的手机接力记录。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      }
      contentClassName="bg-[rgba(255,255,255,0.62)]"
    >
      <div className="space-y-5 p-5">
        {notice ? (
          <InlineNotice
            tone="success"
            className="border-[color:var(--border-faint)] bg-white"
          >
            {notice}
          </InlineNotice>
        ) : null}

        {callHandoffState &&
        callHandoffMobilePath &&
        callHandoffDesktopPath &&
        callHandoffConversationExists ? (
          <section className="rounded-[18px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <RadioTower
                    size={16}
                    className="text-[color:var(--brand-primary)]"
                  />
                  <span>{callHandoffKindLabel}接力</span>
                </div>
                <div className="mt-2 text-sm text-[color:var(--text-primary)]">
                  把 <span className="font-medium">{callHandoffTitle}</span>{" "}
                  的通话入口带到手机继续。
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  桌面端先不假做本地通话，直接把当前聊天接力到手机，更贴近微信电脑端“到手机继续”的真实工作流。
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/desktop/mobile",
                    hash: "",
                    replace: true,
                  })
                }
                className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-white"
              >
                收起
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void handleCopyHandoff({
                    description: `从桌面把 ${callHandoffTitle} 的${callHandoffKindLabel}接力到手机继续。`,
                    label: `${callHandoffTitle} ${callHandoffKindLabel}`,
                    path: callHandoffMobilePath,
                    setHistory: setHandoffHistory,
                    setNotice,
                  })
                }
                className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
              >
                <Copy size={14} />
                复制到手机
              </Button>
              <Link
                to={callHandoffDesktopPath as never}
                className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              >
                桌面打开聊天
              </Link>
            </div>
          </section>
        ) : null}

        {resolvedOfficialHandoffState && officialHandoffPath ? (
          <section className="rounded-[18px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  {resolvedOfficialHandoffState.surface === "service" ? (
                    <MessageSquareText
                      size={16}
                      className="text-[color:var(--brand-primary)]"
                    />
                  ) : (
                    <BookOpenText
                      size={16}
                      className="text-[color:var(--brand-primary)]"
                    />
                  )}
                  <span>{officialHandoffTypeLabel}接力</span>
                </div>
                <div className="mt-2 text-sm text-[color:var(--text-primary)]">
                  把 <span className="font-medium">{officialHandoffTitle}</span>{" "}
                  带到手机继续。
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  {officialHandoffDescription}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/desktop/mobile",
                    hash: "",
                    replace: true,
                  })
                }
                className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-white"
              >
                收起
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void handleCopyHandoff({
                    description: officialHandoffDescription,
                    label: officialHandoffTitle,
                    path: officialHandoffPath,
                    setHistory: setHandoffHistory,
                    setNotice,
                  })
                }
                className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
              >
                <Copy size={14} />
                复制到手机
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenOfficialHandoffOnDesktop}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <ArrowUpRight size={14} />
                桌面回到当前工作区
              </Button>
            </div>
          </section>
        ) : null}

        {conversationsQuery.isError &&
        conversationsQuery.error instanceof Error ? (
          <ErrorBlock message={conversationsQuery.error.message} />
        ) : null}
        {officialAccountsQuery.isError &&
        officialAccountsQuery.error instanceof Error ? (
          <ErrorBlock message={officialAccountsQuery.error.message} />
        ) : null}
        {officialHandoffArticleQuery.isError &&
        !officialHandoffArticleMissing &&
        officialHandoffArticleQuery.error instanceof Error ? (
          <ErrorBlock message={officialHandoffArticleQuery.error.message} />
        ) : null}
        {systemStatusQuery.isError &&
        systemStatusQuery.error instanceof Error ? (
          <ErrorBlock message={systemStatusQuery.error.message} />
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Smartphone
                size={16}
                className="text-[color:var(--brand-primary)]"
              />
              <span>手机入口</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              常用手机端入口先固定在这里，点击即可复制深链接，发到手机后继续浏览。
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {quickEntries.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
                >
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {item.label}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                    {item.description}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        void handleCopyHandoff({
                          description: item.description,
                          label: item.label,
                          path: item.to,
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                      className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
                    >
                      <Copy size={14} />
                      复制到手机
                    </Button>
                    <Link
                      to={(item.desktopTo ?? item.to) as never}
                      className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                    >
                      桌面打开
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Wifi size={16} className="text-[color:var(--brand-primary)]" />
              <span>同步概览</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              这里不新造设备接口，先用当前世界的真实运行状态来判断手机接力是否值得继续。
            </div>

            {systemStatusQuery.isLoading ? (
              <div className="mt-4">
                <LoadingBlock label="正在检查同步状态..." />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <StatusRow
                  label="Core API"
                  value={
                    systemStatusQuery.data?.coreApi.healthy
                      ? "世界在线"
                      : "连接异常"
                  }
                />
                <StatusRow
                  label="数据库"
                  value={
                    systemStatusQuery.data?.database.connected
                      ? "已连接"
                      : "未连接"
                  }
                />
                <StatusRow
                  label="推理网关"
                  value={
                    systemStatusQuery.data?.inferenceGateway.healthy
                      ? "可用"
                      : "待恢复"
                  }
                />
                <StatusRow
                  label="世界主人"
                  value={`${systemStatusQuery.data?.worldSurface.ownerCount ?? 0} / 1`}
                />
                <StatusRow
                  label="最近快照"
                  value={
                    systemStatusQuery.data?.scheduler.lastWorldSnapshotAt
                      ? formatTimestamp(
                          systemStatusQuery.data.scheduler.lastWorldSnapshotAt,
                        )
                      : "暂无"
                  }
                />
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  最近会话
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  先按最近活跃会话做接力，桌面和手机之间切换会更顺。
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void conversationsQuery.refetch()}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <RefreshCw size={14} />
                刷新
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {conversationsQuery.isLoading ? (
                <LoadingBlock label="正在读取会话..." />
              ) : recentConversations.length ? (
                recentConversations.map((item) => {
                  const preview = getConversationPreviewParts(
                    item,
                    localMessageActionState,
                  );
                  const description = `${preview.prefix}${preview.text}`;

                  return (
                    <RecentConversationRow
                      key={item.id}
                      item={item}
                      description={description}
                      onCopy={() =>
                        void handleCopyHandoff({
                          description,
                          label: item.title,
                          path: isPersistedGroupConversation(item)
                            ? `/group/${item.id}`
                            : `/chat/${item.id}`,
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                    />
                  );
                })
              ) : (
                <EmptyState
                  title="还没有最近会话"
                  description="先回消息里产生一些对话，这里就会开始出现手机接力入口。"
                />
              )}
            </div>
          </section>

          <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  最近公众号内容
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  公众号阅读在手机上更顺手，这里直接复制最近文章或账号主页。
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void officialAccountsQuery.refetch()}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <RefreshCw size={14} />
                刷新
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {officialAccountsQuery.isLoading ? (
                <LoadingBlock label="正在读取公众号..." />
              ) : recentArticles.length ? (
                recentArticles.map((account) => (
                  <RecentArticleRow
                    key={account.id}
                    account={account}
                    onOpenAccount={() => {
                      void navigate({
                        to: "/tabs/contacts",
                        hash: buildDesktopContactsRouteHash({
                          pane: "official-accounts",
                          accountId: account.id,
                          officialMode: "accounts",
                          showWorldCharacters: false,
                        }),
                      });
                    }}
                    onOpenArticle={() => {
                      void navigate({
                        to: "/tabs/contacts",
                        hash: buildDesktopContactsRouteHash({
                          pane: "official-accounts",
                          accountId: account.id,
                          articleId: account.recentArticle?.id,
                          officialMode: "accounts",
                          showWorldCharacters: false,
                        }),
                      });
                    }}
                    onCopyAccount={() =>
                      void handleCopyHandoff({
                        description: "继续查看账号资料与最近推送。",
                        label: `${account.name} 主页`,
                        path: `/official-accounts/${account.id}`,
                        setHistory: setHandoffHistory,
                        setNotice,
                      })
                    }
                    onCopyArticle={() =>
                      void handleCopyHandoff({
                        description:
                          account.recentArticle?.summary ||
                          "继续阅读这篇公众号文章。",
                        label: account.recentArticle?.title ?? account.name,
                        path: `/official-accounts/articles/${account.recentArticle?.id}`,
                        setHistory: setHandoffHistory,
                        setNotice,
                      })
                    }
                  />
                ))
              ) : (
                <EmptyState
                  title="还没有最近文章"
                  description="等公众号有推送后，这里会直接出现可接力到手机的阅读入口。"
                />
              )}
            </div>
          </section>
        </div>

        <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                <Blocks
                  size={16}
                  className="text-[color:var(--brand-primary)]"
                />
                <span>小程序接力</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                桌面小程序面板里的当前工作台和最近使用，会从这里直接发到手机继续。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/tabs/mini-programs"
                className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              >
                打开小程序面板
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void hydrateMiniProgramsStateFromNative().then(
                    (nextMiniProgramsState) => {
                      setMiniProgramsState(nextMiniProgramsState);
                      setNotice(
                        nextMiniProgramsState.activeMiniProgramId
                          ? "已刷新小程序接力内容。"
                          : "小程序面板里还没有可同步到手机的最近使用。",
                      );
                    },
                  );
                }}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <RefreshCw size={14} />
                刷新
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                当前小程序工作台
              </div>
              {activeMiniProgram ? (
                <MiniProgramHandoffCard
                  miniProgram={activeMiniProgram}
                  launchCount={
                    miniProgramsState.launchCountById[activeMiniProgram.id] ?? 0
                  }
                  lastOpenedAt={
                    miniProgramsState.lastOpenedAtById[activeMiniProgram.id]
                  }
                  completedTaskCount={
                    getMiniProgramWorkspaceTasks(
                      activeMiniProgram.id,
                      miniProgramsState.completedTaskIdsByMiniProgramId[
                        activeMiniProgram.id
                      ] ?? [],
                    ).filter((task) => task.completed).length
                  }
                  totalTaskCount={
                    getMiniProgramWorkspaceTasks(
                      activeMiniProgram.id,
                      miniProgramsState.completedTaskIdsByMiniProgramId[
                        activeMiniProgram.id
                      ] ?? [],
                    ).length
                  }
                  pinned={miniProgramsState.pinnedMiniProgramIds.includes(
                    activeMiniProgram.id,
                  )}
                  buttonLabel="发当前工作台到手机"
                  onCopy={() =>
                    void handleCopyHandoff({
                      description: `${activeMiniProgram.name} 的当前工作台，带上最近使用和本地待办上下文。`,
                      label: `${activeMiniProgram.name} 接力`,
                      path: `/discover/mini-programs?miniProgram=${activeMiniProgram.id}`,
                      setHistory: setHandoffHistory,
                      setNotice,
                    })
                  }
                />
              ) : (
                <div className="mt-4">
                  <EmptyState
                    title="还没有当前小程序"
                    description="先在桌面小程序面板里打开一个入口，这里就会出现可接力到手机的工作台。"
                  />
                </div>
              )}
            </div>

            <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                最近使用小程序
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                最近在桌面打开过的小程序，会直接形成手机继续入口。
              </div>

              <div className="mt-4 space-y-3">
                {recentMiniPrograms.length ? (
                  recentMiniPrograms.map((miniProgram) => (
                    <MiniProgramHandoffCard
                      key={miniProgram.id}
                      miniProgram={miniProgram}
                      launchCount={
                        miniProgramsState.launchCountById[miniProgram.id] ?? 0
                      }
                      lastOpenedAt={
                        miniProgramsState.lastOpenedAtById[miniProgram.id]
                      }
                      completedTaskCount={
                        getMiniProgramWorkspaceTasks(
                          miniProgram.id,
                          miniProgramsState.completedTaskIdsByMiniProgramId[
                            miniProgram.id
                          ] ?? [],
                        ).filter((task) => task.completed).length
                      }
                      totalTaskCount={
                        getMiniProgramWorkspaceTasks(
                          miniProgram.id,
                          miniProgramsState.completedTaskIdsByMiniProgramId[
                            miniProgram.id
                          ] ?? [],
                        ).length
                      }
                      pinned={miniProgramsState.pinnedMiniProgramIds.includes(
                        miniProgram.id,
                      )}
                      buttonLabel="发到手机继续"
                      onCopy={() =>
                        void handleCopyHandoff({
                          description: `${miniProgram.name} 的当前工作台，带上最近使用和本地待办上下文。`,
                          label: `${miniProgram.name} 接力`,
                          path: `/discover/mini-programs?miniProgram=${miniProgram.id}`,
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                    />
                  ))
                ) : (
                  <EmptyState
                    title="还没有最近小程序"
                    description="先在桌面小程序面板里打开几个入口，这里就会开始出现可接力到手机的最近记录。"
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                <RadioTower
                  size={16}
                  className="text-[color:var(--brand-primary)]"
                />
                <span>直播接力</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                桌面直播伴侣里的准备稿和最近直播记录，会优先从这里发到手机继续跟进。
              </div>
            </div>
            <Link
              to="/desktop/channels/live-companion"
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
            >
              打开直播伴侣
            </Link>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                当前直播准备
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                {liveDraft.title.trim()
                  ? `${liveDraft.title} · ${liveDraft.topic || "未填写主题"}`
                  : "直播伴侣里还没有填写准备稿。"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
                <span>模式 {resolveLiveModeLabel(liveDraft.mode)}</span>
                <span>质量 {resolveLiveQualityLabel(liveDraft.quality)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!liveDraft.title.trim()}
                  onClick={() =>
                    void handleCopyHandoff({
                      description: liveDraft.topic.trim()
                        ? `${liveDraft.title} · ${liveDraft.topic}`
                        : `${liveDraft.title}，在手机上继续直播准备与内容导流。`,
                      label: liveDraft.title.trim() || "直播准备",
                      path: "/discover/channels",
                      setHistory: setHandoffHistory,
                      setNotice,
                    })
                  }
                  className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
                >
                  <Copy size={14} />
                  发准备到手机
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void hydrateLiveCompanionFromNative().then((store) => {
                      setLiveDraft(store.draft);
                      setLiveHistory(store.history);
                      setNotice(
                        store.history[0]?.title || store.draft.title.trim()
                          ? "已刷新直播接力内容。"
                          : "直播伴侣还没有可同步到手机的内容。",
                      );
                    });
                  }}
                  className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  <RefreshCw size={14} />
                  刷新直播状态
                </Button>
              </div>
            </div>

            <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                最近直播状态
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                {activeLiveSession
                  ? `${activeLiveSession.title} 正在直播，可在手机端继续关注频道动线。`
                  : liveHistory[0]
                    ? `${liveHistory[0].title} 已结束，可在手机端继续做频道跟进。`
                    : "还没有直播记录。"}
              </div>
              <div className="mt-3 text-[11px] text-[color:var(--text-muted)]">
                {activeLiveSession
                  ? `开播于 ${formatTimestamp(activeLiveSession.startedAt)}`
                  : liveHistory[0]?.startedAt
                    ? `最近开播于 ${formatTimestamp(liveHistory[0].startedAt)}`
                    : "先在直播伴侣里启动一场直播。"}
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!activeLiveSession && !liveHistory[0]}
                  onClick={() =>
                    void handleCopyHandoff({
                      description: activeLiveSession
                        ? `${activeLiveSession.title} 正在直播中，切到手机端继续查看频道表现。`
                        : `${liveHistory[0]?.title ?? "最近直播"} 已结束，切到手机端继续跟进频道内容。`,
                      label:
                        activeLiveSession?.title ??
                        liveHistory[0]?.title ??
                        "最近直播",
                      path: "/discover/channels",
                      setHistory: setHandoffHistory,
                      setNotice,
                    })
                  }
                  className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  <ArrowUpRight size={14} />
                  发直播状态到手机
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                <CheckCircle2
                  size={16}
                  className="text-[color:var(--brand-primary)]"
                />
                <span>群聊邀请接力</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                从群二维码页发到手机的邀请，会先集中展示在这里，方便继续发手机或回桌面群页。
              </div>
            </div>
            <div className="rounded-full bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
              {recentGroupInviteHandoffs.length} 条最近邀请
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {currentGroupInviteHandoff ? (
              <>
                <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium tracking-[0.14em] text-[color:var(--brand-primary)]">
                        当前群邀请
                      </div>
                      <div className="mt-2 text-base font-medium text-[color:var(--text-primary)]">
                        {currentGroupInviteHandoff.label}
                      </div>
                      <div className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {currentGroupInviteHandoff.description}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
                        <span>
                          最近发送于{" "}
                          {formatTimestamp(currentGroupInviteHandoff.sentAt)}
                        </span>
                        <span>已纳入手机接力固定入口</span>
                      </div>
                    </div>
                    <div className="rounded-full bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
                      群邀请入口
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        void handleCopyHandoff({
                          description: currentGroupInviteHandoff.description,
                          label: currentGroupInviteHandoff.label,
                          path: currentGroupInviteHandoff.path,
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                      className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
                    >
                      <Copy size={14} />
                      再发一次
                    </Button>
                    <Link
                      to={currentGroupInviteDesktopPath as never}
                      className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                    >
                      桌面打开
                    </Link>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white px-4 py-3">
                      {activeGroupInviteDelivery ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-[color:var(--text-primary)]">
                              最近投递到{" "}
                              {activeGroupInviteDelivery.conversationTitle}
                            </div>
                            <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                              {formatConversationTimestamp(
                                activeGroupInviteDelivery.deliveredAt,
                              )}
                            </div>
                          </div>
                          <Link
                            to={activeGroupInviteDeliveryDesktopPath as never}
                            className="inline-flex h-8 items-center justify-center rounded-[8px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 text-[11px] font-medium text-[color:var(--text-secondary)] transition hover:bg-white hover:text-[color:var(--text-primary)]"
                          >
                            回到会话
                          </Link>
                        </div>
                      ) : (
                        <div className="text-[11px] leading-5 text-[color:var(--text-muted)]">
                          这条群邀请还没有投递到聊天会话。去群二维码页发到最近会话后，这里会直接显示回跳入口。
                        </div>
                      )}
                    </div>

                    {activeGroupInviteReopens.length ? (
                      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white px-4 py-3">
                        <div className="text-xs font-medium text-[color:var(--text-primary)]">
                          最近从这些会话回到邀请页
                        </div>
                        <div className="mt-3 space-y-2">
                          {activeGroupInviteReopens
                            .slice(0, 2)
                            .map((record) => (
                              <div
                                key={`${record.conversationPath}:${record.reopenedAt}`}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[11px] font-medium text-[color:var(--text-primary)]">
                                    {record.conversationTitle}
                                  </div>
                                  <div className="mt-1 text-[10px] text-[color:var(--text-muted)]">
                                    回流于{" "}
                                    {formatConversationTimestamp(
                                      record.reopenedAt,
                                    )}
                                  </div>
                                </div>
                                <Link
                                  to={
                                    resolveGroupInviteDesktopConversationPath(
                                      record.conversationPath,
                                    ) as never
                                  }
                                  className="inline-flex h-7 items-center justify-center rounded-[8px] border border-[color:var(--border-faint)] bg-white px-3 text-[10px] font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                                >
                                  回到会话
                                </Link>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {archivedGroupInviteHandoffs.length ? (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-[color:var(--text-muted)]">
                      最近群邀请记录
                    </div>
                    {archivedGroupInviteHandoffs.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-4 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[color:var(--text-primary)]">
                            {item.label}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                            {item.description}
                          </div>
                          <div className="mt-2 text-[11px] text-[color:var(--text-muted)]">
                            最近发送于 {formatTimestamp(item.sentAt)}
                          </div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              void handleCopyHandoff({
                                description: item.description,
                                label: item.label,
                                path: item.path,
                                setHistory: setHandoffHistory,
                                setNotice,
                              })
                            }
                            className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                          >
                            <Copy size={14} />
                            再发一次
                          </Button>
                          <Link
                            to={resolveGroupInviteDesktopOpenPath(item.path) as never}
                            className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                          >
                            桌面打开
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="还没有群聊邀请接力"
                description="先去群二维码页发一条邀请到手机，这里就会变成固定入口。"
              />
            )}
          </div>
        </section>

        <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
            <CheckCircle2
              size={16}
              className="text-[color:var(--brand-primary)]"
            />
            <span>最近发往手机</span>
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            当前把手机接力记录按内容类型拆开，方便区分消息、群邀请、公众号、小程序和直播链路。
          </div>

          <div className="mt-4 space-y-5">
            {groupedHandoffHistory.length ? (
              groupedHandoffHistory.map((group) => (
                <section key={group.id} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {group.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                        {group.description}
                      </div>
                    </div>
                    <div className="rounded-full bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
                      {group.items.length} 条
                    </div>
                  </div>

                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[color:var(--text-primary)]">
                          {item.label}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                          {item.description}
                        </div>
                        <div className="mt-2 text-[11px] text-[color:var(--text-muted)]">
                          {formatTimestamp(item.sentAt)}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void handleCopyHandoff({
                            description: item.description,
                            label: item.label,
                            path: item.path,
                            setHistory: setHandoffHistory,
                            setNotice,
                          })
                        }
                        className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                      >
                        再发一次
                      </Button>
                    </div>
                  ))}
                </section>
              ))
            ) : (
              <EmptyState
                title="还没有手机接力记录"
                description="先从上面的入口或最近内容复制一个深链接，这里就会开始记录。"
              />
            )}
          </div>
        </section>
      </div>
    </DesktopUtilityShell>
  );
}

function RecentConversationRow({
  item,
  description,
  onCopy,
}: {
  item: ConversationListItem;
  description: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
      <div className="flex items-start gap-3">
        {isPersistedGroupConversation(item) ? (
          <GroupAvatarChip
            name={item.title}
            members={item.participants}
            size="wechat"
          />
        ) : (
          <AvatarChip name={item.title} src={item.avatar} size="wechat" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {item.title}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {getConversationThreadLabel(item)} ·{" "}
            {formatConversationTimestamp(item.lastActivityAt)}
          </div>
          <div className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {description}
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              onClick={onCopy}
              className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            >
              <Copy size={14} />
              发到手机继续
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentArticleRow({
  account,
  onOpenAccount,
  onOpenArticle,
  onCopyAccount,
  onCopyArticle,
}: {
  account: OfficialAccountSummary;
  onOpenAccount: () => void;
  onOpenArticle: () => void;
  onCopyAccount: () => void;
  onCopyArticle: () => void;
}) {
  if (!account.recentArticle) {
    return null;
  }

  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
      <div className="flex items-start gap-3">
        <AvatarChip name={account.name} src={account.avatar} size="wechat" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {account.recentArticle.title}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {account.name} ·{" "}
            {formatTimestamp(account.recentArticle.publishedAt)}
          </div>
          <div className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {account.recentArticle.summary}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={onCopyArticle}
              className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            >
              <Copy size={14} />
              发文章到手机
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenArticle}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <ArrowUpRight size={14} />
              桌面打开文章
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCopyAccount}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <ArrowUpRight size={14} />
              发主页到手机
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenAccount}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <ArrowUpRight size={14} />
              桌面打开主页
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniProgramHandoffCard({
  miniProgram,
  launchCount,
  lastOpenedAt,
  completedTaskCount,
  totalTaskCount,
  pinned,
  buttonLabel,
  onCopy,
}: {
  miniProgram: MiniProgramEntry;
  launchCount: number;
  lastOpenedAt?: string;
  completedTaskCount: number;
  totalTaskCount: number;
  pinned: boolean;
  buttonLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {miniProgram.name}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {miniProgram.deckLabel}
            {pinned ? " · 已加入我的小程序" : ""}
          </div>
        </div>
        <div className="rounded-full bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
          {launchCount} 次
        </div>
      </div>

      <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
        {miniProgram.openHint}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
        <span>
          待办 {completedTaskCount}/{totalTaskCount}
        </span>
        <span>
          {lastOpenedAt
            ? `上次打开 ${formatConversationTimestamp(lastOpenedAt)}`
            : "还没有打开过"}
        </span>
      </div>

      <div className="mt-4">
        <Button
          size="sm"
          onClick={onCopy}
          className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
        >
          <Copy size={14} />
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function resolveLiveModeLabel(mode: LiveSessionRecord["mode"]) {
  if (mode === "product") {
    return "产品讲解";
  }

  if (mode === "story") {
    return "剧情陪看";
  }

  return "单人控台";
}

function resolveLiveQualityLabel(quality: LiveSessionRecord["quality"]) {
  if (quality === "standard") {
    return "标准";
  }

  if (quality === "ultra") {
    return "超清";
  }

  return "高清";
}

function resolveMobileHandoffCategory(
  item: MobileHandoffRecord,
): MobileHandoffCategory {
  const normalizedPath = item.path.split(/[?#]/, 1)[0] ?? item.path;

  if (
    normalizedPath.startsWith("/group/") &&
    (item.label.endsWith("邀请") || item.description.includes("邀请"))
  ) {
    return "group_invite";
  }

  if (
    normalizedPath === "/chat/subscription-inbox" ||
    normalizedPath === "/contacts/official-accounts" ||
    normalizedPath.startsWith("/official-accounts")
  ) {
    return "official";
  }

  if (
    normalizedPath === "/tabs/chat" ||
    normalizedPath === "/chat" ||
    normalizedPath.startsWith("/chat/") ||
    normalizedPath.startsWith("/group/")
  ) {
    return "messages";
  }

  if (
    normalizedPath === "/tabs/mini-programs" ||
    normalizedPath === "/mini-programs" ||
    normalizedPath.startsWith("/discover/mini-programs")
  ) {
    return "mini_program";
  }

  if (
    normalizedPath === "/tabs/games" ||
    normalizedPath === "/games" ||
    normalizedPath.startsWith("/discover/games")
  ) {
    return "games";
  }

  if (
    normalizedPath === "/tabs/channels" ||
    normalizedPath === "/channels" ||
    normalizedPath.startsWith("/discover/channels") ||
    normalizedPath.startsWith("/desktop/channels")
  ) {
    return "channel";
  }

  if (
    normalizedPath === "/tabs/contacts" ||
    normalizedPath === "/contacts" ||
    normalizedPath === "/tabs/discover" ||
    normalizedPath === "/discover" ||
    normalizedPath === "/tabs/moments" ||
    normalizedPath === "/moments" ||
    normalizedPath.startsWith("/discover/moments") ||
    normalizedPath === "/tabs/feed" ||
    normalizedPath === "/feed" ||
    normalizedPath.startsWith("/discover/feed") ||
    normalizedPath === "/tabs/search" ||
    normalizedPath === "/search" ||
    normalizedPath === "/tabs/favorites" ||
    normalizedPath === "/favorites" ||
    normalizedPath === "/notes" ||
    normalizedPath === "/tabs/profile" ||
    normalizedPath === "/profile" ||
    normalizedPath === "/profile/settings" ||
    normalizedPath === "/desktop/settings" ||
    normalizedPath.startsWith("/legal/")
  ) {
    return "shortcut";
  }

  return "other";
}

function isDesktopMobileHandoffPathActive(
  path: string,
  conversationPathSet: ReadonlySet<string>,
) {
  const conversationRoot = resolveConversationRootPath(path);
  if (!conversationRoot) {
    return true;
  }

  return conversationPathSet.has(conversationRoot);
}

function resolveGroupIdFromHandoffPath(path: string) {
  const match = path.match(/^\/group\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function resolveGroupInviteDesktopOpenPath(path: string) {
  return buildDesktopChatThreadPathFromConversationPath(path) ?? path;
}

function resolveConversationRootPath(path: string) {
  const match = path.match(/^\/(chat|group)\/([^/?#]+)/);
  if (!match) {
    return null;
  }

  return `/${match[1]}/${match[2]}`;
}

async function handleCopyHandoff({
  description,
  label,
  path,
  setHistory,
  setNotice,
}: {
  description: string;
  label: string;
  path: string;
  setHistory: Dispatch<SetStateAction<MobileHandoffRecord[]>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
}) {
  const link = resolveMobileHandoffLink(path);

  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== "function"
  ) {
    setNotice("当前环境暂不支持复制手机接力链接。");
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    const nextHistory = pushMobileHandoffRecord({
      description,
      label,
      path,
    });
    setHistory(nextHistory);
    setNotice(`${label} 已复制到剪贴板，可发送到手机继续。`);
  } catch {
    setNotice("复制失败，请稍后重试。");
  }
}

function isOfficialAccountArticleMissingError(error: unknown) {
  return (
    error instanceof Error &&
    /文章不存在。?|official account article not found|article not found/i.test(
      error.message.trim(),
    )
  );
}
