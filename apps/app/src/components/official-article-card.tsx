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
        "group w-full transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        compact
          ? "rounded-[20px] border border-[color:var(--border-faint)] bg-white/92 px-4 py-4 hover:bg-white"
          : "border-b border-[color:var(--border-faint)] bg-white/80 px-5 py-4 hover:bg-white/95",
        active ? "bg-[rgba(249,115,22,0.08)]" : undefined,
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
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(249,115,22,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#b45309]">
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
                "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[11px] font-medium transition",
                favorite
                  ? "border-[rgba(249,115,22,0.24)] bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]"
                  : "border-[color:var(--border-faint)] bg-white/90 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
              )}
            >
              <Star size={12} className={favorite ? "fill-current" : ""} />
              {favorite ? "已收藏" : "收藏"}
            </button>
          ) : null}
          {!compact ? (
            <div className="shrink-0 rounded-full bg-[rgba(47,122,63,0.10)] px-2.5 py-1 text-[11px] text-[#2f7a3f]">
              {article.readCount} 阅读
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
