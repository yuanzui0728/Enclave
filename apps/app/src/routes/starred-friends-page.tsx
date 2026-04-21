import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Search, Star, Tag } from "lucide-react";
import { getFriends, type FriendListItem } from "@yinjie/contracts";
import { AppPage, Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { buildDesktopContactsRouteHash } from "../features/contacts/contacts-route-state";
import {
  buildMobileContactDirectoryRouteHash,
  parseMobileContactDirectoryRouteState,
} from "../features/contacts/mobile-contact-directory-route-state";
import {
  getFriendDisplayName,
  matchesFriendSearch,
} from "../features/contacts/contact-utils";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function StarredFriendsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "starred-friends",
      }),
      replace: true,
    });
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title="正在切换到桌面星标朋友"
        description="星标朋友在桌面布局里并入了通讯录工作区，这里会自动带你打开对应视图。"
        loadingLabel="正在打开桌面星标朋友..."
      />
    );
  }

  return <MobileStarredFriendsPage />;
}

function MobileStarredFriendsPage() {
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

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const starredFriends = useMemo(
    () =>
      (friendsQuery.data ?? [])
        .filter((item) => item.friendship.isStarred)
        .sort(compareStarredFriends),
    [friendsQuery.data],
  );
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    if (!normalizedSearchText) {
      return starredFriends;
    }

    return starredFriends.filter((item) =>
      matchesFriendSearch(item, normalizedSearchText),
    );
  }, [normalizedSearchText, starredFriends]);

  useEffect(() => {
    if (searchText !== routeState.keyword) {
      setSearchText(routeState.keyword);
    }
  }, [routeState.keyword, searchText]);

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

  const statusBackLabel = safeReturnPath ? "返回上一页" : "查看联系人标签";

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="星标朋友"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={() =>
              navigateBackOrFallback(() => {
                if (navigateToRouteStateReturn()) {
                  return;
                }

                void navigate({ to: "/tabs/contacts" });
              })
            }
            aria-label="返回通讯录"
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
            aria-label="查看联系人标签"
          >
            <Tag size={17} />
          </Button>
        }
      >
        <div className="pt-1.5">
          <label className="flex h-7.5 items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[12px] text-[color:var(--text-dim)]">
            <Search size={14} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索星标朋友"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {friendsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileStarredFriendsStatusCard
              badge="读取中"
              title="正在读取星标朋友"
              description="稍等一下，正在同步你标记过的常联系好友。"
              tone="loading"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileStarredFriendsStatusCard
              badge="读取失败"
              title="星标朋友暂时不可用"
              description={friendsQuery.error.message}
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {statusBackLabel}
                </Button>
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
              badge={normalizedSearchText ? "暂无结果" : "星标"}
              title={
                normalizedSearchText
                  ? "没有找到匹配的星标朋友"
                  : "还没有星标朋友"
              }
              description={
                normalizedSearchText
                  ? "换个关键词再试试。"
                  : "先去联系人资料里把常联系的好友设为星标朋友。"
              }
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {statusBackLabel}
                </Button>
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
                className={cn(
                  "flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]",
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
                      {item.character.name}
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

function compareStarredFriends(left: FriendListItem, right: FriendListItem) {
  const starredAtDelta =
    getSortableTimestamp(right.friendship.starredAt) -
    getSortableTimestamp(left.friendship.starredAt);

  if (starredAtDelta !== 0) {
    return starredAtDelta;
  }

  const nameDiff = getFriendDisplayName(left).localeCompare(
    getFriendDisplayName(right),
    "zh-CN",
  );
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return left.character.id.localeCompare(right.character.id);
}

function getSortableTimestamp(value?: string) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
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
