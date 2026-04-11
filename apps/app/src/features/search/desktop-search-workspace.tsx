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
  "聊天记录已经接入全局消息索引，输入关键词后会自动补齐所有会话的历史文本。",
  "联系人结果会优先命中备注名，再补充角色名、地区、来源和标签。",
  "朋友圈、广场动态和公众号先按现有内容流聚合，不额外引入后端搜索服务。",
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
    <div className="flex h-full min-h-0 bg-[#efefef]">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-black/6 bg-[#f6f6f6] p-4">
        <div>
          <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
            Search
          </div>
          <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
            搜一搜
          </div>
          <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
            桌面端按微信式工作区组织搜索范围、结果列表和最近记录。
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {searchCategoryLabels.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveCategory(item.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-[16px] border px-3 py-3 text-left text-sm transition",
                activeCategory === item.id
                  ? "border-[#cfe8d6] bg-[#f7fbf8] text-[color:var(--text-primary)] shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                  : "border-transparent bg-white text-[color:var(--text-secondary)] hover:border-black/6 hover:bg-[#fcfcfc]",
              )}
            >
              <span>{item.label}</span>
              {item.id !== "all" && hasKeyword ? (
                <span className="text-xs text-[color:var(--text-muted)]">
                  {matchedCounts[item.id]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-6 flex-1 overflow-y-auto">
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
                  className="flex items-center gap-2 rounded-[14px] border border-black/6 bg-white px-3 py-2.5"
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
            <div className="mt-3 rounded-[16px] border border-black/6 bg-white px-3 py-4 text-xs leading-6 text-[color:var(--text-muted)]">
              还没有最近搜索，桌面端会把你真正使用过的关键词放在这里。
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col border-r border-black/6 bg-[#f6f6f6]">
        <div className="border-b border-black/6 bg-[#fbfbfb] px-5 py-4">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitSearch(searchText);
            }}
          >
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
            />
            <input
              ref={inputRef}
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索聊天记录、联系人、公众号、朋友圈和广场动态"
              className="h-12 w-full rounded-[18px] border border-black/6 bg-white pl-11 pr-20 text-sm text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--text-dim)] focus:border-black/10"
            />
            {searchText ? (
              <button
                type="button"
                onClick={onClearKeyword}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[color:var(--text-muted)]"
              >
                清空
              </button>
            ) : null}
          </form>
          <div className="mt-3 text-xs leading-6 text-[color:var(--text-muted)]">
            {hasKeyword
              ? `关键词“${searchText.trim()}”当前命中 ${visibleResults.length} 条结果。`
              : "输入关键词后会同时检索会话、全局聊天记录、联系人、公众号和内容流。"}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? <LoadingBlock label="正在准备桌面搜索索引..." /> : null}
          {error ? <ErrorBlock message={error} /> : null}

          {!loading && !error && hasKeyword && searchingMessages ? (
            <InlineNotice tone="info">
              正在补全所有会话的聊天记录索引，消息结果会继续刷新。
            </InlineNotice>
          ) : null}

          {!loading && !error && !hasKeyword ? (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-3">
                <QuickPanel
                  icon={MessageSquareText}
                  title="聊天记录"
                  description="支持搜会话标题、群聊名称和历史消息正文。"
                />
                <QuickPanel
                  icon={UsersRound}
                  title="联系人"
                  description="支持搜备注名、角色名、地区、来源和标签。"
                />
                <QuickPanel
                  icon={Newspaper}
                  title="内容流"
                  description="支持搜朋友圈、广场动态和公众号最近内容。"
                />
              </div>
              <EmptyState
                title="输入关键词开始搜索"
                description="桌面端搜一搜已经接入全局聊天记录索引，首条消息命中也能找到。"
              />
            </div>
          ) : null}

          {!loading && !error && hasKeyword && !visibleResults.length ? (
            <EmptyState
              title="没有找到匹配结果"
              description="换个关键词，或者切换左侧分类后再试。"
            />
          ) : null}

          {!loading && !error && hasKeyword ? (
            activeCategory === "all" ? (
              <div className="space-y-6">
                {groupedResults.map((section) => (
                  <section key={section.category} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {section.label}
                      </div>
                      <div className="text-xs text-[color:var(--text-muted)]">
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
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {searchCategoryTitles[activeCategory]} ·{" "}
                  {visibleResults.length} 条
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
      </section>

      <aside className="flex w-[300px] shrink-0 flex-col bg-[#f3f3f3] p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
          <Sparkles size={16} className="text-[#15803d]" />
          <span>搜索概览</span>
        </div>

        <div className="mt-4 grid gap-3">
          <ScopeCard label="会话" value={`${scopeCounts.conversations}`} />
          <ScopeCard label="联系人" value={`${scopeCounts.contacts}`} />
          <ScopeCard label="公众号" value={`${scopeCounts.officialAccounts}`} />
          <ScopeCard label="朋友圈" value={`${scopeCounts.moments}`} />
          <ScopeCard label="广场动态" value={`${scopeCounts.feed}`} />
        </div>

        <div className="mt-6 text-sm font-medium text-[color:var(--text-primary)]">
          搜索提示
        </div>
        <div className="mt-3 space-y-3">
          {searchTips.map((item) => (
            <div
              key={item}
              className="rounded-[18px] border border-black/6 bg-white px-4 py-3 text-xs leading-6 text-[color:var(--text-secondary)]"
            >
              {item}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ScopeCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-black/6 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function QuickPanel({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof Search;
  title: string;
}) {
  return (
    <div className="rounded-[24px] border border-black/6 bg-white px-4 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#eef7f0] text-[#15803d]">
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
