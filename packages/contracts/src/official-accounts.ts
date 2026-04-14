export type OfficialAccountType = "subscription" | "service";
export type OfficialAccountDeliveryKind =
  | "subscription_digest"
  | "service_notice";
export type OfficialAccountServiceMessageType = "text" | "article_card";

export interface UpdateOfficialAccountPreferencesRequest {
  isMuted?: boolean;
}

export interface OfficialAccountArticleSummary {
  id: string;
  accountId: string;
  title: string;
  summary: string;
  coverImage?: string;
  authorName: string;
  publishedAt: string;
  isPinned: boolean;
  readCount: number;
}

export interface OfficialAccountSummary {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  description: string;
  accountType: OfficialAccountType;
  coverImage?: string;
  isVerified: boolean;
  isFollowing: boolean;
  isMuted: boolean;
  mutedAt?: string;
  lastPublishedAt?: string;
  recentArticle?: OfficialAccountArticleSummary;
}

export interface OfficialAccountDetail extends OfficialAccountSummary {
  articles: OfficialAccountArticleSummary[];
}

export interface OfficialAccountArticleDetail
  extends OfficialAccountArticleSummary {
  account: OfficialAccountSummary;
  contentHtml: string;
  relatedArticles: OfficialAccountArticleSummary[];
}

export interface OfficialAccountDeliveryItem {
  id: string;
  accountId: string;
  articleId: string;
  deliveryKind: OfficialAccountDeliveryKind;
  deliveredAt: string;
  readAt?: string;
  account: OfficialAccountSummary;
  article: OfficialAccountArticleSummary;
}

export interface OfficialAccountSubscriptionInboxSummary {
  unreadCount: number;
  lastDeliveredAt?: string;
  preview?: string;
}

export interface OfficialAccountSubscriptionInboxGroup {
  account: OfficialAccountSummary;
  deliveries: OfficialAccountDeliveryItem[];
  unreadCount: number;
  lastDeliveredAt?: string;
}

export interface OfficialAccountServiceConversationSummary {
  accountId: string;
  account: OfficialAccountSummary;
  isMuted: boolean;
  mutedAt?: string;
  unreadCount: number;
  lastDeliveredAt?: string;
  preview?: string;
}

export interface OfficialAccountArticleCardAttachment {
  kind: "article_card";
  articleId: string;
  title: string;
  summary: string;
  coverImage?: string;
  publishedAt: string;
}

export interface OfficialAccountServiceMessage {
  id: string;
  accountId: string;
  type: OfficialAccountServiceMessageType;
  text: string;
  attachment?: OfficialAccountArticleCardAttachment;
  createdAt: string;
  readAt?: string;
}

export interface OfficialAccountMessageEntries {
  subscriptionInbox: OfficialAccountSubscriptionInboxSummary | null;
  serviceConversations: OfficialAccountServiceConversationSummary[];
}

export interface OfficialAccountSubscriptionInbox {
  summary: OfficialAccountSubscriptionInboxSummary | null;
  groups: OfficialAccountSubscriptionInboxGroup[];
}
