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
};

export function ChatMemberGrid({ items, className }: ChatMemberGridProps) {
  return (
    <div className={cn("px-4 py-4", className)}>
      <div className="grid grid-cols-5 gap-x-3 gap-y-4">
        {items.map((item) => {
          const isAction = item.kind === "add" || item.kind === "remove";
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="flex min-w-0 flex-col items-center gap-1.5 text-center"
            >
              {isAction ? (
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-[12px] border border-dashed text-2xl shadow-none transition-colors",
                    item.kind === "remove"
                      ? "border-[rgba(220,38,38,0.25)] bg-[rgba(254,242,242,0.8)] text-red-500"
                      : "border-black/10 bg-[#f7f7f7] text-[color:var(--text-secondary)]",
                  )}
                >
                  {item.kind === "remove" ? "−" : "+"}
                </div>
              ) : (
                <AvatarChip name={item.label} src={item.src} size="wechat" />
              )}
              <span className="w-full truncate text-[11px] text-[color:var(--text-secondary)]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
