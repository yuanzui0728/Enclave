import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
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
import { InlineNotice, cn } from "@yinjie/ui";
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
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-canvas)]">
      <div className="sticky top-0 z-20 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-2.5 pt-1.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            aria-label="返回"
          >
            <ArrowLeft size={17} />
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
              className="pointer-events-none absolute left-3 top-1/2 size-[14px] -translate-y-1/2 text-[color:var(--text-dim)]"
            />
            <input
              ref={inputRef}
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索聊天记录、联系人、收藏、公众号和小程序"
              className="h-9 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] pl-9 pr-11 text-[13px] text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.18)] focus:bg-white"
            />
            {searchText ? (
              <button
                type="button"
                onClick={onClearKeyword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--text-muted)]"
              >
                清空
              </button>
            ) : null}
          </form>
        </div>

        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {searchCategoryLabels.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveCategory(item.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                activeCategory === item.id
                  ? "bg-[#07c160] text-white"
                  : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-secondary)]",
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
        {loading ? (
          <MobileSearchStatusCard
            badge="读取中"
            title="正在准备搜一搜"
            description="稍等一下，正在整理最近记录和可搜索范围。"
            tone="loading"
          />
        ) : null}
        {error ? (
          <MobileSearchStatusCard
            badge="读取失败"
            title="搜一搜暂时不可用"
            description={error}
            tone="danger"
            action={
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-8 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px] text-[color:var(--text-primary)]"
              >
                返回上一页
              </button>
            }
          />
        ) : null}

        {!loading && !error && !hasKeyword ? (
          <div className="space-y-4">
            <section className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                  最近搜索
                </div>
                {history.length ? (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="text-[11px] text-[color:var(--text-muted)]"
                  >
                    清空
                  </button>
                ) : null}
              </div>

              {history.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {history.map((item) => (
                    <div
                      key={item.keyword}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] px-3 py-1.5 text-[11px] text-[color:var(--text-secondary)]"
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
                <div className="mt-2.5 text-[11px] leading-[1.35rem] text-[color:var(--text-muted)]">
                  还没有搜索记录，输入关键词后会保存在这里。
                </div>
              )}
            </section>

            <section className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
              {quickScopeCards.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      setActiveCategory(item.key as SearchCategory)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                      "transition-colors hover:bg-[color:var(--surface-card-hover)]",
                      item.key !== quickScopeCards[0]!.key
                        ? "border-t border-[color:var(--border-faint)]"
                        : undefined,
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]",
                        item.iconClassName,
                      )}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                        {item.title}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5">
              <div className="flex items-center gap-1.5 text-[14px] font-medium text-[color:var(--text-primary)]">
                <Sparkles size={15} className="text-[#15803d]" />
                <span>当前可搜索范围</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-[11px] text-[color:var(--text-secondary)]">
                <ScopeStat
                  label="会话"
                  value={`${scopeCounts.conversations}`}
                />
                <ScopeStat label="联系人" value={`${scopeCounts.contacts}`} />
                <ScopeStat label="收藏" value={`${scopeCounts.favorites}`} />
                <ScopeStat
                  label="公众号"
                  value={`${scopeCounts.officialAccounts}`}
                />
                <ScopeStat
                  label="小程序"
                  value={`${scopeCounts.miniPrograms}`}
                />
                <ScopeStat label="朋友圈" value={`${scopeCounts.moments}`} />
                <ScopeStat label="广场动态" value={`${scopeCounts.feed}`} />
              </div>
            </section>
          </div>
        ) : null}

        {!loading && !error && hasKeyword && searchingMessages ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone="info"
          >
            正在补全全局聊天记录索引，消息结果会继续增加。
          </InlineNotice>
        ) : null}

        {!loading && !error && hasKeyword && !visibleResults.length ? (
          <div className="pt-3">
            <MobileSearchStatusCard
              badge="无结果"
              title="没有找到相关内容"
              description="换个关键词，或者切到别的分类试试。"
            />
          </div>
        ) : null}

        {!loading && !error && hasKeyword ? (
          activeCategory === "all" ? (
            <div className="space-y-4">
              {groupedResults.map((section) => {
                const expanded = Boolean(expandedSections[section.category]);
                const sectionResults = expanded
                  ? section.results
                  : section.results.slice(0, 3);

                return (
                  <section key={section.category} className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
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
                          className="text-[11px] text-[#15803d]"
                        >
                          {expanded
                            ? "收起"
                            : `查看更多 ${section.results.length}`}
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
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
            <div className="space-y-2.5">
              <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
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

function MobileSearchStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}

function ScopeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2.5">
      <div>{label}</div>
      <div className="mt-1 text-[13px] font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
