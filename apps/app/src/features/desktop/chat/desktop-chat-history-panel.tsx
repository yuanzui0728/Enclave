import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import {
  getGroupMembers,
  searchConversationMessages,
  searchGroupMessages,
  type ChatMessageSearchCategory,
  type ChatMessageSearchItem,
  type ConversationListItem,
  type GroupMember,
} from "@yinjie/contracts";
import {
  AlertCircle,
  ChevronDown,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { cn } from "@yinjie/ui";
import { getConversationDisplayTitle } from "../../../lib/conversation-preview";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import {
  formatMessageTimestamp,
  parseTimestamp,
} from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { formatDateTime, translateRuntimeMessage } from "@yinjie/i18n";

type DesktopChatHistoryPanelProps = {
  conversation: ConversationListItem;
  focusRequestKey?: number;
  variant?: "panel" | "dialog";
  onBackToDetails?: () => void;
  onClose: () => void;
  onOpenMessage: (messageId: string) => void;
};

type SelectorView = "date" | "sender" | null;
type QuickDateFilter = "all" | "today" | "7d" | "30d" | "custom";
type SenderOption = {
  id: string;
  label: string;
  role: string;
};
type ResultSection = {
  key: string;
  label: string;
  items: ChatMessageSearchItem[];
};

const SEARCH_PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 280;
const t = translateRuntimeMessage;

export function DesktopChatHistoryPanel({
  conversation,
  focusRequestKey = 0,
  variant = "panel",
  onBackToDetails,
  onClose,
  onOpenMessage,
}: DesktopChatHistoryPanelProps) {
  const isDialog = variant === "dialog";
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const isGroupConversation = isPersistedGroupConversation(conversation);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const customDateInputRef = useRef<HTMLInputElement | null>(null);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<ChatMessageSearchCategory>("all");
  const [selectorView, setSelectorView] = useState<SelectorView>(null);
  const [quickDateFilter, setQuickDateFilter] =
    useState<QuickDateFilter>("all");
  const [customDate, setCustomDate] = useState("");
  const [senderId, setSenderId] = useState("");
  const [memberKeyword, setMemberKeyword] = useState("");
  // 走查再走一轮 R6：和姊妹 useChatReminderNowTimestamp（同一轮 R2 ff798361a 修过
  // 的 stale-now 同款）—— buildResultSections (line ~1141) 在 useMemo deps=
  // [resultItems] 内调用 resolveDateSectionLabel(item.createdAt)，里头 new
  // Date() 捕获当前 today/yesterday 边界算"今天/昨天"。dialog 一打开 + 用户
  // 没动数据时 resultItems 引用不变 → memo 永不重算 → 跨午夜场景下 11:59 搜
  // 索的本日消息卡片标签卡在"今天"，过了 00:00 应该变"昨天"却不刷。用户长
  // 时间停留在该 dialog（比如开着面板挂机、跨午夜回来继续筛选）会看到 label
  // 偏差一天 —— 接着点结果跳转后"今天聊的"和列表里的"今天"对不上号。
  // 用 todayKey 同款思路：60s tick + window focus 刷一遍当天 yyyy-mm-dd，把
  // 它塞进 resultSections deps，跨日时强制重算 label。memberKeyword / senderId
  // 等其它 state 已经覆盖另一侧重算路径，本 key 只兜午夜边界。
  const [todayKey, setTodayKey] = useState(() => formatDateInput(new Date()));
  useEffect(() => {
    const refreshTodayKey = () => {
      const next = formatDateInput(new Date());
      setTodayKey((current) => (current === next ? current : next));
    };
    const timer = window.setInterval(refreshTodayKey, 60_000);
    const handleFocus = () => refreshTodayKey();
    const handleVisibility = () => {
      if (typeof document === "undefined") {
        return;
      }
      if (document.visibilityState === "visible") {
        refreshTodayKey();
      }
    };
    window.addEventListener("focus", handleFocus);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, []);

  useEffect(() => {
    setKeyword("");
    setDebouncedKeyword("");
    setActiveCategory("all");
    setSelectorView(null);
    setQuickDateFilter("all");
    setCustomDate("");
    setSenderId("");
    setMemberKeyword("");
  }, [conversation.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversation.id, focusRequestKey]);

  // R13：和 R11/R12 一票 onClose ref 镜像同款 perf 修法 —— onClose /
  // onBackToDetails 是父组件 dialog/workspace 用 inline arrow 传进来，每次
  // 重渲染都换引用。本 panel 在 dialog 变体下展示期间，父帧 dialog（被
  // workspace 包裹）的 onClose 跟着 workspace 60s 轮询 / 搜索框 / typing tick
  // 一起拆装；同时 panel 自己的 activeCategory / customDate / senderId /
  // selectorView state 也会推动 effect 重跑。两条路径叠加 → window keydown
  // capture listener 拆装频繁。ref 镜像两个回调，deps 收紧到只含真正影响
  // handler 逻辑的状态。
  const onCloseRef = useRef(onClose);
  const onBackToDetailsRef = useRef(onBackToDetails);
  useEffect(() => {
    onCloseRef.current = onClose;
    onBackToDetailsRef.current = onBackToDetails;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      // 走查 R148：查找聊天记录面板里有「指定成员关键字」/「指定日期」搜索
      // TextField，CJK 用户用 IME 拼搜索词时按 Esc 是退候选词的标准键。原
      // handler 抢 Esc 走 selectorView/filter/back 多层 fallback，半截
      //"张 zhang"被吞、用户白打。先让 IME 消费 Esc，候选词退后再按一次才走
      // 原 fallback 路径。和 desktop-channels-workspace L633 同款修法。
      if (event.isComposing) {
        return;
      }

      if (selectorView) {
        event.preventDefault();
        event.stopPropagation();
        setSelectorView(null);
        return;
      }

      if (
        activeCategory !== "all" ||
        Boolean(senderId) ||
        quickDateFilter !== "all" ||
        Boolean(customDate)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setActiveCategory("all");
        setQuickDateFilter("all");
        setCustomDate("");
        setSenderId("");
        setMemberKeyword("");
        return;
      }

      const backToDetails = onBackToDetailsRef.current;
      if (backToDetails) {
        event.preventDefault();
        event.stopPropagation();
        backToDetails();
        return;
      }

      if (isDialog) {
        return;
      }

      onCloseRef.current();
    }

    // 走查电脑端单聊新一轮 R5：本 panel 在 dialog 变体下嵌在 DesktopChatHistoryDialog
    // 里。原版用默认 bubble phase 挂 window keydown，DesktopChatHistoryDialog 自
    // 己的 Esc onClose handler 在父级先挂上（先于 panel 子组件 mount），同一阶段
    // listener 按 attach 顺序触发 → dialog handler 先跑、检查 defaultPrevented=
    // false → preventDefault + onClose 关掉整个查找记录弹层；panel handler 后
    // 跑、setSelectorView(null) 等 state 落在正在 unmount 的组件上等于 no-op。
    // 用户期望：先关选择器/筛选，再次按 Esc 才关弹层。改用 capture phase 让
    // panel 在 dialog 之前先看到事件，preventDefault 后 dialog handler 命中
    // defaultPrevented=true 早返不关；filter/selector 都用完再让 dialog 关。
    window.addEventListener("keydown", handleKeyDown, true);
    return () =>
      window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    activeCategory,
    customDate,
    isDialog,
    quickDateFilter,
    selectorView,
    senderId,
  ]);

  // 走查新会话桌面端群聊 R3：和「发起群聊」/「添加成员」 R2 同款问题——这里
  // 原本用独立 cache key 「desktop-chat-search-members」存群成员，不复用
  // group-chat-thread-panel / desktop-chat-details-panel / desktop-message-
  // avatar-popover 早已加载好的 "app-group-members" cache。「查找聊天记录」从
  // 群聊「聊天信息」或顶部搜索按钮触发时，群成员上一次几百 ms 前刚拉过，这里
  // 又得在公网隧道（~600ms RTT）走一发 getGroupMembers。统一到 "app-group-members"
  // key，sender 筛选 picker 立刻能渲染候选；staleTime 保持 30s（沿用其它入口的
  // 「群成员变更不频繁」节奏）。
  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, conversation.id],
    queryFn: () => getGroupMembers(conversation.id, baseUrl),
    enabled: isGroupConversation,
    staleTime: 30_000,
  });

  const senderOptions = useMemo(
    () => buildSenderOptions(membersQuery.data ?? []),
    [membersQuery.data],
  );
  const selectedSender = useMemo(
    () => senderOptions.find((option) => option.id === senderId) ?? null,
    [senderOptions, senderId],
  );
  const visibleSenderOptions = useMemo(() => {
    const keyword = memberKeyword.trim().toLowerCase();
    if (!keyword) {
      return senderOptions;
    }
    return senderOptions.filter((option) =>
      option.label.toLowerCase().includes(keyword),
    );
  }, [senderOptions, memberKeyword]);
  const dateRange = useMemo(
    () => resolveDateRange(quickDateFilter, customDate),
    [quickDateFilter, customDate],
  );
  const hasDateFilter = Boolean(dateRange.dateFrom) || Boolean(dateRange.dateTo);
  const hasSearchRequest =
    Boolean(debouncedKeyword) ||
    activeCategory !== "all" ||
    Boolean(senderId) ||
    hasDateFilter;
  const searchQueryEnabled = true;

  const resultsQuery = useInfiniteQuery({
    queryKey: [
      "desktop-chat-message-search",
      baseUrl,
      conversation.id,
      debouncedKeyword,
      activeCategory,
      senderId,
      dateRange.dateFrom,
      dateRange.dateTo,
    ],
    initialPageParam: undefined as string | undefined,
    enabled: searchQueryEnabled,
    // 走查 R21：和姊妹 features/search/use-search-index.ts 已修过的同款 — 用户
    // 在「查找聊天记录」侧栏多打一个字 / 切 category chip / 切 sender / 切日期，
    // queryKey 8 个字段中任意一个变 → useInfiniteQuery.data 退回 undefined →
    // 下方 resultItems flatMap 出空数组 → 整片结果区瞬时清空（empty state /
    // 「正在搜索...」闪一下）→ 新数据回填。拼音输入法选字阶段尤其抖，每秒
    // 多次 keystroke 都打断列表。keepPreviousData 把上一次命中条目保留在屏幕
    // 上、用 staleness 暗示用户结果在追赶。
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => {
      const payload = {
        keyword: debouncedKeyword || undefined,
        category: activeCategory,
        senderId: senderId || undefined,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        cursor: pageParam,
        limit: SEARCH_PAGE_SIZE,
      };

      if (isGroupConversation) {
        return searchGroupMessages(conversation.id, payload, baseUrl);
      }

      return searchConversationMessages(conversation.id, payload, baseUrl);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const resultItems = useMemo(
    () => resultsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [resultsQuery.data],
  );
  const resultSections = useMemo(
    () => buildResultSections(resultItems),
    // todayKey 见组件顶部 R6 注释 —— 单纯做 stale-now invalidation key，不在
    // buildResultSections 内部用，跨午夜时强制重算每个 section 的"今天/昨天"
    // label，否则 resolveDateSectionLabel 内的 new Date() 永远不会重读。
    [resultItems, todayKey],
  );
  const totalResults = resultsQuery.data?.pages[0]?.total ?? resultItems.length;

  const showResultsView = true;
  const openedFromDetails = Boolean(onBackToDetails);
  const emptyStateCopy = useMemo(
    () =>
      buildEmptyStateCopy({
        keyword: debouncedKeyword,
        activeCategory,
        selectedSenderLabel: selectedSender?.label,
        quickDateFilter,
        customDate,
      }),
    [
      debouncedKeyword,
      activeCategory,
      selectedSender?.label,
      quickDateFilter,
      customDate,
    ],
  );

  function focusSearchInput(moveCaretToEnd = false) {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();

      if (moveCaretToEnd && searchInputRef.current) {
        const length = searchInputRef.current.value.length;
        searchInputRef.current.setSelectionRange(length, length);
      }
    });
  }

  function clearKeywordFilter(refocus = true) {
    setKeyword("");
    setDebouncedKeyword("");
    if (refocus) {
      focusSearchInput();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f7]">
      <div
        className={cn(
          "bg-white",
          isDialog ? "px-6 pb-1.5 pt-2" : "border-b border-[rgba(0,0,0,0.06)] px-4 py-3",
        )}
      >
        <div
          className={cn(
            isDialog ? "mx-auto w-full max-w-[680px]" : "",
          )}
        >
        <label
          className={cn(
            "flex items-center gap-2 rounded-[10px] border border-[rgba(0,0,0,0.04)] bg-[#f4f4f4] transition-[border-color,background-color] focus-within:border-[rgba(7,193,96,0.2)] focus-within:bg-white",
            isDialog ? "px-3 py-2" : "px-3 py-2.5",
          )}
        >
          <Search
            size={15}
            className="shrink-0 text-[color:var(--text-muted)]"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setSelectorView(null);
            }}
            placeholder={t(msg`搜索`)}
            // 走查 R24：「查找聊天记录」面板搜索框只有 placeholder="搜索"，没
            // 挂 aria-label / aria-labelledby。父 label 没有文本子节点（只有
            // Search 图标 + input），等于一个没有 accessible name 的输入框。
            // 屏幕阅读器 focus 进来只听到"编辑栏 搜索 空"（placeholder 部分 SR
            // 实现会读、部分不会，行为分裂）。盲人用户进来不知道是搜索什么的
            // 输入框，得自己摸索周围 chip / 区域才能猜出来。和姊妹 R17 / R23
            // 同款 a11y 修法，挂 aria-label 把意图明确表达出来。
            aria-label={t(msg`搜索聊天记录`)}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => clearKeywordFilter()}
              className="shrink-0 text-[color:var(--text-dim)] transition hover:text-[color:var(--text-primary)]"
              aria-label={t(msg`清空搜索词`)}
            >
              <X size={14} />
            </button>
          ) : null}
        </label>

        {isDialog ? null : (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 rounded-[10px] bg-[#f6f6f6] px-3 py-2 text-[11px] text-[color:var(--text-muted)]">
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
              {isGroupConversation ? t(msg`群聊`) : t(msg`单聊`)}
            </span>
            <span className="truncate text-[12px] text-[color:var(--text-primary)]">
              {getConversationDisplayTitle(conversation.title)}
            </span>
            {openedFromDetails ? (
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)] shadow-[inset_0_0_0_1px_rgba(7,193,96,0.14)]">
                {t(msg`聊天信息入口`)}
              </span>
            ) : null}
          </div>
        )}

        </div>
      </div>

      <div
        className={cn(
          "border-b border-[rgba(0,0,0,0.06)] bg-white",
          isDialog ? "px-6" : "px-4",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-1 overflow-x-auto",
            isDialog ? "mx-auto w-full max-w-[680px]" : "",
          )}
        >
          <DesktopSearchTabButton
            label={t(msg`全部`)}
            active={activeCategory === "all" && selectorView === null}
            onClick={() => {
              setActiveCategory("all");
              setSelectorView(null);
            }}
          />
          <DesktopSearchTabButton
            label={t(msg`图片与视频`)}
            active={activeCategory === "media" && selectorView === null}
            onClick={() => {
              setActiveCategory("media");
              setSelectorView(null);
            }}
          />
          <DesktopSearchTabButton
            label={t(msg`文件`)}
            active={activeCategory === "files" && selectorView === null}
            onClick={() => {
              setActiveCategory("files");
              setSelectorView(null);
            }}
          />
          <DesktopSearchTabButton
            label={t(msg`链接`)}
            active={activeCategory === "links" && selectorView === null}
            onClick={() => {
              setActiveCategory("links");
              setSelectorView(null);
            }}
          />
          <DesktopSearchTabButton
            label={
              customDate ||
              resolveQuickDateFilterLabel(quickDateFilter) ||
              t(msg`日期`)
            }
            active={selectorView === "date" || hasDateFilter}
            withCaret
            onClick={() =>
              setSelectorView(selectorView === "date" ? null : "date")
            }
          />
          {isGroupConversation ? (
            <DesktopSearchTabButton
              label={selectedSender?.label || t(msg`群成员`)}
              active={selectorView === "sender" || Boolean(senderId)}
              withCaret
              onClick={() =>
                setSelectorView(selectorView === "sender" ? null : "sender")
              }
            />
          ) : null}
        </div>
      </div>

      {selectorView === "date" ? (
        <div
          className={cn(
            "border-b border-[rgba(0,0,0,0.06)] bg-white",
            isDialog ? "px-6 py-2.5" : "px-4 py-2.5",
          )}
        >
          <div
            className={cn(
              isDialog ? "mx-auto w-full max-w-[680px]" : "",
            )}
          >
            {/* 走查 R27：和姊妹 R26 转发模式 chooser / profile-settings 发送
                快捷键一批同款—— 全部时间 / 今天 / 最近 7 天 / 最近 30 天 4 个
                快捷日期过滤是 mutually exclusive 选择，原版只用绿底 + 绿字表示
                active，<button> 是裸的。盲人 SR 走过去只听到 4 段裸 label 听不
                出选中了哪一个；selectorView=date 是「查找聊天记录」常用筛选入口，
                单聊 / 群聊都走这条。改成 role="radiogroup" + role="radio" +
                aria-checked={active}。 */}
            <div
              role="radiogroup"
              aria-label={t(msg`日期范围`)}
              className="flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  { key: "all" as const, label: t(msg`全部时间`) },
                  { key: "today" as const, label: t(msg`今天`) },
                  { key: "7d" as const, label: t(msg`最近 7 天`) },
                  { key: "30d" as const, label: t(msg`最近 30 天`) },
                ]
              ).map((option) => {
                const active =
                  !customDate && quickDateFilter === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setQuickDateFilter(option.key);
                      setCustomDate("");
                      setSelectorView(null);
                    }}
                    className={cn(
                      "h-7 rounded-full px-3 text-[12px] transition",
                      active
                        ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)]"
                        : "bg-[#f4f4f4] text-[color:var(--text-secondary)] hover:bg-[#ececec] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}

              <div className="relative ml-auto flex items-center gap-1">
                {/* 走查电脑端单聊 R135：本 button 是「指定日期」disclosure 触发，
                    点击调 customDateInputRef.current.showPicker() 唤起浏览器原生
                    日期选择 overlay；可视层 ChevronDown caret + 文案在"指定日期"
                    ↔ 实际选中日期间切换。盲人 SR (NVDA/JAWS/VoiceOver) 走过来只
                    听到"指定日期 按钮"，跟"全部时间 / 今天 / 最近 7 天 / 最近
                    30 天"几个普通快捷 chip 在语义上无差异——SR 完全不知道这条
                    点下去会拉起一张原生日历 popup（不是 in-page state 切换）。
                    aria-haspopup="dialog" 显式声明"按钮按下会弹出一张选择
                    dialog 类型的浮层"，让 SR 在朗读 button 名时附加"折叠 + 日历"
                    提示，对齐姊妹 chat-header-actions 通话 menu 按钮 / desktop
                    workspace「+」quickMenu 已有的 aria-haspopup 模式（那两条
                    走 menu，本条原生 date picker 更接近 dialog）。 */}
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => {
                    const node = customDateInputRef.current;
                    if (!node) return;
                    if (typeof node.showPicker === "function") {
                      node.showPicker();
                    } else {
                      node.focus();
                      node.click();
                    }
                  }}
                  className={cn(
                    "h-7 inline-flex items-center gap-1 rounded-full px-3 text-[12px] transition",
                    customDate
                      ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)]"
                      : "bg-[#f4f4f4] text-[color:var(--text-secondary)] hover:bg-[#ececec] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <span>{customDate || t(msg`指定日期`)}</span>
                  <ChevronDown size={11} className="shrink-0 opacity-70" />
                </button>
                <input
                  ref={customDateInputRef}
                  type="date"
                  value={customDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuickDateFilter(value ? "custom" : "all");
                    setCustomDate(value);
                    if (value) {
                      setSelectorView(null);
                    }
                  }}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
                />
                {customDate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickDateFilter("all");
                      setCustomDate("");
                    }}
                    className="text-[11px] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
                  >
                    {t(msg`清除`)}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectorView === "sender" ? (
        <div
          className={cn(
            "border-b border-[rgba(0,0,0,0.06)] bg-white",
            isDialog ? "px-6 py-2.5" : "px-4 py-2.5",
          )}
        >
          <div
            className={cn(
              isDialog ? "mx-auto w-full max-w-[680px]" : "",
            )}
          >
            <label className="flex h-8 items-center gap-2 rounded-[8px] border border-[rgba(0,0,0,0.06)] bg-[#f4f4f4] px-2.5 transition-[border-color,background-color] focus-within:border-[rgba(7,193,96,0.2)] focus-within:bg-white">
              <Search
                size={13}
                className="shrink-0 text-[color:var(--text-muted)]"
              />
              <input
                type="search"
                value={memberKeyword}
                onChange={(event) => setMemberKeyword(event.target.value)}
                placeholder={t(msg`搜索群成员`)}
                // 走查 R5：和顶部「搜索聊天记录」R24 同款 a11y——父 label 只含
                // Search 图标 + input，无文本子节点，SR 听到「编辑栏 搜索群成员
                // 空」分裂行为。这块是群聊「查找聊天记录」按发言人筛选时的
                // 成员搜索框，专属群聊路径。
                aria-label={t(msg`搜索群成员`)}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
            </label>

            {membersQuery.isLoading ? (
              <div className="mt-2 flex items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                <LoaderCircle
                  size={13}
                  className="animate-spin text-[color:var(--brand-primary)]"
                />
                {t(msg`正在读取群成员…`)}
              </div>
            ) : null}
            {membersQuery.isError && membersQuery.error instanceof Error ? (
              // R60：群成员查询失败时的 inline error row（红色 AlertCircle +
              // 文案 + 重试按钮）裸 <div>，没 role / aria-live。盲人 SR 用户
              // 进群聊历史 → 按发言人筛选 → 成员加载失败时听不到任何错误，
              // 只能看到空 radio group。挂 role="alert"。
              <div
                role="alert"
                className="mt-2 flex items-center gap-2 text-[12px] text-[#d74b45]"
              >
                <AlertCircle size={13} />
                <span className="truncate">
                  {membersQuery.error.message}
                </span>
                <button
                  type="button"
                  onClick={() => void membersQuery.refetch()}
                  className="ml-auto text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                >
                  {t(msg`重试`)}
                </button>
              </div>
            ) : null}

            {!membersQuery.isLoading && !membersQuery.isError ? (
              <div className="mt-2 max-h-[180px] overflow-y-auto pr-0.5">
                {/* 走查 R28：和姊妹 R27 日期 chip / R26 转发模式 chooser 同款——
                    群聊「查找聊天记录」按发言人筛选时的全部成员 + 每个成员 chip
                    是 mutually exclusive，原版只有绿底视觉差。盲人 SR 走过去
                    听不出当前选了哪个发言人。radiogroup + radio + aria-checked。 */}
                <div
                  role="radiogroup"
                  aria-label={t(msg`发言人筛选`)}
                  className="flex flex-wrap gap-1.5"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!senderId}
                    onClick={() => {
                      setSenderId("");
                      setSelectorView(null);
                    }}
                    className={cn(
                      "h-7 rounded-full px-3 text-[12px] transition",
                      !senderId
                        ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)]"
                        : "bg-[#f4f4f4] text-[color:var(--text-secondary)] hover:bg-[#ececec] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    {t(msg`全部成员`)}
                  </button>
                  {visibleSenderOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={senderId === option.id}
                      onClick={() => {
                        setSenderId(option.id);
                        setSelectorView(null);
                      }}
                      className={cn(
                        "h-7 max-w-[180px] truncate rounded-full px-3 text-[12px] transition",
                        senderId === option.id
                          ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)]"
                          : "bg-[#f4f4f4] text-[color:var(--text-secondary)] hover:bg-[#ececec] hover:text-[color:var(--text-primary)]",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                  {!visibleSenderOptions.length ? (
                    <div className="px-2 py-1 text-[12px] text-[color:var(--text-muted)]">
                      {t(msg`没有找到匹配的群成员`)}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showResultsView ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] bg-white/96 px-5 py-1.5 backdrop-blur">
            <div className="text-[11px] tracking-[0.08em] text-[color:var(--text-dim)]">
              {hasSearchRequest ? t(msg`搜索结果`) : t(msg`聊天记录`)}
            </div>
            <div className="text-[11px] text-[color:var(--text-muted)]">
              {resultsQuery.isLoading
                ? t(msg`正在搜索...`)
                : t(msg`共 ${totalResults} 条`)}
            </div>
          </div>

          {resultsQuery.isLoading ? (
            <DesktopSearchFeedbackState
              className="px-4 py-5"
              icon={
                <LoaderCircle
                  size={16}
                  className="animate-spin text-[color:var(--brand-primary)]"
                />
              }
              title={t(msg`正在搜索聊天记录`)}
              description={t(msg`正在整理当前聊天里的匹配消息。`)}
            />
          ) : null}

          {resultsQuery.isError && resultsQuery.error instanceof Error ? (
            // R61：resultsQuery 失败（聊天记录搜索 4xx/5xx）时盲人 SR 完全
            // 静默，只听到「正在搜索」消失。挂 role="alert"。
            <DesktopSearchFeedbackState
              role="alert"
              className="px-4 py-5"
              icon={<AlertCircle size={16} className="text-[#d74b45]" />}
              title={t(msg`搜索失败`)}
              description={resultsQuery.error.message}
              actionLabel={t(msg`重试`)}
              onAction={() => {
                void resultsQuery.refetch();
              }}
            />
          ) : null}

          {!resultsQuery.isLoading &&
          !resultsQuery.isError &&
          !resultItems.length ? (
            <DesktopSearchFeedbackState
              className="px-6 py-8"
              icon={
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f3f3] text-[color:var(--text-secondary)]">
                  <Search size={16} />
                </span>
              }
              title={emptyStateCopy.title}
              description={emptyStateCopy.description}
            />
          ) : null}

          {resultSections.length ? (
            <div className="bg-white">
              {resultSections.map((section) => (
                <section key={section.key}>
                  <div className="flex items-center justify-between gap-3 border-y border-[rgba(0,0,0,0.06)] bg-[#f7f7f7] px-4 py-1.5 text-[10px] text-[color:var(--text-dim)]">
                    <span className="tracking-[0.04em]">{section.label}</span>
                    <span>{t(msg`${section.items.length} 条`)}</span>
                  </div>
                  <div className="divide-y divide-[rgba(0,0,0,0.06)]">
                    {section.items.map((item) => (
                      <DesktopSearchResultRow
                        key={item.messageId}
                        item={item}
                        debouncedKeyword={debouncedKeyword}
                        onOpenMessage={onOpenMessage}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {resultsQuery.hasNextPage ? (
            <div className="border-t border-[rgba(0,0,0,0.06)] bg-white px-4 py-3">
              <button
                type="button"
                disabled={resultsQuery.isFetchingNextPage}
                onClick={() => void resultsQuery.fetchNextPage()}
                className="mx-auto flex h-9 items-center justify-center rounded-full px-4 text-[12px] text-[color:var(--text-secondary)] transition hover:bg-[#f7f7f7] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:text-[color:var(--text-dim)]"
              >
                {resultsQuery.isFetchingNextPage
                  ? t(msg`正在加载...`)
                  : t(msg`查看更多聊天记录`)}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DesktopSearchResultRow({
  item,
  debouncedKeyword,
  onOpenMessage,
}: {
  item: ChatMessageSearchItem;
  debouncedKeyword: string;
  onOpenMessage: (messageId: string) => void;
}) {
  const metaLabel = buildSearchResultMeta(item);
  const previewText = buildSearchPreview(item, debouncedKeyword);

  // 走查电脑端单聊 R86：原版用 useState(hovered) + onMouseEnter/Leave，hover
  // 时把右上角时间戳换成「定位到聊天位置」绿色 button——纯鼠标 hover 才能触发
  // onOpenMessage。带来三组问题：
  //   1) a11y：键盘 Tab 走过来时 button 根本不在 DOM（hovered=false），盲人 SR
  //      用户在虚拟光标模式下也扫不到这条 action；触屏笔电没有 hover 态，永远
  //      触发不了「定位到聊天位置」整条搜索结果列表 dead。
  //   2) perf：每条 result row 一份 useState，N 条结果在用户 mouseover 列表
  //      时会触发 N 次 re-render（每次 enter/leave 都 setState）；hover 切换
  //      时 button 还要先重新挂 DOM 再触发布局——120Hz 笔电上能感到一丝抖。
  //   3) 设计一致性：姊妹 mobile chat-message-search-panel (line 877-934)
  //      整条 row 就是 <button>，点哪都能 navigate；桌面端为什么独门弄个
  //      hover-only action 没有 issue 记录，纯历史包袱。
  // 改成：整行 <button> + 时间戳常驻 + 用 CSS group-hover 切左侧高亮边和底色，
  // 完全去掉 useState，键盘 / 触屏 / SR / 鼠标用户都能直接触发定位。
  return (
    <button
      type="button"
      onClick={() => onOpenMessage(item.messageId)}
      aria-label={t(msg`定位到 ${item.senderName || t(msg`消息`)} 的这条消息`)}
      className="group block w-full border-l-2 border-l-transparent px-4 py-3 text-left transition-[background-color,border-color] duration-150 hover:border-l-[rgba(7,193,96,0.28)] hover:bg-[#f3f9f4] focus-visible:border-l-[rgba(7,193,96,0.28)] focus-visible:bg-[#f3f9f4] focus-visible:outline-none"
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-medium",
            resolveSearchResultAvatarTone(item),
          )}
        >
          {resolveSenderAvatarLabel(item.senderName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                {item.senderName || t(msg`消息`)}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                  resolveSearchResultBadgeTone(item),
                )}
              >
                {resolveSearchResultBadgeLabel(item)}
              </span>
            </div>
            <div className="shrink-0 text-[10px] tabular-nums text-[color:var(--text-dim)]">
              {formatMessageTimestamp(item.createdAt)}
            </div>
          </div>

          {metaLabel ? (
            <div className="mt-1 truncate text-[10px] leading-4 text-[color:var(--text-dim)]">
              {metaLabel}
            </div>
          ) : null}

          <div className="mt-1 line-clamp-2 text-[12px] leading-[1.35rem] text-[color:var(--text-secondary)]">
            {renderHighlightedText(previewText, debouncedKeyword)}
          </div>
        </div>
      </div>
    </button>
  );
}

function DesktopSearchFeedbackState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  role,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  // R61：error 变种需要 role="alert" 让 SR 立刻播报；loading / empty 不挂。
  role?: "alert" | "status";
}) {
  return (
    <div className={cn("px-3 py-3", className)} role={role}>
      <div className="rounded-[12px] border border-[rgba(0,0,0,0.05)] bg-white px-5 py-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f6f6]">
          {icon}
        </div>
        <div className="mt-3 text-[14px] text-[color:var(--text-primary)]">
          {title}
        </div>
        {description ? (
          <div className="mt-1.5 text-[12px] leading-6 text-[color:var(--text-muted)]">
            {description}
          </div>
        ) : null}
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-3 inline-flex h-8 items-center justify-center rounded-full bg-[#f6f6f6] px-3 text-[12px] text-[color:var(--text-secondary)] transition hover:bg-[#efefef] hover:text-[color:var(--text-primary)]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DesktopSearchTabButton({
  label,
  active,
  withCaret = false,
  onClick,
}: {
  label: string;
  active: boolean;
  withCaret?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 走查 R31：DesktopSearchTabButton 用作「查找聊天记录」面板顶栏 6 个
      // tab：全部 / 图片与视频 / 文件 / 链接 / 日期▽ / 群成员▽。前 4 个是
      // 互斥分类选择，后 2 个是 popover disclosure。原版只用 brand color +
      // 下方 2px 横条表示 active，盲人 SR 走过去只听到 6 段裸 label，听不出
      // 当前选中 / 展开了哪个。
      //
      // 6 个 tab 混合了 category selector 和 disclosure trigger 行为，统一
      // 用 aria-pressed 表达 active 状态 —— 前 4 个是"按下 = 选中此分类"，
      // 后 2 个带 caret 是"按下 = 展开此 selector"，两种语义都和 aria-pressed
      // 的 toggle 状态对得上。后 2 个还配 withCaret，aria-expanded 也准
      // 但和 aria-pressed 不矛盾——选 aria-pressed 跟前 4 个保持一致体验。
      aria-pressed={active}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1 px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "text-[color:var(--brand-primary)]"
          : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
      )}
    >
      <span className="max-w-[160px] truncate">{label}</span>
      {withCaret ? (
        <ChevronDown size={13} className="shrink-0 opacity-70" />
      ) : null}
      {active ? (
        <span className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-[color:var(--brand-primary)]" />
      ) : null}
    </button>
  );
}

function buildSenderOptions(members: GroupMember[]): SenderOption[] {
  return members.map((member) => ({
    id: member.memberId,
    label:
      member.memberName?.trim() ||
      (member.memberType === "user" ? t(msg`我`) : t(msg`未命名成员`)),
    role:
      member.role === "owner"
        ? t(msg`群主`)
        : member.role === "admin"
          ? t(msg`管理员`)
          : member.memberType === "user"
            ? t(msg`我`)
            : t(msg`群成员`),
  }));
}

function buildEmptyStateCopy(input: {
  keyword: string;
  activeCategory: ChatMessageSearchCategory;
  selectedSenderLabel?: string;
  quickDateFilter: QuickDateFilter;
  customDate: string;
}) {
  if (input.keyword && input.activeCategory !== "all") {
    return {
      title: t(msg`没有找到匹配的${resolveCategoryLabel(input.activeCategory)}`),
      description: t(msg`试试换个关键词，或者切换其他分类。`),
    };
  }

  if (input.keyword) {
    return {
      title: t(msg`没有找到相关聊天记录`),
      description: t(msg`试试换个关键词，或者缩小筛选范围后再查找。`),
    };
  }

  if (input.activeCategory !== "all") {
    return {
      title: t(msg`当前会话里还没有${resolveCategoryLabel(input.activeCategory)}`),
      description: t(msg`换个分类试试，或者输入关键词直接搜索。`),
    };
  }

  if (input.selectedSenderLabel) {
    return {
      title: t(msg`没有找到 ${input.selectedSenderLabel} 的聊天记录`),
      description: t(msg`点击「群成员」选择其他成员，或切回「全部成员」。`),
    };
  }

  if (input.customDate || resolveQuickDateFilterLabel(input.quickDateFilter)) {
    return {
      title: t(msg`这个时间范围内没有聊天记录`),
      description: t(msg`点击「日期」换个范围，或切回「全部时间」。`),
    };
  }

  return {
    title: t(msg`暂无聊天记录`),
    description: t(msg`这个会话目前还没有任何消息，过会儿再来看看。`),
  };
}

function resolveDateRange(filter: QuickDateFilter, customDate: string) {
  if (customDate) {
    return {
      dateFrom: customDate,
      dateTo: customDate,
    };
  }

  if (filter === "today") {
    const today = formatDateInput(new Date());
    return {
      dateFrom: today,
      dateTo: today,
    };
  }

  if (filter === "7d") {
    return {
      dateFrom: formatDateInput(subtractDays(6)),
      dateTo: formatDateInput(new Date()),
    };
  }

  if (filter === "30d") {
    return {
      dateFrom: formatDateInput(subtractDays(29)),
      dateTo: formatDateInput(new Date()),
    };
  }

  return {
    dateFrom: undefined,
    dateTo: undefined,
  };
}

function subtractDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveQuickDateFilterLabel(filter: QuickDateFilter) {
  if (filter === "today") {
    return t(msg`今天`);
  }

  if (filter === "7d") {
    return t(msg`最近 7 天`);
  }

  if (filter === "30d") {
    return t(msg`最近 30 天`);
  }

  return "";
}

function resolveCategoryLabel(category: ChatMessageSearchCategory) {
  if (category === "media") {
    return t(msg`图片与视频`);
  }

  if (category === "files") {
    return t(msg`文件`);
  }

  if (category === "links") {
    return t(msg`链接`);
  }

  return t(msg`全部`);
}

function buildResultSections(items: ChatMessageSearchItem[]) {
  const sections: ResultSection[] = [];

  items.forEach((item) => {
    const key = resolveDateSectionKey(item.createdAt);
    const current = sections.at(-1);

    if (current?.key === key) {
      current.items.push(item);
      return;
    }

    sections.push({
      key,
      label: resolveDateSectionLabel(item.createdAt),
      items: [item],
    });
  });

  return sections;
}

function resolveDateSectionKey(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return "unknown";
  }

  const date = new Date(timestamp);
  return formatDateInput(date);
}

function resolveDateSectionLabel(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return t(msg`未知时间`);
  }

  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) {
    return t(msg`今天`);
  }

  if (isSameDay(date, yesterday)) {
    return t(msg`昨天`);
  }

  if (date.getFullYear() === today.getFullYear()) {
    return formatDateTime(timestamp, {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  }

  return formatDateTime(timestamp, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function resolveMessageTypeLabel(type: ChatMessageSearchItem["messageType"]) {
  if (type === "image") {
    return t(msg`图片`);
  }

  if (type === "file") {
    return t(msg`文件`);
  }

  if (type === "voice") {
    return t(msg`语音`);
  }

  if (type === "contact_card") {
    return t(msg`名片`);
  }

  if (type === "location_card") {
    return t(msg`位置`);
  }

  if (type === "sticker") {
    return t(msg`表情`);
  }

  if (type === "system") {
    return t(msg`系统`);
  }

  return t(msg`文本`);
}

function resolveSearchResultBadgeLabel(item: ChatMessageSearchItem) {
  if (item.categories.includes("links")) {
    return t(msg`链接`);
  }

  return resolveMessageTypeLabel(item.messageType);
}

function resolveSearchResultBadgeTone(item: ChatMessageSearchItem) {
  if (item.categories.includes("links")) {
    return "bg-[#eef3fa] text-[#5d6f88]";
  }

  if (item.messageType === "image") {
    return "bg-[#eef7fb] text-[#59768a]";
  }

  if (item.messageType === "file") {
    return "bg-[#faf2eb] text-[#87664f]";
  }

  if (item.messageType === "voice") {
    return "bg-[#f4eef9] text-[#6e6284]";
  }

  if (item.messageType === "location_card") {
    return "bg-[#fbefef] text-[#87635d]";
  }

  return "bg-[#eef7f1] text-[#5d7865]";
}

function resolveSearchResultAvatarTone(item: ChatMessageSearchItem) {
  if (item.messageType === "file") {
    return "bg-[#f7efe8] text-[#87664f]";
  }

  if (item.categories.includes("links")) {
    return "bg-[#eef3fa] text-[#5d6f88]";
  }

  if (item.messageType === "voice") {
    return "bg-[#f3eef8] text-[#6e6284]";
  }

  return "bg-[#eef7f1] text-[#5d7865]";
}

function resolveSenderAvatarLabel(senderName: string) {
  const trimmed = senderName.trim();
  if (!trimmed) {
    return t(msg`消`);
  }

  return Array.from(trimmed)[0] ?? t(msg`消`);
}

function buildSearchResultMeta(item: ChatMessageSearchItem) {
  const attachment = item.attachment;
  if (!attachment) {
    if (item.categories.includes("links")) {
      return t(msg`网页链接`);
    }

    return null;
  }

  if (attachment.kind === "image") {
    const sizeLabel = formatFileSize(attachment.size);
    return [attachment.fileName, sizeLabel].filter(Boolean).join(" · ");
  }

  if (attachment.kind === "file") {
    return [attachment.fileName, formatFileSize(attachment.size)]
      .filter(Boolean)
      .join(" · ");
  }

  if (attachment.kind === "voice") {
    return t(msg`语音 ${formatVoiceDurationLabel(attachment.durationMs)}`);
  }

  if (attachment.kind === "contact_card") {
    return [attachment.name, attachment.relationship].filter(Boolean).join(" · ");
  }

  if (attachment.kind === "location_card") {
    return [attachment.title, attachment.subtitle].filter(Boolean).join(" · ");
  }

  if (attachment.kind === "note_card") {
    return attachment.title;
  }

  if (attachment.kind === "feed_post_card") {
    return (
      attachment.title?.trim() ||
      attachment.excerpt ||
      attachment.authorName
    );
  }

  if (attachment.kind === "sticker") {
    return attachment.label || t(msg`表情消息`);
  }

  return null;
}

function buildSearchPreview(item: ChatMessageSearchItem, keyword: string) {
  const text = resolveSearchPreviewText(item);
  if (!keyword) {
    return text;
  }

  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword.toLowerCase());
  if (start === -1) {
    return text;
  }

  const radius = 18;
  let previewStart = Math.max(0, start - radius);
  let previewEnd = Math.min(text.length, start + keyword.length + radius);
  // 走查新一轮：start - radius / start + keyword.length + radius 是任意
  // 整数偏移，可能落在 UTF-16 surrogate pair 的高/低代理之间。emoji（如
  // 😀 / 🌹）/ 古汉字 / 一些 CJK 扩展区都是 4 字节字符占两个 UTF-16 code
  // unit；如果 previewStart 落在低代理上、或 previewEnd 落在高代理上，
  // text.slice 会切出残缺的代理项，渲染成 □ / ? / 黑色菱形问号。这条
  // helper 用在「查找聊天记录」结果卡片预览，命中关键词附近一旦有 emoji
  // 就破。把切点往外推到下一个完整 code point 边界，宁可多带两个字符
  // 也别把表情切坏。同款 bug 见 234f5e76f（PreviewAvatar fallback 把
  // surrogate pair 砍半）。
  if (previewStart > 0 && previewStart < text.length) {
    const code = text.charCodeAt(previewStart);
    if (code >= 0xdc00 && code <= 0xdfff) {
      previewStart -= 1;
    }
  }
  if (previewEnd > 0 && previewEnd < text.length) {
    const code = text.charCodeAt(previewEnd - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
      previewEnd += 1;
    }
  }
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < text.length ? "..." : "";
  return `${prefix}${text.slice(previewStart, previewEnd)}${suffix}`;
}

function resolveSearchPreviewText(item: ChatMessageSearchItem) {
  const trimmedPreview = item.previewText.trim();
  if (trimmedPreview) {
    return trimmedPreview;
  }

  const attachment = item.attachment;
  if (!attachment) {
    return item.categories.includes("links")
      ? t(msg`分享了一条链接。`)
      : t(msg`消息内容`);
  }

  if (attachment.kind === "image") {
    return t(msg`发送了图片 ${attachment.fileName}。`);
  }

  if (attachment.kind === "file") {
    return t(msg`发送了文件 ${attachment.fileName}。`);
  }

  if (attachment.kind === "voice") {
    return t(msg`发送了一条${formatVoiceDurationLabel(attachment.durationMs)}的语音。`);
  }

  if (attachment.kind === "contact_card") {
    return t(msg`分享了名片 ${attachment.name}。`);
  }

  if (attachment.kind === "location_card") {
    return t(msg`分享了位置 ${attachment.title}。`);
  }

  if (attachment.kind === "note_card") {
    return attachment.excerpt.trim() || t(msg`分享了笔记 ${attachment.title}。`);
  }

  if (attachment.kind === "feed_post_card") {
    return (
      attachment.excerpt.trim() ||
      t(msg`转发了 ${attachment.authorName} 的视频号。`)
    );
  }

  if (attachment.kind === "sticker") {
    return attachment.label
      ? t(msg`[表情] ${attachment.label}`)
      : t(msg`发送了一个表情。`);
  }

  return t(msg`消息内容`);
}

function renderHighlightedText(text: string, keyword: string) {
  if (!keyword) {
    return text;
  }

  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword.toLowerCase());
  if (start === -1) {
    return text;
  }

  const end = start + keyword.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[3px] bg-[rgba(250,204,21,0.32)] px-0.5 text-current">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function formatVoiceDurationLabel(durationMs?: number) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return t(msg`语音`);
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  return t(msg`${totalSeconds} 秒`);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
