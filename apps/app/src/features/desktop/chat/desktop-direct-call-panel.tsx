import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  CameraOff,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  RotateCcw,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button, ErrorBlock, InlineNotice, cn } from "@yinjie/ui";
import {
  getCharacter,
  getSystemStatus,
  type VoiceCallTurnResult,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AvatarChip } from "../../../components/avatar-chip";
import { resolveDigitalHumanGatewayStatusCopy } from "../../chat/digital-human-gateway-copy";
import { DigitalHumanPlayer } from "../../chat/digital-human-player";
import { useDigitalHumanCallSession } from "../../chat/use-digital-human-call-session";
import { useSelfCameraPreview } from "../../chat/use-self-camera-preview";
import { useVoiceCallSession } from "../../chat/use-voice-call-session";
import type { DesktopChatCallKind } from "./desktop-chat-header-actions";
import { formatDetailedMessageTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type DesktopDirectCallPanelProps = {
  kind: DesktopChatCallKind;
  conversationId: string;
  characterId?: string;
  conversationTitle: string;
  onClose: () => void;
  onPanelOpened?: () => Promise<void> | void;
  onSessionConnected?: (result: VoiceCallTurnResult) => Promise<void> | void;
  onEndCall?: () => Promise<void> | void;
};

export function DesktopDirectCallPanel({
  kind,
  conversationId,
  characterId,
  conversationTitle,
  onClose,
  onPanelOpened,
  onSessionConnected,
  onEndCall,
}: DesktopDirectCallPanelProps) {
  const t = translateRuntimeMessage;
  const runtimeConfig = useAppRuntimeConfig();
  const [micMuted, setMicMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(kind === "video");
  const [recordButtonHolding, setRecordButtonHolding] = useState(false);
  const [sessionConnectedAnnounced, setSessionConnectedAnnounced] =
    useState(false);
  const [endCallPending, setEndCallPending] = useState(false);
  const [endCallError, setEndCallError] = useState<string | null>(null);
  const [startedAt] = useState(() => new Date().toISOString());
  const onPanelOpenedRef = useRef(onPanelOpened);

  useEffect(() => {
    onPanelOpenedRef.current = onPanelOpened;
  });
  const voiceCall = useVoiceCallSession({
    baseUrl: runtimeConfig.apiBaseUrl,
    conversationId,
    characterId,
    enabled:
      runtimeConfig.appPlatform === "web" &&
      kind === "voice" &&
      Boolean(conversationId),
    onTurnSuccess: async (result) => {
      if (sessionConnectedAnnounced) {
        return;
      }

      setSessionConnectedAnnounced(true);
      await onSessionConnected?.(result);
    },
  });
  const digitalHumanCall = useDigitalHumanCallSession({
    baseUrl: runtimeConfig.apiBaseUrl,
    conversationId,
    characterId,
    enabled:
      runtimeConfig.appPlatform === "web" &&
      kind === "video" &&
      Boolean(conversationId),
    mode: "desktop_video_call",
    onTurnSuccess: async (result) => {
      if (sessionConnectedAnnounced) {
        return;
      }

      setSessionConnectedAnnounced(true);
      await onSessionConnected?.(result.turn);
    },
  });
  const cameraPreview = useSelfCameraPreview({
    enabled:
      runtimeConfig.appPlatform === "web" &&
      kind === "video" &&
      Boolean(conversationId) &&
      cameraEnabled,
  });
  const isVideoMode = kind === "video";
  // 走查 R2：systemStatus 在视频通话面板开启时拉一次判断 digital human gateway
  // 是否可用，5-10s 内开关同一面板不必再拉。retry=false 故意保留——网关挂掉
  // 时这条请求自身会立刻 fail，没必要再重试。
  // 走查 R2（第 2 轮）：原独立 key ["desktop-direct-call-system-status", ...]
  // 跟 use-digital-human-entry-guard / mobile-ai-call-screen 三处独立 cache，
  // 同一 baseUrl 的 GET /system-status 被分别拉三次。统一到 app-system-status，
  // 三处共享同一份 cache + 30s staleTime；用 enabled gate 保留"web + video"
  // 的请求触发条件不变，cache hit 时不会再触发 fetch。
  const systemStatusQuery = useQuery({
    queryKey: ["app-system-status", runtimeConfig.apiBaseUrl],
    queryFn: () => getSystemStatus(runtimeConfig.apiBaseUrl),
    enabled:
      runtimeConfig.appPlatform === "web" &&
      kind === "video" &&
      Boolean(conversationId),
    retry: false,
    staleTime: 30_000,
  });
  // 走查 R2：原先用独立 cache key ["desktop-direct-call-character", ...]，
  // 跟 desktop-chat-details-panel / desktop-message-avatar-popover / chat-list 等
  // 十几处共用的 ["app-character", baseUrl, characterId] 两份独立 cache。
  // 单聊里用户点视频/语音通话之前，必然刚在聊天/详情侧栏看过对方资料，
  // app-character cache 是热的，但通话面板这条用独立 key 还要再发一次相同
  // 的 getCharacter 请求（公网隧道 ~600ms 卡顿）。统一到 app-character +
  // 15s staleTime 复用主缓存。同 chat-message-list 走查关于 forward-dialog
  // 共享 app-conversations / contact-card R10 同款修法。
  const characterQuery = useQuery({
    queryKey: ["app-character", runtimeConfig.apiBaseUrl, characterId],
    queryFn: () => getCharacter(characterId ?? "", runtimeConfig.apiBaseUrl),
    enabled: Boolean(characterId),
    staleTime: 15_000,
  });
  const activeCall = isVideoMode ? digitalHumanCall : voiceCall;
  const speech = activeCall.speech;
  const speakerEnabled = !activeCall.audioMuted;
  const digitalHumanGatewayCopy = resolveDigitalHumanGatewayStatusCopy(
    t,
    systemStatusQuery.data?.digitalHumanGateway,
  );
  const latestTurn = isVideoMode
    ? digitalHumanCall.lastTurn
    : voiceCall.lastTurn;
  const statusLabel = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return t(msg`连接数字人中`);
    }

    if (isVideoMode && digitalHumanCall.sessionState === "error") {
      return t(msg`连接失败`);
    }

    if (micMuted) {
      return t(msg`麦克风已静音`);
    }

    if (activeCall.turnMutation.isPending) {
      return isVideoMode ? t(msg`数字人整理回复中`) : t(msg`AI 回复中`);
    }

    if (activeCall.playbackState === "playing") {
      return isVideoMode ? t(msg`数字人正在说话`) : t(msg`正在播报`);
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return isVideoMode ? t(msg`正在听你说话`) : t(msg`正在聆听`);
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "rendering") {
      return t(msg`数字人渲染中`);
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "queued") {
      return t(msg`数字人排队中`);
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "failed") {
      return t(msg`数字人画面失败`);
    }

    if (
      isVideoMode &&
      digitalHumanCall.session?.renderStatus === "ready" &&
      (digitalHumanCall.session?.playerUrl || digitalHumanCall.session?.streamUrl)
    ) {
      return t(msg`数字人视频已接通`);
    }

    if (isVideoMode && digitalHumanGatewayCopy?.statusLabel) {
      return digitalHumanGatewayCopy.statusLabel;
    }

    if (latestTurn) {
      return isVideoMode ? t(msg`继续通话`) : t(msg`继续说话`);
    }

    return t(msg`按住说话`);
  }, [
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    digitalHumanCall.session?.playerUrl,
    digitalHumanCall.session?.renderStatus,
    digitalHumanCall.session?.streamUrl,
    digitalHumanCall.sessionState,
    digitalHumanGatewayCopy?.statusLabel,
    isVideoMode,
    latestTurn,
    micMuted,
    speech.status,
    t,
  ]);
  const statusHint = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return t(msg`正在建立数字人视频工作台，会话就绪后即可开始这一轮通话。`);
    }

    if (isVideoMode && digitalHumanCall.sessionState === "error") {
      return (
        digitalHumanCall.sessionError ||
        t(msg`连接数字人工作台失败，请稍后再试。`)
      );
    }

    if (micMuted) {
      return isVideoMode
        ? t(msg`先取消静音，再开始这一轮数字人视频通话。`)
        : t(msg`先取消静音，再开始这一轮语音对话。`);
    }

    if (activeCall.turnMutation.isPending) {
      return isVideoMode
        ? t(msg`本轮语音已收到，数字人正在整理文本、语音与舞台播报。`)
        : t(msg`本轮语音已收到，正在转写并组织回复。`);
    }

    if (activeCall.playbackState === "playing") {
      return isVideoMode
        ? t(msg`当前为半双工数字人视频通话，等 TA 说完后再开始下一轮。`)
        : t(msg`当前为半双工模式，等 TA 说完后再开始下一轮。`);
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "rendering") {
      return t(
        msg`语音回复已经生成，数字人视频画面正在渲染，完成后会自动切到 provider 画面。`,
      );
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "queued") {
      return t(msg`数字人视频流已进入排队，可以先保持语音通话。`);
    }

    if (isVideoMode && digitalHumanCall.session?.renderStatus === "failed") {
      return t(
        msg`当前数字人画面渲染失败，但语音回复链路仍然可继续；可直接重试连接数字人。`,
      );
    }

    if (
      isVideoMode &&
      digitalHumanCall.session?.renderStatus === "ready" &&
      (digitalHumanCall.session?.playerUrl || digitalHumanCall.session?.streamUrl)
    ) {
      return t(msg`数字人视频流已经就绪，桌面端会优先展示 provider 侧画面。`);
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return isVideoMode
        ? t(msg`松开按钮后会自动发起这一轮数字人视频通话。`)
        : t(msg`松开按钮后会自动发起这一轮语音通话。`);
    }

    if (!speech.supported) {
      return isVideoMode
        ? t(msg`当前浏览器不支持桌面端语音录制，暂时无法继续数字人视频通话。`)
        : t(msg`当前浏览器不支持桌面端语音录制，请改用键盘聊天。`);
    }

    if (isVideoMode && digitalHumanGatewayCopy?.statusHint) {
      return digitalHumanGatewayCopy.statusHint;
    }

    return isVideoMode
      ? t(
          msg`远端是 AI 数字人舞台，本地摄像头只用于你的桌面预览，不影响 AI 回复链路。`,
        )
      : t(msg`按住说一段，AI 会写入聊天并自动语音回复。`);
  }, [
    isVideoMode,
    micMuted,
    speech.status,
    speech.supported,
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    digitalHumanCall.sessionError,
    digitalHumanCall.session?.playerUrl,
    digitalHumanCall.session?.renderStatus,
    digitalHumanCall.session?.streamUrl,
    digitalHumanCall.sessionState,
    digitalHumanGatewayCopy?.statusHint,
    t,
  ]);
  const callLabel = isVideoMode
    ? t(msg`AI 数字人视频通话`)
    : t(msg`桌面 AI 语音通话`);
  const callSubtitle = isVideoMode
    ? t(msg`当前为半双工数字人视频通话，你说一轮，TA 回一轮。`)
    : t(msg`当前是回合制语音对话，AI 会在每轮结束后自动播报回复。`);
  const recordButtonLabel = activeCall.turnMutation.isPending
    ? isVideoMode
      ? t(msg`数字人回复中`)
      : t(msg`AI 回复中`)
    : activeCall.playbackState === "playing"
      ? t(msg`播放中`)
      : recordButtonHolding || speech.status === "listening"
        ? t(msg`松开发送`)
        : micMuted
          ? t(msg`麦克风已静音`)
          : t(msg`按住说话`);

  const handlePressStart = async () => {
    if (micMuted || activeCall.busy) {
      return;
    }

    setRecordButtonHolding(true);
    await activeCall.startRecordingTurn();
  };

  const handlePressEnd = () => {
    setRecordButtonHolding(false);
    activeCall.stopRecordingTurn();
  };

  // 走查电脑端单聊 R2：handleEndCall 上面（line 407-447）已经因为「同帧双击
  // 发出 2 条『通话已结束』消息」加过 sync ref 锁，handleClose 走的是「返回
  // 聊天」/「切回聊天」两个 secondary 按钮，没挂任何同步锁。视频通话场景
  // 双击任一按钮：
  // · click 1: stopReplyPlayback (sync) → await digitalHumanCall.endSession()
  //   （网络请求 ~600ms RTT）→ onClose()
  // · click 2（<16ms 同帧）: stopReplyPlayback → 第 2 次 endSession() 并发飞
  //   到服务端（useDigitalHumanCallSession line 224 检查的是 sessionRef.current
  //   的 status，React state 还没 commit 所以仍是 "active" → 进入网络分支） →
  //   onClose() 第 2 次
  // 同步 ref 挡掉同帧第 2 次进入，省一发公网 RTT；onClose 走 React state 幂等
  // 不必管，但 endSession 重复打服务端值得避免。
  const closeSubmittingRef = useRef(false);
  const handleClose = async () => {
    if (closeSubmittingRef.current) {
      return;
    }
    closeSubmittingRef.current = true;

    // R14：原版 ref 设 true 后无 finally 复位。正常路径 onClose() 触发父级
    // setDesktopCallPanelState(null) 让面板 unmount，ref 跟着销毁，逻辑没问题。
    // 但若 await digitalHumanCall.endSession() 在视频模式下 hang（公网隧道
    // token 续期 / 服务端慢 / 网络抖），onClose 迟迟跑不到，用户再点「返回
    // 聊天」会被 ref 死锁；同时用户改点「结束通话」按钮（endCallSubmittingRef
    // 独立）也只会发出结束消息但不会自动关面板（onEndCall 只是 sendTextMessage
    // 不调 onClose），用户最后陷入「两个按钮都点不动」。和姊妹 handleEndCall
    // (line 460-468) try/finally 同款，把解锁推到 finally 里。
    try {
      activeCall.stopReplyPlayback();
      if (isVideoMode) {
        await digitalHumanCall.endSession().catch(() => {});
      }
      onClose();
    } finally {
      closeSubmittingRef.current = false;
    }
  };

  useEffect(() => {
    setSessionConnectedAnnounced(false);
    void onPanelOpenedRef.current?.();
  }, [conversationId, kind]);

  useEffect(() => {
    setCameraEnabled(kind === "video");
  }, [kind]);

  const activeCallRef = useRef(activeCall);
  const digitalHumanCallRef = useRef(digitalHumanCall);
  const isVideoModeRef = useRef(isVideoMode);

  useEffect(() => {
    activeCallRef.current = activeCall;
    digitalHumanCallRef.current = digitalHumanCall;
    isVideoModeRef.current = isVideoMode;
  });

  useEffect(() => {
    return () => {
      activeCallRef.current.cancelRecordingTurn();
      activeCallRef.current.stopReplyPlayback();
      if (isVideoModeRef.current) {
        void digitalHumanCallRef.current.endSession().catch(() => {});
      }
    };
  }, []);

  // 走查新一轮 R1：和姊妹 mobile-group R1 (commit 52d9f6080 — 群通话同步飞行
  // 中双击「结束通话」发出 2 条「已结束」) 同款问题。原版 `if (endCallPending)
  // return` 兜底走 React state，setEndCallPending(true) 要等 commit 才生效。
  // 同帧 <16ms double-click「结束通话」按钮（同样 disabled=endCallPending 视觉
  // 层也兜不住）：
  // · click 1: endCallPending=false → 进入 → digitalHumanCall.endSession() +
  //   await onEndCall()（父层会写入「通话已结束」聊天卡片）
  // · click 2: endCallPending 仍 false（state 未提交）→ 也进入 → 第 2 次
  //   endSession() + 第 2 次 onEndCall() → 聊天里冒出 2 条「通话已结束」消息
  // ref 同步赋值挡掉同帧后续 click，finally 解锁（让 onEndCall 失败时下次
  // 还能再试）。
  const endCallSubmittingRef = useRef(false);
  const handleEndCall = async () => {
    if (endCallSubmittingRef.current || endCallPending) {
      return;
    }
    endCallSubmittingRef.current = true;

    setEndCallError(null);
    activeCall.cancelRecordingTurn();
    setRecordButtonHolding(false);
    activeCall.stopReplyPlayback();

    if (!onEndCall) {
      try {
        if (isVideoMode) {
          await digitalHumanCall.endSession().catch(() => {});
        }
        onClose();
      } finally {
        endCallSubmittingRef.current = false;
      }
      return;
    }

    try {
      setEndCallPending(true);
      if (isVideoMode) {
        await digitalHumanCall.endSession();
      }
      await onEndCall();
      onClose();
    } catch (error) {
      setEndCallError(
        error instanceof Error
          ? error.message
          : t(msg`结束通话失败，请稍后再试。`),
      );
    } finally {
      setEndCallPending(false);
      endCallSubmittingRef.current = false;
    }
  };

  return (
    <section className="flex h-full min-h-0 gap-4 rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)] p-5 shadow-[var(--shadow-card)]">
      <audio ref={activeCall.audioRef} preload="auto" />

      <div className="flex min-w-0 flex-[1.06] flex-col rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-[color:var(--brand-primary)]">
              {kind === "video" ? <Video size={13} /> : <Mic size={13} />}
              {callLabel}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <AvatarChip
                name={conversationTitle}
                src={characterQuery.data?.avatar}
                size="xl"
              />
              <div className="min-w-0">
                <div className="truncate text-[22px] font-semibold text-[color:var(--text-primary)]">
                  {conversationTitle}
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  {callSubtitle}
                </div>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="shrink-0 rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] shadow-none hover:bg-white hover:text-[color:var(--text-primary)]"
          >
            {t(msg`返回聊天`)}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <CallMetricCard
            label={t(msg`当前状态`)}
            value={statusLabel}
            detail={statusHint}
          />
          <CallMetricCard
            label={t(msg`发起时间`)}
            value={formatDetailedMessageTimestamp(startedAt)}
            detail={
              isVideoMode
                ? t(msg`本页承接 AI 数字人视频工作台，不接真人 RTC。`)
                : t(msg`本页只承接 AI 语音，不接真人 RTC。`)
            }
          />
          <CallMetricCard
            label={t(msg`最近一轮`)}
            value={
              latestTurn
                ? formatDurationLabel(latestTurn.totalDurationMs)
                : t(msg`等待开始`)
            }
            detail={t(msg`成功后会同步写入当前聊天消息流。`)}
          />
        </div>

        <div className="mt-5 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
          <div className="flex flex-wrap gap-3">
            <CallControlButton
              active={!micMuted}
              label={micMuted ? t(msg`解除麦克风静音`) : t(msg`静音麦克风`)}
              icon={micMuted ? <Mic size={16} /> : <MicOff size={16} />}
              onClick={() => {
                if (!micMuted) {
                  activeCall.cancelRecordingTurn();
                  setRecordButtonHolding(false);
                }
                setMicMuted((current) => !current);
              }}
            />
            <CallControlButton
              active={speakerEnabled}
              label={speakerEnabled ? t(msg`扬声器已开`) : t(msg`开启扬声器`)}
              icon={
                speakerEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />
              }
              onClick={() => activeCall.setAudioMuted((current) => !current)}
            />
            {isVideoMode ? (
              <CallControlButton
                active={cameraEnabled}
                label={
                  cameraEnabled
                    ? t(msg`关闭本地摄像头`)
                    : t(msg`打开本地摄像头`)
                }
                icon={
                  cameraEnabled ? (
                    <CameraOff size={16} />
                  ) : (
                    <Camera size={16} />
                  )
                }
                onClick={() => setCameraEnabled((current) => !current)}
              />
            ) : null}
            <CallControlButton
              active={Boolean(latestTurn)}
              label={t(msg`重播上一句`)}
              icon={
                activeCall.playbackState === "playing" ? (
                  <Pause size={16} />
                ) : (
                  <RotateCcw size={16} />
                )
              }
              onClick={() => {
                void activeCall.replayLastTurn();
              }}
              disabled={!latestTurn}
            />
          </div>

          <div className="mt-4 space-y-3">
            {isVideoMode && !cameraEnabled ? (
              <InlineNotice tone="info">
                {t(msg`你已关闭本地摄像头，仍可继续进行数字人视频通话。`)}
              </InlineNotice>
            ) : null}
            {isVideoMode &&
            cameraEnabled &&
            cameraPreview.error &&
            cameraPreview.status !== "requesting-permission" ? (
              <InlineNotice tone="warning">{cameraPreview.error}</InlineNotice>
            ) : null}
            {isVideoMode &&
            !digitalHumanCall.sessionError &&
            digitalHumanGatewayCopy?.noticeMessage ? (
              <InlineNotice tone={digitalHumanGatewayCopy.noticeTone}>
                {digitalHumanGatewayCopy.noticeMessage}
              </InlineNotice>
            ) : null}
            {!speech.supported ? (
              <InlineNotice tone="warning">
                {t(msg`当前浏览器不支持桌面端语音录制，请改用键盘聊天或切换浏览器。`)}
              </InlineNotice>
            ) : null}
            {activeCall.turnMutation.error instanceof Error ? (
              <ErrorBlock message={activeCall.turnMutation.error.message} />
            ) : null}
            {isVideoMode && digitalHumanCall.sessionError ? (
              <ErrorBlock message={digitalHumanCall.sessionError} />
            ) : null}
            {endCallError ? <ErrorBlock message={endCallError} /> : null}
            {speech.error ? <ErrorBlock message={speech.error} /> : null}
            {activeCall.playerError ? (
              <InlineNotice tone="info">{activeCall.playerError}</InlineNotice>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex min-h-0 flex-1">
          {isVideoMode ? (
            <DigitalHumanPlayer
              variant="desktop"
              name={conversationTitle}
              fallbackSrc={undefined}
              session={digitalHumanCall.session}
              talking={activeCall.playbackState === "playing"}
              thinking={
                digitalHumanCall.sessionState === "connecting" ||
                activeCall.turnMutation.isPending
              }
              statusLabel={statusLabel}
              statusHint={statusHint}
              onRetryRender={() => {
                digitalHumanCall.retrySession();
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <RecordButton
                disabled={micMuted || activeCall.busy || !speech.supported}
                label={recordButtonLabel}
                hint={t(msg`空闲时即可开始下一轮语音`)}
                onPressStart={handlePressStart}
                onPressEnd={handlePressEnd}
                playbackState={activeCall.playbackState}
                recordButtonHolding={recordButtonHolding}
                speechStatus={speech.status}
                turnPending={activeCall.turnMutation.isPending}
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {isVideoMode ? (
            <Button
              type="button"
              variant="secondary"
              onPointerDown={(event) => {
                event.preventDefault();
                void handlePressStart();
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                handlePressEnd();
              }}
              onPointerCancel={handlePressEnd}
              onPointerLeave={() => {
                if (recordButtonHolding) {
                  handlePressEnd();
                }
              }}
              disabled={micMuted || activeCall.busy || !speech.supported}
              className="rounded-[10px] bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95 disabled:bg-[color:var(--brand-primary)] disabled:text-white"
            >
              <Mic size={16} />
              {recordButtonLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void activeCall.replayLastTurn();
            }}
            disabled={!latestTurn}
            className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] shadow-none hover:bg-white hover:text-[color:var(--text-primary)]"
          >
            <RotateCcw size={16} />
            {t(msg`重播上一句`)}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] shadow-none hover:bg-white hover:text-[color:var(--text-primary)]"
          >
            {t(msg`切回聊天`)}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleEndCall}
            disabled={endCallPending}
            className="rounded-[10px] border-[rgba(220,38,38,0.14)] bg-[rgba(254,242,242,0.92)] text-[#d74b45] shadow-none hover:border-[rgba(220,38,38,0.2)] hover:bg-[rgba(254,226,226,0.96)]"
          >
            <PhoneOff size={16} />
            {endCallPending ? t(msg`结束中...`) : t(msg`结束通话`)}
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-[0.94] flex-col rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {isVideoMode ? t(msg`本轮字幕与侧控`) : t(msg`本轮摘要`)}
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {isVideoMode
                ? t(msg`数字人播报文案、本地预览和本轮文本都会同步保存在当前聊天里。`)
                : t(msg`本轮语音消息、可用字幕和 AI 回复都会同步保存在当前聊天里。`)}
            </div>
          </div>
          <div
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium",
              activeCall.playbackState === "playing"
                ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
                : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-muted)]",
            )}
          >
            {activeCall.playbackState === "playing"
              ? t(msg`AI 正在播报`)
              : t(msg`等待下一轮`)}
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-3">
          {isVideoMode ? (
            <CameraPreviewCard
              cameraEnabled={cameraEnabled}
              error={cameraPreview.error}
              status={cameraPreview.status}
              videoRef={cameraPreview.videoRef}
            />
          ) : null}
          <TranscriptCard
            label={t(msg`我`)}
            text={
              activeCall.turnMutation.isPending
                ? speech.displayText || t(msg`本轮语音已发出，正在整理...`)
                : resolveLatestTurnTranscript(latestTurn) ||
                  (isVideoMode
                    ? t(msg`按住下方按钮说话，远端数字人舞台会在这一轮回复时自动播报。`)
                    : t(msg`按住左侧按钮说话，AI 会优先直接理解录音；若转写可用，会补显示字幕。`))
            }
            own
          />
          <TranscriptCard
            label={conversationTitle}
            text={
              latestTurn?.assistantText ||
              (isVideoMode
                ? t(msg`数字人的回复会显示在这里，同时驱动当前舞台播报。`)
                : t(msg`AI 的回复文本会显示在这里，同时自动播报。`))
            }
          />
        </div>
      </div>
    </section>
  );
}

function RecordButton({
  disabled,
  hint,
  label,
  onPressEnd,
  onPressStart,
  playbackState,
  recordButtonHolding,
  speechStatus,
  turnPending,
}: {
  disabled: boolean;
  hint: string;
  label: string;
  onPressEnd: () => void;
  onPressStart: () => Promise<void>;
  playbackState: "idle" | "playing";
  recordButtonHolding: boolean;
  speechStatus: string;
  turnPending: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        void onPressStart();
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        onPressEnd();
      }}
      onPointerCancel={onPressEnd}
      onPointerLeave={() => {
        if (recordButtonHolding) {
          onPressEnd();
        }
      }}
      disabled={disabled}
      className="flex h-[184px] w-[184px] items-center justify-center rounded-full border border-[rgba(7,193,96,0.12)] bg-[radial-gradient(circle_at_top,rgba(236,251,241,0.98),rgba(115,208,153,0.9)_58%,rgba(48,163,106,0.92))] text-white shadow-[0_16px_34px_rgba(15,23,42,0.08),0_8px_18px_rgba(7,193,96,0.1)] transition active:scale-[0.985] active:shadow-[0_10px_22px_rgba(15,23,42,0.08),0_6px_14px_rgba(7,193,96,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex flex-col items-center gap-3">
        {turnPending ? (
          <LoaderCircle size={34} className="animate-spin" />
        ) : playbackState === "playing" ? (
          <Volume2 size={34} />
        ) : recordButtonHolding ||
          speechStatus === "listening" ||
          speechStatus === "requesting-permission" ? (
          <Mic size={34} />
        ) : (
          <Play size={34} className="ml-1" />
        )}
        <span className="text-[18px] font-medium">{label}</span>
        <span className="text-xs text-white/75">{hint}</span>
      </span>
    </button>
  );
}

function CallMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-4 shadow-[var(--shadow-soft)]">
      <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-[18px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
        {detail}
      </div>
    </div>
  );
}

function CallControlButton({
  active,
  label,
  icon,
  disabled = false,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-sm transition",
        active
          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
          : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)]",
        disabled
          ? "cursor-not-allowed opacity-45"
          : "hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function CameraPreviewCard({
  cameraEnabled,
  error,
  status,
  videoRef,
}: {
  cameraEnabled: boolean;
  error: string | null;
  status: "idle" | "requesting-permission" | "ready" | "unsupported";
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] bg-white/82 px-4 py-3 backdrop-blur-xl">
        <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
          {translateRuntimeMessage(msg`我的摄像头预览`)}
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          {cameraEnabled
            ? translateRuntimeMessage(msg`预览中`)
            : translateRuntimeMessage(msg`已关闭`)}
        </div>
      </div>
      <div className="relative aspect-[4/3] bg-[linear-gradient(180deg,rgba(55,65,81,0.98),rgba(17,24,39,0.98))]">
        {cameraEnabled && status === "ready" ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full scale-x-[-1] object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center text-white/72">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12">
              {cameraEnabled ? (
                status === "requesting-permission" ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <Camera size={18} />
                )
              ) : (
                <CameraOff size={18} />
              )}
            </div>
            <div className="text-[13px] leading-6">
              {cameraEnabled
                ? status === "requesting-permission"
                  ? translateRuntimeMessage(msg`申请摄像头权限中`)
                  : error || translateRuntimeMessage(msg`等待本地画面接通`)
                : translateRuntimeMessage(msg`本地摄像头已关闭`)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function TranscriptCard({
  label,
  text,
  own = false,
}: {
  label: string;
  text: string;
  own?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[14px] px-4 py-4 shadow-[var(--shadow-soft)]",
        own
          ? "border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)]"
          : "border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
      )}
    >
      <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-[15px] leading-7 text-[color:var(--text-primary)]">
        {text}
      </div>
    </section>
  );
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
      return t(msg`本轮语音已发出，字幕补跑中，AI 已按原始录音完成理解。`);
    case "failed":
      return t(msg`本轮语音已发出，字幕生成失败，AI 已按原始录音完成理解。`);
    case "skipped":
    default:
      return t(msg`本轮语音已发出，AI 已按原始录音完成理解。`);
  }
}

function formatDurationLabel(durationMs: number) {
  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  if (totalSeconds < 60) {
    return translateRuntimeMessage(msg`${totalSeconds} 秒`);
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!seconds) {
    return translateRuntimeMessage(msg`${minutes} 分钟`);
  }

  return translateRuntimeMessage(msg`${minutes} 分 ${seconds} 秒`);
}
