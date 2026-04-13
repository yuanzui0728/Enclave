import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Search, UserPlus } from "lucide-react";
import { getFriends, listCharacters } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  buildContactSections,
  createWorldCharacterDirectoryItems,
  matchesCharacterSearch,
} from "../features/contacts/contact-utils";
import {
  buildWorldCharactersRouteHash,
  parseWorldCharactersRouteState,
} from "../features/contacts/world-characters-route-state";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function WorldCharactersPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseWorldCharactersRouteState(hash);
  const [searchText, setSearchText] = useState(routeState.keyword);

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
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
        (charactersQuery.data ?? []).filter(
          (character) => !friendIds.has(character.id),
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
    const nextHash = buildWorldCharactersRouteHash({
      keyword: searchText,
    });
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (normalizedHash === (nextHash ?? "")) {
      return;
    }

    void navigate({
      to: "/contacts/world-characters",
      hash: nextHash,
      replace: true,
    });
  }, [hash, navigate, searchText]);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="世界角色"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pt-2.5 pb-2 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/contacts" });
              })
            }
            aria-label="返回通讯录"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
            onClick={() => {
              void navigate({ to: "/friend-requests" });
            }}
            aria-label="查看新的朋友"
          >
            <UserPlus size={18} />
          </Button>
        }
      >
        <div className="pt-2">
          <label className="flex items-center gap-2 rounded-[10px] bg-[color:var(--surface-console)] px-3 py-2 text-[13px] text-[color:var(--text-dim)]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索世界角色"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {friendsQuery.isLoading || charactersQuery.isLoading ? (
          <div className="px-4 pt-3">
            <LoadingBlock label="正在读取世界角色..." />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-3">
            <ErrorBlock message={friendsQuery.error.message} />
          </div>
        ) : null}
        {charactersQuery.isError && charactersQuery.error instanceof Error ? (
          <div className="px-4 pt-3">
            <ErrorBlock message={charactersQuery.error.message} />
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !charactersQuery.isLoading &&
        !friendsQuery.isError &&
        !charactersQuery.isError &&
        !sections.length ? (
          <div className="px-4 pt-5">
            <EmptyState
              title={
                normalizedSearchText
                  ? "没有找到匹配的世界角色"
                  : "当前没有新的世界角色"
              }
              description={
                normalizedSearchText
                  ? "换个关键词再试试。"
                  : "当前世界里的角色都已经在通讯录里了。"
              }
            />
          </div>
        ) : null}

        {sections.length ? (
          <section className="mt-1.5 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="sticky top-[82px] z-10 bg-[rgba(247,247,247,0.94)] px-4 py-1.5 text-xs font-medium tracking-[0.08em] text-[color:var(--text-muted)] backdrop-blur">
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
                      });
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-3 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]",
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
                      <div className="truncate text-[15px] text-[color:var(--text-primary)]">
                        {item.character.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
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
