import { AvatarChip } from "../../components/avatar-chip";
import { renderHighlightedText } from "./search-utils";
import { type SearchResultItem } from "./search-types";

type SearchResultCardProps = {
  item: SearchResultItem;
  keyword: string;
  layout: "mobile" | "desktop";
  onOpen: (item: SearchResultItem) => void;
};

export function SearchResultCard({
  item,
  keyword,
  layout,
  onOpen,
}: SearchResultCardProps) {
  const badgeClassName =
    item.category === "messages"
      ? "border-[color:var(--state-info-bg)] bg-[color:var(--state-info-bg)] text-[color:var(--state-info-text)]"
      : item.category === "contacts"
        ? "border-[color:var(--state-success-bg)] bg-[color:var(--surface-secondary)] text-[color:var(--state-success-text)]"
        : item.category === "favorites"
          ? "border-[color:var(--state-warning-bg)] bg-[color:var(--surface-card)] text-[color:var(--state-warning-text)]"
        : item.category === "officialAccounts"
          ? "border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] text-[color:var(--text-secondary)]"
          : item.category === "miniPrograms"
            ? "border-[color:var(--state-success-bg)] bg-[color:var(--state-success-bg)] text-[color:var(--state-success-text)]"
          : item.category === "moments"
            ? "border-[color:var(--state-success-bg)] bg-[color:var(--surface-card)] text-[color:var(--state-success-text)]"
            : "border-[color:var(--state-success-bg)] bg-[color:var(--surface-secondary)] text-[color:var(--state-success-text)]";

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={
        layout === "mobile"
          ? "flex w-full items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3.5 py-2.5 text-left transition hover:bg-[color:var(--surface-card)]"
          : "flex w-full items-start gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--brand-primary)]/16 hover:bg-[color:var(--surface-console)]"
      }
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div
            className={
              layout === "mobile"
                ? "truncate text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]"
                : "truncate text-sm font-medium text-[color:var(--text-primary)]"
            }
          >
            {renderHighlightedText(item.title, keyword)}
          </div>
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${badgeClassName}`}
          >
            {item.badge}
          </span>
        </div>
        <div
          className={
            layout === "mobile"
              ? "mt-0.5 text-[10px] text-[color:var(--text-muted)]"
              : "mt-1 text-xs text-[color:var(--text-muted)]"
          }
        >
          {renderHighlightedText(item.meta, keyword)}
        </div>
        <div
          className={
            layout === "mobile"
              ? "mt-1.5 line-clamp-2 text-[length:var(--text-caption)] leading-[1.35rem] text-[color:var(--text-secondary)]"
              : "mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]"
          }
        >
          {renderHighlightedText(item.description, keyword)}
        </div>
      </div>
    </button>
  );
}
