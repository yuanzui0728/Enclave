import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createGroupVoiceCallTurn,
  type CallFinalizeEndedReason,
  type GroupVoiceCallAssistantTurn,
  type GroupVoiceCallTurnResult,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { isNativeMobileRuntime } from "../../runtime/native-runtime";
import { resolveAppMediaUrl } from "../../lib/media-url";
import { useCallFinalize } from "./use-call-finalize";
import { useContinuousVoiceLoop } from "./use-continuous-voice-loop";
import { useSpeechInput } from "./use-speech-input";

const t = translateRuntimeMessage;

type UseGroupVoiceCallSessionOptions = {
  baseUrl?: string;
  groupId: string;
  enabled: boolean;
  /** 屏幕正在离开（挂断/导航），停掉 VAD 连续监听 */
  leaving?: boolean;
  participantCount?: number;
  requestedSpeakerIds?: string[];
  onTurnSuccess?: (result: GroupVoiceCallTurnResult) => void | Promise<void>;
  onSessionEnded?: (reason: CallFinalizeEndedReason) => void;
};

type PlaybackPhase = "idle" | "playing";

/**
 * 群聊语音通话会话：
 * - 单轮接受多个 AI 角色顺序回话（planner 选人，最多 2 人）
 * - audioQueueRef 维护本轮 turn 队列；activeSpeakerId 高亮当前说话角色
 * - assistantAudioUrl 为 null 的 turn（TTS 兜底失败）仍展示头像 highlight，
 *   但不播放音频，立即推进队列
 */
export function useGroupVoiceCallSession({
  baseUrl,
  groupId,
  enabled,
  leaving = false,
  participantCount,
  requestedSpeakerIds,
  onTurnSuccess,
  onSessionEnded,
}: UseGroupVoiceCallSessionOptions) {
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<GroupVoiceCallAssistantTurn[]>([]);
  // TTS 失败的 turn 用 setTimeout 维持 1.2s "X 在说" 高亮再推进队列，
  // 需要 ref 持 handle 让 stopReplyPlayback / unmount cleanup 能取消，
  // 否则用户挂断后 1.2s 内 setState on unmounted。
  const fallbackPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmitRecordingRef = useRef(false);
  const speechCancelRef = useRef<() => void>(() => {});
  const speechClearResultRef = useRef<() => void>(() => {});
  const [lastTurn, setLastTurn] = useState<GroupVoiceCallTurnResult | null>(
    null,
  );
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackPhase>("idle");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const speech = useSpeechInput({
    baseUrl,
    conversationId: groupId,
    enabled,
    mode: "voice",
  });
  const callFinalize = useCallFinalize({
    thread: "group",
    mode: "voice",
    baseUrl,
    scopeId: groupId,
    ...(typeof participantCount === "number" ? { participantCount } : {}),
    enabled,
    ...(onSessionEnded ? { onSessionEnded } : {}),
  });

  speechCancelRef.current = speech.cancel;
  speechClearResultRef.current = speech.clearResult;

  const cancelFallbackPlayTimer = useCallback(() => {
    if (fallbackPlayTimerRef.current !== null) {
      clearTimeout(fallbackPlayTimerRef.current);
      fallbackPlayTimerRef.current = null;
    }
  }, []);

  const stopReplyPlayback = useCallback(() => {
    audioQueueRef.current = [];
    cancelFallbackPlayTimer();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaybackState("idle");
    setActiveSpeakerId(null);
  }, [cancelFallbackPlayTimer]);

  const playNext = useCallback(async () => {
    const audio = audioRef.current;
    const next = audioQueueRef.current.shift();
    if (!next) {
      setActiveSpeakerId(null);
      setPlaybackState("idle");
      return;
    }
    setActiveSpeakerId(next.characterId);
    setPlayerError(null);
    cancelFallbackPlayTimer();

    if (!next.assistantAudioUrl) {
      // TTS 失败的 turn：维持头像高亮一小段时间让 UI 看到"X 在说"，再继续下一条
      fallbackPlayTimerRef.current = setTimeout(() => {
        fallbackPlayTimerRef.current = null;
        void playNext();
      }, 1200);
      return;
    }

    if (!audio) {
      setActiveSpeakerId(null);
      setPlaybackState("idle");
      return;
    }

    audio.pause();
    audio.src = resolveAppMediaUrl(next.assistantAudioUrl);
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch {
      setPlaybackState("idle");
      setPlayerError(resolveAutoplayBlockedCopy());
    }
  }, [cancelFallbackPlayTimer]);

  const turnMutation = useMutation({
    mutationFn: async () => {
      if (!speech.recordedAudio) {
        throw new Error(t(msg`请先录一段语音再试。`));
      }
      const formData = new FormData();
      formData.append(
        "file",
        speech.recordedAudio.blob,
        speech.recordedAudio.fileName,
      );
      formData.append("durationMs", String(speech.recordedAudio.durationMs));
      formData.append("groupId", groupId);
      if (requestedSpeakerIds?.length) {
        formData.append(
          "requestedSpeakerIds",
          requestedSpeakerIds.join(","),
        );
      }
      return createGroupVoiceCallTurn(formData, baseUrl);
    },
    onSuccess: async (result) => {
      setLastTurn(result);
      speechClearResultRef.current();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        Promise.resolve(onTurnSuccess?.(result)),
      ]);
      audioQueueRef.current = [...result.assistantTurns];
      await playNext();
    },
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handlePlay = () => {
      setPlaybackState("playing");
      setPlayerError(null);
    };
    const handlePause = () => {
      setPlaybackState("idle");
    };
    const handleEnded = () => {
      // 当前 turn 播完，推进到下一个；queue 空了 playNext 会 reset state
      void playNext();
    };
    const handleError = () => {
      setPlaybackState("idle");
      setPlayerError(resolveVoicePlaybackFailedCopy());
      void playNext();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [playNext]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.muted = audioMuted;
  }, [audioMuted]);

  useEffect(() => {
    if (!speech.recordedAudio || speech.status !== "ready") {
      return;
    }
    if (!autoSubmitRecordingRef.current || turnMutation.isPending) {
      return;
    }
    autoSubmitRecordingRef.current = false;
    turnMutation.mutate();
  }, [speech.recordedAudio, speech.status, turnMutation]);

  useEffect(() => {
    autoSubmitRecordingRef.current = false;
    setLastTurn(null);
    setPlayerError(null);
    setAudioMuted(false);
    stopReplyPlayback();
    speechCancelRef.current();
  }, [groupId, stopReplyPlayback]);

  useEffect(() => {
    return () => {
      autoSubmitRecordingRef.current = false;
      stopReplyPlayback();
      speechCancelRef.current();
    };
  }, [stopReplyPlayback]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      return;
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") {
        return;
      }
      autoSubmitRecordingRef.current = false;
      stopReplyPlayback();
      speechCancelRef.current();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, stopReplyPlayback]);

  const startRecordingTurn = useCallback(async () => {
    if (!enabled) {
      return;
    }
    if (
      turnMutation.isPending ||
      playbackState === "playing" ||
      speech.status === "processing"
    ) {
      return;
    }
    autoSubmitRecordingRef.current = true;
    setPlayerError(null);
    if (speech.status !== "idle") {
      speech.cancel();
    }
    await speech.start();
  }, [enabled, playbackState, speech, turnMutation.isPending]);

  const stopRecordingTurn = useCallback(() => {
    if (
      speech.status === "listening" ||
      speech.status === "requesting-permission"
    ) {
      speech.stop();
      return;
    }
    autoSubmitRecordingRef.current = false;
  }, [speech]);

  const cancelRecordingTurn = useCallback(() => {
    autoSubmitRecordingRef.current = false;
    speech.cancel();
  }, [speech]);

  const replayLastTurn = useCallback(async () => {
    if (!lastTurn?.assistantTurns.length) {
      return;
    }
    audioQueueRef.current = [...lastTurn.assistantTurns];
    await playNext();
  }, [lastTurn, playNext]);

  const hangup = useCallback(
    async (reason?: CallFinalizeEndedReason) => {
      autoSubmitRecordingRef.current = false;
      stopReplyPlayback();
      speechCancelRef.current();
      await callFinalize.hangup(reason);
    },
    [callFinalize, stopReplyPlayback],
  );

  // 微信式连续免提通话：VAD 自动起录，多角色整列播完（playbackState 回 idle）
  // 才恢复监听
  const voiceLoop = useContinuousVoiceLoop({
    enabled,
    speech,
    playbackState,
    isMutationPending: turnMutation.isPending,
    isMutationError: turnMutation.isError,
    playerError,
    leaving,
    startRecordingTurn,
    stopRecordingTurn,
    cancelRecordingTurn,
  });

  return {
    activeSpeakerId,
    audioMuted,
    audioRef,
    voiceLoop,
    busy:
      turnMutation.isPending ||
      speech.status === "processing" ||
      playbackState === "playing",
    cancelRecordingTurn,
    hangup,
    lastTurn,
    playbackState,
    playerError,
    replayLastTurn,
    sessionStartedAtIso: callFinalize.startedAtIsoRef.current,
    setAudioMuted,
    speech,
    startRecordingTurn,
    stopRecordingTurn,
    stopReplyPlayback,
    turnMutation,
  };
}

function resolveAutoplayBlockedCopy() {
  return isNativeMobileRuntime()
    ? t(msg`系统拦截了自动播报，点"重播上一句"即可播放。`)
    : t(msg`浏览器拦截了自动播报，点"重播上一句"即可播放。`);
}

function resolveVoicePlaybackFailedCopy() {
  return isNativeMobileRuntime()
    ? t(msg`语音已生成，但当前设备没有成功播放。可以点"重播上一句"再试。`)
    : t(msg`语音已生成，但浏览器没有成功播放。可以点"重播上一句"再试。`);
}
