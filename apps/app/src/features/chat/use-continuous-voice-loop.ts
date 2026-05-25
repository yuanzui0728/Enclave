import { useCallback, useEffect, useRef, useState } from "react";
import {
  useVoiceActivityDetection,
  type VadConfig,
} from "./use-voice-activity-detection";
import type { useSpeechInput } from "./use-speech-input";

// 微信式连续免提通话的「自动监听」协调器：把 VAD 检测器的说话起止事件接到
// 三套 session hook 已有的「停录即自动发 turn」流上，并管理整轮循环
// （起录 → 静音停录发送 → AI 回复 → 播完自动恢复监听）。麦克风静音、离屏、
// 权限失败、自动播放被拦等都在这里收口。

export type VoiceLoopPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

type InternalPhase =
  | "idle"
  | "armed" // 麦克风开、等说话起点
  | "capturing" // 检测到说话、录音中
  | "submitting" // 停录 → 生成 blob → turn 请求中
  | "speaking" // AI 回复播放中
  | "cooldown" // 播完短暂沉降，避开尾音/回声后再起录
  | "error";

const COOLDOWN_MS = 500;

type SpeechInputApi = ReturnType<typeof useSpeechInput>;

type UseContinuousVoiceLoopOptions = {
  enabled: boolean;
  speech: SpeechInputApi;
  playbackState: "idle" | "playing";
  isMutationPending: boolean;
  isMutationError: boolean;
  /**
   * playerError 不再让 loop 进 error phase（playback 失败不影响录音），仅 toast
   * 用。保留 prop 仅为向后兼容三套 session hook 调用点；未来可以删。
   * @deprecated 走查 R1 起 loop 不再消费此字段
   */
  playerError?: string | null;
  /** 屏幕正在离开（挂断/导航），停掉循环 */
  leaving?: boolean;
  /** 数字人视频：sessionState==="ready" 前不起录；语音/群默认 true */
  gateReady?: boolean;
  startRecordingTurn: () => Promise<void> | void;
  stopRecordingTurn: () => void;
  cancelRecordingTurn: () => void;
  config?: Partial<VadConfig>;
};

export function useContinuousVoiceLoop({
  enabled,
  speech,
  playbackState,
  isMutationPending,
  isMutationError,
  leaving = false,
  gateReady = true,
  startRecordingTurn,
  stopRecordingTurn,
  cancelRecordingTurn,
  config,
}: UseContinuousVoiceLoopOptions): {
  phase: VoiceLoopPhase;
  micMuted: boolean;
  setMicMuted: (next: boolean | ((prev: boolean) => boolean)) => void;
  inputLevel: number;
  vadSupported: boolean;
  primeAudioContext: () => Promise<void>;
} {
  const [internalPhase, setInternalPhaseState] = useState<InternalPhase>("idle");
  const phaseRef = useRef<InternalPhase>("idle");
  const setPhase = useCallback((next: InternalPhase) => {
    phaseRef.current = next;
    setInternalPhaseState(next);
  }, []);

  const [micMuted, setMicMuted] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  // 走查 R2：原本只有三套 session hook 自己挂 visibilitychange → speech.cancel +
  // stopReplyPlayback；reconcile 不知情，phase 仍卡在 armed/capturing（VAD
  // active=true 但 getMediaStream 一直返回 null）。用户切回前台后 visibility 事件
  // 不再 fire，reconcile 也没人推一下 → 麦克风永久死亡。把 hidden 当成 micMuted
  // 同级的硬中断推 phase=idle；切回前台 setIsHidden(false) → reconcile 走
  // case idle → arm() → speech.start() 重新拿流。
  const [isHidden, setIsHidden] = useState(() =>
    typeof document !== "undefined"
      ? document.visibilityState === "hidden"
      : false,
  );
  const cooldownTimerRef = useRef<number | null>(null);
  const lastLevelEmitRef = useRef(0);

  const speechStatus = speech.status;
  const speechError = Boolean(speech.error);
  // VAD 只在 armed/capturing 阶段分析；thinking/speaking 期间扬声器在响，
  // 关掉 analyser 才不会把 AI 自己的声音当成用户说话。
  const vadActive =
    internalPhase === "armed" || internalPhase === "capturing";

  const clearCooldown = useCallback(() => {
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  const handleLevel = useCallback((level: number) => {
    // 跳帧节流到 ~16fps，避免每帧 setState 触发 re-render 风暴
    const now = performance.now();
    if (now - lastLevelEmitRef.current < 60) {
      return;
    }
    lastLevelEmitRef.current = now;
    setInputLevel(level);
  }, []);

  const handleSpeechStart = useCallback(() => {
    if (phaseRef.current === "armed") {
      setPhase("capturing");
    }
  }, [setPhase]);

  const handleUtteranceEnd = useCallback(() => {
    if (phaseRef.current === "armed" || phaseRef.current === "capturing") {
      setPhase("submitting");
      stopRecordingTurn();
    }
  }, [setPhase, stopRecordingTurn]);

  const { inputLevelRef, supported: vadSupported, resumeContext } =
    useVoiceActivityDetection({
      getMediaStream: speech.getMediaStream,
      active: vadActive,
      onSpeechStart: handleSpeechStart,
      onSpeechEnd: handleUtteranceEnd,
      onMaxDuration: handleUtteranceEnd,
      onLevel: handleLevel,
      config,
    });
  void inputLevelRef; // 当前 UI 走节流 number；保留 ref 供需要零重渲染的消费者

  const primeAudioContext = useCallback(async () => {
    await resumeContext();
  }, [resumeContext]);

  const arm = useCallback(() => {
    void resumeContext();
    void startRecordingTurn();
    setPhase("armed");
  }, [resumeContext, setPhase, startRecordingTurn]);

  // 单一 reconcile：根据输入推进状态机
  useEffect(() => {
    const phase = phaseRef.current;

    // 1) 硬中断 → idle（静音 / 离屏 / 未启用 / 视频未就绪 / 切到后台）
    if (
      !enabled ||
      micMuted ||
      leaving ||
      isHidden ||
      !gateReady ||
      !vadSupported
    ) {
      if (phase !== "idle") {
        clearCooldown();
        cancelRecordingTurn();
        setInputLevel(0);
        setPhase("idle");
      }
      return;
    }

    // 2) 错误态：mutation 失败 / 语音录制错误 → error，不自动恢复
    // 走查 R1：playerError 原本也走这条 → loop 永久 stuck（autoplay 拦截 / 音频
    // 404 时用户没法继续说话）。但 playback 失败本质上只影响这一句听不听得到
    // ——不该绑死后续录音。toast 仍会挂"补播"按钮让用户主动重播，loop 该照常
    // 跑下一轮（用户接着说，下一轮 AI 回复的 'play' 事件会顺带 setPlayerError(null)
    // 自然恢复）。只有 mutation/speech 这两种 hard error 真的让流程进行不下去。
    if (isMutationError || speechError) {
      if (phase !== "error") {
        clearCooldown();
        cancelRecordingTurn();
        setInputLevel(0);
        setPhase("error");
      }
      return;
    }

    const recordingInFlight =
      speechStatus === "requesting-permission" ||
      speechStatus === "listening" ||
      speechStatus === "ready" ||
      speechStatus === "processing";

    switch (phase) {
      case "idle":
      case "error":
        // 条件具备就自动起录（进通话即监听）
        if (playbackState === "idle" && !isMutationPending) {
          arm();
        }
        break;
      case "submitting":
        // 等录音落地 + mutation 跑完再判定下一步
        if (isMutationPending || recordingInFlight) {
          break;
        }
        if (playbackState === "playing") {
          setPhase("speaking");
        } else {
          // 无音频回复 / 已结束 → 进沉降
          startCooldownToArm();
        }
        break;
      case "speaking":
        if (playbackState === "idle") {
          startCooldownToArm();
        }
        break;
      case "cooldown":
        // 群多角色逐条播报时 playbackState 可能瞬时落 idle 再回 playing，
        // 或单聊回复音频在公网慢链路上还在缓冲（'play' 事件未触发）。一旦
        // 播放/思考恢复就取消沉降回 speaking，避免在回复还没播完时提前起录。
        if (playbackState === "playing" || isMutationPending) {
          clearCooldown();
          setPhase("speaking");
        }
        break;
      case "armed":
      case "capturing":
      default:
        break;
    }

    function startCooldownToArm() {
      clearCooldown();
      setInputLevel(0);
      setPhase("cooldown");
      cooldownTimerRef.current = window.setTimeout(() => {
        cooldownTimerRef.current = null;
        // 沉降结束回 idle，由 reconcile 重新评估起录条件（幂等）
        if (phaseRef.current === "cooldown") {
          setPhase("idle");
        }
      }, COOLDOWN_MS);
    }
    // internalPhase 必须入 deps：reconcile 按 phaseRef.current 分支，phase 变化
    // （arm→armed、VAD→capturing、cooldown timer→idle 等）都要重跑这条 effect，
    // 否则只能靠 arm/cancelRecordingTurn 每帧换引用“顺带”重跑，太脆。
  }, [
    arm,
    cancelRecordingTurn,
    clearCooldown,
    enabled,
    gateReady,
    internalPhase,
    isHidden,
    isMutationError,
    isMutationPending,
    leaving,
    micMuted,
    playbackState,
    setPhase,
    speechError,
    speechStatus,
    vadSupported,
  ]);

  // 走查 R2：监听 visibility 把 hidden 推进 reconcile —— session hook 已经各自挂
  // 一份去 cancel speech / stopReplyPlayback，但那只处理音频/录音资源；loop 状态
  // 机自己不知道用户切走了，phase 会卡 armed。这里独立挂，setIsHidden 触发
  // 重新跑 reconcile（hidden=true → 硬中断 idle；visible=false → 走 case idle 重新 arm）。
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const handle = () => {
      setIsHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", handle);
    return () => {
      document.removeEventListener("visibilitychange", handle);
    };
  }, []);

  // 首次用户手势（点屏幕任意处）resume AudioContext —— iOS / Capacitor 起步
  // suspended，否则 AnalyserNode 读到全静音、VAD 永远检测不到说话。
  useEffect(() => {
    if (!enabled || !vadSupported || typeof window === "undefined") {
      return;
    }

    const handleGesture = () => {
      void resumeContext();
    };

    window.addEventListener("pointerdown", handleGesture, { once: true });
    window.addEventListener("touchend", handleGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("touchend", handleGesture);
    };
  }, [enabled, resumeContext, vadSupported]);

  useEffect(() => {
    return () => {
      clearCooldown();
    };
  }, [clearCooldown]);

  const phase: VoiceLoopPhase = (() => {
    switch (internalPhase) {
      case "armed":
      case "capturing":
        return "listening";
      case "submitting":
        return "thinking";
      case "speaking":
      case "cooldown":
        return "speaking";
      case "error":
        return "error";
      case "idle":
      default:
        return enabled && !gateReady ? "connecting" : "idle";
    }
  })();

  return {
    phase,
    micMuted,
    setMicMuted,
    inputLevel,
    vadSupported,
    primeAudioContext,
  };
}
