import {
  useEffect,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  ArrowLeft,
  Bookmark,
  ChevronRight,
  Clock3,
  Megaphone,
  Newspaper,
  Search,
  Sparkles,
  Sprout,
  UsersRound,
} from "lucide-react";
import { InlineNotice, cn } from "@yinjie/ui";
import { SearchResultCard } from "./search-result-card";
import {
  searchCategoryLabelDescriptors,
  useSearchCategoryTitle,
  type SearchCategory,
  type SearchHistoryItem,
  type SearchMatchCounts,
  type SearchResultCategory,
  type SearchResultItem,
  type SearchResultSection,
  type SearchScopeCounts,
} from "./search-types";

type MobileSearchWorkspaceProps = {
  activeCategory: SearchCategory;
  error: string | null;
  groupedResults: SearchResultSection[];
  hasKeyword: boolean;
  // 单独传一份"卡片高亮"用的 keyword：用 search-page 那边 useDeferredValue 过的
  // effective 值，跟实际过滤 / 渲染走的 keyword 对得上；不要再把 searchText.trim()
  // 当 keyword，那样快速连打时卡片文本和 keyword 不同步，<mark> 高亮会瞬时消失。
  highlightKeyword: string;
  history: SearchHistoryItem[];
  loading: boolean;
  matchedCounts: SearchMatchCounts;
  onApplyHistory: (keyword: string) => void;
  onBack: () => void;
  onClearHistory: () => void;
  onClearKeyword: () => void;
  onCommitSearch: (keyword: string) => void;
  onOpenResult: (item: SearchResultItem) => void;
  onRetryLoad: () => void;
  onRemoveHistory: (keyword: string) => void;
  scopeCounts: SearchScopeCounts;
  searchText: string;
  searchingMessages: boolean;
  setActiveCategory: Dispatch<SetStateAction<SearchCategory>>;
  setSearchText: Dispatch<SetStateAction<string>>;
  visibleResults: SearchResultItem[];
};

// 顺序与 allViewCategories 对齐——「全部」视图里展示的分组顺序一致，
// chip / 卡片 / 「查看更多」之间不会出现"卡片说有内容、chip 里看不到"
// 的错位。miniPrograms 当前是 ComingSoonOverlay，不进 quickScopeCards。
const quickScopeCards: Array<{
  key: SearchCategory;
  title: MessageDescriptor;
  description: MessageDescriptor;
  icon: typeof Search;
  iconClassName: string;
}> = [
  {
    key: "messages",
    title: msg`聊天记录`,
    description: msg`搜会话、群聊和历史消息`,
    icon: Search,
    iconClassName: "bg-[rgba(7,193,96,0.12)] text-[#07c160]",
  },
  {
    key: "contacts",
    title: msg`联系人`,
    description: msg`搜好友、备注和世界角色`,
    icon: UsersRound,
    iconClassName: "bg-[rgba(59,130,246,0.12)] text-[#2563eb]",
  },
  {
    key: "officialAccounts",
    title: msg`公众号`,
    description: msg`搜账号资料和文章`,
    icon: Megaphone,
    iconClassName: "bg-[rgba(234,179,8,0.14)] text-[#9a6b12]",
  },
  {
    key: "favorites",
    title: msg`收藏`,
    description: msg`搜笔记、消息和内容收藏`,
    icon: Bookmark,
    iconClassName: "bg-[rgba(234,179,8,0.10)] text-[#9a6b12]",
  },
  {
    key: "moments",
    title: msg`朋友圈`,
    description: msg`搜好友动态、评论和点赞`,
    icon: Sprout,
    iconClassName: "bg-[rgba(34,197,94,0.12)] text-[#15803d]",
  },
  {
    key: "feed",
    title: msg`广场动态`,
    description: msg`搜广场里公开发布的内容`,
    icon: Newspaper,
    iconClassName: "bg-[rgba(15,23,42,0.08)] text-[color:var(--text-primary)]",
  },
];

export function MobileSearchWorkspace({
  activeCategory,
  error,
  groupedResults,
  hasKeyword,
  highlightKeyword,
  history,
  loading,
  matchedCounts,
  onApplyHistory,
  onBack,
  onClearHistory,
  onClearKeyword,
  onCommitSearch,
  onOpenResult,
  onRetryLoad,
  onRemoveHistory,
  scopeCounts,
  searchText,
  searchingMessages,
  setActiveCategory,
  setSearchText,
  visibleResults,
}: MobileSearchWorkspaceProps) {
  const t = useRuntimeTranslator();
  const getCategoryTitle = useSearchCategoryTitle();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Partial<Record<SearchCategory, HTMLButtonElement | null>>>({});

  // Mount autofocus 只在"用户主动进搜一搜准备开始打字"的初次入口生效——
  // 把输入框拨成激活态、立刻能输入。但用户点结果跳走再 back 回来时，URL hash
  // 里仍带 #q=...，组件 mount 时 searchText 已经有值；这种情况下用户的意图是
  // 继续浏览之前已经搜出来的卡片，不是接着打字。这时再 autofocus 反而把 iOS
  // 软键盘顶起来盖掉半屏结果，需要用户先 dismiss 才能滚动。
  useEffect(() => {
    if (searchText) {
      return;
    }
    inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 mount 决策一次
  }, []);

  // 切到非「全部」 chip——常见路径是点下面的 quickScopeCard / 「查看更多」——
  // chip 行不主动滚动，活动 chip 经常在右侧屏外，用户点完看不到 active chip，
  // 以为没生效。activeCategory 变化时把当前 active chip 滚到可视区，只滚 chip
  // 行自己（横向），不滚外层页面（纵向）。
  //
  // 用 getBoundingClientRect 拿屏幕坐标差：之前用 chip.offsetLeft 直接对比
  // container.scrollLeft，但 chip 的 offsetParent 是外层 sticky 顶栏（chipsRef
  // 容器没设 position:relative，offsetLeft 会回溯到下一个 positioned 祖先），
  // 实际拿到的是包含 sticky 顶栏 px-4 padding 的偏移量；和 container.scrollLeft
  // 不在同一原点，靠右的 chip 会被多 scroll 16+8px，靠左 chip 永远判不到"超出
  // 左边"分支。
  useEffect(() => {
    const chip = chipRefs.current[activeCategory];
    const container = chipsRef.current;
    if (!chip || !container) {
      return;
    }
    const chipRect = chip.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const chipLocalLeft = chipRect.left - containerRect.left + container.scrollLeft;
    const chipLocalRight = chipLocalLeft + chipRect.width;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (chipLocalLeft < viewLeft) {
      container.scrollTo({ left: Math.max(0, chipLocalLeft - 8), behavior: "smooth" });
    } else if (chipLocalRight > viewRight) {
      container.scrollTo({
        left: chipLocalRight - container.clientWidth + 8,
        behavior: "smooth",
      });
    }
  }, [activeCategory]);

  // 「全部」视图里展示的分组顺序：messages/contacts 最常用排前面，
  // officialAccounts/favorites 次之，moments/feed 是社交内容放后面。
  // miniPrograms 当前是 ComingSoonOverlay，不进「全部」；和 chip 一致。
  const allViewCategories: SearchResultCategory[] = [
    "messages",
    "contacts",
    "officialAccounts",
    "favorites",
    "moments",
    "feed",
  ];
  const sectionByCategory = new Map(
    groupedResults.map((section) => [section.category, section]),
  );
  const orderedAllSections: SearchResultSection[] = allViewCategories.flatMap(
    (category) => {
      const section = sectionByCategory.get(category);
      return section && section.results.length ? [section] : [];
    },
  );
  // 走查 R7：原本两处 SearchResultCard 的 prop 都是
  // `keyword={highlightKeyword.trim().toLowerCase()}` ——写在 .map 里，
  // 「全部」视图 ≈ 7 段 × 3 张卡 = 21 次 trim+toLowerCase / 渲染，单分类视图按
  // visibleResults.length 走（联系人 / 角色搜热门姓时常 50+）。highlightKeyword
  // 是组件外面 useDeferredValue 出来的字符串，trim/lowercase 结果在一次渲染内
  // 是常量，提到 map 外面一次性算。
  const normalizedHighlightKeyword = highlightKeyword.trim().toLowerCase();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-canvas)]">
      <div className="sticky top-0 z-20 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-2.5 pt-1.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
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
              placeholder={t(msg`搜索聊天、联系人、公众号、朋友圈和广场`)}
              // enterKeyHint="search": 手机软键盘 return 键显示放大镜图标，
              // 让用户一眼看出 enter 触发搜索（type="search" 自带的 WebKit
              // 原生 "×" 由 index.css 里的全局规则 appearance:none 抹掉，
              // 避免跟右侧自定义「清空」叠成两个清除控件）。autoCorrect /
              // autoCapitalize / spellCheck 关掉防止中文输入法被英文
              // autocorrect 抢词。
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
              // zoom-in。全局搜索是用户最常用的 entry，每次进来都 zoom 体验最差。
              className="h-9 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] pl-9 pr-11 text-[16px] text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.18)] focus:bg-white"
            />
            {searchText ? (
              <button
                type="button"
                // 在 pointerdown 阶段就阻止默认行为，避免 button 抢走焦点：
                // 之前点「清空」会把 activeElement 切到 body，iOS 上键盘随即
                // 收起，用户清完又得再点一次输入框才能继续输入。preventDefault
                // 阻止 focus 转移，input 保持聚焦、键盘不退。
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  onClearKeyword();
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--text-muted)]"
              >
                {t(msg`清空`)}
              </button>
            ) : null}
          </form>
        </div>

        <div
          ref={chipsRef}
          // chip 行 overflow-x-auto 在桌面 Chromium / Web embed 里会冒出 16px
          // 的横向滚动条（含 ← → 箭头），把"凹槽"叠在 chip 下面非常显眼，
          // 跟其它 mobile shell 里横向滑动的容器写法对齐：scrollbar-width:none
          // + ::-webkit-scrollbar:hidden 把原生滚动条彻底藏掉，仅靠手势 / 触摸板
          // 滚（pan-x 行为不变）。
          className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {searchCategoryLabelDescriptors.map((item) => {
            // chip 后挂的命中条数原来对所有非「全部」分类都挂；当结果是 0 时
            // 显示 "联系人 0" / "朋友圈 0" 看起来像未读徽标，但其实是空命中，
            // 干扰视觉。只在 count > 0 时挂出来。
            // miniPrograms 永远是 ComingSoonOverlay「功能开发中」、scope 没接索
            // 引，count 永远 0，挂个 "小程序 0" 跟 overlay 表达的"还没做"自相
            // 矛盾——直接不挂。
            const matchableId =
              item.id !== "all" && item.id !== "miniPrograms" ? item.id : null;
            const showCount =
              matchableId !== null &&
              hasKeyword &&
              matchedCounts[matchableId] > 0;
            return (
              <button
                key={item.id}
                type="button"
                ref={(el) => {
                  chipRefs.current[item.id] = el;
                }}
                onClick={() => setActiveCategory(item.id)}
                aria-pressed={activeCategory === item.id}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                  activeCategory === item.id
                    ? "bg-[#07c160] text-white"
                    : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-secondary)]",
                )}
              >
                {t(item.label)}
                {showCount && matchableId ? ` ${matchedCounts[matchableId]}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
        {/* 走查 R2 真机：用户从「通讯录」按搜索来时，friends/characters 已经被
            contacts-page 缓存好；但 conversations/officialAccounts/moments/feed
            这几条 contacts-page 移动端不发的 query，进 /tabs/search 后还要冷启
            ~100-500ms。原 `{loading ? ...}` 不看 hasKeyword，用户已经在输入框
            打字了照样挂「正在准备搜一搜」遮住整屏，本地分类（联系人等）现成的
            结果也被一起遮掉。只在「还没输入关键词」时挡屏；用户已经开始查时
            交给下面的 inline 加载横幅 + 结果区先渲染缓存命中。 */}
        {loading && !hasKeyword ? (
          <MobileSearchStatusCard
            badge={t(msg`读取中`)}
            title={t(msg`正在准备搜一搜`)}
            description={t(msg`稍等一下，正在整理最近记录和可搜索范围。`)}
            tone="loading"
          />
        ) : null}
        {/* 走查 R2 真机：已输入关键词但部分索引（会话 / 公众号 / 朋友圈 / 广场）
            还在冷启时挂一条 inline 提示——结果区已经能渲染缓存命中（联系人 /
            收藏 / 小程序），新到的索引数据会继续接力进来。 */}
        {!error && hasKeyword && loading ? (
          <InlineNotice
            className="mb-2 rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone="info"
          >
            {t(msg`正在补全搜索范围，结果会继续完善。`)}
          </InlineNotice>
        ) : null}
        {error ? (
          <MobileSearchStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`搜一搜暂时不可用`)}
            description={error}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={onRetryLoad}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px] text-[color:var(--text-primary)]"
                >
                  {t(msg`重试读取`)}
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px] text-[color:var(--text-primary)]"
                >
                  {t(msg`返回上一页`)}
                </button>
              </div>
            }
          />
        ) : null}

        {!loading && !error && !hasKeyword ? (
          <div className="space-y-4">
            <section className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                  {t(msg`最近搜索`)}
                </div>
                {history.length ? (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="text-[11px] text-[color:var(--text-muted)]"
                  >
                    {t(msg`清空`)}
                  </button>
                ) : null}
              </div>

              {history.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {history.map((item) => (
                    <div
                      key={item.keyword}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] px-3 py-1.5 text-[11px] text-[color:var(--text-secondary)]"
                    >
                      <button
                        type="button"
                        onClick={() => onApplyHistory(item.keyword)}
                        className="inline-flex min-w-0 items-center gap-1"
                      >
                        <Clock3 size={12} className="shrink-0" />
                        {/* 关键词写得很长（一句话/带逗号的列表）时之前直接撑满
                            行宽并把内部「删除」推到下一行，pill 形变。max-w + truncate
                            把超长 keyword 截断成 "...完整 keyword" 的 title tooltip。 */}
                        <span
                          className="max-w-[14rem] truncate"
                          title={item.keyword}
                        >
                          {item.keyword}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveHistory(item.keyword)}
                        className="shrink-0 text-[10px] text-[color:var(--text-dim)]"
                      >
                        {t(msg`删除`)}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2.5 text-[11px] leading-[1.35rem] text-[color:var(--text-muted)]">
                  {t(msg`还没有搜索记录，输入关键词后会保存在这里。`)}
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
                    onClick={() => {
                      setActiveCategory(item.key as SearchCategory);
                      // 点 quickScopeCard 时只切了 activeCategory（顶部 chip 变绿）
                      // ——但因为还没输入 keyword，下方主区还停在原来的「最近搜索 /
                      // 快捷范围 / 可搜索范围」，视觉上看不出任何变化，用户以为没
                      // 反应。把焦点拨回输入框，引导用户立刻开始打字。
                      inputRef.current?.focus();
                    }}
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
                        {t(item.title)}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
                        {t(item.description)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5">
              <div className="flex items-center gap-1.5 text-[14px] font-medium text-[color:var(--text-primary)]">
                <Sparkles size={15} className="text-[#15803d]" />
                <span>{t(msg`当前可搜索范围`)}</span>
              </div>
              {/* 小程序 chip 命中是 ComingSoonOverlay「功能开发中」，但这里之前
                  还把 scopeCounts.miniPrograms（已索引的小程序条目数）当
                  「可搜索」给挂出来——一边写"可搜索范围"一边显示 10 条，跟
                  overlay 矛盾。索性从可搜索范围里拿掉；剩下 6 项 2×3 grid 也
                  能整齐填满，不会再出现"广场动态"独占最后一行的视觉断尾。 */}
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-[11px] text-[color:var(--text-secondary)]">
                <ScopeStat
                  label={t(msg`会话`)}
                  value={`${scopeCounts.conversations}`}
                />
                <ScopeStat label={t(msg`联系人`)} value={`${scopeCounts.contacts}`} />
                <ScopeStat label={t(msg`收藏`)} value={`${scopeCounts.favorites}`} />
                <ScopeStat
                  label={t(msg`公众号`)}
                  value={`${scopeCounts.officialAccounts}`}
                />
                <ScopeStat label={t(msg`朋友圈`)} value={`${scopeCounts.moments}`} />
                <ScopeStat label={t(msg`广场动态`)} value={`${scopeCounts.feed}`} />
              </div>
            </section>
          </div>
        ) : null}

        {/* 走查 R1：banner 文案是「消息结果会继续增加」——只在「全部」/「聊天记录」
            两个 chip 下才有意义；用户切到「联系人」/「朋友圈」/「广场动态」/
            「公众号」/「收藏」时挂这条横幅会让人误以为当前分类的结果也在追加，
            实际上消息索引跟这些分类毫无关系。和下面「无结果」卡片的"等消息索引"
            分支保持同一组分类。 */}
        {!loading && !error && hasKeyword && searchingMessages &&
        (activeCategory === "all" || activeCategory === "messages") ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone="info"
          >
            {t(msg`正在补全全局聊天记录索引，消息结果会继续增加。`)}
          </InlineNotice>
        ) : null}

        {/* 「无结果」卡片只在「确实没东西可看」时出：
            - 消息索引还在补全时（searchingMessages）继续展示下面的局部结果 +
              上面的补全 banner，避免用户先看到「没有找到相关内容」、过两秒
              消息又冒出来的反复；只对受消息索引影响的分类（全部 / 聊天记录）
              做这层等待。
            - miniPrograms 整个分类自带 ComingSoonOverlay 表达「功能开发中」，
              再叠一条「没有找到相关内容」会让用户分不清是"真没有"还是
              "本来就还做不出来"——直接 suppress，让 overlay 自己说。 */}
        {!loading && !error && hasKeyword && !visibleResults.length &&
        activeCategory !== "miniPrograms" && !(
          searchingMessages && (activeCategory === "all" || activeCategory === "messages")
        ) ? (
          <div className="pt-3">
            <MobileSearchStatusCard
              badge={t(msg`无结果`)}
              title={t(msg`没有找到相关内容`)}
              // 之前一律说"换个关键词，或者切到别的分类试试。"——「全部」分类下其实
              // 已经把所有索引都搜过了，根本没有"别的分类"可切，文案误导。只在缩范围
              // 的非「全部」分类里才提"切到别的分类"。
              description={
                activeCategory === "all"
                  ? t(msg`换个关键词试试。`)
                  : t(msg`换个关键词，或者切到别的分类试试。`)
              }
            />
          </div>
        ) : null}

        {/* 走查 R2：去掉 !loading 门——结果区允许在「部分索引还在冷启」期间先
            渲染已缓存命中（联系人 / 收藏 / 小程序 等本地索引），上面的「正在补全
            搜索范围」 inline 横幅会提示用户其它分类的数据陆续进来。「无结果」
            卡片下面仍然保留 !loading 守卫，避免空数据期间错误判定"没有相关内容"。 */}
        {!error && hasKeyword ? (
          activeCategory === "all" ? (
            <div className="space-y-4">
              {orderedAllSections.map((section) => {
                const visible = section.results.slice(0, 3);
                const hasMore = section.results.length > 3;

                return (
                  <section key={section.category} className="space-y-2">
                    <div className="text-[12px] font-medium text-[color:var(--text-muted)]">
                      {getCategoryTitle(section.category)}
                    </div>
                    <div className="space-y-1">
                      {visible.map((item) => (
                        <SearchResultCard
                          key={item.id}
                          item={item}
                          keyword={normalizedHighlightKeyword}
                          layout="mobile"
                          onOpen={onOpenResult}
                        />
                      ))}
                      {hasMore ? (
                        <button
                          type="button"
                          onClick={() => setActiveCategory(section.category)}
                          className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-[12px] text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                        >
                          {/* 走查 R1：原文"查看更多 ${total} 条 ${分类}"。total 是
                              该分类下所有命中的总数（含已展示的 3 条），但措辞"查看更多"
                              让用户误以为这是「除了已经看到的，还剩 X 条」的语义——
                              "查看更多 4 条 联系人" 看着像下钻能再看到 4 条，实际下钻
                              是 4 条全部（1 条新增）。统一改成"查看全部"，跟跳转后的
                              category 视图（展示全部 total 条）对齐。 */}
                          <span>
                            {t(msg`查看全部 ${section.results.length} 条 ${getCategoryTitle(section.category)}`)}
                          </span>
                          <ChevronRight size={13} className="shrink-0" />
                        </button>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : visibleResults.length || activeCategory === "miniPrograms" ? (
            // 非「全部」分类、0 命中时不再渲染「{分类} · 0 条」空表头：
            // 上面的「无结果」卡片已经把"没找到"说清楚了，再叠一行 0 条只会
            // 让信息密度变重。miniPrograms 是例外——chip 命中就要让
            // ComingSoonOverlay 出来，告知"功能开发中"，比"无结果"更准确；
            // 此时也别再叠「小程序 · 0 条」，否则跟 overlay 的"功能开发中"
            // 互相矛盾（一边说在搜了 0 条，一边说功能还没开）。
            <div className="space-y-2.5">
              {activeCategory === "miniPrograms" && !visibleResults.length ? null : (
                <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                  {getCategoryTitle(activeCategory)} · {visibleResults.length}{" "}
                  {t(msg`条`)}
                </div>
              )}
              {/* miniPrograms 命中 0 时下面 visibleResults 是空数组，relative
                  容器没高度，absolute inset-0 的 overlay 退化到 0×0 浮在角落
                  上——给一个 min-height 让 overlay 有地方撑开居中。其它分类
                  正常走 result 行的高度，不需要 min-height。 */}
              <div
                className={cn(
                  "relative space-y-1.5",
                  activeCategory === "miniPrograms" && !visibleResults.length
                    ? "min-h-[180px]"
                    : undefined,
                )}
              >
                {visibleResults.map((item) => (
                  <SearchResultCard
                    key={item.id}
                    item={item}
                    keyword={normalizedHighlightKeyword}
                    layout="mobile"
                    onOpen={onOpenResult}
                  />
                ))}
                {activeCategory === "miniPrograms" ? (
                  <MobileSearchComingSoonOverlay />
                ) : null}
              </div>
            </div>
          ) : null
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
      {/* 原来是 text-[8px] + tracking-[0.04em]：8px 中文已经接近不可读，再叠
          letter-spacing 几乎糊成一个块。统一回 11px，跟同样移动端的
          MobileChatListStatusCard 的 badge 一致。 */}
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.04em]",
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

function MobileSearchComingSoonOverlay() {
  const t = useRuntimeTranslator();
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center rounded-[14px] bg-black/30 backdrop-blur-[3px]">
      <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white/95 px-4 py-3 text-center shadow-[var(--shadow-card)]">
        <div className="text-[13px] font-semibold text-[color:var(--text-primary)]">
          {t(msg`功能开发中`)}
        </div>
        <div className="mt-1 text-[11px] text-[color:var(--text-secondary)]">
          {t(msg`敬请期待`)}
        </div>
      </div>
    </div>
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
