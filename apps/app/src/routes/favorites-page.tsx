import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  type DesktopFavoriteCategory,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

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
];

export function FavoritesPage() {
  const isDesktopLayout = useDesktopLayout();
  const [favorites, setFavorites] = useState(() => readDesktopFavorites());
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    "all" | DesktopFavoriteCategory
  >("all");
  const deferredSearchText = useDeferredValue(searchText);

  const normalizedSearchText = deferredSearchText.trim().toLowerCase();

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
    }),
    [favorites],
  );

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <div className="h-full overflow-auto px-6 py-6">
      <DesktopEntryShell
        badge="Favorites"
        title="收藏把跨频道的重要内容统一收住"
        description="首版先接通桌面本地收藏路径，让搜索结果可以立刻进入收藏工作区。后续再把聊天、文章和内容流里的收藏动作继续补进来。"
        aside={
          <div className="space-y-3">
            <StatCard label="当前收藏" value={`${favorites.length} 项`} />
            <StatCard
              label="内容流"
              value={`${counts.moments + counts.feed} 项`}
            />
            <StatCard
              label="消息与联系人"
              value={`${counts.messages + counts.contacts} 项`}
            />
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
            <TextField
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索已收藏的消息、联系人、公众号或内容"
              className="rounded-[18px] border-[color:var(--border-faint)] bg-[rgba(255,249,241,0.88)] px-4 py-3 shadow-none"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {categoryLabels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveCategory(item.id)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs font-medium transition",
                    activeCategory === item.id
                      ? "border-[rgba(249,115,22,0.20)] bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]"
                      : "border-[color:var(--border-faint)] bg-white/88 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[240px_1fr]">
            <section className="space-y-3 rounded-[28px] border border-[color:var(--border-faint)] bg-white/90 p-4 shadow-[var(--shadow-soft)]">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-dim)]">
                分类概览
              </div>
              <SummaryCard label="消息" count={counts.messages} />
              <SummaryCard label="联系人" count={counts.contacts} />
              <SummaryCard label="公众号" count={counts.officialAccounts} />
              <SummaryCard label="朋友圈" count={counts.moments} />
              <SummaryCard label="广场动态" count={counts.feed} />
            </section>

            <section className="space-y-3 rounded-[28px] border border-[color:var(--border-faint)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
              {filteredFavorites.length ? (
                filteredFavorites.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,252,247,0.82)] p-4"
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
                          <span className="rounded-full bg-[rgba(255,138,61,0.10)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]">
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
                            className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--brand-gradient)] px-4 text-xs font-medium text-white"
                          >
                            打开
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              const nextFavorites = removeDesktopFavorite(
                                item.sourceId,
                              );
                              setFavorites(nextFavorites);
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--border-faint)] px-4 text-xs text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
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
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,248,239,0.72)] p-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
        {count}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white/88 p-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
