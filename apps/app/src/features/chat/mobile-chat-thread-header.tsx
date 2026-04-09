import { ArrowLeft, Ellipsis } from "lucide-react";
import { Button } from "@yinjie/ui";

type MobileChatThreadHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onMore: () => void;
  moreLabel?: string;
};

export function MobileChatThreadHeader({
  title,
  subtitle,
  onBack,
  onMore,
  moreLabel = "更多操作",
}: MobileChatThreadHeaderProps) {
  return (
    <header className="border-b border-white/80 bg-[linear-gradient(180deg,rgba(255,254,250,0.94),rgba(255,248,238,0.96))] px-3 py-3">
      <div className="relative flex min-h-11 items-center gap-3">
        {onBack ? (
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full border border-white/70 bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </Button>
        ) : (
          <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        )}

        <div className="pointer-events-none absolute inset-x-12 text-center">
          <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
              {subtitle}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onMore}
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/65 bg-white/72 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
          aria-label={moreLabel}
        >
          <Ellipsis size={18} />
        </button>
      </div>
    </header>
  );
}
