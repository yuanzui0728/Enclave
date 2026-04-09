import type { ReactNode } from "react";
import { cn } from "@yinjie/ui";

type ChatDetailsSectionProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function ChatDetailsSection({
  title,
  children,
  className,
}: ChatDetailsSectionProps) {
  return (
    <section className={cn("px-3", className)}>
      {title ? (
        <div className="px-1 pb-2 text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
          {title}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[16px] border border-black/5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {children}
      </div>
    </section>
  );
}
