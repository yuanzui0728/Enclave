import { AvatarChip } from "../../components/avatar-chip";
import { cn } from "@yinjie/ui";

type ChatMemberGridItem = {
  key: string;
  label: string;
  src?: string | null;
  kind?: "member" | "add" | "remove";
  onClick?: () => void;
};

type ChatMemberGridProps = {
  items: ChatMemberGridItem[];
  className?: string;
  variant?: "default" | "wechat";
};

export function ChatMemberGrid({
  items,
  className,
  variant = "default",
}: ChatMemberGridProps) {
  const isWechat = variant === "wechat";

  return (
    <div className={cn("px-4 py-4", isWechat && "px-3 pb-2.5 pt-3", className)}>
      <div
        className={cn(
          "grid grid-cols-5 gap-x-3 gap-y-4",
          isWechat && "gap-x-2 gap-y-3",
        )}
      >
        {items.map((item) => {
          const isAction = item.kind === "add" || item.kind === "remove";
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="flex min-w-0 flex-col items-center gap-1.5 text-center active:opacity-85"
            >
              {isAction ? (
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-[12px] border text-2xl shadow-none transition-colors",
                    isWechat && "h-10 w-10 rounded-[10px] text-[22px]",
                    item.kind === "remove"
                      ? "border-[rgba(220,38,38,0.18)] bg-[rgba(254,242,242,0.72)] text-[#d74b45]"
                      : isWechat
                        ? "border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] text-[color:var(--text-muted)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
                  )}
                >
                  {item.kind === "remove" ? "−" : "+"}
                </div>
              ) : (
                <AvatarChip name={item.label} src={item.src} size="wechat" />
              )}
              <span
                className={cn(
                  "w-full truncate text-[11px] text-[color:var(--text-secondary)]",
                  isWechat && "text-[10px] text-[#7a7a7a]",
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
