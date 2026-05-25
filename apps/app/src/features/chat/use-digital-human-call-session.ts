import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
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
import { translateRuntimeMessage } from "@yinjie/i18n";
import { isNativeMobileRuntime } from "../../runtime/native-runtime";
import { resolveAppMediaUrl } from "../../lib/media-url";
import { useContinuousVoiceLoop } from "./use-continuous-voice-loop";
import { useSpeechInput } from "./use-speech-input";

const t = translateRuntimeMessage;

type UseDigitalHumanCallSessionOptions = {
  baseUrl?: string;
  conversationId: string;
  characterId?: string;
  enabled: boolean;
  /** 屏幕正在离开（挂断/导航），停掉 VAD 连续监听 */
  leaving?: boolean;
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
  leaving = false,
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
    // 通话屏不显示"已录制 0:03"，跳过 4Hz setInterval；见 use-voice-call-session
    // 同款注释。
    trackElapsed: false,
  });

  speechCancelRef.current = speech.cancel;
  speechClearResultRef.current = speech.clearResult;
  // 走查 R2：和 use-voice-call-session 同款防残音，挂断后慢链路 mutation 仍可能
  // resolve，onSuccess 跑会让数字人在 leave 屏的过程中说半句话。
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;

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

  const playReplyAudio = useCallback(async (audioUrl: string | null) => {
    if (!audioUrl) {
      setPlaybackState("idle");
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    // 后端语音附件现在返回相对 URL（/api/chat/attachments/...），公网入口需要走
    // /cloud/world-api 反代并附 cloud token；这里统一过 resolveAppMediaUrl 处理。
    audio.src = resolveAppMediaUrl(audioUrl);
    audio.currentTime = 0;
    setPlayerError(null);

    try {
      await audio.play();
    } catch (error) {
      // 走查 R4：和 use-voice-call-session 同款，按 AbortError 类型同步判定，
      // 不靠 leavingRef（渲染前更新不到，仍会误显「继续」toast）。
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }
      setPlaybackState("idle");
      setPlayerError(resolveAutoplayBlockedCopy());
    }
  }, []);

  const turnMutation = useMutation({
    mutationFn: async () => {
      if (!sessionRef.current) {
        throw new Error(t(msg`通话尚未建立，请稍后再试`));
      }

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

      return createDigitalHumanTurn(sessionRef.current.id, formData, baseUrl);
    },
    onSuccess: async (result) => {
      if (leavingRef.current) {
        return;
      }
      setSession(result.session);
      setLastTurn(result.turn);
      setSessionState("ready");
      setSessionError(null);
      speechClearResultRef.current();
      // 乐观置 playing：见 use-voice-call-session onSuccess 注释——避免回复音频
      // 缓冲窗口内 VAD 误判一轮结束、提前起录把数字人语音录进去。
      if (result.turn.assistantAudioUrl) {
        setPlaybackState("playing");
      }
      // 走查 R1（perf）：和 use-voice-call-session 同款 fire-and-forget invalidate；
      // 数字人通话嘴型对齐对延迟更敏感，少 600ms 公网 RTT 让 lipsync 准 60ms 一帧。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversation-messages", baseUrl, conversationId],
      });
      void Promise.resolve(onTurnSuccess?.(result)).catch(() => undefined);
      await playReplyAudio(result.turn.assistantAudioUrl);
    },
    onError: (error) => {
      setSessionState("error");
      setSessionError(
        error instanceof Error
          ? error.message
          : t(msg`通话失败，请稍后再试`),
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

  // 走查新一轮 R7（perf）：见 use-voice-call-session 同款注释——拆 mutate 稳定
  // 身份 + isPending boolean 进 deps，effect 不再每 render 重跑只为早返。
  const turnMutate = turnMutation.mutate;
  const turnIsPending = turnMutation.isPending;
  useEffect(() => {
    if (!speech.recordedAudio || speech.status !== "ready") {
      return;
    }

    if (!autoSubmitRecordingRef.current || turnIsPending) {
      return;
    }

    autoSubmitRecordingRef.current = false;
    // 用 mutate() 而不是 mutateAsync()——这里不 await 结果，错误已经在
    // turnMutation onError (line 147) 里设了 sessionState/sessionError，
    // 消费者通过 mutation.error / sessionError 读；mutateAsync() 的 promise
    // 在 mutationFn 抛错时会 reject，`void` 不接 → 落 window.unhandledrejection
    // 污染 telemetry。
    turnMutate();
  }, [speech.recordedAudio, speech.status, turnIsPending, turnMutate]);

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
            : t(msg`连接失败，请稍后再试`),
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

  // 走查新一轮 R6（perf）：原版 deps 把整个 session?.status 串进去，每条 SSE
  // event 把 status 从 queued → rendering → ready 推一遍都会触发 effect 重跑：
  // cleanup 关 ES → 新 effect 重开 ES → server 又推一次初始 event → setSession
  // 又跑一遍 status 更新。一条 session 启动到 ready 的过程 ES 被 close/reopen
  // 2-3 次，每次都是新的长连 HTTP，公网隧道下浪费明显（且短时高频建连容易
  // 撞 provider 端 rate limit）。
  // 真正需要终止 ES 的只有 status === "ended"，提取成 boolean 进 deps，其他
  // status 字段更新走 onmessage 自己 setSession 而不触发 effect 重跑。
  const sessionId = session?.id;
  const sessionEnded = session?.status === "ended";
  useEffect(() => {
    if (!enabled || !sessionId || sessionEnded) {
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
        buildDigitalHumanSessionEventsUrl(sessionId, baseUrl),
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
  }, [baseUrl, enabled, sessionId, sessionEnded]);

  const retrySession = useCallback(() => {
    autoSubmitRecordingRef.current = false;
    stopReplyPlayback();
    speechCancelRef.current();

    // 走查新一轮 R2：原版直接 setSession(null) 后 setSessionAttempt(++)，预期
    // setup effect cleanup 能把上一段 session 关掉——但 sessionRef.current 是由
    // 另一条 [session] 同步 effect 维护的，React 按声明顺序跑 effects，sessionRef
    // 同步先把 ref 改成 null，setup cleanup 再去读 ref 已经是 null，直接 skip
    // 不发 closeDigitalHumanSession。结果：用户在 turn 失败后点"重新连接"，老
    // session 在服务端永远挂着到自然超时。本帧抢先按当前 ref 同步发一份
    // best-effort close（不 await，失败吞掉，不影响下一段重连）。
    const previousSession = sessionRef.current;
    if (previousSession && previousSession.status !== "ended") {
      void closeDigitalHumanSession(previousSession.id, baseUrl).catch(
        () => undefined,
      );
    }

    setSession(null);
    setSessionError(null);
    setSessionState("connecting");
    setSessionAttempt((current) => current + 1);
  }, [baseUrl, stopReplyPlayback]);

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

  // 微信式连续免提通话：数字人 session ready 后才起录（gateReady）
  const voiceLoop = useContinuousVoiceLoop({
    enabled,
    speech,
    playbackState,
    isMutationPending: turnMutation.isPending,
    isMutationError: turnMutation.isError,
    playerError,
    leaving,
    gateReady: sessionState === "ready",
    startRecordingTurn,
    stopRecordingTurn,
    cancelRecordingTurn,
  });

  return {
    audioMuted,
    audioRef,
    voiceLoop,
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
    ? t(msg`系统拦截了自动播报，点“重播上一句”即可播放。`)
    : t(msg`浏览器拦截了自动播报，点“重播上一句”即可播放。`);
}

function resolveDigitalHumanPlaybackFailedCopy() {
  return isNativeMobileRuntime()
    ? t(msg`语音已生成但当前设备没有播放，可点"重播上一句"再试`)
    : t(msg`语音已生成但浏览器没有播放，可点"重播上一句"再试`);
}
