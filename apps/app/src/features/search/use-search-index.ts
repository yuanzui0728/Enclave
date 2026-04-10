import { useDeferredValue, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getConversationMessages,
  getConversations,
  getFeed,
  getFriends,
  getGroupMessages,
  getMoments,
  listCharacters,
  listOfficialAccounts,
} from "@yinjie/contracts";
import { sanitizeDisplayedChatText } from "../../lib/chat-text";
import {
  formatConversationTimestamp,
  formatMessageTimestamp,
  formatTimestamp,
  parseTimestamp,
} from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  emptySearchScopeCounts,
  type SearchCategory,
  type SearchResultItem,
} from "./search-types";
import {
  buildSearchMatchCounts,
  buildSearchPreview,
  filterSearchResults,
  groupSearchResults,
  normalizeSearchKeyword,
} from "./search-utils";

type SearchMessageRow = {
  conversationId: string;
  conversationTitle: string;
  conversationType: "direct" | "group";
  messageId: string;
  senderName: string;
  text: string;
  createdAt: string;
};

export function useSearchIndex(
  searchText: string,
  activeCategory: SearchCategory,
) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const deferredSearchText = useDeferredValue(searchText);
  const normalizedSearchText = normalizeSearchKeyword(deferredSearchText);

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

  const conversations = conversationsQuery.data ?? [];
  const conversationsSearchKey = useMemo(
    () =>
      conversations
        .map((item) => `${item.type}:${item.id}:${item.lastActivityAt}`)
        .join("|"),
    [conversations],
  );

  const messageSearchIndexQuery = useQuery({
    queryKey: ["app-search-message-index", baseUrl, conversationsSearchKey],
    enabled: Boolean(normalizedSearchText) && conversations.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const settledResults = await Promise.allSettled(
        conversations.map(async (conversation) => {
          const messages =
            conversation.type === "group"
              ? await getGroupMessages(conversation.id, baseUrl)
              : await getConversationMessages(conversation.id, baseUrl);

          return messages.map((message) => ({
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            conversationType: conversation.type,
            messageId: message.id,
            senderName: message.senderName,
            text:
              message.senderType === "user"
                ? message.text
                : sanitizeDisplayedChatText(message.text),
            createdAt: message.createdAt,
          }));
        }),
      );

      return settledResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      ) as SearchMessageRow[];
    },
  });

  const indexedResults = useMemo<SearchResultItem[]>(() => {
    const friendMap = new Map(
      (friendsQuery.data ?? []).map((item) => [item.character.id, item]),
    );

    const conversationResults: SearchResultItem[] = conversations.map(
      (conversation) => ({
        id: `conversation-${conversation.id}`,
        category: "messages",
        title: conversation.title,
        description:
          sanitizeDisplayedChatText(conversation.lastMessage?.text ?? "") ||
          "打开这个会话查看最近聊天记录。",
        meta: `${
          conversation.type === "group" ? "群聊" : "会话"
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
        badge: conversation.type === "group" ? "群聊" : "会话",
        avatarName: conversation.title,
        sortTime: parseTimestamp(conversation.lastActivityAt) ?? 0,
      }),
    );

    const globalMessageResults: SearchResultItem[] = (
      messageSearchIndexQuery.data ?? []
    )
      .filter((message) => {
        if (!normalizedSearchText) {
          return false;
        }

        return [message.text, message.senderName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearchText);
      })
      .map((message) => ({
        id: `message-${message.messageId}`,
        category: "messages",
        title: message.conversationTitle,
        description: `${message.senderName}：${buildSearchPreview(
          message.text || "这条消息没有可展示文本。",
          normalizedSearchText,
        )}`,
        meta: `聊天记录 · ${formatMessageTimestamp(message.createdAt)}`,
        keywords: [
          message.conversationTitle,
          message.senderName,
          message.text,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        to:
          message.conversationType === "group"
            ? `/group/${message.conversationId}`
            : `/chat/${message.conversationId}`,
        hash: `chat-message-${message.messageId}`,
        badge:
          message.conversationType === "group" ? "群聊记录" : "聊天记录",
        avatarName: message.conversationTitle,
        sortTime: parseTimestamp(message.createdAt) ?? 0,
      }));

    const contactResults: SearchResultItem[] = (
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
        sortTime: friend ? 2 : 1,
      };
    });

    const officialAccountResults: SearchResultItem[] = (
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
      sortTime: parseTimestamp(account.lastPublishedAt) ?? 0,
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
        to: "/tabs/moments",
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
        to: "/tabs/feed",
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
      ...officialAccountResults,
      ...momentResults,
      ...feedResults,
    ];
  }, [
    charactersQuery.data,
    conversations,
    feedQuery.data?.posts,
    friendsQuery.data,
    messageSearchIndexQuery.data,
    momentsQuery.data,
    normalizedSearchText,
    officialAccountsQuery.data,
  ]);

  const filteredResults = useMemo(
    () =>
      filterSearchResults(
        indexedResults,
        normalizedSearchText,
        activeCategory,
      ),
    [activeCategory, indexedResults, normalizedSearchText],
  );

  const groupedResults = useMemo(
    () => groupSearchResults(filteredResults),
    [filteredResults],
  );

  const matchedCounts = useMemo(
    () => buildSearchMatchCounts(filteredResults),
    [filteredResults],
  );

  const scopeCounts = useMemo(
    () => ({
      conversations: conversations.length,
      contacts: (charactersQuery.data ?? []).length,
      officialAccounts: (officialAccountsQuery.data ?? []).length,
      moments: (momentsQuery.data ?? []).length,
      feed: (feedQuery.data?.posts ?? []).length,
    }),
    [
      charactersQuery.data,
      conversations.length,
      feedQuery.data?.posts,
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
    normalizedSearchText,
    searchingMessages:
      Boolean(normalizedSearchText) && messageSearchIndexQuery.isLoading,
    scopeCounts: loading ? emptySearchScopeCounts : scopeCounts,
  };
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return null;
}
