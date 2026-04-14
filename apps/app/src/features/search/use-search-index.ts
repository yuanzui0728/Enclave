import { useDeferredValue, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getConversations,
  getFeed,
  getFriends,
  getMoments,
  getOfficialAccountArticles,
  listCharacters,
  listOfficialAccounts,
  searchConversationMessages,
  searchGroupMessages,
} from "@yinjie/contracts";
import { sanitizeDisplayedChatText } from "../../lib/chat-text";
import {
  formatConversationTimestamp,
  formatMessageTimestamp,
  formatTimestamp,
  parseTimestamp,
} from "../../lib/format";
import { getConversationOpenFallback } from "../../lib/conversation-preview";
import {
  getConversationThreadLabel,
  getConversationThreadPath,
  getConversationThreadType,
  isPersistedGroupConversation,
} from "../../lib/conversation-route";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  shouldHideSearchableChatMessage,
  useLocalChatMessageActionState,
} from "../chat/local-chat-message-actions";
import { getFriendDisplayName } from "../contacts/contact-utils";
import {
  emptySearchScopeCounts,
  type SearchCategory,
  type SearchMessageGroup,
  type SearchOfficialAccountGroup,
  type SearchResultItem,
} from "./search-types";
import { useDesktopSearchQuickLinks } from "./desktop-search-quick-links";
import {
  buildSearchMatchCounts,
  buildSearchPreview,
  filterSearchResults,
  groupSearchResults,
  sortSearchResults,
  normalizeSearchKeyword,
} from "./search-utils";

type SearchMessageRow = {
  conversationId: string;
  conversationTitle: string;
  conversationType: "direct" | "group";
  conversationSource?: "conversation" | "group";
  messageId: string;
  senderName: string;
  text: string;
  createdAt: string;
};

export function useSearchIndex(
  searchText: string,
  activeCategory: SearchCategory,
  isDesktopLayout: boolean,
) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const localMessageActionState = useLocalChatMessageActionState();
  const deferredSearchText = useDeferredValue(searchText);
  const normalizedSearchText = normalizeSearchKeyword(deferredSearchText);
  const {
    favoriteSearchResults,
    miniProgramSearchResults,
    recentFavorites,
    recentMiniPrograms,
  } = useDesktopSearchQuickLinks(deferredSearchText, isDesktopLayout);

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

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const officialAccounts = useMemo(
    () => officialAccountsQuery.data ?? [],
    [officialAccountsQuery.data],
  );
  const conversationsSearchKey = useMemo(
    () =>
      conversations
        .map(
          (item) =>
            `${item.source ?? item.type}:${item.id}:${item.lastActivityAt}`,
        )
        .join("|"),
    [conversations],
  );
  const officialAccountsSearchKey = useMemo(
    () =>
      officialAccounts
        .map((item) => `${item.id}:${item.lastPublishedAt ?? "none"}`)
        .join("|"),
    [officialAccounts],
  );

  const messageSearchIndexQuery = useQuery({
    queryKey: [
      "app-search-message-index",
      baseUrl,
      conversationsSearchKey,
      normalizedSearchText,
    ],
    enabled: Boolean(normalizedSearchText) && conversations.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const settledResults = await Promise.allSettled(
        conversations.map(async (conversation) => {
          const response = isPersistedGroupConversation(conversation)
            ? await searchGroupMessages(
                conversation.id,
                {
                  keyword: normalizedSearchText,
                  limit: 8,
                },
                baseUrl,
              )
            : await searchConversationMessages(
                conversation.id,
                {
                  keyword: normalizedSearchText,
                  limit: 8,
                },
                baseUrl,
              );

          return response.items.map((message) => ({
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            conversationType: getConversationThreadType(conversation),
            conversationSource: conversation.source,
            messageId: message.messageId,
            senderName: message.senderName,
            text: message.previewText || "这条消息没有可展示文本。",
            createdAt: message.createdAt,
          }));
        }),
      );

      return settledResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      ) as SearchMessageRow[];
    },
  });
  const officialAccountArticlesQuery = useQuery({
    queryKey: [
      "app-search-official-account-articles",
      baseUrl,
      officialAccountsSearchKey,
    ],
    enabled: Boolean(normalizedSearchText) && officialAccounts.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const settledResults = await Promise.allSettled(
        officialAccounts.map(async (account) => {
          const articles = await getOfficialAccountArticles(
            account.id,
            baseUrl,
          );
          return articles.map((article) => ({ account, article }));
        }),
      );

      return settledResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
    },
  });

  const indexedResults = useMemo<SearchResultItem[]>(() => {
    const friendMap = new Map(
      (friendsQuery.data ?? []).map((item) => [item.character.id, item]),
    );

    const conversationResults: SearchResultItem[] = conversations.map(
      (conversation) => {
        const conversationLabel = getConversationThreadLabel(conversation);
        const lastMessageVisible =
          !conversation.lastMessage ||
          !shouldHideSearchableChatMessage(
            conversation.lastMessage.id,
            localMessageActionState,
          );
        const lastMessageText = lastMessageVisible
          ? sanitizeDisplayedChatText(conversation.lastMessage?.text ?? "")
          : "";

        return {
          id: `conversation-${conversation.id}`,
          category: "messages",
          title: conversation.title,
          description:
            lastMessageText || getConversationOpenFallback(conversation),
          meta: `${conversationLabel} · ${formatConversationTimestamp(conversation.lastActivityAt)}`,
          keywords: [
            conversation.title,
            lastMessageVisible ? conversation.lastMessage?.text : "",
            lastMessageVisible ? conversation.lastMessage?.senderName : "",
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
          to: getConversationThreadPath(conversation),
          badge: conversationLabel,
          avatarName: conversation.title,
          sortTime: parseTimestamp(conversation.lastActivityAt) ?? 0,
        };
      },
    );

    const globalMessageResults: SearchResultItem[] = (
      messageSearchIndexQuery.data ?? []
    )
      .filter(
        (message) =>
          !shouldHideSearchableChatMessage(
            message.messageId,
            localMessageActionState,
          ),
      )
      .map((message) => ({
        id: `message-${message.messageId}`,
        category: "messages",
        title: message.conversationTitle,
        description: `${message.senderName}：${buildSearchPreview(
          message.text || "这条消息没有可展示文本。",
          normalizedSearchText,
        )}`,
        meta: `聊天记录 · ${formatMessageTimestamp(message.createdAt)}`,
        keywords: [message.conversationTitle, message.senderName, message.text]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        to: getConversationThreadPath({
          id: message.conversationId,
          type: message.conversationType,
          source: message.conversationSource,
        }),
        hash: `chat-message-${message.messageId}`,
        badge:
          getConversationThreadType({
            type: message.conversationType,
            source: message.conversationSource,
          }) === "group"
            ? "群聊记录"
            : "单聊记录",
        avatarName: message.conversationTitle,
        sortTime: parseTimestamp(message.createdAt) ?? 0,
      }));

    const contactResults: SearchResultItem[] = (charactersQuery.data ?? []).map(
      (character) => {
        const friend = friendMap.get(character.id);
        const remarkName = friend?.friendship.remarkName?.trim() ?? "";
        const displayName = friend
          ? getFriendDisplayName(friend)
          : character.name;
        const tagText = friend?.friendship.tags?.join(" ") ?? "";

        return {
          id: `contact-${character.id}`,
          category: "contacts",
          title: displayName,
          description:
            displayName !== character.name
              ? `昵称：${character.name}`
              : character.bio ||
                character.currentActivity ||
                character.relationship ||
                "查看联系人资料与聊天入口。",
          meta: friend
            ? `通讯录联系人 · ${character.relationship}`
            : `世界角色 · ${character.relationship}`,
          keywords: [
            displayName,
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
          avatarName: displayName,
          avatarSrc: character.avatar,
          sortTime: friend ? 2 : 1,
        };
      },
    );

    const officialAccountResults: SearchResultItem[] = officialAccounts.map(
      (account) => ({
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
        sortTime: parseTimestamp(account.lastPublishedAt) ?? 0,
      }),
    );
    const officialAccountArticleResults: SearchResultItem[] = (
      officialAccountArticlesQuery.data ?? []
    ).map(({ account, article }) => ({
      id: `official-article:${account.id}:${article.id}`,
      category: "officialAccounts",
      title: article.title,
      description: article.summary || `来自 ${account.name} 的公众号文章`,
      meta: `公众号文章 · ${account.name} · ${formatTimestamp(article.publishedAt)}`,
      keywords: [
        account.name,
        account.handle,
        article.title,
        article.summary,
        article.authorName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      to: `/official-accounts/articles/${article.id}`,
      badge: "公众号文章",
      avatarName: account.name,
      avatarSrc: account.avatar,
      sortTime: parseTimestamp(article.publishedAt) ?? 0,
    }));

    const momentResults: SearchResultItem[] = (momentsQuery.data ?? []).map(
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
        to: isDesktopLayout ? "/tabs/moments" : "/discover/moments",
        hash: buildSearchMomentHash(moment.id),
        badge: "朋友圈",
        avatarName: moment.authorName,
        avatarSrc: moment.authorAvatar,
        sortTime: parseTimestamp(moment.postedAt) ?? 0,
      }),
    );

    const feedResults: SearchResultItem[] = (feedQuery.data?.posts ?? []).map(
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
        to: isDesktopLayout ? "/tabs/feed" : "/discover/feed",
        hash: buildSearchFeedHash(post.id),
        badge: "广场动态",
        avatarName: post.authorName,
        avatarSrc: post.authorAvatar,
        sortTime: parseTimestamp(post.createdAt) ?? 0,
      }),
    );

    return [
      ...conversationResults,
      ...globalMessageResults,
      ...contactResults,
      ...favoriteSearchResults,
      ...officialAccountResults,
      ...officialAccountArticleResults,
      ...miniProgramSearchResults,
      ...momentResults,
      ...feedResults,
    ];
  }, [
    charactersQuery.data,
    conversations,
    feedQuery.data?.posts,
    friendsQuery.data,
    favoriteSearchResults,
    localMessageActionState,
    messageSearchIndexQuery.data,
    miniProgramSearchResults,
    momentsQuery.data,
    normalizedSearchText,
    officialAccountArticlesQuery.data,
    officialAccounts,
    isDesktopLayout,
  ]);

  const messageGroups = useMemo<SearchMessageGroup[]>(() => {
    if (!normalizedSearchText) {
      return [] as SearchMessageGroup[];
    }

    const conversationResults = indexedResults.filter(
      (item) =>
        item.category === "messages" && item.id.startsWith("conversation-"),
    );
    const conversationResultById = new Map(
      conversationResults.map((item) => [
        item.id.replace(/^conversation-/, ""),
        item,
      ]),
    );
    const messageResults = filterSearchResults(
      indexedResults.filter(
        (item) =>
          item.category === "messages" && item.id.startsWith("message-"),
      ),
      normalizedSearchText,
      "messages",
    );
    const groupedMessages = new Map<string, SearchResultItem[]>();

    for (const item of messageResults) {
      const conversationId = resolveMessageConversationId(item.to);
      if (!conversationId) {
        continue;
      }

      const current = groupedMessages.get(conversationId);
      if (current) {
        current.push(item);
        continue;
      }

      groupedMessages.set(conversationId, [item]);
    }

    return Array.from(groupedMessages.entries())
      .map(([conversationId, messages]) => {
        const header = conversationResultById.get(conversationId);
        if (!header) {
          return null;
        }

        return {
          id: `message-group-${conversationId}`,
          header,
          totalHits: messages.length,
          messages: [...messages]
            .sort((left, right) => right.sortTime - left.sortTime)
            .slice(0, 3),
          sortTime: Math.max(
            header.sortTime,
            messages[0]?.sortTime ?? header.sortTime,
          ),
        };
      })
      .filter((item): item is SearchMessageGroup => Boolean(item))
      .sort((left, right) => {
        if (left.sortTime !== right.sortTime) {
          return right.sortTime - left.sortTime;
        }

        return sortSearchResults(
          left.header,
          right.header,
          normalizedSearchText,
        );
      });
  }, [indexedResults, normalizedSearchText]);

  const officialAccountGroups = useMemo<SearchOfficialAccountGroup[]>(() => {
    if (!normalizedSearchText) {
      return [] as SearchOfficialAccountGroup[];
    }

    const officialAccountResults = indexedResults.filter(
      (item) =>
        item.category === "officialAccounts" &&
        item.id.startsWith("official-") &&
        !item.id.startsWith("official-article:"),
    );
    const officialAccountResultById = new Map(
      officialAccountResults.map((item) => [
        item.id.replace(/^official-/, ""),
        item,
      ]),
    );
    const articleResults = filterSearchResults(
      indexedResults.filter(
        (item) =>
          item.category === "officialAccounts" &&
          item.id.startsWith("official-article:"),
      ),
      normalizedSearchText,
      "officialAccounts",
    );
    const groupedArticles = new Map<string, SearchResultItem[]>();

    for (const item of articleResults) {
      const accountId = resolveOfficialAccountId(item.id);
      if (!accountId) {
        continue;
      }

      const current = groupedArticles.get(accountId);
      if (current) {
        current.push(item);
        continue;
      }

      groupedArticles.set(accountId, [item]);
    }

    return Array.from(groupedArticles.entries())
      .map(([accountId, articles]) => {
        const header = officialAccountResultById.get(accountId);
        if (!header) {
          return null;
        }

        return {
          id: `official-account-group-${accountId}`,
          header,
          totalHits: articles.length,
          articles: [...articles]
            .sort((left, right) => right.sortTime - left.sortTime)
            .slice(0, 3),
          sortTime: Math.max(
            header.sortTime,
            articles[0]?.sortTime ?? header.sortTime,
          ),
        };
      })
      .filter((item): item is SearchOfficialAccountGroup => Boolean(item))
      .sort((left, right) => {
        if (left.sortTime !== right.sortTime) {
          return right.sortTime - left.sortTime;
        }

        return sortSearchResults(
          left.header,
          right.header,
          normalizedSearchText,
        );
      });
  }, [indexedResults, normalizedSearchText]);

  const allMatchedResults = useMemo(
    () => filterSearchResults(indexedResults, normalizedSearchText, "all"),
    [indexedResults, normalizedSearchText],
  );

  const filteredResults = useMemo(
    () =>
      activeCategory === "all"
        ? allMatchedResults
        : filterSearchResults(indexedResults, normalizedSearchText, activeCategory),
    [activeCategory, allMatchedResults, indexedResults, normalizedSearchText],
  );

  const groupedResults = useMemo(
    () => groupSearchResults(allMatchedResults),
    [allMatchedResults],
  );

  const matchedCounts = useMemo(
    () => buildSearchMatchCounts(allMatchedResults),
    [allMatchedResults],
  );

  const scopeCounts = useMemo(
    () => ({
      conversations: conversations.length,
      contacts: (charactersQuery.data ?? []).length,
      favorites: favoriteSearchResults.length,
      officialAccounts: (officialAccountsQuery.data ?? []).length,
      miniPrograms: miniProgramSearchResults.length,
      moments: (momentsQuery.data ?? []).length,
      feed: (feedQuery.data?.posts ?? []).length,
    }),
    [
      charactersQuery.data,
      conversations.length,
      feedQuery.data?.posts,
      favoriteSearchResults.length,
      miniProgramSearchResults.length,
      momentsQuery.data,
      officialAccountsQuery.data,
    ],
  );

  const loading =
    conversationsQuery.isLoading ||
    friendsQuery.isLoading ||
    charactersQuery.isLoading ||
    officialAccountsQuery.isLoading ||
    momentsQuery.isLoading ||
    feedQuery.isLoading;

  const error =
    extractErrorMessage(conversationsQuery.error) ||
    extractErrorMessage(friendsQuery.error) ||
    extractErrorMessage(charactersQuery.error) ||
    extractErrorMessage(officialAccountsQuery.error) ||
    extractErrorMessage(officialAccountArticlesQuery.error) ||
    extractErrorMessage(momentsQuery.error) ||
    extractErrorMessage(feedQuery.error) ||
    extractErrorMessage(messageSearchIndexQuery.error);

  return {
    error,
    filteredResults,
    groupedResults,
    hasKeyword: Boolean(normalizedSearchText),
    loading,
    matchedCounts,
    messageGroups,
    officialAccountGroups,
    normalizedSearchText,
    recentFavorites,
    recentMiniPrograms,
    searchingMessages:
      Boolean(normalizedSearchText) && messageSearchIndexQuery.isLoading,
    scopeCounts: loading ? emptySearchScopeCounts : scopeCounts,
  };
}

function buildSearchMomentHash(momentId: string) {
  const params = new URLSearchParams();
  params.set("moment", momentId);
  return params.toString();
}

function buildSearchFeedHash(postId: string) {
  const params = new URLSearchParams();
  params.set("post", postId);
  return params.toString();
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return null;
}

function resolveMessageConversationId(to: string) {
  const match = to.match(/\/(?:chat|group)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function resolveOfficialAccountId(resultId: string) {
  const match = resultId.match(/^official-article:([^:]+):/);
  return match?.[1] ?? null;
}
