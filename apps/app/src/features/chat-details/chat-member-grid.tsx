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
    <section className={cn("border-y border-black/5 bg-white px-4 py-4", className)}>
      <div className="grid grid-cols-4 gap-x-3 gap-y-4">
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
                    "flex h-12 w-12 items-center justify-center rounded-xl border border-dashed text-2xl shadow-none transition-colors",
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
              <span className="w-full truncate text-[12px] text-[color:var(--text-secondary)]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
