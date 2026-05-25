import { useCallback, useEffect, useRef, type RefObject } from "react";

// 纯 Web Audio RMS 静音检测器：复用 useSpeechInput 已经开好的 MediaStream 挂
// AnalyserNode，按帧算音量包络，检测「说话起点 / 说话结束（静音 hangover）/
// 超长截断」并通过回调通知。不碰 MediaRecorder、不二次 getUserMedia，也不负责
// 上层状态机——那是 use-continuous-voice-loop 的事。

export type VadConfig = {
  /** RMS 高于此值视为有声（起点判定） */
  onsetThreshold: number;
  /** 滞回阈值：进入说话态后，低于此值才开始计静音 */
  releaseThreshold: number;
  /** 连续多少帧高于 onsetThreshold 才确认说话起点（滤瞬时杂音） */
  onsetFrames: number;
  /** 说话后持续静音多少毫秒判定一句结束 */
  silenceHangoverMs: number;
  /** 一句最短时长，低于此值的杂音/误触不当作有效语音发送 */
  minUtteranceMs: number;
  /** 一句最长时长，到顶强制截断发送 */
  maxUtteranceMs: number;
};

export const DEFAULT_VAD_CONFIG: VadConfig = {
  onsetThreshold: 0.04,
  releaseThreshold: 0.025,
  onsetFrames: 3,
  silenceHangoverMs: 1400,
  minUtteranceMs: 350,
  maxUtteranceMs: 30000,
};

type UseVoiceActivityDetectionOptions = {
  getMediaStream: () => MediaStream | null;
  /** 仅当 true 时跑 analyser + rAF（loop 在 armed/capturing 阶段才置 true） */
  active: boolean;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onMaxDuration?: () => void;
  onLevel?: (level: number) => void;
  config?: Partial<VadConfig>;
};

type WebAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function getAudioContextConstructor() {
  if (typeof window === "undefined") {
    return null;
  }
  const audioWindow = window as WebAudioWindow;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function normalizeLevel(rms: number) {
  const noiseFloor = 0.01;
  const ceiling = 0.18;
  const norm = (rms - noiseFloor) / (ceiling - noiseFloor);
  const clamped = Math.max(0, Math.min(1, norm));
  // 感知曲线：低音量也能看出轻微摆动
  return clamped ** 0.7;
}

export function useVoiceActivityDetection({
  getMediaStream,
  active,
  onSpeechStart,
  onSpeechEnd,
  onMaxDuration,
  onLevel,
  config,
}: UseVoiceActivityDetectionOptions): {
  inputLevelRef: RefObject<number>;
  supported: boolean;
  resumeContext: () => Promise<void>;
} {
  const audioContextConstructor = getAudioContextConstructor();
  const supported = Boolean(audioContextConstructor);

  const inputLevelRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  // 回调 / 配置走 ref，避免引用变化重启 analyser 或在 tick 里拿到旧闭包。
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onMaxDurationRef = useRef(onMaxDuration);
  const onLevelRef = useRef(onLevel);
  const configRef = useRef<VadConfig>({ ...DEFAULT_VAD_CONFIG, ...config });
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;
  onMaxDurationRef.current = onMaxDuration;
  onLevelRef.current = onLevel;
  configRef.current = { ...DEFAULT_VAD_CONFIG, ...config };

  const ensureAudioContext = useCallback(() => {
    if (!audioContextConstructor) {
      return null;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new audioContextConstructor();
    }
    return audioContextRef.current;
  }, [audioContextConstructor]);

  // 用户手势路径调用：先确保 context 存在再 resume（iOS / Capacitor 起步 suspended）。
  const resumeContext = useCallback(async () => {
    const ctx = ensureAudioContext();
    if (!ctx) {
      return;
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // resume 失败（无手势）保持 suspended，下次手势再试
      }
    }
  }, [ensureAudioContext]);

  useEffect(() => {
    if (!active || !supported) {
      return;
    }

    let disposed = false;
    let rafId: number | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    // 显式从 ArrayBuffer 构造，固定为 Uint8Array<ArrayBuffer>，匹配
    // getByteTimeDomainData 的入参类型（新版 lib.dom 收紧了泛型）
    let dataArray: Uint8Array<ArrayBuffer> | null = null;
    let smoothedLevel = 0;

    // 单次说话的检测状态
    let onsetCounter = 0;
    let speechActive = false;
    let utteranceStartedAt = 0;
    let lastAboveReleaseAt = 0;

    const finishDetection = () => {
      onsetCounter = 0;
      speechActive = false;
      utteranceStartedAt = 0;
      lastAboveReleaseAt = 0;
    };

    const tick = () => {
      if (disposed || !analyser || !dataArray) {
        return;
      }

      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let index = 0; index < dataArray.length; index += 1) {
        const sample = (dataArray[index] - 128) / 128;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);

      const level = normalizeLevel(rms);
      smoothedLevel = smoothedLevel * 0.6 + level * 0.4;
      inputLevelRef.current = smoothedLevel;
      onLevelRef.current?.(smoothedLevel);

      const cfg = configRef.current;
      const now = performance.now();

      if (!speechActive) {
        if (rms >= cfg.onsetThreshold) {
          onsetCounter += 1;
          if (onsetCounter >= cfg.onsetFrames) {
            speechActive = true;
            utteranceStartedAt = now;
            lastAboveReleaseAt = now;
            onSpeechStartRef.current?.();
          }
        } else {
          onsetCounter = 0;
        }
      } else {
        if (rms >= cfg.releaseThreshold) {
          lastAboveReleaseAt = now;
        }

        const spokenMs = now - utteranceStartedAt;
        const silentMs = now - lastAboveReleaseAt;

        if (spokenMs >= cfg.maxUtteranceMs) {
          finishDetection();
          onMaxDurationRef.current?.();
        } else if (
          spokenMs >= cfg.minUtteranceMs &&
          silentMs >= cfg.silenceHangoverMs
        ) {
          finishDetection();
          onSpeechEndRef.current?.();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    const setup = () => {
      if (disposed) {
        return;
      }

      const stream = getMediaStream();
      if (!stream) {
        // 流还没就绪（MediaRecorder.onstart 之前），下一帧再试
        rafId = requestAnimationFrame(setup);
        return;
      }

      const ctx = ensureAudioContext();
      if (!ctx) {
        return;
      }
      void ctx.resume().catch(() => undefined);

      try {
        sourceNode = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        // 只连 analyser，不接 destination，避免麦克风回灌扬声器啸叫
        sourceNode.connect(analyser);
        dataArray = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      } catch {
        return;
      }

      finishDetection();
      tick();
    };

    setup();

    return () => {
      disposed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch {
          // ignore
        }
      }
      if (analyser) {
        try {
          analyser.disconnect();
        } catch {
          // ignore
        }
      }
      inputLevelRef.current = 0;
      onLevelRef.current?.(0);

      // transient 失活只 suspend，保留 context 实例省去 iOS 重新手势授权成本
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === "running") {
        void ctx.suspend().catch(() => undefined);
      }
    };
  }, [active, supported, getMediaStream, ensureAudioContext]);

  // 卸载才真正 close（释放底层音频资源）
  useEffect(() => {
    return () => {
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => undefined);
      }
    };
  }, []);

  return { inputLevelRef, supported, resumeContext };
}
