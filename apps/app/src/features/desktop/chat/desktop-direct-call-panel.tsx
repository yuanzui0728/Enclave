import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
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
import type { VoiceCallTurnResult } from "@yinjie/contracts";
import { AvatarChip } from "../../../components/avatar-chip";
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

  onPanelOpenedRef.current = onPanelOpened;
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
  const activeCall = isVideoMode ? digitalHumanCall : voiceCall;
  const speech = activeCall.speech;
  const speakerEnabled = !activeCall.audioMuted;
  const latestTurn = isVideoMode
    ? digitalHumanCall.lastTurn
    : voiceCall.lastTurn;
  const statusLabel = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return "连接数字人中";
    }

    if (isVideoMode && digitalHumanCall.sessionState === "error") {
      return "连接失败";
    }

    if (micMuted) {
      return "麦克风已静音";
    }

    if (activeCall.turnMutation.isPending) {
      return isVideoMode ? "数字人整理回复中" : "AI 回复中";
    }

    if (activeCall.playbackState === "playing") {
      return isVideoMode ? "数字人正在说话" : "正在播报";
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return isVideoMode ? "正在听你说话" : "正在聆听";
    }

    if (latestTurn) {
      return isVideoMode ? "继续通话" : "继续说话";
    }

    return "按住说话";
  }, [
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    digitalHumanCall.sessionState,
    isVideoMode,
    latestTurn,
    micMuted,
    speech.status,
  ]);
  const statusHint = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return "正在建立数字人视频工作台，会话就绪后即可开始这一轮通话。";
    }

    if (isVideoMode && digitalHumanCall.sessionState === "error") {
      return (
        digitalHumanCall.sessionError || "连接数字人工作台失败，请稍后再试。"
      );
    }

    if (micMuted) {
      return isVideoMode
        ? "先取消静音，再开始这一轮数字人视频通话。"
        : "先取消静音，再开始这一轮语音对话。";
    }

    if (activeCall.turnMutation.isPending) {
      return isVideoMode
        ? "本轮语音已收到，数字人正在整理文本、语音与舞台播报。"
        : "本轮语音已收到，正在转写并组织回复。";
    }

    if (activeCall.playbackState === "playing") {
      return isVideoMode
        ? "当前为半双工数字人视频通话，等 TA 说完后再开始下一轮。"
        : "当前为半双工模式，等 TA 说完后再开始下一轮。";
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return isVideoMode
        ? "松开按钮后会自动发起这一轮数字人视频通话。"
        : "松开按钮后会自动发起这一轮语音通话。";
    }

    if (!speech.supported) {
      return isVideoMode
        ? "当前浏览器不支持桌面端语音录制，暂时无法继续数字人视频通话。"
        : "当前浏览器不支持桌面端语音录制，请改用键盘聊天。";
    }

    return isVideoMode
      ? "远端是 AI 数字人舞台，本地摄像头只用于你的桌面预览，不影响 AI 回复链路。"
      : "按住说一段，AI 会写入聊天并自动语音回复。";
  }, [
    isVideoMode,
    micMuted,
    speech.status,
    speech.supported,
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    digitalHumanCall.sessionError,
    digitalHumanCall.sessionState,
  ]);
  const callLabel = isVideoMode ? "AI 数字人视频通话" : "桌面 AI 语音通话";
  const callSubtitle = isVideoMode
    ? "当前为半双工数字人视频通话，你说一轮，TA 回一轮。"
    : "当前是回合制语音对话，AI 会在每轮结束后自动播报回复。";
  const recordButtonLabel = activeCall.turnMutation.isPending
    ? isVideoMode
      ? "数字人回复中"
      : "AI 回复中"
    : activeCall.playbackState === "playing"
      ? "播放中"
      : recordButtonHolding || speech.status === "listening"
        ? "松开发送"
        : micMuted
          ? "麦克风已静音"
          : "按住说话";

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

  const handleClose = async () => {
    activeCall.stopReplyPlayback();
    if (isVideoMode) {
      await digitalHumanCall.endSession().catch(() => {});
    }
    onClose();
  };

  useEffect(() => {
    setSessionConnectedAnnounced(false);
    void onPanelOpenedRef.current?.();
  }, [conversationId, kind]);

  useEffect(() => {
    setCameraEnabled(kind === "video");
  }, [kind]);

  const handleEndCall = async () => {
    if (endCallPending) {
      return;
    }

    setEndCallError(null);
    activeCall.cancelRecordingTurn();
    setRecordButtonHolding(false);
    activeCall.stopReplyPlayback();

    if (!onEndCall) {
      if (isVideoMode) {
        await digitalHumanCall.endSession().catch(() => {});
      }
      onClose();
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
        error instanceof Error ? error.message : "结束通话失败，请稍后再试。",
      );
    } finally {
      setEndCallPending(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 gap-5 rounded-[30px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,252,0.96))] p-5 shadow-[var(--shadow-card)]">
      <audio ref={activeCall.audioRef} preload="auto" />

      <div className="flex min-w-0 flex-[1.06] flex-col rounded-[26px] border border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(244,248,255,0.92),rgba(255,255,255,0.94))] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(59,130,246,0.12)] px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-[#2563eb]">
              {kind === "video" ? <Video size={13} /> : <Mic size={13} />}
              {callLabel}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <AvatarChip name={conversationTitle} size="xl" />
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
            className="shrink-0 rounded-full"
          >
            返回聊天
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <CallMetricCard
            label="当前状态"
            value={statusLabel}
            detail={statusHint}
          />
          <CallMetricCard
            label="发起时间"
            value={formatDetailedMessageTimestamp(startedAt)}
            detail={
              isVideoMode
                ? "本页承接 AI 数字人视频工作台，不接真人 RTC。"
                : "本页只承接 AI 语音，不接真人 RTC。"
            }
          />
          <CallMetricCard
            label="最近一轮"
            value={
              latestTurn
                ? formatDurationLabel(latestTurn.totalDurationMs)
                : "等待开始"
            }
            detail="成功后会同步写入当前聊天消息流。"
          />
        </div>

        <div className="mt-5 rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/88 p-4">
          <div className="flex flex-wrap gap-3">
            <CallControlButton
              active={!micMuted}
              label={micMuted ? "解除麦克风静音" : "静音麦克风"}
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
              label={speakerEnabled ? "扬声器已开" : "开启扬声器"}
              icon={
                speakerEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />
              }
              onClick={() => activeCall.setAudioMuted((current) => !current)}
            />
            {isVideoMode ? (
              <CallControlButton
                active={cameraEnabled}
                label={cameraEnabled ? "关闭本地摄像头" : "打开本地摄像头"}
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
              label="重播上一句"
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
            {isVideoMode ? (
              <InlineNotice tone="info">
                当前先接入桌面数字人舞台与语音回合链路，后续再接真实数字人视频流。
              </InlineNotice>
            ) : null}
            {isVideoMode && !cameraEnabled ? (
              <InlineNotice tone="info">
                你已关闭本地摄像头，仍可继续进行数字人视频通话。
              </InlineNotice>
            ) : null}
            {isVideoMode &&
            cameraEnabled &&
            cameraPreview.error &&
            cameraPreview.status !== "requesting-permission" ? (
              <InlineNotice tone="warning">{cameraPreview.error}</InlineNotice>
            ) : null}
            {!speech.supported ? (
              <InlineNotice tone="warning">
                当前浏览器不支持桌面端语音录制，请改用键盘聊天或切换浏览器。
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
            <DigitalHumanStage
              name={conversationTitle}
              talking={activeCall.playbackState === "playing"}
              thinking={
                digitalHumanCall.sessionState === "connecting" ||
                activeCall.turnMutation.isPending
              }
              statusLabel={statusLabel}
              statusHint={statusHint}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <RecordButton
                disabled={micMuted || activeCall.busy || !speech.supported}
                label={recordButtonLabel}
                hint="空闲时即可开始下一轮语音"
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
              className="rounded-full bg-[linear-gradient(180deg,#2563eb,#1d4ed8)] text-white hover:opacity-95 disabled:bg-[linear-gradient(180deg,#2563eb,#1d4ed8)] disabled:text-white"
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
            className="rounded-full"
          >
            <RotateCcw size={16} />
            重播上一句
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="rounded-full"
          >
            切回聊天
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleEndCall}
            disabled={endCallPending}
            className="rounded-full text-[#d74b45]"
          >
            <PhoneOff size={16} />
            {endCallPending ? "结束中..." : "结束通话"}
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-[0.94] flex-col rounded-[26px] border border-[rgba(15,23,42,0.06)] bg-white/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {isVideoMode ? "本轮字幕与侧控" : "本轮摘要"}
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {isVideoMode
                ? "数字人播报文案、本地预览和本轮文本都会同步保存在当前聊天里。"
                : "本轮用户转写和 AI 文本回复会同步保存在当前聊天里。"}
            </div>
          </div>
          <div
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium",
              activeCall.playbackState === "playing"
                ? "bg-[rgba(47,122,63,0.10)] text-[#2f7a3f]"
                : "bg-[rgba(59,130,246,0.10)] text-[#2563eb]",
            )}
          >
            {activeCall.playbackState === "playing"
              ? "AI 正在播报"
              : "等待下一轮"}
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
            label="我"
            text={
              activeCall.turnMutation.isPending
                ? speech.displayText || "本轮语音已发出，正在整理..."
                : latestTurn?.userTranscript ||
                  (isVideoMode
                    ? "按住下方按钮说话，远端数字人舞台会在这一轮回复时自动播报。"
                    : "按住左侧按钮说话，系统会先转成文字，再交给 AI 回复。")
            }
            own
          />
          <TranscriptCard
            label={conversationTitle}
            text={
              latestTurn?.assistantText ||
              (isVideoMode
                ? "数字人的回复会显示在这里，同时驱动当前舞台播报。"
                : "AI 的回复文本会显示在这里，同时自动播报。")
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
      className="flex h-[188px] w-[188px] items-center justify-center rounded-full border border-[#34d399]/28 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.72),rgba(5,150,105,0.96))] text-white shadow-[0_30px_80px_rgba(16,185,129,0.24)] transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="rounded-[20px] border border-[rgba(15,23,42,0.06)] bg-white/88 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
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
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition",
        active
          ? "border-[rgba(37,99,235,0.18)] bg-[rgba(59,130,246,0.10)] text-[#2563eb]"
          : "border-[rgba(15,23,42,0.08)] bg-white text-[color:var(--text-secondary)]",
        disabled ? "cursor-not-allowed opacity-45" : "hover:opacity-90",
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
    <section className="overflow-hidden rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-[#f8fafc]">
      <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.06)] px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
          我的摄像头预览
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          {cameraEnabled ? "预览中" : "已关闭"}
        </div>
      </div>
      <div className="relative aspect-[4/3] bg-[linear-gradient(180deg,rgba(30,41,59,0.98),rgba(15,23,42,0.96))]">
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
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
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
                  ? "申请摄像头权限中"
                  : error || "等待本地画面接通"
                : "本地摄像头已关闭"}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DigitalHumanStage({
  name,
  talking,
  thinking,
  statusHint,
  statusLabel,
}: {
  name: string;
  talking: boolean;
  thinking: boolean;
  statusHint: string;
  statusLabel: string;
}) {
  const initial = name.trim().slice(0, 1) || "AI";

  return (
    <section className="relative flex min-h-0 flex-1 overflow-hidden rounded-[28px] border border-[rgba(15,23,42,0.06)] bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_30%),linear-gradient(180deg,#111827_0%,#0f172a_46%,#020617_100%)] p-5 text-white shadow-[0_22px_60px_rgba(15,23,42,0.22)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(52,211,153,0.14),transparent_34%)]" />
      <div className="relative flex flex-1 flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#34d399]/20 bg-[#34d399]/10 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-[#bbf7d0]">
              <Video size={13} />
              数字人舞台
            </div>
            <div className="mt-3 text-[28px] font-semibold tracking-[0.01em]">
              {name}
            </div>
          </div>
          <div className="max-w-[156px] rounded-[18px] border border-white/10 bg-white/8 px-3 py-2 text-right">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">
              状态
            </div>
            <div className="mt-1 text-sm font-medium text-[#bbf7d0]">
              {statusLabel}
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-6">
          <div className="relative flex flex-col items-center">
            <div
              className={cn(
                "absolute inset-[-18px] rounded-full border",
                talking
                  ? "animate-ping border-[#34d399]/28"
                  : thinking
                    ? "animate-pulse border-[#60a5fa]/24"
                    : "border-white/6",
              )}
            />
            <div className="absolute inset-[-34px] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.24),transparent_66%)] blur-3xl" />
            <div className="relative flex h-[224px] w-[224px] items-center justify-center overflow-hidden rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(30,41,59,0.96),rgba(15,23,42,0.98))] shadow-[0_26px_80px_rgba(2,6,23,0.46)]">
              <span className="text-[64px] font-semibold text-white/86">
                {initial}
              </span>
            </div>
            <div className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4">
              <div className="flex items-end gap-1">
                {[0, 1, 2].map((item) => (
                  <span
                    key={item}
                    className={cn(
                      "w-1.5 rounded-full transition-all",
                      talking
                        ? "h-5 animate-pulse bg-[#34d399]"
                        : thinking
                          ? "h-4 animate-pulse bg-[#60a5fa]"
                          : "h-2 bg-white/28",
                    )}
                    style={
                      talking || thinking
                        ? { animationDelay: `${item * 120}ms` }
                        : undefined
                    }
                  />
                ))}
              </div>
              <span className="text-sm text-white/76">
                {talking
                  ? "数字人播报中"
                  : thinking
                    ? "数字人整理中"
                    : "数字人在线"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/8 bg-white/6 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">
            通话提示
          </div>
          <div className="mt-1 text-[13px] leading-6 text-white/72">
            {statusHint}
          </div>
        </div>
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
        "rounded-[22px] px-4 py-4",
        own
          ? "bg-[rgba(59,130,246,0.08)]"
          : "border border-[rgba(15,23,42,0.06)] bg-[#f8fafc]",
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-[15px] leading-7 text-[color:var(--text-primary)]">
        {text}
      </div>
    </section>
  );
}

function formatDurationLabel(durationMs: number) {
  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!seconds) {
    return `${minutes} 分钟`;
  }

  return `${minutes} 分 ${seconds} 秒`;
}
