import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
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
      if (sessionConnectedAnnounced || kind !== "voice") {
        return;
      }

      setSessionConnectedAnnounced(true);
      await onSessionConnected?.(result);
    },
  });
  const speech = voiceCall.speech;
  const speakerEnabled = !voiceCall.audioMuted;
  const statusLabel = useMemo(() => {
    if (kind === "video") {
      return "视频暂未开放";
    }

    if (micMuted) {
      return "麦克风已静音";
    }

    if (voiceCall.turnMutation.isPending) {
      return "AI 回复中";
    }

    if (voiceCall.playbackState === "playing") {
      return "正在播报";
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return "正在聆听";
    }

    if (voiceCall.lastTurn) {
      return "继续说话";
    }

    return "按住说话";
  }, [
    kind,
    micMuted,
    speech.status,
    voiceCall.lastTurn,
    voiceCall.playbackState,
    voiceCall.turnMutation.isPending,
  ]);
  const statusHint = useMemo(() => {
    if (kind === "video") {
      return "桌面端当前只接入 AI 语音通话，视频能力后续再补。";
    }

    if (micMuted) {
      return "先取消静音，再开始这一轮语音对话。";
    }

    if (voiceCall.turnMutation.isPending) {
      return "本轮语音已收到，正在转写并组织回复。";
    }

    if (voiceCall.playbackState === "playing") {
      return "当前为半双工模式，等 TA 说完后再开始下一轮。";
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return "松开按钮后会自动发起这一轮语音通话。";
    }

    if (!speech.supported) {
      return "当前浏览器不支持桌面端语音录制，请改用键盘聊天。";
    }

    return "按住说一段，AI 会写入聊天并自动语音回复。";
  }, [
    kind,
    micMuted,
    speech.status,
    speech.supported,
    voiceCall.playbackState,
    voiceCall.turnMutation.isPending,
  ]);

  const handlePressStart = async () => {
    if (kind !== "voice" || micMuted || voiceCall.busy) {
      return;
    }

    setRecordButtonHolding(true);
    await voiceCall.startRecordingTurn();
  };

  const handlePressEnd = () => {
    setRecordButtonHolding(false);
    voiceCall.stopRecordingTurn();
  };

  const handleClose = () => {
    voiceCall.stopReplyPlayback();
    onClose();
  };

  useEffect(() => {
    setSessionConnectedAnnounced(false);
    void onPanelOpenedRef.current?.();
  }, [conversationId, kind]);

  const handleEndCall = async () => {
    if (endCallPending) {
      return;
    }

    setEndCallError(null);
    voiceCall.cancelRecordingTurn();
    setRecordButtonHolding(false);
    voiceCall.stopReplyPlayback();

    if (!onEndCall) {
      onClose();
      return;
    }

    try {
      setEndCallPending(true);
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
      <audio ref={voiceCall.audioRef} preload="auto" />

      <div className="flex min-w-0 flex-[1.06] flex-col rounded-[26px] border border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(244,248,255,0.92),rgba(255,255,255,0.94))] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(59,130,246,0.12)] px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-[#2563eb]">
              {kind === "video" ? <Video size={13} /> : <Mic size={13} />}
              桌面 AI 语音通话
            </div>
            <div className="mt-4 flex items-center gap-4">
              <AvatarChip name={conversationTitle} size="xl" />
              <div className="min-w-0">
                <div className="truncate text-[22px] font-semibold text-[color:var(--text-primary)]">
                  {conversationTitle}
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  当前是回合制语音对话，AI 会在每轮结束后自动播报回复。
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
            detail="本页只承接 AI 语音，不接真人 RTC。"
          />
          <CallMetricCard
            label="最近一轮"
            value={
              voiceCall.lastTurn
                ? formatDurationLabel(voiceCall.lastTurn.totalDurationMs)
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
                  voiceCall.cancelRecordingTurn();
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
              onClick={() => voiceCall.setAudioMuted((current) => !current)}
            />
            <CallControlButton
              active={Boolean(voiceCall.lastTurn)}
              label="重播上一句"
              icon={
                voiceCall.playbackState === "playing" ? (
                  <Pause size={16} />
                ) : (
                  <RotateCcw size={16} />
                )
              }
              onClick={() => {
                void voiceCall.replayLastTurn();
              }}
              disabled={!voiceCall.lastTurn}
            />
          </div>

          <div className="mt-4 space-y-3">
            {kind === "video" ? (
              <InlineNotice tone="info">
                桌面端视频通话暂未接入，当前已收口为 AI 语音通话方案。
              </InlineNotice>
            ) : null}
            {!speech.supported ? (
              <InlineNotice tone="warning">
                当前浏览器不支持桌面端语音录制，请改用键盘聊天或切换浏览器。
              </InlineNotice>
            ) : null}
            {voiceCall.turnMutation.error instanceof Error ? (
              <ErrorBlock message={voiceCall.turnMutation.error.message} />
            ) : null}
            {endCallError ? <ErrorBlock message={endCallError} /> : null}
            {speech.error ? <ErrorBlock message={speech.error} /> : null}
            {voiceCall.playerError ? (
              <InlineNotice tone="info">{voiceCall.playerError}</InlineNotice>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-1 items-center justify-center">
          <button
            type="button"
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
            disabled={
              kind !== "voice" ||
              micMuted ||
              voiceCall.busy ||
              !speech.supported
            }
            className="flex h-[188px] w-[188px] items-center justify-center rounded-full border border-[#34d399]/28 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.72),rgba(5,150,105,0.96))] text-white shadow-[0_30px_80px_rgba(16,185,129,0.24)] transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex flex-col items-center gap-3">
              {voiceCall.turnMutation.isPending ? (
                <LoaderCircle size={34} className="animate-spin" />
              ) : voiceCall.playbackState === "playing" ? (
                <Volume2 size={34} />
              ) : recordButtonHolding ||
                speech.status === "listening" ||
                speech.status === "requesting-permission" ? (
                <Mic size={34} />
              ) : (
                <Play size={34} className="ml-1" />
              )}
              <span className="text-[18px] font-medium">
                {voiceCall.turnMutation.isPending
                  ? "AI 回复中"
                  : voiceCall.playbackState === "playing"
                    ? "播放中"
                    : recordButtonHolding || speech.status === "listening"
                      ? "松开发送"
                      : kind === "video"
                        ? "视频暂未开放"
                        : micMuted
                          ? "麦克风已静音"
                          : "按住说话"}
              </span>
              <span className="text-xs text-white/75">
                空闲时即可开始下一轮语音
              </span>
            </span>
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void voiceCall.replayLastTurn();
            }}
            disabled={!voiceCall.lastTurn}
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
              本轮摘要
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              本轮用户转写和 AI 文本回复会同步保存在当前聊天里。
            </div>
          </div>
          <div
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium",
              voiceCall.playbackState === "playing"
                ? "bg-[rgba(47,122,63,0.10)] text-[#2f7a3f]"
                : "bg-[rgba(59,130,246,0.10)] text-[#2563eb]",
            )}
          >
            {voiceCall.playbackState === "playing"
              ? "AI 正在播报"
              : "等待下一轮"}
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-3">
          <TranscriptCard
            label="我"
            text={
              voiceCall.turnMutation.isPending
                ? speech.displayText || "本轮语音已发出，正在整理..."
                : voiceCall.lastTurn?.userTranscript ||
                  "按住左侧按钮说话，系统会先转成文字，再交给 AI 回复。"
            }
            own
          />
          <TranscriptCard
            label={conversationTitle}
            text={
              voiceCall.lastTurn?.assistantText ||
              "AI 的回复文本会显示在这里，同时自动播报。"
            }
          />
        </div>
      </div>
    </section>
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
