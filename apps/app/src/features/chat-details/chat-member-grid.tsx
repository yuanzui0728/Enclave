import type { ReactNode } from "react";
import { AvatarChip } from "../../components/avatar-chip";
import { cn } from "@yinjie/ui";

const EMPTY_AVATAR_NAME = "";

type ChatMemberGridItem = {
  key: string;
  label: ReactNode;
  avatarName?: string;
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
    <div className={cn("px-4 py-4", isWechat && "px-3 pb-2 pt-2.5", className)}>
      <div
        className={cn(
          "grid grid-cols-5 gap-x-3 gap-y-4",
          isWechat && "gap-x-2 gap-y-2.5",
        )}
      >
        {items.map((item) => {
          const isAction = item.kind === "add" || item.kind === "remove";
          // 没挂 onClick 的成员（如群里"我自己"——owner 用户类型，没有
          // /character/$id 资料页可去）不要走 button 的 active 反馈，免得
          // 用户以为点了能进去结果毛都没动。
          const interactive = Boolean(item.onClick) || isAction;
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              disabled={!interactive}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1.5 text-center",
                interactive
                  ? "active:opacity-85"
                  : "cursor-default disabled:opacity-100",
              )}
            >
              {isAction ? (
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-[12px] border text-2xl shadow-none transition-colors",
                    isWechat && "h-9 w-9 rounded-[9px] text-[20px]",
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
                <AvatarChip
                  name={
                    item.avatarName ??
                    (typeof item.label === "string"
                      ? item.label
                      : EMPTY_AVATAR_NAME)
                  }
                  src={item.src}
                  size="wechat"
                />
              )}
              <span
                className={cn(
                  "w-full truncate text-[11px] text-[color:var(--text-secondary)]",
                  isWechat && "text-[10px] leading-4 text-[#7a7a7a]",
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
