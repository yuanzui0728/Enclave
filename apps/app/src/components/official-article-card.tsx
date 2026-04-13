import type { OfficialAccountArticleSummary } from "@yinjie/contracts";
import { Pin, Star } from "lucide-react";
import { cn } from "@yinjie/ui";
import { formatTimestamp } from "../lib/format";

export function OfficialArticleCard({
  article,
  active = false,
  compact = false,
  dense = false,
  favorite = false,
  onClick,
  onToggleFavorite,
}: {
  article: OfficialAccountArticleSummary;
  active?: boolean;
  compact?: boolean;
  dense?: boolean;
  favorite?: boolean;
  onClick?: () => void;
  onToggleFavorite?: () => void;
}) {
  return (
    <div
      className={cn(
        "group w-full transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        compact
          ? "rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-4 shadow-[var(--shadow-section)] hover:bg-[color:var(--surface-console)]"
          : dense
            ? "border-b border-[color:var(--border-faint)] bg-white px-4 py-2.5 hover:bg-[color:var(--surface-console)]"
            : "border-b border-[color:var(--border-faint)] bg-white px-5 py-4 hover:bg-[color:var(--surface-console)]",
        active
          ? compact
            ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)]"
            : "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.05)]"
          : undefined,
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between",
          dense ? "gap-2.5" : "gap-3",
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 text-left"
        >
          <div
            className={cn(
              "flex items-center",
              dense ? "gap-1" : "gap-2",
            )}
          >
            {article.isPinned ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] font-medium text-[color:var(--brand-primary)]",
                  dense ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
                )}
              >
                <Pin size={dense ? 10 : 11} />
                置顶
              </span>
            ) : null}
            <div
              className={cn(
                "text-[color:var(--text-muted)]",
                dense ? "text-[10px]" : "text-[11px]",
              )}
            >
              {formatTimestamp(article.publishedAt)}
            </div>
          </div>
          <div
            className={cn(
              "font-medium text-[color:var(--text-primary)]",
              dense ? "mt-1 text-[14px] leading-5" : "mt-2 text-[16px] leading-6",
            )}
          >
            {article.title}
          </div>
          <div
            className={cn(
              "text-[color:var(--text-secondary)]",
              dense
                ? "mt-1 line-clamp-2 text-[11px] leading-[1.125rem]"
                : "mt-2 line-clamp-3 text-sm leading-6",
            )}
          >
            {article.summary}
          </div>
        </button>
        <div
          className={cn(
            "flex shrink-0 items-start",
            dense ? "gap-1.5" : "gap-2",
          )}
        >
          {onToggleFavorite ? (
            <button
              type="button"
              onClick={onToggleFavorite}
              className={cn(
                "inline-flex items-center gap-1 border font-medium transition",
                dense
                  ? "h-[1.625rem] rounded-[10px] px-2 text-[10px]"
                  : "h-8 rounded-lg px-3 text-[11px]",
                favorite
                  ? "border-[#d8d1a9] bg-[#fbf7e8] text-[#8a6b11]"
                  : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
              )}
            >
              <Star
                size={dense ? 11 : 12}
                className={favorite ? "fill-current" : ""}
              />
              {favorite ? "已收藏" : "收藏"}
            </button>
          ) : null}
          {!compact && !dense ? (
            <div className="shrink-0 rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[11px] text-[color:var(--brand-primary)]">
              {article.readCount} 阅读
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
