import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LEGACY_API_PREFIX,
  closeDigitalHumanSession,
  createDigitalHumanSession,
  createDigitalHumanTurn,
  getDigitalHumanSession,
  type DigitalHumanCallMode,
  type DigitalHumanSession,
  type DigitalHumanTurnResult,
  type VoiceCallTurnResult,
  resolveCoreApiBaseUrl,
} from "@yinjie/contracts";
import { isNativeMobileRuntime } from "../../runtime/native-runtime";
import { useSpeechInput } from "./use-speech-input";

type UseDigitalHumanCallSessionOptions = {
  baseUrl?: string;
  conversationId: string;
  characterId?: string;
  enabled: boolean;
  mode?: DigitalHumanCallMode;
  onTurnSuccess?: (result: DigitalHumanTurnResult) => void | Promise<void>;
};

type DigitalHumanSessionState =
  | "idle"
  | "connecting"
  | "ready"
  | "error"
  | "closing";

export function useDigitalHumanCallSession({
  baseUrl,
  conversationId,
  characterId,
  enabled,
  mode = "desktop_video_call",
  onTurnSuccess,
}: UseDigitalHumanCallSessionOptions) {
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoSubmitRecordingRef = useRef(false);
  const speechCancelRef = useRef<() => void>(() => {});
  const speechClearResultRef = useRef<() => void>(() => {});
  const sessionRef = useRef<DigitalHumanSession | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [session, setSession] = useState<DigitalHumanSession | null>(null);
  const [sessionState, setSessionState] =
    useState<DigitalHumanSessionState>("idle");
  const [sessionError, setSessionError] = useState<string | null>(null);
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

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
      if (!sessionRef.current) {
        throw new Error("数字人通话尚未建立，请稍后再试。");
      }

      if (!speech.recordedAudio) {
        throw new Error("请先录一段语音再试。");
      }

      const formData = new FormData();
      formData.append(
        "file",
        speech.recordedAudio.blob,
        speech.recordedAudio.fileName,
      );
      formData.append("durationMs", String(speech.recordedAudio.durationMs));

      return createDigitalHumanTurn(sessionRef.current.id, formData, baseUrl);
    },
    onSuccess: async (result) => {
      setSession(result.session);
      setLastTurn(result.turn);
      setSessionState("ready");
      setSessionError(null);
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
      await playReplyAudio(result.turn.assistantAudioUrl);
    },
    onError: (error) => {
      setSessionState("error");
      setSessionError(
        error instanceof Error ? error.message : "数字人通话失败，请稍后再试。",
      );
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
      setPlayerError(resolveDigitalHumanPlaybackFailedCopy());
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

  const endSession = useCallback(async () => {
    autoSubmitRecordingRef.current = false;
    stopReplyPlayback();
    speechCancelRef.current();

    const activeSession = sessionRef.current;
    if (!activeSession || activeSession.status === "ended") {
      setSessionState("idle");
      return;
    }

    try {
      setSessionState("closing");
      const nextSession = await closeDigitalHumanSession(
        activeSession.id,
        baseUrl,
      );
      setSession(nextSession);
    } catch {
      // Closing is best-effort; the user should still be able to leave the page.
    } finally {
      setSessionState("idle");
    }
  }, [baseUrl, stopReplyPlayback]);

  useEffect(() => {
    autoSubmitRecordingRef.current = false;
    setLastTurn(null);
    setPlayerError(null);
    setAudioMuted(false);
    stopReplyPlayback();
    speechCancelRef.current();
    setSession(null);
    setSessionError(null);

    if (!enabled || !conversationId || !characterId) {
      setSessionState("idle");
      return;
    }

    let disposed = false;
    setSessionState("connecting");

    void (async () => {
      try {
        const nextSession = await createDigitalHumanSession(
          {
            conversationId,
            characterId,
            mode,
          },
          baseUrl,
        );

        if (disposed) {
          await closeDigitalHumanSession(nextSession.id, baseUrl).catch(() => {});
          return;
        }

        setSession(nextSession);
        setSessionError(null);
        setSessionState("ready");
      } catch (error) {
        if (disposed) {
          return;
        }

        setSessionState("error");
        setSessionError(
          error instanceof Error
            ? error.message
            : "连接数字人失败，请稍后再试。",
        );
      }
    })();

    return () => {
      disposed = true;
      autoSubmitRecordingRef.current = false;
      stopReplyPlayback();
      speechCancelRef.current();

      const activeSession = sessionRef.current;
      if (activeSession && activeSession.status !== "ended") {
        void closeDigitalHumanSession(activeSession.id, baseUrl).catch(() => {});
      }
    };
  }, [
    baseUrl,
    characterId,
    conversationId,
    enabled,
    mode,
    sessionAttempt,
    stopReplyPlayback,
  ]);

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

  useEffect(() => {
    if (!enabled || !session?.id || session.status === "ended") {
      return;
    }

    let disposed = false;
    let eventSource: EventSource | null = null;
    let intervalId: number | null = null;

    const stopPolling = () => {
      if (intervalId === null) {
        return;
      }

      window.clearInterval(intervalId);
      intervalId = null;
    };

    const stopEventStream = () => {
      if (!eventSource) {
        return;
      }

      eventSource.close();
      eventSource = null;
    };

    const syncSession = async () => {
      const activeSession = sessionRef.current;
      if (!activeSession || activeSession.status === "ended") {
        stopPolling();
        stopEventStream();
        return;
      }

      try {
        const nextSession = await getDigitalHumanSession(activeSession.id, baseUrl);

        if (disposed) {
          return;
        }

        setSession(nextSession);
        if (nextSession.status === "ended") {
          stopPolling();
          stopEventStream();
        }
      } catch {
        // Polling is best-effort. Keep the last snapshot and let manual retry recover.
      }
    };

    const startPolling = () => {
      if (intervalId !== null) {
        return;
      }

      void syncSession();
      intervalId = window.setInterval(() => {
        void syncSession();
      }, 3000);
    };

    if (typeof EventSource === "function") {
      eventSource = new EventSource(
        buildDigitalHumanSessionEventsUrl(session.id, baseUrl),
      );
      eventSource.onmessage = (event) => {
        try {
          const nextSession = JSON.parse(event.data) as DigitalHumanSession;
          if (disposed) {
            return;
          }

          setSession(nextSession);
          stopPolling();
          if (nextSession.status === "ended") {
            stopEventStream();
          }
        } catch {
          startPolling();
        }
      };
      eventSource.onerror = () => {
        stopEventStream();
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      disposed = true;
      stopEventStream();
      stopPolling();
    };
  }, [baseUrl, enabled, session?.id, session?.status]);

  const retrySession = useCallback(() => {
    autoSubmitRecordingRef.current = false;
    stopReplyPlayback();
    speechCancelRef.current();
    setSession(null);
    setSessionError(null);
    setSessionState("connecting");
    setSessionAttempt((current) => current + 1);
  }, [stopReplyPlayback]);

  const startRecordingTurn = useCallback(async () => {
    if (!enabled || sessionState !== "ready" || !sessionRef.current) {
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
    setSessionError(null);
    if (speech.status !== "idle") {
      speech.cancel();
    }

    await speech.start();
  }, [enabled, playbackState, sessionState, speech, turnMutation.isPending]);

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
      sessionState === "connecting" ||
      sessionState === "closing" ||
      turnMutation.isPending ||
      speech.status === "processing" ||
      playbackState === "playing",
    cancelRecordingTurn,
    closeSession: endSession,
    endSession,
    lastTurn,
    playbackState,
    playerError,
    replayLastTurn,
    retrySession,
    session,
    sessionError,
    sessionPhase:
      sessionState === "connecting"
        ? "creating"
        : sessionState === "closing"
          ? "closed"
          : sessionState,
    sessionState,
    setAudioMuted,
    speech,
    startRecordingTurn,
    stopRecordingTurn,
    stopReplyPlayback,
    turnMutation,
  };
}

function buildDigitalHumanSessionEventsUrl(sessionId: string, baseUrl?: string) {
  return `${resolveCoreApiBaseUrl(baseUrl)}${LEGACY_API_PREFIX}/chat/digital-human-calls/sessions/${sessionId}/events`;
}

function resolveAutoplayBlockedCopy() {
  return isNativeMobileRuntime()
    ? "系统拦截了自动播报，点“重播上一句”即可播放。"
    : "浏览器拦截了自动播报，点“重播上一句”即可播放。";
}

function resolveDigitalHumanPlaybackFailedCopy() {
  return isNativeMobileRuntime()
    ? "数字人语音已生成，但当前设备没有成功播放。可以点“重播上一句”再试。"
    : "数字人语音已生成，但浏览器没有成功播放。可以点“重播上一句”再试。";
}
