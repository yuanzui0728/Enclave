import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { Phone, Video } from "lucide-react";
import {
  getConversations,
  getFriends,
  getGroup,
  getGroupMembers,
  getGroupMessages,
  type FriendListItem,
  type GroupMessage,
  markGroupRead,
  SELF_CHARACTER_ID,
  sendGroupMessage,
  type SendGroupMessageRequest,
  type StickerAttachment,
  uploadChatAttachment,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { track } from "@yinjie/analytics";
import { ChatComposer } from "../../components/chat-composer";
import { FeatureUnavailableDialog } from "../../components/feature-unavailable-dialog";
import { ChatMessageList } from "../../components/chat-message-list";
import {
  encodeChatReplyText,
  type ChatReplyMetadata,
} from "../../lib/chat-text";
import { resolveMessageSemanticPreview } from "../../lib/message-attachment-semantic";
import {
  DesktopChatHeaderActions,
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "./chat-header-actions";
import { buildDesktopMobileCallHandoffHash } from "./mobile-call-handoff-route-state";
import { DesktopGroupCallPanel } from "./group-call-panel-shell";
import { type ChatRenderableMessage } from "../../components/chat-message-list";
import { type ChatRouteContextNotice } from "./conversation-thread-panel";
import { type ChatComposeShortcutAction } from "./chat-compose-shortcut-route";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import {
  buildGroupCallInviteMessage,
  type CallInviteSource,
  type GroupCallInviteStatus,
} from "./group-call-message";
import { buildMobileGroupCallRouteHash } from "./mobile-group-call-route-state";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { findFirstUnreadMessageId } from "./chat-unread-marker";
import { MobileChatScrollBottomButton } from "./mobile-chat-scroll-bottom-button";
import { MobileChatThreadHeader } from "./mobile-chat-thread-header";
import { useGroupBackground } from "./backgrounds/use-conversation-background";
import { useScrollAnchor } from "../../hooks/use-scroll-anchor";
import { formatTimestamp } from "../../lib/format";
import { isPersistedGroupConversation } from "../../lib/conversation-route";
import { isMissingGroupError } from "../../lib/group-route-fallback";
import { isDesktopOnlyPath } from "../../lib/history-back";
import { describeRequestError } from "../../lib/request-error";
import {
  joinConversationRoom,
  onChatMessage,
  onChatSocketConnect,
  onConversationUpdated,
} from "../../lib/socket";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";
import {
  buildGroupRetryPayload,
  buildOptimisticGroupMessage,
  type GroupThreadMessage,
  markThreadMessageSending,
  markThreadMessagesFailed,
  mergeGroupMessageWindow,
  replaceGroupLocalMessage,
  upsertIncomingGroupMessage,
  upsertServerMessageInCache,
} from "./chat-message-delivery";
import { parseMobileGroupRouteState } from "./mobile-group-route-state";
import { buildMobileGroupRouteHash } from "./mobile-group-route-state";
import { useThreadEntryScrollToBottom } from "./use-thread-entry-scroll-to-bottom";
import {
  buildDesktopChatRouteHash,
  type DesktopChatCallAction,
} from "../desktop/chat/desktop-chat-route-state";

type GroupChatThreadPanelProps = {
  groupId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  desktopSidePanelMode?: DesktopChatSidePanelMode;
  desktopHeaderActionsRef?: Ref<HTMLDivElement>;
  onToggleDesktopHistory?: () => void;
  onToggleDesktopDetails?: () => void;
  onOpenDesktopAnnouncementDetails?: () => void;
  onOpenDesktopMemberSearch?: () => void;
  onDesktopCallAction?: (kind: DesktopChatCallKind) => void;
  desktopCallRequest?: {
    kind: DesktopChatCallAction;
    token: number;
  } | null;
  onDesktopCallRequestHandled?: (token: number) => void;
  highlightedMessageId?: string;
  buildMessageReturnTo?: (messageId: string) => string | undefined;
  routeContextNotice?: ChatRouteContextNotice;
  routeMobileShortcutAction?: ChatComposeShortcutAction | null;
  onRouteMobileShortcutHandled?: () => void;
};

export function GroupChatThreadPanel({
  groupId,
  variant = "mobile",
  onBack,
  desktopSidePanelMode = null,
  desktopHeaderActionsRef,
  onToggleDesktopHistory,
  onToggleDesktopDetails,
  onOpenDesktopAnnouncementDetails,
  // onDesktopCallAction: prop 由 desktop-chat-workspace 传进来（与 direct
  // 版 conversation-thread-panel 对齐 type），但群聊版从来不会回调它——
  // 群语音/视频走 FeatureUnavailableDialog，不真的转交给桌面 workspace。
  // 留 type 给调用方编译通过，destructure 跳过避免 no-unused-vars。
  desktopCallRequest = null,
  onDesktopCallRequestHandled,
  highlightedMessageId,
  buildMessageReturnTo,
  routeContextNotice,
  routeMobileShortcutAction = null,
  onRouteMobileShortcutHandled,
}: GroupChatThreadPanelProps) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const backgroundQuery = useGroupBackground(groupId);
  const [text, setText] = useState("");
  const [replyDraft, setReplyDraft] = useState<ChatReplyMetadata | null>(null);
  const [messages, setMessages] = useState<GroupThreadMessage[]>([]);
  const [desktopCallPanelState, setDesktopCallPanelState] = useState<{
    kind: DesktopChatCallKind;
    source: CallInviteSource | null;
  } | null>(null);
  const [mobileShortcutRequest, setMobileShortcutRequest] = useState<{
    action: ChatComposeShortcutAction;
    nonce: number;
  } | null>(null);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  // R65：和姊妹 conversation-thread-panel R9 同款 —— 群聊缺 SR 入站消息
  // announcer。盲人 SR 用户在群聊里听不到角色回复内容（只能听到 typing
  // 指示）。visually-hidden 但 aria-live="polite" div 在 idle 时朗读最新
  // 一条 character 回复的"角色名：内容摘要"，aria-atomic 防止 SR 只念差量。
  const characterIncomingAnnouncerSeenIdRef = useRef<string | null>(null);
  const characterIncomingAnnouncerMountedRef = useRef(false);
  const [characterIncomingAnnouncement, setCharacterIncomingAnnouncement] =
    useState("");
  const [lastPublishedCallCounts, setLastPublishedCallCounts] = useState<{
    kind: DesktopChatCallKind;
    source: CallInviteSource | null;
    activeCount: number;
    totalCount: number;
  } | null>(null);
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const [initialUnreadCutoff, setInitialUnreadCutoff] = useState<string | null>(
    null,
  );
  const [unreadSnapshotReady, setUnreadSnapshotReady] = useState(false);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [loadingAnchorWindow, setLoadingAnchorWindow] = useState(false);
  const isDesktop = variant === "desktop";
  const renderStatusBackAction = () =>
    !isDesktop && onBack ? (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
        onClick={onBack}
      >
        {t(msg`返回上一页`)}
      </Button>
    ) : null;
  const renderStatusRetryAction = (
    query: { refetch: () => Promise<unknown> },
  ) =>
    !isDesktop ? (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
        onClick={() => {
          void query.refetch();
        }}
      >
        {t(msg`重试读取`)}
      </Button>
    ) : null;
  const renderStatusActions = (query: { refetch: () => Promise<unknown> }) =>
    !isDesktop ? (
      <div className="flex flex-wrap justify-center gap-2">
        {renderStatusRetryAction(query)}
        {renderStatusBackAction()}
      </div>
    ) : null;
  const currentGroupRouteState = useMemo(
    () => parseMobileGroupRouteState(hash),
    [hash],
  );
  const currentMobileGroupRouteHash = useMemo(
    () => buildMobileGroupRouteHash(currentGroupRouteState),
    [currentGroupRouteState],
  );
  const loadMoreRequestRef = useRef<{
    previousCount: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const highlightedWindowRequestRef = useRef<string | null>(null);
  // 走 around-message-id 拉锚点窗口失败（404 / 网络错 / 服务端返回空窗口）
  // 后，原版会落到 loadOlderMessages() 兜底翻历史；但 highlightedMessageId
  // 永远不存在（坏的 deeplink / 已被对方撤回 / 记录已被清空），消息库里压根
  // 找不到 → hasOlderMessages 一直 true、hasHighlightedMessage 一直 false，
  // useEffect 每次 fetch 完都会再触发 loadOlderMessages → 一直翻到最早一条
  // 把整个群历史拉下来，公网 600ms RTT × 40 条/页 在大群里能拉几十秒。
  // 记下"这个 highlight 已经走过 anchor 兜底翻页都没找到"，下次不再翻。
  const failedHighlightRef = useRef<Set<string>>(new Set());
  const handledDesktopCallRequestTokenRef = useRef<number | null>(null);
  // 走查 Round 4：和 use-conversation-thread 对单聊已修的同款问题——下面
  // 「mark group read」effect 之前用 messagesQuery.data?.length 做 dedup，
  // 「查看更多消息」加 60→100 时 length 变化误判成「新消息追加」又打一次
  // POST /read + invalidate conversations。改用"末尾消息 id"——按 length
  // dedup 会被前置历史误触发，按末尾 id 才能区分"新消息追加"和"历史前置"。
  // socket 撑长（AI 回声追加在尾部）时末尾 id 变化仍能正常触发。
  const lastMarkedReadNewestIdRef = useRef<string | null>(null);
  // 走查 Round 4：发送按钮 `disabled={composerPending}` 兜底，但 composerPending
  // 是 sendMutation.isPending 经 React commit 才更新；handleSubmit 进入时
  // `const submittedText = text` 也是闭包读 state——同帧连点 2 次发送，
  // 两次都看到 isPending=false + 同一份 text，两份相同的群消息同时投到群里。
  // 实测移动端在公网慢网下双击发送，群里出 2 条一模一样的消息。submittingRef
  // 同步赋值不走 React render，第一次 click 把它翻 true 之后同帧后续 click
  // 都被早返。await 完整跑完后 finally 解锁。
  const sendingTextRef = useRef(false);
  // 走查 Round 2 同款问题：失败消息上的"重试"按钮 (line ~1690 onRetryMessage)
  // 本身没 pending 状态，retryMessage() 入口虽然校验 message.localStatus ===
  // "failed"，但 setMessages(markSending) 是 React state，同帧第二次 click 时
  // messages 还是 failed → 两份相同的 POST /groups/$id/messages 同时打出去，
  // 服务端 echo 回来都是新 msg id（localMessageId 替换只命中第一份，第二份
  // 服务端消息会作为新增 server 消息进 cache），群里冒出 2 条一样的消息。
  // 按 messageId 上锁，不同 failed 消息互不影响。
  const retryingMessageIdsRef = useRef<Set<string>>(new Set());

  // 走查新会话桌面端群聊 R5：这 4 条共享 cache 全裸跑默认 staleTime（desktop
  // 10s / mobile-web 60s）。桌面端用户在同一段时间里频繁切群聊（聊天列表点
  // 不同群、左侧群通讯录跳转、右键打开独立窗口），thread panel 每次 remount
  // 都会 refetch 这 4 条——即便 desktop-chat-workspace 的 conversations / 旁边
  // chat-details-panel 的 app-group / app-group-members / app-friends 在
  // 几百 ms 前刚拉过（那几处都已经按 15s 对齐）。本面板裸跑 10s 比兄弟观察者
  // 的 15s 短，cache 数据明明还新鲜本观察者却判定过期 → 触发额外 4 路 fetch
  // 公网隧道 ~600ms RTT 累计 ~2.4s 的"切群空白"。统一到 15s，messagesQuery
  // 因为正确性已经强制 refetchOnMount: "always"，不受影响。
  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
    staleTime: 15_000,
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
    staleTime: 15_000,
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    staleTime: 15_000,
  });

  const messagesQuery = useQuery({
    queryKey: ["app-group-messages", baseUrl, groupId, messageLimit],
    queryFn: () => getGroupMessages(groupId, baseUrl, { limit: messageLimit }),
    // 全局 staleTime=60s 让 useQuery 在 mount 时把 60s 内的旧 cache 当 fresh
    // 不 refetch。socket 漏一条群消息（断网/切前后台/event drop）就显示不出。
    // 强制每次挂载 refetch 一次，RTT 一次换正确性。
    refetchOnMount: "always",
  });
  const {
    ref: scrollAnchorRef,
    isAtBottom,
    isAtBottomRef,
    pendingCount,
    suppressNextPendingCount,
    scrollToBottom,
  } = useScrollAnchor<HTMLDivElement>(messages.length);
  const handleMessageMediaReady = useCallback(() => {
    if (isAtBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [isAtBottomRef, scrollToBottom]);
  // 见 conversation-thread-panel 同名函数：容器挂载后 useScrollAnchor 的
  // useLayoutEffect 会同步把 scrollTop 顶到底，scroll 事件触发 onScrollCapture
  // 就把刚出现的 routeContextNotice 立刻 dismiss 掉。isAtBottomRef.current
  // 在 mount auto-scroll 里被 scrollToBottom 写 true 一直保留到用户真手势
  // 拖出贴底窗口 — 用 it 作 user-vs-programmatic 区分。
  const handleScrollDismissRouteContextNotice = () => {
    if (isAtBottomRef.current) {
      return;
    }
    routeContextNotice?.onDismiss?.();
  };
  // composer onChange 走的是用户明确打字意图，不能套 scroll-guard——贴底
  // 状态下 isAtBottomRef === true 会把 typing dismiss 也堵死。
  const handleTypingDismissRouteContextNotice = () => {
    routeContextNotice?.onDismiss?.();
  };

  useEffect(() => {
    setText("");
    setMessages([]);
    setReplyDraft(null);
    setDesktopCallPanelState(null);
    setMobileShortcutRequest(null);
    setSelectionModeActive(false);
    setLastPublishedCallCounts(null);
    setInitialUnreadCount(0);
    setInitialUnreadCutoff(null);
    setUnreadSnapshotReady(false);
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
    setHasOlderMessages(true);
    setLoadingAnchorWindow(false);
    loadMoreRequestRef.current = null;
    highlightedWindowRequestRef.current = null;
    failedHighlightRef.current.clear();
    lastMarkedReadNewestIdRef.current = null;
    retryingMessageIdsRef.current.clear();
  }, [baseUrl, groupId]);

  useEffect(() => {
    if (!messagesQuery.data) {
      return;
    }
    // 同 use-conversation-thread 对单聊的修法：mergeGroupMessageWindow 只追
    // 加不删除，群里"清空 / 撤回 / 删除"后 cache 缩水时，本地 messages 还
    // 留着已经被清掉的消息——用户在已清空的群聊里继续看到旧消息。改成保留
    // 还没 echo 的 local_* 乐观消息，server 消息整体跟 cache 走。
    //
    // 取舍同直聊：mount refetch 在飞期间 socket 投递的新消息可能被 GET
    // 响应覆盖；之前用 "createdAt > cutoff" 兜底反而会让"删除当前最新
    // 一条消息"也命中，删的不被丢回来。race-arrival 自然在下一条 socket
    // 推送里被带回，这里就选简单更可靠的整体替换。
    setMessages((current) => {
      const pendingLocal = current.filter((message) =>
        message.id.startsWith("local_"),
      );
      return mergeGroupMessageWindow(pendingLocal, messagesQuery.data!);
    });
  }, [messagesQuery.data]);

  // 群不存在时，本来 thread 页就是个死页：retry 也是同款 404，用户除了
  // 手动 back / 重新输 URL 没出路。和姊妹子页 details / edit / announcement /
  // background / member-picker 对齐，自动 replace 跳到 /tabs/chat（或
  // routeState 提供的 returnPath），不要把用户卡在 stuck error state。
  // 桌面布局走另一条路径（直接 redirect 到 desktop workspace），不在此处。
  // 走查 Round 5：原本只跳 /tabs/chat，但用户从 /contacts/groups 点进来时
  // returnPath 就是 /contacts/groups，期望应当是退回来源页而不是被翻到
  // 消息列表。其它姊妹子页（details / announcement / edit / picker）都已经
  // 优先 honor routeState.returnPath，这里补齐口径。
  useEffect(() => {
    if (isDesktop) {
      return;
    }
    if (
      groupQuery.isLoading ||
      !isMissingGroupError(groupQuery.error, groupId)
    ) {
      return;
    }
    const candidateReturnPath = currentGroupRouteState.returnPath;
    if (
      candidateReturnPath &&
      !isDesktopOnlyPath(candidateReturnPath)
    ) {
      void navigate({
        to: candidateReturnPath,
        ...(currentGroupRouteState.returnHash
          ? { hash: currentGroupRouteState.returnHash }
          : {}),
        replace: true,
      });
      return;
    }
    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    currentGroupRouteState.returnHash,
    currentGroupRouteState.returnPath,
    groupId,
    groupQuery.error,
    groupQuery.isLoading,
    isDesktop,
    navigate,
  ]);

  useEffect(() => {
    if (isDesktop || !routeMobileShortcutAction) {
      return;
    }

    setMobileShortcutRequest({
      action: routeMobileShortcutAction,
      nonce: Date.now(),
    });
    onRouteMobileShortcutHandled?.();
  }, [isDesktop, onRouteMobileShortcutHandled, routeMobileShortcutAction]);

  const activeConversation = conversationsQuery.data?.find(
    (item) => item.id === groupId && isPersistedGroupConversation(item),
  );
  const memberNameByCharacterId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const member of membersQuery.data ?? []) {
      if (member.memberType !== "character") continue;
      const name = member.memberName?.trim();
      if (name) map.set(member.memberId, name);
    }
    return map;
  }, [membersQuery.data]);

  useEffect(() => {
    if (unreadSnapshotReady || !conversationsQuery.isFetched) {
      return;
    }

    setInitialUnreadCount(activeConversation?.unreadCount ?? 0);
    setInitialUnreadCutoff(activeConversation?.lastReadAt ?? null);
    setUnreadSnapshotReady(true);
  }, [
    activeConversation?.lastReadAt,
    activeConversation?.unreadCount,
    conversationsQuery.isFetched,
    unreadSnapshotReady,
  ]);

  useEffect(() => {
    if (!groupId) {
      return;
    }

    joinConversationRoom({ conversationId: groupId });
    // 走查本会话 R1：和 use-conversation-thread.ts 同款修法。socket disconnect+
    // reconnect 后 server 端是全新的 Socket 实例，原先的 room 全部丢掉；本
    // effect 只在 mount/groupId 切换时 emit 一次 join_conversation，重连后再
    // 没机会重 join。网络抖一下 / 后台切前台 / 公网隧道 token 续期 → 用户
    // 停在原群上，新群消息、AI 回复、typing、conversation_updated 全部送不到，
    // 要手动切走再切回才恢复。监听 connect 事件（reconnect 也走这个）重 emit
    // join_conversation；socket.io 的 join 是 Set 幂等，重复 emit 无副作用。
    const offConnect = onChatSocketConnect(() => {
      joinConversationRoom({ conversationId: groupId });
    });

    const offMessage = onChatMessage((payload) => {
      if (!("groupId" in payload) || payload.groupId !== groupId) {
        return;
      }

      setMessages((current) => upsertIncomingGroupMessage(current, payload));
      // 直接把消息写进 cache：本地 state 已经有新消息，但 cache 没动；
      // 用户离开再回来时 useQuery 在移动端 staleTime=60s 内不会 refetch，
      // 看不到这条群消息。setQueriesData 直接合并进所有 messageLimit 变体
      // 的 cache，下次挂载立刻就在，不依赖 refetch RTT。同时 cache 长度
      // 会增加，下方"messages 长度变化时标已读 + 刷会话列表"的 effect 会
      // 自动触发——不在这里重复调，避免每条群消息打两次 markGroupRead 和
      // 两次 conversations refetch（公网隧道 ~600ms RTT 下会肉眼可见）。
      queryClient.setQueriesData<GroupMessage[]>(
        { queryKey: ["app-group-messages", baseUrl, groupId] },
        (current) => upsertServerMessageInCache(current, payload),
      );
    });

    const offConversationUpdated = onConversationUpdated((payload) => {
      if (payload.type !== "group" || payload.id !== groupId) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, groupId],
      });
      // perf：group.service.ts 里 emitGroupConversationUpdated 的所有调用点
      // （create/update/addMember/removeMember/leave/pin/mute/preferences/
      // announcement/owner-profile）都只动 group 元数据，不会写入 group_messages
      // 表——sendSystemMessage 虽然定义着但全代码库没人 call。invalidate
      // app-group-messages 会强制 GET /groups/$id/messages?limit=60（公网隧道
      // ~600ms RTT × N 条），白白浪费。messages cache 仍由 onChatMessage 路径
      // 维护，幂等不漏。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    return () => {
      offConnect();
      offMessage();
      offConversationUpdated();
    };
  }, [baseUrl, groupId, queryClient]);

  useEffect(() => {
    if (!groupId || !unreadSnapshotReady) {
      return;
    }

    // dedup：messages 未到 / 空时不打。按"末尾消息 id"去重——「查看更多
    // 消息」(60→100, 前置历史) 末尾 id 不变，不再误打 mark-read；socket
    // 撑长（AI 回声追加在尾部）时末尾 id 变化仍能正常触发。和单聊
    // (use-conversation-thread) Round 1 同款修法。
    const data = messagesQuery.data;
    if (!data || data.length === 0) {
      return;
    }
    const newestId = data[data.length - 1]?.id ?? null;
    if (!newestId || lastMarkedReadNewestIdRef.current === newestId) {
      return;
    }
    lastMarkedReadNewestIdRef.current = newestId;

    // 公网隧道偶发超时 / cloud token 过期重连那几百 ms 都会让 markGroupRead 抛
     // —— 不 catch 直接落到 unhandledrejection，污染 telemetry。与 direct
     // 版本 (use-conversation-thread.ts) 对齐：吞掉错误，下次末尾 id 变化时
     // effect 会重跑、自动重试。finally 仍然 invalidate 让列表 badge 同步。
    void markGroupRead(groupId, baseUrl)
      .catch(() => {})
      .finally(() => {
        void queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      });
  }, [
    baseUrl,
    groupId,
    messagesQuery.data,
    queryClient,
    unreadSnapshotReady,
  ]);

  const sendMutation = useMutation({
    mutationFn: async (input: {
      payload: SendGroupMessageRequest;
      localMessageId: string;
    }) => {
      const message = await sendGroupMessage(groupId, input.payload, baseUrl);
      return {
        ...input,
        message,
      };
    },
    onSuccess: async (result) => {
      setMessages((current) =>
        replaceGroupLocalMessage(current, result.localMessageId, result.message),
      );
      // perf：以前 invalidate(["app-group-messages", ...]) 每发一条群消息
      // 都会触发整个群消息列表 GET 重拉（公网隧道 ~600ms RTT × N=60 条），
      // 但服务端响应里的 result.message 已经是 canonical 形态，跟 socket
      // onChatMessage echo 走的是同一个 upsertServerMessageInCache。改用
      // setQueriesData 直接把新消息合并进所有 messageLimit cache 变体，省
      // 一次 GET；socket echo 到时也是同样的 upsert，幂等。
      queryClient.setQueriesData<GroupMessage[]>(
        { queryKey: ["app-group-messages", baseUrl, groupId] },
        (current) => upsertServerMessageInCache(current, result.message),
      );
      // 保留 conversations invalidate：群消息会改 lastMessage / lastActivityAt
      // / 在 socket echo 没到时仍要让消息列表 badge 即时同步。chat-list-page
      // 的 onChatMessage 也会触发同样的 invalidate，重复一次幂等。
      // 本会话 R1：原本 `await` 这条 invalidate，react-query mutation 的
      // `isPending` 等 onSuccess promise 完全 resolve 才翻 false——也就是说
      // 用户发出消息后，下一次"发送"按钮被解锁要等公网隧道再多走一个 RTT
      // (~600ms) 去刷 conversations。和单聊 use-conversation-thread 的对应
      // 路径口径对齐：消息已经走 setQueriesData 进 cache + thread 立刻渲染，
      // conversations 的列表 badge 延迟一帧到达是可接受体验；下方 ChatComposer
      // pending=isPending 把发送按钮卡住的是这条 await，去掉后连发体感顺畅。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (_error, input) => {
      setMessages((current) =>
        markThreadMessagesFailed(current, [input.localMessageId]),
      );
    },
  });

  const sendCallInviteMutation = useMutation({
    mutationFn: (input: {
      kind: DesktopChatCallKind;
      status: GroupCallInviteStatus;
      activeCount: number;
      totalCount: number;
      source: CallInviteSource;
      durationMs?: number;
      startedAt?: string;
    }) =>
      sendGroupMessage(
        groupId,
        {
          text: buildGroupCallInviteMessage(
            input.kind,
            groupQuery.data?.name || t(msg`当前群聊`),
            {
              activeCount: input.activeCount,
              totalCount: input.totalCount,
            },
            input.status,
            undefined,
            input.source,
            undefined,
            input.durationMs,
            input.startedAt,
          ),
        },
        baseUrl,
      ),
    onSuccess: (message) => {
      // perf：和 sendMutation Round 3 同款修法——sendGroupMessage 服务端响应
      // 已经是 canonical GroupMessage，跟 socket onChatMessage echo 走同一个
      // upsertServerMessageInCache，不需要再 invalidate(["app-group-messages"])
      // 触发整个列表 GET 重拉（公网隧道 ~600ms RTT × N 条）。setQueriesData
      // 直接合并进所有 messageLimit 变体；socket echo 到时再 upsert 一次幂等。
      // 桌面群语音/视频面板上"开始通话/发送邀请/同步在席人数/挂断"4 个动作
      // 都走这条 mutation，连续 4 次状态变化原版 = 4 次群消息全量 GET。
      queryClient.setQueriesData<GroupMessage[]>(
        { queryKey: ["app-group-messages", baseUrl, groupId] },
        (current) => upsertServerMessageInCache(current, message),
      );
      // 本会话 R1：和 sendMutation 同款——await invalidateQueries 把 mutation
      // 的 isPending 一直撑到 conversations refetch 回来（公网隧道 ~600ms
      // RTT），桌面群通话面板上"开始/邀请/同步/挂断"4 次按钮 disabled 直到
      // invalidate 完成。fire-and-forget，inviteNoticePending / endNoticePending
      // 能立刻翻 false 让用户继续下一步操作；scrollToBottom 也不再等 RTT。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      scrollToBottom("smooth");
    },
  });

  // 走查本会话 R1：`messages` 已经由 mergeGroupMessageWindow / upsertIncomingGroupMessage /
  // replaceGroupLocalMessage / sortThreadMessages 全链路保证按 createdAt 升序——
  // 这里再 [...messages].sort 一次纯属重复劳动：O(N log N) 比较 × 每次 2 个
  // parseTimestamp 调用，200 条消息 × typing tick / socket echo / state mutation
  // 触发的高频 re-render 是热点 CPU 浪费。直接复用 messages 引用，避免每次 render
  // 还要新建一个 array 让下游 useMemo (renderableMessages / unreadMarkerMessageId)
  // 全部跟着重算。
  const enqueueOutgoingGroupMessage = useCallback(
    (payload: SendGroupMessageRequest) => {
      const optimisticMessage = buildOptimisticGroupMessage({
        payload,
        groupId,
        ownerId,
        senderName: ownerName?.trim() || t(msg`我`),
        senderAvatar: ownerAvatar,
      });
      setMessages((current) =>
        mergeGroupMessageWindow(current, [optimisticMessage]),
      );
      return optimisticMessage.id;
    },
    // t 必须进 deps：locale 切换后 t 引用会变；漏掉这条 callback 会用旧
    // locale 的 fallback "我" 给乐观消息——多语言用户能在群里看到一条"我"
    // 还是英文 "Me"，和当前 UI locale 不一致一帧才会被服务端 echo 覆盖。
    [groupId, ownerAvatar, ownerId, ownerName, t],
  );
  const submitOutgoingGroupMessage = useCallback(
    async (payload: SendGroupMessageRequest) => {
      const localMessageId = enqueueOutgoingGroupMessage(payload);
      // mutateAsync 抛错（HTTP 4xx/5xx/网络断）后 sendMutation.onError 已经把
      // 这条消息标 failed + 在 ChatComposer 的 error 槽里挂出错误提示，调用方
      // 都是 await 顺序控制（清 replyDraft / scrollToBottom / track）。这里
      // 不吞会让 rejection 经 chat-composer 的 onSendSticker / onSendAttachment
      // / onSubmit 等回调一路冒到 button onClick，落到 window.unhandledrejection
      // → 污染 telemetry errors。对齐单聊 use-conversation-thread 的 runSendMutation
      // 兜底。
      try {
        await sendMutation.mutateAsync({
          payload,
          localMessageId,
        });
      } catch {
        // onError 已处理
      }
    },
    [enqueueOutgoingGroupMessage, sendMutation],
  );
  const friendMap = useMemo<Map<string, FriendListItem>>(
    () =>
      new Map(
        (friendsQuery.data ?? []).map((item) => [item.character.id, item] as const),
      ),
    [friendsQuery.data],
  );
  // 新一轮走查 R1：原 resolveCharacterDisplayName 先看 friend，命中就用
  // friend.friendship.remarkName || friend.character.name —— 后者拿的是
  // character 当前 name，character 在另一台设备 / 后台被改名 / 测试落库
  // 改成「走查词条_177886...」时，同一个角色：
  //   - 群详情 / picker 走 [[group-member-picker-page]] R3 修法用 memberName 显示 "阿巡"
  //   - 但群聊消息冒泡 senderName 依然走这里读 friend.character.name 显示 "走查词条_..."
  // 实测同一个角色（char-manual-axun）老消息 senderName 落库 "阿巡" 新消息落
  // "走查词条_..."，群里看自己的对话上下文 5 条消息冒出 3 个不同 sender 名，
  // 完全分不清谁在说话。groupMembers 已经在面板里查了一份，按 characterId 反查
  // memberName（joinedAt 时落，等价"群昵称"，最稳）作首选；remarkName 用户主动
  // 设的备注还在前面；character.name / messages.senderName 仅在前两者都没有时
  // 回退。
  const resolveCharacterDisplayName = useCallback(
    (characterId?: string | null, fallbackName?: string | null) => {
      if (characterId) {
        const friend = friendMap.get(characterId);
        const remarkName = friend?.friendship.remarkName?.trim();
        if (remarkName) return remarkName;
        const memberName = memberNameByCharacterId.get(characterId);
        if (memberName) return memberName;
        if (friend?.character.name) return friend.character.name;
      }

      return fallbackName?.trim() || t(msg`群成员`);
    },
    [friendMap, memberNameByCharacterId, t],
  );
  const renderableMessages = useMemo(
    () =>
      messages.map((message) =>
        message.senderType === "character"
          ? {
              ...message,
              senderName: resolveCharacterDisplayName(
                message.senderId,
                message.senderName,
              ),
            }
          : message,
      ),
    [messages, resolveCharacterDisplayName],
  );
  // R65：和姊妹 conversation-thread-panel R9 + R10 同款 announcer 链路。
  // groupId 切换时重置基线，避免历史一次性念出来；mount 之后到达的真消息
  // 才广播。
  useEffect(() => {
    characterIncomingAnnouncerMountedRef.current = false;
    characterIncomingAnnouncerSeenIdRef.current = null;
    setCharacterIncomingAnnouncement("");
  }, [groupId]);
  useEffect(() => {
    let latestCharacterMessage: ChatRenderableMessage | undefined;
    for (let i = renderableMessages.length - 1; i >= 0; i -= 1) {
      const candidate = renderableMessages[i];
      if (candidate?.senderType === "character") {
        latestCharacterMessage = candidate;
        break;
      }
    }
    if (!latestCharacterMessage) {
      characterIncomingAnnouncerMountedRef.current = true;
      return;
    }
    if (!characterIncomingAnnouncerMountedRef.current) {
      characterIncomingAnnouncerMountedRef.current = true;
      characterIncomingAnnouncerSeenIdRef.current = latestCharacterMessage.id;
      return;
    }
    if (
      characterIncomingAnnouncerSeenIdRef.current === latestCharacterMessage.id
    ) {
      return;
    }
    characterIncomingAnnouncerSeenIdRef.current = latestCharacterMessage.id;
    const senderName =
      latestCharacterMessage.senderName?.trim() || t(msg`群成员`);
    const rawPreview =
      resolveMessageSemanticPreview(latestCharacterMessage, {
        maxChars: 60,
        bracketedFallback: true,
      }) || t(msg`新消息`);
    const ANNOUNCEMENT_MAX_CHARS = 60;
    const preview =
      rawPreview.length > ANNOUNCEMENT_MAX_CHARS
        ? `${rawPreview.slice(0, ANNOUNCEMENT_MAX_CHARS).trim()}…`
        : rawPreview;
    setCharacterIncomingAnnouncement(t(msg`${senderName}：${preview}`));
  }, [groupId, renderableMessages, t]);
  // 走查移动端群聊 R1：和姊妹路径 conversation-thread-panel.tsx「电脑端单聊
  // R1」(commit c230f9ae0) 同款修法——原版无 highlightedMessageId 时也 .some
  // 全表扫 messages 找 `m.id === undefined`，全程必然 false 但走完整条 O(n)。
  // 长群 200+ 条历史叠 typing tick / socket echo / state 一改就 re-render，
  // 每帧 200 次字符串比较纯白用功。绝大多数会话进来没有 highlight（只在
  // 「查找聊天记录」/ 「消息提醒」/ 「群公告点击」跳转时才有 highlightedMessageId），
  // 常驻短路成 false，让下游 useEffect 的 hasHighlightedMessage dep 也稳住
  // false 引用避免无意义重跑。
  const hasHighlightedMessage = highlightedMessageId
    ? messages.some((message) => message.id === highlightedMessageId)
    : false;
  const unreadMarkerMessageId = useMemo(
    () =>
      findFirstUnreadMessageId(
        messages,
        initialUnreadCutoff,
        initialUnreadCount > 0,
      ),
    [initialUnreadCount, initialUnreadCutoff, messages],
  );
  const sendError =
    sendMutation.error instanceof Error
      ? describeRequestError(sendMutation.error)
      : null;
  const effectiveBackground = backgroundQuery.data?.effectiveBackground ?? null;
  // 走查 R73 续：和姊妹单聊 R73 同款——避免每次 render 都 new style 对象
  // 触发 React 给容器 div 做无意义的 style 重设。
  const backgroundStyle = useMemo(
    () => buildChatBackgroundStyle(effectiveBackground),
    [effectiveBackground],
  );
  const announcement = groupQuery.data?.announcement?.trim() ?? "";
  // 走查新一轮 R2：和姊妹单聊路径 conversation-thread-panel.tsx「走查新一轮 R1」
  // 同款修法——原版直接在 JSX 里 `threadContext={{ id, type, title }}` 每 render
  // new 一个对象，ChatMessageList 内 imageMessages useMemo（line 1768）把
  // threadContext 整对象作 dep，每个父帧失效 → 每帧 filter(visibleMessages)
  // 找出所有图片消息再 map 一遍。长群聊滚到 100+ 条历史里有 30 张图时这层
  // O(n) 每个 typing tick / socket echo / 任何 state mutation 都白跑一次，
  // standaloneViewerItems / favorite buildContext 等 6 处下游 useMemo 跟着重算。
  // 把 group/title 引用稳定下来，跟单聊口径对齐。
  const groupTitle = groupQuery.data?.name || t(msg`群聊`);
  const messageListThreadContext = useMemo(
    () => ({
      id: groupId,
      type: "group" as const,
      title: groupTitle,
    }),
    [groupId, groupTitle],
  );
  const mobileSubtitle = membersQuery.data
    ? groupQuery.data?.isMuted
      ? t(msg`${membersQuery.data.length} 人群聊 · 免打扰`)
      : t(msg`${membersQuery.data.length} 人群聊`)
    : groupQuery.data?.isMuted
      ? t(msg`群聊 · 免打扰`)
      : undefined;

  useThreadEntryScrollToBottom({
    threadKey: groupId,
    ready:
      !messagesQuery.isLoading &&
      !groupQuery.isLoading &&
      unreadSnapshotReady,
    disabled: Boolean(highlightedMessageId),
    containerRef: scrollAnchorRef,
  });

  useEffect(() => {
    const loadedCount = messagesQuery.data?.length ?? 0;
    const pendingLoad = loadMoreRequestRef.current;

    // 走查 Round 1：原版没区分"loadMore 飞行中"vs"已完成"，setMessageLimit
    // 一翻倍 queryKey 立刻换 → messagesQuery.data 短暂回 undefined（没配
    // placeholderData / keepPreviousData），effect 跑 loadedCount=0 <
    // messageLimit=100 → setHasOlderMessages(false)，"查看更多消息"按钮
    // 在飞行期间消失；fetch 回来后第一个 branch 不再触发 hasOlderMessages
    // 也没机会回 true，用户被卡在"看不到再翻"状态。飞行中（pendingLoad
    // 或 isFetching）跳过定调，等 fetch 完成后下方分支正式判定。
    if (!pendingLoad && !messagesQuery.isFetching) {
      setHasOlderMessages(loadedCount >= messageLimit);
    }

    if (!pendingLoad || messagesQuery.isFetching) {
      return;
    }

    loadMoreRequestRef.current = null;
    if (loadedCount <= pendingLoad.previousCount) {
      setHasOlderMessages(false);
      return;
    }

    // load-more 收完一页后定调：满 messageLimit 视为还有更老的；少于
    // messageLimit 说明已翻到群消息开头。
    setHasOlderMessages(loadedCount >= messageLimit);

    window.requestAnimationFrame(() => {
      const element = scrollAnchorRef.current;
      if (!element) {
        return;
      }

      element.scrollTop =
        pendingLoad.scrollTop +
        (element.scrollHeight - pendingLoad.scrollHeight);
    });
  }, [
    messageLimit,
    messagesQuery.data,
    messagesQuery.isFetching,
    scrollAnchorRef,
  ]);

  useEffect(() => {
    if (!highlightedMessageId || !hasHighlightedMessage) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const targetSelector = escapeIdSelector(
        `chat-message-${highlightedMessageId}`,
      );
      const target = scrollAnchorRef.current?.querySelector<HTMLElement>(
        `#${targetSelector}`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasHighlightedMessage, highlightedMessageId, scrollAnchorRef]);

  const sendAttachmentMessage = async (
    payload: ChatComposerAttachmentPayload,
  ) => {
    const replyText = replyDraft ? encodeChatReplyText("", replyDraft) : "";

    if (payload.type === "image") {
      const formData = new FormData();
      formData.set("file", payload.file);
      formData.set("width", String(payload.width ?? ""));
      formData.set("height", String(payload.height ?? ""));
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "image") {
        throw new Error(t(msg`图片上传结果异常。`));
      }

      setReplyDraft(null);
      await submitOutgoingGroupMessage({
        type: "image",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "file") {
      const formData = new FormData();
      formData.set("file", payload.file);
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "file") {
        throw new Error(t(msg`文件上传结果异常。`));
      }

      setReplyDraft(null);
      await submitOutgoingGroupMessage({
        type: "file",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "voice") {
      const formData = new FormData();
      formData.set("file", payload.file, payload.fileName);
      if (payload.durationMs) {
        formData.set("durationMs", String(payload.durationMs));
      }
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "voice") {
        throw new Error(t(msg`语音上传结果异常。`));
      }

      setReplyDraft(null);
      await submitOutgoingGroupMessage({
        type: "voice",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "contact_card") {
      setReplyDraft(null);
      await submitOutgoingGroupMessage({
        type: "contact_card",
        text: replyText || undefined,
        attachment: payload.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    setReplyDraft(null);
    await submitOutgoingGroupMessage({
      type: "location_card",
      text: replyText || undefined,
      attachment: payload.attachment,
    });
    scrollToBottom("smooth");
  };

  const handleSendSticker = async (sticker: StickerAttachment) => {
    setReplyDraft(null);
    await submitOutgoingGroupMessage({
      type: "sticker",
      text: replyDraft ? encodeChatReplyText("", replyDraft) : undefined,
      attachment: sticker,
    });
    scrollToBottom("smooth");
  };

  const handleSendPresetText = async (presetText: string) => {
    setText("");
    setReplyDraft(null);
    await submitOutgoingGroupMessage({
      text: replyDraft
        ? encodeChatReplyText(presetText, replyDraft)
        : presetText.trim(),
    });
    scrollToBottom("smooth");
  };

  const handleSubmit = async () => {
    if (sendingTextRef.current) {
      return;
    }
    const submittedText = text;
    if (!submittedText.trim()) {
      return;
    }
    sendingTextRef.current = true;
    const hadReply = Boolean(replyDraft);
    setText("");
    setReplyDraft(null);
    try {
      await submitOutgoingGroupMessage({
        text: replyDraft ? encodeChatReplyText(submittedText, replyDraft) : submittedText.trim(),
      });
      track("chat_message_sent", {
        conversationKind: "group",
        kind: "text",
        hasReply: hadReply,
        textLength: submittedText.length,
      });
      scrollToBottom("smooth");
    } finally {
      sendingTextRef.current = false;
    }
  };

  const retryMessage = useCallback(
    async (messageId: string) => {
      // 同帧双击同一条 failed 消息的"重试"按钮：setMessages(markSending) 还没
      // commit，下一次 click 仍看到 localStatus==="failed" → 飞两份相同 POST。
      // 按 messageId 上锁，finally 解锁；不同 failed 消息互不影响。
      if (retryingMessageIdsRef.current.has(messageId)) {
        return;
      }
      const failedMessage = messages.find(
        (message) =>
          message.id === messageId && message.localStatus === "failed",
      );
      if (!failedMessage) {
        return;
      }

      const payload = buildGroupRetryPayload(failedMessage);
      if (!payload) {
        throw new Error(t(msg`这条消息暂时无法重试发送。`));
      }

      retryingMessageIdsRef.current.add(messageId);
      setMessages((current) => markThreadMessageSending(current, messageId));
      // 同上：mutateAsync 抛错落到 unhandledrejection。message-list 调
      // retryMessage 时是 `(message) => retryMessage(message.id)` 不 await
      // 不 catch，rejection 没人处理。onError 已经把 message 标 failed。
      try {
        await sendMutation.mutateAsync({
          payload,
          localMessageId: messageId,
        });
      } catch {
        // onError 已处理
      } finally {
        retryingMessageIdsRef.current.delete(messageId);
      }
    },
    // t 必须进 deps：上方 throw new Error(t(msg`这条消息暂时无法重试...`))
    // 用了 t；和 enqueueOutgoingGroupMessage 同理，locale 切换后旧 closure
    // 会抛上个 locale 的报错文案。
    [messages, sendMutation, t],
  );

  const loadOlderMessages = useCallback(async () => {
    if (messagesQuery.isFetching || !hasOlderMessages) {
      return;
    }

    const element = scrollAnchorRef.current;
    suppressNextPendingCount();
    loadMoreRequestRef.current = {
      previousCount: messagesQuery.data?.length ?? 0,
      scrollHeight: element?.scrollHeight ?? 0,
      scrollTop: element?.scrollTop ?? 0,
    };
    setMessageLimit((current) => current + HISTORY_PAGE_SIZE);
  }, [
    hasOlderMessages,
    messagesQuery.data?.length,
    messagesQuery.isFetching,
    scrollAnchorRef,
    suppressNextPendingCount,
  ]);

  const loadAnchorWindow = useCallback(
    async (messageId: string) => {
      const normalizedMessageId = messageId.trim();
      if (!normalizedMessageId || loadingAnchorWindow) {
        return false;
      }

      setLoadingAnchorWindow(true);
      try {
        const windowMessages = await getGroupMessages(groupId, baseUrl, {
          aroundMessageId: normalizedMessageId,
          before: 24,
          after: 24,
        });
        if (!windowMessages.length) {
          return false;
        }

        suppressNextPendingCount();
        setMessages((current) =>
          mergeGroupMessageWindow(current, windowMessages),
        );
        return windowMessages.some(
          (message) => message.id === normalizedMessageId,
        );
      } catch {
        return false;
      } finally {
        setLoadingAnchorWindow(false);
      }
    },
    [baseUrl, groupId, loadingAnchorWindow, suppressNextPendingCount],
  );

  useEffect(() => {
    if (
      !highlightedMessageId ||
      hasHighlightedMessage ||
      messagesQuery.isFetching ||
      loadingAnchorWindow
    ) {
      return;
    }

    // 此 highlight 之前已经"anchor + 翻全程"都找不到，不再继续翻。
    if (failedHighlightRef.current.has(highlightedMessageId)) {
      return;
    }

    if (highlightedWindowRequestRef.current === highlightedMessageId) {
      if (hasOlderMessages) {
        void loadOlderMessages();
      } else {
        // 已经翻到最早一条仍然没找到 → 锁住，不再重新触发兜底翻页。
        failedHighlightRef.current.add(highlightedMessageId);
      }
      return;
    }

    highlightedWindowRequestRef.current = highlightedMessageId;
    void loadAnchorWindow(highlightedMessageId).then((found) => {
      if (found) {
        return;
      }
      if (!hasOlderMessages) {
        failedHighlightRef.current.add(highlightedMessageId);
        return;
      }
      void loadOlderMessages();
    });
  }, [
    hasHighlightedMessage,
    hasOlderMessages,
    highlightedMessageId,
    loadAnchorWindow,
    loadOlderMessages,
    loadingAnchorWindow,
    messagesQuery.isFetching,
  ]);

  const replyPreview = replyDraft
    ? {
        senderName: replyDraft.senderName,
        text: replyDraft.quotedText?.trim() || replyDraft.previewText,
        modeLabel: replyDraft.quotedText ? t(msg`部分引用`) : undefined,
      }
    : null;
  const mentionCandidates = useMemo(() => {
    const candidates: Array<{
      id: string;
      name: string;
      mentionName?: string;
      subtitle?: string;
      avatar?: string | null;
    }> = [
      {
        id: "mention-all",
        name: t(msg`所有人`),
        subtitle: t(msg`提醒全部群成员`),
        avatar: null,
      },
    ];
    const seenIds = new Set<string>();

    for (const member of membersQuery.data ?? []) {
      if (member.memberType !== "character") {
        continue;
      }

      // 走查 R7：char-default-self 是用户的自我镜像，本质就是"自己"。
      // create-group-page / group-member-picker-page (add 模式) 都已经在选人
      // 阶段把它过滤掉，但 yuanzui0728 这种老账号在 R1 前建的群里仍然落了
      // memberType=character 的 SELF 行（实测 78a3d894 群里挂着「我自己」），
      // 之前漏掉的 mention picker 还能看到「@我自己」候选——选了就在群里
      // 插出一条 @自己 的消息，加上 typing 走 character 路径还会冒出
      // "我自己 正在回复..."，本质就是用户在自言自语。和姊妹页选人阶段的
      // 过滤口径对齐，渲染时直接跳过 SELF。
      if (member.memberId === SELF_CHARACTER_ID) {
        continue;
      }

      if (seenIds.has(member.memberId)) {
        continue;
      }

      seenIds.add(member.memberId);
      const rawName = member.memberName?.trim() || member.memberId;
      const displayName = resolveCharacterDisplayName(member.memberId, rawName);
      const roleLabel =
        member.role === "admin" ? t(msg`管理员`) : t(msg`群成员`);
      // 走查电脑端群聊 R3：picker 展示用 displayName（含 friend.remarkName "小明"
      // 的话用户期望看到这个），但插入到 message text 的 mention token 走 rawName
      // ——server 端 group-reply-planner.service.ts line 64-68 的 aliases 只看
      // [member.memberName, character.name]，rawName 是 member.memberName 的去
      // 空值兜底，能被服务端 isExplicitTarget 命中。displayName === rawName 时
      // mentionName 不挂，applyMentionCandidate 自然 fallback 到 name。
      candidates.push({
        id: member.memberId,
        name: displayName,
        mentionName: displayName !== rawName ? rawName : undefined,
        subtitle:
          displayName !== rawName
            ? t(msg`昵称：${rawName} · ${roleLabel}`)
            : roleLabel,
        avatar: member.memberAvatar,
      });
    }

    return candidates;
  }, [membersQuery.data, resolveCharacterDisplayName, t]);

  const handleReplyMessage = (
    message: ChatRenderableMessage,
    options?: {
      quotedText?: string;
    },
  ) => {
    const senderName =
      message.senderType === "user"
        ? t(msg`我`)
        : message.senderName?.trim() || t(msg`群成员`);
    const previewText = describeReplyPreview(t, message);
    const quotedText = options?.quotedText?.trim();
    setReplyDraft({
      messageId: message.id,
      senderName,
      previewText,
      quotedText: quotedText || undefined,
    });
  };

  const [callUnavailableKind, setCallUnavailableKind] =
    useState<DesktopChatCallKind | null>(null);
  // 同 conversation-thread-panel Round 1 修复：useEffect 把 handleDesktopCallAction
  // 列进 deps，inline fn 每 render 换引用 → effect 每 render 都跑（token guard
  // 是兜底，不是节流）。useCallback 固化引用。
  const handleDesktopCallAction = useCallback(
    (kind: DesktopChatCallKind) => {
      setCallUnavailableKind(kind);
    },
    [],
  );

  // 走查移动端群聊 R1：和姊妹路径 conversation-thread-panel.tsx「新会话 R1」
  // (startDirectCallFiredRef line 442-480) 同款修法——mobile 群「拨打通话」有
  // 两条入口：
  //   1) MobileChatThreadHeader 顶部「语音/视频通话」icon → 走 navigate，header
  //      内部有 actionFiredRef 守住同帧双击（commit 222ec0680）。
  //   2) ChatComposer 的 + 面板 (MobileChatPlusPanel) 里的 voice-call/video-call
  //      tile → 通过 onStartVoiceCall/onStartVideoCall props 传进来，下方 JSX
  //      原本直接 inline `void navigate({...})`，没挂 disabled / 没同步 ref 守。
  // 入口 2 同帧 <16ms 双击就 push 2 条相同 history 项，用户从 call 屏返回还要
  // 按 2 次返回才能回到群聊。把 onStartVoiceCall/onStartVideoCall 改成统一走
  // startGroupCall，给它补 sync ref 锁；header 路径不受影响（header 的 guardAction
  // 已经兜了），多一层无副作用。rAF 复位让 mount 内 navigate 完毕（page unmount
  // 前的窗口）后还能开下一轮通话（罕见但保留语义一致）。
  const startGroupCallFiredRef = useRef(false);
  const startGroupCall = useCallback(
    (kind: DesktopChatCallKind) => {
      if (startGroupCallFiredRef.current) {
        return;
      }
      startGroupCallFiredRef.current = true;
      void navigate({
        to:
          kind === "voice"
            ? "/group/$groupId/voice-call"
            : "/group/$groupId/video-call",
        params: { groupId },
        ...(currentMobileGroupRouteHash
          ? { hash: currentMobileGroupRouteHash }
          : {}),
      });
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          startGroupCallFiredRef.current = false;
        });
      }
    },
    [currentMobileGroupRouteHash, groupId, navigate],
  );

  // 走查移动端群聊 R1：mobile 群聊「群公告」上方 banner (line ~1582) onClick 走
  // `void navigate({to:"/group/$id/details"})` 没挂 disabled / 没同步 ref 守，
  // 同帧双击 push 2 条相同 history。MobileChatThreadHeader 的「...」 onMore
  // 也跳详情但 header 内部有 actionFiredRef 兜（commit 222ec0680），这条 banner
  // 在 header 外面是独立的 button，guard 漏掉。和 startGroupCall 同款 rAF 复位
  // pattern，确保 mount 内 navigate 完毕窗口外仍可重试。
  const openGroupDetailsFiredRef = useRef(false);
  const openGroupDetails = useCallback(() => {
    if (openGroupDetailsFiredRef.current) {
      return;
    }
    openGroupDetailsFiredRef.current = true;
    void navigate({
      to: "/group/$groupId/details",
      params: { groupId },
      ...(currentMobileGroupRouteHash
        ? { hash: currentMobileGroupRouteHash }
        : {}),
    });
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        openGroupDetailsFiredRef.current = false;
      });
    }
  }, [currentMobileGroupRouteHash, groupId, navigate]);

  useEffect(() => {
    if (!isDesktop || !desktopCallRequest) {
      return;
    }

    if (handledDesktopCallRequestTokenRef.current === desktopCallRequest.token) {
      return;
    }

    handledDesktopCallRequestTokenRef.current = desktopCallRequest.token;
    handleDesktopCallAction(desktopCallRequest.kind);
    onDesktopCallRequestHandled?.(desktopCallRequest.token);
  }, [
    desktopCallRequest,
    handleDesktopCallAction,
    isDesktop,
    onDesktopCallRequestHandled,
  ]);

  // 视频通话尚未上线：mobile 端 /group/$groupId/video-call 路由会被
  // group-video-call-page mobile 分支重定向回 /group/$groupId?callUnavailable=video。
  // 这里消费 query → 弹「敬请期待」dialog，再把 query 抹掉，避免按返回键
  // 反复触发。和 conversation-thread-panel 同款路径。
  const groupRouteSearch = useSearch({ strict: false }) as {
    callUnavailable?: string;
  };
  const groupCallUnavailableSearch = groupRouteSearch.callUnavailable;
  useEffect(() => {
    if (isDesktop || groupCallUnavailableSearch !== "video") {
      return;
    }
    setCallUnavailableKind("video");
    void navigate({
      to: "/group/$groupId",
      params: { groupId },
      search: {},
      replace: true,
      ...(currentMobileGroupRouteHash
        ? { hash: currentMobileGroupRouteHash }
        : {}),
    });
  }, [
    currentMobileGroupRouteHash,
    groupCallUnavailableSearch,
    groupId,
    isDesktop,
    navigate,
  ]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop
          ? "bg-[color:var(--surface-secondary)]"
          : "bg-[color:var(--bg-canvas)]"
      }`}
    >
      {isDesktop ? (
        <header className="relative z-20 flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 py-3">
          <div className="min-w-0 flex-1 px-1 py-1">
            <div className="truncate text-[length:var(--text-title)] font-medium text-[color:var(--text-primary)]">
              {groupQuery.data?.name || t(msg`群聊`)}
            </div>
            <div className="mt-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
              {membersQuery.data
                ? t(msg`${membersQuery.data.length} 人群聊`)
                : t(msg`群聊`)}
            </div>
          </div>

          <div className="hidden items-center xl:flex">
            <DesktopChatHeaderActions
              activePanelMode={desktopSidePanelMode}
              containerRef={desktopHeaderActionsRef}
              onToggleHistory={() => onToggleDesktopHistory?.()}
              onToggleDetails={() => onToggleDesktopDetails?.()}
              onSelectCall={handleDesktopCallAction}
            />
          </div>
        </header>
      ) : (
        <MobileChatThreadHeader
          title={groupQuery.data?.name || t(msg`群聊`)}
          subtitle={mobileSubtitle}
          onBack={onBack}
          actions={[
            {
              key: "voice-call",
              icon: Phone,
              label: t(msg`语音通话`),
              onClick: () => {
                void navigate({
                  to: "/group/$groupId/voice-call",
                  params: { groupId },
                  ...(currentMobileGroupRouteHash
                    ? { hash: currentMobileGroupRouteHash }
                    : {}),
                });
              },
            },
            {
              key: "video-call",
              icon: Video,
              label: t(msg`视频通话`),
              // 视频通话功能未上线：顶栏点击不再 navigate 进半成品 call 屏，
              // 直接复用已有的 FeatureUnavailableDialog 路径。
              onClick: () => setCallUnavailableKind("video"),
            },
          ]}
          onMore={() => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
              ...(currentMobileGroupRouteHash
                ? { hash: currentMobileGroupRouteHash }
                : {}),
            });
          }}
        />
      )}

      {isDesktop ? (
        <div className="flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 py-3">
          <button
            type="button"
            onClick={() => {
              onOpenDesktopAnnouncementDetails?.();
            }}
            className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-90"
          >
            <span className="mt-0.5 shrink-0 rounded-full bg-[color:var(--brand-primary)]/8 px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-[color:var(--brand-primary)]">
              {t(msg`群公告`)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[length:var(--text-caption)] text-[color:var(--text-primary)]">
                {announcement || t(msg`暂无群公告，点击填写本群说明。`)}
              </div>
              <div className="mt-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                {announcement
                  ? t(msg`最近更新 ${formatTimestamp(groupQuery.data?.updatedAt)}`)
                  : t(msg`群接龙与群协作入口先收口到聊天信息侧栏`)}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              if (onOpenDesktopAnnouncementDetails) {
                onOpenDesktopAnnouncementDetails();
                return;
              }

              void navigate({
                to: "/tabs/chat",
                hash: buildDesktopChatRouteHash({
                  conversationId: groupId,
                  panel: "details",
                  detailsAction: "announcement",
                }),
              });
            }}
            className="shrink-0 rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-1.5 text-[length:var(--text-caption)] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
            aria-label={t(msg`打开群公告页`)}
            title={t(msg`打开群公告页`)}
          >
            {t(msg`公告页`)}
          </button>
        </div>
      ) : null}

      {!isDesktop && announcement ? (
        <div className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2.5 py-1">
          <button
            type="button"
            onClick={openGroupDetails}
            className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--brand-primary)]/12 bg-[color:var(--surface-card)] px-2.5 py-1.5 text-left active:bg-[color:var(--surface-card)]"
          >
            <span className="shrink-0 rounded-full bg-[color:var(--brand-primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]">
              {t(msg`群公告`)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-primary)]">
              {announcement}
            </span>
            <span className="shrink-0 text-[10px] text-[color:var(--text-muted)]">
              {t(msg`查看`)}
            </span>
          </button>
        </div>
      ) : null}

      {routeContextNotice ? (
        isDesktop ? (
          <div className="border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 py-3">
            <InlineNotice
              // 新会话走查 R3：routeContextNotice 是用户从群语音/视频通话页返回
              // 群聊页时展示的过渡反馈，描述 "本轮群语音通话已结束。你可以继续
              // 在群里输入，也可以切回语音发送"+ "发语音继续"按钮。盲人 SR
              // 之前完全听不到这条 description，从 call screen 返回直接落到
              // 安静的群聊页，不知道有"继续语音/继续打字"的快捷动作。
              // role="status" + aria-live="polite" 让 SR 朗读 description，
              // 不抢断当前播报。
              role="status"
              aria-live="polite"
              tone="info"
              className="border-[color:var(--border-faint)] bg-[color:var(--surface-card)]"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 flex-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                  {routeContextNotice.description}
                </span>
                <div className="flex items-center justify-end gap-1.5">
                  {routeContextNotice.secondaryActionLabel &&
                  routeContextNotice.onSecondaryAction ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={routeContextNotice.onSecondaryAction}
                      className="shrink-0 rounded-full"
                    >
                      {routeContextNotice.secondaryActionLabel}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={routeContextNotice.onAction}
                    className="shrink-0 rounded-full"
                  >
                    {routeContextNotice.actionLabel}
                  </Button>
                </div>
              </div>
            </InlineNotice>
          </div>
        ) : (
          <div className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2.5 py-1">
            {/* 新会话走查 R3：和上方 desktop 分支 routeContextNotice 同款 a11y
                修法——mobile 这条裸 div + raw rounded box 完全没 role/aria-live。
                从 call screen 返回的盲人 SR 用户听不到任何"通话已结束 / 继续语音"
                提示。挂 role="status" + aria-live="polite" 让 description 被 SR
                朗读但不抢断当前播报。 */}
            <div
              role="status"
              aria-live="polite"
              className="rounded-[var(--radius-sm)] border border-[color:var(--brand-primary)]/14 bg-[color:var(--surface-card)] px-2.5 py-1.5 shadow-none"
            >
              <div className="text-[10px] leading-4 text-[color:var(--state-success-text)]">
                {routeContextNotice.description}
              </div>
              <div className="mt-2 flex items-center justify-end gap-1.5">
                {routeContextNotice.secondaryActionLabel &&
                routeContextNotice.onSecondaryAction ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={routeContextNotice.onSecondaryAction}
                    className="h-7 shrink-0 rounded-full px-2.5 text-[10px]"
                  >
                    {routeContextNotice.secondaryActionLabel}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={routeContextNotice.onAction}
                  className="h-7 shrink-0 rounded-full px-2.5 text-[10px]"
                >
                  {routeContextNotice.actionLabel}
                </Button>
              </div>
            </div>
          </div>
        )
      ) : null}

      <div className="relative flex-1 overflow-hidden">
        <div
          className={`absolute inset-0 ${
            isDesktop ? "bg-[color:var(--surface-secondary)]" : "bg-[color:var(--bg-canvas)]"
          }`}
          style={backgroundStyle}
        />
        <div
          className={`absolute inset-0 ${
            isDesktop
              ? "bg-[color:var(--surface-secondary)]"
              : "bg-[color:var(--surface-secondary)]"
          }`}
        />

        {isDesktop && desktopCallPanelState ? (
          <div className="relative h-full p-5">
            <DesktopGroupCallPanel
              kind={desktopCallPanelState.kind}
              groupId={groupId}
              groupName={groupQuery.data?.name || t(msg`群聊`)}
              members={membersQuery.data ?? []}
              lastSyncedCounts={
                lastPublishedCallCounts?.kind === desktopCallPanelState.kind &&
                lastPublishedCallCounts?.source === desktopCallPanelState.source
                  ? {
                      activeCount: lastPublishedCallCounts.activeCount,
                      totalCount: lastPublishedCallCounts.totalCount,
                    }
                  : null
              }
              // 走查电脑端群聊新一轮 R1：原版两个 prop 同时绑 sendCallInviteMutation
              // .isPending，但 mutation 既负责"开始/同步在席"也负责"结束通话"两类
              // 调用——用户点「结束通话」→ endNoticePending=true（"结束中..."），
              // 同时 inviteNoticePending 也跟着翻 true → "同步最新状态"按钮显示
              // "同步中..."、下方 InlineNotice 误显示「正在把最新成员状态同步到
              // 聊天消息流。」，和用户实际意图相反。反过来点「同步」时「结束通话」
              // 按钮也短暂显示「结束中...」。用 mutation.variables.status 区分
              // ongoing / ended 两类 intent，互不串扰。
              inviteNoticePending={
                sendCallInviteMutation.isPending &&
                sendCallInviteMutation.variables?.status === "ongoing"
              }
              endNoticePending={
                sendCallInviteMutation.isPending &&
                sendCallInviteMutation.variables?.status === "ended"
              }
              onClose={() => setDesktopCallPanelState(null)}
              onPanelOpened={(counts) => {
                // 走查 Round 5：mutateAsync().then() 没接 .catch()，群通话邀请
                // 网络失败时 rejection 直接落到 window.unhandledrejection 污染
                // telemetry。sendCallInviteMutation.onError 已经维护错误状态，
                // 这里 .catch(()=>{}) 仅止血 orphaned rejection。
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ongoing",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                  })
                  .then(() => {
                    setLastPublishedCallCounts({
                      kind: desktopCallPanelState.kind,
                      source: desktopCallPanelState.source,
                      activeCount: counts.activeCount,
                      totalCount: counts.totalCount,
                    });
                  })
                  .catch(() => {});
              }}
              onOpenMobileHandoff={() => {
                void navigate({
                  to: "/desktop/mobile",
                  hash: buildDesktopMobileCallHandoffHash({
                    kind: desktopCallPanelState.kind,
                    conversationId: groupId,
                    conversationType: "group",
                    title: groupQuery.data?.name || t(msg`群聊`),
                  }),
                });
              }}
              onSendInviteNotice={(counts) => {
                // 同 onPanelOpened：止血 orphaned rejection。
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ongoing",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                  })
                  .then(() => {
                    setLastPublishedCallCounts({
                      kind: desktopCallPanelState.kind,
                      source: desktopCallPanelState.source,
                      activeCount: counts.activeCount,
                      totalCount: counts.totalCount,
                    });
                  })
                  .catch(() => {});
              }}
              onEndCall={(counts) => {
                // 同 onPanelOpened：止血 orphaned rejection。失败时
                // sendCallInviteMutation.error 会被 panel 的 endNoticePending /
                // 顶部错误条接住，用户可以重新点结束。
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ended",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                    durationMs: counts.durationMs,
                    startedAt: counts.startedAt,
                  })
                  .then(() => {
                    setLastPublishedCallCounts(null);
                    setDesktopCallPanelState(null);
                  })
                  .catch(() => {});
              }}
            />
          </div>
        ) : (
          <div
            ref={scrollAnchorRef}
            // overscroll-contain：移动端聊天滚到边继续拖时不冒泡给外层 shell，
            // 避免在 iOS Safari 上误触发顶部导航条收放 / 系统手势抢焦。
            className={`relative flex h-full flex-col overflow-auto ${
              isDesktop ? "px-7 py-5" : "overscroll-contain px-3 py-3.5"
            }`}
            onScrollCapture={handleScrollDismissRouteContextNotice}
          >
            {groupQuery.isError && groupQuery.error instanceof Error ? (
              isDesktop ? (
                // R67：和姊妹 R51 / R53 同款 —— 群聊 desktop 分支的
                // groupQuery / membersQuery ErrorBlock 都裸 <div>，没 role。
                // group / members 是群聊页面读取群基本信息和成员列表的核心
                // cache，server 4xx/5xx 时盲人 SR 在空白群聊里完全没反馈。
                <ErrorBlock
                  role="alert"
                  className="mb-3"
                  message={describeRequestError(groupQuery.error)}
                />
              ) : (
                <MobileGroupThreadStatusCard
                  badge={t(msg`群聊`)}
                  title={t(msg`群聊信息暂时不可用`)}
                  description={describeRequestError(groupQuery.error)}
                  tone="danger"
                  action={renderStatusActions(groupQuery)}
                />
              )
            ) : null}
            {membersQuery.isError && membersQuery.error instanceof Error ? (
              isDesktop ? (
                <ErrorBlock
                  role="alert"
                  className="mb-3"
                  message={describeRequestError(membersQuery.error)}
                />
              ) : (
                <MobileGroupThreadStatusCard
                  badge={t(msg`成员`)}
                  title={t(msg`群成员信息暂时不可用`)}
                  description={describeRequestError(membersQuery.error)}
                  tone="danger"
                  action={renderStatusActions(membersQuery)}
                />
              )
            ) : null}
            {messagesQuery.isLoading ? (
              isDesktop ? (
                <LoadingBlock label={t(msg`正在读取群消息...`)} />
              ) : (
                <MobileGroupThreadStatusCard
                  badge={t(msg`读取中`)}
                  title={t(msg`正在读取群消息`)}
                  description={t(msg`稍等一下，正在同步这段群聊里的消息。`)}
                  tone="loading"
                />
              )
            ) : null}
            {/* R65：和姊妹 conversation-thread-panel R9 同款 —— 群聊 SR
                入站消息 announcer。visually-hidden + aria-live="polite"，
                aria-atomic 防止 SR 只念差量。 */}
            <div
              aria-live="polite"
              aria-atomic="true"
              className="pointer-events-none sr-only"
            >
              {characterIncomingAnnouncement}
            </div>
            {messagesQuery.isError && messagesQuery.error instanceof Error ? (
              isDesktop ? (
                // R53：和姊妹 R51 单聊 messagesQuery 同款 —— 群聊 desktop
                // 分支裸 <ErrorBlock>，盲人 SR 在空白群消息列表里无反馈。
                <ErrorBlock role="alert" message={describeRequestError(messagesQuery.error)} />
              ) : (
                <MobileGroupThreadStatusCard
                  badge={t(msg`消息`)}
                  title={t(msg`群消息暂时不可用`)}
                  description={describeRequestError(messagesQuery.error)}
                  tone="danger"
                  action={renderStatusActions(messagesQuery)}
                />
              )
            ) : null}
            {/* sendMutation.error 已经透传给 <ChatComposer error={sendError}>，
                由 composer 的 MobileComposerStatusRail / desktopComposerStatus
                渲染在输入框上方。这里再叠一张同样文案、同样 tone="danger" 的
                banner 在消息列表顶部纯属重复（参见单聊 Round 8 同款修复）。 */}

            <ChatMessageList
              messages={renderableMessages}
              threadContext={messageListThreadContext}
              buildMessageReturnTo={buildMessageReturnTo}
              groupMode
              showGroupMemberNicknames={
                groupQuery.data?.showMemberNicknames ?? true
              }
              variant={isDesktop ? "desktop" : "mobile"}
              highlightedMessageId={highlightedMessageId}
              hasOlderMessages={hasOlderMessages}
              loadingOlderMessages={
                messagesQuery.isFetching && loadMoreRequestRef.current !== null
              }
              onLoadOlderMessages={() => {
                void loadOlderMessages();
              }}
              unreadMarkerMessageId={unreadMarkerMessageId}
              unreadMarkerCount={initialUnreadCount}
              onReplyMessage={handleReplyMessage}
              onRetryMessage={(message) => retryMessage(message.id)}
              onOpenGroupCallInvite={(input) => {
                if (isDesktop) {
                  setDesktopCallPanelState(input);
                  return;
                }

                void navigate({
                  to:
                    input.kind === "voice"
                      ? "/group/$groupId/voice-call"
                      : "/group/$groupId/video-call",
                  params: { groupId },
                  hash: buildMobileGroupCallRouteHash({
                    source: input.source,
                    activeCount: input.activeCount,
                    totalCount: input.totalCount,
                    recordedAt: input.recordedAt ?? undefined,
                    snapshotRecordedAt: input.snapshotRecordedAt ?? undefined,
                    highlightedMessageId:
                      currentGroupRouteState.highlightedMessageId,
                    returnPath: currentGroupRouteState.returnPath,
                    returnHash: currentGroupRouteState.returnHash,
                  }),
                });
              }}
              onSelectionModeChange={setSelectionModeActive}
              errorActionLabel={
                !isDesktop && onBack ? t(msg`返回上一页`) : undefined
              }
              onErrorAction={!isDesktop && onBack ? onBack : null}
              onMediaReady={handleMessageMediaReady}
              emptyState={
                !isDesktop &&
                !messagesQuery.isLoading &&
                !messagesQuery.isError ? (
                  <MobileGroupThreadStatusCard
                    badge={t(msg`群聊`)}
                    title={t(msg`群里还没有消息`)}
                    description={t(msg`发一条消息，让这个群先热起来。`)}
                  />
                ) : null
              }
            />
          </div>
        )}
        {!selectionModeActive && (!isAtBottom || pendingCount > 0) ? (
          <div
            className={`pointer-events-none absolute z-10 ${
              isDesktop ? "right-5 bottom-5" : "right-2.5 bottom-3"
            }`}
          >
            <div className="pointer-events-auto">
              <MobileChatScrollBottomButton
                pendingCount={pendingCount}
                onClick={() => scrollToBottom("smooth")}
              />
            </div>
          </div>
        ) : null}
      </div>

      {!selectionModeActive && !(isDesktop && desktopCallPanelState) ? (
        <ChatComposer
          value={text}
          placeholder={t(msg`输入消息`)}
          variant={isDesktop ? "desktop" : "mobile"}
          pending={sendMutation.isPending}
          error={sendError}
          errorActionLabel={
            !isDesktop && onBack ? t(msg`返回上一页`) : undefined
          }
          onErrorAction={!isDesktop && onBack ? onBack : null}
          speechInput={{
            baseUrl,
            conversationId: groupId,
            enabled: runtimeConfig.appPlatform !== "desktop",
          }}
          onChange={(value) => {
            handleTypingDismissRouteContextNotice();
            setText(value);
          }}
          // handleSendSticker 内已经在开头同步 setReplyDraft(null)；这里再
          // await 完一遍才清，正好覆盖用户在公网 RTT 几百 ms 内点别条消息
          // 「回复」后挂上的新 reply draft——肉眼看就是"我明明刚 reply 了这
          // 条，怎么又被清了"。inner 那次清掉就够，外层再清反而是 bug。
          onSendSticker={handleSendSticker}
          onSendAttachment={sendAttachmentMessage}
          onSendPresetText={handleSendPresetText}
          mentionCandidates={mentionCandidates}
          mobileShortcutRequest={mobileShortcutRequest}
          onMobileShortcutHandled={() => {
            setMobileShortcutRequest(null);
          }}
          replyPreview={replyPreview}
          onCancelReply={() => setReplyDraft(null)}
          onStartVoiceCall={() => startGroupCall("voice")}
          onStartVideoCall={() => startGroupCall("video")}
          onSubmit={() => void handleSubmit()}
        />
      ) : null}

      <FeatureUnavailableDialog
        open={callUnavailableKind !== null}
        title={
          callUnavailableKind === "video"
            ? t(msg`视频通话功能开发中`)
            : t(msg`语音通话功能开发中`)
        }
        description={t(msg`该功能暂未开放，敬请期待。`)}
        onClose={() => setCallUnavailableKind(null)}
      />
    </div>
  );
}

function MobileGroupThreadStatusCard({
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
      // 新会话走查 R1：和姊妹群聊页 StatusCard 一批同款 a11y 修法——thread
      // 主页 groupQuery / membersQuery / messagesQuery 任一报错时本卡片渲染在
      // 消息列表上方，盲人 SR 之前听不到错误原因。role="alert"+assertive 立刻
      // 播报；loading 用 polite 兜底"正在读取群消息"。
      role={
        tone === "danger" ? "alert" : tone === "loading" ? "status" : undefined
      }
      aria-live={
        tone === "danger" ? "assertive" : tone === "loading" ? "polite" : undefined
      }
      className={cn(
        "rounded-[var(--radius-md)] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[color:var(--state-danger-bg)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]"
            : "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--state-success-bg)] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[length:var(--text-body)] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[length:var(--text-eyebrow)] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}

function describeReplyPreview(
  t: ReturnType<typeof useRuntimeTranslator>,
  message: ChatRenderableMessage,
) {
  return (
    resolveMessageSemanticPreview(message, {
      maxChars: 120,
      bracketedFallback: true,
    }) || t(msg`消息`)
  );
}

const INITIAL_MESSAGE_LIMIT = 60;
const HISTORY_PAGE_SIZE = 40;

function escapeIdSelector(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value;
}
