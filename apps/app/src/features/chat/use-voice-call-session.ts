import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createVoiceCallTurn,
  type VoiceCallTurnResult,
} from "@yinjie/contracts";
import { isNativeMobileRuntime } from "../../runtime/native-runtime";
import { useSpeechInput } from "./use-speech-input";

type UseVoiceCallSessionOptions = {
  baseUrl?: string;
  conversationId: string;
  characterId?: string;
  enabled: boolean;
  onTurnSuccess?: (result: VoiceCallTurnResult) => void | Promise<void>;
};

export function useVoiceCallSession({
  baseUrl,
  conversationId,
  characterId,
  enabled,
  onTurnSuccess,
}: UseVoiceCallSessionOptions) {
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoSubmitRecordingRef = useRef(false);
  const speechCancelRef = useRef<() => void>(() => {});
  const speechClearResultRef = useRef<() => void>(() => {});
  const [lastTurn, setLastTurn] = useState<VoiceCallTurnResult | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [playbackState, setPlaybackState] = useState<"idle" | "playing">(
    "idle",
  );
  const [playerError, setPlayerError] = useState<string | null>(null);
  const speech = useSpeechInput({
    baseUrl,
    conversationId,
    enabled,
    mode: "voice",
  });

  speechCancelRef.current = speech.cancel;
  speechClearResultRef.current = speech.clearResult;

  const stopReplyPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setPlaybackState("idle");
  }, []);

  const playReplyAudio = useCallback(async (audioUrl: string) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.src = audioUrl;
    audio.currentTime = 0;
    setPlayerError(null);

    try {
      await audio.play();
    } catch {
      setPlaybackState("idle");
      setPlayerError(resolveAutoplayBlockedCopy());
    }
  }, []);

  const turnMutation = useMutation({
    mutationFn: async () => {
      if (!speech.recordedAudio) {
        throw new Error("请先录一段语音再试。");
      }

      const formData = new FormData();
      formData.append(
        "file",
        speech.recordedAudio.blob,
        speech.recordedAudio.fileName,
      );
      formData.append("conversationId", conversationId);
      if (characterId) {
        formData.append("characterId", characterId);
      }

      return createVoiceCallTurn(formData, baseUrl);
    },
    onSuccess: async (result) => {
      setLastTurn(result);
      speechClearResultRef.current();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-messages", baseUrl, conversationId],
        }),
        Promise.resolve(onTurnSuccess?.(result)),
      ]);
      await playReplyAudio(result.assistantAudioUrl);
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
      setPlaybackState("idle");
    };
    const handleError = () => {
      setPlaybackState("idle");
      setPlayerError(resolveVoicePlaybackFailedCopy());
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
  }, []);

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
    void turnMutation.mutateAsync();
  }, [speech.recordedAudio, speech.status, turnMutation]);

  useEffect(() => {
    autoSubmitRecordingRef.current = false;
    setLastTurn(null);
    setPlayerError(null);
    setAudioMuted(false);
    stopReplyPlayback();
    speechCancelRef.current();
  }, [characterId, conversationId, stopReplyPlayback]);

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
  }, [
    enabled,
    playbackState,
    speech,
    turnMutation.isPending,
  ]);

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
    if (!lastTurn) {
      return;
    }

    await playReplyAudio(lastTurn.assistantAudioUrl);
  }, [lastTurn, playReplyAudio]);

  return {
    audioMuted,
    audioRef,
    busy:
      turnMutation.isPending ||
      speech.status === "processing" ||
      playbackState === "playing",
    cancelRecordingTurn,
    lastTurn,
    playbackState,
    playerError,
    playReplyAudio,
    replayLastTurn,
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
    ? "系统拦截了自动播报，点“重播上一句”即可播放。"
    : "浏览器拦截了自动播报，点“重播上一句”即可播放。";
}

function resolveVoicePlaybackFailedCopy() {
  return isNativeMobileRuntime()
    ? "语音已生成，但当前设备没有成功播放。可以点“重播上一句”再试。"
    : "语音已生成，但浏览器没有成功播放。可以点“重播上一句”再试。";
}
