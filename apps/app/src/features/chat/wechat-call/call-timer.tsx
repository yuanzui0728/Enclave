import { useEffect, useState } from "react";
import { cn } from "@yinjie/ui";

// 微信通话计时器：连接前显示 waitingLabel，接通后显示 mm:ss（超 1h 走 hh:mm:ss）。
type CallTimerProps = {
  startedAtMs: number | null;
  running: boolean;
  waitingLabel: string;
  className?: string;
};

export function CallTimer({
  startedAtMs,
  running,
  waitingLabel,
  className,
}: CallTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || startedAtMs == null) {
      return;
    }
    // running 翻 true 当帧立即对齐，避免首秒停在旧 now
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [running, startedAtMs]);

  const text =
    running && startedAtMs != null
      ? formatElapsed(Math.max(0, now - startedAtMs))
      : waitingLabel;

  return (
    <div className={cn("text-[15px] tabular-nums text-white/75", className)}>
      {text}
    </div>
  );
}

function formatElapsed(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}
