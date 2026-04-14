import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Blocks,
  Bookmark,
  Clock3,
  MessageSquareText,
  Newspaper,
  Search,
  Star,
  UsersRound,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { EmptyState } from "../../components/empty-state";
import { ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { type DesktopSearchQuickLink } from "./desktop-search-quick-links";
import { renderHighlightedText } from "./search-utils";
import {
  searchCategoryLabels,
  searchCategoryTitles,
  type SearchCategory,
  type SearchHistoryItem,
  type SearchMatchCounts,
  type SearchMessageGroup,
  type SearchOfficialAccountGroup,
  type SearchResultCategory,
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
  messageGroups: SearchMessageGroup[];
  officialAccountGroups: SearchOfficialAccountGroup[];
  onApplyHistory: (keyword: string) => void;
  onClearHistory: () => void;
  onClearKeyword: () => void;
  onCommitSearch: (keyword: string) => void;
  onOpenQuickLink: (item: DesktopSearchQuickLink) => void;
  onOpenResult: (item: SearchResultItem) => void;
  onRemoveHistory: (keyword: string) => void;
  recentFavorites: DesktopSearchQuickLink[];
  recentMiniPrograms: DesktopSearchQuickLink[];
  scopeCounts: SearchScopeCounts;
  searchText: string;
  searchingMessages: boolean;
  setActiveCategory: Dispatch<SetStateAction<SearchCategory>>;
  setSearchText: Dispatch<SetStateAction<string>>;
  visibleResults: SearchResultItem[];
};

const landingScopeCards = [
  {
    id: "messages" as const,
    icon: MessageSquareText,
    title: "聊天记录",
    description: "优先定位会话和消息片段。",
  },
  {
    id: "contacts" as const,
    icon: UsersRound,
    title: "联系人",
    description: "支持备注名、角色名和标签。",
  },
  {
    id: "favorites" as const,
    icon: Bookmark,
    title: "收藏",
    description: "聚合消息、笔记和内容收藏。",
  },
  {
    id: "officialAccounts" as const,
    icon: Newspaper,
    title: "公众号",
    description: "支持账号资料和文章命中。",
  },
  {
    id: "miniPrograms" as const,
    icon: Blocks,
    title: "小程序",
    description: "覆盖最近使用和目录里的入口。",
  },
  {
    id: "moments" as const,
    icon: Star,
    title: "朋友圈",
    description: "支持好友动态和评论命中。",
  },
  {
    id: "feed" as const,
    icon: Blocks,
    title: "内容流",
    description: "继续承接广场动态结果。",
  },
];

export function DesktopSearchWorkspace({
  activeCategory,
  error,
  groupedResults,
  hasKeyword,
  history,
  loading,
  matchedCounts,
  messageGroups,
  officialAccountGroups,
  onApplyHistory,
  onClearHistory,
  onClearKeyword,
  onCommitSearch,
  onOpenQuickLink,
  onOpenResult,
  onRemoveHistory,
  recentFavorites,
  recentMiniPrograms,
  scopeCounts,
  searchText,
  searchingMessages,
  setActiveCategory,
  setSearchText,
  visibleResults,
}: DesktopSearchWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedKeyword = searchText.trim().toLowerCase();
  const groupedMessageHeaderIds = useMemo(
    () => new Set(messageGroups.map((item) => item.header.id)),
    [messageGroups],
  );
  const messageConversationOnlyResults = useMemo(
    () =>
      visibleResults.filter(
        (item) =>
          item.category === "messages" &&
          item.id.startsWith("conversation-") &&
          !groupedMessageHeaderIds.has(item.id),
      ),
    [groupedMessageHeaderIds, visibleResults],
  );
  const groupedOfficialAccountHeaderIds = useMemo(
    () => new Set(officialAccountGroups.map((item) => item.header.id)),
    [officialAccountGroups],
  );
  const officialAccountOnlyResults = useMemo(
    () =>
      visibleResults.filter(
        (item) =>
          item.category === "officialAccounts" &&
          item.id.startsWith("official-") &&
          !item.id.startsWith("official-article:") &&
          !groupedOfficialAccountHeaderIds.has(item.id),
      ),
    [groupedOfficialAccountHeaderIds, visibleResults],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const categorySummary = useMemo(() => {
    if (!hasKeyword) {
      return "优先直达联系人、会话、收藏和最近使用的小程序。";
    }

    if (activeCategory === "all") {
      return `关键词“${searchText.trim()}”命中 ${visibleResults.length} 条内容结果。`;
    }

    return `当前查看 ${searchCategoryTitles[activeCategory]}，共 ${visibleResults.length} 条结果。`;
  }, [activeCategory, hasKeyword, searchText, visibleResults.length]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-app)]">
      <header className="shrink-0 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.92)] backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1160px] px-6 py-5">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            搜一搜
          </div>

          <form
            className="relative mt-3"
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
              placeholder="搜索聊天记录、联系人、公众号、收藏和小程序"
              className="h-12 w-full rounded-[15px] border border-[color:var(--border-faint)] bg-white pl-11 pr-20 text-sm text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.4)] focus:shadow-[0_0_0_4px_rgba(7,193,96,0.08)]"
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

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {searchCategoryLabels.map((item) => {
              const countLabel = !hasKeyword
                ? null
                : item.id === "all"
                  ? `${visibleResults.length}`
                  : `${matchedCounts[item.id]}`;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveCategory(item.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition",
                    activeCategory === item.id
                      ? "border-[rgba(7,193,96,0.20)] bg-[rgba(7,193,96,0.10)] text-[color:var(--text-primary)]"
                      : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <span>{item.label}</span>
                  {countLabel ? (
                    <span className="rounded-full bg-[color:var(--surface-console)] px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]">
                      {countLabel}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 text-xs text-[color:var(--text-muted)]">
            {categorySummary}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1160px] min-h-full flex-col px-6 py-6">
          {loading ? <LoadingBlock label="正在准备桌面搜索索引..." /> : null}
          {error ? <ErrorBlock message={error} /> : null}

          {!loading && !error && hasKeyword && searchingMessages ? (
            <div className="mb-4">
              <InlineNotice tone="info">
                聊天记录结果还在继续补全，稍后会自动刷新更多命中。
              </InlineNotice>
            </div>
          ) : null}

          {!loading && !error && !hasKeyword ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {landingScopeCards.map((item) => {
                  const Icon = item.icon;
                  const count =
                    item.id === "messages"
                      ? scopeCounts.conversations
                      : item.id === "contacts"
                        ? scopeCounts.contacts
                        : item.id === "favorites"
                          ? scopeCounts.favorites
                        : item.id === "officialAccounts"
                          ? scopeCounts.officialAccounts
                          : item.id === "miniPrograms"
                            ? scopeCounts.miniPrograms
                          : item.id === "moments"
                            ? scopeCounts.moments
                            : scopeCounts.feed;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveCategory(item.id);
                        inputRef.current?.focus();
                      }}
                      className="rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-4 text-left transition hover:border-[rgba(7,193,96,0.16)] hover:bg-[color:var(--surface-console)]"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
                        <Icon size={18} />
                      </div>
                      <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
                        {item.title}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        当前覆盖 {count} 项
                      </div>
                      <div className="mt-3 text-xs leading-6 text-[color:var(--text-secondary)]">
                        {item.description}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        最近搜索
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        空态先展示你最近真正用过的关键词。
                      </div>
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
                    <div className="mt-4 space-y-2">
                      {history.map((item) => (
                        <div
                          key={item.keyword}
                          className="flex items-center gap-2 rounded-[14px] bg-[color:var(--surface-console)] px-3 py-2.5"
                        >
                          <button
                            type="button"
                            onClick={() => onApplyHistory(item.keyword)}
                            className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <Clock3
                              size={14}
                              className="shrink-0 text-[color:var(--text-dim)]"
                            />
                            <span className="truncate text-sm text-[color:var(--text-secondary)]">
                              {item.keyword}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveHistory(item.keyword)}
                            className="text-[11px] text-[color:var(--text-dim)]"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-6">
                      <EmptyState
                        title="还没有最近搜索"
                        description="从聊天、通讯录或左侧导航进入搜一搜后，这里会开始积累关键词。"
                      />
                    </div>
                  )}
                </section>

                <div className="space-y-4">
                  <DesktopQuickLinksPanel
                    title="最近使用的小程序"
                    description="桌面端先把最近打开的小程序放进搜一搜首页，方便从主搜索框直达。"
                    emptyText="打开过的小程序会先沉淀到这里。"
                    items={recentMiniPrograms}
                    onOpen={onOpenQuickLink}
                  />
                  <DesktopQuickLinksPanel
                    title="最近收藏"
                    description="高频回看的收藏会优先出现在桌面搜一搜首页。"
                    emptyText="收藏过内容后，这里会出现最近回访入口。"
                    items={recentFavorites}
                    onOpen={onOpenQuickLink}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !error && hasKeyword && !visibleResults.length ? (
            <div className="rounded-[20px] border border-dashed border-[color:var(--border-faint)] bg-white/92 px-6 py-10">
              <EmptyState
                title="没有找到匹配结果"
                description="换个关键词试试，或者切换到更具体的分类后继续找。"
              />
            </div>
          ) : null}

          {!loading && !error && hasKeyword ? (
            activeCategory === "all" ? (
              <div className="space-y-6">
                {groupedResults.map((section) => {
                  const previewContentResults =
                    isDesktopContentCategory(section.category)
                      ? section.results.slice(0, 4)
                      : [];
                  const previewMessageGroups =
                    section.category === "messages"
                      ? messageGroups.slice(0, 3)
                      : [];
                  const previewMessageConversations =
                    section.category === "messages"
                      ? messageConversationOnlyResults.slice(
                          0,
                          Math.max(0, 5 - previewMessageGroups.length),
                        )
                      : [];
                  const previewOfficialAccountGroups =
                    section.category === "officialAccounts"
                      ? officialAccountGroups.slice(0, 3)
                      : [];
                  const previewOfficialAccounts =
                    section.category === "officialAccounts"
                      ? officialAccountOnlyResults.slice(
                          0,
                          Math.max(0, 5 - previewOfficialAccountGroups.length),
                        )
                      : [];
                  const previewResults = section.results.slice(0, 6);
                  const hasMore =
                    section.category === "messages"
                      ? messageGroups.length > previewMessageGroups.length ||
                        messageConversationOnlyResults.length >
                          previewMessageConversations.length
                      : section.category === "officialAccounts"
                        ? officialAccountGroups.length >
                            previewOfficialAccountGroups.length ||
                          officialAccountOnlyResults.length >
                            previewOfficialAccounts.length
                      : isDesktopContentCategory(section.category)
                        ? section.results.length > previewContentResults.length
                      : section.results.length > previewResults.length;

                  return (
                    <section
                      key={section.category}
                      className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-[color:var(--text-primary)]">
                            {section.label}
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                            共 {section.results.length} 条命中
                          </div>
                        </div>
                        {hasMore ? (
                          <button
                            type="button"
                            onClick={() => setActiveCategory(section.category)}
                            className="text-xs text-[color:var(--brand-primary)]"
                          >
                            查看全部
                          </button>
                        ) : null}
                      </div>

                      {section.category === "messages" ? (
                        <DesktopSearchMessageResults
                          conversationResults={previewMessageConversations}
                          keyword={normalizedKeyword}
                          messageGroups={previewMessageGroups}
                          onOpen={onOpenResult}
                        />
                      ) : section.category === "officialAccounts" ? (
                        <DesktopSearchOfficialAccountResults
                          accountResults={previewOfficialAccounts}
                          keyword={normalizedKeyword}
                          officialAccountGroups={previewOfficialAccountGroups}
                          onOpen={onOpenResult}
                        />
                      ) : isDesktopContentCategory(section.category) ? (
                        <DesktopSearchContentResults
                          items={previewContentResults}
                          keyword={normalizedKeyword}
                          onOpen={onOpenResult}
                        />
                      ) : (
                        <div className="mt-4 divide-y divide-[color:var(--border-faint)]">
                          {previewResults.map((item) => (
                            <DesktopSearchResultRow
                              key={item.id}
                              item={item}
                              keyword={normalizedKeyword}
                              onOpen={onOpenResult}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">
                      {searchCategoryTitles[activeCategory]}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      共 {visibleResults.length} 条命中
                    </div>
                  </div>
                </div>

                {activeCategory === "messages" ? (
                  <DesktopSearchMessageResults
                    conversationResults={messageConversationOnlyResults}
                    keyword={normalizedKeyword}
                    messageGroups={messageGroups}
                    onOpen={onOpenResult}
                  />
                ) : activeCategory === "officialAccounts" ? (
                  <DesktopSearchOfficialAccountResults
                    accountResults={officialAccountOnlyResults}
                    keyword={normalizedKeyword}
                    officialAccountGroups={officialAccountGroups}
                    onOpen={onOpenResult}
                  />
                ) : isDesktopContentCategory(activeCategory) ? (
                  <DesktopSearchContentResults
                    items={visibleResults}
                    keyword={normalizedKeyword}
                    onOpen={onOpenResult}
                  />
                ) : (
                  <div className="mt-4 divide-y divide-[color:var(--border-faint)]">
                    {visibleResults.map((item) => (
                      <DesktopSearchResultRow
                        key={item.id}
                        item={item}
                        keyword={normalizedKeyword}
                        onOpen={onOpenResult}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DesktopQuickLinksPanel({
  description,
  emptyText,
  items,
  onOpen,
  title,
}: {
  description: string;
  emptyText: string;
  items: DesktopSearchQuickLink[];
  onOpen: (item: DesktopSearchQuickLink) => void;
  title: string;
}) {
  return (
    <section className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5">
      <div>
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {description}
          </div>
        ) : null}
      </div>

      {items.length ? (
        <div className="mt-4 divide-y divide-[color:var(--border-faint)]">
          {items.map((item) => (
            <DesktopQuickLinkRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
      ) : emptyText ? (
        <div className="mt-4 rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-6 text-xs leading-6 text-[color:var(--text-muted)]">
          {emptyText}
        </div>
      ) : null}
    </section>
  );
}

function DesktopSearchMessageResults({
  conversationResults,
  keyword,
  messageGroups,
  onOpen,
}: {
  conversationResults: SearchResultItem[];
  keyword: string;
  messageGroups: SearchMessageGroup[];
  onOpen: (item: SearchResultItem) => void;
}) {
  if (!messageGroups.length && !conversationResults.length) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {messageGroups.map((group) => (
        <DesktopSearchMessageGroupCard
          key={group.id}
          group={group}
          keyword={keyword}
          onOpen={onOpen}
        />
      ))}

      {conversationResults.length ? (
        <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4">
          <div className="text-xs font-medium text-[color:var(--text-muted)]">
            会话命中
          </div>
          <div className="mt-3 divide-y divide-[color:var(--border-faint)]">
            {conversationResults.map((item) => (
              <DesktopSearchResultRow
                key={item.id}
                item={item}
                keyword={keyword}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DesktopSearchOfficialAccountResults({
  accountResults,
  keyword,
  officialAccountGroups,
  onOpen,
}: {
  accountResults: SearchResultItem[];
  keyword: string;
  officialAccountGroups: SearchOfficialAccountGroup[];
  onOpen: (item: SearchResultItem) => void;
}) {
  if (!officialAccountGroups.length && !accountResults.length) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {officialAccountGroups.map((group) => (
        <DesktopSearchOfficialAccountGroupCard
          key={group.id}
          group={group}
          keyword={keyword}
          onOpen={onOpen}
        />
      ))}

      {accountResults.length ? (
        <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4">
          <div className="text-xs font-medium text-[color:var(--text-muted)]">
            账号命中
          </div>
          <div className="mt-3 divide-y divide-[color:var(--border-faint)]">
            {accountResults.map((item) => (
              <DesktopSearchResultRow
                key={item.id}
                item={item}
                keyword={keyword}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DesktopSearchContentResults({
  items,
  keyword,
  onOpen,
}: {
  items: SearchResultItem[];
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <DesktopSearchContentCard
          key={item.id}
          item={item}
          keyword={keyword}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function DesktopQuickLinkRow({
  item,
  onOpen,
}: {
  item: DesktopSearchQuickLink;
  onOpen: (item: DesktopSearchQuickLink) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full items-center gap-3 px-0 py-3 text-left transition first:pt-0 last:pb-0 hover:bg-[color:var(--surface-console)]"
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {item.title}
          </div>
          <span className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
            {item.badge}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
          {item.meta}
        </div>
        <div className="mt-1 truncate text-xs text-[color:var(--text-secondary)]">
          {item.description}
        </div>
      </div>
    </button>
  );
}

function DesktopSearchMessageGroupCard({
  group,
  keyword,
  onOpen,
}: {
  group: SearchMessageGroup;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]">
      <button
        type="button"
        onClick={() => onOpen(group.header)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white"
      >
        <AvatarChip
          name={group.header.avatarName ?? group.header.title}
          src={group.header.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(group.header.title, keyword)}
            </div>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
              {group.header.badge}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
            {renderHighlightedText(group.header.meta, keyword)}
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
          {group.totalHits} 条相关记录
        </div>
      </button>

      <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
        <div className="space-y-2">
          {group.messages.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              className="flex w-full items-start gap-3 rounded-[14px] bg-white px-3 py-2.5 text-left transition hover:bg-[rgba(7,193,96,0.06)]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
                <MessageSquareText size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {renderHighlightedText(item.description, keyword)}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {renderHighlightedText(item.meta, keyword)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DesktopSearchOfficialAccountGroupCard({
  group,
  keyword,
  onOpen,
}: {
  group: SearchOfficialAccountGroup;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]">
      <button
        type="button"
        onClick={() => onOpen(group.header)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white"
      >
        <AvatarChip
          name={group.header.avatarName ?? group.header.title}
          src={group.header.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(group.header.title, keyword)}
            </div>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
              {group.header.badge}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
            {renderHighlightedText(group.header.meta, keyword)}
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
            {renderHighlightedText(group.header.description, keyword)}
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] text-[color:var(--brand-primary)]">
          {group.totalHits} 篇相关文章
        </div>
      </button>

      <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
        <div className="space-y-2">
          {group.articles.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              className="flex w-full items-start gap-3 rounded-[14px] bg-white px-3 py-2.5 text-left transition hover:bg-[rgba(7,193,96,0.06)]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
                <Newspaper size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                  {renderHighlightedText(item.title, keyword)}
                </div>
                <div className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  {renderHighlightedText(item.description, keyword)}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {renderHighlightedText(item.meta, keyword)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DesktopSearchContentCard({
  item,
  keyword,
  onOpen,
}: {
  item: SearchResultItem;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  const toneClassName =
    item.category === "moments"
      ? "border-[#dce8d7] bg-[linear-gradient(180deg,#f9fcf7,white)]"
      : "border-[#dce5de] bg-[linear-gradient(180deg,#f6faf8,white)]";
  const badgeClassName =
    item.category === "moments"
      ? "bg-[rgba(134,181,96,0.12)] text-[#587d38]"
      : "bg-[rgba(15,23,42,0.08)] text-[#3c6a53]";
  const actionLabel =
    item.category === "moments" ? "打开朋友圈动态" : "打开广场动态";

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "overflow-hidden rounded-[20px] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(15,23,42,0.08)]",
        toneClassName,
      )}
    >
      <div className="flex items-center gap-3">
        <AvatarChip
          name={item.avatarName ?? item.title}
          src={item.avatarSrc}
          size="wechat"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {renderHighlightedText(item.title, keyword)}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                badgeClassName,
              )}
            >
              {item.badge}
            </span>
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {renderHighlightedText(item.meta, keyword)}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[16px] bg-[color:var(--surface-console)] px-4 py-4">
        <div className="line-clamp-5 text-sm leading-7 text-[color:var(--text-secondary)]">
          {renderHighlightedText(item.description, keyword)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[color:var(--text-muted)]">
        <span>{actionLabel}</span>
        <span>查看原内容</span>
      </div>
    </button>
  );
}

function isDesktopContentCategory(
  category: SearchCategory | SearchResultCategory,
) {
  return category === "moments" || category === "feed";
}

function DesktopSearchResultRow({
  item,
  keyword,
  onOpen,
}: {
  item: SearchResultItem;
  keyword: string;
  onOpen: (item: SearchResultItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full items-center gap-3 px-0 py-3 text-left transition first:pt-0 last:pb-0 hover:bg-[color:var(--surface-console)]"
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {renderHighlightedText(item.title, keyword)}
          </div>
          <span className="rounded-full bg-[color:var(--surface-console)] px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
            {item.badge}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
          {renderHighlightedText(item.meta, keyword)}
        </div>
        <div className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
          {renderHighlightedText(item.description, keyword)}
        </div>
      </div>
    </button>
  );
}
