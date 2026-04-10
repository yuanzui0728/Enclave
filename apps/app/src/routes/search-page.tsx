import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  getConversations,
  getFeed,
  getFriends,
  getMoments,
  listCharacters,
  listOfficialAccounts,
} from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import {
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
  type DesktopFavoriteCategory,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatConversationTimestamp, formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type SearchCategory =
  | "all"
  | "messages"
  | "contacts"
  | "officialAccounts"
  | "moments"
  | "feed"
  | "channels";

type SearchResultItem = {
  id: string;
  category: DesktopFavoriteCategory;
  title: string;
  description: string;
  meta: string;
  keywords: string;
  to: string;
  badge: string;
  avatarName?: string;
  avatarSrc?: string;
};

const categoryLabels: Array<{ id: SearchCategory; label: string }> = [
  { id: "all", label: "全部" },
  { id: "messages", label: "消息" },
  { id: "contacts", label: "联系人" },
  { id: "officialAccounts", label: "公众号" },
  { id: "moments", label: "朋友圈" },
  { id: "feed", label: "广场动态" },
  { id: "channels", label: "视频号" },
];

export function SearchPage() {
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("all");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const deferredSearchText = useDeferredValue(searchText);

  useEffect(() => {
    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, []);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });
  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });
  const officialAccountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
  });
  const momentsQuery = useQuery({
    queryKey: ["app-moments", baseUrl],
    queryFn: () => getMoments(baseUrl),
  });
  const feedQuery = useQuery({
    queryKey: ["app-feed", baseUrl],
    queryFn: () => getFeed(1, 20, baseUrl),
  });
  const channelsQuery = useQuery({
    queryKey: ["app-channels", baseUrl],
    queryFn: () => getFeed(1, 20, baseUrl, { surface: "channels" }),
  });

  const normalizedSearchText = deferredSearchText.trim().toLowerCase();

  const searchIndex = useMemo<SearchResultItem[]>(() => {
    const friendMap = new Map(
      (friendsQuery.data ?? []).map((item) => [item.character.id, item]),
    );
    const indexedContacts: SearchResultItem[] = (
      charactersQuery.data ?? []
    ).map((character) => {
      const friend = friendMap.get(character.id);
      const remarkName = friend?.friendship.remarkName?.trim() ?? "";
      const tagText = friend?.friendship.tags?.join(" ") ?? "";
      const title = remarkName || character.name;

      return {
        id: `contact-${character.id}`,
        category: "contacts",
        title,
        description:
          character.bio ||
          character.currentActivity ||
          character.relationship ||
          "查看联系人资料与聊天入口。",
        meta: friend
          ? `通讯录联系人 · ${character.relationship}`
          : `世界角色 · ${character.relationship}`,
        keywords: [
          title,
          character.name,
          remarkName,
          character.relationship,
          character.bio,
          character.currentActivity,
          character.currentStatus,
          tagText,
          friend?.friendship.region,
          friend?.friendship.source,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        to: `/character/${character.id}`,
        badge: friend ? "联系人" : "角色",
        avatarName: title,
        avatarSrc: character.avatar,
      };
    });

    const indexedConversations: SearchResultItem[] = (
      conversationsQuery.data ?? []
    ).map((conversation) => ({
      id: `conversation-${conversation.id}`,
      category: "messages",
      title: conversation.title,
      description:
        conversation.lastMessage?.text || "打开这个会话查看最近聊天记录。",
      meta: `${
        conversation.type === "group" ? "群聊" : "单聊"
      } · ${formatConversationTimestamp(conversation.lastActivityAt)}`,
      keywords: [
        conversation.title,
        conversation.lastMessage?.text,
        conversation.lastMessage?.senderName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      to:
        conversation.type === "group"
          ? `/group/${conversation.id}`
          : `/chat/${conversation.id}`,
      badge: conversation.type === "group" ? "群聊" : "消息",
      avatarName: conversation.title,
    }));

    const indexedOfficialAccounts: SearchResultItem[] = (
      officialAccountsQuery.data ?? []
    ).map((account) => ({
      id: `official-${account.id}`,
      category: "officialAccounts",
      title: account.name,
      description:
        account.recentArticle?.title ||
        account.description ||
        "查看公众号资料与最近文章。",
      meta: `${account.accountType === "service" ? "服务号" : "订阅号"} · @${
        account.handle
      }`,
      keywords: [
        account.name,
        account.handle,
        account.description,
        account.recentArticle?.title,
        account.recentArticle?.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      to: `/official-accounts/${account.id}`,
      badge: account.accountType === "service" ? "服务号" : "订阅号",
      avatarName: account.name,
      avatarSrc: account.avatar,
    }));

    const indexedMoments: SearchResultItem[] = (momentsQuery.data ?? []).map(
      (moment) => ({
        id: `moment-${moment.id}`,
        category: "moments",
        title: moment.authorName,
        description: moment.text,
        meta: `朋友圈 · ${formatTimestamp(moment.postedAt)}`,
        keywords: [
          moment.authorName,
          moment.text,
          moment.location,
          ...moment.comments.map((item) => `${item.authorName} ${item.text}`),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        to: "/tabs/moments",
        badge: "朋友圈",
        avatarName: moment.authorName,
        avatarSrc: moment.authorAvatar,
      }),
    );

    const indexedFeed: SearchResultItem[] = (feedQuery.data?.posts ?? []).map(
      (post) => ({
        id: `feed-${post.id}`,
        category: "feed",
        title: post.authorName,
        description: post.text,
        meta: `广场动态 · ${formatTimestamp(post.createdAt)}`,
        keywords: [
          post.authorName,
          post.text,
          ...post.commentsPreview.map(
            (item) => `${item.authorName} ${item.text}`,
          ),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        to: "/tabs/feed",
        badge: "广场动态",
        avatarName: post.authorName,
        avatarSrc: post.authorAvatar,
      }),
    );
    const indexedChannels: SearchResultItem[] = (
      channelsQuery.data?.posts ?? []
    ).map((post) => ({
      id: `channels-${post.id}`,
      category: "channels",
      title: post.authorName,
      description: post.text,
      meta: `视频号 · ${formatTimestamp(post.createdAt)}`,
      keywords: [
        post.authorName,
        post.text,
        ...post.commentsPreview.map((item) => `${item.authorName} ${item.text}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      to: "/tabs/channels",
      badge: "视频号",
      avatarName: post.authorName,
      avatarSrc: post.authorAvatar,
    }));

    return [
      ...indexedConversations,
      ...indexedContacts,
      ...indexedOfficialAccounts,
      ...indexedMoments,
      ...indexedFeed,
      ...indexedChannels,
    ];
  }, [
    charactersQuery.data,
    channelsQuery.data?.posts,
    conversationsQuery.data,
    feedQuery.data?.posts,
    friendsQuery.data,
    momentsQuery.data,
    officialAccountsQuery.data,
  ]);

  const filteredResults = useMemo(() => {
    return searchIndex.filter((item) => {
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
        item.keywords.includes(normalizedSearchText)
      );
    });
  }, [activeCategory, normalizedSearchText, searchIndex]);

  const resultCounts = useMemo(() => {
    return {
      messages: searchIndex.filter((item) => item.category === "messages")
        .length,
      contacts: searchIndex.filter((item) => item.category === "contacts")
        .length,
      officialAccounts: searchIndex.filter(
        (item) => item.category === "officialAccounts",
      ).length,
      moments: searchIndex.filter((item) => item.category === "moments").length,
      feed: searchIndex.filter((item) => item.category === "feed").length,
      channels: searchIndex.filter((item) => item.category === "channels")
        .length,
    };
  }, [searchIndex]);

  const loading =
    conversationsQuery.isLoading ||
    friendsQuery.isLoading ||
    charactersQuery.isLoading ||
    officialAccountsQuery.isLoading ||
    momentsQuery.isLoading ||
    feedQuery.isLoading ||
    channelsQuery.isLoading;

  const error =
    extractErrorMessage(conversationsQuery.error) ||
    extractErrorMessage(friendsQuery.error) ||
    extractErrorMessage(charactersQuery.error) ||
    extractErrorMessage(officialAccountsQuery.error) ||
    extractErrorMessage(momentsQuery.error) ||
    extractErrorMessage(feedQuery.error) ||
    extractErrorMessage(channelsQuery.error);

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <div className="h-full overflow-auto px-6 py-6">
      <DesktopEntryShell
        badge="Search"
        title="搜一搜把消息和内容流放进同一个桌面检索面"
        description="桌面版搜一搜先直接聚合现有会话、联系人、公众号、朋友圈、广场动态和视频号，不等独立搜索服务也能先对齐微信式搜索路径。"
        aside={
          <div className="space-y-3">
            <StatCard label="消息索引" value={`${resultCounts.messages} 条`} />
            <StatCard
              label="联系人与角色"
              value={`${resultCounts.contacts} 条`}
            />
            <StatCard
              label="内容流"
              value={`${resultCounts.moments + resultCounts.feed + resultCounts.channels} 条`}
            />
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]">
            <TextField
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索消息、联系人、公众号、朋友圈、广场动态或视频号"
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
              <CategorySummaryCard label="消息" count={resultCounts.messages} />
              <CategorySummaryCard
                label="联系人"
                count={resultCounts.contacts}
              />
              <CategorySummaryCard
                label="公众号"
                count={resultCounts.officialAccounts}
              />
              <CategorySummaryCard
                label="朋友圈"
                count={resultCounts.moments}
              />
              <CategorySummaryCard label="广场动态" count={resultCounts.feed} />
              <CategorySummaryCard label="视频号" count={resultCounts.channels} />
            </section>

            <section className="space-y-4 rounded-[28px] border border-[color:var(--border-faint)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    搜索结果
                  </div>
                  <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                    {normalizedSearchText
                      ? `关键词 “${normalizedSearchText}” 共匹配 ${filteredResults.length} 条结果。`
                      : "未输入关键词时，先展示各分类可检索内容。"}
                  </div>
                </div>
              </div>

              {loading ? (
                <LoadingBlock label="正在建立桌面搜索索引..." />
              ) : null}
              {error ? <ErrorBlock message={error} /> : null}

              {!loading && !error ? (
                filteredResults.length ? (
                  <div className="space-y-3">
                    {filteredResults.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,252,247,0.82)] p-4 transition hover:border-[rgba(249,115,22,0.16)] hover:bg-white"
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
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  const collected = favoriteSourceIds.includes(
                                    item.id,
                                  );
                                  const nextFavorites = collected
                                    ? removeDesktopFavorite(item.id)
                                    : upsertDesktopFavorite({
                                        id: `favorite-${item.id}`,
                                        sourceId: item.id,
                                        category: item.category,
                                        title: item.title,
                                        description: item.description,
                                        meta: item.meta,
                                        to: item.to,
                                        badge: item.badge,
                                        avatarName: item.avatarName,
                                        avatarSrc: item.avatarSrc,
                                      });

                                  setFavoriteSourceIds(
                                    nextFavorites.map(
                                      (favorite) => favorite.sourceId,
                                    ),
                                  );
                                }}
                                className="rounded-full"
                              >
                                {favoriteSourceIds.includes(item.id)
                                  ? "取消收藏"
                                  : "收藏"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="没有找到匹配结果"
                    description="换个关键词，或者切换到其他分类试试。"
                  />
                )
              ) : null}
            </section>
          </div>
        </div>
      </DesktopEntryShell>
    </div>
  );
}

function CategorySummaryCard({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
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

function extractErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}
