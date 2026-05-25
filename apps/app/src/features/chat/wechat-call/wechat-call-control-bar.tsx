import type { ReactNode } from "react";
import { cn } from "@yinjie/ui";

// 微信通话底部控制条：等距排开的一排控制键。
type WeChatCallControlBarProps = {
  children: ReactNode;
  className?: string;
};

export function WeChatCallControlBar({
  children,
  className,
}: WeChatCallControlBarProps) {
  return (
    <div
      className={cn(
        "flex items-end justify-around gap-2 px-6 pb-2 pt-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
