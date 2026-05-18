import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Search, UserPlus, X } from "lucide-react";
import { getFriends, listCharacters } from "@yinjie/contracts";
import {
  translateRuntimeMessage,
  useRuntimeTranslator,
} from "@yinjie/i18n";
import { AppPage, Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { ContactIndexList } from "../features/contacts/contact-index-list";
import { parseDesktopContactsRouteState } from "../features/contacts/contacts-route-state";
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

const t = translateRuntimeMessage;

const DesktopContactsRouteRedirectShell = lazy(async () => {
  const mod =
    await import("../features/contacts/contacts-route-redirect-shell");
  return { default: mod.ContactsRouteRedirectShell };
});

export function WorldCharactersPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const desktopPaneState = useMemo(() => {
    const routeState = parseDesktopContactsRouteState(hash);
    return routeState.pane === "world-character" ? routeState : null;
  }, [hash]);

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在切换到桌面世界角色`)}
            description={t(msg`正在跳转到桌面通讯录工作区中的世界角色视图。`)}
            loadingLabel={t(msg`切换桌面世界角色...`)}
          />
        }
      >
        <DesktopContactsRouteRedirectShell
          pane="world-character"
          characterId={desktopPaneState?.characterId}
          showWorldCharacters
        />
      </Suspense>
    );
  }

  return <MobileWorldCharactersPage />;
}

function MobileWorldCharactersPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseWorldCharactersRouteState(hash);
  const [searchText, setSearchText] = useState(routeState.keyword);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [activeMobileIndexKey, setActiveMobileIndexKey] = useState<
    string | null
  >(null);
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
    // 走查第七轮 R1：从 /tabs/contacts 进世界角色列表（"通讯录-世界角色"）
    // 上一页 friend list 刚拉，这页又强制 refetch；跟 contacts-page 配齐 15s。
    staleTime: 15_000,
  });
  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
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
  const sectionsWithAnchors = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        scopedAnchorId: `world-character-${section.anchorId}`,
      })),
    [sections],
  );
  const mobileIndexItems = useMemo(
    () =>
      sectionsWithAnchors.map((section) => ({
        key: section.scopedAnchorId,
        indexLabel: section.indexLabel,
      })),
    [sectionsWithAnchors],
  );

  useEffect(() => {
    // 仅在 URL hash 变化时把 keyword 同步回本地 state（如浏览器前进/后退）。
    // 不能把 searchText 放进 deps —— 否则会和下面"searchText → URL"的 effect
    // 形成 setState ↔ navigate 死循环，每次按键都触发
    // "Maximum update depth exceeded"。functional setState 在值未变时会自然 bail out。
    setSearchText((current) =>
      current === routeState.keyword ? current : routeState.keyword,
    );
  }, [routeState.keyword]);

  useEffect(() => {
    if (normalizedSearchText || !sections.length) {
      setActiveMobileIndexKey(null);
      return;
    }

    setActiveMobileIndexKey((current) => {
      if (
        current &&
        mobileIndexItems.some((item) => item.key === current)
      ) {
        return current;
      }

      return mobileIndexItems[0]?.key ?? null;
    });
  }, [mobileIndexItems, normalizedSearchText, sections]);

  useEffect(() => {
    if (normalizedSearchText || !sections.length) {
      return;
    }

    const scrollContainer = pageRef.current?.parentElement;
    if (!scrollContainer) {
      return;
    }

    const syncActiveMobileIndexKey = () => {
      if (typeof document === "undefined") {
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const stickyOffset = 104;
      let nextActiveKey = mobileIndexItems[0]?.key ?? null;

      for (const item of mobileIndexItems) {
        const anchorElement = document.getElementById(item.key);
        if (!anchorElement) {
          continue;
        }

        const topOffset =
          anchorElement.getBoundingClientRect().top - containerRect.top;
        if (topOffset <= stickyOffset) {
          nextActiveKey = item.key;
        } else {
          break;
        }
      }

      setActiveMobileIndexKey((current) =>
        current === nextActiveKey ? current : nextActiveKey,
      );
    };

    syncActiveMobileIndexKey();
    scrollContainer.addEventListener("scroll", syncActiveMobileIndexKey, {
      passive: true,
    });

    return () => {
      scrollContainer.removeEventListener("scroll", syncActiveMobileIndexKey);
    };
  }, [mobileIndexItems, normalizedSearchText, sections]);

  function handleIndexJump(
    anchorId: string,
    behavior: ScrollBehavior = "smooth",
  ) {
    setActiveMobileIndexKey(anchorId);

    if (typeof document === "undefined") {
      return;
    }

    document.getElementById(anchorId)?.scrollIntoView({
      behavior,
      block: "start",
    });
  }

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

  function handleRetryWorldCharacters() {
    void Promise.all([friendsQuery.refetch(), charactersQuery.refetch()]);
  }

  return (
    <div ref={pageRef}>
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`世界角色`)}
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
            onClick={openFriendRequests}
            aria-label={t(msg`查看新的朋友`)}
          >
            <UserPlus size={17} />
          </Button>
        }
      >
        <div className="pt-1.5">
          <label className="flex h-9 items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[12px] text-[color:var(--text-dim)]">
            <Search size={14} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t(msg`搜索世界角色`)}
              // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
              // zoom-in，用户敲一下"搜索"立刻整页放大、回弹时还要双指捏才能回到
              // 正常视窗。跟 mobile-add-friend-page 已修过的搜索框对齐。
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
            {searchText ? (
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
        {friendsQuery.isLoading || charactersQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileWorldCharactersStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在读取世界角色`)}
              description={t(msg`稍等一下，正在同步世界角色目录。`)}
              tone="loading"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileWorldCharactersStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`世界角色暂时不可用`)}
              description={friendsQuery.error.message}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleRetryWorldCharacters}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`查看新的朋友`)}
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}
        {charactersQuery.isError && charactersQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileWorldCharactersStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`世界角色暂时不可用`)}
              description={charactersQuery.error.message}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleRetryWorldCharacters}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`查看新的朋友`)}
                  </Button>
                </div>
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
              badge={normalizedSearchText ? t(msg`暂无结果`) : t(msg`世界角色`)}
              title={
                normalizedSearchText
                  ? t(msg`没有找到匹配的世界角色`)
                  : t(msg`当前没有可展示的世界角色`)
              }
              description={
                normalizedSearchText
                  ? t(msg`换个关键词再试试。`)
                  : t(msg`稍后再回来看看，或者先去新的朋友里处理申请。`)
              }
              action={
                normalizedSearchText ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={() => setSearchText("")}
                  >
                    {t(msg`清空搜索`)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`查看新的朋友`)}
                  </Button>
                )
              }
            />
          </div>
        ) : null}

        {sectionsWithAnchors.length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {sectionsWithAnchors.map((section) => (
              <div key={section.key} id={section.scopedAnchorId}>
                <div className="bg-[rgba(247,247,247,0.94)] px-4 py-1 text-[11px] font-medium tracking-[0.06em] text-[color:var(--text-muted)]">
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
                      "yj-list-item-virtual flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]",
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
                          t(msg`查看角色资料`)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </section>
        ) : null}
      </div>

      {!normalizedSearchText && sections.length ? (
        <ContactIndexList
          items={mobileIndexItems}
          activeKey={activeMobileIndexKey}
          compact
          className="fixed right-0.5 top-[55%] z-30 -translate-y-1/2"
          onSelect={handleIndexJump}
        />
      ) : null}
    </AppPage>
    </div>
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
