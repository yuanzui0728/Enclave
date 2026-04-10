import { Button, ErrorBlock, InlineNotice, TextField, cn } from "@yinjie/ui";
import { ArrowUp, PenSquare, RefreshCcw, Search, X } from "lucide-react";

export type DesktopFeedFilter = "all" | "owner" | "resident";

type DesktopFeedToolbarProps = {
  activeFilter: DesktopFeedFilter;
  commentErrorMessage?: string | null;
  errors?: string[];
  filteredCountLabel: string;
  likeErrorMessage?: string | null;
  searchText: string;
  selectedAuthorName?: string | null;
  successNotice?: string;
  onBackToTop: () => void;
  onClearAuthor: () => void;
  onFilterChange: (nextValue: DesktopFeedFilter) => void;
  onOpenCompose: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
};

const filterOptions: Array<{ key: DesktopFeedFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "owner", label: "只看我" },
  { key: "resident", label: "只看居民" },
];

export function DesktopFeedToolbar({
  activeFilter,
  commentErrorMessage,
  errors = [],
  filteredCountLabel,
  likeErrorMessage,
  searchText,
  selectedAuthorName,
  successNotice,
  onBackToTop,
  onClearAuthor,
  onFilterChange,
  onOpenCompose,
  onRefresh,
  onSearchChange,
}: DesktopFeedToolbarProps) {
  return (
    <div className="border-b border-[rgba(15,23,42,0.06)] px-6 py-4">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-dim)]">
              广场动态
            </div>
            <div className="mt-1 text-[18px] font-semibold text-[color:var(--text-primary)]">
              世界公开流连续浏览，右侧承接上下文
            </div>
            <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
              这里不只看朋友，世界主人和居民的公开发言都会进入这条流。
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              <RefreshCcw size={14} />
              刷新
            </Button>
            <Button variant="secondary" size="sm" onClick={onBackToTop}>
              <ArrowUp size={14} />
              回到顶部
            </Button>
            <Button variant="primary" size="sm" onClick={onOpenCompose}>
              <PenSquare size={14} />
              发动态
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onFilterChange(option.key)}
              className={cn(
                "rounded-full border px-4 py-2 text-[12px] font-medium transition-[border-color,background-color,color]",
                activeFilter === option.key
                  ? "border-[rgba(93,103,201,0.18)] bg-[rgba(93,103,201,0.10)] text-[#4951a3]"
                  : "border-[rgba(15,23,42,0.08)] bg-white/86 text-[color:var(--text-secondary)] hover:border-[rgba(93,103,201,0.14)] hover:text-[color:var(--text-primary)]",
              )}
            >
              {option.label}
            </button>
          ))}

          {selectedAuthorName ? (
            <button
              type="button"
              onClick={onClearAuthor}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(16,185,129,0.16)] bg-[rgba(236,253,245,0.92)] px-4 py-2 text-[12px] font-medium text-emerald-700"
            >
              只看 {selectedAuthorName} 的公开动态
              <X size={13} />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="relative block min-w-[240px] max-w-[420px] flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
            />
            <TextField
              value={searchText}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索作者、正文或评论"
              className="rounded-full border-[rgba(15,23,42,0.08)] bg-white/86 py-2.5 pl-11 text-[13px] shadow-none hover:bg-white focus:shadow-none"
            />
          </label>
          <div className="text-[12px] text-[color:var(--text-muted)]">
            {filteredCountLabel}
          </div>
        </div>

        {successNotice ? (
          <div className="mt-4">
            <InlineNotice tone="success">{successNotice}</InlineNotice>
          </div>
        ) : null}

        {errors.length > 0 ? (
          <div className="mt-4 space-y-3">
            {errors.map((message, index) => (
              <ErrorBlock key={`${message}-${index}`} message={message} />
            ))}
          </div>
        ) : null}

        {likeErrorMessage ? (
          <div className="mt-4">
            <ErrorBlock message={likeErrorMessage} />
          </div>
        ) : null}

        {commentErrorMessage ? (
          <div className="mt-4">
            <ErrorBlock message={commentErrorMessage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
