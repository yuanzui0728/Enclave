import { cn } from "@yinjie/ui";
import type { VoiceLoopPhase } from "../use-continuous-voice-loop";

// 头像周围的说话/聆听指示环：
// - listening：绿环随 inputLevel(0..1) 实时缩放，模拟微信"正在说话"音量包络
// - speaking：白色脉冲环（AI 在说）
// 放在头像容器内（容器需 relative），自身 absolute 扩到头像外缘。
type SpeakingIndicatorProps = {
  phase: VoiceLoopPhase;
  inputLevel: number;
  className?: string;
};

export function SpeakingIndicator({
  phase,
  inputLevel,
  className,
}: SpeakingIndicatorProps) {
  const listening = phase === "listening";
  const speaking = phase === "speaking";
  const level = Math.max(0, Math.min(1, inputLevel));

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
          className="absolute inset-0 rounded-full border-2 border-[#07c160] transition-transform duration-100 ease-out"
          style={{
            transform: `scale(${1 + level * 0.4})`,
            opacity: 0.4 + level * 0.5,
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
