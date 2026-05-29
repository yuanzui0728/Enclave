import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  getCharacter,
  getConversations,
  type CallFinalizeEndedReason,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  LoaderCircle,
  MessageCircleMore,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { buildDirectCallInviteMessage } from "./group-call-message";
import { emitChatMessage } from "../../lib/socket";
import { describeRequestError } from "../../lib/request-error";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";
import { useDesktopLayout } from "../shell/use-desktop-layout";
import { openAppSettings } from "../../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useSelfCameraPreview } from "./use-self-camera-preview";
import { DigitalHumanPlayer } from "./digital-human-player";
import { useDigitalHumanCallSession } from "./use-digital-human-call-session";
import { useVoiceCallSession } from "./use-voice-call-session";
import { buildChatCallReturnSearch } from "./chat-compose-shortcut-route";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
} from "../desktop/chat/desktop-chat-route-state";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "./mobile-chat-route-state";
import {
  CallStatusLine,
  CallTimer,
  SpeakingIndicator,
  WeChatCallControlBar,
  WeChatCallControlButton,
  WeChatCallShell,
  WeChatCallToast,
  WeChatCallTopBar,
} from "./wechat-call";

type MobileAiCallScreenProps = {
  mode: "voice" | "video";
};

export function MobileAiCallScreen({ mode }: MobileAiCallScreenProps) {
  // 用 useRuntimeTranslator() 而不是 translateRuntimeMessage——下面四处
  // useMemo (statusLabel / statusHint / userBubblePlaceholder /
  // assistantBubblePlaceholder) 在 body 里都直接调 t(msg`...`)，但 deps 都
  // 没列 t。translateRuntimeMessage 是全局稳定 fn，把它当 dep 也不会因
  // locale 切换而换引用，useMemo 会卡在上个 locale 的翻译。
  // useRuntimeTranslator 用 useCallback 把 activationVersion+locale 串进 deps，
  // 拿到的 t 引用在 locale 切换时换，下方 useMemo 加上 t dep 就能跟着重算。
  const t = useRuntimeTranslator();
  const { conversationId } = useParams({
    strict: false,
  }) as {
    conversationId?: string;
  };
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const nativeMobileShellSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const baseUrl = runtimeConfig.apiBaseUrl;
  const resolvedConversationId = conversationId ?? "";
  const currentMobileRouteHash = useMemo(
    () => buildMobileChatRouteHash(parseMobileChatRouteState(hash)),
    [hash],
  );
  const desktopThreadPath = useMemo(
    () =>
      buildDesktopChatThreadPath({
        conversationId: resolvedConversationId,
      }),
    [resolvedConversationId],
  );
  const desktopDetailsHash = useMemo(
    () =>
      buildDesktopChatRouteHash({
        conversationId: resolvedConversationId,
        panel: "details",
      }),
    [resolvedConversationId],
  );
  const [cameraEnabled, setCameraEnabled] = useState(mode === "video");
  const [cameraRestartKey, setCameraRestartKey] = useState(0);
  const [leavingScreen, setLeavingScreen] = useState(false);
  const leavingScreenRef = useRef(false);
  const waitingNoticeSentRef = useRef(false);
  const connectedNoticeSentRef = useRef(false);
  const endedNoticeSentRef = useRef(false);

  const beginLeaving = () => {
    if (leavingScreenRef.current) {
      return false;
    }
    leavingScreenRef.current = true;
    setLeavingScreen(true);
    return true;
  };

  // 走查 R4（第 4 轮）：和 chat-list-page / chat-room-page / chat-details /
  // mobile-shell 共享 ["app-conversations", baseUrl]，其它 4 处都对齐到 15s
  // staleTime。本观察者裸跑 → 进 call 屏前用户必然走过 chat-room（同样 15s
  // 内才进的通话），原生壳 10s 默认 stale 时间一过就会再发一次 GET /conversations
  // （公网隧道 ~600ms）。对齐 15s 复用主缓存。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    staleTime: 15_000,
  });
  const conversation = conversationsQuery.data?.find(
    (item) => item.id === conversationId,
  );
  const characterId =
    conversation?.type === "direct" ? conversation.participants[0] : undefined;
  // 走查 R3（第 3 轮）：和 chat-details / desktop-chat-details-panel /
  // desktop-direct-call-panel / desktop-message-avatar-popover 共享同一 queryKey
  // "app-character"，其它 4 处对齐到 15s staleTime；进 call 屏前用户必然先看
  // 过 chat-room/chat-details，那一拨 GET /characters/$id 还在 cache 里。补
  // staleTime 复用主缓存，省掉进通话页又拉一次。
  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId ?? "", baseUrl),
    enabled: Boolean(characterId),
    staleTime: 15_000,
  });
  const sendCallStatusMessage = useCallback(
    (status: "waiting" | "connected" | "ended", durationMs?: number) => {
      if (!characterId || !resolvedConversationId || !conversation) {
        return;
      }

      emitChatMessage({
        conversationId: resolvedConversationId,
        characterId,
        text: buildDirectCallInviteMessage(mode, conversation.title, {
          status,
          durationMs,
          source: "mobile",
        }),
      });

      // 走查 R2（perf）：原版 await Promise.all([invalidate × 2]) → handleBack
      // 内 await sendCallStatusMessage("ended") 卡住 navigate 等 600ms 公网 RTT
      // 等列表 refetch 完成，按完"挂断"几乎一秒才离屏，体感"按了没反应"。emit
      // 已发出 socket，invalidate 是后台刷新（chat-room/chat-list 自己重 fetch），
      // 离屏前没必要等。同步去 await 也消除 unhandled rejection 风险。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversation-messages", baseUrl, resolvedConversationId],
      });
    },
    [
      baseUrl,
      characterId,
      conversation,
      mode,
      queryClient,
      resolvedConversationId,
    ],
  );
  // 走查 R3：useCallFinalize 10 分钟兜底 timer 到时会 fire `hangup("timeout")`，
  // 写一条 call_log 卡片然后调 onSessionEnded(reason)。原版没传 onSessionEnded，
  // 用户进通话页录到一半放下手机，10min 后聊天列表里冒一条"通话已超时 10:00"
  // 卡片，但通话屏没任何反应：mic 按钮仍能按、再按按钮还能起新 turn（但 finalize
  // 已被 finalizedRef 锁，挂断按钮变 noop，不再写 call_log）。用户回头看聊天页
  // 看到"已结束"以为通话挂了，回到通话页又能正常说话——状态严重错位。
  // 兜底：timeout 时主动 begin leaving + 把 waiting 卡片 close 成 ended，然后
  // 走和 handleBack 同一条导航出口。user_hangup 路径下 leavingScreenRef 已经
  // 被 beginLeaving 翻 true，回调里幂等 return。
  // 走查 R3：原版只 setLeavingScreen + navigate，把 audio/mic 收尾全部赌在 unmount
  // cleanup。leaving=true 后 voice loop 的 reconcile 会 cancelRecordingTurn（释放
  // 录音），但 audio 仍在播——10min 超时通常发生在用户离开手机时，但万一这一刻
  // 用户回看屏幕，听到的是被「通话已超时」截断的半句 AI 回复 + audio 在 unmount
  // 前继续吼几百 ms。和 handleBack 显式 stopReplyPlayback 对齐。
  // 用 ref-wrapped callback 模式（参考群通话 handleVoiceCallAutoEndRef）：
  // useVoiceCallSession 在 ref 还没填值的当帧就要拿到稳定身份的 onSessionEnded，
  // 但 ref 实际填值要等 activeCall 已经声明完。每次渲染再覆盖一遍 .current 让
  // ref 始终看到最新闭包（conversation/sendCallStatusMessage 等都会跟着新闭包刷新）。
  const handleSessionAutoEndedRef = useRef<
    (reason: CallFinalizeEndedReason) => void
  >(() => {});
  const handleSessionAutoEnded = useCallback(
    (reason: CallFinalizeEndedReason) => {
      handleSessionAutoEndedRef.current(reason);
    },
    [],
  );
  const voiceCall = useVoiceCallSession({
    baseUrl,
    conversationId: resolvedConversationId,
    characterId,
    // 走查 R2：原 enabled 不等 conversation 数据落地、也不校验 type。loading 这 600ms
    // 公网 RTT 期内 VAD loop 已经 arm → speech.start() → 系统弹麦克风权限。如果
    // conversation 后来发现是群（被 routes guard 兜底渲染"暂不能发起语音通话"），用户
    // 已经被无意义弹了麦权限。补上 conversation?.type === "direct" 收口。
    enabled:
      mode === "voice" &&
      !isDesktopLayout &&
      Boolean(conversationId) &&
      conversation?.type === "direct",
    leaving: leavingScreen,
    onTurnSuccess: async (result) => {
      if (connectedNoticeSentRef.current) {
        return;
      }

      connectedNoticeSentRef.current = true;
      await sendCallStatusMessage("connected", result.totalDurationMs);
    },
    onSessionEnded: handleSessionAutoEnded,
  });
  const digitalHumanCall = useDigitalHumanCallSession({
    baseUrl,
    conversationId: resolvedConversationId,
    characterId,
    enabled:
      mode === "video" &&
      !isDesktopLayout &&
      Boolean(conversationId) &&
      Boolean(characterId) &&
      conversation?.type === "direct",
    leaving: leavingScreen,
    onTurnSuccess: async (result) => {
      if (connectedNoticeSentRef.current) {
        return;
      }

      connectedNoticeSentRef.current = true;
      await sendCallStatusMessage("connected", result.turn.totalDurationMs);
    },
  });
  const cameraPreview = useSelfCameraPreview({
    enabled:
      mode === "video" &&
      !isDesktopLayout &&
      Boolean(conversationId) &&
      cameraEnabled,
    restartKey: cameraRestartKey,
  });
  const isVideoMode = mode === "video";
  const activeCall = isVideoMode ? digitalHumanCall : voiceCall;
  const speech = activeCall.speech;
  const digitalSession = isVideoMode ? digitalHumanCall.session : null;

  // 走查 R3：ref 实体填值，让上面 handleSessionAutoEnded 的稳定 cb 能拿到最新
  // activeCall / conversation / navigate 闭包；handleBack 同款收尾顺序（cancel +
  // stopReplyPlayback → 写 ended → navigate）。
  handleSessionAutoEndedRef.current = (
    reason: CallFinalizeEndedReason,
  ) => {
    if (leavingScreenRef.current) {
      return;
    }
    // 走查新一轮 R5：原版只接 timeout —— useCallFinalize R4 兜底在浏览器/iOS
    // swipe back 时也会发 hangup("user_hangup")，触发 onSessionEnded("user_hangup")
    // 经过这条回调。如果这里仍只匹配 timeout，单聊"通话中..."状态卡片永远不会
    // 被翻成"通话已结束"，对方/本人下次回头看聊天列表 lastMessage 永远停在
    // "通话中..."误导信息。call_log 卡片已经被 useCallFinalize 自己写过，但
    // sendCallStatusMessage("ended") 走 emitChatMessage 是另一条独立消息，只有
    // 这里能发。明面入口（handleBack）已先翻 leavingScreenRef → 上面 guard 早
    // return，这里加 user_hangup 不会重复写。
    if (reason !== "timeout" && reason !== "user_hangup") {
      return;
    }

    leavingScreenRef.current = true;
    setLeavingScreen(true);
    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();

    if (
      conversation?.type === "direct" &&
      waitingNoticeSentRef.current &&
      !endedNoticeSentRef.current
    ) {
      endedNoticeSentRef.current = true;
      void sendCallStatusMessage("ended");
    }

    // 走查新一轮 R6：user_hangup 走的是 R4 unmount 兜底路径——浏览器 back /
    // iOS swipe 已经 history.back 把路由切走，组件正在 unmount。再发一次
    // navigate 会和 history.back 撞车（router 把刚生效的回退路由再 replace
    // 一遍，URL 抖动；多 tab 历史栈可能出现循环）。timeout 是后台 timer 主动
    // 触发，用户还在通话屏，必须显式 navigate 回 thread。两条路径分流。
    if (reason === "user_hangup") {
      return;
    }

    if (isDesktopLayout) {
      void navigate({
        to: desktopThreadPath,
        replace: true,
      });
    } else {
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: resolvedConversationId },
        search:
          buildChatCallReturnSearch({
            kind: mode,
          }) || undefined,
        ...(currentMobileRouteHash ? { hash: currentMobileRouteHash } : {}),
        replace: true,
      });
    }
  };
  const cameraPreviewMessage = !cameraEnabled
    ? t(msg`本地摄像头已关闭`)
    : cameraPreview.status === "requesting-permission"
      ? t(msg`申请摄像头权限中`)
      : cameraPreview.error
        ? cameraPreview.error
        : t(msg`点下方按钮可重新接通本地画面`);

  const characterName =
    characterQuery.data?.name?.trim() ||
    conversation?.title?.trim() ||
    (isVideoMode ? t(msg`视频通话`) : t(msg`语音通话`));
  const characterAvatar = characterQuery.data?.avatar || undefined;

  const handleBack = async () => {
    if (!beginLeaving()) {
      return;
    }

    if (isVideoMode) {
      setCameraEnabled(false);
    }
    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();
    try {
      // 走查新一轮 R2（perf）：和下方 voice mode `void voiceCall.hangup` 同源——
      // 原版视频模式 `await digitalHumanCall.endSession()` 卡 ~600ms 公网 RTT
      // 才 navigate，用户按 PhoneOff "挂断"按钮明显延迟才离屏。endSession 内部
      // try/catch 吞掉错误是 best-effort 关闭，HTTP 发出去就行，没必要 await；
      // 且 useDigitalHumanCallSession setup effect 的 unmount cleanup 也会兜底
      // 发一次 closeDigitalHumanSession（status !== "ended" 时），后端按 sessionId
      // 幂等处理，两条同 sessionId 的 close 请求只多消耗一次微小服务端事务。
      if (isVideoMode) {
        void digitalHumanCall.endSession();
      }
      // 单聊语音通话挂断时把 call_log 卡片写进 thread（hook 内做去重，
      // timer 超时 / 用户 hangup / 退出页 三个入口共享一次落库）。
      // fire-and-forget：hangup 内部已 try/catch 吞掉 finalize 失败，await 它
      // 只是让公网 5xx 慢链路把 navigation 拖死，用户体感"按了挂断没反应"。
      // 组件 unmount 后 hangup 闭包仍能跑完（dynamicArgsRef 持值），HTTP 照发。
      if (!isVideoMode) {
        void voiceCall.hangup("user_hangup");
      }

      if (
        conversation?.type === "direct" &&
        waitingNoticeSentRef.current &&
        !endedNoticeSentRef.current
      ) {
        endedNoticeSentRef.current = true;
        await sendCallStatusMessage("ended");
      }
    } finally {
      if (isDesktopLayout) {
        void navigate({
          to: desktopThreadPath,
          replace: true,
        });
      } else {
        void navigate({
          to: "/chat/$conversationId",
          params: { conversationId: resolvedConversationId },
          search:
            buildChatCallReturnSearch({
              kind: mode,
            }) || undefined,
          ...(currentMobileRouteHash ? { hash: currentMobileRouteHash } : {}),
          replace: true,
        });
      }
    }
  };

  // 走查 R2：和姊妹 mobile-group-call-screen handleRetryLoad 对齐。原版裸 refetch，
  // 用户对着 ErrorBlock 多点 2-3 次"重试读取"会把 conversationsQuery +
  // characterQuery 两条 refetch 同时再排队飞——useQuery 内部对同 queryKey 已
  // in-flight 的请求会 dedup，但 isFetching=true 时新 refetch() 调用仍排队再发
  // 一次。公网隧道 ~600ms RTT × 4-6 条同时飞后端短时压力翻倍。
  const handleRetryLoad = () => {
    if (conversationsQuery.isFetching || characterQuery.isFetching) {
      return;
    }
    void conversationsQuery.refetch();
    if (characterId) {
      void characterQuery.refetch();
    }
  };
  const retryLoadDisabled =
    conversationsQuery.isFetching || characterQuery.isFetching;

  // 第三轮 R2：原版没接 Android Back 拦截。call 屏只有屏幕上的「PhoneOff /
  // 返回」走 handleBack()，里面做 4 件关键事：
  //   1) sendCallStatusMessage("ended") → 聊天里挂出「通话已结束」卡片，否则
  //      会话最后一条永远停在「通话中…」
  //   2) digitalHumanCall.endSession() → 关后端 ws/server 数字人会话，否则
  //      session 留挂直到超时
  //   3) cameraEnabled=false → 视频通话退出时关掉本地摄像头流（虽然
  //      use-self-camera-preview 内有 unmount 兜底，但顺序更早 / 更确定）
  //   4) replace:true navigate to /chat/$conversationId?call-return=... →
  //      回到聊天屏并触发 ChatRoomPage L162 那条 callReturn 信号
  // 用户在 Android 按 hardware Back 直接走 history.back()，以上 4 件全部
  // 漏掉。leavingScreen 时也不再触发（beginLeaving 的 false 早 return）。
  // 和姊妹 chat-voice-call / chat-video-call / chat-room-page 早期就走的
  // registerAndroidBackInterceptor 一致兜底。
  useEffect(() => {
    if (isDesktopLayout || leavingScreen) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      void handleBack();
      return true;
    });
    return unregister;
    // handleBack 闭包 deps 极多 (sendCallStatusMessage / digitalHumanCall /
    // activeCall / navigate / resolvedConversationId / mode / hash ...)，
    // 拿当前渲染版本就够——beginLeaving 已经保证幂等。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopLayout, leavingScreen]);

  const handleSwitchToVoiceCall = async () => {
    if (!beginLeaving()) {
      return;
    }

    setCameraEnabled(false);
    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();
    try {
      // 走查新一轮 R2（perf）：和姊妹 handleBack 同源 fire-and-forget——
      // 切换到语音通话时 await 600ms 公网 RTT 后才 navigate 让用户体感卡顿，
      // closeDigitalHumanSession best-effort、hook unmount cleanup 也会兜底
      // 发一次（status !== "ended"），后端按 sessionId 幂等处理。
      void digitalHumanCall.endSession();

      // 走查第一轮 R2：和姊妹 handleBack (line 626-633) 同款问题——本入口
      // 「改用语音通话」是 video 数字人 session 出错时的 recovery 出口，
      // beginLeaving + endSession 都做了，唯独漏挂 sendCallStatusMessage("ended")。
      // useEffect line 982 在 video mount 时已经发过 "waiting" 卡片，replace
      // 走到 voice-call 后 mobile-ai-call-screen 重 mount 又会发一条 "waiting"
      // voice 卡片 → 用户消息时间线里上一条 video「通话中…」永远不会被 close
      // 成「通话已结束」，只能等用户回头进 chat 看时一脸懵。和 handleBack 同款
      // 守门：waiting 发过且 ended 没发过才发 ended，避免重发 + 兼容已 ended
      // 路径。
      if (
        conversation?.type === "direct" &&
        waitingNoticeSentRef.current &&
        !endedNoticeSentRef.current
      ) {
        endedNoticeSentRef.current = true;
        await sendCallStatusMessage("ended");
      }
    } finally {
      void navigate({
        to: "/chat/$conversationId/voice-call",
        params: { conversationId: resolvedConversationId },
        ...(currentMobileRouteHash ? { hash: currentMobileRouteHash } : {}),
        replace: true,
      });
    }
  };

  const handleToggleCamera = () => {
    if (
      cameraEnabled &&
      cameraPreview.supported &&
      cameraPreview.status !== "ready" &&
      cameraPreview.status !== "requesting-permission" &&
      cameraPreview.error
    ) {
      setCameraRestartKey((current) => current + 1);
      return;
    }

    setCameraEnabled((current) => !current);
  };

  const handleRetryCurrentTurn = () => {
    if (leavingScreen) {
      return;
    }

    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();
    activeCall.turnMutation.reset();
    speech.clearResult();
  };

  const handleRetryDigitalHumanConnection = () => {
    if (!isVideoMode || leavingScreen) {
      return;
    }

    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();
    activeCall.turnMutation.reset();
    speech.clearResult();
    digitalHumanCall.retrySession();
  };

  useEffect(() => {
    if (
      !conversation ||
      conversation.type !== "direct" ||
      isDesktopLayout ||
      waitingNoticeSentRef.current
    ) {
      return;
    }

    waitingNoticeSentRef.current = true;
    void sendCallStatusMessage("waiting");
  }, [conversation, isDesktopLayout, sendCallStatusMessage]);

  // 微信式连续免提通话状态（来自 VAD loop）。
  // 走查新一轮 R1（perf 高）：原本还从 voiceLoop 取 `inputLevel: number` 并透传
  // 给 <SpeakingIndicator>。VAD 每帧把节流后的 level setState 到 loop hook，再
  // 沿 useVoiceCallSession → activeCall.voiceLoop 一路冒泡到这个 1000+ 行组件，
  // listening 阶段每秒被拖着重渲染 ~16 次。改成只传 `inputLevelRef`，
  // SpeakingIndicator 内部 rAF + DOM 写值，父组件再不因 level 变化重渲染。
  const vadPhase = activeCall.voiceLoop.phase;
  const inputLevelRef = activeCall.voiceLoop.inputLevelRef;
  const micMuted = activeCall.voiceLoop.micMuted;
  const setMicMuted = activeCall.voiceLoop.setMicMuted;

  // 通话计时锚点：语音进屏即视为接通；视频等数字人 session ready 才起算。
  // 走查新一轮 R1：原版 voice mode 直接 mount 当帧 setConnectedAtMs(Date.now())
  // —— 但此时 conversationsQuery.isLoading=true，上面早返渲染的是 "正在连接..."
  // loading 卡，用户还没看到真正的通话屏。公网隧道 ~600ms 后 query 落地进入 call
  // shell 时，CallTimer 已经偷跑了半秒到一秒，用户进屏第一眼就是 "0:01" 而不是
  // "0:00"。等 conversation 真正可用（落地通过 direct 校验，把 loading/error/
  // 非 direct 分支全部排除）才视为"接通"，避免秒表抢跑。
  const [connectedAtMs, setConnectedAtMs] = useState<number | null>(null);
  useEffect(() => {
    if (connectedAtMs !== null) {
      return;
    }
    if (!conversation || conversation.type !== "direct") {
      return;
    }
    if (!isVideoMode) {
      setConnectedAtMs(Date.now());
      return;
    }
    if (digitalHumanCall.sessionState === "ready") {
      setConnectedAtMs(Date.now());
    }
  }, [connectedAtMs, conversation, isVideoMode, digitalHumanCall.sessionState]);

  // 单行极简状态文字（微信只显示这种简短状态）
  const callStatusLine = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return t(msg`正在连接...`);
    }
    switch (vadPhase) {
      case "listening":
        // 走查（用户截屏 "6mhtb0" 报告 i18n 乱码）：原版用了 U+2026 单字符省略号
        // `…`，lingui 5.x 的 macro 给每条 msg 算 6 字节 base62 hash 当 ID；现有
        // catalog .po 里的 msgid 是 `正在聆听...`（3 个 ASCII 点，hash `jg91Py`），
        // 而 `…` 版本的 hash 是 `6mhtb0`，runtime 找不到翻译就把 ID 当 fallback
        // 文本渲染 → 通话屏 status 栏直接显示 "6mhtb0"。同 commit 也漏改了下面
        // 3 条。改回 `...` 让 hash 与已有翻译重新对齐（en-US `Listening...` / ja-JP
        // `聞き取り中...` / ko-KR `듣는 중...` 全部覆盖到）。
        return t(msg`正在聆听...`);
      case "thinking":
        return t(msg`对方正在回复...`);
      case "speaking":
        return t(msg`对方正在说话...`);
      case "connecting":
        return t(msg`正在连接...`);
      default:
        return "";
    }
  }, [isVideoMode, digitalHumanCall.sessionState, vadPhase, t]);

  if (conversationsQuery.isLoading) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[color:var(--surface-card)]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <LoadingBlock label={t(msg`正在连接...`)} />
        ) : (
          <MobileCallStatusCard
            title={t(msg`正在连接...`)}
            tone="loading"
          />
        )}
      </AppPage>
    );
  }

  if (conversationsQuery.isError && conversationsQuery.error instanceof Error) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[color:var(--surface-card)]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <ErrorBlock message={describeRequestError(conversationsQuery.error)} />
        ) : (
          <MobileCallStatusCard
            badge={t(msg`会话`)}
            title={t(msg`通话暂时不可用`)}
            description={describeRequestError(conversationsQuery.error)}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <MobileCallActionButton
                  onClick={handleRetryLoad}
                  disabled={retryLoadDisabled}
                  className="min-w-[132px]"
                >
                  {retryLoadDisabled ? t(msg`正在重试...`) : t(msg`重试读取`)}
                </MobileCallActionButton>
                <MobileCallActionButton
                  onClick={() => {
                    void handleBack();
                  }}
                  className="min-w-[132px]"
                >
                  {t(msg`返回聊天`)}
                </MobileCallActionButton>
              </div>
            }
          />
        )}
      </AppPage>
    );
  }

  if (!conversation) {
    return (
      <AppPage
        className={cn(
          "min-h-full space-y-4 px-4 py-6",
          isDesktopLayout ? "bg-[color:var(--surface-card)]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <>
            <ErrorBlock message={t(msg`当前聊天暂时不可用。`)} />
            <Button
              variant="secondary"
              onClick={handleBack}
              className={cn(
                isDesktopLayout
                  ? "rounded-[var(--radius-sm)] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-card)]"
                  : "rounded-full",
              )}
            >
              {t(msg`返回聊天`)}
            </Button>
          </>
        ) : (
          <MobileCallStatusCard
            badge={t(msg`会话`)}
            title={t(msg`当前不能发起通话`)}
            description={t(msg`这段聊天暂时不可用，可以先重试读取，或返回聊天后再试。`)}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <MobileCallActionButton
                  onClick={handleRetryLoad}
                  disabled={retryLoadDisabled}
                  className="min-w-[132px]"
                >
                  {retryLoadDisabled ? t(msg`正在重试...`) : t(msg`重试读取`)}
                </MobileCallActionButton>
                <MobileCallActionButton
                  onClick={handleBack}
                  className="min-w-[132px]"
                >
                  {t(msg`返回聊天`)}
                </MobileCallActionButton>
              </div>
            }
          />
        )}
      </AppPage>
    );
  }

  if (conversation.type !== "direct") {
    return (
      <AppPage
        className={cn(
          "min-h-full space-y-4 px-4 py-6",
          isDesktopLayout ? "bg-[color:var(--surface-card)]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <>
            <ErrorBlock
              message={
                isVideoMode
                  ? t(msg`只能在单聊里发起视频通话`)
                  : t(msg`只能在单聊里发起语音通话`)
              }
            />
            <Button
              variant="secondary"
              onClick={handleBack}
              className={cn(
                isDesktopLayout
                  ? "rounded-[var(--radius-sm)] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-card)]"
                  : "rounded-full",
              )}
            >
              {t(msg`返回聊天`)}
            </Button>
          </>
        ) : (
          <MobileCallStatusCard
            title={
              isVideoMode
                ? t(msg`暂不能发起视频通话`)
                : t(msg`暂不能发起语音通话`)
            }
            description={
              isVideoMode
                ? t(msg`只能在单聊里发起视频通话`)
                : t(msg`只能在单聊里发起语音通话`)
            }
            tone="danger"
            action={
              <MobileCallActionButton
                onClick={handleBack}
                className="min-w-[132px]"
              >
                {t(msg`返回聊天`)}
              </MobileCallActionButton>
            }
          />
        )}
      </AppPage>
    );
  }

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full bg-[color:var(--surface-card)] px-0 py-0">
        <div className="flex min-h-full flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[color:var(--state-warning-bg)] px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-card)]"
                aria-label={t(msg`返回聊天`)}
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="text-[length:var(--text-eyebrow)] tracking-[0.12em] text-[color:var(--text-dim)]">
                  {isVideoMode ? t(msg`视频通话`) : t(msg`语音通话`)}
                </div>
                <div className="mt-1 text-[18px] font-medium text-[color:var(--text-primary)]">
                  {conversation.title}
                </div>
                <div className="mt-1 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                  {t(msg`桌面端通话入口已收口到聊天顶部工具栏。`)}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              className="rounded-[var(--radius-sm)] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-card)]"
            >
              {t(msg`返回聊天`)}
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="w-full max-w-[760px] rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-white p-8 shadow-[0_18px_48px_rgba(180,130,20,0.08)]">
              <div className="inline-flex rounded-full bg-[color:var(--state-warning-bg)] px-3 py-1 text-[length:var(--text-eyebrow)] tracking-[0.12em] text-[color:var(--text-dim)]">
                {t(msg`桌面通话工作区`)}
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--brand-primary)]/10 text-[color:var(--state-success-text)]">
                  {isVideoMode ? <Camera size={24} /> : <Mic size={24} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[20px] font-medium text-[color:var(--text-primary)]">
                    {isVideoMode
                      ? t(msg`桌面端请从聊天页继续发起视频通话`)
                      : t(msg`桌面端请从聊天页继续发起语音通话`)}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    {t(msg`这个独立页面主要给手机端通话用。桌面端已经改成在聊天页里直接打开通话，这样消息、侧栏和通话控制会保持在同一窗口里。`)}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-4">
                  <div className="text-[length:var(--text-eyebrow)] tracking-[0.12em] text-[color:var(--text-dim)]">
                    {t(msg`当前会话`)}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {conversation.title}
                  </div>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-4">
                  <div className="text-[length:var(--text-eyebrow)] tracking-[0.12em] text-[color:var(--text-dim)]">
                    {t(msg`通话类型`)}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {isVideoMode
                      ? t(msg`视频通话`)
                      : t(msg`语音通话`)}
                  </div>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-4">
                  <div className="text-[length:var(--text-eyebrow)] tracking-[0.12em] text-[color:var(--text-dim)]">
                    {t(msg`对话对象`)}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {characterName}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <InlineNotice tone="info">
                  {t(msg`回到聊天页后，点顶部通话按钮就能进入桌面通话。`)}
                </InlineNotice>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleBack}
                  className="rounded-full bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)]"
                >
                  <MessageCircleMore size={16} />
                  {t(msg`返回聊天继续`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigate({
                      to: "/tabs/chat",
                      ...(desktopDetailsHash
                        ? { hash: desktopDetailsHash }
                        : {}),
                    });
                  }}
                  className="rounded-[var(--radius-sm)] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-card)]"
                >
                  {t(msg`查看聊天信息`)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AppPage>
    );
  }

  let callToast: ReactNode = null;
  if (!leavingScreen) {
    if (speech.error) {
      callToast = (
        <WeChatCallToast
          tone="danger"
          message={speech.error}
          action={
            speech.permissionDenied && nativeMobileShellSupported ? (
              <CallToastAction
                label={t(msg`去设置`)}
                onClick={() => {
                  void openAppSettings();
                }}
              />
            ) : (
              <CallToastAction
                label={t(msg`重试`)}
                onClick={handleRetryCurrentTurn}
              />
            )
          }
        />
      );
    } else if (activeCall.turnMutation.error instanceof Error) {
      callToast = (
        <WeChatCallToast
          tone="danger"
          message={t(msg`网络不稳定，请重试`)}
          action={
            <CallToastAction
              label={t(msg`重试`)}
              onClick={handleRetryCurrentTurn}
            />
          }
        />
      );
    } else if (isVideoMode && digitalHumanCall.sessionError) {
      callToast = (
        <WeChatCallToast
          tone="danger"
          message={digitalHumanCall.sessionError}
          action={
            <CallToastAction
              label={t(msg`重新连接`)}
              onClick={handleRetryDigitalHumanConnection}
            />
          }
        />
      );
    } else if (activeCall.playerError) {
      callToast = (
        <WeChatCallToast
          tone="info"
          message={
            isVideoMode
              ? t(msg`没有自动播报，点一下继续`)
              : t(msg`没有自动播报，点一下补播`)
          }
          action={
            <CallToastAction
              label={t(msg`补播`)}
              onClick={() => {
                void activeCall.replayLastTurn();
              }}
            />
          }
        />
      );
    }
  }

  return (
    <WeChatCallShell
      fullBleed={isVideoMode}
      backdropAvatar={isVideoMode ? undefined : characterAvatar}
      topBar={
        <WeChatCallTopBar
          onMinimize={() => {
            void handleBack();
          }}
          minimizeLabel={t(msg`返回聊天`)}
        />
      }
      controls={
        isVideoMode ? (
          <WeChatCallControlBar>
            <WeChatCallControlButton
              icon={<Mic size={24} />}
              label={t(msg`切换到语音`)}
              onClick={() => {
                void handleSwitchToVoiceCall();
              }}
              disabled={leavingScreen}
            />
            <WeChatCallControlButton
              icon={<PhoneOff size={26} />}
              label={leavingScreen ? t(msg`挂断中...`) : t(msg`挂断`)}
              variant="danger"
              size="lg"
              onClick={() => {
                void handleBack();
              }}
              disabled={leavingScreen}
            />
            <WeChatCallControlButton
              icon={
                cameraEnabled ? <Camera size={24} /> : <CameraOff size={24} />
              }
              label={cameraEnabled ? t(msg`关闭摄像头`) : t(msg`打开摄像头`)}
              onClick={handleToggleCamera}
              disabled={leavingScreen}
            />
          </WeChatCallControlBar>
        ) : (
          <WeChatCallControlBar>
            <WeChatCallControlButton
              icon={
                activeCall.audioMuted ? (
                  <VolumeX size={24} />
                ) : (
                  <Volume2 size={24} />
                )
              }
              label={t(msg`免提`)}
              variant={activeCall.audioMuted ? "default" : "active"}
              onClick={() => activeCall.setAudioMuted((current) => !current)}
              disabled={leavingScreen}
            />
            <WeChatCallControlButton
              icon={<PhoneOff size={26} />}
              label={leavingScreen ? t(msg`挂断中...`) : t(msg`挂断`)}
              variant="danger"
              size="lg"
              onClick={() => {
                void handleBack();
              }}
              disabled={leavingScreen}
            />
            <WeChatCallControlButton
              icon={micMuted ? <MicOff size={24} /> : <Mic size={24} />}
              label={micMuted ? t(msg`取消静音`) : t(msg`静音`)}
              variant={micMuted ? "active" : "default"}
              onClick={() => setMicMuted((current) => !current)}
              disabled={leavingScreen}
            />
          </WeChatCallControlBar>
        )
      }
      stage={
        isVideoMode ? (
          <>
            <DigitalHumanPlayer
              variant="mobile"
              name={characterName}
              fallbackSrc={characterAvatar}
              session={digitalSession}
              talking={activeCall.playbackState === "playing"}
              thinking={
                digitalHumanCall.sessionState === "connecting" ||
                activeCall.turnMutation.isPending
              }
              statusLabel={callStatusLine}
              statusHint=""
            />

            <div className="absolute right-3 top-20 w-[112px] overflow-hidden rounded-[var(--radius-lg)] border border-white/12 bg-[color:var(--state-info-bg)] shadow-[0_20px_48px_rgba(2,6,23,0.35)]">
              <div className="relative aspect-[3/4] bg-[linear-gradient(180deg,rgba(30,41,59,0.98),rgba(15,23,42,0.96))]">
                {cameraEnabled && cameraPreview.status === "ready" ? (
                  <video
                    ref={cameraPreview.videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80">
                      {cameraEnabled ? (
                        cameraPreview.status === "requesting-permission" ? (
                          <LoaderCircle size={16} className="animate-spin" />
                        ) : (
                          <Camera size={16} />
                        )
                      ) : (
                        <CameraOff size={16} />
                      )}
                    </div>
                    <div className="px-2 text-[length:var(--text-eyebrow)] leading-4 text-white/58">
                      {cameraPreviewMessage}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <SpeakingIndicator phase={vadPhase} inputLevelRef={inputLevelRef} />
              <AvatarChip name={characterName} src={characterAvatar} size="xl" />
            </div>
            <div className="mt-6 text-[24px] font-semibold tracking-[0.01em]">
              {characterName}
            </div>
            <CallTimer
              className="mt-2.5"
              startedAtMs={connectedAtMs}
              running={connectedAtMs !== null}
              waitingLabel={t(msg`正在等待接听...`)}
            />
            <CallStatusLine className="mt-1.5" text={callStatusLine} />
          </div>
        )
      }
    >
      <audio ref={activeCall.audioRef} preload="auto" />
      {callToast}
    </WeChatCallShell>
  );
}

function CallToastAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[length:var(--text-caption)] font-medium text-white transition active:bg-white/25"
    >
      {label}
    </button>
  );
}

function MobileCallStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "mx-auto flex max-w-[26rem] flex-col items-center rounded-[var(--radius-xl)] border px-5 py-6 text-center shadow-[0_24px_64px_rgba(2,6,23,0.28)]",
        tone === "danger"
          ? "border-[#f87171]/24 bg-[linear-gradient(180deg,rgba(127,29,29,0.34),rgba(69,10,10,0.3))] text-white"
          : "border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.88))] text-white",
      )}
    >
      {badge ? (
        <div
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.12em]",
            tone === "danger"
              ? "bg-[#ef4444]/14 text-[color:var(--state-danger-text)]"
              : "bg-[#34d399]/12 text-[color:var(--state-success-text)]",
          )}
        >
          {badge}
        </div>
      ) : null}
      {tone === "loading" ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/24" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/36 [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[color:var(--state-success-bg)] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-3 text-[18px] font-medium leading-7">{title}</div>
      {description ? (
        <p className="mt-2 max-w-[18rem] text-[length:var(--text-caption)] leading-6 text-white/68">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

function MobileCallActionButton({
  tone = "default",
  className,
  ...props
}: ComponentProps<"button"> & { tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 min-w-[148px] items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition disabled:opacity-45",
        tone === "danger"
          ? "border-[#fca5a5]/26 bg-[#ef4444]/14 text-[color:var(--state-danger-text)] active:bg-[#ef4444]/20"
          : "border-white/12 bg-white/10 text-white active:bg-white/14",
        className,
      )}
      {...props}
    />
  );
}

