import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { BellOff } from "lucide-react";
import { cn } from "@yinjie/ui";

export function OfficialMessageEntryRow({
  title,
  preview,
  timestampLabel,
  unreadCount = 0,
  muted = false,
  variant = "mobile",
  active = false,
  contextMenuOpen = false,
  leading,
  onClick,
  onContextMenu,
  className,
}: {
  title: string;
  preview: string;
  timestampLabel?: string;
  unreadCount?: number;
  muted?: boolean;
  variant?: "mobile" | "desktop";
  active?: boolean;
  contextMenuOpen?: boolean;
  leading: ReactNode;
  onClick?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  const isDesktop = variant === "desktop";

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        isDesktop
          ? active
            ? "flex w-full items-center gap-3 rounded-[10px] border border-[rgba(7,193,96,0.14)] bg-white px-3 py-2.5 text-left shadow-[0_8px_22px_rgba(15,23,42,0.04)]"
            : contextMenuOpen
              ? "flex w-full items-center gap-3 rounded-[10px] border border-[color:var(--border-faint)] bg-white/88 px-3 py-2.5 text-left"
              : "flex w-full items-center gap-3 rounded-[10px] border border-transparent bg-transparent px-3 py-2.5 text-left transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[color:var(--border-faint)] hover:bg-white/80"
          : active
            ? "flex w-full items-center gap-2.5 bg-[rgba(7,193,96,0.07)] px-4 py-2.5 text-left"
            : "flex w-full items-center gap-2.5 bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5 text-left",
        className,
      )}
    >
      {leading}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-[color:var(--text-primary)]">
            <span
              className={cn(
                "truncate",
                isDesktop
                  ? "text-[14px] font-medium"
                  : "text-[14px] font-normal leading-[1.25]",
              )}
            >
              {title}
            </span>
          </div>
          <div
            className={cn(
              "shrink-0 text-[color:var(--text-muted)]",
              isDesktop ? "text-[11px]" : "text-[9px]",
            )}
          >
            {timestampLabel}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div
            className={cn(
              "min-w-0 truncate text-[color:var(--text-secondary)]",
              isDesktop ? "text-[12px]" : "text-[11px] leading-[1.35]",
            )}
          >
            {preview}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {muted ? (
              <BellOff
                size={isDesktop ? 13 : 11}
                className="text-[color:var(--text-dim)]"
                aria-label="消息免打扰"
              />
            ) : null}
            {unreadCount > 0 ? (
              muted ? (
                <div
                  className={cn(
                    "rounded-full",
                    isDesktop ? "h-2 w-2 bg-[#fa5151]" : "h-2 w-2 bg-[#b8b8b8]",
                  )}
                  aria-label={`${unreadCount} 条未读消息`}
                />
              ) : (
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full bg-[#fa5151] text-center text-white",
                    isDesktop
                      ? "min-w-5 px-1.5 py-0.5 text-[10px]"
                      : "min-h-[18px] min-w-[18px] px-1 text-[9px] leading-none shadow-[0_4px_12px_rgba(250,81,81,0.18)]",
                    unreadCount > 9
                      ? isDesktop
                        ? "min-w-[22px]"
                        : "min-w-[22px]"
                      : undefined,
                  )}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
