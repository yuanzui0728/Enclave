import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type {
  ConversationListItem,
  OfficialAccountServiceConversationSummary,
  OfficialAccountSubscriptionInboxSummary,
} from "@yinjie/contracts";

export type DesktopMessageEntry =
  | {
      kind: "official-accounts";
      id: "official-accounts";
      summary: {
        unreadCount: number;
        lastActivityAt?: string;
        preview: string;
      };
    }
  | {
      kind: "subscription-inbox";
      id: "subscription-inbox";
      summary: OfficialAccountSubscriptionInboxSummary;
    }
  | {
      kind: "service-account";
      id: `service-${string}`;
      conversation: OfficialAccountServiceConversationSummary;
    }
  | {
      kind: "conversation";
      id: string;
      conversation: ConversationListItem;
    };

export function buildDesktopMessageEntries({
  conversations,
  subscriptionInboxSummary,
  serviceConversations,
  searchTerm,
  getConversationPreviewText,
}: {
  conversations: ConversationListItem[];
  subscriptionInboxSummary:
    | OfficialAccountSubscriptionInboxSummary
    | null
    | undefined;
  serviceConversations: OfficialAccountServiceConversationSummary[];
  searchTerm: string;
  getConversationPreviewText: (conversation: ConversationListItem) => string;
}) {
  const normalizedKeyword = searchTerm.trim().toLowerCase();
  const entries: DesktopMessageEntry[] = [];
  const officialAccountsSummary = buildDesktopOfficialAccountsEntrySummary({
    subscriptionInboxSummary,
    serviceConversations,
  });

  if (
    matchesDesktopMessageEntryKeyword(normalizedKeyword, () => [
      translateRuntimeMessage(msg`公众号`),
      translateRuntimeMessage(msg`公众号消息`),
      translateRuntimeMessage(msg`公众号主页`),
      translateRuntimeMessage(msg`订阅号`),
      translateRuntimeMessage(msg`服务号`),
      officialAccountsSummary.preview,
    ])
  ) {
    entries.push({
      kind: "official-accounts",
      id: "official-accounts",
      summary: officialAccountsSummary,
    });
  }

  if (
    subscriptionInboxSummary &&
    matchesDesktopMessageEntryKeyword(normalizedKeyword, () => [
      translateRuntimeMessage(msg`订阅号消息`),
      subscriptionInboxSummary.preview,
    ])
  ) {
    entries.push({
      kind: "subscription-inbox",
      id: "subscription-inbox",
      summary: subscriptionInboxSummary,
    });
  }

  for (const conversation of serviceConversations) {
    if (
      !matchesDesktopMessageEntryKeyword(normalizedKeyword, () => [
        conversation.account.name,
        conversation.preview,
      ])
    ) {
      continue;
    }

    entries.push({
      kind: "service-account",
      id: `service-${conversation.accountId}`,
      conversation,
    });
  }

  for (const conversation of conversations) {
    if (
      !matchesDesktopMessageEntryKeyword(normalizedKeyword, () => [
        conversation.title,
        getConversationPreviewText(conversation),
      ])
    ) {
      continue;
    }

    entries.push({
      kind: "conversation",
      id: conversation.id,
      conversation,
    });
  }

  return entries.sort((left, right) => {
    const pinnedDifference =
      Number(isDesktopMessageEntryPinned(right)) -
      Number(isDesktopMessageEntryPinned(left));
    if (pinnedDifference !== 0) {
      return pinnedDifference;
    }

    if (
      isDesktopMessageEntryPinned(left) &&
      isDesktopMessageEntryPinned(right)
    ) {
      return (
        getDesktopMessageEntryTimestamp(right, "pinned") -
        getDesktopMessageEntryTimestamp(left, "pinned")
      );
    }

    return (
      getDesktopMessageEntryTimestamp(right, "activity") -
      getDesktopMessageEntryTimestamp(left, "activity")
    );
  });
}

function buildDesktopOfficialAccountsEntrySummary({
  subscriptionInboxSummary,
  serviceConversations,
}: {
  subscriptionInboxSummary:
    | OfficialAccountSubscriptionInboxSummary
    | null
    | undefined;
  serviceConversations: OfficialAccountServiceConversationSummary[];
}) {
  const unreadCount =
    (subscriptionInboxSummary?.unreadCount ?? 0) +
    serviceConversations.reduce(
      (total, conversation) => total + conversation.unreadCount,
      0,
    );
  const serviceCount = serviceConversations.length;
  const lastActivityAt = [
    subscriptionInboxSummary?.lastDeliveredAt,
    ...serviceConversations.map((conversation) => conversation.lastDeliveredAt),
  ]
    .filter(Boolean)
    .sort((left, right) => {
      const leftTimestamp = left ? new Date(left).getTime() : 0;
      const rightTimestamp = right ? new Date(right).getTime() : 0;
      return rightTimestamp - leftTimestamp;
    })[0];

  let preview = translateRuntimeMessage(
    msg`查看公众号主页、订阅号和服务号消息`,
  );
  if (serviceCount && subscriptionInboxSummary) {
    preview = translateRuntimeMessage(
      msg`服务号通知和订阅号文章都在这里查看`,
    );
  } else if (serviceCount) {
    preview = translateRuntimeMessage(msg`查看服务号通知和公众号主页`);
  } else if (subscriptionInboxSummary) {
    preview = translateRuntimeMessage(msg`查看订阅号文章和公众号主页`);
  }

  return {
    unreadCount,
    lastActivityAt,
    preview,
  };
}

// 走查新一轮 R19：原版 haystacks 是 Array 形式直接传 in；调用方在每个 entry
// kind 都 eager 构造一份 candidate 文案数组（其中
// getConversationPreviewText(conversation) 是非平凡函数：走
// localMessageActionState 解析撤回 / 提取 lastMessage / 生成 sender label /
// 拼 prefix）。但 keyword 为空时 line 200 直接 return true，那一整份 array
// 就白构造了。workspace 唯一调用方传 searchTerm: ""，意味着每次
// localMessageActionState / conversations 变更，N 个会话都会调用一次
// getConversationPreviewText，结果完全没人看。改成 haystacks 接 `() => Array`
// 的 lazy provider，keyword 为空时连一次预览拼装都不跑；普通 keyword 流程也
// 无影响（一次性 invoke）。
function matchesDesktopMessageEntryKeyword(
  normalizedKeyword: string,
  haystacks: () => Array<string | null | undefined>,
) {
  if (!normalizedKeyword) {
    return true;
  }

  return haystacks().some((haystack) =>
    haystack?.toLowerCase().includes(normalizedKeyword),
  );
}

function isDesktopMessageEntryPinned(entry: DesktopMessageEntry) {
  return entry.kind === "conversation" ? entry.conversation.isPinned : false;
}

function getDesktopMessageEntryTimestamp(
  entry: DesktopMessageEntry,
  field: "pinned" | "activity",
) {
  const rawTimestamp =
    entry.kind === "official-accounts"
      ? entry.summary.lastActivityAt
      : entry.kind === "subscription-inbox"
        ? entry.summary.lastDeliveredAt
        : entry.kind === "service-account"
          ? entry.conversation.lastDeliveredAt
          : field === "pinned"
            ? entry.conversation.pinnedAt
            : entry.conversation.lastActivityAt;

  return rawTimestamp ? new Date(rawTimestamp).getTime() : 0;
}
