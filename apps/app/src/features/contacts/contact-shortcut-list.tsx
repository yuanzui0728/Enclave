import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";

export type ContactShortcutListItem = {
  key: string;
  label: ReactNode;
  subtitle?: ReactNode;
  badgeCount?: number;
  active?: boolean;
  disabled?: boolean;
  disabledLabel?: ReactNode;
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
          ? "overflow-hidden rounded-[var(--radius-md)] bg-transparent"
          : "overflow-hidden border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] bg-[image:var(--surface-card-gradient)]",
        compact && variant !== "desktop-flat" ? "rounded-[var(--radius-lg)]" : "rounded-none",
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
                      ? "cursor-not-allowed bg-transparent px-4 py-3"
                      : "cursor-not-allowed bg-transparent px-4 py-3.5"
                    : mobileDense
                      ? "bg-transparent px-4 py-3 active:bg-[color:var(--surface-console)]"
                      : "bg-transparent px-4 py-3.5 hover:bg-[color:var(--surface-console)]"
                  : item.disabled
                    ? "cursor-not-allowed bg-transparent px-4 py-3"
                    : "bg-transparent px-4 py-3 hover:bg-[color:var(--surface-card-hover)]",
              item.disabled ? "opacity-60" : undefined,
              variant === "desktop-flat" && index > 0
                ? "border-t border-[color:var(--border-faint)]"
                : index > 0
                  ? "border-t border-[color:var(--border-faint)]"
                  : undefined,
              variant === "desktop-flat" && item.active
                ? "bg-[color:var(--surface-card)] shadow-[0_1px_2px_rgba(60, 40, 110, 0.05)]"
                : undefined,
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-center text-white",
                variant === "desktop-flat"
                  ? "h-8 w-8 rounded-[var(--radius-sm)]"
                  : "rounded-[var(--radius-sm)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72)]",
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
                aria-hidden="true"
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
                    ? "text-[length:var(--text-body)]"
                    : compact
                      ? mobileDense
                        ? "text-[length:var(--text-base)]"
                        : "text-[length:var(--text-title)]"
                      : "text-[length:var(--text-base)]",
                )}
              >
                {item.label}
              </div>
              {!compact && item.disabledLabel ? (
                <div className="mt-0.5 truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-dim)]">
                  {item.disabledLabel}
                </div>
              ) : null}
              {(compact || variant === "desktop-flat") && item.subtitle ? (
                <div
                  className={cn(
                    "mt-0.5 truncate text-[color:var(--text-muted)]",
                    variant === "desktop-flat"
                      ? "text-[length:var(--text-eyebrow)]"
                      : mobileDense
                        ? "text-[length:var(--text-eyebrow)]"
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
                        : "text-[length:var(--text-eyebrow)]",
                  )}
                >
                  {item.disabledLabel}
                </div>
              ) : null}
            </div>

            {item.badgeCount ? (
              // 走查新一轮 R4：原版 badge 是纯视觉 div，SR 读 button 时会按 DOM 顺序
              // 把 "新的朋友, 5 条待处理申请, 5" 念出来——subtitle 已经把"X 条待处
              // 理申请"播报过了，badge 里的裸数字 "5" 是重复信息。aria-hidden 让 SR
              // 跳过 badge，保留视觉提示。
              <div
                aria-hidden="true"
                className={cn(
                  "flex items-center justify-center rounded-full bg-[color:var(--state-danger-bg)] font-medium leading-none text-white",
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
                aria-hidden="true"
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
