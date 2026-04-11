import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  Clock3,
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

type MobileSearchWorkspaceProps = {
  activeCategory: SearchCategory;
  error: string | null;
  groupedResults: SearchResultSection[];
  hasKeyword: boolean;
  history: SearchHistoryItem[];
  loading: boolean;
  matchedCounts: SearchMatchCounts;
  onApplyHistory: (keyword: string) => void;
  onBack: () => void;
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

const quickScopeCards = [
  {
    key: "messages",
    title: "聊天记录",
    description: "搜会话、群聊和历史消息",
    icon: Search,
    iconClassName: "bg-[rgba(7,193,96,0.12)] text-[#07c160]",
  },
  {
    key: "contacts",
    title: "联系人",
    description: "搜好友、备注和世界角色",
    icon: UsersRound,
    iconClassName: "bg-[rgba(59,130,246,0.12)] text-[#2563eb]",
  },
  {
    key: "feed",
    title: "内容流",
    description: "搜朋友圈、广场动态和公众号",
    icon: Newspaper,
    iconClassName: "bg-[rgba(15,23,42,0.08)] text-[color:var(--text-primary)]",
  },
];

export function MobileSearchWorkspace({
  activeCategory,
  error,
  groupedResults,
  hasKeyword,
  history,
  loading,
  matchedCounts,
  onApplyHistory,
  onBack,
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
}: MobileSearchWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [expandedSections, setExpandedSections] = useState<
    Partial<Record<SearchCategory, boolean>>
  >({});

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f5f5f5]">
      <div className="sticky top-0 z-20 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-3 pt-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-transparent text-[color:var(--text-primary)]"
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </button>

          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitSearch(searchText);
            }}
          >
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
            />
            <input
              ref={inputRef}
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索聊天记录、联系人、公众号和内容"
              className="h-11 w-full rounded-[14px] border border-black/5 bg-white pl-10 pr-12 text-sm text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.18)] focus:bg-white"
            />
            {searchText ? (
              <button
                type="button"
                onClick={onClearKeyword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--text-muted)]"
              >
                清空
              </button>
            ) : null}
          </form>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {searchCategoryLabels.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveCategory(item.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-xs font-medium transition",
                activeCategory === item.id
                  ? "bg-[color:var(--brand-primary)] text-white"
                  : "border border-black/5 bg-white text-[color:var(--text-secondary)]",
              )}
            >
              {item.label}
              {item.id !== "all" && hasKeyword
                ? ` ${matchedCounts[item.id]}`
                : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {loading ? <LoadingBlock label="正在准备搜一搜..." /> : null}
        {error ? <ErrorBlock message={error} /> : null}

        {!loading && !error && !hasKeyword ? (
          <div className="space-y-5">
            <section className="rounded-[22px] border border-black/5 bg-white p-4 shadow-none">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {history.map((item) => (
                    <div
                      key={item.keyword}
                      className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-[#f5f5f5] px-3 py-2 text-xs text-[color:var(--text-secondary)]"
                    >
                      <button
                        type="button"
                        onClick={() => onApplyHistory(item.keyword)}
                        className="inline-flex items-center gap-1"
                      >
                        <Clock3 size={12} />
                        <span>{item.keyword}</span>
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
                <div className="mt-3 text-xs leading-6 text-[color:var(--text-muted)]">
                  还没有搜索记录，输入关键词后会保存在这里。
                </div>
              )}
            </section>

            <section className="grid gap-3">
              {quickScopeCards.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      setActiveCategory(item.key as SearchCategory)
                    }
                    className="flex items-center gap-3 rounded-[22px] border border-black/5 bg-white px-4 py-4 text-left shadow-none"
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px]",
                        item.iconClassName,
                      )}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {item.title}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="rounded-[22px] border border-black/5 bg-white p-4 shadow-none">
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                <Sparkles
                  size={16}
                  className="text-[color:var(--brand-primary)]"
                />
                <span>当前可搜索范围</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[color:var(--text-secondary)]">
                <ScopeStat
                  label="会话"
                  value={`${scopeCounts.conversations}`}
                />
                <ScopeStat label="联系人" value={`${scopeCounts.contacts}`} />
                <ScopeStat
                  label="公众号"
                  value={`${scopeCounts.officialAccounts}`}
                />
                <ScopeStat label="朋友圈" value={`${scopeCounts.moments}`} />
                <ScopeStat label="广场动态" value={`${scopeCounts.feed}`} />
              </div>
            </section>
          </div>
        ) : null}

        {!loading && !error && hasKeyword && searchingMessages ? (
          <InlineNotice tone="info">
            正在补全全局聊天记录索引，消息结果会继续增加。
          </InlineNotice>
        ) : null}

        {!loading && !error && hasKeyword && !visibleResults.length ? (
          <div className="pt-10">
            <EmptyState
              title="没有找到相关内容"
              description="换个关键词，或者切到别的分类试试。"
            />
          </div>
        ) : null}

        {!loading && !error && hasKeyword ? (
          activeCategory === "all" ? (
            <div className="space-y-5">
              {groupedResults.map((section) => {
                const expanded = Boolean(expandedSections[section.category]);
                const sectionResults = expanded
                  ? section.results
                  : section.results.slice(0, 3);

                return (
                  <section key={section.category} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {section.label}
                      </div>
                      {section.results.length > 3 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSections((current) => ({
                              ...current,
                              [section.category]: !current[section.category],
                            }))
                          }
                          className="text-xs text-[color:var(--brand-primary)]"
                        >
                          {expanded
                            ? "收起"
                            : `查看更多 ${section.results.length}`}
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {sectionResults.map((item) => (
                        <SearchResultCard
                          key={item.id}
                          item={item}
                          keyword={searchText.trim().toLowerCase()}
                          layout="mobile"
                          onOpen={onOpenResult}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {searchCategoryTitles[activeCategory]} · {visibleResults.length}{" "}
                条
              </div>
              {visibleResults.map((item) => (
                <SearchResultCard
                  key={item.id}
                  item={item}
                  keyword={searchText.trim().toLowerCase()}
                  layout="mobile"
                  onOpen={onOpenResult}
                />
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function ScopeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-[rgba(255,248,239,0.82)] px-3 py-3">
      <div>{label}</div>
      <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
