import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { msg } from "@lingui/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  getCharacter,
  getConversations,
  getSystemStatus,
  type VoiceCallTurnResult,
} from "@yinjie/contracts";
import { translateRuntimeMessage, useRuntimeTranslator } from "@yinjie/i18n";
import { translateCharacterActivity } from "../../lib/character-i18n";
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
  PhoneOff,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { InlineNoticeActionButton } from "../../components/inline-notice-action-button";
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
  const [recordButtonHolding, setRecordButtonHolding] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(mode === "video");
  const [cameraRestartKey, setCameraRestartKey] = useState(0);
  const [callTipsDismissed, setCallTipsDismissed] = useState(false);
  const [leavingScreen, setLeavingScreen] = useState(false);
  const [playbackSettling, setPlaybackSettling] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const recordButtonPointerIdRef = useRef<number | null>(null);
  const leavingScreenRef = useRef(false);
  const waitingNoticeSentRef = useRef(false);
  const connectedNoticeSentRef = useRef(false);
  const endedNoticeSentRef = useRef(false);
  const previousPlaybackStateRef = useRef<"idle" | "playing">("idle");

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
  // 走查 R2（第 2 轮）：cache key 跟 use-digital-human-entry-guard /
  // desktop-direct-call-panel 对齐到 app-system-status；进 call 屏前用户必然
  // 走过 chat-details 的 useDigitalHumanEntryGuard，那条已经把数据拉热并按
  // 30s staleTime 缓存住——本观察者补同款 staleTime 复用主缓存，省掉每次入
  // 通话页又拉一次 system-status。
  const systemStatusQuery = useQuery({
    queryKey: ["app-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    enabled: Boolean(baseUrl),
    retry: false,
    staleTime: 30_000,
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
    async (status: "waiting" | "connected" | "ended", durationMs?: number) => {
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

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-messages", baseUrl, resolvedConversationId],
        }),
      ]);
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
  const voiceCall = useVoiceCallSession({
    baseUrl,
    conversationId: resolvedConversationId,
    characterId,
    enabled: mode === "voice" && !isDesktopLayout && Boolean(conversationId),
    onTurnSuccess: async (result) => {
      if (connectedNoticeSentRef.current) {
        return;
      }

      connectedNoticeSentRef.current = true;
      await sendCallStatusMessage("connected", result.totalDurationMs);
    },
  });
  const digitalHumanCall = useDigitalHumanCallSession({
    baseUrl,
    conversationId: resolvedConversationId,
    characterId,
    enabled:
      mode === "video" &&
      !isDesktopLayout &&
      Boolean(conversationId) &&
      Boolean(characterId),
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
  const lastTurn = isVideoMode ? digitalHumanCall.lastTurn : voiceCall.lastTurn;
  const lastUserTranscript = resolveLatestTurnTranscript(lastTurn);
  const lastAssistantText = isVideoMode
    ? digitalHumanCall.lastTurn?.assistantText
    : voiceCall.lastTurn?.assistantText;
  const speechStatus = systemStatusQuery.data?.inferenceGateway;
  const cameraPreviewMetaLabel = !cameraEnabled
    ? t(msg`已关闭`)
    : cameraPreview.status === "ready"
      ? t(msg`预览中`)
      : cameraPreview.status === "requesting-permission"
        ? t(msg`请求中`)
        : cameraPreview.status === "unsupported"
          ? t(msg`不可用`)
          : cameraPreview.error
            ? t(msg`未就绪`)
            : t(msg`待开启`);
  const cameraPreviewMessage = !cameraEnabled
    ? t(msg`本地摄像头已关闭`)
    : cameraPreview.status === "requesting-permission"
      ? t(msg`申请摄像头权限中`)
      : cameraPreview.error
        ? cameraPreview.error
        : t(msg`点下方按钮可重新接通本地画面`);
  const latencySummary = lastTurn ? buildCallLatencySummary(lastTurn) : null;
  const unconfiguredLabel = t(msg`未配置`);
  const configuredLabel = t(msg`已配置`);
  const speechProviderSummary = speechStatus
    ? [
        t(msg`回复 ${speechStatus.activeProvider ?? unconfiguredLabel}`),
        t(msg`播报 ${speechStatus.activeTtsProvider ?? unconfiguredLabel}`),
        speechStatus.audioInputReady
          ? t(msg`原生音频理解`)
          : speechStatus.transcriptionMode === "dedicated"
            ? t(
                msg`转写 ${speechStatus.activeTranscriptionProvider ?? configuredLabel}`,
              )
            : t(msg`转写未配置`),
      ].join(" · ")
    : null;
  const showSpeechWarning = Boolean(speechStatus && !speechStatus.voiceCallReady);
  const showDiagnosticsToggle =
    !showSpeechWarning && Boolean(latencySummary || diagnosticsExpanded);
  const showPermissionPrimer =
    !callTipsDismissed &&
    !isVideoMode &&
    speech.status === "idle" &&
    !lastUserTranscript &&
    !activeCall.turnMutation.isPending &&
    !speech.error;
  const showPermissionRequestHint =
    speech.status === "requesting-permission" && !speech.error;
  const showVideoFirstTurnPrimer =
    isVideoMode &&
    !callTipsDismissed &&
    digitalHumanCall.sessionState === "ready" &&
    !digitalHumanCall.sessionError &&
    !activeCall.turnMutation.isPending &&
    activeCall.playbackState !== "playing" &&
    !lastUserTranscript &&
    !lastAssistantText &&
    !speech.error &&
    !activeCall.playerError;
  useEffect(() => {
    if (
      speech.status === "listening" ||
      speech.status === "requesting-permission"
    ) {
      return;
    }

    recordButtonPointerIdRef.current = null;
    setRecordButtonHolding(false);
  }, [speech.status]);

  useEffect(() => {
    if (
      diagnosticsExpanded &&
      (speech.status === "listening" ||
        speech.status === "requesting-permission" ||
        activeCall.turnMutation.isPending ||
        activeCall.playbackState === "playing")
    ) {
      setDiagnosticsExpanded(false);
    }
  }, [
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    diagnosticsExpanded,
    speech.status,
  ]);

  useEffect(() => {
    const previousPlaybackState = previousPlaybackStateRef.current;
    previousPlaybackStateRef.current = activeCall.playbackState;

    if (!isVideoMode) {
      if (playbackSettling) {
        setPlaybackSettling(false);
      }
      return;
    }

    if (
      previousPlaybackState === "playing" &&
      activeCall.playbackState === "idle" &&
      !activeCall.turnMutation.isPending &&
      !leavingScreen
    ) {
      setPlaybackSettling(true);
      const timeoutId = window.setTimeout(() => {
        setPlaybackSettling(false);
      }, 800);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    if (
      playbackSettling &&
      (activeCall.playbackState === "playing" ||
        activeCall.turnMutation.isPending ||
        speech.status === "listening" ||
        speech.status === "requesting-permission" ||
        leavingScreen)
    ) {
      setPlaybackSettling(false);
    }
  }, [
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    isVideoMode,
    leavingScreen,
    playbackSettling,
    speech.status,
  ]);

  const characterName =
    characterQuery.data?.name?.trim() ||
    conversation?.title?.trim() ||
    (isVideoMode ? t(msg`视频通话`) : t(msg`语音通话`));
  const characterAvatar = characterQuery.data?.avatar || undefined;
  const characterStatus =
    characterQuery.data?.currentStatus?.trim() ||
    translateCharacterActivity(t, characterQuery.data?.currentActivity) ||
    t(msg`在线`);
  const busy = activeCall.busy;
  const statusLabel = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return t(msg`正在连接...`);
    }

    if (isVideoMode && digitalHumanCall.sessionError) {
      return t(msg`连接失败`);
    }

    if (activeCall.turnMutation.isPending) {
      return t(msg`对方正在回复...`);
    }

    if (activeCall.playbackState === "playing") {
      return t(msg`对方正在说话`);
    }

    if (isVideoMode && playbackSettling) {
      return t(msg`准备下一轮`);
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return t(msg`正在聆听...`);
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "rendering") {
      return t(msg`画面加载中`);
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "queued") {
      return t(msg`画面准备中`);
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "failed") {
      return t(msg`画面加载失败`);
    }

    if (lastAssistantText) {
      return isVideoMode ? t(msg`准备下一轮`) : t(msg`继续说话`);
    }

    if (
      isVideoMode &&
      digitalHumanCall.session?.renderStatus === "ready" &&
      (digitalHumanCall.session?.playerUrl || digitalHumanCall.session?.streamUrl)
    ) {
      return t(msg`已接通`);
    }

    return t(msg`按住说话`);
  }, [
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    digitalHumanCall.sessionError,
    digitalHumanCall.session?.playerUrl,
    digitalHumanCall.session?.renderStatus,
    digitalHumanCall.session?.streamUrl,
    digitalHumanCall.sessionState,
    isVideoMode,
    lastAssistantText,
    playbackSettling,
    speech.status,
    t,
  ]);
  const statusHint = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return "";
    }

    if (isVideoMode && digitalHumanCall.sessionError) {
      return t(msg`可重试或改用语音`);
    }

    if (activeCall.turnMutation.isPending) {
      return "";
    }

    if (activeCall.playbackState === "playing") {
      return "";
    }

    if (isVideoMode && playbackSettling) {
      return "";
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "rendering") {
      return "";
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "queued") {
      return "";
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "failed") {
      return "";
    }

    if (isVideoMode && lastAssistantText) {
      return "";
    }

    if (
      isVideoMode &&
      digitalHumanCall.session?.renderStatus === "ready" &&
      (digitalHumanCall.session?.playerUrl || digitalHumanCall.session?.streamUrl)
    ) {
      return "";
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return "";
    }

    return t(msg`按住下方按钮说话`);
  }, [
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    digitalHumanCall.sessionError,
    digitalHumanCall.session?.playerUrl,
    digitalHumanCall.session?.renderStatus,
    digitalHumanCall.session?.streamUrl,
    digitalHumanCall.sessionState,
    isVideoMode,
    lastAssistantText,
    playbackSettling,
    speech.status,
    t,
  ]);

  const releaseRecordButtonPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (recordButtonPointerIdRef.current !== event.pointerId) {
      return false;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    recordButtonPointerIdRef.current = null;
    return true;
  };

  const handlePressStart = async (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (busy || isDesktopLayout || leavingScreen || playbackSettling) {
      return;
    }

    if (!event.isPrimary || recordButtonPointerIdRef.current !== null) {
      return;
    }

    recordButtonPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setCallTipsDismissed(true);
    setRecordButtonHolding(true);
    activeCall.turnMutation.reset();
    if (speech.error || speech.recordedAudio || speech.status === "ready") {
      speech.clearResult();
    }
    await activeCall.startRecordingTurn();
  };

  const handlePressEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!releaseRecordButtonPointer(event)) {
      return;
    }

    setRecordButtonHolding(false);
    activeCall.stopRecordingTurn();
  };

  const handlePressCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!releaseRecordButtonPointer(event)) {
      return;
    }

    setRecordButtonHolding(false);
    activeCall.cancelRecordingTurn();
  };

  const handleBack = async () => {
    if (!beginLeaving()) {
      return;
    }

    recordButtonPointerIdRef.current = null;
    setRecordButtonHolding(false);
    if (isVideoMode) {
      setCameraEnabled(false);
    }
    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();
    try {
      if (isVideoMode) {
        await digitalHumanCall.endSession();
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

  const handleRetryLoad = () => {
    void conversationsQuery.refetch();
    if (characterId) {
      void characterQuery.refetch();
    }
  };

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

  const renderBackToChatAction = () => (
    <InlineNoticeActionButton
      label={t(msg`返回聊天`)}
      className="border-current/28 bg-white/12 active:bg-white/16"
      onClick={() => {
        void handleBack();
      }}
    />
  );

  const renderRetryCharacterLoadAction = () => (
    <InlineNoticeActionButton
      label={t(msg`重试读取角色资料`)}
      className="border-current/28 bg-white/12 active:bg-white/16"
      onClick={() => {
        void characterQuery.refetch();
      }}
    />
  );

  const renderOpenSettingsAction = () => (
    <InlineNoticeActionButton
      className="border-current/28 bg-white/12 active:bg-white/16"
      onClick={() => {
        void openAppSettings();
      }}
    />
  );

  const handleSwitchToVoiceCall = async () => {
    if (!beginLeaving()) {
      return;
    }

    recordButtonPointerIdRef.current = null;
    setRecordButtonHolding(false);
    setCameraEnabled(false);
    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();
    try {
      await digitalHumanCall.endSession();

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
    setCallTipsDismissed(true);

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

    setRecordButtonHolding(false);
    setCallTipsDismissed(true);
    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();
    activeCall.turnMutation.reset();
    speech.clearResult();
  };

  const handleRetryDigitalHumanConnection = () => {
    if (!isVideoMode || leavingScreen) {
      return;
    }

    setRecordButtonHolding(false);
    setCallTipsDismissed(true);
    activeCall.cancelRecordingTurn();
    activeCall.stopReplyPlayback();
    activeCall.turnMutation.reset();
    speech.clearResult();
    digitalHumanCall.retrySession();
  };

  const showTurnRecoveryActions =
    activeCall.turnMutation.error instanceof Error || Boolean(speech.error);
  const showPlaybackRecoveryAction =
    !isVideoMode && Boolean(activeCall.playerError) && Boolean(lastAssistantText);
  const hasVideoSessionFailure =
    isVideoMode && Boolean(digitalHumanCall.sessionError);
  const hasVideoRenderFailure =
    isVideoMode && digitalHumanCall.session?.renderStatus === "failed";
  const hasVideoPlaybackFailure =
    isVideoMode && Boolean(activeCall.playerError) && Boolean(lastAssistantText);
  const videoRecoveryMessage = hasVideoSessionFailure
    ? t(msg`连接失败，可重试或改用语音`)
    : hasVideoRenderFailure
      ? t(msg`画面暂不可用，已切换到语音`)
      : null;
  const showPlaybackNudge = hasVideoPlaybackFailure || showPlaybackRecoveryAction;
  const playbackNudgeMessage = isVideoMode
    ? t(msg`没有自动播报，点一下继续`)
    : t(msg`没有自动播报，点一下补播`);
  const hasCallProgress =
    Boolean(lastUserTranscript) ||
    Boolean(lastAssistantText) ||
    speech.status === "listening" ||
    speech.status === "requesting-permission" ||
    activeCall.turnMutation.isPending;
  const showReplayShortcut = Boolean(lastAssistantText);
  const showBackShortcut = hasCallProgress || leavingScreen;
  const showBottomShortcutRow =
    (isVideoMode || showReplayShortcut || showBackShortcut) && !leavingScreen;
  const showHeaderStatusRow =
    isVideoMode ||
    Boolean(lastAssistantText) ||
    speech.status === "listening" ||
    speech.status === "requesting-permission" ||
    activeCall.turnMutation.isPending ||
    activeCall.playbackState === "playing" ||
    leavingScreen;
  const headerMetaLabel = isVideoMode ? t(msg`视频通话`) : t(msg`语音通话`);
  const callPhase = useMemo<
    | "error"
    | "connecting"
    | "thinking"
    | "listening"
    | "speaking"
    | "followup"
    | "ready"
    | "idle"
  >(() => {
    if (
      digitalHumanCall.sessionError ||
      activeCall.turnMutation.error instanceof Error ||
      speech.error ||
      activeCall.playerError ||
      digitalHumanCall.session?.renderStatus === "failed"
    ) {
      return "error";
    }

    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return "connecting";
    }

    if (
      activeCall.turnMutation.isPending ||
      (isVideoMode &&
        (digitalHumanCall.session?.renderStatus === "rendering" ||
          digitalHumanCall.session?.renderStatus === "queued"))
    ) {
      return "thinking";
    }

    if (
      speech.status === "listening" ||
      speech.status === "requesting-permission"
    ) {
      return "listening";
    }

    if (activeCall.playbackState === "playing") {
      return "speaking";
    }

    if (playbackSettling || Boolean(lastAssistantText)) {
      return "followup";
    }

    if (
      isVideoMode &&
      digitalHumanCall.sessionState === "ready" &&
      (digitalHumanCall.session?.playerUrl || digitalHumanCall.session?.streamUrl)
    ) {
      return "ready";
    }

    return "idle";
  }, [
    activeCall.playerError,
    activeCall.playbackState,
    activeCall.turnMutation.error,
    activeCall.turnMutation.isPending,
    digitalHumanCall.session?.playerUrl,
    digitalHumanCall.session?.renderStatus,
    digitalHumanCall.session?.streamUrl,
    digitalHumanCall.sessionError,
    digitalHumanCall.sessionState,
    isVideoMode,
    lastAssistantText,
    playbackSettling,
    speech.error,
    speech.status,
  ]);
  const phaseChipClass = cn(
    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.08em]",
    callPhase === "error"
      ? "border-[#fca5a5]/28 bg-[#ef4444]/14 text-[#fecaca]"
      : callPhase === "speaking"
        ? "border-[#34d399]/28 bg-[#34d399]/16 text-[#bbf7d0]"
        : callPhase === "listening" ||
            callPhase === "thinking" ||
            callPhase === "connecting"
          ? "border-[#60a5fa]/28 bg-[#60a5fa]/14 text-[#dbeafe]"
          : callPhase === "followup" || callPhase === "ready"
            ? "border-[#facc15]/26 bg-[#facc15]/12 text-[#fef08a]"
            : leavingScreen
              ? "border-white/12 bg-white/10 text-white/68"
              : "border-white/10 bg-white/8 text-white/72",
  );
  const callButtonToneClass = cn(
    callPhase === "error"
      ? "border-[#fca5a5]/30 bg-[radial-gradient(circle_at_top,rgba(248,113,113,0.72),rgba(185,28,28,0.96))] shadow-[0_30px_80px_rgba(239,68,68,0.28)]"
      : callPhase === "speaking"
        ? "border-[#34d399]/28 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.78),rgba(5,150,105,0.96))] shadow-[0_30px_80px_rgba(16,185,129,0.32)]"
        : callPhase === "listening" ||
            callPhase === "thinking" ||
            callPhase === "connecting"
          ? "border-[#60a5fa]/28 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.8),rgba(37,99,235,0.96))] shadow-[0_30px_80px_rgba(59,130,246,0.32)]"
          : callPhase === "followup" || callPhase === "ready"
            ? "border-[#facc15]/28 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.72),rgba(202,138,4,0.94))] shadow-[0_30px_80px_rgba(234,179,8,0.28)]"
            : isVideoMode
              ? "border-[#60a5fa]/28 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.76),rgba(37,99,235,0.96))] shadow-[0_30px_80px_rgba(59,130,246,0.3)]"
              : "border-[#34d399]/28 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.72),rgba(5,150,105,0.96))] shadow-[0_30px_80px_rgba(16,185,129,0.3)]",
  );
  const userBubblePlaceholder = useMemo(() => {
    if (callPhase === "error") {
      return t(msg`上一句未发送，可重试`);
    }

    if (callPhase === "listening") {
      return t(msg`正在聆听，松开发送`);
    }

    if (callPhase === "thinking") {
      return t(msg`已发出，等待回复`);
    }

    if (callPhase === "speaking") {
      return t(msg`等对方说完再继续`);
    }

    if (callPhase === "followup") {
      return t(msg`按住下方按钮继续说话`);
    }

    return t(msg`按住下方按钮说话`);
  }, [callPhase, t]);
  const assistantBubblePlaceholder = useMemo(() => {
    if (callPhase === "error") {
      return t(msg`回复暂未送达，恢复后会显示在这里`);
    }

    if (callPhase === "connecting") {
      return t(msg`接通后会在这里显示回复`);
    }

    if (callPhase === "thinking") {
      return t(msg`回复整理中...`);
    }

    if (callPhase === "speaking") {
      return t(msg`对方正在说话...`);
    }

    if (callPhase === "followup") {
      return t(msg`这一轮已结束`);
    }

    return t(msg`回复会在这里显示并自动播报`);
  }, [callPhase, t]);

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

  if (conversationsQuery.isLoading) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
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
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
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
                  className="min-w-[132px]"
                >
                  {t(msg`重试读取`)}
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
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
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
                  ? "rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
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
                  className="min-w-[132px]"
                >
                  {t(msg`重试读取`)}
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
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
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
                  ? "rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
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
      <AppPage className="min-h-full bg-[#f3f3f3] px-0 py-0">
        <div className="flex min-h-full flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-black/6 bg-[#f7f7f7] px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/6 bg-white text-[color:var(--text-primary)] transition hover:bg-[#efefef]"
                aria-label={t(msg`返回聊天`)}
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                  {isVideoMode ? t(msg`视频通话`) : t(msg`语音通话`)}
                </div>
                <div className="mt-1 text-[18px] font-medium text-[color:var(--text-primary)]">
                  {conversation.title}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  {t(msg`桌面端通话入口已收口到聊天顶部工具栏。`)}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
            >
              {t(msg`返回聊天`)}
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="w-full max-w-[760px] rounded-[18px] border border-black/6 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full bg-[rgba(15,23,42,0.05)] px-3 py-1 text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                {t(msg`桌面通话工作区`)}
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(7,193,96,0.10)] text-[#1f8f4f]">
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
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                    {t(msg`当前会话`)}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {conversation.title}
                  </div>
                </div>
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                    {t(msg`通话类型`)}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {isVideoMode
                      ? t(msg`视频通话`)
                      : t(msg`语音通话`)}
                  </div>
                </div>
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
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
                  className="rounded-[10px] bg-[#07c160] text-white hover:bg-[#06ad56]"
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
                  className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
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

  return (
    <AppPage className="flex min-h-[100dvh] flex-col space-y-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.22),transparent_32%),linear-gradient(180deg,#111827_0%,#0f172a_42%,#020617_100%)] px-0 py-0 text-white">
      <audio ref={activeCall.audioRef} preload="auto" />
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[rgba(2,6,23,0.72)] px-3 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={leavingScreen}
            className={cn("mt-0.5", mobileCallIconButtonClass())}
            aria-label={t(msg`返回聊天`)}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-medium">
              {characterName}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-white/58">
              <span className="shrink-0">{headerMetaLabel}</span>
              <span className="text-white/24">/</span>
              <span className="truncate">{conversation.title}</span>
            </div>
            {showHeaderStatusRow ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={phaseChipClass}>{statusLabel}</span>
                {activeCall.audioMuted ? (
                  <MobileCallMetaChip>
                    {t(msg`已静音播放`)}
                  </MobileCallMetaChip>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => activeCall.setAudioMuted((current) => !current)}
            disabled={leavingScreen}
            className={cn(
              "mt-0.5",
              mobileCallIconButtonClass(
                activeCall.audioMuted
                  ? "solid"
                  : showHeaderStatusRow
                    ? "raised"
                    : "default",
              ),
            )}
            aria-label={
              activeCall.audioMuted ? t(msg`取消静音播放`) : t(msg`静音播放`)
            }
          >
            {activeCall.audioMuted ? (
              <VolumeX size={18} />
            ) : (
              <Volume2 size={18} />
            )}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-3.5">
        {isVideoMode ? (
          <section className="relative">
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
              statusLabel={statusLabel}
              statusHint={statusHint}
            />

            <div className="absolute right-4 top-4 w-[124px] overflow-hidden rounded-[24px] border border-white/12 bg-[rgba(15,23,42,0.72)] shadow-[0_20px_48px_rgba(2,6,23,0.35)]">
              <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
                <span className="text-[11px] uppercase tracking-[0.16em] text-white/48">
                  {t(msg`我`)}
                </span>
                <span className="text-[11px] text-white/48">
                  {cameraPreviewMetaLabel}
                </span>
              </div>
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
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80">
                      {cameraEnabled ? (
                        cameraPreview.status === "requesting-permission" ? (
                          <LoaderCircle size={18} className="animate-spin" />
                        ) : (
                          <Camera size={18} />
                        )
                      ) : (
                        <CameraOff size={18} />
                      )}
                    </div>
                    <div className="px-3 text-[12px] leading-5 text-white/58">
                      {cameraPreviewMessage}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <div className="flex flex-col items-center pt-1.5 text-center">
            <AvatarChip name={characterName} src={characterAvatar} size="xl" />
            <div className="mt-3.5 text-[28px] font-semibold tracking-[0.01em]">
              {characterName}
            </div>
            <div className="mt-1 text-sm text-white/62">{characterStatus}</div>
            <div className="mt-4">
              <span className={phaseChipClass}>{statusLabel}</span>
            </div>
            <div className="mt-1.5 max-w-[280px] text-[13px] leading-5 text-white/58">
              {statusHint}
            </div>
          </div>
        )}

        <div className="mt-3.5 space-y-2.5">
          {showSpeechWarning && speechStatus ? (
            <MobileCallNotice tone="warning">
              {t(msg`语音功能暂未就绪`)}
            </MobileCallNotice>
          ) : null}
          {showDiagnosticsToggle ? (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => setDiagnosticsExpanded((current) => !current)}
                className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] tracking-[0.04em] text-white/62 transition active:bg-white/12 active:text-white/78"
              >
                {diagnosticsExpanded ? t(msg`收起详情`) : t(msg`详情`)}
              </button>
            </div>
          ) : null}
          {diagnosticsExpanded ? (
            <MobileCallNotice tone="info" className="space-y-1.5">
              {speechStatus ? (
                <div>
                  <span className="text-white/48">{t(msg`语音服务：`)}</span>
                  {speechStatus.voiceCallMessage ?? speechStatus.speechMessage}
                  {speechProviderSummary ? t(msg` ${speechProviderSummary}。`) : ""}
                </div>
              ) : null}
              {latencySummary ? (
                <div>
                  <span className="text-white/48">{t(msg`最近一轮：`)}</span>
                  {latencySummary}
                </div>
              ) : null}
            </MobileCallNotice>
          ) : null}
          {showPermissionPrimer ? (
            <MobileCallNotice tone="info">
              {t(msg`首次使用请允许麦克风权限`)}
            </MobileCallNotice>
          ) : null}
          {showPermissionRequestHint ? (
            <MobileCallNotice tone="info">
              {t(msg`请在弹窗里允许麦克风权限`)}
            </MobileCallNotice>
          ) : null}
          {showVideoFirstTurnPrimer ? (
            <MobileCallNotice tone="info">
              {t(msg`已接通，按住下方按钮说话`)}
            </MobileCallNotice>
          ) : null}
          {isVideoMode &&
          cameraEnabled &&
          cameraPreview.error &&
          cameraPreview.status !== "requesting-permission" ? (
            <MobileCallNotice
              tone="warning"
              className="flex items-center justify-between gap-3"
            >
              <span>{cameraPreview.error}</span>
              {cameraPreview.permissionDenied &&
              nativeMobileShellSupported ? (
                <InlineNoticeActionButton
                  className="border-current/28 bg-white/12 active:bg-white/16"
                  onClick={() => {
                    void openAppSettings();
                  }}
                />
              ) : null}
            </MobileCallNotice>
          ) : null}
          {isVideoMode && digitalHumanCall.sessionError ? (
            <MobileCallNotice
              tone="danger"
              className="flex items-center justify-between gap-3"
            >
              <span>{digitalHumanCall.sessionError}</span>
              {renderBackToChatAction()}
            </MobileCallNotice>
          ) : null}
          {leavingScreen ? (
            <MobileCallNotice tone="info">
              {t(msg`通话结束中...`)}
            </MobileCallNotice>
          ) : null}
          {activeCall.turnMutation.error instanceof Error ? (
            <MobileCallNotice
              tone="danger"
              className="flex items-center justify-between gap-3"
            >
              <span>{describeRequestError(activeCall.turnMutation.error)}</span>
              {renderBackToChatAction()}
            </MobileCallNotice>
          ) : null}
          {speech.error ? (
            speech.permissionDenied && nativeMobileShellSupported ? (
              <MobileCallNotice
                tone="warning"
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span>{speech.error}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {renderOpenSettingsAction()}
                  {renderBackToChatAction()}
                </div>
              </MobileCallNotice>
            ) : (
              <MobileCallNotice
                tone="danger"
                className="flex items-center justify-between gap-3"
              >
                <span>{speech.error}</span>
                {renderBackToChatAction()}
              </MobileCallNotice>
            )
          ) : null}
          {videoRecoveryMessage ? (
            <MobileCallNotice
              tone={
                hasVideoPlaybackFailure &&
                !hasVideoSessionFailure &&
                !hasVideoRenderFailure
                  ? "info"
                  : "warning"
              }
            >
              {videoRecoveryMessage}
            </MobileCallNotice>
          ) : null}
          {showPlaybackNudge ? (
            <MobileCallNotice
              tone="info"
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">{playbackNudgeMessage}</div>
              <MobileCallActionButton
                onClick={() => {
                  void activeCall.replayLastTurn();
                }}
                disabled={leavingScreen}
                className="h-10 shrink-0 px-3.5 text-[12px]"
              >
                <Volume2 size={15} />
                {t(msg`补播这一句`)}
              </MobileCallActionButton>
            </MobileCallNotice>
          ) : null}
          {videoRecoveryMessage ? (
            <div className="flex flex-wrap gap-2">
              {(hasVideoSessionFailure || hasVideoRenderFailure) ? (
                <MobileCallActionButton
                  onClick={handleRetryDigitalHumanConnection}
                  disabled={
                    leavingScreen ||
                    digitalHumanCall.sessionState === "connecting"
                  }
                >
                  <RotateCcw size={16} />
                  {t(msg`重新连接`)}
                </MobileCallActionButton>
              ) : null}
              {(hasVideoSessionFailure || hasVideoRenderFailure) ? (
                <MobileCallActionButton
                  onClick={() => {
                    void handleSwitchToVoiceCall();
                  }}
                  disabled={leavingScreen}
                >
                  <PhoneOff size={16} />
                  {t(msg`切换到语音`)}
                </MobileCallActionButton>
              ) : null}
            </div>
          ) : null}
          {showTurnRecoveryActions ? (
            <div className="flex flex-wrap gap-2">
              {showTurnRecoveryActions ? (
                <MobileCallActionButton
                  onClick={handleRetryCurrentTurn}
                  disabled={leavingScreen}
                >
                  <RotateCcw size={16} />
                  {t(msg`重新录这一轮`)}
                </MobileCallActionButton>
              ) : null}
            </div>
          ) : null}
          {characterQuery.isError && characterQuery.error instanceof Error ? (
            <MobileCallNotice
              tone="danger"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <span>{describeRequestError(characterQuery.error)}</span>
              <div className="flex flex-wrap items-center gap-2">
                {renderRetryCharacterLoadAction()}
                {renderBackToChatAction()}
              </div>
            </MobileCallNotice>
          ) : null}
        </div>

        <div className="mt-3.5 grid gap-2.5">
          <CallBubble
            label={t(msg`我`)}
            text={
              activeCall.turnMutation.isPending
                ? speech.displayText || t(msg`语音已发出，整理中...`)
                : lastUserTranscript || userBubblePlaceholder
            }
            align="right"
          />
          <CallBubble
            label={characterName}
            text={lastAssistantText || assistantBubblePlaceholder}
            align="left"
          />
        </div>

        <div className="mt-auto pt-5">
          {showBottomShortcutRow ? (
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {isVideoMode ? (
                <MobileCallActionButton
                  onClick={handleToggleCamera}
                  disabled={leavingScreen}
                  className="h-12 min-w-[120px] px-4"
                >
                  {cameraEnabled ? <CameraOff size={16} /> : <Camera size={16} />}
                  {!cameraEnabled
                    ? t(msg`打开摄像头`)
                    : cameraPreview.status === "requesting-permission"
                      ? t(msg`等待摄像头授权`)
                      : cameraPreview.status === "ready"
                        ? t(msg`关闭摄像头`)
                        : cameraPreview.supported
                          ? t(msg`重试摄像头`)
                          : t(msg`摄像头不可用`)}
                </MobileCallActionButton>
              ) : null}
              {showReplayShortcut ? (
                <MobileCallActionButton
                  onClick={() => {
                    void activeCall.replayLastTurn();
                  }}
                  disabled={activeCall.turnMutation.isPending || leavingScreen}
                  className="h-12 min-w-[120px] px-4"
                >
                  <RotateCcw size={16} />
                  {t(msg`重播上一句`)}
                </MobileCallActionButton>
              ) : null}
              {showBackShortcut ? (
                <MobileCallActionButton
                  onClick={handleBack}
                  disabled={leavingScreen}
                  className="h-12 min-w-[120px] px-4"
                >
                  <MessageCircleMore size={16} />
                  {leavingScreen ? t(msg`返回中...`) : t(msg`切回聊天`)}
                </MobileCallActionButton>
              ) : null}
            </div>
          ) : null}

          <div
            className={
              showBottomShortcutRow ? "mt-4.5 flex justify-center" : "mt-2.5 flex justify-center"
            }
          >
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                void handlePressStart(event);
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                handlePressEnd(event);
              }}
              onPointerCancel={handlePressCancel}
              disabled={
                busy ||
                leavingScreen ||
                playbackSettling ||
                (isVideoMode && digitalHumanCall.sessionState !== "ready")
              }
              className={cn(
                "flex touch-none items-center justify-center rounded-full border transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55",
                isVideoMode
                  ? "h-[156px] w-[156px]"
                  : "h-[172px] w-[172px]",
                callButtonToneClass,
              )}
            >
              <span className="flex flex-col items-center gap-3">
                {digitalHumanCall.sessionState === "connecting" ? (
                  <LoaderCircle size={34} className="animate-spin" />
                ) : activeCall.turnMutation.isPending ? (
                  <LoaderCircle size={34} className="animate-spin" />
                ) : (
                  <Mic size={36} />
                )}
                <span className="text-[17px] font-medium">
                  {digitalHumanCall.sessionState === "connecting"
                    ? t(msg`连接中`)
                    : isVideoMode && digitalHumanCall.sessionError
                      ? t(msg`暂不可用`)
                    : activeCall.turnMutation.isPending
                    ? t(msg`对方回复中`)
                    : speech.status === "listening" || recordButtonHolding
                      ? t(msg`松开发送`)
                      : activeCall.playbackState === "playing"
                        ? t(msg`播放中`)
                        : isVideoMode && playbackSettling
                          ? t(msg`准备下一轮`)
                        : t(msg`按住说话`)}
                </span>
              </span>
            </button>
          </div>

          <div className="mt-3.5 flex items-center justify-center gap-3">
            <MobileCallActionButton
              tone="danger"
              onClick={handleBack}
              disabled={leavingScreen}
              className="h-12 min-w-[132px]"
            >
              <PhoneOff size={16} />
              {leavingScreen ? t(msg`挂断中...`) : t(msg`挂断`)}
            </MobileCallActionButton>
          </div>
        </div>
      </div>
    </AppPage>
  );
}

function formatCallLatency(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function buildCallLatencySummary(turn: VoiceCallTurnResult) {
  const t = translateRuntimeMessage;
  const segments: string[] = [];

  if (typeof turn.transcriptionDurationMs === "number") {
    segments.push(
      t(msg`转写 ${formatCallLatency(turn.transcriptionDurationMs)}`),
    );
  } else if (turn.transcriptStatus === "pending") {
    segments.push(t(msg`字幕补跑中`));
  } else if (turn.transcriptStatus === "failed") {
    segments.push(t(msg`字幕失败`));
  } else if (turn.transcriptStatus === "skipped") {
    segments.push(t(msg`未转写`));
  }

  segments.push(t(msg`播报 ${formatCallLatency(turn.synthesisDurationMs)}`));
  segments.push(t(msg`总耗时 ${formatCallLatency(turn.totalDurationMs)}`));

  return segments.join(" · ");
}

function resolveLatestTurnTranscript(turn: VoiceCallTurnResult | null) {
  const t = translateRuntimeMessage;

  if (!turn) {
    return "";
  }

  const transcript = turn.userTranscript?.trim();
  if (transcript) {
    return transcript;
  }

  switch (turn.transcriptStatus) {
    case "pending":
      return t(msg`语音已发出，字幕生成中`);
    case "failed":
      return t(msg`语音已发出，字幕生成失败`);
    case "skipped":
    default:
      return t(msg`语音已发出`);
  }
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
        "mx-auto flex max-w-[26rem] flex-col items-center rounded-[28px] border px-5 py-6 text-center shadow-[0_24px_64px_rgba(2,6,23,0.28)]",
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
              ? "bg-[#ef4444]/14 text-[#fecaca]"
              : "bg-[#34d399]/12 text-[#bbf7d0]",
          )}
        >
          {badge}
        </div>
      ) : null}
      {tone === "loading" ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/24" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/36 [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#86efac] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-3 text-[18px] font-medium leading-7">{title}</div>
      {description ? (
        <p className="mt-2 max-w-[18rem] text-[13px] leading-6 text-white/68">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

function MobileCallNotice({
  tone = "info",
  className,
  ...props
}: ComponentProps<typeof InlineNotice>) {
  return (
    <InlineNotice
      tone={tone}
      className={cn(
        "rounded-[20px] px-4 py-3 text-[12px] leading-6 shadow-none",
        tone === "warning"
          ? "border-[#f59e0b]/24 bg-[#f59e0b]/10 text-[#fde68a]"
          : tone === "danger"
            ? "border-[#f87171]/24 bg-[#ef4444]/10 text-[#fecaca]"
            : tone === "success"
              ? "border-[#34d399]/24 bg-[#34d399]/10 text-[#d1fae5]"
              : "border-white/12 bg-white/8 text-white/74",
        className,
      )}
      {...props}
    />
  );
}

function MobileCallMetaChip({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] text-white/62",
        className,
      )}
      {...props}
    />
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
          ? "border-[#fca5a5]/26 bg-[#ef4444]/14 text-[#fecaca] active:bg-[#ef4444]/20"
          : "border-white/12 bg-white/10 text-white active:bg-white/14",
        className,
      )}
      {...props}
    />
  );
}

function mobileCallIconButtonClass(
  tone: "default" | "raised" | "solid" = "default",
) {
  return cn(
    "flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 transition active:bg-white/12 disabled:opacity-55",
    tone === "solid"
      ? "bg-white text-[#020617]"
      : tone === "raised"
        ? "bg-white/12 text-white"
        : "bg-white/8 text-white/82",
  );
}

type CallBubbleProps = {
  label: string;
  text: string;
  align: "left" | "right";
};

function CallBubble({ label, text, align }: CallBubbleProps) {
  return (
    <section
      className={
        align === "right"
          ? "ml-auto max-w-[86%] rounded-[22px] rounded-br-[10px] border border-[rgba(34,197,94,0.18)] bg-[rgba(34,197,94,0.12)] px-3.5 py-2.5 text-right"
          : "mr-auto max-w-[86%] rounded-[22px] rounded-bl-[10px] border border-white/10 bg-white/8 px-3.5 py-2.5 text-left"
      }
    >
      <div className="text-[10px] tracking-[0.08em] text-white/42">
        {label}
      </div>
      <div className="mt-1 text-[14px] leading-6 text-white/92">{text}</div>
    </section>
  );
}
