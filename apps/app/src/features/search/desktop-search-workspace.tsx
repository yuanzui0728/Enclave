import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  Clock3,
  MessageSquareText,
  Newspaper,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { EmptyState } from "../../components/empty-state";
import { DesktopUtilityShell } from "../desktop/desktop-utility-shell";
import { SearchResultCard } from "./search-result-card";
import {
  searchCategoryLabels,
  searchCategoryTitles,
  type SearchCategory,
  type SearchHistoryItem,
  type SearchMatchCounts,
  type SearchResultItem,
  type SearchResultSection,
  type SearchScopeCounts,
} from "./search-types";

type DesktopSearchWorkspaceProps = {
  activeCategory: SearchCategory;
  error: string | null;
  groupedResults: SearchResultSection[];
  hasKeyword: boolean;
  history: SearchHistoryItem[];
  loading: boolean;
  matchedCounts: SearchMatchCounts;
  onApplyHistory: (keyword: string) => void;
  onClearHistory: () => void;
  onClearKeyword: () => void;
  onCommitSearch: (keyword: string) => void;
  onOpenResult: (item: SearchResultItem) => void;
  onRemoveHistory: (keyword: string) => void;
  scopeCounts: SearchScopeCounts;
  searchText: string;
  searchingMessages: boolean;
  setActiveCategory: Dispatch<SetStateAction<SearchCategory>>;
  setSearchText: Dispatch<SetStateAction<string>>;
  visibleResults: SearchResultItem[];
};

const searchTips = [
  "聊天记录结果会随着索引补全继续刷新。",
  "联系人优先匹配备注名、角色名和标签。",
  "内容流结果按现有公开内容聚合展示。",
];

export function DesktopSearchWorkspace({
  activeCategory,
  error,
  groupedResults,
  hasKeyword,
  history,
  loading,
  matchedCounts,
  onApplyHistory,
  onClearHistory,
  onClearKeyword,
  onCommitSearch,
  onOpenResult,
  onRemoveHistory,
  scopeCounts,
  searchText,
  searchingMessages,
  setActiveCategory,
  setSearchText,
  visibleResults,
}: DesktopSearchWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <DesktopUtilityShell
      title="搜一搜"
      subtitle={
        hasKeyword
          ? `关键词“${searchText.trim()}”命中 ${visibleResults.length} 条结果`
          : "搜索聊天记录、联系人、公众号和内容流"
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              搜索范围
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              左侧切换分类，结果会在中间工作区立即收敛。
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="space-y-1">
              {searchCategoryLabels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveCategory(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[12px] px-3 py-2.5 text-left text-sm transition",
                    activeCategory === item.id
                      ? "bg-[rgba(7,193,96,0.10)] text-[color:var(--text-primary)]"
                      : "text-[color:var(--text-secondary)] hover:bg-white/80 hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <span>{item.label}</span>
                  <span className="rounded-full bg-white/88 px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]">
                    {item.id === "all" || !hasKeyword
                      ? "全部"
                      : matchedCounts[item.id]}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-[color:var(--text-primary)]">
                  最近搜索
                </div>
                {history.length ? (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="text-xs text-[color:var(--text-muted)]"
                  >
                    清空
                  </button>
                ) : null}
              </div>

              {history.length ? (
                <div className="mt-3 space-y-2">
                  {history.map((item) => (
                    <div
                      key={item.keyword}
                      className="flex items-center gap-2 rounded-[10px] bg-[color:var(--surface-console)] px-3 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => onApplyHistory(item.keyword)}
                        className="inline-flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-[color:var(--text-secondary)]"
                      >
                        <Clock3
                          size={13}
                          className="shrink-0 text-[color:var(--text-dim)]"
                        />
                        <span className="truncate">{item.keyword}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveHistory(item.keyword)}
                        className="text-[10px] text-[color:var(--text-dim)]"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-[10px] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
                  还没有最近搜索，桌面端会在你真正使用后记录关键词。
                </div>
              )}
            </div>
          </div>
        </div>
      }
      aside={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Sparkles size={16} className="text-[#15803d]" />
              <span>搜索概览</span>
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              右侧汇总当前索引覆盖范围和搜索提示。
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="grid gap-3">
              <ScopeCard label="会话" value={`${scopeCounts.conversations}`} />
              <ScopeCard label="联系人" value={`${scopeCounts.contacts}`} />
              <ScopeCard
                label="公众号"
                value={`${scopeCounts.officialAccounts}`}
              />
              <ScopeCard label="朋友圈" value={`${scopeCounts.moments}`} />
              <ScopeCard label="广场动态" value={`${scopeCounts.feed}`} />
            </div>

            <div className="mt-5 rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                搜索提示
              </div>
              <div className="mt-3 space-y-2">
                {searchTips.map((item) => (
                  <div
                    key={item}
                    className="rounded-[10px] bg-[color:var(--surface-console)] px-3 py-2.5 text-xs leading-6 text-[color:var(--text-secondary)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      }
    >
      <div className="p-5">
        <form
          className="relative rounded-[16px] border border-[color:var(--border-faint)] bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onCommitSearch(searchText);
          }}
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-8 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <input
            ref={inputRef}
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索聊天记录、联系人、公众号、朋友圈和广场动态"
            className="h-12 w-full rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] pl-11 pr-20 text-sm text-[color:var(--text-primary)] outline-none transition-[border-color,background-color] placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)] focus:bg-white"
          />
          {searchText ? (
            <button
              type="button"
              onClick={onClearKeyword}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-[color:var(--text-muted)]"
            >
              清空
            </button>
          ) : null}
        </form>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {loading ? <LoadingBlock label="正在准备桌面搜索索引..." /> : null}
          {error ? <ErrorBlock message={error} /> : null}

          {!loading && !error && hasKeyword && searchingMessages ? (
            <div className="mb-4">
              <InlineNotice tone="info">
                正在补全所有会话的聊天记录索引，消息结果会继续刷新。
              </InlineNotice>
            </div>
          ) : null}

          {!loading && !error && !hasKeyword ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <QuickScopeTile
                  icon={MessageSquareText}
                  title="聊天记录"
                  description="支持搜历史消息正文。"
                />
                <QuickScopeTile
                  icon={UsersRound}
                  title="联系人"
                  description="支持搜备注名和标签。"
                />
                <QuickScopeTile
                  icon={Newspaper}
                  title="内容流"
                  description="支持搜朋友圈和广场动态。"
                />
              </div>

              <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/80 p-6">
                <EmptyState
                  title="输入关键词开始搜索"
                  description="桌面搜一搜会同时检索消息、联系人、公众号和内容流。"
                />
              </div>
            </div>
          ) : null}

          {!loading && !error && hasKeyword && !visibleResults.length ? (
            <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/80 p-6">
              <EmptyState
                title="没有找到匹配结果"
                description="换个关键词，或者切换左侧分类后再试。"
              />
            </div>
          ) : null}

          {!loading && !error && hasKeyword ? (
            activeCategory === "all" ? (
              <div className="space-y-6">
                {groupedResults.map((section) => (
                  <section key={section.category} className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-3">
                      <div>
                        <div className="text-[11px] text-[color:var(--text-muted)]">
                          搜索结果
                        </div>
                        <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
                          {section.label}
                        </div>
                      </div>
                      <div className="rounded-md bg-[color:var(--surface-console)] px-2.5 py-1 text-xs text-[color:var(--text-muted)]">
                        {section.results.length} 条
                      </div>
                    </div>
                    <div className="space-y-3">
                      {section.results.map((item) => (
                        <SearchResultCard
                          key={item.id}
                          item={item}
                          keyword={searchText.trim().toLowerCase()}
                          layout="desktop"
                          onOpen={onOpenResult}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-3">
                  <div>
                    <div className="text-[11px] text-[color:var(--text-muted)]">
                      搜索结果
                    </div>
                    <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
                      {searchCategoryTitles[activeCategory]}
                    </div>
                  </div>
                  <div className="rounded-md bg-[color:var(--surface-console)] px-2.5 py-1 text-xs text-[color:var(--text-muted)]">
                    {visibleResults.length} 条
                  </div>
                </div>
                {visibleResults.map((item) => (
                  <SearchResultCard
                    key={item.id}
                    item={item}
                    keyword={searchText.trim().toLowerCase()}
                    layout="desktop"
                    onOpen={onOpenResult}
                  />
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </DesktopUtilityShell>
  );
}

function ScopeCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function QuickScopeTile({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof Search;
  title: string;
}) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
        <Icon size={18} />
      </div>
      <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
        {description}
      </div>
    </div>
  );
}
