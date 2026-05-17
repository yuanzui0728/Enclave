import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  getConversationMessages,
  getConversations,
  markConversationRead,
  REMINDER_CHARACTER_ID,
  uploadChatAttachment,
  type ConversationListItem,
  type Message,
  type SendMessagePayload,
  type StickerAttachment,
  type TypingPayload,
} from "@yinjie/contracts";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import {
  buildDirectRetryPayload,
  buildOptimisticDirectMessage,
  type DirectThreadMessage,
  markThreadMessageSending,
  markThreadMessagesFailed,
  mergeDirectMessageWindow,
  upsertIncomingDirectMessage,
  upsertServerMessageInCache,
} from "./chat-message-delivery";
import {
  loadPendingDirectMessages,
  reconcilePendingDirectMessages,
  updatePendingDirectMessageStatus,
  upsertPendingDirectMessage,
} from "./pending-direct-message-store";
import { useScrollAnchor } from "../../hooks/use-scroll-anchor";
import {
  emitChatMessage,
  getChatSocket,
  joinConversationRoom,
  onChatError,
  onChatMessage,
  onChatSocketConnect,
  onConversationUpdated,
  onTypingStart,
  onTypingStop,
} from "../../lib/socket";
import { handleSocketSubscriptionExpiredError } from "../../lib/subscription-expired";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";

const t = translateRuntimeMessage;

export function useConversationThread(conversationId: string) {
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const username = useWorldOwnerStore((state) => state.username);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [text, setText] = useState("");
  // 用 lazy initial 把 sleeping/busy 角色那段 8-22s 延迟里"消息消失"的
  // 乐观消息恢复出来——再进入聊天时不至于看到空白。组件 unmount 时模块级
  // store 留着这些 pending 消息，等真消息（refetch 或 socket）回声后 dedup。
  const [messages, setMessages] = useState<DirectThreadMessage[]>(() =>
    loadPendingDirectMessages(conversationId),
  );
  const [typingState, setTypingState] = useState<{
    characterId: string;
    stage?: TypingPayload["stage"];
  } | null>(
    null,
  );
  const [socketError, setSocketError] = useState<string | null>(null);
  // 标题初始值留空：activeConversation 拉到之前先不显示，比闪一下英文 "Conversation"
  // 在非英文用户那里好。conversationsQuery / onConversationUpdated 拿到数据后会立刻 set。
  const [conversationTitle, setConversationTitle] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const [initialUnreadCutoff, setInitialUnreadCutoff] = useState<string | null>(
    null,
  );
  const [unreadSnapshotReady, setUnreadSnapshotReady] = useState(false);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [loadingAnchorWindow, setLoadingAnchorWindow] = useState(false);
  const scrollAnchor = useScrollAnchor<HTMLDivElement>(messages.length);
  const { ref: scrollAnchorRef, suppressNextPendingCount } = scrollAnchor;
  const loadMoreRequestRef = useRef<{
    previousCount: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  // 进入聊天时 mark-read effect 的 deps 同一拍里会被 unreadSnapshotReady
  // (false→true) 和 messagesQuery.data?.length (undefined→60) 各触发一次，
  // 结果 POST /read + invalidate conversations 重复打两次（公网隧道
  // RTT ~600ms × 2 + 三次 GET /conversations）。用 ref 记最近一次 mark
  // 时的"末尾消息 id"——按 length dedup 会被「查看更多消息」(60→100) 误
  // 触发多打一次 mark-read，按末尾 id 才能区分"新消息追加"和"历史前置"。
  // conversationId 切换时随其他 state 一起重置；socket 撑长（AI 回声）时
  // 末尾 id 变化仍会触发。
  const lastMarkedReadNewestIdRef = useRef<string | null>(null);
  // 同帧双击同一条 failed 消息的「重试」按钮锁，详见 retryMessage 内注释。
  const retryingMessageIdsRef = useRef<Set<string>>(new Set());

  const messagesQuery = useQuery({
    queryKey: [
      "app-conversation-messages",
      baseUrl,
      conversationId,
      messageLimit,
    ],
    queryFn: () =>
      getConversationMessages(conversationId, baseUrl, { limit: messageLimit }),
    enabled: Boolean(conversationId),
    // 全局 staleTime=60s 让 useQuery 在 mount 时把 60s 内的旧 cache 当 fresh
    // 不 refetch。聊天页面里 socket 漏一条（断网/切前后台/event drop）就会
    // 显示不出新消息。强制每次挂载 refetch 一次，RTT 一次换正确性。
    refetchOnMount: "always",
  });

  // 走查 R5：本 hook 在桌面侧由 ConversationThreadPanel 调用——desktop-chat-
  // workspace 同一个 baseUrl 已经把 app-conversations 拉热（15s staleTime +
  // 60s polling）。这条 observer 没 staleTime → 进/切单聊都触发一次冗余
  // GET /conversations（公网隧道 ~600ms）。对齐 workspace 同款 15s。
  // 同样适用于 mobile 路径（chat-room-page 进入时 chat-list-page 刚拉过）。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
    staleTime: 15_000,
  });
  const activeConversation = conversationsQuery.data?.find(
    (item) => item.id === conversationId,
  );
  const isReminderConversation =
    conversationId === `direct_${REMINDER_CHARACTER_ID}` ||
    activeConversation?.participants.includes(REMINDER_CHARACTER_ID) === true;
  const invalidateReminderQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["app-reminder-runtime-tasks", baseUrl],
      }),
      queryClient.invalidateQueries({
        queryKey: ["app-reminder-runtime-upcoming", baseUrl],
      }),
    ]);
  }, [baseUrl, queryClient]);
  const syncConversationListCache = useCallback(
    (updater: (current: ConversationListItem[]) => ConversationListItem[]) => {
      queryClient.setQueryData<ConversationListItem[]>(
        ["app-conversations", baseUrl],
        (current) => (current ? updater(current) : current),
      );
    },
    [baseUrl, queryClient],
  );
  const syncActiveConversationMessage = useCallback(
    (message: Message) => {
      syncConversationListCache((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                lastMessage: message,
                lastActivityAt: message.createdAt,
                updatedAt: message.createdAt,
              }
            : item,
        ),
      );
    },
    [conversationId, syncConversationListCache],
  );
  const syncActiveConversationReadState = useCallback(
    (readAt: string) => {
      syncConversationListCache((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                unreadCount: 0,
                lastReadAt: readAt,
              }
            : item,
        ),
      );
    },
    [conversationId, syncConversationListCache],
  );

  useEffect(() => {
    if (!messagesQuery.data) {
      return;
    }
    // cache 是 server messages 的 source of truth。mergeDirectMessageWindow
    // 只追加不删除，会让"清空聊天记录 / 撤回 / 删除消息"后 cache 缩水时，
    // 本地 messages 还留着已经被清掉的消息 —— 用户在已清空的会话里继续看到
    // 旧消息，直到切走再回来。这里改成：保留还没被服务端 echo 过的乐观消息
    // (local_* id)，server 消息整体跟 cache 走；isMatchingOptimisticEcho
    // 仍然能在 echo 到来时把 local_* 替换成 server 真消息。
    //
    // 取舍：mount refetch 在飞期间 socket 投递的新消息会被 GET 响应覆盖；
    // 之前尝试过用 "createdAt > max(cache 最新, lastClearedAt)" 来保留这种
    // race-arrival，但同样的判定会让"删除当前最新一条消息"也命中（删完后
    // cache 最新变成第二新，被删的那条 createdAt 比它新 → 错误地留住）。
    // 删消息是常见操作、race-arrival 在下一条 socket 来时会被自然带回，
    // 这里就选简单更可靠的整体替换。
    setMessages((current) => {
      const pendingLocal = current.filter((message) =>
        message.id.startsWith("local_"),
      );
      return mergeDirectMessageWindow(pendingLocal, messagesQuery.data!);
    });
  }, [messagesQuery.data]);

  // messages 里还活着的乐观消息（local_* id）才需要留在 store 里；被服务端
  // 真消息 dedup 掉的就该从 store 移除，否则下次进入会重复出现。
  useEffect(() => {
    reconcilePendingDirectMessages(
      conversationId,
      messages.filter((message) => message.id.startsWith("local_")),
    );
  }, [conversationId, messages]);

  useEffect(() => {
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
    setHasOlderMessages(true);
    setLoadingAnchorWindow(false);
    loadMoreRequestRef.current = null;
    setInitialUnreadCount(0);
    setInitialUnreadCutoff(null);
    setUnreadSnapshotReady(false);
    lastMarkedReadNewestIdRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    const conversation = activeConversation;
    if (!conversation) {
      return;
    }

    setConversationTitle(conversation.title);
    // conversationsQuery cache 每次刷新（60s 定时 / 窗口聚焦 / socket 消息
    // invalidate）都拿到新的 activeConversation 对象引用，effect 重跑。
    // 标题 string 用 setState 同值会被 React 跳过 re-render，但
    // participants.slice(0, 1) 每次都是新数组——直接 setParticipants 进去
    // 会触发整个 ConversationThreadPanel + ChatMessageList + ChatComposer
    // 都跟着重渲染一遍，单聊里 participants[0] 角色 ID 永远不变。
    // 内容相等时复用旧引用，跳过这条无意义的 re-render 链。
    setParticipants((current) => {
      const next = conversation.participants.slice(0, 1);
      if (
        current.length === next.length &&
        current.every((id, index) => id === next[index])
      ) {
        return current;
      }
      return next;
    });
  }, [activeConversation]);

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
    if (!conversationId || !unreadSnapshotReady) {
      return;
    }

    setSocketError(null);
    setTypingState(null);
    joinConversationRoom({ conversationId });
    // 走查新一轮 R3：socket disconnect+reconnect 后 server 端是全新的 Socket
    // 实例，原先的 room 全部丢掉；client 这里只在 conversationId 变化时 emit
    // 一次 join_conversation，重连后再没机会重 join。结果：网络抖一下 / 后台
    // 切前台 / 公网隧道 token 续期 → 用户停在原会话上，AI 回复、撤回、
    // conversation_updated 全部送不到，要等他手动切走再切回才恢复。监听 connect
    // 事件（reconnect 也走这个）重新 emit join_conversation；socket.io 的 join
    // 是 Set 幂等，重复 emit 无副作用。
    const offConnect = onChatSocketConnect(() => {
      joinConversationRoom({ conversationId });
    });
    // 这里不直接调 markConversationRead——下面 [messagesQuery.data?.length]
    // 那个 effect 会在挂载和每次 cache 长度变化时统一触发一次。和
    // group-chat-thread-panel 的写法对齐，避免角色连发 5 条消息就打 5 次
    // markConversationRead + 5 次 conversations refetch（公网隧道 RTT ~600ms
    // 下肉眼可见的卡顿）。

    const offMessage = onChatMessage((payload) => {
      if (
        !("conversationId" in payload) ||
        payload.conversationId !== conversationId
      ) {
        return;
      }

      setSocketError(null);
      setMessages((current) => upsertIncomingDirectMessage(current, payload));
      syncActiveConversationMessage(payload);
      // 把消息直接写进 messages cache：本地 state 已经有新消息了，但 cache 没动；
      // 用户离开再回来时 useQuery 会读 cache（移动端 staleTime=60s 内不 refetch），
      // 看不到 AI 回复。直接 setQueriesData 把新消息合并进所有 messageLimit 变体
      // 的 cache，下次挂载立刻就在，不依赖 refetch RTT。同时 cache 长度变化会
      // 触发下面的 markRead effect 自动标已读，不在这里重复调。
      queryClient.setQueriesData<Message[]>(
        {
          queryKey: ["app-conversation-messages", baseUrl, conversationId],
        },
        (current) => upsertServerMessageInCache(current, payload),
      );
      if (isReminderConversation) {
        void invalidateReminderQueries();
      }

      if (payload.senderType === "character") {
        setTypingState((current) =>
          current?.characterId === payload.senderId ? null : current,
        );
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    const offTypingStart = onTypingStart((payload) => {
      if (payload.conversationId !== conversationId) {
        return;
      }
      // typing_start 在 AI 回复期间会按几秒一次的节奏持续 emit（reply 整段
      // 加上 image_generation 阶段可能跨 30-60s）。同 characterId + 同 stage
      // 时硬塞新对象 → ConversationThreadPanel + ChatMessageList +
      // ChatComposer 跟着无效 re-render，长聊天 60+ 消息每次重渲染都是浪费。
      // 内容相等时复用旧引用，跳过这条无意义的 re-render 链；watchdog 那个
      // [typingState] effect 也跟着不会重挂 120s 定时器。
      setTypingState((current) => {
        if (
          current?.characterId === payload.characterId &&
          current?.stage === payload.stage
        ) {
          return current;
        }
        return {
          characterId: payload.characterId,
          stage: payload.stage,
        };
      });
    });

    const offTypingStop = onTypingStop((payload) => {
      if (payload.conversationId === conversationId) {
        setTypingState((current) => {
          if (!current || current.characterId !== payload.characterId) {
            return current;
          }

          if (payload.stage && current.stage && payload.stage !== current.stage) {
            return current;
          }

          return null;
        });
      }
    });

    const offConversationUpdated = onConversationUpdated((payload) => {
      if (payload.id !== conversationId) {
        return;
      }

      setConversationTitle(payload.title);
      // 和上方 activeConversation 那个 effect (line 210-219) 同款 dedup ——
      // socket 的 conversation_updated 在活跃聊天里频繁触发（每条新消息后端都
      // 会 emit 一次更新 lastMessage/unreadCount），payload.participants.slice
      // 每次都是新数组引用；不 dedup 会把整个 ConversationThreadPanel +
      // ChatMessageList + ChatComposer re-render 链白跑一遍。单聊里
      // participants[0] 角色 ID 永远不变，应该直接复用旧引用跳过 re-render。
      setParticipants((current) => {
        const next = payload.participants.slice(0, 1);
        if (
          current.length === next.length &&
          current.every((id, index) => id === next[index])
        ) {
          return current;
        }
        return next;
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    const offError = onChatError((payload) => {
      setMessages((current) => markThreadMessagesFailed(current));
      updatePendingDirectMessageStatus(conversationId, null, "failed");
      handleSocketSubscriptionExpiredError(payload);
      setSocketError(payload.message);
    });

    return () => {
      offConnect();
      offMessage();
      offTypingStart();
      offTypingStop();
      offConversationUpdated();
      offError();
    };
  }, [
    baseUrl,
    conversationId,
    invalidateReminderQueries,
    isReminderConversation,
    ownerId,
    queryClient,
    syncActiveConversationMessage,
    unreadSnapshotReady,
  ]);

  // typing watchdog：服务端在 reply / image_generation 完成时一定会 emit
  // typing_stop + 真消息，但移动端公网隧道偶发"socket 断开-重连"那几百 ms
  // 里这两条事件都会 drop（server 当时认为还连着，往死 socket emit 后丢
  // 包）。结果 UI 卡在「对方正在回复...」/「对方正在生成图片...」直到用户
  // 切换会话再回来。120s 兜底——典型 reply <10s、image_generation 慢到
  // 30-60s 也覆盖得住，真到 2 分钟还没消息就基本可以判定丢了。
  useEffect(() => {
    if (!typingState) {
      return;
    }
    const timer = window.setTimeout(() => {
      setTypingState(null);
    }, 120_000);
    return () => window.clearTimeout(timer);
  }, [typingState]);

  // 挂载 + 每次 messagesQuery cache "末尾消息" 变化时统一标已读一次。
  // 和 group-chat-thread-panel 的处理一致；socket 收到 character 消息后
  // setQueriesData 会撑高 cache + 换末尾 id，自动触发这里。
  //
  // dedup：data 尚未加载或为空时不打——避免和 unreadSnapshotReady 各触发
  // 一次造成入口双 POST + 三次 GET /conversations。同一末尾 id 跳过——
  // 「查看更多消息」(60→100, 前置历史) 末尾 id 不变，不再误打 mark-read。
  useEffect(() => {
    if (!conversationId || !unreadSnapshotReady) {
      return;
    }

    const data = messagesQuery.data;
    if (!data || data.length === 0) {
      return;
    }
    const newestId = data[data.length - 1]?.id ?? null;
    if (!newestId || lastMarkedReadNewestIdRef.current === newestId) {
      return;
    }
    lastMarkedReadNewestIdRef.current = newestId;

    const readAt = new Date().toISOString();
    syncActiveConversationReadState(readAt);

    void markConversationRead(conversationId, baseUrl)
      .catch(() => {})
      .finally(() => {
        void queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        });
      });
  }, [
    baseUrl,
    conversationId,
    messagesQuery.data,
    queryClient,
    syncActiveConversationReadState,
    unreadSnapshotReady,
  ]);

  useEffect(() => {
    const loadedCount = messagesQuery.data?.length ?? 0;
    const pendingLoad = loadMoreRequestRef.current;

    if (loadedCount < messageLimit) {
      setHasOlderMessages(false);
    } else if (!pendingLoad) {
      setHasOlderMessages(true);
    }

    if (!pendingLoad || messagesQuery.isFetching) {
      return;
    }

    loadMoreRequestRef.current = null;
    if (loadedCount <= pendingLoad.previousCount) {
      setHasOlderMessages(false);
      return;
    }

    window.requestAnimationFrame(() => {
      const element = scrollAnchor.ref.current;
      if (!element) {
        return;
      }

      const nextScrollTop =
        pendingLoad.scrollTop +
        (element.scrollHeight - pendingLoad.scrollHeight);
      element.scrollTop = nextScrollTop;
    });
  }, [
    messageLimit,
    messagesQuery.data,
    messagesQuery.isFetching,
    scrollAnchor.ref,
  ]);

  const sendMutation = useMutation({
    // optimistic UI 在 onMutate 里做：消息立刻出现、输入框立刻清空。mutationFn
    // 只负责真正的副作用 (socket emit)，throw 时 onError 把对应本地消息标记为
    // failed，避免「socket 离线时点发送 → 消息永远卡 sending」。
    onMutate: (input: {
      payload: SendMessagePayload;
      retryMessageId?: string;
      clearComposerDraft?: boolean;
    }) => {
      if (!ownerId) return { messageId: undefined };

      setSocketError(null);

      let messageId: string | undefined;
      if (input.retryMessageId) {
        messageId = input.retryMessageId;
        setMessages((current) =>
          markThreadMessageSending(current, input.retryMessageId!),
        );
        updatePendingDirectMessageStatus(
          conversationId,
          [input.retryMessageId],
          "sending",
        );
      } else {
        const optimistic = buildOptimisticDirectMessage({
          payload: input.payload,
          ownerId,
          senderName: username ?? "You",
        });
        messageId = optimistic.id;
        setMessages((current) => [...current, optimistic]);
        upsertPendingDirectMessage(conversationId, optimistic);
        // thread 立刻显示之外，会话列表的 lastMessage 预览也要立刻同步——
        // 等 socket echo（公网隧道一来回数百 ms）的话会有可见的"列表/聊天页
        // 对不上"窗口。echo 到了 onChatMessage 里会再 sync 一次替成真消息。
        syncActiveConversationMessage(optimistic);
      }

      // 走查 R1：原版「非 sticker 一律 setText("")」会把用户的 composer 草稿
      // 误清。单聊发图/文件/语音/语音通话邀请/preset 文本 (`sendTextMessage`
      // 带 overrideText) 都走这条 mutation，type !== "sticker" 命中后用户在
      // composer 里已经打的字会被秒清。例：用户打到一半「看下这张图…」然后
      // 点 + 选图，图片走 type=image 的 mutation onMutate → setText("")，
      // composer 立刻空。同样路径：点 📞 打语音电话时面板 onPanelOpened
      // 触发 sendTextMessage(call-invite override) → 同步清空草稿。
      // 真正的 composer 清空时机由调用方（handleSubmit 等）显式决定——
      // 群聊 group-chat-thread-panel 走的就是这个口径（handleSubmit 内
      // setText("")）。这里改成：除了重试/sticker 之外，只在「调用方明确
      // 要求清 composer」(clearComposerDraft=true) 时才清。
      if (
        !input.retryMessageId &&
        input.payload.type !== "sticker" &&
        input.clearComposerDraft
      ) {
        setText("");
      }

      return { messageId };
    },
    mutationFn: async (input: {
      payload: SendMessagePayload;
      retryMessageId?: string;
      clearComposerDraft?: boolean;
    }) => {
      if (!ownerId) return;

      // Fail-fast：socket 断开时不要让消息卡在 sending。socket.io-client 在
      // 断开期间会 buffer emits 并在重连后 replay，但用户当下不知道，体感是
      // 「发了没动静」。直接抛错让 onError 把消息标 failed + 显示重试按钮。
      // 错误文案必须可读 —— sendMutation.error.message 会原样塞进
      // InlineNotice / ChatComposer 的 error 槽，原来 "socket-disconnected"
      // 直接给用户看是技术字符串，不是中/英文提示。
      if (!getChatSocket().connected) {
        throw new Error(t(msg`网络暂时连不上，消息已保存，点重试可重新发送。`));
      }
      emitChatMessage(input.payload);
    },
    onError: (_err, _variables, context) => {
      const messageId = context?.messageId;
      if (!messageId) return;
      setMessages((current) =>
        markThreadMessagesFailed(current, [messageId]),
      );
      updatePendingDirectMessageStatus(conversationId, [messageId], "failed");
    },
  });

  // mutationFn 抛错（socket-disconnected 等）后 onError 已把消息标 failed，
  // 调用方只是用 await 做顺序控制（追踪/滚动），不需要看到 rejection。
  // 不吞会落到 unhandledrejection → 污染 telemetry errors 列表。
  // sendMutation.mutateAsync 在 react-query 里是稳定的（mutation.mutateAsync ref
  // 跨 render 不变），用 useCallback 把 runSendMutation 也固化，让 retryMessage
  // 的 useCallback 真正能稳定下来。
  const sendMutationAsync = sendMutation.mutateAsync;
  const runSendMutation = useCallback(
    async (input: Parameters<typeof sendMutationAsync>[0]) => {
      try {
        await sendMutationAsync(input);
      } catch {
        // onError 已处理
      }
    },
    [sendMutationAsync],
  );

  const sendTextMessage = async (
    overrideText?: string,
    options?: { clearComposerDraft?: boolean },
  ) => {
    const trimmed = (overrideText ?? text).trim();
    if (!trimmed || !ownerId) {
      return;
    }

    const targetCharacterId = resolveTargetCharacterId({
      conversationId,
      ownerId,
      messages,
      participants,
    });

    if (!targetCharacterId) {
      throw new Error(t(msg`The target character is not ready yet.`));
    }

    await runSendMutation({
      payload: {
        conversationId,
        characterId: targetCharacterId,
        text: trimmed,
      },
      // 走查 R1：单聊发文本时由「handleSubmit」明确传 clearComposerDraft=true
      // 来清 composer；preset / call-invite / 其它 overrideText 调用方传 false
      // (默认 undefined)，避免误清正在打字的用户。详见 sendMutation onMutate
      // 头部注释。
      clearComposerDraft: options?.clearComposerDraft === true,
    });
  };

  const sendStickerMessage = async (
    sticker: StickerAttachment,
    overrideText?: string,
  ) => {
    if (!ownerId) {
      return;
    }

    const targetCharacterId = resolveTargetCharacterId({
      conversationId,
      ownerId,
      messages,
      participants,
    });

    if (!targetCharacterId) {
      throw new Error(t(msg`The target character is not ready yet.`));
    }

    await runSendMutation({
      payload: {
        conversationId,
        characterId: targetCharacterId,
        type: "sticker",
        // i18n-ignore-next-line: protocol marker for sticker text payload
        text: overrideText ?? t(msg`[表情包] ${sticker.label ?? sticker.stickerId}`),
        sticker: {
          sourceType: sticker.sourceType,
          packId: sticker.packId,
          stickerId: sticker.stickerId,
        },
        attachment: sticker,
      },
    });
  };

  const sendAttachmentMessage = async (
    payload: ChatComposerAttachmentPayload,
    overrideText?: string,
  ) => {
    if (!ownerId) {
      return;
    }

    const targetCharacterId = resolveTargetCharacterId({
      conversationId,
      ownerId,
      messages,
      participants,
    });

    if (!targetCharacterId) {
      throw new Error(t(msg`The target character is not ready yet.`));
    }

    if (payload.type === "image") {
      const formData = new FormData();
      formData.set("file", payload.file);
      formData.set("width", String(payload.width ?? ""));
      formData.set("height", String(payload.height ?? ""));
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "image") {
        throw new Error(t(msg`图片上传结果异常。`));
      }

      await runSendMutation({
        payload: {
          conversationId,
          characterId: targetCharacterId,
          type: "image",
          text: overrideText,
          attachment: result.attachment,
        },
      });
      return;
    }

    if (payload.type === "file") {
      const formData = new FormData();
      formData.set("file", payload.file);
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "file") {
        throw new Error(t(msg`文件上传结果异常。`));
      }

      await runSendMutation({
        payload: {
          conversationId,
          characterId: targetCharacterId,
          type: "file",
          text: overrideText,
          attachment: result.attachment,
        },
      });
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

      await runSendMutation({
        payload: {
          conversationId,
          characterId: targetCharacterId,
          type: "voice",
          text: overrideText,
          attachment: result.attachment,
        },
      });
      return;
    }

    if (payload.type === "contact_card") {
      await runSendMutation({
        payload: {
          conversationId,
          characterId: targetCharacterId,
          type: "contact_card",
          text: overrideText,
          attachment: payload.attachment,
        },
      });
      return;
    }

    await runSendMutation({
      payload: {
        conversationId,
        characterId: targetCharacterId,
        type: "location_card",
        text: overrideText,
        attachment: payload.attachment,
      },
    });
  };

  const retryMessage = useCallback(
    async (messageId: string) => {
      // 走查新一轮 R6：同帧双击同一条 failed 消息的「重试」按钮，
      // markThreadMessageSending 还没 commit，下一次 click 仍看到
      // localStatus === "failed" → 飞两份相同 emitChatMessage，对端
      // 在 single 单聊里收到 2 条一模一样的用户消息（local_id 不同 →
      // server echo 来时两条都被 dedup 各自匹配 local_id 也都过）。
      // 群聊 group-chat-thread-panel `retryingMessageIdsRef` 同款修法
      // （commit 593255ad）。
      if (retryingMessageIdsRef.current.has(messageId)) {
        return;
      }
      if (!ownerId) {
        return;
      }

      const failedMessage = messages.find(
        (message) =>
          message.id === messageId && message.localStatus === "failed",
      );
      if (!failedMessage) {
        return;
      }

      const targetCharacterId = resolveTargetCharacterId({
        conversationId,
        ownerId,
        messages,
        participants,
      });
      const payload = buildDirectRetryPayload({
        message: failedMessage,
        characterId: targetCharacterId,
      });

      if (!payload) {
        throw new Error(t(msg`这条消息暂时无法重试发送。`));
      }

      retryingMessageIdsRef.current.add(messageId);
      try {
        await runSendMutation({
          payload,
          retryMessageId: messageId,
        });
      } finally {
        retryingMessageIdsRef.current.delete(messageId);
      }
    },
    // sendMutation 整个对象每次 render 都换引用，不要塞进 deps —— retryMessage 会
    // 跟着每次 render 重建，把它当作"稳定回调"挂在子组件 onClick 上的语义就破了。
    // runSendMutation 已经被 useCallback 固化在稳定 mutateAsync 之上，足够。
    [conversationId, messages, ownerId, participants, runSendMutation],
  );

  const renderedMessages = messages;

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
        const windowMessages = await getConversationMessages(
          conversationId,
          baseUrl,
          {
            aroundMessageId: normalizedMessageId,
            before: 24,
            after: 24,
          },
        );
        if (!windowMessages.length) {
          return false;
        }

        suppressNextPendingCount();
        setMessages((current) =>
          mergeDirectMessageWindow(current, windowMessages),
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
    [baseUrl, conversationId, loadingAnchorWindow, suppressNextPendingCount],
  );

  return {
    baseUrl,
    conversationTitle,
    conversationType: "direct" as "direct" | "group",
    initialUnreadCount,
    initialUnreadCutoff,
    unreadSnapshotReady,
    hasOlderMessages,
    loadingOlderMessages:
      messagesQuery.isFetching && loadMoreRequestRef.current !== null,
    loadingAnchorWindow,
    loadOlderMessages,
    loadAnchorWindow,
    messagesQuery,
    participants,
    renderedMessages,
    scrollAnchor,
    sendMutation,
    sendStickerMessage,
    sendAttachmentMessage,
    sendTextMessage,
    retryMessage,
    setSocketError,
    setText,
    socketError,
    text,
    typingState,
  };
}

const INITIAL_MESSAGE_LIMIT = 60;
const HISTORY_PAGE_SIZE = 40;

function resolveTargetCharacterId(input: {
  conversationId: string;
  ownerId: string;
  messages: Message[];
  participants: string[];
}) {
  const fromMessages = input.messages.find(
    (item) => item.senderType === "character",
  )?.senderId;
  if (fromMessages) {
    return fromMessages;
  }

  const fromParticipants = input.participants[0];
  if (fromParticipants) {
    return fromParticipants;
  }

  const directPrefix = "direct_";
  if (input.conversationId.startsWith(directPrefix)) {
    const inferred = input.conversationId.slice(directPrefix.length).trim();
    if (inferred) {
      return inferred;
    }
  }

  return "";
}
