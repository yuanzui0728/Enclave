import { Button, ErrorBlock, InlineNotice, TextField, cn } from "@yinjie/ui";
import { ArrowUp, PenSquare, RefreshCcw, Search, X } from "lucide-react";

export type DesktopFeedFilter = "all" | "owner" | "resident";
export type DesktopFeedSort = "latest" | "discussion" | "ai-active";

type DesktopFeedToolbarProps = {
  activeFilter: DesktopFeedFilter;
  activeSort: DesktopFeedSort;
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
  onSortChange: (nextValue: DesktopFeedSort) => void;
};

const filterOptions: Array<{ key: DesktopFeedFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "owner", label: "只看我" },
  { key: "resident", label: "只看居民" },
];

const sortOptions: Array<{ key: DesktopFeedSort; label: string }> = [
  { key: "latest", label: "最新" },
  { key: "discussion", label: "讨论度" },
  { key: "ai-active", label: "AI 在场" },
];

export function DesktopFeedToolbar({
  activeFilter,
  activeSort,
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
  onSortChange,
}: DesktopFeedToolbarProps) {
  return (
    <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-6 py-4 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
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
                "rounded-xl border px-4 py-2 text-[12px] font-medium transition-[border-color,background-color,color]",
                activeFilter === option.key
                  ? "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.08)] text-[#15803d]"
                  : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] hover:border-[rgba(7,193,96,0.16)] hover:text-[color:var(--text-primary)]",
              )}
            >
              {option.label}
            </button>
          ))}

          {selectedAuthorName ? (
            <button
              type="button"
              onClick={onClearAuthor}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.08)] px-4 py-2 text-[12px] font-medium text-[#15803d]"
            >
              只看 {selectedAuthorName} 的公开动态
              <X size={13} />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
            排序
          </div>
          {sortOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onSortChange(option.key)}
              className={cn(
                "rounded-xl border px-3.5 py-1.5 text-[12px] font-medium transition-[border-color,background-color,color]",
                activeSort === option.key
                  ? "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.08)] text-[#15803d]"
                  : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] hover:border-[rgba(7,193,96,0.16)] hover:text-[color:var(--text-primary)]",
              )}
            >
              {option.label}
            </button>
          ))}
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
              className="rounded-xl border-[color:var(--border-faint)] bg-[color:var(--surface-console)] py-2.5 pl-11 text-[13px] shadow-none hover:bg-white focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-none"
            />
          </label>
          <div className="text-[12px] text-[color:var(--text-muted)]">
            {filteredCountLabel}
          </div>
        </div>

        {successNotice ? (
          <div className="mt-4">
            <InlineNotice
              tone="success"
              className="border-[color:var(--border-faint)] bg-white"
            >
              {successNotice}
            </InlineNotice>
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
