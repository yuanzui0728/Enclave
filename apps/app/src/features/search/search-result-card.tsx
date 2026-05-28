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
      ? "border-[#d7e5fb] bg-[#f3f7ff] text-[#315b9a]"
      : item.category === "contacts"
        ? "border-[#cfe8d6] bg-[#f2f8f3] text-[#1d6a37]"
        : item.category === "favorites"
          ? "border-[#eadbb4] bg-[#fff8e8] text-[#9a6b12]"
        : item.category === "officialAccounts"
          ? "border-[color:var(--border-subtle)] bg-[#f5f1e6] text-[color:var(--text-secondary)]"
          : item.category === "miniPrograms"
            ? "border-[#d3e7df] bg-[#eff8f4] text-[#226448]"
          : item.category === "moments"
            ? "border-[#d9e7d4] bg-[#f5faf3] text-[#557d37]"
            : "border-[#d6e2db] bg-[#f2f7f4] text-[#3c6a53]";

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={
        layout === "mobile"
          ? "flex w-full items-start gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3.5 py-2.5 text-left transition hover:bg-[color:var(--surface-card)]"
          : "flex w-full items-start gap-3 rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--brand-primary)]/16 hover:bg-[color:var(--surface-console)]"
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
                ? "truncate text-[13px] font-medium text-[color:var(--text-primary)]"
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
              ? "mt-1.5 line-clamp-2 text-[12px] leading-[1.35rem] text-[color:var(--text-secondary)]"
              : "mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]"
          }
        >
          {renderHighlightedText(item.description, keyword)}
        </div>
      </div>
    </button>
  );
}
