import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@yinjie/ui";
import type { VoiceLoopPhase } from "../use-continuous-voice-loop";

// 头像周围的说话/聆听指示环：
// - listening：绿环随 inputLevel(0..1) 实时缩放，模拟微信"正在说话"音量包络
// - speaking：白色脉冲环（AI 在说）
// 放在头像容器内（容器需 relative），自身 absolute 扩到头像外缘。
//
// 走查新一轮 R1（perf 高）：原本通过 prop 接 `inputLevel: number`，VAD 每帧把
// level 节流到 ~16fps 后 setState 推到父组件——MobileAiCallScreen 是 1000+ 行
// 大组件，每秒被拖着重渲染 16 次，listening 阶段在低端 Android 持续掉帧。
// 改成接 `inputLevelRef: RefObject<number>`，组件自己挂 rAF 直接读 ref 写 DOM
// 风格 transform/opacity，父组件完全不因 level 变化重渲染。
type SpeakingIndicatorProps = {
  phase: VoiceLoopPhase;
  inputLevelRef: RefObject<number>;
  className?: string;
};

export function SpeakingIndicator({
  phase,
  inputLevelRef,
  className,
}: SpeakingIndicatorProps) {
  const listening = phase === "listening";
  const speaking = phase === "speaking";
  const ringRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!listening) {
      return;
    }
    const ring = ringRef.current;
    if (!ring) {
      return;
    }
    let rafId = 0;
    let lastScale = -1;
    let lastOpacity = -1;
    const tick = () => {
      const raw = inputLevelRef.current ?? 0;
      const level = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      const scale = 1 + level * 0.4;
      const opacity = 0.4 + level * 0.5;
      // 只在 quantized 变化时写 DOM，避免每帧无谓 style mutation 触发 layout/paint
      const qScale = Math.round(scale * 100);
      const qOpacity = Math.round(opacity * 100);
      if (qScale !== lastScale) {
        ring.style.transform = `scale(${scale.toFixed(3)})`;
        lastScale = qScale;
      }
      if (qOpacity !== lastOpacity) {
        ring.style.opacity = opacity.toFixed(3);
        lastOpacity = qOpacity;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [listening, inputLevelRef]);

  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -inset-2 rounded-full",
        className,
      )}
    >
      {listening ? (
        <span
          ref={ringRef}
          className="absolute inset-0 rounded-full border-2 border-[color:var(--brand-primary)] transition-transform duration-100 ease-out"
          style={{
            transform: "scale(1)",
            opacity: 0.4,
          }}
        />
      ) : null}
      {speaking ? (
        <>
          <span className="absolute inset-0 animate-ping rounded-full border-2 border-white/50" />
          <span className="absolute inset-0 rounded-full border border-white/30" />
        </>
      ) : null}
    </span>
  );
}
