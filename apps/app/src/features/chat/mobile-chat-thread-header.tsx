import { ArrowLeft, Ellipsis } from "lucide-react";
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
    <header className="border-b border-black/5 bg-[#f7f7f7] px-2 py-2.5">
      <div className="relative flex min-h-11 items-center gap-1.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#111827] transition active:bg-black/5"
            aria-label="返回"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <div className="h-10 w-10 shrink-0" aria-hidden="true" />
        )}

        <div className="pointer-events-none absolute inset-x-12 text-center">
          <div className="truncate text-[17px] font-medium text-[#111827]">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
              {subtitle}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onMore}
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#111827] transition active:bg-black/5"
          aria-label={moreLabel}
        >
          <Ellipsis size={20} />
        </button>
      </div>
    </header>
  );
}
