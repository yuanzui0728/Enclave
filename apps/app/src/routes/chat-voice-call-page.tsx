import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { getCharacter, getConversations } from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import {
  ArrowLeft,
  LoaderCircle,
  Mic,
  MessageCircleMore,
  PhoneOff,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AvatarChip } from "../components/avatar-chip";
import { useVoiceCallSession } from "../features/chat/use-voice-call-session";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function ChatVoiceCallPage() {
  const { conversationId } = useParams({
    strict: false,
  }) as {
    conversationId?: string;
  };
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [recordButtonHolding, setRecordButtonHolding] = useState(false);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });
  const conversation = conversationsQuery.data?.find(
    (item) => item.id === conversationId,
  );
  const resolvedConversationId = conversationId ?? "";
  const characterId =
    conversation?.type === "direct" ? conversation.participants[0] : undefined;
  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId ?? "", baseUrl),
    enabled: Boolean(characterId),
  });
  const voiceCall = useVoiceCallSession({
    baseUrl,
    conversationId: resolvedConversationId,
    characterId,
    enabled: !isDesktopLayout && Boolean(conversationId),
  });
  const speech = voiceCall.speech;

  const characterName =
    characterQuery.data?.name?.trim() ||
    conversation?.title?.trim() ||
    "语音通话";
  const characterAvatar = characterQuery.data?.avatar || undefined;
  const characterStatus =
    characterQuery.data?.currentStatus?.trim() ||
    characterQuery.data?.currentActivity?.trim() ||
    "在线";
  const busy = voiceCall.busy;
  const statusLabel = useMemo(() => {
    if (voiceCall.turnMutation.isPending) {
      return "AI 正在思考";
    }

    if (voiceCall.playbackState === "playing") {
      return "正在说话";
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
    speech.status,
    voiceCall.lastTurn,
    voiceCall.playbackState,
    voiceCall.turnMutation.isPending,
  ]);
  const statusHint = useMemo(() => {
    if (voiceCall.turnMutation.isPending) {
      return "本轮语音已收到，正在转写并组织回复。";
    }

    if (voiceCall.playbackState === "playing") {
      return "当前是半双工模式，等 TA 说完后再开始下一轮。";
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return "松开按钮后会自动发起这一轮语音通话。";
    }

    return "每次说一段，AI 会回复一段语音。";
  }, [
    speech.status,
    voiceCall.playbackState,
    voiceCall.turnMutation.isPending,
  ]);

  const handlePressStart = async () => {
    if (busy || isDesktopLayout) {
      return;
    }

    setRecordButtonHolding(true);
    await voiceCall.startRecordingTurn();
  };

  const handlePressEnd = () => {
    setRecordButtonHolding(false);
    voiceCall.stopRecordingTurn();
  };

  const handleBack = () => {
    voiceCall.stopReplyPlayback();
    void navigate({
      to: "/chat/$conversationId",
      params: { conversationId: resolvedConversationId },
    });
  };

  if (conversationsQuery.isLoading) {
    return (
      <AppPage className="min-h-full bg-[#111827] px-4 py-6 text-white">
        <LoadingBlock label="正在连接语音通话..." />
      </AppPage>
    );
  }

  if (conversationsQuery.isError && conversationsQuery.error instanceof Error) {
    return (
      <AppPage className="min-h-full bg-[#111827] px-4 py-6 text-white">
        <ErrorBlock message={conversationsQuery.error.message} />
      </AppPage>
    );
  }

  if (!conversation || conversation.type !== "direct") {
    return (
      <AppPage className="min-h-full space-y-4 bg-[#111827] px-4 py-6 text-white">
        <ErrorBlock message="当前只支持在单聊里发起 AI 语音通话。" />
        <Button variant="secondary" onClick={handleBack} className="rounded-full">
          返回聊天
        </Button>
      </AppPage>
    );
  }

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full space-y-4 bg-[#111827] px-4 py-6 text-white">
        <InlineNotice tone="info">
          当前会话已支持桌面端 AI 语音通话，请回到聊天页顶部直接发起。
        </InlineNotice>
        <Button variant="secondary" onClick={handleBack} className="rounded-full">
          返回聊天
        </Button>
      </AppPage>
    );
  }

  return (
    <AppPage className="min-h-full space-y-0 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.18),transparent_38%),linear-gradient(180deg,#111827_0%,#0f172a_48%,#020617_100%)] px-0 py-0 text-white">
      <audio ref={voiceCall.audioRef} preload="auto" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(2,6,23,0.62)] px-3 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition active:bg-white/16"
            aria-label="返回聊天"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-medium">语音通话</div>
            <div className="mt-0.5 truncate text-[12px] text-white/60">
              {conversation.title}
            </div>
          </div>
          <button
            type="button"
            onClick={() => voiceCall.setAudioMuted((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition active:bg-white/16"
            aria-label={voiceCall.audioMuted ? "取消静音播放" : "静音播放"}
          >
            {voiceCall.audioMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-65px)] flex-col px-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-6">
        <div className="flex flex-col items-center text-center">
          <AvatarChip name={characterName} src={characterAvatar} size="xl" />
          <div className="mt-4 text-[28px] font-semibold tracking-[0.01em]">
            {characterName}
          </div>
          <div className="mt-1 text-sm text-white/62">{characterStatus}</div>
          <div className="mt-5 rounded-full border border-[#34d399]/22 bg-[#34d399]/10 px-4 py-2 text-sm text-[#bbf7d0]">
            {statusLabel}
          </div>
          <div className="mt-2 text-[13px] leading-6 text-white/58">
            {statusHint}
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {voiceCall.turnMutation.error instanceof Error ? (
            <ErrorBlock message={voiceCall.turnMutation.error.message} />
          ) : null}
          {speech.error ? <ErrorBlock message={speech.error} /> : null}
          {voiceCall.playerError ? (
            <InlineNotice tone="info">{voiceCall.playerError}</InlineNotice>
          ) : null}
          {characterQuery.isError && characterQuery.error instanceof Error ? (
            <ErrorBlock message={characterQuery.error.message} />
          ) : null}
        </div>

        <div className="mt-6 grid gap-3">
          <VoiceCallBubble
            label="我"
            text={
              voiceCall.turnMutation.isPending
                ? speech.displayText || "本轮语音已发出，正在整理..."
                : voiceCall.lastTurn?.userTranscript ||
                  "按住底部按钮，说出你想对 TA 说的话。"
            }
            align="right"
          />
          <VoiceCallBubble
            label={characterName}
            text={
              voiceCall.lastTurn?.assistantText ||
              "TA 的回复会在这里显示，并自动播报给你听。"
            }
            align="left"
          />
        </div>

        <div className="mt-auto pt-8">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                void voiceCall.replayLastTurn();
              }}
              disabled={!voiceCall.lastTurn || voiceCall.turnMutation.isPending}
              className="flex h-12 min-w-[120px] items-center justify-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 text-sm text-white transition disabled:opacity-45"
            >
              <RotateCcw size={16} />
              重播上一句
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="flex h-12 min-w-[120px] items-center justify-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 text-sm text-white transition"
            >
              <MessageCircleMore size={16} />
              切回聊天
            </button>
          </div>

          <div className="mt-5 flex justify-center">
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
              disabled={busy}
              className="flex h-[172px] w-[172px] items-center justify-center rounded-full border border-[#34d399]/28 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.72),rgba(5,150,105,0.96))] shadow-[0_30px_80px_rgba(16,185,129,0.3)] transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="flex flex-col items-center gap-3">
                {voiceCall.turnMutation.isPending ? (
                  <LoaderCircle size={34} className="animate-spin" />
                ) : (
                  <Mic size={36} />
                )}
                <span className="text-[17px] font-medium">
                  {voiceCall.turnMutation.isPending
                    ? "AI 回复中"
                    : speech.status === "listening" || recordButtonHolding
                      ? "松开发送"
                      : voiceCall.playbackState === "playing"
                        ? "播放中"
                        : "按住说话"}
                </span>
              </span>
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-full bg-[rgba(239,68,68,0.16)] px-4 text-sm font-medium text-[#fecaca] transition active:opacity-90"
            >
              <PhoneOff size={16} />
              挂断
            </button>
          </div>
        </div>
      </div>
    </AppPage>
  );
}

type VoiceCallBubbleProps = {
  label: string;
  text: string;
  align: "left" | "right";
};

function VoiceCallBubble({ label, text, align }: VoiceCallBubbleProps) {
  return (
    <section
      className={
        align === "right"
          ? "ml-auto max-w-[86%] rounded-[24px] rounded-br-[10px] bg-[#34d399]/12 px-4 py-3 text-right"
          : "mr-auto max-w-[86%] rounded-[24px] rounded-bl-[10px] bg-white/8 px-4 py-3 text-left"
      }
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
        {label}
      </div>
      <div className="mt-1 text-[15px] leading-7 text-white/92">{text}</div>
    </section>
  );
}
