import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";

export type ContactShortcutListItem = {
  key: string;
  label: string;
  subtitle?: string;
  badgeCount?: number;
  disabled?: boolean;
  disabledLabel?: string;
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
    <section
      className={cn(
        "overflow-hidden border border-[color:var(--border-faint)] bg-white",
        compact ? "rounded-[18px]" : "rounded-none",
        className,
      )}
    >
      {items.map((item, index) => {
        const Icon = item.icon;

        return (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={item.onClick}
            className={cn(
              "flex w-full items-center gap-3 bg-white text-left transition-[background-color,border-color]",
              compact
                ? item.disabled
                  ? "cursor-not-allowed px-4 py-3.5"
                  : "px-4 py-3.5 hover:bg-[color:var(--surface-console)]"
                : item.disabled
                  ? "cursor-not-allowed px-4 py-3"
                  : "px-4 py-3 hover:bg-[color:var(--surface-card-hover)]",
              item.disabled ? "opacity-60" : "",
              index > 0
                ? "border-t border-[color:var(--border-faint)]"
                : undefined,
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-[12px] text-white",
                "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72)]",
                compact ? "h-10 w-10" : "h-9 w-9",
                item.iconClassName,
              )}
            >
              <Icon size={compact ? 18 : 17} />
            </div>

            <div className="min-w-0 flex-1">
              <div className={cn(
                "truncate text-[color:var(--text-primary)]",
                compact ? "text-[16px]" : "text-[15px]",
              )}>
                {item.label}
              </div>
              {!compact && item.disabledLabel ? (
                <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-dim)]">
                  {item.disabledLabel}
                </div>
              ) : null}
              {compact && item.subtitle ? (
                <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                  {item.subtitle}
                </div>
              ) : null}
              {compact && item.disabledLabel ? (
                <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-dim)]">
                  {item.disabledLabel}
                </div>
              ) : null}
            </div>

            {item.badgeCount ? (
              <div className="flex min-w-4.5 items-center justify-center rounded-full bg-[#e74c3c] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                {item.badgeCount > 99 ? "99+" : item.badgeCount}
              </div>
            ) : null}

            {item.disabled ? null : (
              <ChevronRight
                size={15}
                className="shrink-0 text-[color:var(--text-muted)]"
              />
            )}
          </button>
        );
      })}
    </section>
  );
}
