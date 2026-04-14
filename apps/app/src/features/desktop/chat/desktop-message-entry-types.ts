import type {
  ConversationListItem,
  OfficialAccountServiceConversationSummary,
  OfficialAccountSubscriptionInboxSummary,
} from "@yinjie/contracts";

export type DesktopMessageEntry =
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
  subscriptionInboxSummary: OfficialAccountSubscriptionInboxSummary | null | undefined;
  serviceConversations: OfficialAccountServiceConversationSummary[];
  searchTerm: string;
  getConversationPreviewText: (conversation: ConversationListItem) => string;
}) {
  const normalizedKeyword = searchTerm.trim().toLowerCase();
  const entries: DesktopMessageEntry[] = [];

  if (
    subscriptionInboxSummary &&
    matchesDesktopMessageEntryKeyword(normalizedKeyword, [
      "订阅号消息",
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
      !matchesDesktopMessageEntryKeyword(normalizedKeyword, [
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
      !matchesDesktopMessageEntryKeyword(normalizedKeyword, [
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

    if (isDesktopMessageEntryPinned(left) && isDesktopMessageEntryPinned(right)) {
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

function matchesDesktopMessageEntryKeyword(
  normalizedKeyword: string,
  haystacks: Array<string | null | undefined>,
) {
  if (!normalizedKeyword) {
    return true;
  }

  return haystacks.some((haystack) =>
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
    entry.kind === "subscription-inbox"
      ? entry.summary.lastDeliveredAt
      : entry.kind === "service-account"
        ? entry.conversation.lastDeliveredAt
        : field === "pinned"
          ? entry.conversation.pinnedAt
          : entry.conversation.lastActivityAt;

  return rawTimestamp ? new Date(rawTimestamp).getTime() : 0;
}
