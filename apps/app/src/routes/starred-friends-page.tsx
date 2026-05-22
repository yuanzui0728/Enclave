import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { ArrowLeft, Search, Star, Tag, X } from "lucide-react";
import { getFriends, SELF_CHARACTER_ID } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import {
  buildDesktopContactsRouteHash,
  parseDesktopContactsRouteState,
} from "../features/contacts/contacts-route-state";
import {
  buildMobileContactDirectoryRouteHash,
  parseMobileContactDirectoryRouteState,
} from "../features/contacts/mobile-contact-directory-route-state";
import {
  compareStarredFriends,
  getFriendDisplayName,
  matchesFriendSearch,
  stripBidiControl,
} from "../features/contacts/contact-utils";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function StarredFriendsPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const desktopCompatHash = useMemo(() => {
    const routeState = parseDesktopContactsRouteState(hash);

    return buildDesktopContactsRouteHash({
      pane: "starred-friends",
      characterId:
        routeState.pane === "starred-friends"
          ? routeState.characterId
          : undefined,
    });
  }, [hash]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/contacts",
      hash: desktopCompatHash,
      replace: true,
    });
  }, [desktopCompatHash, isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在切换到桌面星标朋友`)}
        description={t(msg`星标朋友在桌面布局里并入了通讯录，这里会自动带你打开对应视图。`)}
        loadingLabel={t(msg`正在打开桌面星标朋友...`)}
      />
    );
  }

  return <MobileStarredFriendsPage />;
}

function MobileStarredFriendsPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = parseMobileContactDirectoryRouteState(hash);
  const [searchText, setSearchText] = useState(routeState.keyword);
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileContactDirectoryRouteHash({
        keyword: searchText,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [safeReturnHash, safeReturnPath, searchText],
  );

  // 新一轮走查：共享 contacts-page 同 cache key 的星标朋友页，配 staleTime
  // 让短时间反复进出星标列表不重复 fetch。star/unstar mutation 仍显式 invalidate。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });

  const starredFriends = useMemo(
    () =>
      (friendsQuery.data ?? [])
        // 防御性过滤 SELF：跟 buildContactTagGroups 同口径。如果脏数据 / 历史走查
        // 脚本把 char-default-self 的 friendship.isStarred 标了 true，"我"会跑
        // 到星标朋友列表里，星形图标 + 自己头像看着极其奇怪。前端守一道，
        // 不依赖后端 / DB 完全干净。
        .filter(
          (item) =>
            item.friendship.isStarred &&
            item.character.id !== SELF_CHARACTER_ID,
        )
        .sort(compareStarredFriends),
    [friendsQuery.data],
  );
  // 新一轮走查 R2：跟兄弟页 contacts-page / world-characters-page / tags-page
  // 同口径补 useDeferredValue。星标朋友通常没那么多，但 matchesFriendSearch 一
  // 路过 character.name/relationship/bio/currentStatus/currentActivity/expert/
  // remark/region/source/tags 总共 10+ haystack，star 列表很多时 keystroke 仍
  // 然会卡。让 input 立刻反应，filter 排到下一帧。
  const deferredSearchText = useDeferredValue(searchText);
  const normalizedSearchText = deferredSearchText.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    if (!normalizedSearchText) {
      return starredFriends;
    }

    return starredFriends.filter((item) =>
      matchesFriendSearch(item, normalizedSearchText),
    );
  }, [normalizedSearchText, starredFriends]);

  // 新一轮走查：同 tags-page，effect deps 不能含 searchText —— 否则
  // setSearchText('h') 重渲染时本 effect 比较 'h' !== '' 又把 searchText 撤回
  // 空，第二条 effect 同时把 URL navigate 到 'q=h'；下一帧 routeState.keyword
  // 变 'h'、searchText 变 ''，两个 effect 互相再纠正一次，瞬间死循环 +
  // 输入框可见闪烁。world-characters-page 已经踩过这个坑并修过，这里同步。
  useEffect(() => {
    setSearchText((current) =>
      current === routeState.keyword ? current : routeState.keyword,
    );
  }, [routeState.keyword]);

  useEffect(() => {
    if (normalizedHash === (currentRouteHash ?? "")) {
      return;
    }

    void navigate({
      to: "/contacts/starred",
      hash: currentRouteHash,
      replace: true,
    });
  }, [
    currentRouteHash,
    navigate,
    normalizedHash,
  ]);

  function navigateToRouteStateReturn() {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  }

  function openTags() {
    void navigate({
      to: "/contacts/tags",
      hash: buildMobileContactDirectoryRouteHash({
        keyword: "",
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    openTags();
  }

  function handleRetryFriends() {
    void friendsQuery.refetch();
  }

  const statusBackLabel = safeReturnPath
    ? t(msg`返回上一页`)
    : t(msg`查看联系人标签`);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`星标朋友`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={() =>
              navigateBackOrFallback(
                () => {
                  if (navigateToRouteStateReturn()) {
                    return;
                  }

                  void navigate({ to: "/tabs/contacts" });
                },
                safeReturnPath ?? "/tabs/contacts",
              )
            }
            aria-label={t(msg`返回通讯录`)}
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={openTags}
            aria-label={t(msg`查看联系人标签`)}
          >
            <Tag size={17} />
          </Button>
        }
      >
        <div className="pt-1.5">
          <label className="flex h-9 items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[12px] text-[color:var(--text-dim)]">
            <Search aria-hidden="true" size={14} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t(msg`搜索星标朋友`)}
              // 走查 R1：父 label 没有可读文本节点（只有 Search 图标 + input），
              // 屏幕阅读器 focus 进来念出来的是"编辑栏 空"无 accessible name；
              // placeholder 在不同 SR 上行为不一致。跟 group-contacts-page 同口径
              // 补 aria-label 兜底。autoCorrect/Capitalize off：搜星标朋友常用昵
              // 称英文，iOS 句首大写会把"alice"改成"Alice"；matchesFriendSearch
              // 内部 toLowerCase 但 autocorrect 把字直接改掉是真坑。
              aria-label={t(msg`搜索星标朋友`)}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
              // zoom-in。跟 mobile-add-friend-page 已修过的搜索框对齐。
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
            {searchText ? (
              // 走查 R1：跟兄弟页 world-characters-page 同口径补一键清空。原本
              // 用户只能逐字 backspace，长 query 体验差；type="search" 的浏览器
              // 原生 X 按钮在 iOS WKWebView/Android Chrome 里渲染极不一致，不能
              // 依赖。
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--text-dim)] active:bg-black/5"
                aria-label={t(msg`清空搜索`)}
              >
                <X size={13} />
              </button>
            ) : null}
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {friendsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileStarredFriendsStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在读取星标朋友`)}
              description={t(msg`稍等一下，正在同步你标记过的常联系好友。`)}
              tone="loading"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileStarredFriendsStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`星标朋友暂时不可用`)}
              description={describeRequestError(friendsQuery.error)}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={handleRetryFriends}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {statusBackLabel}
                  </Button>
                </div>
              }
              tone="danger"
            />
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !friendsQuery.isError &&
        !filteredFriends.length ? (
          <div className="px-4 pt-4">
            <MobileStarredFriendsStatusCard
              badge={normalizedSearchText ? t(msg`暂无结果`) : t(msg`星标`)}
              title={
                normalizedSearchText
                  ? t(msg`没有找到匹配的星标朋友`)
                  : t(msg`还没有星标朋友`)
              }
              description={
                normalizedSearchText
                  ? t(msg`换个关键词再试试。`)
                  : t(msg`先去联系人资料里把常联系的好友设为星标朋友。`)
              }
              action={
                normalizedSearchText ? (
                  // 走查新一轮 R1：搜索命中 0 条时主 CTA 应是「清空搜索」回到完
                  // 整星标列表，跟兄弟页 world-characters-page R1 / group-contacts
                  // -page R9 同口径。原版无脑落到 statusBackLabel（"查看联系人标
                  // 签"或"返回上一页"），用户搜了一个找不到的关键词只能 backspace
                  // 逐字清空，或被引导到不相关的标签页，行为分裂。
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={() => setSearchText("")}
                  >
                    {t(msg`清空搜索`)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {statusBackLabel}
                  </Button>
                )
              }
            />
          </div>
        ) : null}

        {filteredFriends.length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {filteredFriends.map((item, index) => (
              <button
                key={item.character.id}
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/character/$characterId",
                    params: { characterId: item.character.id },
                    hash: buildCharacterDetailRouteHash({
                      returnPath: pathname,
                      returnHash: currentRouteHash || undefined,
                    }),
                  });
                }}
                // 走查新一轮 R3：跟 contacts-page FriendListRow / world-characters-page
                // / group-contacts-page / tags-page 同口径补 yj-list-item-virtual。
                // 星标朋友通常少（yuanzui 实测 1 位），但仍跟兄弟"长列表行"页面对齐
                // 防御 worst case + 行高度一致预测，content-visibility:auto +
                // contain-intrinsic-size 双发挥。
                className={cn(
                  "yj-list-item-virtual flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]",
                  index > 0
                    ? "border-t border-[color:var(--border-faint)]"
                    : undefined,
                )}
              >
                <AvatarChip
                  name={getFriendDisplayName(item)}
                  src={item.character.avatar}
                  size="wechat"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                    {getFriendDisplayName(item)}
                  </div>
                  {getFriendDisplayName(item) !== item.character.name ? (
                    <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
                      {/* W2R2 bidi 防御：副标题在 remarkName 不等于真实名字时显示
                          原 character.name；这里直接读没走 displayName，需补 strip。 */}
                      {stripBidiControl(item.character.name)}
                    </div>
                  ) : null}
                </div>
                <Star
                  size={14}
                  className="shrink-0 text-[#d4a72c]"
                  fill="currentColor"
                />
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileStarredFriendsStatusCard({
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
