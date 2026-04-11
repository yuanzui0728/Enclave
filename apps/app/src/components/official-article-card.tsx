import type { OfficialAccountArticleSummary } from "@yinjie/contracts";
import { Pin, Star } from "lucide-react";
import { cn } from "@yinjie/ui";
import { formatTimestamp } from "../lib/format";

export function OfficialArticleCard({
  article,
  active = false,
  compact = false,
  favorite = false,
  onClick,
  onToggleFavorite,
}: {
  article: OfficialAccountArticleSummary;
  active?: boolean;
  compact?: boolean;
  favorite?: boolean;
  onClick?: () => void;
  onToggleFavorite?: () => void;
}) {
  return (
    <div
      className={cn(
        "group w-full transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        compact
          ? "rounded-[20px] border border-black/6 bg-white px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] hover:border-black/10 hover:bg-[#fcfcfc]"
          : "border-b border-black/6 bg-white px-5 py-4 hover:bg-[#fbfbfb]",
        active
          ? compact
            ? "border-[#cfe8d6] bg-[#f7fbf8]"
            : "border-[#cfe8d6] bg-[#f4faf6]"
          : undefined,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            {article.isPinned ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-[#d8e6d3] bg-[#f5faf3] px-2 py-0.5 text-[11px] font-medium text-[#557d37]">
                <Pin size={11} />
                置顶
              </span>
            ) : null}
            <div className="text-[11px] text-[color:var(--text-muted)]">
              {formatTimestamp(article.publishedAt)}
            </div>
          </div>
          <div className="mt-2 text-[16px] font-medium leading-6 text-[color:var(--text-primary)]">
            {article.title}
          </div>
          <div className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-secondary)]">
            {article.summary}
          </div>
        </button>
        <div className="flex shrink-0 items-start gap-2">
          {onToggleFavorite ? (
            <button
              type="button"
              onClick={onToggleFavorite}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-[11px] font-medium transition",
                favorite
                  ? "border-[#d8d1a9] bg-[#fbf7e8] text-[#8a6b11]"
                  : "border-black/6 bg-white text-[color:var(--text-secondary)] hover:bg-[#f6f6f6] hover:text-[color:var(--text-primary)]",
              )}
            >
              <Star size={12} className={favorite ? "fill-current" : ""} />
              {favorite ? "已收藏" : "收藏"}
            </button>
          ) : null}
          {!compact ? (
            <div className="shrink-0 rounded-md border border-[#d8e6d3] bg-[#f5faf3] px-2.5 py-1 text-[11px] text-[#557d37]">
              {article.readCount} 阅读
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
