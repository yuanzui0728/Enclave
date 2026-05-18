import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import {
  getFavoriteNotes,
  getFavorites,
  removeFavorite,
  type FavoriteNoteSummary,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";

import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import {
  computeDesktopFavoritesFingerprint,
  hydrateDesktopFavoritesFromNative,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  removeDesktopFavorite,
  type DesktopFavoriteCategory,
  type DesktopFavoriteRecord,
} from "../features/favorites/favorites-storage";
import { createDesktopNoteDraft } from "../features/favorites/note-drafts-storage";
import { buildMobileNoteEditorRouteHash } from "../features/notes/mobile-note-editor-route-state";
import { resolveSearchNavigationTarget } from "../features/search/search-navigation";
import {
  isDesktopOnlyPath,
  navigateBackOrFallback,
} from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { searchStringToObject } from "../lib/route-search";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type FilterId = "all" | DesktopFavoriteCategory;

const FAVORITE_NOTE_SOURCE_PREFIX = "favorite-note-";
const LONG_PRESS_DURATION_MS = 480;
const LONG_PRESS_MOVE_THRESHOLD_PX = 8;

function buildScratchDraftId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `note-draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function parseFavoriteNoteIdFromSourceId(sourceId: string) {
  return sourceId.startsWith(FAVORITE_NOTE_SOURCE_PREFIX)
    ? sourceId.slice(FAVORITE_NOTE_SOURCE_PREFIX.length) || null
    : null;
}

function resolveFavoriteNoteSummary(
  favorite: DesktopFavoriteRecord,
  noteSummaryMap: Map<string, FavoriteNoteSummary>,
) {
  if (favorite.category !== "notes") return null;
  const noteId = parseFavoriteNoteIdFromSourceId(favorite.sourceId);
  if (!noteId) return null;
  return noteSummaryMap.get(noteId) ?? null;
}

function resolveFavoriteNoteSearchText(
  favorite: DesktopFavoriteRecord,
  noteSummaryMap: Map<string, FavoriteNoteSummary>,
) {
  const summary = resolveFavoriteNoteSummary(favorite, noteSummaryMap);
  if (!summary) return "";
  const assetNames = summary.assets.map((item) => item.fileName).join(" ");
  return `${summary.excerpt} ${summary.tags.join(" ")} ${assetNames}`.toLowerCase();
}

export interface MobileFavoritesPageProps {
  showBackButton?: boolean;
}

export function MobileFavoritesPage({
  showBackButton = false,
}: MobileFavoritesPageProps) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // contacts 暂未在 UI 任何位置接入 upsertDesktopFavorite，永远 0；
  // 先不在筛选条里暴露，跟 desktop favorites-page 对齐（同样不展示）。
  // FavoriteCategory.contacts 类型保留以便日后接入"收藏联系人"。
  const filters: Array<{ id: FilterId; label: string }> = [
    { id: "all", label: t(msg`全部`) },
    { id: "messages", label: t(msg`消息`) },
    { id: "notes", label: t(msg`笔记`) },
    { id: "officialAccounts", label: t(msg`公众号`) },
    { id: "moments", label: t(msg`朋友圈`) },
    { id: "feed", label: t(msg`广场动态`) },
    { id: "channels", label: t(msg`视频号`) },
  ];

  const [favorites, setFavorites] = useState(() =>
    mergeDesktopFavoriteRecords([], readDesktopFavorites()),
  );
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionTarget, setActionTarget] =
    useState<DesktopFavoriteRecord | null>(null);

  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
  });
  const favoriteNotesQuery = useQuery({
    queryKey: ["favorite-notes", baseUrl],
    queryFn: () => getFavoriteNotes(baseUrl),
  });

  const favoriteNoteSummaryMap = useMemo(
    () =>
      new Map(
        (favoriteNotesQuery.data ?? []).map(
          (item) => [item.id, item] as const,
        ),
      ),
    [favoriteNotesQuery.data],
  );

  useEffect(() => {
    setFavorites(
      mergeDesktopFavoriteRecords(
        favoritesQuery.data ?? [],
        readDesktopFavorites(),
      ),
    );
  }, [favoritesQuery.data]);

  useEffect(() => {
    if (!nativeDesktopFavorites) return;
    let cancelled = false;

    async function syncFavorites() {
      const localFavorites = await hydrateDesktopFavoritesFromNative();
      if (cancelled) return;
      setFavorites((current) => {
        const nextFavorites = mergeDesktopFavoriteRecords(
          favoritesQuery.data ?? [],
          localFavorites,
        );
        // 跟 favorites-page.tsx 对齐：focus/visibilitychange 频繁触发，
        // JSON.stringify(700 项) 改成 sourceId+collectedAt 指纹。
        return computeDesktopFavoritesFingerprint(current) ===
          computeDesktopFavoritesFingerprint(nextFavorites)
          ? current
          : nextFavorites;
      });
    }

    const handleFocus = () => void syncFavorites();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncFavorites();
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
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredFavorites = useMemo(() => {
    return favorites.filter((item) => {
      if (activeFilter !== "all" && item.category !== activeFilter) {
        return false;
      }
      if (!normalizedSearchText) return true;
      return (
        item.title.toLowerCase().includes(normalizedSearchText) ||
        item.description.toLowerCase().includes(normalizedSearchText) ||
        item.meta.toLowerCase().includes(normalizedSearchText) ||
        resolveFavoriteNoteSearchText(item, favoriteNoteSummaryMap).includes(
          normalizedSearchText,
        )
      );
    });
  }, [
    activeFilter,
    favoriteNoteSummaryMap,
    favorites,
    normalizedSearchText,
  ]);

  const removeMutation = useMutation({
    mutationFn: async (item: DesktopFavoriteRecord) => {
      if (item.category === "messages" || item.category === "notes") {
        await removeFavorite(item.sourceId, baseUrl);
      }
      const nextLocalFavorites = removeDesktopFavorite(item.sourceId);
      return { item, nextLocalFavorites };
    },
    onSuccess: async ({ item, nextLocalFavorites }) => {
      // 走查 R1：之前 await fetchQuery 直接 throw 会让 onSuccess 整支抛、
      // setFavorites/setNotice 都不跑——但此时服务端 removeFavorite 已成功 +
      // 本地 removeDesktopFavorite 也写完了，数据真没了，UI 却还挂着被删项。
      // 用户再点同一个 → 服务端 404 / 500 一通报错；要么手动刷新页面、要么
      // 切走再回来才正常。这里给 fetchQuery 一层 try/catch：refetch 挂了就
      // 用 cached - removed 兜底，UI 仍然立即反映出删除结果。
      let nextRemoteFavorites: DesktopFavoriteRecord[];
      if (item.category === "messages" || item.category === "notes") {
        try {
          nextRemoteFavorites = await queryClient.fetchQuery({
            queryKey: ["app-favorites", baseUrl],
            queryFn: () => getFavorites(baseUrl),
            staleTime: 0,
          });
        } catch {
          const cached = favoritesQuery.data ?? [];
          nextRemoteFavorites = cached.filter(
            (record) => record.sourceId !== item.sourceId,
          );
        }
      } else {
        nextRemoteFavorites = favoritesQuery.data ?? [];
      }

      setFavorites(
        mergeDesktopFavoriteRecords(nextRemoteFavorites, nextLocalFavorites),
      );
      setNotice(t(msg`${item.title} 已从收藏中移除。`));
    },
  });

  function handleBack() {
    navigateBackOrFallback(
      () => {
        void navigate({ to: "/tabs/profile" });
      },
      "/tabs/profile",
    );
  }

  function handleCreateNote() {
    const draft = createDesktopNoteDraft();
    const safeReturnPath = isDesktopOnlyPath(pathname) ? undefined : pathname;
    const nextHash = buildMobileNoteEditorRouteHash({
      draftId: draft.draftId,
      returnPath: safeReturnPath,
    });
    void navigate({
      to: "/notes/new",
      ...(nextHash ? { hash: nextHash } : {}),
    });
  }

  function handleOpenFavorite(item: DesktopFavoriteRecord) {
    if (item.category === "notes") {
      const noteId = parseFavoriteNoteIdFromSourceId(item.sourceId);
      // 不要在这里预创建草稿。createDesktopNoteDraft 会落地一条空 draft，
      // 编辑器初始化拿到这条空 draft 后会锁死 sessionKey，
      // 等服务端 note 内容到达时不会再回填（mobile-note-editor-page.tsx:430-514）。
      // 只生成一个 draftId 字符串塞进 hash，编辑器自己会按 noteId 拉数据回填。
      const draftId = buildScratchDraftId();
      const safeReturnPath = isDesktopOnlyPath(pathname)
        ? undefined
        : pathname;
      const nextHash = buildMobileNoteEditorRouteHash({
        draftId,
        noteId: noteId ?? undefined,
        returnPath: safeReturnPath,
      });
      void navigate({
        to: "/notes/new",
        ...(nextHash ? { hash: nextHash } : {}),
      });
      return;
    }

    if (!item.to) return;
    const target = resolveSearchNavigationTarget(
      { to: item.to },
      { desktopLayout: false },
    );
    void navigate({
      to: target.to as never,
      search: searchStringToObject(target.search) as never,
      hash: target.hash,
    });
  }

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-0 py-0"
      style={{
        paddingBottom:
          "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))",
      }}
    >
      <TabPageTopBar
        title={t(msg`收藏`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          showBackButton ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/[0.04] active:bg-black/[0.05]"
              aria-label={t(msg`返回`)}
            >
              <ArrowLeft size={17} />
            </Button>
          ) : null
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCreateNote}
            className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/[0.04] active:bg-black/[0.05]"
            aria-label={t(msg`新建笔记`)}
          >
            <Plus size={18} strokeWidth={2.4} />
          </Button>
        }
      />

      <div className="border-b border-[color:var(--border-faint)] bg-white px-4 py-2">
        <TextField
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={t(msg`搜索已收藏内容`)}
          className="rounded-[12px] border-[color:var(--border-faint)] bg-white px-3 py-2 text-[14px] shadow-none"
        />
      </div>

      <div className="overflow-x-auto border-b border-[color:var(--border-faint)] bg-white px-4 py-2">
        <div className="flex gap-2 whitespace-nowrap">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] transition-colors",
                activeFilter === filter.id
                  ? "border-[#15803d] bg-[rgba(7,193,96,0.10)] text-[#15803d]"
                  : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] active:bg-[color:var(--surface-card-hover)]",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
        {/* 走查 R1：之前直接渲染 error.message，错失 describeRequestError 的
            i18n 兜底——removeFavorite/getFavorites 抛 ApiRequestError 时 message
            可能是裸英文 "Invalid or expired cloud access token." / 网络错误的
            "Failed to fetch"，en/ja/ko 用户也只看见原文。和 profile-feedback
            / profile-subscription / profile-info-* 同款翻译口径。 */}
        {removeMutation.isError ? (
          <ErrorBlock message={describeRequestError(removeMutation.error)} />
        ) : null}
        {favoritesQuery.isError ? (
          <ErrorBlock message={describeRequestError(favoritesQuery.error)} />
        ) : null}

        {favoritesQuery.isLoading && !favorites.length ? (
          <LoadingBlock label={t(msg`正在读取收藏…`)} />
        ) : null}

        {!favoritesQuery.isLoading && !filteredFavorites.length ? (
          <EmptyState
            title={
              normalizedSearchText
                ? t(msg`没有匹配的收藏`)
                : activeFilter === "notes"
                  ? // 笔记 tab 描述早就引导"点 + 新建笔记"，标题再说"还没有
                    // 收藏内容"就和描述对不上（"内容"模糊，描述只谈笔记）。
                    // 不论整体收藏多少，笔记 tab 空态都用"还没有笔记"，跟
                    // 描述里的 CTA 对齐。
                    t(msg`还没有笔记`)
                  : favorites.length && activeFilter !== "all"
                    ? // 用户已有别的分类收藏，但当前 filter 命中 0 项——别再说
                      // "还没有收藏内容"误导，引导切到其他分类。
                      t(msg`该分类下还没有收藏`)
                    : t(msg`还没有收藏内容`)
            }
            description={
              normalizedSearchText
                ? t(msg`换个关键词，或者切回其他分类继续查看。`)
                : activeFilter === "notes"
                  ? t(msg`点击右上角"新建笔记"，把第一条收藏笔记写下来。`)
                  : favorites.length && activeFilter !== "all"
                    ? t(msg`切到其他分类继续查看，或去对应入口把内容加入收藏。`)
                    : t(msg`先到聊天、内容流或公众号里把重要内容加入收藏。`)
            }
          />
        ) : null}

        {filteredFavorites.length ? (
          <ul className="space-y-2">
            {filteredFavorites.map((item) => (
              <li key={item.id}>
                <FavoriteRow
                  item={item}
                  noteSummary={resolveFavoriteNoteSummary(
                    item,
                    favoriteNoteSummaryMap,
                  )}
                  onOpen={() => handleOpenFavorite(item)}
                  onLongPress={() => setActionTarget(item)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <MobileDetailsActionSheet
        open={!!actionTarget}
        title={actionTarget?.title ?? t(msg`收藏操作`)}
        description={actionTarget?.meta || undefined}
        actions={
          actionTarget
            ? [
                {
                  key: "remove",
                  label: t(msg`取消收藏`),
                  danger: true,
                  disabled: removeMutation.isPending,
                  onClick: () => {
                    const target = actionTarget;
                    setActionTarget(null);
                    removeMutation.mutate(target);
                  },
                },
              ]
            : []
        }
        onClose={() => setActionTarget(null)}
      />
    </AppPage>
  );
}

interface FavoriteRowProps {
  item: DesktopFavoriteRecord;
  noteSummary: FavoriteNoteSummary | null;
  onOpen: () => void;
  onLongPress: () => void;
}

function FavoriteRow({
  item,
  noteSummary,
  onOpen,
  onLongPress,
}: FavoriteRowProps) {
  const t = useRuntimeTranslator();
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    firedRef.current = false;
    if (event.pointerType === "mouse") return;
    startRef.current = { x: event.clientX, y: event.clientY };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      timerRef.current = null;
      startRef.current = null;
      navigator.vibrate?.(15);
      onLongPress();
    }, LONG_PRESS_DURATION_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" || !startRef.current) return;
    if (
      Math.abs(event.clientX - startRef.current.x) >
        LONG_PRESS_MOVE_THRESHOLD_PX ||
      Math.abs(event.clientY - startRef.current.y) >
        LONG_PRESS_MOVE_THRESHOLD_PX
    ) {
      clearTimer();
    }
  };

  const handleClick = () => {
    if (firedRef.current) {
      firedRef.current = false;
      return;
    }
    onOpen();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      className="flex w-full items-start gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-3 py-3 text-left shadow-[var(--shadow-soft)] transition-colors active:bg-[color:var(--surface-card-hover)]"
      style={{ touchAction: "manipulation", WebkitUserSelect: "none" }}
    >
      <AvatarChip
        name={item.avatarName ?? item.title}
        src={item.avatarSrc}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
            {item.title}
          </div>
          {item.badge ? (
            <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.08)] px-1.5 py-0.5 text-[10px] text-[#15803d]">
              {item.badge}
            </span>
          ) : null}
        </div>
        {item.description && item.description !== item.title ? (
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
            {item.description}
          </div>
        ) : null}
        {item.meta ? (
          <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
            {item.meta}
          </div>
        ) : null}

        {noteSummary &&
        (noteSummary.tags.length || noteSummary.assets.length) ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {noteSummary.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] text-[#15803d]"
              >
                #{tag}
              </span>
            ))}
            {noteSummary.assets.length ? (
              <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
                {t(msg`附件 ${noteSummary.assets.length}`)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
}
