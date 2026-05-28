import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FriendListItem } from "@yinjie/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { ArrowLeft, Search, Star, Tag, X } from "lucide-react";
import { getFriends } from "@yinjie/contracts";
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
import { buildContactTagGroups } from "../features/contacts/contact-tag-groups";
import {
  buildMobileContactDirectoryRouteHash,
  parseMobileContactDirectoryRouteState,
} from "../features/contacts/mobile-contact-directory-route-state";
import {
  getFriendDisplayName,
  stripBidiControl,
} from "../features/contacts/contact-utils";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function TagsPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const desktopCompatHash = useMemo(() => {
    const routeState = parseDesktopContactsRouteState(hash);

    return buildDesktopContactsRouteHash({
      pane: "tags",
      tag: routeState.pane === "tags" ? routeState.tag : undefined,
      characterId:
        routeState.pane === "tags" ? routeState.characterId : undefined,
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
        title={t(msg`正在切换到桌面标签`)}
        description={t(msg`标签页在桌面布局里并入了通讯录，这里会自动带你打开标签视图。`)}
        loadingLabel={t(msg`正在打开桌面标签...`)}
      />
    );
  }

  return <MobileTagsPage />;
}

function MobileTagsPage() {
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

  // 新一轮走查：通讯录管理 → 标签 共享 contacts-page 同 cache key；配 staleTime
  // 让"打开标签 → 看某标签下成员 → 返回 → 再开"不每次都 background fetch。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });

  // 新一轮走查 R1：buildContactTagGroups 内部要把全量 friendsQuery.data 的每个
  // friendship.tags 数组都过滤 + 分组 + 排序，长好友列表 + 多 tag 账号下随手敲
  // 一字就跑一遍同步重算，主线程上肉眼可见的卡顿。和姐妹页 contacts-page /
  // group-contacts-page / world-characters-page 同口径补 useDeferredValue，让
  // input value 立刻反映出来，重算切到下一帧。
  // hasSearchText 跟着 deferred 走——避免清空搜索那一帧因为 deferredSearchText
  // 还残留上一个 keyword，让 hasSearchText 已经 false 但 tagGroups 还是 0 条，
  // 误闪「还没有联系人标签」空态（跟 group-contacts-page R9 同坑）。
  const deferredSearchText = useDeferredValue(searchText);
  const tagGroups = useMemo(
    () => buildContactTagGroups(friendsQuery.data ?? [], deferredSearchText),
    [friendsQuery.data, deferredSearchText],
  );
  const hasSearchText = deferredSearchText.trim().length > 0;

  // 新一轮走查：URL ↔ searchText 双向同步的死循环
  // 旧实现 effect deps 是 [routeState.keyword, searchText]：用户敲 'h'
  //   → setSearchText('h') → 重渲染（routeState.keyword 还是 ''）
  //   → effect 1 比较 'h' !== '' → setSearchText('') 把用户刚敲的字撤掉
  //   → effect 2 同时 navigate(hash='q=h')
  //   → 下一帧 searchText='', routeState.keyword='h'
  //   → effect 1 又把 searchText 设回 'h'
  //   → effect 2 navigate(hash='') 又把 keyword 清掉
  // 两个 effect 互相打回去，URL/输入框来回闪、瞬间死循环占满主线程。
  // 拆掉 searchText 这个 dep：effect 1 只在 routeState.keyword 真变化（如返回
  // 上一页、shortcut 注入参数）时同步进 searchText；用户敲字走 onChange 直接
  // 改 searchText，由 effect 2 单向推到 URL。
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
      to: "/contacts/tags",
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

  function openStarredFriends() {
    void navigate({
      to: "/contacts/starred",
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

    openStarredFriends();
  }

  function handleRetryTags() {
    void friendsQuery.refetch();
  }

  // Fresh 走查 R3：稳定 onSelectFriend，让下面 N 个 tag × M 个好友的 memo'd
  // row 在 deferredSearchText 重算 / friendsQuery 后台 refetch / 等无关
  // re-render 时全部 skip。dep 只有 navigate + pathname + currentRouteHash，
  // 都是低频翻面。
  const handleSelectFriend = useCallback(
    (characterId: string) => {
      void navigate({
        to: "/character/$characterId",
        params: { characterId },
        hash: buildCharacterDetailRouteHash({
          returnPath: pathname,
          returnHash: currentRouteHash || undefined,
        }),
      });
    },
    [currentRouteHash, navigate, pathname],
  );

  const statusBackLabel = safeReturnPath
    ? t(msg`返回上一页`)
    : t(msg`查看星标朋友`);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`标签`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(250,245,237,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
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
            <ArrowLeft aria-hidden="true" size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={openStarredFriends}
            aria-label={t(msg`查看星标朋友`)}
          >
            <Star aria-hidden="true" size={17} />
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
              placeholder={t(msg`搜索标签或联系人`)}
              // 走查 R1：父 label 没有可读文本节点；同 starred-friends-page R1 补
              // aria-label，避免屏阅器 focus 进来念"编辑栏 空"。autoCorrect/
              // autoCapitalize 关掉避免 iOS 句首大写把英文标签自动改写。
              aria-label={t(msg`搜索标签或联系人`)}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
              // zoom-in。跟 mobile-add-friend-page 已修过的搜索框对齐。
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
            {searchText ? (
              // 走查 R1：跟 world-characters-page / starred-friends-page R1 同口
              // 径补一键清空，方便长 query 重置。
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--text-dim)] active:bg-black/5"
                aria-label={t(msg`清空搜索`)}
              >
                <X aria-hidden="true" size={13} />
              </button>
            ) : null}
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {friendsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileTagStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在读取标签`)}
              description={t(msg`稍等一下，正在同步联系人标签和分组。`)}
              tone="loading"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileTagStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`标签页暂时不可用`)}
              description={describeRequestError(friendsQuery.error)}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={handleRetryTags}
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
        !tagGroups.length ? (
          <div className="px-4 pt-4">
            <MobileTagStatusCard
              badge={hasSearchText ? t(msg`暂无结果`) : t(msg`标签`)}
              title={
                hasSearchText
                  ? t(msg`没有找到匹配的标签`)
                  : t(msg`还没有联系人标签`)
              }
              description={
                hasSearchText
                  ? t(msg`换个标签名或联系人名称试试。`)
                  : t(msg`先在联系人资料里补上标签，通讯录标签页就会自动聚合。`)
              }
              action={
                hasSearchText ? (
                  // 走查新一轮 R1：跟 group-contacts-page / world-characters-page
                  // / starred-friends-page 同口径——搜索命中 0 条时主 CTA 应是
                  // 「清空搜索」回到完整标签列表，而不是无脑跳「查看星标朋友」/
                  // 「返回上一页」（用户搜了"alice"找不到，却被引导去星标朋友页
                  // 跟动作完全无关）。
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

        {tagGroups.length ? (
          <div className="space-y-3 pt-2">
            {tagGroups.map((group) => (
              <section
                key={group.tag}
                className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]"
              >
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--text-primary)]">
                    <Tag aria-hidden="true" size={14} className="text-[color:var(--brand-primary)]" />
                    {/* 通讯录 mobile 走查 R1：tag 名也是用户输入端（contacts-bulk-
                        action-bar 打标签 dialog / 资料页 tags 编辑），含 U+202E
                        可以反转后面的"N 位联系人"计数视觉。bulk action bar 在
                        写入端 strip 过，存量脏数据仍可能被列出，渲染再守一道。 */}
                    <span>{stripBidiControl(group.tag)}</span>
                  </div>
                  <div className="text-[10px] text-[color:var(--text-muted)]">
                    {t(msg`${group.items.length} 位联系人`)}
                  </div>
                </div>

                {group.items.map((item, index) => (
                  <TagFriendListRow
                    key={`${group.tag}-${item.character.id}`}
                    item={item}
                    index={index}
                    onSelect={handleSelectFriend}
                  />
                ))}
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

// Fresh 走查 R3：把 tag 下好友行抽出 + memo。yuanzui 实测 "朋友" 标签
// 下挂 ~190 人；search keystroke / friendsQuery 后台 refetch / 其它无关
// state 翻动都不再让全量 190 行 re-render。配合上方 useCallback 的
// onSelect 稳定，shallow compare 命中率最大化。
const TagFriendListRow = memo(function TagFriendListRow({
  item,
  index,
  onSelect,
}: {
  item: FriendListItem;
  index: number;
  onSelect: (characterId: string) => void;
}) {
  const handleClick = () => onSelect(item.character.id);
  const displayName = getFriendDisplayName(item);
  return (
    <button
      type="button"
      onClick={handleClick}
      // 走查新一轮 R3：跟 contacts-page FriendListRow / world-characters-page
      // / group-contacts-page Round 9 同口径补 yj-list-item-virtual。
      // buildContactTagGroups 命中搜索时整组全员展示（不只匹配项），
      // 即便用户只搜了 "alice" 仍会渲染该 tag 下全部 N 人；yuanzui
      // 当前唯一 tag "朋友" 下挂 ~190 位好友，一打开标签页就是 190
      // 个屏外按钮强制 layout/paint，content-visibility:auto +
      // contain-intrinsic-size 把屏外行延后渲染。
      className={cn(
        "yj-list-item-virtual flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]",
        index > 0
          ? "border-t border-[color:var(--border-faint)]"
          : undefined,
      )}
    >
      <AvatarChip
        // 通讯录 mobile 走查 R1：AvatarChip 把 name 落进 alt 属性，
        // 含 bidi 控制字符的名字会被屏幕阅读器播报到一半反向。
        // 和兄弟 starred-friends-page / world-characters-page 同口径。
        name={stripBidiControl(item.character.name)}
        src={item.character.avatar}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-[color:var(--text-primary)]">
          {displayName}
        </div>
        {displayName !== item.character.name ? (
          <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
            {/* 走查 R1：副标题在 remark 不等于真名时显示原 character.name，
                这里直接读没走 displayName，跟 starred-friends-page 同口径补 strip。 */}
            {stripBidiControl(item.character.name)}
          </div>
        ) : null}
      </div>
    </button>
  );
});

function MobileTagStatusCard({
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
            : "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]",
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
