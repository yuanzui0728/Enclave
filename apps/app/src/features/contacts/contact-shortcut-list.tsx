import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";

export type ContactShortcutListItem = {
  key: string;
  label: string;
  subtitle?: string;
  badgeCount?: number;
  icon: LucideIcon;
  iconClassName: string;
  onClick: () => void;
};

export function ContactShortcutList({
  items,
  compact = false,
  className,
}: {
  items: ContactShortcutListItem[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]", compact ? "rounded-[24px]" : "rounded-none", className)}>
      {items.map((item, index) => {
        const Icon = item.icon;

        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className={cn(
              "flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] text-left transition-colors hover:bg-[rgba(249,115,22,0.05)]",
              compact ? "px-4 py-3.5" : "px-4 py-3",
              index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-[11px] text-white shadow-[0_8px_18px_rgba(180,100,20,0.10)]",
                compact ? "h-10 w-10" : "h-10 w-10",
                item.iconClassName,
              )}
            >
              <Icon size={compact ? 18 : 19} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] text-[color:var(--text-primary)]">{item.label}</div>
              {item.subtitle ? <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">{item.subtitle}</div> : null}
            </div>

            {item.badgeCount ? (
              <div className="flex min-w-5 items-center justify-center rounded-full bg-[#e74c3c] px-1.5 py-0.5 text-[11px] font-medium leading-none text-white">
                {item.badgeCount > 99 ? "99+" : item.badgeCount}
              </div>
            ) : null}

            <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
          </button>
        );
      })}
    </section>
  );
}
