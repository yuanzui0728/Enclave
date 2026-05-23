import { useCallback, useEffect, useRef } from "react";
import {
  finalizeGroupVoiceCall,
  finalizeVoiceCall,
  type CallFinalizeEndedReason,
  type FinalizeCallRequest,
} from "@yinjie/contracts";

const TEN_MINUTES_MS = 10 * 60 * 1000;

type UseCallFinalizeOptions = {
  thread: "direct" | "group";
  mode: "voice" | "video";
  baseUrl?: string;
  scopeId: string;
  characterId?: string;
  participantCount?: number;
  enabled: boolean;
  timeoutMs?: number;
  onSessionEnded?: (reason: CallFinalizeEndedReason) => void;
};

export type CallFinalizeHandle = {
  startedAtIsoRef: { readonly current: string };
  hangup: (reason?: CallFinalizeEndedReason) => Promise<void>;
};

/**
 * 通话生命周期收尾：管理超时定时器 + 主动挂断 + 写入 call_log 消息。
 *
 * - mount 时打 startedAt 时间戳；schedule 一个 10min fallback timer
 *   防止用户忘了挂导致一直占麦
 * - hangup() 任何时刻可调，去重保护：第一次调用真正发起 finalize HTTP，
 *   后续调用直接 no-op（避免 cleanup + 用户点击挂断重复写两条 call_log）
 * - 复用给单聊 / 群聊两套 voice-call hook
 */
export function useCallFinalize({
  thread,
  mode,
  baseUrl,
  scopeId,
  characterId,
  participantCount,
  enabled,
  timeoutMs = TEN_MINUTES_MS,
  onSessionEnded,
}: UseCallFinalizeOptions): CallFinalizeHandle {
  const startedAtIsoRef = useRef<string>(new Date().toISOString());
  const finalizedRef = useRef(false);
  const timeoutHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  const clearTimer = useCallback(() => {
    if (timeoutHandleRef.current !== null) {
      clearTimeout(timeoutHandleRef.current);
      timeoutHandleRef.current = null;
    }
  }, []);

  const hangup = useCallback(
    async (reason: CallFinalizeEndedReason = "user_hangup") => {
      if (finalizedRef.current) {
        return;
      }
      finalizedRef.current = true;
      clearTimer();

      const request: FinalizeCallRequest = {
        thread,
        mode,
        startedAtIso: startedAtIsoRef.current,
        endedReason: reason,
        ...(thread === "direct"
          ? { conversationId: scopeId }
          : { groupId: scopeId }),
        ...(characterId ? { characterId } : {}),
        ...(typeof participantCount === "number" ? { participantCount } : {}),
      };

      try {
        if (thread === "direct") {
          await finalizeVoiceCall(request, baseUrl);
        } else {
          await finalizeGroupVoiceCall(request, baseUrl);
        }
      } catch {
        // finalize 失败也不让用户卡在通话页，call_log 写不进就算了
      }
      onSessionEndedRef.current?.(reason);
    },
    [thread, mode, baseUrl, scopeId, characterId, participantCount, clearTimer],
  );

  // 每次 enabled 切到 true 时重置 startedAt + finalizedRef + 启动 10min timer
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }
    startedAtIsoRef.current = new Date().toISOString();
    finalizedRef.current = false;
    timeoutHandleRef.current = setTimeout(() => {
      void hangup("timeout");
    }, timeoutMs);
    return () => {
      clearTimer();
    };
  }, [enabled, hangup, timeoutMs, clearTimer]);

  return { startedAtIsoRef, hangup };
}
