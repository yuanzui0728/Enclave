import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  getCharacter,
  getConversations,
  getSystemStatus,
} from "@yinjie/contracts";
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
import { buildDirectCallInviteMessage } from "./group-call-message";
import { emitChatMessage } from "../../lib/socket";
import { useDesktopLayout } from "../shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useSelfCameraPreview } from "./use-self-camera-preview";
import { DigitalHumanPlayer } from "./digital-human-player";
import { useDigitalHumanCallSession } from "./use-digital-human-call-session";
import { useVoiceCallSession } from "./use-voice-call-session";

type MobileAiCallScreenProps = {
  mode: "voice" | "video";
};

export function MobileAiCallScreen({ mode }: MobileAiCallScreenProps) {
  const { conversationId } = useParams({
    strict: false,
  }) as {
    conversationId?: string;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [recordButtonHolding, setRecordButtonHolding] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(mode === "video");
  const [callTipsDismissed, setCallTipsDismissed] = useState(false);
  const waitingNoticeSentRef = useRef(false);
  const connectedNoticeSentRef = useRef(false);
  const endedNoticeSentRef = useRef(false);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });
  const systemStatusQuery = useQuery({
    queryKey: ["app-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    enabled: Boolean(baseUrl),
    retry: false,
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
  });
  const isVideoMode = mode === "video";
  const activeCall = isVideoMode ? digitalHumanCall : voiceCall;
  const speech = activeCall.speech;
  const digitalSession = isVideoMode ? digitalHumanCall.session : null;
  const lastUserTranscript = isVideoMode
    ? digitalHumanCall.lastTurn?.userTranscript
    : voiceCall.lastTurn?.userTranscript;
  const lastAssistantText = isVideoMode
    ? digitalHumanCall.lastTurn?.assistantText
    : voiceCall.lastTurn?.assistantText;
  const speechStatus = systemStatusQuery.data?.inferenceGateway;
  const latencySummary = activeCall.lastTurn
    ? `转写 ${formatCallLatency(activeCall.lastTurn.transcriptionDurationMs)} · 播报 ${formatCallLatency(activeCall.lastTurn.synthesisDurationMs)} · 总耗时 ${formatCallLatency(activeCall.lastTurn.totalDurationMs)}`
    : null;
  const speechProviderSummary = speechStatus
    ? [
        `回复 ${speechStatus.activeProvider ?? "未配置"}`,
        `转写 ${speechStatus.activeTranscriptionProvider ?? "未配置"}`,
        speechStatus.transcriptionMode === "dedicated"
          ? "独立网关"
          : "跟随主推理",
      ].join(" · ")
    : null;
  const showPermissionPrimer =
    !callTipsDismissed &&
    !isVideoMode &&
    speech.status === "idle" &&
    !lastUserTranscript &&
    !activeCall.turnMutation.isPending &&
    !speech.error;
  const showPermissionRequestHint =
    speech.status === "requesting-permission" && !speech.error;

  useEffect(() => {
    if (
      speech.status === "listening" ||
      speech.status === "requesting-permission"
    ) {
      return;
    }

    setRecordButtonHolding(false);
  }, [speech.status]);

  const characterName =
    characterQuery.data?.name?.trim() ||
    conversation?.title?.trim() ||
    (isVideoMode ? "视频通话" : "语音通话");
  const characterAvatar = characterQuery.data?.avatar || undefined;
  const characterStatus =
    characterQuery.data?.currentStatus?.trim() ||
    characterQuery.data?.currentActivity?.trim() ||
    "在线";
  const busy = activeCall.busy;
  const statusLabel = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return "正在连接数字人";
    }

    if (isVideoMode && digitalHumanCall.sessionError) {
      return "数字人连接失败";
    }

    if (activeCall.turnMutation.isPending) {
      return isVideoMode ? "数字人整理回复中" : "AI 正在思考";
    }

    if (activeCall.playbackState === "playing") {
      return isVideoMode ? "数字人正在说话" : "正在说话";
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return isVideoMode ? "正在听你说话" : "正在聆听";
    }

    if (lastAssistantText) {
      return isVideoMode ? "继续通话" : "继续说话";
    }

    return "按住说话";
  }, [
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    digitalHumanCall.sessionError,
    digitalHumanCall.sessionState,
    isVideoMode,
    lastAssistantText,
    speech.status,
  ]);
  const statusHint = useMemo(() => {
    if (isVideoMode && digitalHumanCall.sessionState === "connecting") {
      return "正在建立 AI 数字人视频通话，会话就绪后即可开始第一轮。";
    }

    if (isVideoMode && digitalHumanCall.sessionError) {
      return "当前数字人会话没有建立成功，可以直接重试连接，或者先改用语音通话。";
    }

    if (activeCall.turnMutation.isPending) {
      return "本轮语音已收到，正在转写并组织回复。";
    }

    if (activeCall.playbackState === "playing") {
      return isVideoMode
        ? "当前是半双工数字人通话，等 TA 说完后再开始下一轮。"
        : "当前是半双工模式，等 TA 说完后再开始下一轮。";
    }

    if (
      speech.status === "requesting-permission" ||
      speech.status === "listening"
    ) {
      return "松开按钮后会自动发起这一轮通话。";
    }

    return isVideoMode
      ? digitalSession?.presentationMode === "mock_stage"
        ? "当前已接入数字人会话接口，远端先以内置数字人舞台承载，后续可替换真实 provider 流。"
        : "远端是 AI 数字人舞台，本地摄像头仅用于预览，不影响 AI 回复链路。"
      : "每次说一段，AI 会回复一段语音。";
  }, [
    activeCall.playbackState,
    activeCall.turnMutation.isPending,
    digitalHumanCall.sessionError,
    digitalHumanCall.sessionState,
    digitalSession?.presentationMode,
    isVideoMode,
    speech.status,
  ]);

  const handlePressStart = async () => {
    if (busy || isDesktopLayout) {
      return;
    }

    setCallTipsDismissed(true);
    setRecordButtonHolding(true);
    await activeCall.startRecordingTurn();
  };

  const handlePressEnd = () => {
    setRecordButtonHolding(false);
    activeCall.stopRecordingTurn();
  };

  const handleBack = async () => {
    activeCall.stopReplyPlayback();
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

    void navigate({
      to: "/chat/$conversationId",
      params: { conversationId: resolvedConversationId },
    });
  };

  const handleSwitchToVoiceCall = async () => {
    activeCall.stopReplyPlayback();
    await digitalHumanCall.endSession();
    void navigate({
      to: "/chat/$conversationId/voice-call",
      params: { conversationId: resolvedConversationId },
    });
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

  if (conversationsQuery.isLoading) {
    return (
      <AppPage className="min-h-full bg-[#111827] px-4 py-6 text-white">
        <LoadingBlock
          label={
            isVideoMode ? "正在连接数字人视频通话..." : "正在连接语音通话..."
          }
        />
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
        <ErrorBlock
          message={
            isVideoMode
              ? "当前只支持在单聊里发起 AI 数字人视频通话。"
              : "当前只支持在单聊里发起 AI 语音通话。"
          }
        />
        <Button
          variant="secondary"
          onClick={handleBack}
          className="rounded-full"
        >
          返回聊天
        </Button>
      </AppPage>
    );
  }

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full space-y-4 bg-[#111827] px-4 py-6 text-white">
        <InlineNotice tone="info">
          当前页面只面向 Web 手机版，桌面端请回到聊天页顶部发起对应通话。
        </InlineNotice>
        <Button
          variant="secondary"
          onClick={handleBack}
          className="rounded-full"
        >
          返回聊天
        </Button>
      </AppPage>
    );
  }

  return (
    <AppPage className="min-h-full space-y-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.22),transparent_32%),linear-gradient(180deg,#111827_0%,#0f172a_42%,#020617_100%)] px-0 py-0 text-white">
      <audio ref={activeCall.audioRef} preload="auto" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(2,6,23,0.68)] px-3 py-3 backdrop-blur-xl">
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
            <div className="truncate text-[17px] font-medium">
              {isVideoMode ? "视频通话" : "语音通话"}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-white/60">
              {conversation.title}
            </div>
          </div>
          <button
            type="button"
            onClick={() => activeCall.setAudioMuted((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition active:bg-white/16"
            aria-label={activeCall.audioMuted ? "取消静音播放" : "静音播放"}
          >
            {activeCall.audioMuted ? (
              <VolumeX size={18} />
            ) : (
              <Volume2 size={18} />
            )}
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-65px)] flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-4">
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
                  我
                </span>
                <span className="text-[11px] text-white/48">
                  {cameraEnabled ? "预览中" : "已关闭"}
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
                      {cameraEnabled
                        ? cameraPreview.status === "requesting-permission"
                          ? "申请摄像头权限中"
                          : cameraPreview.error || "等待接通本地画面"
                        : "本地摄像头已关闭"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <div className="flex flex-col items-center text-center pt-2">
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
        )}

        <div className="mt-4 space-y-3">
          {speechStatus ? (
            <InlineNotice tone={speechStatus.speechReady ? "info" : "warning"}>
              {speechStatus.speechMessage}
              {speechProviderSummary ? ` 当前链路：${speechProviderSummary}。` : ""}
            </InlineNotice>
          ) : null}
          {showPermissionPrimer ? (
            <InlineNotice tone="info">
              首次使用请先允许浏览器访问麦克风。若系统拦截自动播报，下面可以直接点“点按播放回复”。
            </InlineNotice>
          ) : null}
          {showPermissionRequestHint ? (
            <InlineNotice tone="info">
              正在请求麦克风权限，请在浏览器弹窗里点允许。
            </InlineNotice>
          ) : null}
          {isVideoMode && !cameraEnabled ? (
            <InlineNotice tone="info">
              你已关闭本地摄像头，仍可继续进行 AI 数字人视频通话。
            </InlineNotice>
          ) : null}
          {isVideoMode &&
          cameraEnabled &&
          cameraPreview.error &&
          cameraPreview.status !== "requesting-permission" ? (
            <InlineNotice tone="warning">{cameraPreview.error}</InlineNotice>
          ) : null}
          {isVideoMode && digitalHumanCall.session?.presentationMode === "mock_stage" ? (
            <InlineNotice tone="info">
              当前视频通话已走数字人会话接口，远端先以内置数字人舞台承载，后续可替换真实 provider 视频输出。
            </InlineNotice>
          ) : null}
          {isVideoMode && digitalHumanCall.sessionError ? (
            <ErrorBlock message={digitalHumanCall.sessionError} />
          ) : null}
          {isVideoMode && digitalHumanCall.sessionError ? (
            <InlineNotice tone="info">
              这类失败通常是会话网关瞬时不可用。你可以先点“重新连接数字人”，不行再切到语音通话继续聊。
            </InlineNotice>
          ) : null}
          {activeCall.turnMutation.error instanceof Error ? (
            <ErrorBlock message={activeCall.turnMutation.error.message} />
          ) : null}
          {speech.error ? <ErrorBlock message={speech.error} /> : null}
          {activeCall.playerError ? (
            <InlineNotice tone="info">{activeCall.playerError}</InlineNotice>
          ) : null}
          {characterQuery.isError && characterQuery.error instanceof Error ? (
            <ErrorBlock message={characterQuery.error.message} />
          ) : null}
        </div>

        <div className="mt-4 grid gap-3">
          {latencySummary ? (
            <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-3 text-[12px] leading-6 text-white/72">
              最近一轮：{latencySummary}
            </div>
          ) : null}
          <CallBubble
            label="我"
            text={
              activeCall.turnMutation.isPending
                ? speech.displayText || "本轮语音已发出，正在整理..."
                : lastUserTranscript ||
                  (isVideoMode
                    ? "按住底部按钮说话，画面会保持在当前视频通话里。"
                    : "按住底部按钮，说出你想对 TA 说的话。")
            }
            align="right"
          />
          <CallBubble
            label={characterName}
            text={
              lastAssistantText ||
              (isVideoMode
                ? "数字人的回复会在这里显示，并通过语音自动播报。"
                : "TA 的回复会在这里显示，并自动播报给你听。")
            }
            align="left"
          />
        </div>

        <div className="mt-auto pt-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {isVideoMode && digitalHumanCall.sessionError ? (
              <button
                type="button"
                onClick={() => {
                  digitalHumanCall.retrySession();
                }}
                disabled={digitalHumanCall.sessionState === "connecting"}
                className="flex h-12 min-w-[148px] items-center justify-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 text-sm text-white transition disabled:opacity-45"
              >
                <RotateCcw size={16} />
                重新连接数字人
              </button>
            ) : null}
            {isVideoMode && digitalHumanCall.sessionError ? (
              <button
                type="button"
                onClick={() => {
                  void handleSwitchToVoiceCall();
                }}
                className="flex h-12 min-w-[148px] items-center justify-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 text-sm text-white transition"
              >
                <PhoneOff size={16} />
                改用语音通话
              </button>
            ) : null}
            {activeCall.playerError && lastAssistantText ? (
              <button
                type="button"
                onClick={() => {
                  void activeCall.replayLastTurn();
                }}
                className="flex h-12 min-w-[148px] items-center justify-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 text-sm text-white transition"
              >
                <Volume2 size={16} />
                点按播放回复
              </button>
            ) : null}
            {isVideoMode ? (
              <button
                type="button"
                onClick={() => setCameraEnabled((current) => !current)}
                className="flex h-12 min-w-[120px] items-center justify-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 text-sm text-white transition"
              >
                {cameraEnabled ? <CameraOff size={16} /> : <Camera size={16} />}
                {cameraEnabled ? "关闭摄像头" : "打开摄像头"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void activeCall.replayLastTurn();
              }}
              disabled={!lastAssistantText || activeCall.turnMutation.isPending}
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
              disabled={
                busy || (isVideoMode && digitalHumanCall.sessionState !== "ready")
              }
              className={cn(
                "flex items-center justify-center rounded-full border shadow-[0_30px_80px_rgba(16,185,129,0.3)] transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55",
                isVideoMode
                  ? "h-[156px] w-[156px] border-[#60a5fa]/28 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.76),rgba(37,99,235,0.96))]"
                  : "h-[172px] w-[172px] border-[#34d399]/28 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.72),rgba(5,150,105,0.96))]",
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
                    ? "连接中"
                    : isVideoMode && digitalHumanCall.sessionError
                      ? "暂不可用"
                    : activeCall.turnMutation.isPending
                    ? "AI 回复中"
                    : speech.status === "listening" || recordButtonHolding
                      ? "松开发送"
                      : activeCall.playbackState === "playing"
                        ? "播放中"
                        : "按住说话"}
                </span>
                <span className="text-xs text-white/72">
                  {isVideoMode
                    ? "当前为半双工数字人视频通话"
                    : "当前为半双工语音通话"}
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

function formatCallLatency(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
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
          ? "ml-auto max-w-[88%] rounded-[24px] rounded-br-[10px] bg-[#34d399]/12 px-4 py-3 text-right"
          : "mr-auto max-w-[88%] rounded-[24px] rounded-bl-[10px] bg-white/8 px-4 py-3 text-left"
      }
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
        {label}
      </div>
      <div className="mt-1 text-[15px] leading-7 text-white/92">{text}</div>
    </section>
  );
}
