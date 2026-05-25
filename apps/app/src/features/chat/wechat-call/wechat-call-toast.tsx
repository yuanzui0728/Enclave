import type { ReactNode } from "react";
import { cn } from "@yinjie/ui";

// 微信通话的唯一可恢复错误提示：底部控制条上方一条极简浮层。
// 三屏同一时刻只渲染一个（按优先级取最高）。action 接现有恢复 handler。
type WeChatCallToastProps = {
  message: string;
  tone?: "info" | "danger";
  action?: ReactNode;
  className?: string;
};

export function WeChatCallToast({
  message,
  tone = "info",
  action,
  className,
}: WeChatCallToastProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-44 z-30 flex justify-center px-6",
        className,
      )}
    >
      <div className="pointer-events-auto flex max-w-[88%] items-center gap-3 rounded-2xl bg-black/72 px-4 py-2.5 text-[13px] leading-5 text-white shadow-lg backdrop-blur">
        <span className={tone === "danger" ? "text-[#ff8a8a]" : "text-white/90"}>
          {message}
        </span>
        {action}
      </div>
    </div>
  );
}

// toast 上的小动作按钮（重试/补播/去设置等），三屏共用。
export function WeChatCallToastAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[12px] font-medium text-white transition active:bg-white/25"
    >
      {label}
    </button>
  );
}
