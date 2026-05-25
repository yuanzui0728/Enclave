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
  // 走查新一轮 R4：浏览器后退按钮 / iOS 边缘 swipe back / 手机厂商手势 back
  // 直接走 history.back，绕开 handleBack 兜底链路（Android hardware back 已经被
  // registerAndroidBackInterceptor 抓住），最后只跑 React unmount。原版 unmount
  // 只 clearTimer，**根本不调 hangup**，导致这条退出路径上 call_log 不写、后端
  // finalize HTTP 不发，群/单聊状态卡片永远停在"通话中..."。这条 callActiveRef
  // 记录"call 是否真正进行过"（enabled effect 跑过一次就 true），unmount 兜底
  // 只在 active && !finalized 时补一发 hangup —— 已经走过 handleBack /
  // timeout 路径的 finalizedRef=true 让兜底 no-op。
  const callActiveRef = useRef(false);
  // 走查新一轮 R8：R4 unmount 兜底在 React.StrictMode dev 下被合成 unmount/
  // re-mount cycle 触发——synthetic unmount cleanup 直接发 hangup → 写一条
  // 假 call_log "通话时长 00:00"。dev 调试每打开一次通话都污染一条脏 log。
  // 改成 setTimeout(0) 延迟兜底：strict mode 的合成 re-mount 同步发生，
  // re-mount 的 effect setup 在 tick 结束前会先清掉 pending tail；真正的
  // unmount 后没有 re-mount，tick 结束 timeout 才 fire，hangup 正常发。
  const pendingTailRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      // 走查新一轮 R9：capture callActiveRef BEFORE 翻 false。R4 的 unmount setTimeout
      // 兜底已经用 `callActiveRef.current && !finalizedRef.current` 守住"silent exit"
      // 路径（浏览器/iOS swipe back），但**明面** handleBack → voiceCall.hangup 漏了
      // 这层守。失败路径——conversationsQuery 出 error / 非 direct conversation /
      // 找不到 conversation——MobileAiCallScreen 上方早返渲染收口卡片，conversation 永
      // 远不进 type==="direct" 分支，useVoiceCallSession.enabled 全程为 false →
      // useCallFinalize enabled 也是 false → 主 enabled effect 没跑 → callActiveRef
      // 始终是 false（call 从未"激活"）。用户点收口卡片上的"返回聊天" → handleBack →
      // voiceCall.hangup → callFinalize.hangup 仍把一条 0 秒 finalizeVoiceCall HTTP
      // 写进后端，结果用户单聊/群聊里就冒一条 "[语音通话] 通话时长 00:00" 脏 call_log
      // 卡片。短路：从未激活就不发 HTTP，只 mark finalized 防后续重入。
      const wasActive = callActiveRef.current;
      finalizedRef.current = true;
      // 兜底 unmount cleanup（下方独立 effect）靠 callActiveRef && !finalizedRef
      // 判断是否补发 hangup。任何"明面"出口（handleBack / timer timeout）走到这里
      // 都标 false，避免 navigate → unmount → cleanup 再补一次写出"重复 call_log"。
      callActiveRef.current = false;
      clearTimer();

      if (!wasActive) {
        return;
      }

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
    // 标记"call 真正进入活跃状态"——下方 unmount-only effect 用它判断是否要补
    // 发 hangup 兜底（浏览器/iOS swipe back 等绕过 handleBack 的退出路径）。
    callActiveRef.current = true;
    timeoutHandleRef.current = setTimeout(() => {
      void hangup("timeout");
    }, timeoutMs);
    return () => {
      clearTimer();
    };
  }, [enabled, hangup, timeoutMs, clearTimer]);

  // 走查新一轮 R4：unmount-only 兜底。原版 useCallFinalize 只在 handleBack /
  // Android hardware back interceptor / 10min timeout 三条入口写 call_log，
  // **浏览器后退 / iOS 边缘 swipe / 厂商手势 back** 直接 history.back → 组件
  // unmount，handleBack 根本没机会跑，call_log 永远不写、后端 finalize HTTP
  // 不发，群/单聊状态卡片永远停在"通话中..."误导对方。
  // 这里挂一条 deps=[hangup] 的 cleanup（hangup 是 useCallback([clearTimer])
  // 稳定身份 → effect 只在 unmount 跑 cleanup），unmount 时若 call 实际进入过
  // 活跃状态（callActiveRef）且尚未 finalized（finalizedRef），补发一份
  // user_hangup —— 明面出口已经把 finalizedRef 翻 true，这里 no-op；纯 silent
  // exit 才真发。reason 用 user_hangup 比 timeout/error 更贴近用户意图（人主动
  // 离开页面），契约里也没有 navigation/exit 这种第四种 reason。
  //
  // 走查 R8：原版 cleanup 内同步 fire hangup，被 React.StrictMode dev 的合成
  // unmount/re-mount cycle 抓住——每次打开通话页都先写一条假 call_log "通话时长
  // 00:00"。改成 setTimeout(0) 延迟，setup 在 strict mode 的 re-mount tick 内
  // 抢先 cancel 掉 pending tail；真 unmount 没 re-mount → tick 结束 timeout
  // 才 fire 真正的 hangup。同模式可参考 mobile-feed-publish-page L86 那条
  // isMountedRef 注释（同样在治 strict mode 双跑）。
  useEffect(() => {
    if (pendingTailRef.current !== null) {
      clearTimeout(pendingTailRef.current);
      pendingTailRef.current = null;
    }
    return () => {
      pendingTailRef.current = setTimeout(() => {
        pendingTailRef.current = null;
        if (callActiveRef.current && !finalizedRef.current) {
          void hangup("user_hangup");
        }
      }, 0);
    };
  }, [hangup]);

  return { startedAtIsoRef, hangup };
}
