import {
  Suspense,
  lazy,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import {
  getFavoriteNotes,
  getFavorites,
  removeFavorite,
  type FavoriteNoteSummary,
} from "@yinjie/contracts";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { DesktopLayoutRequiredState } from "../components/desktop-layout-required-state";
import { EmptyState } from "../components/empty-state";
import { RouteRedirectState } from "../components/route-redirect-state";
import { DesktopUtilityShell } from "../features/shell/desktop-utility-shell";
import { buildDesktopNoteWindowRouteHash } from "../features/favorites/note-window-route-state";
import {
  buildDesktopFavoritesWorkspaceRouteHash,
  parseDesktopFavoritesRouteState,
} from "../features/favorites/favorites-route-state";
import { createDesktopNoteDraft } from "../features/favorites/note-drafts-storage";
import {
  hydrateDesktopFavoritesFromNative,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  removeDesktopFavorite,
  type DesktopFavoriteCategory,
  type DesktopFavoriteRecord,
} from "../features/favorites/favorites-storage";
import { resolveSearchNavigationTarget } from "../features/search/search-navigation";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { normalizePathname } from "../lib/normalize-pathname";
import { getCurrentWindowTargetPath } from "../runtime/desktop-windowing";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopNotesWorkspace = lazy(async () => {
  const mod = await import("../features/desktop/chat/desktop-notes-workspace");
  return { default: mod.DesktopNotesWorkspace };
});

const categoryLabels: Array<{
  id: "all" | DesktopFavoriteCategory;
  label: string;
}> = [
  { id: "all", label: "全部收藏" },
  { id: "messages", label: "消息" },
  { id: "notes", label: "笔记" },
  { id: "contacts", label: "联系人" },
  { id: "officialAccounts", label: "公众号" },
  { id: "moments", label: "朋友圈" },
  { id: "feed", label: "广场动态" },
  { id: "channels", label: "视频号" },
];

export function FavoritesPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(() => parseDesktopFavoritesRouteState(hash), [hash]);
  const [favorites, setFavorites] = useState(() =>
    mergeDesktopFavoriteRecords([], readDesktopFavorites()),
  );
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    "all" | DesktopFavoriteCategory
  >(routeState.workspace.category);
  const [selectedFavoriteSourceId, setSelectedFavoriteSourceId] = useState<
    string | null
  >(routeState.workspace.sourceId ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const deferredSearchText = useDeferredValue(searchText);
  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
    enabled: isDesktopLayout,
  });
  const favoriteNotesQuery = useQuery({
    queryKey: ["favorite-notes", baseUrl],
    queryFn: () => getFavoriteNotes(baseUrl),
    enabled: isDesktopLayout,
  });
  const noteEditorRouteState = routeState.noteEditor;
  const workspaceRouteState = routeState.workspace;
  const desktopFavoritesPath = "/tabs/favorites";
  const normalizedPathname = normalizePathname(pathname);
  const desktopPathMismatch =
    isDesktopLayout && normalizedPathname !== desktopFavoritesPath;

  const normalizedSearchText = deferredSearchText.trim().toLowerCase();
  const favoriteNoteSummaryMap = useMemo(() => {
    return new Map(
      (favoriteNotesQuery.data ?? []).map((item) => [item.id, item] as const),
    );
  }, [favoriteNotesQuery.data]);

  useEffect(() => {
    setFavorites(
      mergeDesktopFavoriteRecords(
        favoritesQuery.data ?? [],
        readDesktopFavorites(),
      ),
    );
  }, [favoritesQuery.data]);

  useEffect(() => {
    if (!nativeDesktopFavorites) {
      return;
    }

    let cancelled = false;

    async function syncFavorites() {
      const localFavorites = await hydrateDesktopFavoritesFromNative();
      if (cancelled) {
        return;
      }

      setFavorites((current) => {
        const nextFavorites = mergeDesktopFavoriteRecords(
          favoritesQuery.data ?? [],
          localFavorites,
        );
        return JSON.stringify(current) === JSON.stringify(nextFavorites)
          ? current
          : nextFavorites;
      });
    }

    const handleFocus = () => {
      void syncFavorites();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncFavorites();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [favoritesQuery.data, nativeDesktopFavorites]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!desktopPathMismatch) {
      return;
    }

    void navigate({
      to: desktopFavoritesPath,
      hash: hash || undefined,
      replace: true,
    });
  }, [desktopFavoritesPath, desktopPathMismatch, hash, navigate]);

  useEffect(() => {
    if (normalizedPathname !== desktopFavoritesPath || noteEditorRouteState) {
      return;
    }

    setActiveCategory((current) =>
      current === workspaceRouteState.category
        ? current
        : workspaceRouteState.category,
    );
  }, [
    desktopFavoritesPath,
    noteEditorRouteState,
    normalizedPathname,
    workspaceRouteState.category,
  ]);

  useEffect(() => {
    if (normalizedPathname !== desktopFavoritesPath || noteEditorRouteState) {
      return;
    }

    const nextSourceId = workspaceRouteState.sourceId ?? null;
    setSelectedFavoriteSourceId((current) =>
      current === nextSourceId ? current : nextSourceId,
    );
  }, [
    desktopFavoritesPath,
    noteEditorRouteState,
    normalizedPathname,
    workspaceRouteState.sourceId,
  ]);

  useEffect(() => {
    if (!noteEditorRouteState) {
      return;
    }

    setActiveCategory("notes");

    if (!noteEditorRouteState.noteId) {
      return;
    }

    setSelectedFavoriteSourceId(
      buildFavoriteNoteSourceId(noteEditorRouteState.noteId),
    );
  }, [noteEditorRouteState]);

  const removeMutation = useMutation({
    mutationFn: async (item: DesktopFavoriteRecord) => {
      if (item.category === "messages" || item.category === "notes") {
        await removeFavorite(item.sourceId, baseUrl);
      }

      const nextLocalFavorites = removeDesktopFavorite(item.sourceId);
      return { item, nextLocalFavorites };
    },
    onSuccess: async ({ item, nextLocalFavorites }) => {
      const nextRemoteFavorites =
        item.category === "messages" || item.category === "notes"
          ? await queryClient.fetchQuery({
              queryKey: ["app-favorites", baseUrl],
              queryFn: () => getFavorites(baseUrl),
            })
          : (favoritesQuery.data ?? []);

      setFavorites(
        mergeDesktopFavoriteRecords(nextRemoteFavorites, nextLocalFavorites),
      );
      setNotice(`${item.title} 已从收藏中移除。`);
    },
  });

  const filteredFavorites = useMemo(() => {
    return favorites.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) {
        return false;
      }

      if (!normalizedSearchText) {
        return true;
      }

      return (
        item.title.toLowerCase().includes(normalizedSearchText) ||
        item.description.toLowerCase().includes(normalizedSearchText) ||
        item.meta.toLowerCase().includes(normalizedSearchText) ||
        resolveFavoriteNoteSearchText(item, favoriteNoteSummaryMap).includes(
          normalizedSearchText,
        )
      );
    });
  }, [activeCategory, favoriteNoteSummaryMap, favorites, normalizedSearchText]);

  useEffect(() => {
    if (
      selectedFavoriteSourceId &&
      filteredFavorites.some(
        (item) => item.sourceId === selectedFavoriteSourceId,
      )
    ) {
      return;
    }

    setSelectedFavoriteSourceId(filteredFavorites[0]?.sourceId ?? null);
  }, [filteredFavorites, selectedFavoriteSourceId]);

  useEffect(() => {
    if (normalizedPathname !== desktopFavoritesPath || noteEditorRouteState) {
      return;
    }

    const nextHash = buildDesktopFavoritesWorkspaceRouteHash({
      category: activeCategory,
      sourceId: selectedFavoriteSourceId ?? undefined,
    });
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    void navigate({
      to: "/tabs/favorites",
      hash: nextHash,
      replace: true,
    });
  }, [
    activeCategory,
    desktopFavoritesPath,
    hash,
    navigate,
    noteEditorRouteState,
    normalizedPathname,
    selectedFavoriteSourceId,
  ]);

  const selectedFavorite =
    filteredFavorites.find(
      (item) => item.sourceId === selectedFavoriteSourceId,
    ) ?? null;
  const selectedFavoriteNavigationTarget = useMemo(
    () =>
      selectedFavorite && selectedFavorite.category !== "notes"
        ? resolveSearchNavigationTarget(
            { to: selectedFavorite.to },
            { desktopLayout: true },
          )
        : null,
    [selectedFavorite],
  );
  const selectedFavoriteNoteSummary = selectedFavorite
    ? resolveFavoriteNoteSummary(selectedFavorite, favoriteNoteSummaryMap)
    : null;

  const counts = useMemo(
    () => ({
      all: favorites.length,
      messages: favorites.filter((item) => item.category === "messages").length,
      notes: favorites.filter((item) => item.category === "notes").length,
      contacts: favorites.filter((item) => item.category === "contacts").length,
      officialAccounts: favorites.filter(
        (item) => item.category === "officialAccounts",
      ).length,
      moments: favorites.filter((item) => item.category === "moments").length,
      feed: favorites.filter((item) => item.category === "feed").length,
      channels: favorites.filter((item) => item.category === "channels").length,
    }),
    [favorites],
  );

  if (!isDesktopLayout) {
    return (
      <DesktopLayoutRequiredState
        title="收藏当前仅提供桌面布局"
        description="收藏工作区目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到消息页继续浏览和发送收藏内容。"
        actionLabel="返回消息"
        fallbackTo="/tabs/chat"
      />
    );
  }

  function openInlineNoteEditor(input?: {
    noteId?: string;
    draftId?: string;
    returnTo?: string;
  }) {
    const draft = createDesktopNoteDraft({
      draftId: input?.draftId,
      noteId: input?.noteId,
    });
    const workspaceHash = buildDesktopFavoritesWorkspaceRouteHash({
      category: activeCategory,
      sourceId: selectedFavoriteSourceId ?? undefined,
    });
    const fallbackReturnTo = `${desktopFavoritesPath}${
      workspaceHash ? `#${workspaceHash}` : ""
    }`;
    void navigate({
      to: desktopFavoritesPath,
      hash: buildDesktopNoteWindowRouteHash({
        draftId: draft.draftId,
        noteId: input?.noteId?.trim() || undefined,
        returnTo:
          input?.returnTo?.trim() ||
          (typeof window !== "undefined" && !desktopPathMismatch
            ? getCurrentWindowTargetPath()
            : fallbackReturnTo),
      }),
    });
  }

  return (
    <DesktopUtilityShell
      title="收藏"
      subtitle={
        noteEditorRouteState
          ? noteEditorRouteState.noteId
            ? "这条笔记默认属于收藏，保存后会继续留在收藏列表里。"
            : "新建笔记会直接作为收藏内容保存。"
          : normalizedSearchText
            ? `搜索“${searchText.trim()}”命中 ${filteredFavorites.length} 项`
            : `${counts.all} 项内容已收进桌面收藏`
      }
      toolbar={
        <Button
          variant="primary"
          size="sm"
          onClick={() => openInlineNoteEditor()}
          className="h-9 rounded-[10px] bg-[color:var(--brand-primary)] px-3 text-white hover:opacity-95"
        >
          <FileText size={15} />
          新建笔记
        </Button>
      }
      sidebar={
        <>
          <div className="border-b border-[color:var(--border-faint)] p-4">
            <TextField
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索已收藏内容"
              className="rounded-[12px] border-[color:var(--border-faint)] bg-white px-4 py-2.5 shadow-none"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="space-y-1">
              {categoryLabels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveCategory(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[12px] px-3 py-2.5 text-left text-sm transition",
                    activeCategory === item.id
                      ? "bg-[rgba(7,193,96,0.07)] text-[color:var(--text-primary)]"
                      : "text-[color:var(--text-secondary)] hover:bg-white/80 hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <span>{item.label}</span>
                  <span className="rounded-full bg-white/88 px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]">
                    {counts[item.id]}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-4">
              <div className="text-xs text-[color:var(--text-muted)]">
                收藏概览
              </div>
              <div className="mt-3 space-y-3">
                <FavoriteMetric
                  label="内容流"
                  value={`${counts.moments + counts.feed + counts.channels} 项`}
                />
                <FavoriteMetric
                  label="消息、笔记与联系人"
                  value={`${counts.messages + counts.notes + counts.contacts} 项`}
                />
                <FavoriteMetric
                  label="公众号"
                  value={`${counts.officialAccounts} 项`}
                />
              </div>
            </div>
          </div>
        </>
      }
      aside={
        noteEditorRouteState ? null : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                收藏详情
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                右侧预览当前选中的收藏条目。
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {selectedFavorite ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <AvatarChip
                      name={
                        selectedFavorite.avatarName ?? selectedFavorite.title
                      }
                      src={selectedFavorite.avatarSrc}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
                          {selectedFavorite.title}
                        </div>
                        <span className="rounded-full bg-[rgba(7,193,96,0.07)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]">
                          {selectedFavorite.badge}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {selectedFavorite.meta}
                      </div>
                    </div>
                  </div>

                  {selectedFavoriteNoteSummary ? (
                    <FavoriteNotePreview
                      summary={selectedFavoriteNoteSummary}
                    />
                  ) : (
                    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4">
                      <div className="text-xs text-[color:var(--text-muted)]">
                        内容摘要
                      </div>
                      <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                        {selectedFavorite.description}
                      </div>
                    </div>
                  )}

                  <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4">
                    <div className="text-xs text-[color:var(--text-muted)]">
                      收藏信息
                    </div>
                    <div className="mt-3 space-y-3">
                      <FavoriteMetric
                        label="分类"
                        value={resolveFavoriteCategoryLabel(
                          selectedFavorite.category,
                        )}
                      />
                      <FavoriteMetric
                        label="收藏时间"
                        value={formatTimestamp(selectedFavorite.collectedAt)}
                      />
                      {selectedFavoriteNoteSummary ? (
                        <FavoriteMetric
                          label="最近修改"
                          value={formatTimestamp(
                            selectedFavoriteNoteSummary.updatedAt,
                          )}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedFavorite.category === "notes" ? (
                      <button
                        type="button"
                        onClick={() => {
                          const noteId = parseFavoriteNoteIdFromSourceId(
                            selectedFavorite.sourceId,
                          );
                          if (!noteId) {
                            return;
                          }

                          openInlineNoteEditor({
                            noteId,
                          });
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[color:var(--brand-primary)] px-4 text-sm font-medium text-white transition hover:opacity-95"
                      >
                        打开笔记
                      </button>
                    ) : (
                      <Link
                        to={selectedFavoriteNavigationTarget?.to as never}
                        search={selectedFavoriteNavigationTarget?.search as never}
                        hash={selectedFavoriteNavigationTarget?.hash}
                        className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[color:var(--brand-primary)] px-4 text-sm font-medium text-white transition hover:opacity-95"
                      >
                        打开内容
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMutation.mutate(selectedFavorite)}
                      disabled={
                        removeMutation.isPending &&
                        removeMutation.variables?.sourceId ===
                          selectedFavorite.sourceId
                      }
                      className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white px-4 text-sm text-[color:var(--text-secondary)] transition hover:bg-[#f5f7f7] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {removeMutation.isPending &&
                      removeMutation.variables?.sourceId ===
                        selectedFavorite.sourceId
                        ? "移除中..."
                        : "取消收藏"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    title="先从中间选择一条收藏"
                    description="这里会显示摘要、来源和操作入口。"
                  />
                </div>
              )}
            </div>
          </div>
        )
      }
      contentClassName={
        noteEditorRouteState ? "min-h-0 overflow-hidden" : undefined
      }
    >
      {noteEditorRouteState ? (
        <Suspense
          fallback={
            <RouteRedirectState
              title="正在打开桌面笔记"
              description="正在载入桌面笔记工作区，马上恢复当前笔记内容。"
              loadingLabel="载入桌面笔记工作区..."
            />
          }
        >
          <DesktopNotesWorkspace
            selectedNoteId={noteEditorRouteState.noteId}
            draftId={noteEditorRouteState.draftId}
            returnTo={noteEditorRouteState.returnTo || "/tabs/favorites"}
            onSavedNote={(noteId, draftId) => {
              void navigate({
                to: "/tabs/favorites",
                hash: buildDesktopNoteWindowRouteHash({
                  draftId,
                  noteId,
                  returnTo: noteEditorRouteState.returnTo,
                }),
                replace: true,
              });
            }}
          />
        </Suspense>
      ) : (
        <div className="p-4">
          {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
          {favoritesQuery.isError && favoritesQuery.error instanceof Error ? (
            <div className="mb-4">
              <ErrorBlock message={favoritesQuery.error.message} />
            </div>
          ) : null}
          {removeMutation.isError && removeMutation.error instanceof Error ? (
            <div className="mb-4">
              <ErrorBlock message={removeMutation.error.message} />
            </div>
          ) : null}

          {favoritesQuery.isLoading && !favorites.length ? (
            <LoadingBlock label="正在读取收藏..." />
          ) : null}

          {!favoritesQuery.isLoading && !filteredFavorites.length ? (
            <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/80 p-6">
              <EmptyState
                title={
                  normalizedSearchText ? "没有匹配的收藏" : "还没有收藏内容"
                }
                description={
                  normalizedSearchText
                    ? "换个关键词，或者切回其他分类继续查看。"
                    : activeCategory === "notes"
                      ? "点击右上角“新建笔记”，把第一条收藏笔记写下来。"
                      : "先到聊天、内容流或公众号里把重要内容加入收藏。"
                }
              />
            </div>
          ) : null}

          {filteredFavorites.length ? (
            <div className="space-y-2">
              {filteredFavorites.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedFavoriteSourceId(item.sourceId)}
                  className={cn(
                    "flex w-full items-start gap-4 rounded-[14px] border px-4 py-4 text-left transition",
                    item.sourceId === selectedFavoriteSourceId
                      ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[var(--shadow-soft)]"
                      : "border-[color:var(--border-faint)] bg-white hover:bg-[rgba(255,255,255,0.92)]",
                  )}
                >
                  <AvatarChip
                    name={item.avatarName ?? item.title}
                    src={item.avatarSrc}
                    size="wechat"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {item.title}
                      </div>
                      <span className="rounded-full bg-[rgba(7,193,96,0.07)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]">
                        {item.badge}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {item.meta}
                    </div>
                    <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                      {item.description}
                    </div>
                    {renderFavoriteListExtra(
                      item,
                      resolveFavoriteNoteSummary(item, favoriteNoteSummaryMap),
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </DesktopUtilityShell>
  );
}

function FavoriteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-[color:var(--text-muted)]">{label}</span>
      <span className="text-right text-[color:var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}

function FavoriteNotePreview({ summary }: { summary: FavoriteNoteSummary }) {
  const imageCount = summary.assets.filter(
    (item) => item.kind === "image",
  ).length;
  const fileCount = summary.assets.filter(
    (item) => item.kind === "file",
  ).length;

  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,#ffffff_0%,#f8faf9_100%)] shadow-[var(--shadow-soft)]">
      <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-3">
        <div className="text-xs text-[color:var(--text-muted)]">笔记预览</div>
        <div className="mt-2 line-clamp-2 text-[15px] font-medium leading-7 text-[color:var(--text-primary)]">
          {summary.title}
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div className="rounded-[14px] border border-[rgba(15,23,42,0.06)] bg-white px-4 py-4 text-[13px] leading-7 text-[color:var(--text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          {summary.excerpt || "这条笔记还没有正文摘要。"}
        </div>
        {summary.tags.length ? (
          <div className="flex flex-wrap gap-2">
            {summary.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[rgba(7,193,96,0.08)] px-2.5 py-1 text-[11px] text-[color:var(--brand-primary)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
        {summary.assets.length ? (
          <div className="flex flex-wrap gap-2">
            {imageCount ? (
              <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                图片 {imageCount}
              </span>
            ) : null}
            {fileCount ? (
              <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                文件 {fileCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function resolveFavoriteCategoryLabel(category: DesktopFavoriteCategory) {
  return categoryLabels.find((item) => item.id === category)?.label ?? "未分类";
}

function parseFavoriteNoteIdFromSourceId(sourceId: string) {
  return sourceId.startsWith("favorite-note-")
    ? sourceId.slice("favorite-note-".length) || null
    : null;
}

function buildFavoriteNoteSourceId(noteId: string) {
  return `favorite-note-${noteId}`;
}

function resolveFavoriteNoteSummary(
  favorite: DesktopFavoriteRecord,
  noteSummaryMap: Map<string, FavoriteNoteSummary>,
) {
  if (favorite.category !== "notes") {
    return null;
  }

  const noteId = parseFavoriteNoteIdFromSourceId(favorite.sourceId);
  if (!noteId) {
    return null;
  }

  return noteSummaryMap.get(noteId) ?? null;
}

function resolveFavoriteNoteSearchText(
  favorite: DesktopFavoriteRecord,
  noteSummaryMap: Map<string, FavoriteNoteSummary>,
) {
  const summary = resolveFavoriteNoteSummary(favorite, noteSummaryMap);
  if (!summary) {
    return "";
  }

  const assetNames = summary.assets.map((item) => item.fileName).join(" ");
  return `${summary.excerpt} ${summary.tags.join(" ")} ${assetNames}`.toLowerCase();
}

function renderFavoriteListExtra(
  favorite: DesktopFavoriteRecord,
  summary: FavoriteNoteSummary | null,
) {
  if (favorite.category !== "notes" || !summary) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {summary.tags.slice(0, 3).map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]"
        >
          #{tag}
        </span>
      ))}
      {summary.assets.length ? (
        <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
          附件 {summary.assets.length}
        </span>
      ) : null}
    </div>
  );
}
