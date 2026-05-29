import { msg } from "@lingui/macro";
import type { Dispatch, ReactNode, SetStateAction } from "react";
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
  buildDesktopOfficialServiceThreadPath,
  buildDesktopSubscriptionInboxPath,
  parseDesktopChatRouteHash,
} from "../features/desktop/chat/desktop-chat-route-state";
import {
  buildDesktopContactsRouteHash,
  parseDesktopContactsRouteState,
} from "../features/desktop/contacts/desktop-contacts-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  getConversationDisplayTitle,
  getConversationPreviewParts,
} from "../lib/conversation-preview";
import {
  hydrateMobileHandoffHistoryFromNative,
  pushMobileHandoffRecord,
  readMobileHandoffHistory,
  resolveMobileHandoffLink,
  type MobileHandoffCategory,
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
import { translateRuntimeMessage, useAppLocale } from "@yinjie/i18n";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type QuickEntry = {
  id: string;
  category: MobileHandoffCategory;
  label: string;
  description: string;
  to: string;
  desktopTo?: string;
};

const t = translateRuntimeMessage;

function getMobileHandoffCategoryMeta(): Array<{
  id: MobileHandoffCategory;
  label: string;
  description: string;
}> {
  return [
    {
      id: "messages",
      label: t(msg`消息`),
      description: t(msg`单聊、群聊和消息列表入口。`),
    },
    {
      id: "official",
      label: t(msg`公众号`),
      description: t(msg`公众号主页和文章阅读入口。`),
    },
    {
      id: "mini_program",
      label: t(msg`小程序`),
      description: t(msg`小程序工作台和最近使用入口。`),
    },
    {
      id: "games",
      label: t(msg`游戏`),
      description: t(msg`游戏中心、组局邀约和继续游玩入口。`),
    },
    {
      id: "channel",
      label: t(msg`视频号 / 直播`),
      description: t(msg`频道内容和直播接力入口。`),
    },
    {
      id: "shortcut",
      label: t(msg`快捷入口`),
      description: t(msg`通讯录、发现、设置等全局入口。`),
    },
    {
      id: "other",
      label: t(msg`其他`),
      description: t(msg`其它没归类的接力入口。`),
    },
  ];
}

function getQuickEntries(): QuickEntry[] {
  return [
    {
      id: "chat",
      category: "messages",
      label: t(msg`消息`),
      description: t(msg`回到手机端消息列表，继续处理最近会话。`),
      to: "/tabs/chat",
    },
    {
      id: "contacts",
      category: "shortcut",
      label: t(msg`通讯录`),
      description: t(msg`在手机端继续查看联系人、星标朋友和公众号入口。`),
      to: "/tabs/contacts",
    },
    {
      id: "discover",
      category: "shortcut",
      label: t(msg`发现`),
      description: t(msg`切回手机端发现页，继续进入朋友圈与广场动态。`),
      to: "/tabs/discover",
    },
    {
      id: "settings",
      category: "shortcut",
      label: t(msg`设置`),
      description: t(msg`把资料编辑、API Key 和世界配置切到手机端继续处理。`),
      to: "/profile/settings",
      desktopTo: "/desktop/settings",
    },
  ];
}

export function DesktopMobilePage() {
  const { locale } = useAppLocale();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopHandoff = runtimeConfig.appPlatform === "desktop";
  const baseUrl = runtimeConfig.apiBaseUrl;
  const hash = useRouterState({ select: (state) => state.location.hash });
  const mobileHandoffCategoryMeta = useMemo(
    () => getMobileHandoffCategoryMeta(),
    [locale],
  );
  const quickEntries = useMemo(() => getQuickEntries(), [locale]);
  const defaultOwnerName = t(msg`世界主人`);
  const defaultOwnerSignature = t(msg`这台桌面端正在承接你的世界。`);
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
  const localMessageActionState = useLocalChatMessageActionState();
  const callHandoffState = useMemo(
    () => parseDesktopMobileCallHandoffHash(hash),
    [hash],
  );
  const officialHandoffState = useMemo(
    () => parseDesktopMobileOfficialHandoffHash(hash),
    [hash],
  );

  // 走查电脑端群聊 R95：和姊妹 R94 system-status 同 batch 修复——本页 2 条
  // 共享 cache（app-conversations / app-official-accounts）漏 staleTime。
  // 「到手机继续」从群通话面板入口过来时，desktop-chat-workspace 早已带
  // staleTime: 15_000 拉过 app-conversations，公众号面板/详情页也带相同节奏
  // 拉过 app-official-accounts。本页 staleTime=0 → 即便 cache 几百 ms 前才
  // fresh 也立刻 refetch，handoff 页头部「最近会话 / 关注公众号」区段空着等
  // 公网 RTT 回包。和其它 desktop layout 入口 (chat-files / image-viewer /
  // window) 一批 conversations cache 对齐 15s。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: isDesktopLayout,
    staleTime: 15_000,
  });

  const officialAccountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
    enabled: isDesktopLayout,
    staleTime: 15_000,
  });
  const officialHandoffArticleQuery = useQuery({
    queryKey: [
      "desktop-mobile-official-handoff-article",
      baseUrl,
      officialHandoffState?.articleId,
    ],
    queryFn: () =>
      getOfficialAccountArticle(officialHandoffState!.articleId!, baseUrl),
    enabled: isDesktopLayout && Boolean(officialHandoffState?.articleId),
    retry: false,
  });

  // 走查电脑端群聊 R94：和姊妹 desktop-direct-call-panel R2 / mobile-ai-call-
  // screen / use-digital-human-entry-guard 三处一起把 GET /system-status
  // 统一到 ["app-system-status", baseUrl] cache（commit 在 R2 那条做的）—
  // 本页是「到手机继续」入口（群通话面板「到手机继续」按钮 / 单聊视频按钮 /
  // 公众号 handoff），原本仍用独立 key "desktop-mobile-system-status" → 用户
  // 从群通话面板点「到手机继续」过来时，desktop-direct-call-panel 几百 ms
  // 前刚拉过同 baseUrl 的 system status（带 staleTime: 30_000 fresh 着），
  // 这里又得在公网隧道再走一发；handoff 页头部「系统状态」区段空着等回包。
  // 统一到 app-system-status + 30s staleTime 与那三处对齐。
  const systemStatusQuery = useQuery({
    queryKey: ["app-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    enabled: isDesktopLayout,
    staleTime: 30_000,
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
        (conversationsQuery.data ?? []).flatMap((conversation) => {
          const legacyPath = isPersistedGroupConversation(conversation)
            ? `/group/${conversation.id}`
            : `/chat/${conversation.id}`;
          const desktopPath = buildDesktopChatThreadPath({
            conversationId: conversation.id,
          });

          return [legacyPath, desktopPath];
        }),
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
      ? t(msg`视频通话`)
      : t(msg`语音通话`)
    : "";
  const officialHandoffAccountId =
    officialHandoffArticleQuery.data?.account.id ??
    officialHandoffState?.accountId;

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
  // R21：和姊妹 ConversationCardLink / DirectChatDetailsPanel / 加好友预填关键词
  // / 搜索浮层一票 sentinel 漏翻同款 —— callHandoffConversation?.title 和
  // callHandoffState?.title 都直接来自服务端持久化的 ConversationEntity.title，
  // 可能是 normalizeLegacyConversationEntity 写入的字面量「未知联系人」/「Direct
  // conversation」。callHandoffTitle 拼进「把 ${title} 的通话入口带到手机继续。」
  // / 接力卡片 label / aria-label 等 3 处 EN/JA/KO locale 文案，用户把通话从桌面
  // 接力到手机时看到中文 sentinel 字面量塞在英文句子里。
  const callHandoffTitle =
    getConversationDisplayTitle(callHandoffConversation?.title?.trim() ?? "") ||
    getConversationDisplayTitle(callHandoffState?.title?.trim() ?? "") ||
    (callHandoffState?.conversationType === "group"
      ? t(msg`当前群聊`)
      : t(msg`当前聊天`));
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
    t(msg`公众号`);
  const officialHandoffTypeLabel = resolvedOfficialHandoffState?.articleId
    ? t(msg`公众号文章`)
    : resolvedOfficialHandoffState?.surface === "service"
      ? t(msg`服务号消息`)
      : resolvedOfficialHandoffState?.surface === "subscription"
        ? t(msg`订阅号消息`)
        : resolvedOfficialHandoffState?.accountType === "service"
          ? t(msg`服务号主页`)
          : t(msg`公众号主页`);
  const officialHandoffDescription = resolvedOfficialHandoffState
    ? resolvedOfficialHandoffState.articleId
      ? t(msg`把 ${officialHandoffTitle} 发到手机继续阅读。`)
      : resolvedOfficialHandoffState.surface === "service"
        ? t(msg`把 ${officialHandoffTitle} 的服务消息入口带到手机继续。`)
        : resolvedOfficialHandoffState.surface === "subscription"
          ? t(msg`把当前订阅号聚合阅读入口带到手机继续。`)
          : t(msg`把 ${officialHandoffTitle} 的公众号主页带到手机继续查看。`)
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
    ? t(msg`已连接`)
    : t(msg`待检查`);
  const syncLabel = syncTimestamp
    ? formatTimestamp(syncTimestamp)
    : t(msg`暂无记录`);
  const activeHandoffHistory = useMemo(
    () =>
      handoffHistory.filter((item) =>
        isDesktopMobileHandoffPathActive(item.path, conversationPathSet),
      ),
    [conversationPathSet, handoffHistory],
  );
  const handoffLabel = activeHandoffHistory[0]
    ? formatTimestamp(activeHandoffHistory[0].sentAt)
    : t(msg`还没有发送记录`);
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
    [activeHandoffHistory, mobileHandoffCategoryMeta],
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

    if (
      officialHandoffState.articleId &&
      officialHandoffArticleQuery.isLoading
    ) {
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

  if (!isDesktopLayout) {
    return (
      <DesktopLayoutRequiredState
        title={t(msg`手机接力当前仅提供桌面布局`)}
        description={t(
          msg`手机接力面板目前只在 Web 桌面布局和桌面应用内启用，移动布局先回到消息页继续处理会话。`,
        )}
        actionLabel={t(msg`返回消息`)}
        fallbackTo="/tabs/chat"
      />
    );
  }

  return (
    <div className="relative isolate flex h-full min-h-0 flex-1">
    <DesktopUtilityShell
      title={t(msg`手机接力`)}
      subtitle={t(msg`把桌面内容带到移动端继续处理。`)}
      toolbar={
        <div className="rounded-full border border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
          {t(msg`${activeHandoffHistory.length} 条最近接力`)}
        </div>
      }
      sidebarClassName="w-[300px]"
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-4 py-4 backdrop-blur-xl">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              {t(msg`手机接力`)}
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {t(msg`用当前世界的真实会话、公众号和运行状态做跨端继续。`)}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-4 py-4">
            <div className="space-y-4">
              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
                <div className="flex items-center gap-4">
                  <AvatarChip
                    name={ownerName ?? defaultOwnerName}
                    src={ownerAvatar}
                    size="xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      {ownerName ?? defaultOwnerName}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                      {ownerSignature?.trim() || defaultOwnerSignature}
                    </div>
                  </div>
                </div>
              </div>

              <MetricCard label={t(msg`连接状态`)} value={connectedLabel} />
              <MetricCard label={t(msg`最近同步`)} value={syncLabel} />
              <MetricCard label={t(msg`最近接力`)} value={handoffLabel} />

              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <div className="text-xs font-medium text-[color:var(--text-muted)]">
                  {t(msg`活跃接力`)}
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
                          {t(msg`${group.items.length} 条`)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-5 text-[color:var(--text-muted)]">
                      {t(msg`还没有形成稳定的手机接力记录。`)}
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
          // 走查电脑端群聊 R88：和姊妹 R86/R87 一批 transient toast 同款修法——
          // 「到手机继续」页（群通话面板入口）的 notice 是 2200ms 自动消失的反馈
          //（line ~833 useEffect），原版裸 InlineNotice 没 role / aria-live。
          // 盲人 SR 操作完听不到「已生成手机会话」/「已撤销...」等成功反馈。
          // polite 不抢断 SR，2.2s 内消失也来得及朗读完一条 toast。
          <InlineNotice
            role="status"
            aria-live="polite"
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
          <section className="rounded-[18px] border border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  <RadioTower
                    size={16}
                    className="text-[color:var(--brand-primary)]"
                  />
                  <span>{t(msg`${callHandoffKindLabel}接力`)}</span>
                </div>
                <div className="mt-2 text-sm text-[color:var(--text-primary)]">
                  {t(msg`把 ${callHandoffTitle} 的通话入口带到手机继续。`)}
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
                {t(msg`收起`)}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void handleCopyHandoff({
                    category: "messages",
                    description: t(
                      msg`从桌面把 ${callHandoffTitle} 的${callHandoffKindLabel}接力到手机继续。`,
                    ),
                    label: t(msg`${callHandoffTitle} ${callHandoffKindLabel}`),
                    path: callHandoffMobilePath,
                    setHistory: setHandoffHistory,
                    setNotice,
                  })
                }
                className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
              >
                <Copy size={14} />
                {t(msg`复制到手机`)}
              </Button>
              <Link
                to={callHandoffDesktopPath as never}
                className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              >
                {t(msg`桌面打开聊天`)}
              </Link>
            </div>
          </section>
        ) : null}

        {resolvedOfficialHandoffState && officialHandoffPath ? (
          <section className="rounded-[18px] border border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] p-5 shadow-[var(--shadow-section)]">
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
                  <span>{t(msg`${officialHandoffTypeLabel}接力`)}</span>
                </div>
                <div className="mt-2 text-sm text-[color:var(--text-primary)]">
                  {t(msg`把 ${officialHandoffTitle} 带到手机继续。`)}
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
                {t(msg`收起`)}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void handleCopyHandoff({
                    category: "official",
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
                {t(msg`复制到手机`)}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenOfficialHandoffOnDesktop}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <ArrowUpRight size={14} />
                {t(msg`桌面回到当前工作区`)}
              </Button>
            </div>
          </section>
        ) : null}

        {/* 走查电脑端群聊 R85：和姊妹 R83/R84 一批 ErrorBlock 同款 a11y——
            「到手机继续」页是群通话面板「到手机继续」按钮的目标页（也是单聊
            handoff 入口），4 处 ErrorBlock 都裸跑没 role / aria-live。盲人 SR
            打开本页若 conversations / officialAccounts / officialHandoffArticle /
            systemStatus 任一失败，会看到 loading 消失但听不到错误反馈，进不
            到下一步操作。挂 role="alert"。 */}
        {conversationsQuery.isError &&
        conversationsQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={conversationsQuery.error.message} />
        ) : null}
        {officialAccountsQuery.isError &&
        officialAccountsQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={officialAccountsQuery.error.message} />
        ) : null}
        {officialHandoffArticleQuery.isError &&
        !officialHandoffArticleMissing &&
        officialHandoffArticleQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={officialHandoffArticleQuery.error.message} />
        ) : null}
        {systemStatusQuery.isError &&
        systemStatusQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={systemStatusQuery.error.message} />
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Smartphone
                size={16}
                className="text-[color:var(--brand-primary)]"
              />
              <span>{t(msg`手机入口`)}</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {t(
                msg`常用手机端入口先固定在这里，点击即可复制深链接，发到手机后继续浏览。`,
              )}
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
                          category: item.category,
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
                      {t(msg`复制到手机`)}
                    </Button>
                    <Link
                      to={(item.desktopTo ?? item.to) as never}
                      className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                    >
                      {t(msg`桌面打开`)}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Wifi size={16} className="text-[color:var(--brand-primary)]" />
              <span>{t(msg`同步概览`)}</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {t(
                msg`这里不另起一套设备检测，直接看当前世界的真实运行状态，判断手机接力是否值得继续。`,
              )}
            </div>

            {systemStatusQuery.isLoading ? (
              <div className="mt-4">
                <LoadingBlock label={t(msg`正在检查同步状态...`)} />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <StatusRow
                  label="Core API" // i18n-ignore-line
                  value={
                    systemStatusQuery.data?.coreApi.healthy
                      ? t(msg`世界在线`)
                      : t(msg`连接异常`)
                  }
                />
                <StatusRow
                  label={t(msg`数据库`)}
                  value={
                    systemStatusQuery.data?.database.connected
                      ? t(msg`已连接`)
                      : t(msg`未连接`)
                  }
                />
                <StatusRow
                  label={t(msg`AI 服务`)}
                  value={
                    systemStatusQuery.data?.inferenceGateway.healthy
                      ? t(msg`可用`)
                      : t(msg`待恢复`)
                  }
                />
                <StatusRow
                  label={t(msg`世界主人`)}
                  value={`${systemStatusQuery.data?.worldSurface.ownerCount ?? 0} / 1`}
                />
                <StatusRow
                  label={t(msg`最近快照`)}
                  value={
                    systemStatusQuery.data?.scheduler.lastWorldSnapshotAt
                      ? formatTimestamp(
                          systemStatusQuery.data.scheduler.lastWorldSnapshotAt,
                        )
                      : t(msg`暂无`)
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
                  {t(msg`最近会话`)}
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  {t(msg`先按最近活跃会话做接力，桌面和手机之间切换会更顺。`)}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void conversationsQuery.refetch()}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <RefreshCw size={14} />
                {t(msg`刷新`)}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {conversationsQuery.isLoading ? (
                <LoadingBlock label={t(msg`正在读取会话...`)} />
              ) : recentConversations.length ? (
                recentConversations.map((item) => {
                  const preview = getConversationPreviewParts(
                    item,
                    localMessageActionState,
                  );
                  const description = `${preview.prefix}${preview.text}`; // i18n-ignore-line

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
                          category: "messages",
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                    />
                  );
                })
              ) : (
                <EmptyState
                  title={t(msg`还没有最近会话`)}
                  description={t(
                    msg`先回消息里产生一些对话，这里就会开始出现手机接力入口。`,
                  )}
                />
              )}
            </div>
          </section>

          <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {t(msg`最近公众号内容`)}
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  {t(
                    msg`公众号阅读在手机上更顺手，这里直接复制最近文章或账号主页。`,
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void officialAccountsQuery.refetch()}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <RefreshCw size={14} />
                {t(msg`刷新`)}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {officialAccountsQuery.isLoading ? (
                <LoadingBlock label={t(msg`正在读取公众号...`)} />
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
                        category: "official",
                        description: t(msg`继续查看账号资料与最近推送。`),
                        label: t(msg`${account.name} 主页`),
                        path: `/official-accounts/${account.id}`,
                        setHistory: setHandoffHistory,
                        setNotice,
                      })
                    }
                    onCopyArticle={() =>
                      void handleCopyHandoff({
                        category: "official",
                        description:
                          account.recentArticle?.summary ||
                          t(msg`继续阅读这篇公众号文章。`),
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
                  title={t(msg`还没有最近文章`)}
                  description={t(
                    msg`等公众号有推送后，这里会直接出现可接力到手机的阅读入口。`,
                  )}
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
                <span>{t(msg`小程序接力`)}</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                {t(
                  msg`桌面小程序面板里的当前工作台和最近使用，会从这里直接发到手机继续。`,
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/tabs/mini-programs"
                className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
              >
                {t(msg`打开小程序面板`)}
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
                          ? t(msg`已刷新小程序接力内容。`)
                          : t(msg`小程序面板里还没有可同步到手机的最近使用。`),
                      );
                    },
                  );
                }}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                <RefreshCw size={14} />
                {t(msg`刷新`)}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {t(msg`当前小程序工作台`)}
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
                  buttonLabel={t(msg`发当前工作台到手机`)}
                  onCopy={() =>
                    void handleCopyHandoff({
                      category: "mini_program",
                      description: t(
                        msg`${activeMiniProgram.name} 的当前工作台，带上最近使用和本地待办。`,
                      ),
                      label: t(msg`${activeMiniProgram.name} 接力`),
                      path: `/discover/mini-programs?miniProgram=${activeMiniProgram.id}`,
                      setHistory: setHandoffHistory,
                      setNotice,
                    })
                  }
                />
              ) : (
                <div className="mt-4">
                  <EmptyState
                    title={t(msg`还没有当前小程序`)}
                    description={t(
                      msg`先在桌面小程序面板里打开一个入口，这里就会出现可接力到手机的工作台。`,
                    )}
                  />
                </div>
              )}
            </div>

            <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {t(msg`最近使用小程序`)}
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                {t(msg`最近在桌面打开过的小程序，会直接形成手机继续入口。`)}
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
                      buttonLabel={t(msg`发到手机继续`)}
                      onCopy={() =>
                        void handleCopyHandoff({
                          category: "mini_program",
                          description: t(
                            msg`${miniProgram.name} 的当前工作台，带上最近使用和本地待办。`,
                          ),
                          label: t(msg`${miniProgram.name} 接力`),
                          path: `/discover/mini-programs?miniProgram=${miniProgram.id}`,
                          setHistory: setHandoffHistory,
                          setNotice,
                        })
                      }
                    />
                  ))
                ) : (
                  <EmptyState
                    title={t(msg`还没有最近小程序`)}
                    description={t(
                      msg`先在桌面小程序面板里打开几个入口，这里就会开始出现可接力到手机的最近记录。`,
                    )}
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
                <span>{t(msg`直播接力`)}</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                {t(
                  msg`桌面直播伴侣里的准备稿和最近直播记录，会优先从这里发到手机继续跟进。`,
                )}
              </div>
            </div>
            <Link
              to="/desktop/channels/live-companion"
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
            >
              {t(msg`打开直播伴侣`)}
            </Link>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {t(msg`当前直播准备`)}
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                {liveDraft.title.trim()
                  ? t(
                      msg`${liveDraft.title} · ${liveDraft.topic || t(msg`未填写主题`)}`,
                    )
                  : t(msg`直播伴侣里还没有填写准备稿。`)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
                <span>
                  {t(msg`模式 ${resolveLiveModeLabel(liveDraft.mode)}`)}
                </span>
                <span>
                  {t(msg`质量 ${resolveLiveQualityLabel(liveDraft.quality)}`)}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!liveDraft.title.trim()}
                  onClick={() =>
                    void handleCopyHandoff({
                      category: "channel",
                      description: liveDraft.topic.trim()
                        ? t(msg`${liveDraft.title} · ${liveDraft.topic}`)
                        : t(
                            msg`${liveDraft.title}，在手机上继续直播准备与内容导流。`,
                          ),
                      label: liveDraft.title.trim() || t(msg`直播准备`),
                      path: "/discover/channels",
                      setHistory: setHandoffHistory,
                      setNotice,
                    })
                  }
                  className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
                >
                  <Copy size={14} />
                  {t(msg`发准备到手机`)}
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
                          ? t(msg`已刷新直播接力内容。`)
                          : t(msg`直播伴侣还没有可同步到手机的内容。`),
                      );
                    });
                  }}
                  className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  <RefreshCw size={14} />
                  {t(msg`刷新直播状态`)}
                </Button>
              </div>
            </div>

            <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {t(msg`最近直播状态`)}
              </div>
              <div className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                {activeLiveSession
                  ? t(
                      msg`${activeLiveSession.title} 正在直播，可在手机端继续关注频道动线。`,
                    )
                  : liveHistory[0]
                    ? t(
                        msg`${liveHistory[0].title} 已结束，可在手机端继续做频道跟进。`,
                      )
                    : t(msg`还没有直播记录。`)}
              </div>
              <div className="mt-3 text-[11px] text-[color:var(--text-muted)]">
                {activeLiveSession
                  ? t(
                      msg`开播于 ${formatTimestamp(activeLiveSession.startedAt)}`,
                    )
                  : liveHistory[0]?.startedAt
                    ? t(
                        msg`最近开播于 ${formatTimestamp(liveHistory[0].startedAt)}`,
                      )
                    : t(msg`先在直播伴侣里启动一场直播。`)}
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!activeLiveSession && !liveHistory[0]}
                  onClick={() =>
                    void handleCopyHandoff({
                      category: "channel",
                      description: activeLiveSession
                        ? t(
                            msg`${activeLiveSession.title} 正在直播中，切到手机端继续查看频道表现。`,
                          )
                        : t(
                            msg`${liveHistory[0]?.title ?? t(msg`最近直播`)} 已结束，切到手机端继续跟进频道内容。`,
                          ),
                      label:
                        activeLiveSession?.title ??
                        liveHistory[0]?.title ??
                        t(msg`最近直播`),
                      path: "/discover/channels",
                      setHistory: setHandoffHistory,
                      setNotice,
                    })
                  }
                  className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  <ArrowUpRight size={14} />
                  {t(msg`发直播状态到手机`)}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
            <CheckCircle2
              size={16}
              className="text-[color:var(--brand-primary)]"
            />
            <span>{t(msg`最近发往手机`)}</span>
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            {t(
              msg`当前把手机接力记录按内容类型拆开，方便区分消息、公众号、小程序和直播。`,
            )}
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
                    <div className="rounded-full bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
                      {t(msg`${group.items.length} 条`)}
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
                            category: group.id,
                            description: item.description,
                            label: item.label,
                            path: item.path,
                            setHistory: setHandoffHistory,
                            setNotice,
                          })
                        }
                        className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                      >
                        {t(msg`再发一次`)}
                      </Button>
                    </div>
                  ))}
                </section>
              ))
            ) : (
              <EmptyState
                title={t(msg`还没有手机接力记录`)}
                description={t(
                  msg`先从上面的入口或最近内容复制一个深链接，这里就会开始记录。`,
                )}
              />
            )}
          </div>
        </section>
      </div>
    </DesktopUtilityShell>
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]">
        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white/95 px-8 py-6 text-center shadow-[var(--shadow-card)]">
          <div className="text-lg font-semibold text-[color:var(--text-primary)]">
            {t(msg`功能开发中`)}
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {t(msg`敬请期待`)}
          </div>
        </div>
      </div>
    </div>
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
              {t(msg`发到手机继续`)}
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
              {t(msg`发文章到手机`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenArticle}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <ArrowUpRight size={14} />
              {t(msg`桌面打开文章`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCopyAccount}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <ArrowUpRight size={14} />
              {t(msg`发主页到手机`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenAccount}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <ArrowUpRight size={14} />
              {t(msg`桌面打开主页`)}
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
            {pinned ? t(msg` · 已加入我的小程序`) : ""}
          </div>
        </div>
        <div className="rounded-full bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
          {t(msg`${launchCount} 次`)}
        </div>
      </div>

      <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
        {miniProgram.openHint}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
        <span>{t(msg`待办 ${completedTaskCount}/${totalTaskCount}`)}</span>
        <span>
          {lastOpenedAt
            ? t(msg`上次打开 ${formatConversationTimestamp(lastOpenedAt)}`)
            : t(msg`还没有打开过`)}
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

function MetricCard({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: ReactNode; value: ReactNode }) {
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
    return t(msg`产品讲解`);
  }

  if (mode === "story") {
    return t(msg`剧情陪看`);
  }

  return t(msg`单人控台`);
}

function resolveLiveQualityLabel(quality: LiveSessionRecord["quality"]) {
  if (quality === "standard") {
    return t(msg`标准`);
  }

  if (quality === "ultra") {
    return t(msg`超清`);
  }

  return t(msg`高清`);
}

function resolveMobileHandoffCategory(
  item: MobileHandoffRecord,
): MobileHandoffCategory {
  if (item.category) {
    return item.category;
  }

  const rawPath = item.path.split(/[?#]/, 1)[0] ?? item.path;
  const normalizedPath =
    rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  const hashIndex = item.path.indexOf("#");
  const rawHash = hashIndex >= 0 ? item.path.slice(hashIndex) : "";
  const desktopChatRouteState =
    normalizedPath === "/tabs/chat"
      ? parseDesktopChatRouteHash(rawHash)
      : undefined;
  const desktopContactsRouteState =
    normalizedPath === "/tabs/contacts"
      ? parseDesktopContactsRouteState(rawHash)
      : undefined;

  if (
    (normalizedPath === "/tabs/chat" &&
      desktopChatRouteState?.officialView !== undefined) ||
    (normalizedPath === "/tabs/contacts" &&
      desktopContactsRouteState?.pane === "official-accounts") ||
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
    normalizedPath.startsWith("/channels/authors/") ||
    normalizedPath.startsWith("/discover/channels") ||
    normalizedPath.startsWith("/desktop/channels")
  ) {
    return "channel";
  }

  if (
    normalizedPath === "/tabs/contacts" ||
    normalizedPath === "/contacts" ||
    normalizedPath === "/friend-requests" ||
    normalizedPath === "/desktop/add-friend" ||
    normalizedPath === "/contacts/starred" ||
    normalizedPath === "/contacts/tags" ||
    normalizedPath === "/contacts/groups" ||
    normalizedPath === "/contacts/world-characters" ||
    normalizedPath === "/tabs/discover" ||
    normalizedPath === "/discover" ||
    normalizedPath === "/discover/encounter" ||
    normalizedPath === "/discover/scene" ||
    normalizedPath.startsWith("/friend-moments/") ||
    normalizedPath.startsWith("/moments/friend/") ||
    normalizedPath.startsWith("/desktop/friend-moments/") ||
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

function resolveConversationRootPath(path: string) {
  const match = path.match(/^\/(chat|group)\/([^/?#]+)/);
  if (!match) {
    const rawPath = path.split(/[?#]/, 1)[0] ?? path;
    const normalizedPath =
      rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

    if (normalizedPath !== "/tabs/chat") {
      return null;
    }

    const hashIndex = path.indexOf("#");
    const rawHash = hashIndex >= 0 ? path.slice(hashIndex) : "";
    const routeState = parseDesktopChatRouteHash(rawHash);

    return routeState.conversationId
      ? buildDesktopChatThreadPath({
          conversationId: routeState.conversationId,
        })
      : null;
  }

  return `/${match[1]}/${match[2]}`;
}

async function handleCopyHandoff({
  category,
  description,
  label,
  path,
  setHistory,
  setNotice,
}: {
  category?: MobileHandoffCategory;
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
    setNotice(t(msg`当前环境暂不支持复制手机接力链接。`));
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    const nextHistory = pushMobileHandoffRecord({
      category,
      description,
      label,
      path,
    });
    setHistory(nextHistory);
    setNotice(t(msg`${label} 已复制到剪贴板，可发送到手机继续。`));
  } catch {
    setNotice(t(msg`复制失败，请稍后重试。`));
  }
}

function isOfficialAccountArticleMissingError(error: unknown) {
  return (
    error instanceof Error &&
    /文章不存在。?|official account article not found|article not found/i.test( // i18n-ignore-line
      error.message.trim(),
    )
  );
}
