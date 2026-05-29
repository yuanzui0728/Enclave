import type { ReactNode } from "react";
import { cn } from "@yinjie/ui";

type ChatDetailsSectionProps = {
  title?: ReactNode;
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
    <section className={cn(isWechat ? "px-0" : "px-3", className)}>
      {title ? (
        <div
          className={cn(
            "px-1 pb-2 text-[length:var(--text-caption)] tracking-[0.04em] text-[color:var(--text-dim)]",
            isWechat && "px-4 pb-1 text-[length:var(--text-eyebrow)] font-normal tracking-normal text-[color:var(--text-muted)]",
          )}
        >
          {title}
        </div>
      ) : null}
      <div
        className={cn(
          "overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]",
          isWechat &&
            "rounded-none border-x-0 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none",
        )}
      >
        {children}
      </div>
    </section>
  );
}
