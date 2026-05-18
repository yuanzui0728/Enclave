import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  blockCharacter,
  clearConversationHistory,
  createModerationReport,
  getBlockedCharacters,
  getCharacter,
  getConversations,
  getFriends,
  hideConversation,
  REMINDER_CHARACTER_ID,
  sendFriendRequest,
  setConversationStrongReminder,
  setConversationMuted,
  setConversationPinned,
} from "@yinjie/contracts";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { DigitalHumanEntryNotice } from "../features/chat/digital-human-entry-notice";
import { useDigitalHumanEntryGuard } from "../features/chat/use-digital-human-entry-guard";
import { useConversationBackground } from "../features/chat/backgrounds/use-conversation-background";
import {
  CONVERSATION_STRONG_REMINDER_DURATION_HOURS,
  formatConversationStrongReminderRemaining,
  isConversationStrongReminderActive,
} from "../features/chat/conversation-strong-reminder";
import { ChatCallFallbackSection } from "../features/chat-details/chat-call-fallback-section";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { ChatMemberGrid } from "../features/chat-details/chat-member-grid";
import { ChatSettingRow } from "../features/chat-details/chat-setting-row";
import { ReminderTaskPanel } from "../features/chat/reminder-task-panel";
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "../features/chat/mobile-chat-route-state";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { getConversationDisplayTitle } from "../lib/conversation-preview";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { buildPublicShareUrl } from "../lib/share-url";
import { buildYinjieId } from "../lib/yinjie-id";
import {
  openAppSettings,
  requestNotificationPermission,
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";
import { useRuntimeTranslator } from "@yinjie/i18n";

const CHAT_DETAILS_REPORT_REASON = "chat_details_report";
const CHAT_DETAILS_BLOCK_REASON = "chat_details_block";

export function ChatDetailsPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/details",
  });
  const isDesktopLayout = useDesktopLayout();
  // useRuntimeTranslator() 而非 translateRuntimeMessage —— 后者是稳定全局
  // fn，组件不会因 locale 切换重渲染，桌面 redirect shell 的标题描述会卡在
  // 上个 locale 直到别的 state 推一把。
  const t = useRuntimeTranslator();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={conversationId}
        panel="details"
        title={t(msg`正在打开桌面聊天信息`)}
        description={t(msg`正在切换到桌面聊天工作区中的聊天信息侧栏。`)}
        loadingLabel={t(msg`打开桌面聊天信息...`)}
      />
    );
  }

  return <MobileChatDetailsPage conversationId={conversationId} />;
}

function MobileChatDetailsPage({ conversationId }: { conversationId: string }) {
  // useRuntimeTranslator() 而非 translateRuntimeMessage —— 下方 contactSummary
  // useMemo (line 303) 在 body 调 t(msg`联系人`/`通讯录朋友`/`世界联系人`/
  // `${name} 的隐界名片`)，但 deps 没列 t。translateRuntimeMessage 是稳定
  // 全局 fn，把它当 dep 也不会因 locale 切换换引用 → 名片摘要的多语言一直
  // 卡在 mount 时的 locale。useRuntimeTranslator 的回调引用会随
  // activationVersion+locale 重新生成，加进 contactSummary deps 后跟着重算。
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = useMemo(() => parseMobileChatRouteState(hash), [hash]);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const chatRouteHash = useMemo(
    () =>
      buildMobileChatRouteHash({
        highlightedMessageId: routeState.highlightedMessageId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }) || undefined,
    [routeState.highlightedMessageId, safeReturnHash, safeReturnPath],
  );
  const ownerName = useWorldOwnerStore((state) => state.username) ?? t(msg`我`);
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "warning";
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
  } | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [managementSheetOpen, setManagementSheetOpen] = useState(false);
  const [dangerSheetAction, setDangerSheetAction] = useState<
    "hide" | "clear" | "report" | "block" | null
  >(null);
  // 走查 R2：和 desktop-chat-confirm-dialog 新一轮 R4 (commit 2e6b12b34) 同款问题
  // ——「清空聊天记录 / 隐藏聊天 / 提交投诉 / 加入黑名单」确认按钮只靠 disabled={busy}
  // 兜双触发，busy 是 mutation.isPending 经 React commit 才进 DOM。同帧连点 2 次
  // 都能同时通过 disabled=false → onConfirm 触发 mutate 2 次：
  // · hide / clear 走幂等 DELETE/POST，server 接 2 次浪费 RTT；
  // · report 非幂等 → 后台直接堆 2 份重复 moderation report；
  // · block 第二次拿到「已在黑名单」error 反过来把第一次成功的 notice 覆盖成失败提示。
  // 加 sync ref 锁；busy 翻回 false 由 useEffect 复位。
  const dangerConfirmSubmittingRef = useRef(false);
  const { entryNotice, guardVideoEntry, resetEntryGuard } =
    useDigitalHumanEntryGuard({
      baseUrl,
    });

  useEffect(() => {
    setNotice(null);
    setManagementSheetOpen(false);
    setDangerSheetAction(null);
    resetEntryGuard();
  }, [conversationId, resetEntryGuard]);

  // 走查 R1：「聊天已置顶」「已开启消息免打扰」「聊天记录已清空」这一串
  // mutation 成功提示在原版里没 auto-dismiss——setNotice 后会一直挂在
  // 页面顶部直到用户下一次切设置或离开 details。chat-list-page R1（commit
  // 见 listing notice useEffect）已经给过同款 3.5s auto-dismiss，本页跟着对齐。
  //
  // 新一轮 R3：原版判定只看 primary actionLabel/onAction，漏了「web 移动端
  // 强提醒权限被拒」这条 notice (`strongReminderMutation.onSuccess` 内
  // nativeMobileShareSupported=false 分支) —— 它的 actionLabel/onAction 全是
  // undefined，只挂 secondaryActionLabel="返回上一页"，会被错误 dismiss 走
  // 用户唯一可点的返回按钮。改成「任一组 action（primary or secondary）有
  // 完整 label+handler」就不 dismiss。
  useEffect(() => {
    if (
      !notice ||
      (notice.actionLabel && notice.onAction) ||
      (notice.secondaryActionLabel && notice.onSecondaryAction)
    ) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    // 走查第七轮 R2：跟 contacts-page / character-detail-page 对齐 15s
    // staleTime——chat-room 顶部点 ⋯ 进 details 时上一页 conversations
    // 列表刚拉过，无须立刻 refetch。
    staleTime: 15_000,
  });

  const conversation = useMemo(
    () =>
      (conversationsQuery.data ?? []).find(
        (item) => item.id === conversationId,
      ) ?? null,
    [conversationId, conversationsQuery.data],
  );
  // 走查新一轮 R3：服务端 normalizeLegacyConversationEntity 在 title 全部
  // fallback 失败时持久化字面量 "未知联系人" / "Direct conversation"。chat-list
  // 行内 / use-conversation-thread / chat-message-search-page 都已经走
  // getConversationDisplayTitle 翻成当前 locale；本页 4 处（页面 header / 主体
  // contactDisplayName / contactSummary 系统分享文案 / 管理 sheet 描述）一直直
  // conversation.title，en/ja/ko locale 用户在角色被删 + 非好友会话里整页都是
  // 中文 sentinel。统一在源头算一次复用。
  const displayedConversationTitle = conversation
    ? getConversationDisplayTitle(conversation.title)
    : null;
  const backgroundQuery = useConversationBackground(conversationId);
  const targetCharacterId = conversation?.participants[0] ?? "";
  const isReminderConversation = targetCharacterId === REMINDER_CHARACTER_ID;

  // 走查 R3（第 3 轮）：和 desktop-chat-details-panel / desktop-direct-call-panel /
  // desktop-message-avatar-popover 共享同一 queryKey "app-character"，那 3 处都对齐
  // 到 15s staleTime；本页一直裸跑 → 用户从 chat-room 顶部点 ⋯ 进 details 时
  // 上一页 conversationsQuery 顺带的 participant character 状态在 cache 里还
  // 是热的，但本观察者按 mobile-web 60s / 其它 10s 默认算 stale 就会再发一次
  // GET /characters/$id（公网隧道 ~600ms）。15s 对齐 desktop 三处即可。
  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, targetCharacterId],
    queryFn: () => getCharacter(targetCharacterId, baseUrl),
    enabled: Boolean(targetCharacterId),
    staleTime: 15_000,
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    // 走查第七轮 R1：与 character-detail / contacts-page 共享同一 queryKey，
    // 跟它们一起把 staleTime 对齐到 15s，避免从 chat-room 顶部点 ⋯ 进 details
    // 又触发一次和列表页/资料页 15s 内已 fresh 的 friend list 重拉。
    staleTime: 15_000,
  });
  const blockedQuery = useQuery({
    queryKey: ["app-chat-details-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(targetCharacterId),
    // 走查新一轮 R7：与 character-detail-page (line 247) / contacts-page /
    // desktop-chat-details-panel 共享同一 queryKey "app-chat-details-blocked"，
    // 那 3 处第七轮 R2 把 staleTime 对齐到 15s（desktop 还给 30s 因为相对
    // 静态），本页一直裸跑——desktop 默认 staleTime=10s，移动端 60s，但凡
    // 用户从 contacts / character-detail 跳进 chat-details 间隔 >10s（desktop）
    // 或 >60s（mobile）就重复拉 blocked 列表（公网隧道 ~600ms RTT）。15s 对齐
    // 即可。
    staleTime: 15_000,
  });

  const navigateToRouteStateReturn = ({
    replace = false,
  }: {
    replace?: boolean;
  } = {}) => {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
      replace,
    });
    return true;
  };
  // 走查新一轮 R5：和 chat-room-page handleMobileBack R4 同款修法——本页 onBack
  // 在 ChatDetailsShell 顶部返回按钮 + 4 处 renderStatusBackAction / status retry
  // / mutation onSecondaryAction（"返回上一页"）上挂着，全部走 navigateBackOrFallback
  // 或 navigate 形态，没有同步 ref 守。同帧 <16ms 双击返回按钮 → window.history.back()
  // 跑 2 次或 navigate 跑 2 次 → 用户后退 2 页跳出聊天页 / 多 push 一条 history。
  // 同 mount 内连点不该多飞一次；page unmount 时 ref 跟着失效，next mount 自动
  // 复位；少数边界（navigate 没真正切走）下 raf 后释放兜底。
  const backFiredRef = useRef(false);
  const guardBackAction = useCallback(<Args extends unknown[]>(handler: (...args: Args) => void) => {
    return (...args: Args) => {
      if (backFiredRef.current) return;
      backFiredRef.current = true;
      handler(...args);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          backFiredRef.current = false;
        });
      }
    };
  }, []);
  const handleOperationBack = guardBackAction(() => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({ to: "/tabs/chat" });
  });
  const statusBackLabel = safeReturnPath
    ? t(msg`返回上一页`)
    : t(msg`返回消息列表`);
  const renderStatusBackAction = () => (
    <Button
      type="button"
      variant="secondary"
      onClick={handleOperationBack}
      className="rounded-full"
    >
      {statusBackLabel}
    </Button>
  );
  const renderStatusRetryAction = (onRetry: () => void) => (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={onRetry}
        className="rounded-full"
      >
        {t(msg`重试读取`)}
      </Button>
      {renderStatusBackAction()}
    </div>
  );
  const renderOperationBackAction = () => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
      onClick={handleOperationBack}
    >
      {statusBackLabel}
    </Button>
  );

  useEffect(() => {
    if (
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      conversation
    ) {
      return;
    }

    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    conversation,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
  ]);

  useEffect(() => {
    if (conversation?.type !== "group") {
      return;
    }

    void navigate({
      to: "/group/$groupId/details",
      params: { groupId: conversation.id },
      ...(chatRouteHash ? { hash: chatRouteHash } : {}),
      replace: true,
    });
  }, [chatRouteHash, conversation, navigate]);

  const targetCharacter = characterQuery.data;
  const isPinned = conversation?.isPinned ?? false;
  const strongReminderActive = isConversationStrongReminderActive(
    conversation?.strongReminderUntil,
    nowTimestamp,
  );
  const strongReminderLabel = formatConversationStrongReminderRemaining(
    conversation?.strongReminderUntil,
    nowTimestamp,
  );
  const friendRecord = useMemo(
    () =>
      (friendsQuery.data ?? []).find(
        (item) => item.character.id === targetCharacterId,
      ) ?? null,
    [friendsQuery.data, targetCharacterId],
  );
  const friendship = friendRecord?.friendship ?? null;
  const isFriend = Boolean(friendship);
  const isBlocked = (blockedQuery.data ?? []).some(
    (item) => item.characterId === targetCharacterId,
  );
  const contactDisplayName =
    friendship?.remarkName?.trim() ||
    targetCharacter?.name ||
    displayedConversationTitle ||
    t(msg`对方`);
  const contactProfileSubtitle = friendship?.remarkName?.trim()
    ? t(msg`昵称：${targetCharacter?.name ?? t(msg`未设置`)}`)
    : targetCharacter?.relationship?.trim() ||
      (isFriend ? t(msg`通讯录朋友`) : t(msg`世界联系人`));
  const contactIdentifier = targetCharacterId
    ? t(msg`隐界号：${buildYinjieId(targetCharacterId)}`)
    : null;
  const contactSummary = useMemo(() => {
    if (!conversation) {
      return null;
    }

    const contactPath = targetCharacterId
      ? `/character/${targetCharacterId}`
      : `/chat/${conversationId}/details`;
    const contactUrl = buildPublicShareUrl(contactPath);
    const contactName =
      friendship?.remarkName?.trim() ||
      targetCharacter?.name ||
      displayedConversationTitle ||
      t(msg`联系人`);
    const relationship =
      targetCharacter?.relationship?.trim() ||
      (isFriend ? t(msg`通讯录朋友`) : t(msg`世界联系人`));

    return {
      title: t(msg`${contactName} 的隐界名片`),
      text: [
        t(msg`${contactName} 的隐界名片`),
        relationship,
        targetCharacterId
          ? t(msg`隐界号：${buildYinjieId(targetCharacterId)}`)
          : undefined,
        contactUrl,
      ]
        .filter(Boolean)
        .join("\n"),
      url: contactUrl,
    };
  }, [
    conversation,
    conversationId,
    friendship?.remarkName,
    isFriend,
    t,
    targetCharacter?.name,
    targetCharacter?.relationship,
    targetCharacterId,
  ]);

  const handleOpenCharacterProfile = () => {
    if (!targetCharacterId) {
      return;
    }

    void navigate({
      to: "/character/$characterId",
      params: { characterId: targetCharacterId },
      hash: buildCharacterDetailRouteHash({
        returnPath: `/chat/${conversationId}/details`,
        returnHash: chatRouteHash,
      }),
    });
  };

  // 走查（新一轮）R1：「推荐给朋友」原版无任何双击锁。playwright 三连点
  // 触发 3 次 navigator.clipboard.writeText（web 路径）/ Native iOS 真机上
  // 同样会 3 次 shareWithNativeShell.startActivity（commit 2 之前修过的
  // mobile-favorites / contact-profile 同款 issue）。第一次 await clipboard
  // 还没回，第二/第三次 click 已经撞进 try 分支，公网 RTT 窗口内 user 看到
  // notice 字面闪 3 次「已复制联系人摘要 / 已打开系统分享」。和同页
  // saveToContactsSubmittingRef / muteSubmittingRef / pinSubmittingRef 同款
  // 修法：进入函数前先抢 ref；await 链结束（成功或失败）finally 复位。
  const shareContactSubmittingRef = useRef(false);
  async function handleShareContact() {
    if (!contactSummary || shareContactSubmittingRef.current) {
      return;
    }

    shareContactSubmittingRef.current = true;
    try {
      if (nativeMobileShareSupported) {
        const shared = await shareWithNativeShell(contactSummary);
        if (shared) {
          setNotice({
            tone: "success",
            message: t(msg`已打开系统分享面板。`),
          });
          return;
        }
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setNotice({
          tone: "info",
          message: nativeMobileShareSupported
            ? t(msg`当前设备暂时无法打开系统分享，请稍后重试。`)
            : t(msg`当前环境暂不支持复制联系人摘要。`),
          actionLabel: nativeMobileShareSupported
            ? t(msg`重试分享`)
            : t(msg`重试复制`),
          onAction: handleShareContact,
          secondaryActionLabel: statusBackLabel,
          onSecondaryAction: handleOperationBack,
        });
        return;
      }

      try {
        await navigator.clipboard.writeText(contactSummary.text);
        setNotice({
          tone: "success",
          message: nativeMobileShareSupported
            ? t(msg`系统分享暂时不可用，已复制联系人摘要。`)
            : t(msg`联系人摘要已复制。`),
        });
      } catch {
        setNotice({
          tone: "info",
          message: nativeMobileShareSupported
            ? t(msg`系统分享失败，请稍后重试。`)
            : t(msg`复制联系人摘要失败，请稍后重试。`),
          actionLabel: nativeMobileShareSupported
            ? t(msg`重试分享`)
            : t(msg`重试复制`),
          onAction: () => {
            void handleShareContact();
          },
          secondaryActionLabel: statusBackLabel,
          onSecondaryAction: handleOperationBack,
        });
      }
    } finally {
      shareContactSubmittingRef.current = false;
    }
  }

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) =>
      setConversationPinned(conversationId, { pinned }, baseUrl),
    onSuccess: async (_, pinned) => {
      setNotice({
        tone: "success",
        message: pinned ? t(msg`聊天已置顶。`) : t(msg`聊天已取消置顶。`),
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    // 失败时 toggle 不会被 invalidate 回拉，UI 看着没动 + 没提示。
    // 公网隧道偶发 5xx / 重连过期都会触发，必须给个提示。
    onError: (error, pinned) => {
      setNotice({
        tone: "warning",
        message:
          error instanceof Error && error.message
            ? error.message
            : pinned
              ? t(msg`置顶失败，请稍后再试。`)
              : t(msg`取消置顶失败，请稍后再试。`),
      });
    },
  });
  const muteMutation = useMutation({
    mutationFn: (muted: boolean) =>
      setConversationMuted(conversationId, { muted }, baseUrl),
    onSuccess: async (_, muted) => {
      setNotice({
        tone: "success",
        message: muted
          ? t(msg`已开启消息免打扰。`)
          : t(msg`已关闭消息免打扰。`),
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error, muted) => {
      setNotice({
        tone: "warning",
        message:
          error instanceof Error && error.message
            ? error.message
            : muted
              ? t(msg`开启免打扰失败，请稍后再试。`)
              : t(msg`关闭免打扰失败，请稍后再试。`),
      });
    },
  });
  const strongReminderMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const conversation = await setConversationStrongReminder(
        conversationId,
        {
          enabled,
          durationHours: CONVERSATION_STRONG_REMINDER_DURATION_HOURS,
        },
        baseUrl,
      );
      const permission = enabled
        ? await requestNotificationPermission()
        : undefined;
      if (permission === "granted") {
        // 用户刚授权通知 → 立刻把 APNs / FCM device token 同步给后端，避免
        // 要等下次启动。iOS 走 syncIos，Android 走 syncAndroid，
        // syncNativePushTokenAcrossPlatforms 内部按平台分发，非原生壳安全短路。
        const { syncNativePushTokenAcrossPlatforms } = await import(
          "../runtime/push-token-sync"
        );
        void syncNativePushTokenAcrossPlatforms();
      }
      return { conversation, enabled, permission };
    },
    onSuccess: async ({ enabled, permission }) => {
      if (!enabled) {
        setNotice({
          tone: "success",
          message: t(msg`已关闭强提醒。`),
        });
      } else if (permission === "granted") {
        setNotice({
          tone: "success",
          message: t(msg`已开启 3 小时强提醒，系统通知已开启。`),
        });
      } else if (permission === "denied") {
        setNotice({
          tone: "warning",
          message: nativeMobileShareSupported
            ? t(msg`已开启 3 小时强提醒，但系统通知未开启。可前往系统设置继续打开通知。`)
            : t(msg`已开启 3 小时强提醒，但系统通知未开启。`),
          actionLabel: nativeMobileShareSupported ? t(msg`去设置`) : undefined,
          onAction: nativeMobileShareSupported
            ? () => {
                void openAppSettings();
              }
            : undefined,
          secondaryActionLabel: statusBackLabel,
          onSecondaryAction: handleOperationBack,
        });
      } else {
        setNotice({
          tone: "success",
          message: t(msg`已开启 3 小时强提醒。`),
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error, enabled) => {
      setNotice({
        tone: "warning",
        message:
          error instanceof Error && error.message
            ? error.message
            : enabled
              ? t(msg`开启强提醒失败，请稍后再试。`)
              : t(msg`关闭强提醒失败，请稍后再试。`),
      });
    },
  });

  const saveToContactsMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return sendFriendRequest(
        {
          characterId: targetCharacterId,
          greeting: t(msg`${ownerName} 想把你加到通讯录里。`),
          autoAccept: true,
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: t(msg`已添加到通讯录。`),
      });
      // 走查 R1：app-friends-quick-start / app-group-friends 都无 useQuery 订阅。
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-friends", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-messages", baseUrl, conversationId],
        }),
      ]);
    },
    onError: (error) => {
      setNotice({
        tone: "warning",
        message:
          error instanceof Error && error.message
            ? error.message
            : t(msg`添加通讯录失败，请稍后再试。`),
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearConversationHistory(conversationId, baseUrl),
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: t(msg`聊天记录已清空。`),
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-messages", baseUrl, conversationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
    onError: (error) => {
      setNotice({
        tone: "warning",
        message:
          error instanceof Error && error.message
            ? error.message
            : t(msg`清空聊天记录失败，请稍后再试。`),
      });
    },
  });
  const hideMutation = useMutation({
    mutationFn: () => hideConversation(conversationId, baseUrl),
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: t(msg`聊天已隐藏。`),
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      if (navigateToRouteStateReturn({ replace: true })) {
        return;
      }

      void navigate({ to: "/tabs/chat", replace: true });
    },
    onError: (error) => {
      setNotice({
        tone: "warning",
        message:
          error instanceof Error && error.message
            ? error.message
            : t(msg`隐藏聊天失败，请稍后再试。`),
      });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return createModerationReport(
        {
          targetType: "character",
          targetId: targetCharacterId,
          reason: CHAT_DETAILS_REPORT_REASON,
          details: `conversation:${conversationId}`,
        },
        baseUrl,
      );
    },
    onSuccess: () => {
      setNotice({
        tone: "success",
        message: t(msg`已提交投诉。`),
      });
    },
    onError: (error) => {
      setNotice({
        tone: "warning",
        message:
          error instanceof Error && error.message
            ? error.message
            : t(msg`投诉提交失败，请稍后再试。`),
      });
    },
  });

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return blockCharacter(
        {
          characterId: targetCharacterId,
          reason: CHAT_DETAILS_BLOCK_REASON,
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: t(msg`已加入黑名单。`),
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-chat-details-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-chat-blocked-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
    onError: (error) => {
      setNotice({
        tone: "warning",
        message:
          error instanceof Error && error.message
            ? error.message
            : t(msg`加入黑名单失败，请稍后再试。`),
      });
    },
  });

  const busy =
    muteMutation.isPending ||
    strongReminderMutation.isPending ||
    pinMutation.isPending ||
    saveToContactsMutation.isPending ||
    hideMutation.isPending ||
    clearMutation.isPending ||
    reportMutation.isPending ||
    blockMutation.isPending;
  // 配 dangerConfirmSubmittingRef：mutation 全部 settled 后把 ref 翻回去，
  // 让下一次 dangerSheetAction 进来能正常 confirm；和 desktop confirm-dialog
  // useEffect [pending] 复位思路一致。
  const dangerMutationsPending =
    hideMutation.isPending ||
    clearMutation.isPending ||
    reportMutation.isPending ||
    blockMutation.isPending;
  useEffect(() => {
    if (!dangerMutationsPending) {
      dangerConfirmSubmittingRef.current = false;
    }
  }, [dangerMutationsPending]);

  useEffect(() => {
    if (!strongReminderActive) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [strongReminderActive]);

  const memberItems = [
    {
      key: targetCharacterId || conversation?.title || "character",
      label: contactDisplayName,
      src: targetCharacter?.avatar,
      onClick: targetCharacterId ? handleOpenCharacterProfile : undefined,
    },
    {
      key: "add",
      label: t(msg`发起群聊`),
      kind: "add" as const,
      onClick: () => {
        void navigate({
          to: "/group/new",
          hash: buildCreateGroupRouteHash({
            source: "chat-details",
            conversationId,
            returnPath: `/chat/${conversationId}/details`,
            returnHash: chatRouteHash,
            seedMemberIds: targetCharacterId ? [targetCharacterId] : [],
          }),
        });
      },
    },
  ];
  const dangerSheetConfig =
    dangerSheetAction === "hide"
      ? {
          title: t(msg`隐藏聊天`),
          description: t(msg`该聊天会先从消息列表中隐藏，收到新消息后会再次出现。`),
          confirmLabel: t(msg`隐藏聊天`),
          confirmDescription: t(msg`不删除现有聊天记录`),
          confirmDanger: false,
          onConfirm: () => hideMutation.mutate(),
        }
      : dangerSheetAction === "clear"
        ? {
            title: t(msg`清空聊天记录`),
            description:
              t(msg`仅清空当前聊天历史消息，对方资料和会话入口会继续保留。`),
            confirmLabel: t(msg`清空聊天记录`),
            confirmDescription: t(msg`此操作不可恢复`),
            confirmDanger: true,
            onConfirm: () => clearMutation.mutate(),
          }
        : dangerSheetAction === "report"
          ? {
              title: t(msg`提交投诉`),
              description: t(msg`会以当前会话作为来源，提交一次聊天场景投诉。`),
              confirmLabel: t(msg`确认投诉`),
              confirmDescription: t(msg`投诉后可继续查看聊天`),
              confirmDanger: true,
              onConfirm: () => reportMutation.mutate(),
            }
          : dangerSheetAction === "block"
            ? {
                title: t(msg`加入黑名单`),
                description:
                  t(msg`加入黑名单后，将不再接收该角色的互动，也不会再继续这段聊天。`),
                confirmLabel: t(msg`加入黑名单`),
                confirmDescription: t(msg`该角色后续互动会被拦截`),
                confirmDanger: true,
                onConfirm: () => blockMutation.mutate(),
              }
            : null;
  // 第四轮 R5：「保存到通讯录」按钮 disabled 原版只看 isFriend/targetCharacterId，
  // 没看 busy。同帧双击 → saveToContactsMutation.mutate() 触发两次：
  // sendFriendRequest 第二次撞已存在 friendship 抛 ALREADY_FRIEND，onError 把
  // 第一次「已添加到通讯录」蓝条覆盖成「添加通讯录失败」橙警告条。
  // disabled 加 busy 在视觉上挡，但 React state 要等 commit，同帧两次 click
  // 都通过。再叠一层 sync ref 锁兜底；mutation settle 后由 useEffect [busy]
  // 复位（参考 dangerConfirmSubmittingRef 同款 setup line 140 / 779-784）。
  const saveToContactsSubmittingRef = useRef(false);
  useEffect(() => {
    if (!saveToContactsMutation.isPending) {
      saveToContactsSubmittingRef.current = false;
    }
  }, [saveToContactsMutation.isPending]);
  const handleSaveToContacts = () => {
    if (!targetCharacterId || saveToContactsSubmittingRef.current) {
      return;
    }

    saveToContactsSubmittingRef.current = true;
    saveToContactsMutation.mutate();
  };

  // 走查 R2：「消息免打扰」「置顶聊天」两条 ChatSettingRow 既没挂 disabled，
  // 也没 sync ref 锁——只有下面「强提醒」一条挂了 disabled={busy}。playwright
  // 实测连点 3 次：3 份相同方向 POST 都飞出去（mute=true 三次 / pinned=false
  // 三次），公网 RTT 双 / 三倍消耗 + onSuccess 让 notice 文本闪两次。同帧
  // <16ms 第二次 click 即使加了 disabled={busy} 也兜不住（React state 要等
  // commit），跟同页 dangerConfirmSubmittingRef / saveToContactsSubmittingRef
  // 一起对齐：(a) 加 disabled={busy} 让 React commit 后挡常规重复 click;
  // (b) 叠 sync ref 锁兜同帧 double-tap，两者复位由 useEffect [isPending] 触发。
  const muteSubmittingRef = useRef(false);
  const pinSubmittingRef = useRef(false);
  // 走查本会话 R1：兄弟 toggle「消息免打扰 / 置顶聊天」R2 都补了 disabled+sync ref
  // 双保险，独「强提醒」原版只裸挂 disabled={busy}——同帧双击 React state 没 commit
  // 之前 disabled 还是 false，两次 strongReminderMutation.mutate(true) 全飞出去：
  // POST /strong-reminder 双发 + requestNotificationPermission/syncNativePushToken
  // 联动也跑两轮。和 mute/pin 对齐补 sync ref 锁；mutation settled 后 useEffect
  // [isPending] 复位。
  const strongReminderSubmittingRef = useRef(false);
  useEffect(() => {
    if (!muteMutation.isPending) {
      muteSubmittingRef.current = false;
    }
  }, [muteMutation.isPending]);
  useEffect(() => {
    if (!pinMutation.isPending) {
      pinSubmittingRef.current = false;
    }
  }, [pinMutation.isPending]);
  useEffect(() => {
    if (!strongReminderMutation.isPending) {
      strongReminderSubmittingRef.current = false;
    }
  }, [strongReminderMutation.isPending]);
  const handleToggleMute = (next: boolean) => {
    if (muteSubmittingRef.current) {
      return;
    }
    muteSubmittingRef.current = true;
    muteMutation.mutate(next);
  };
  const handleTogglePin = (next: boolean) => {
    if (pinSubmittingRef.current) {
      return;
    }
    pinSubmittingRef.current = true;
    pinMutation.mutate(next);
  };
  const handleToggleStrongReminder = (next: boolean) => {
    if (strongReminderSubmittingRef.current) {
      return;
    }
    strongReminderSubmittingRef.current = true;
    strongReminderMutation.mutate(next);
  };

  return (
    <ChatDetailsShell
      title={displayedConversationTitle || t(msg`聊天信息`)}
      onBack={guardBackAction(() => {
        navigateBackOrFallback(
          () => {
            void navigate({
              to: "/chat/$conversationId",
              params: { conversationId },
              ...(chatRouteHash ? { hash: chatRouteHash } : {}),
            });
          },
          `/chat/${conversationId}`,
        );
      })}
    >
      {conversationsQuery.isLoading ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge={t(msg`读取中`)}
            title={t(msg`正在读取聊天信息`)}
            description={t(msg`稍等一下，正在同步聊天资料和设置。`)}
            tone="loading"
          />
        </div>
      ) : null}
      {conversationsQuery.isError &&
      conversationsQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`聊天信息暂时不可用`)}
            description={conversationsQuery.error.message}
            tone="danger"
            action={renderStatusRetryAction(() => {
              void conversationsQuery.refetch();
            })}
          />
        </div>
      ) : null}
      {characterQuery.isError && characterQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`联系人资料暂时不可用`)}
            description={characterQuery.error.message}
            tone="danger"
            action={renderStatusRetryAction(() => {
              void characterQuery.refetch();
            })}
          />
        </div>
      ) : null}
      {friendsQuery.isError && friendsQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`通讯录信息暂时不可用`)}
            description={friendsQuery.error.message}
            tone="danger"
            action={renderStatusRetryAction(() => {
              void friendsQuery.refetch();
            })}
          />
        </div>
      ) : null}
      {blockedQuery.isError && blockedQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`黑名单状态暂时不可用`)}
            description={blockedQuery.error.message}
            tone="danger"
            action={renderStatusRetryAction(() => {
              void blockedQuery.refetch();
            })}
          />
        </div>
      ) : null}
      {notice ? (
        <div className="px-2.5">
          <InlineNotice
            tone={notice.tone}
            className="flex items-center justify-between gap-2.5 rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
          >
            <span>{notice.message}</span>
            {notice.actionLabel && notice.onAction ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <InlineNoticeActionButton
                  label={notice.actionLabel}
                  onClick={notice.onAction}
                />
                {notice.secondaryActionLabel && notice.onSecondaryAction ? (
                  <InlineNoticeActionButton
                    label={notice.secondaryActionLabel}
                    onClick={notice.onSecondaryAction}
                  />
                ) : null}
              </div>
            ) : notice.secondaryActionLabel && notice.onSecondaryAction ? (
              <InlineNoticeActionButton
                label={notice.secondaryActionLabel}
                onClick={notice.onSecondaryAction}
              />
            ) : null}
          </InlineNotice>
        </div>
      ) : null}
      {entryNotice ? (
        <div className="px-2.5">
          <DigitalHumanEntryNotice
            tone={entryNotice.tone}
            message={entryNotice.message}
            continueLabel={entryNotice.continueLabel}
            onDismiss={() => {
              resetEntryGuard();
            }}
            voiceLabel={entryNotice.voiceLabel}
            onContinue={() => {
              resetEntryGuard();
              void navigate({
                to: "/chat/$conversationId/video-call",
                params: { conversationId },
                ...(chatRouteHash ? { hash: chatRouteHash } : {}),
              });
            }}
            onSwitchToVoice={() => {
              resetEntryGuard();
              void navigate({
                to: "/chat/$conversationId/voice-call",
                params: { conversationId },
                ...(chatRouteHash ? { hash: chatRouteHash } : {}),
              });
            }}
            compact
          />
        </div>
      ) : null}

      {!conversationsQuery.isLoading && !conversation ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge={t(msg`会话`)}
            title={t(msg`会话不存在`)}
            description={t(msg`这段聊天暂时不可用，可以先重试读取，或返回消息列表后再试。`)}
            action={renderStatusRetryAction(() => {
              void conversationsQuery.refetch();
            })}
          />
        </div>
      ) : null}

      {conversation ? (
        <>
          <ChatDetailsSection
            title={isFriend ? t(msg`朋友资料`) : t(msg`详细资料`)}
            variant="wechat"
          >
            <button
              type="button"
              onClick={handleOpenCharacterProfile}
              disabled={!targetCharacterId}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-[color:var(--surface-card-hover)] disabled:opacity-60"
            >
              <AvatarChip
                name={contactDisplayName}
                src={targetCharacter?.avatar}
                size="wechat"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] text-[#111827]">
                  {contactDisplayName}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
                  {contactProfileSubtitle}
                </div>
                {contactIdentifier ? (
                  <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
                    {contactIdentifier}
                  </div>
                ) : null}
              </div>
              <ChevronRight size={18} className="shrink-0 text-[#c7c7cc]" />
            </button>
            {contactSummary ? (
              <div className="border-t border-[color:var(--border-faint)]">
                <ChatSettingRow
                  label={t(msg`推荐给朋友`)}
                  value={
                    nativeMobileShareSupported
                      ? t(msg`打开系统分享面板`)
                      : t(msg`复制联系人摘要`)
                  }
                  variant="wechat"
                  onClick={() => {
                    void handleShareContact();
                  }}
                />
              </div>
            ) : null}
          </ChatDetailsSection>

          <ChatDetailsSection variant="wechat">
            <ChatMemberGrid items={memberItems} variant="wechat" />
          </ChatDetailsSection>

          {isReminderConversation ? (
            <ChatDetailsSection title={t(msg`提醒管理`)} variant="wechat">
              <ReminderTaskPanel
                key={`${conversationId}:reminder-panel-v2:details`}
                conversationId={conversationId}
                variant="mobile"
                surface="details"
              />
            </ChatDetailsSection>
          ) : null}

          <ChatDetailsSection title={t(msg`聊天记录`)} variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label={t(msg`查找聊天记录`)}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/chat/$conversationId/search",
                    params: { conversationId },
                    ...(chatRouteHash ? { hash: chatRouteHash } : {}),
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title={t(msg`消息设置`)} variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label={t(msg`消息免打扰`)}
                variant="wechat"
                checked={conversation?.isMuted ?? false}
                disabled={busy}
                onToggle={handleToggleMute}
              />
              <ChatSettingRow
                label={t(msg`置顶聊天`)}
                variant="wechat"
                checked={isPinned}
                disabled={busy}
                onToggle={handleTogglePin}
              />
              <ChatSettingRow
                label={t(msg`强提醒`)}
                value={strongReminderActive ? strongReminderLabel : undefined}
                variant="wechat"
                checked={strongReminderActive}
                disabled={busy}
                onToggle={handleToggleStrongReminder}
              />
            </div>
          </ChatDetailsSection>

          <ChatCallFallbackSection
            variant="wechat"
            disabled={!targetCharacterId}
            voiceValue={t(msg`AI 语音`)}
            videoValue={t(msg`AI 数字人`)}
            onSelectKind={(kind) => {
              setNotice(null);
              if (kind === "video") {
                if (!guardVideoEntry()) {
                  return;
                }
              }
              void navigate({
                to:
                  kind === "voice"
                    ? "/chat/$conversationId/voice-call"
                    : "/chat/$conversationId/video-call",
                params: { conversationId },
                ...(chatRouteHash ? { hash: chatRouteHash } : {}),
              });
            }}
          />

          <ChatDetailsSection title={t(msg`聊天扩展`)} variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label={t(msg`保存到通讯录`)}
                value={isFriend ? t(msg`已添加`) : undefined}
                variant="wechat"
                disabled={isFriend || !targetCharacterId || busy}
                onClick={handleSaveToContacts}
              />
              <ChatSettingRow
                label={t(msg`设置当前聊天背景`)}
                value={getChatBackgroundLabel(
                  backgroundQuery.data?.effectiveBackground,
                )}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/chat/$conversationId/background",
                    params: { conversationId },
                    ...(chatRouteHash ? { hash: chatRouteHash } : {}),
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title={t(msg`聊天管理`)} variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label={t(msg`更多聊天操作`)}
                value={
                  isBlocked
                    ? t(msg`隐藏 / 清空 / 投诉`)
                    : t(msg`隐藏 / 清空 / 投诉 / 拉黑`)
                }
                variant="wechat"
                disabled={busy}
                onClick={() => setManagementSheetOpen(true)}
              />
            </div>
          </ChatDetailsSection>

          {clearMutation.isError && clearMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {clearMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {hideMutation.isError && hideMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {hideMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {pinMutation.isError && pinMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {pinMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {muteMutation.isError && muteMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {muteMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {saveToContactsMutation.isError &&
          saveToContactsMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {saveToContactsMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {reportMutation.isError && reportMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {reportMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {blockMutation.isError && blockMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {blockMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}

          <MobileDetailsActionSheet
            open={managementSheetOpen}
            title={t(msg`聊天管理`)}
            description={t(
              msg`对 ${targetCharacter?.name || displayedConversationTitle || t(msg`当前聊天`)} 进行隐藏、清空或安全操作。`,
            )}
            onClose={() => setManagementSheetOpen(false)}
            actions={[
              {
                key: "hide",
                label: t(msg`隐藏聊天`),
                description: t(msg`先从消息列表隐藏，后续有新消息时再次出现`),
                disabled: busy,
                onClick: () => {
                  setManagementSheetOpen(false);
                  setDangerSheetAction("hide");
                },
              },
              {
                key: "clear",
                label: t(msg`清空聊天记录`),
                description: t(msg`仅清空这段聊天，不影响联系人关系`),
                danger: true,
                disabled: busy,
                onClick: () => {
                  setManagementSheetOpen(false);
                  setDangerSheetAction("clear");
                },
              },
              {
                key: "report",
                label: t(msg`投诉`),
                description: t(msg`提交一次聊天场景投诉`),
                danger: true,
                disabled: busy || !targetCharacterId,
                onClick: () => {
                  setManagementSheetOpen(false);
                  setDangerSheetAction("report");
                },
              },
              {
                key: "block",
                label: isBlocked ? t(msg`已加入黑名单`) : t(msg`加入黑名单`),
                description: isBlocked
                  ? t(msg`当前已经处于黑名单中`)
                  : t(msg`不再接收该角色后续互动`),
                danger: true,
                disabled: busy || isBlocked || !targetCharacterId,
                onClick: () => {
                  setManagementSheetOpen(false);
                  setDangerSheetAction("block");
                },
              },
            ]}
          />

          <MobileDetailsActionSheet
            open={dangerSheetConfig !== null}
            title={dangerSheetConfig?.title ?? ""}
            description={dangerSheetConfig?.description}
            onClose={() => setDangerSheetAction(null)}
            actions={
              dangerSheetConfig
                ? [
                    {
                      key: "confirm",
                      label: dangerSheetConfig.confirmLabel,
                      description: dangerSheetConfig.confirmDescription,
                      danger: dangerSheetConfig.confirmDanger,
                      disabled: busy,
                      onClick: () => {
                        // sync ref 锁：同帧双击都会跑到这里但 second 一定看到
                        // dangerConfirmSubmittingRef.current === true 直接 return；
                        // dangerMutationsPending useEffect 在 settled 后把 ref 翻回。
                        if (
                          dangerConfirmSubmittingRef.current ||
                          dangerMutationsPending
                        ) {
                          return;
                        }
                        dangerConfirmSubmittingRef.current = true;
                        setDangerSheetAction(null);
                        dangerSheetConfig.onConfirm();
                      },
                    },
                  ]
                : []
            }
          />
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

function MobileChatDetailsStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}
