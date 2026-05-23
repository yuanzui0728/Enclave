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
  // 把动态参数放进 ref：群通话里 participantCount 会随成员加入/离开变，
  // 直聊里 characterId 通话中一般不变，但 baseUrl 在 dev 切换 world 时偶发变。
  // 如果这些进了 hangup 的 useCallback deps，hangup 重建 → 上面 mount-time
  // useEffect deps 包含 hangup → 触发重新调度 → startedAtIsoRef.current 被
  // 重置成当前时间，通话已进行 5 分钟变成 0 分钟，call_log 显示"通话时长 02:00"
  // 而非真实的 07:00。改用 ref 拿到最新值，hangup 闭包稳定，useEffect 只在
  // enabled / timeoutMs 真变时跑。
  const dynamicArgsRef = useRef({
    thread,
    mode,
    baseUrl,
    scopeId,
    characterId,
    participantCount,
  });
  dynamicArgsRef.current = {
    thread,
    mode,
    baseUrl,
    scopeId,
    characterId,
    participantCount,
  };

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

      const args = dynamicArgsRef.current;
      const request: FinalizeCallRequest = {
        thread: args.thread,
        mode: args.mode,
        startedAtIso: startedAtIsoRef.current,
        endedReason: reason,
        ...(args.thread === "direct"
          ? { conversationId: args.scopeId }
          : { groupId: args.scopeId }),
        ...(args.characterId ? { characterId: args.characterId } : {}),
        ...(typeof args.participantCount === "number"
          ? { participantCount: args.participantCount }
          : {}),
      };

      try {
        if (args.thread === "direct") {
          await finalizeVoiceCall(request, args.baseUrl);
        } else {
          await finalizeGroupVoiceCall(request, args.baseUrl);
        }
      } catch {
        // finalize 失败也不让用户卡在通话页，call_log 写不进就算了
      }
      onSessionEndedRef.current?.(reason);
    },
    [clearTimer],
  );

  // 每次 enabled 切到 true 时重置 startedAt + finalizedRef + 启动 10min timer。
  // hangup 闭包已稳定（不依赖动态参数），所以这条 effect 不会因
  // participantCount 变化重跑。
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
