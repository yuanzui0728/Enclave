import type { ReactNode } from "react";
import { cn } from "@yinjie/ui";

type ChatDetailsSectionProps = {
  title?: string;
  children: ReactNode;
  className?: string;
  variant?: "default" | "wechat";
};

export function ChatDetailsSection({
  title,
  children,
  className,
  variant = "wechat",
}: ChatDetailsSectionProps) {
  const isWechat = variant === "wechat";

  return (
    <section className={cn("px-3", className)}>
      {title ? (
        <div
          className={cn(
            "px-1 pb-2 text-[12px] tracking-[0.04em] text-[color:var(--text-dim)]",
            isWechat && "text-[13px] font-normal tracking-normal text-[#8c8c8c]",
          )}
        >
          {title}
        </div>
      ) : null}
      <div
        className={cn(
          "overflow-hidden rounded-[12px] border border-black/6 bg-white",
          isWechat && "rounded-[12px] border-black/5 shadow-none",
        )}
      >
        {children}
      </div>
    </section>
  );
}
