import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getFavorites, removeFavorite } from "@yinjie/contracts";
import {
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { DesktopUtilityShell } from "../features/desktop/desktop-utility-shell";
import {
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  removeDesktopFavorite,
  type DesktopFavoriteCategory,
  type DesktopFavoriteRecord,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const categoryLabels: Array<{
  id: "all" | DesktopFavoriteCategory;
  label: string;
}> = [
  { id: "all", label: "全部收藏" },
  { id: "messages", label: "消息" },
  { id: "contacts", label: "联系人" },
  { id: "officialAccounts", label: "公众号" },
  { id: "moments", label: "朋友圈" },
  { id: "feed", label: "广场动态" },
  { id: "channels", label: "视频号" },
];

export function FavoritesPage() {
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [favorites, setFavorites] = useState(() =>
    mergeDesktopFavoriteRecords([], readDesktopFavorites()),
  );
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    "all" | DesktopFavoriteCategory
  >("all");
  const [selectedFavoriteSourceId, setSelectedFavoriteSourceId] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const deferredSearchText = useDeferredValue(searchText);
  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
  });

  const normalizedSearchText = deferredSearchText.trim().toLowerCase();

  useEffect(() => {
    setFavorites(
      mergeDesktopFavoriteRecords(
        favoritesQuery.data ?? [],
        readDesktopFavorites(),
      ),
    );
  }, [favoritesQuery.data]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const removeMutation = useMutation({
    mutationFn: async (item: DesktopFavoriteRecord) => {
      if (item.category === "messages") {
        await removeFavorite(item.sourceId, baseUrl);
      }

      const nextLocalFavorites = removeDesktopFavorite(item.sourceId);
      return { item, nextLocalFavorites };
    },
    onSuccess: async ({ item, nextLocalFavorites }) => {
      const nextRemoteFavorites =
        item.category === "messages"
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
        item.meta.toLowerCase().includes(normalizedSearchText)
      );
    });
  }, [activeCategory, favorites, normalizedSearchText]);

  useEffect(() => {
    if (
      selectedFavoriteSourceId &&
      filteredFavorites.some((item) => item.sourceId === selectedFavoriteSourceId)
    ) {
      return;
    }

    setSelectedFavoriteSourceId(filteredFavorites[0]?.sourceId ?? null);
  }, [filteredFavorites, selectedFavoriteSourceId]);

  const selectedFavorite =
    filteredFavorites.find((item) => item.sourceId === selectedFavoriteSourceId) ??
    null;

  const counts = useMemo(
    () => ({
      all: favorites.length,
      messages: favorites.filter((item) => item.category === "messages").length,
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
    return null;
  }

  return (
    <DesktopUtilityShell
      title="收藏"
      subtitle={
        normalizedSearchText
          ? `搜索“${searchText.trim()}”命中 ${filteredFavorites.length} 项`
          : `${counts.all} 项内容已收进桌面收藏`
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
                  label="消息与联系人"
                  value={`${counts.messages + counts.contacts} 项`}
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
                    name={selectedFavorite.avatarName ?? selectedFavorite.title}
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

                <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4">
                  <div className="text-xs text-[color:var(--text-muted)]">
                    内容摘要
                  </div>
                  <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                    {selectedFavorite.description}
                  </div>
                </div>

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
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    to={selectedFavorite.to as never}
                    className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[color:var(--brand-primary)] px-4 text-sm font-medium text-white transition hover:opacity-95"
                  >
                    打开内容
                  </Link>
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
      }
    >
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
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
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

function resolveFavoriteCategoryLabel(category: DesktopFavoriteCategory) {
  return (
    categoryLabels.find((item) => item.id === category)?.label ?? "未分类"
  );
}
