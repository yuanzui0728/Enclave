import type { ReactNode } from "react";
import { cn } from "@yinjie/ui";

// 微信群通话头像网格：等距多列排布参与者格。
type WeChatGroupCallGridProps = {
  children: ReactNode;
  className?: string;
};

export function WeChatGroupCallGrid({
  children,
  className,
}: WeChatGroupCallGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
