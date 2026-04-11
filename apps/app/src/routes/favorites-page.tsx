import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getFavorites, removeFavorite } from "@yinjie/contracts";
import { TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import {
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  removeDesktopFavorite,
  type DesktopFavoriteCategory,
  type DesktopFavoriteRecord,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const categoryLabels: Array<{
  id: "all" | DesktopFavoriteCategory;
  label: string;
}> = [
  { id: "all", label: "全部" },
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

  const counts = useMemo(
    () => ({
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
    <div className="h-full overflow-auto bg-[#f3f3f3] px-6 py-6">
      <DesktopEntryShell
        badge="Favorites"
        title="收藏把跨频道的重要内容统一收住"
        description="桌面收藏已经接通搜索、聊天文件、朋友圈、广场动态、视频号和公众号阅读链路，把跨频道的重要内容统一收住。"
        aside={
          <div className="space-y-3">
            <StatCard label="当前收藏" value={`${favorites.length} 项`} />
            <StatCard
              label="内容流"
              value={`${counts.moments + counts.feed + counts.channels} 项`}
            />
            <StatCard
              label="消息与联系人"
              value={`${counts.messages + counts.contacts} 项`}
            />
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-[18px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <TextField
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索已收藏的消息、联系人、公众号或内容"
              className="rounded-[10px] border-black/8 bg-white px-4 py-3 shadow-none"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {categoryLabels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveCategory(item.id)}
                  className={cn(
                    "rounded-[10px] border px-4 py-2 text-xs font-medium transition",
                    activeCategory === item.id
                      ? "border-[rgba(7,193,96,0.20)] bg-[rgba(7,193,96,0.08)] text-[#1f8f4f]"
                      : "border-black/8 bg-white text-[color:var(--text-secondary)] hover:bg-[#efefef] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[240px_1fr]">
            <section className="space-y-3 rounded-[18px] border border-black/6 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
              <div className="text-xs tracking-[0.14em] text-[color:var(--text-dim)]">
                分类概览
              </div>
              <SummaryCard label="消息" count={counts.messages} />
              <SummaryCard label="联系人" count={counts.contacts} />
              <SummaryCard label="公众号" count={counts.officialAccounts} />
              <SummaryCard label="朋友圈" count={counts.moments} />
              <SummaryCard label="广场动态" count={counts.feed} />
              <SummaryCard label="视频号" count={counts.channels} />
            </section>

            <section className="space-y-3 rounded-[18px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
              {filteredFavorites.length ? (
                filteredFavorites.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[12px] border border-black/6 bg-[#fafafa] p-4"
                  >
                    <div className="flex items-start gap-4">
                      <AvatarChip
                        name={item.avatarName ?? item.title}
                        src={item.avatarSrc}
                        size="wechat"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                            {item.title}
                          </div>
                          <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2 py-0.5 text-[10px] font-medium text-[#1f8f4f]">
                            {item.badge}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {item.meta}
                        </div>
                        <div className="mt-3 line-clamp-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                          {item.description}
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <Link
                            to={item.to as never}
                            className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[#07c160] px-4 text-xs font-medium text-white hover:bg-[#06ad56]"
                          >
                            打开
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeMutation.mutate(item)}
                            disabled={removeMutation.isPending}
                            className="inline-flex h-9 items-center justify-center rounded-[10px] border border-black/8 bg-white px-4 text-xs text-[color:var(--text-secondary)] transition hover:bg-[#efefef] hover:text-[color:var(--text-primary)]"
                          >
                            取消收藏
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="还没有收藏内容"
                  description="先到搜一搜里把消息、联系人、公众号或内容流条目加入收藏。"
                />
              )}
            </section>
          </div>
        </div>
      </DesktopEntryShell>
    </div>
  );
}

function SummaryCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-[12px] border border-black/6 bg-[#fafafa] p-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
        {count}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-black/6 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
