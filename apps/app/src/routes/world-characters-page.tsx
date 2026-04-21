import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Search, UserPlus } from "lucide-react";
import { getFriends, listPresetCatalog } from "@yinjie/contracts";
import { AppPage, Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { buildMobileFriendRequestsRouteHash } from "../features/contacts/mobile-friend-requests-route-state";
import {
  buildContactSections,
  createWorldCharacterDirectoryItems,
  matchesCharacterSearch,
  shouldIncludeInWorldCharacterDirectory,
} from "../features/contacts/contact-utils";
import {
  buildWorldCharactersRouteHash,
  parseWorldCharactersRouteState,
} from "../features/contacts/world-characters-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopContactsRouteRedirectShell = lazy(async () => {
  const mod =
    await import("../features/contacts/contacts-route-redirect-shell");
  return { default: mod.ContactsRouteRedirectShell };
});

export function WorldCharactersPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在切换到桌面世界角色"
            description="正在跳转到桌面通讯录工作区中的世界角色视图。"
            loadingLabel="切换桌面世界角色..."
          />
        }
      >
        <DesktopContactsRouteRedirectShell
          pane="world-character"
          showWorldCharacters
        />
      </Suspense>
    );
  }

  return <MobileWorldCharactersPage />;
}

function MobileWorldCharactersPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseWorldCharactersRouteState(hash);
  const [searchText, setSearchText] = useState(routeState.keyword);
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildWorldCharactersRouteHash({
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
  const charactersQuery = useQuery({
    queryKey: ["app-preset-catalog", baseUrl],
    queryFn: () => listPresetCatalog(baseUrl),
  });

  const friendIds = useMemo(
    () =>
      new Set((friendsQuery.data ?? []).map(({ character }) => character.id)),
    [friendsQuery.data],
  );
  const worldCharacterItems = useMemo(
    () =>
      createWorldCharacterDirectoryItems(
        (charactersQuery.data ?? []).filter((character) =>
          shouldIncludeInWorldCharacterDirectory(character, friendIds),
        ),
      ),
    [charactersQuery.data, friendIds],
  );
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedSearchText) {
      return worldCharacterItems;
    }

    return worldCharacterItems.filter((item) =>
      matchesCharacterSearch(item.character, normalizedSearchText),
    );
  }, [normalizedSearchText, worldCharacterItems]);
  const sections = useMemo(
    () => buildContactSections(filteredItems),
    [filteredItems],
  );

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
      to: "/contacts/world-characters",
      hash: currentRouteHash,
      replace: true,
    });
  }, [currentRouteHash, navigate, normalizedHash]);

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

  function openFriendRequests() {
    void navigate({
      to: "/friend-requests",
      hash: buildMobileFriendRequestsRouteHash({
        returnPath: "/contacts/world-characters",
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    openFriendRequests();
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="世界角色"
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
            onClick={openFriendRequests}
            aria-label="查看新的朋友"
          >
            <UserPlus size={17} />
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
              placeholder="搜索世界角色"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {friendsQuery.isLoading || charactersQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileWorldCharactersStatusCard
              badge="读取中"
              title="正在读取世界角色"
              description="稍等一下，正在同步世界角色目录。"
              tone="loading"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileWorldCharactersStatusCard
              badge="读取失败"
              title="世界角色暂时不可用"
              description={friendsQuery.error.message}
              tone="danger"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {safeReturnPath ? "返回上一页" : "查看新的朋友"}
                </Button>
              }
            />
          </div>
        ) : null}
        {charactersQuery.isError && charactersQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileWorldCharactersStatusCard
              badge="读取失败"
              title="世界角色暂时不可用"
              description={charactersQuery.error.message}
              tone="danger"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {safeReturnPath ? "返回上一页" : "查看新的朋友"}
                </Button>
              }
            />
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !charactersQuery.isLoading &&
        !friendsQuery.isError &&
        !charactersQuery.isError &&
        !sections.length ? (
          <div className="px-4 pt-4">
            <MobileWorldCharactersStatusCard
              badge={normalizedSearchText ? "暂无结果" : "世界角色"}
              title={
                normalizedSearchText
                  ? "没有找到匹配的世界角色"
                  : "当前没有可展示的世界角色"
              }
              description={
                normalizedSearchText
                  ? "换个关键词再试试。"
                  : "稍后再回来看看，或者先去新的朋友里处理申请。"
              }
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {safeReturnPath ? "返回上一页" : "查看新的朋友"}
                </Button>
              }
            />
          </div>
        ) : null}

        {sections.length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="sticky top-[78px] z-10 bg-[rgba(247,247,247,0.94)] px-4 py-1 text-[11px] font-medium tracking-[0.06em] text-[color:var(--text-muted)] backdrop-blur">
                  {section.title}
                </div>
                {section.items.map((item, index) => (
                  <button
                    key={item.character.id}
                    type="button"
                    onClick={() => {
                      void navigate({
                        to: "/character/$characterId",
                        params: { characterId: item.character.id },
                        hash: buildCharacterDetailRouteHash({
                          returnPath: "/contacts/world-characters",
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
                      name={item.character.name}
                      src={item.character.avatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                        {item.character.name}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-[color:var(--text-muted)]">
                        {item.character.relationship ||
                          item.character.currentStatus?.trim() ||
                          "查看角色资料"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileWorldCharactersStatusCard({
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
