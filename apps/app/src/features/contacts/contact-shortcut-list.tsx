import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";

export type ContactShortcutListItem = {
  key: string;
  label: string;
  subtitle?: string;
  badgeCount?: number;
  active?: boolean;
  disabled?: boolean;
  disabledLabel?: string;
  icon: LucideIcon;
  iconClassName: string;
  onClick: () => void;
};

export function ContactShortcutList({
  items,
  compact = false,
  mobileDense = false,
  variant = "default",
  className,
}: {
  items: ContactShortcutListItem[];
  compact?: boolean;
  mobileDense?: boolean;
  variant?: "default" | "desktop-flat";
  className?: string;
}) {
  return (
    <section
      className={cn(
        variant === "desktop-flat"
          ? "overflow-hidden rounded-[14px] bg-transparent"
          : "overflow-hidden border border-[color:var(--border-faint)] bg-white",
        compact && variant !== "desktop-flat" ? "rounded-[18px]" : "rounded-none",
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
              "flex w-full items-center gap-3 text-left transition-[background-color,border-color,color]",
              variant === "desktop-flat"
                ? item.disabled
                  ? "cursor-not-allowed bg-transparent px-3 py-2.5"
                  : "bg-transparent px-3 py-2.5 hover:bg-white/80"
                : compact
                  ? item.disabled
                    ? mobileDense
                      ? "cursor-not-allowed bg-white px-4 py-3"
                      : "cursor-not-allowed bg-white px-4 py-3.5"
                    : mobileDense
                      ? "bg-white px-4 py-3 active:bg-[color:var(--surface-console)]"
                      : "bg-white px-4 py-3.5 hover:bg-[color:var(--surface-console)]"
                  : item.disabled
                    ? "cursor-not-allowed bg-white px-4 py-3"
                    : "bg-white px-4 py-3 hover:bg-[color:var(--surface-card-hover)]",
              item.disabled ? "opacity-60" : undefined,
              variant === "desktop-flat" && index > 0
                ? "border-t border-[rgba(0,0,0,0.04)]"
                : index > 0
                  ? "border-t border-[color:var(--border-faint)]"
                  : undefined,
              variant === "desktop-flat" && item.active
                ? "bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                : undefined,
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-center text-white",
                variant === "desktop-flat"
                  ? "h-8 w-8 rounded-[10px]"
                  : "rounded-[12px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72)]",
                variant === "desktop-flat"
                  ? undefined
                  : compact
                    ? mobileDense
                      ? "h-9 w-9"
                      : "h-10 w-10"
                    : "h-9 w-9",
                item.iconClassName,
              )}
            >
              <Icon
                size={
                  variant === "desktop-flat"
                    ? 16
                    : compact
                      ? mobileDense
                        ? 17
                        : 18
                      : 17
                }
              />
            </div>

            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate text-[color:var(--text-primary)]",
                  variant === "desktop-flat"
                    ? "text-[14px]"
                    : compact
                      ? mobileDense
                        ? "text-[15px]"
                        : "text-[16px]"
                      : "text-[15px]",
                )}
              >
                {item.label}
              </div>
              {!compact && item.disabledLabel ? (
                <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-dim)]">
                  {item.disabledLabel}
                </div>
              ) : null}
              {(compact || variant === "desktop-flat") && item.subtitle ? (
                <div
                  className={cn(
                    "mt-0.5 truncate text-[color:var(--text-muted)]",
                    variant === "desktop-flat"
                      ? "text-[11px]"
                      : mobileDense
                        ? "text-[11px]"
                        : "text-xs",
                  )}
                >
                  {item.subtitle}
                </div>
              ) : null}
              {(compact || variant === "desktop-flat") && item.disabledLabel ? (
                <div
                  className={cn(
                    "mt-0.5 truncate text-[color:var(--text-dim)]",
                    variant === "desktop-flat"
                      ? "text-[10px]"
                      : mobileDense
                        ? "text-[10px]"
                        : "text-[11px]",
                  )}
                >
                  {item.disabledLabel}
                </div>
              ) : null}
            </div>

            {item.badgeCount ? (
              <div
                className={cn(
                  "flex items-center justify-center rounded-full bg-[#e74c3c] font-medium leading-none text-white",
                  variant === "desktop-flat"
                    ? "min-w-4.5 px-1.5 py-0.5 text-[10px]"
                    : mobileDense
                      ? "min-w-4 px-1.5 py-0.5 text-[9px]"
                      : "min-w-4.5 px-1.5 py-0.5 text-[10px]",
                )}
              >
                {item.badgeCount > 99 ? "99+" : item.badgeCount}
              </div>
            ) : null}

            {item.disabled || variant === "desktop-flat" ? null : (
              <ChevronRight
                size={mobileDense ? 14 : 15}
                className="shrink-0 text-[color:var(--text-muted)]"
              />
            )}
          </button>
        );
      })}
    </section>
  );
}
