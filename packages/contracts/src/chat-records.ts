import type {
  ChatMessageSearchResponse,
  Message,
  SearchChatMessagesQuery,
} from "./chat";
import type {
  TokenUsageBreakdownResponse,
  TokenUsageOverview,
  TokenUsageRecordListResponse,
  TokenUsageTrendPoint,
} from "./token-usage";

export type AdminChatRecordConversationSort =
  | "lastActivityAt"
  | "recentMessageCount30d"
  | "storedMessageCount";

export type AdminChatRecordActivityWindow = "all" | "7d" | "30d";
export type AdminChatRecordExportFormat = "markdown" | "json";
export type AdminChatRecordReviewStatus =
  | "backlog"
  | "watching"
  | "important"
  | "resolved";

export interface AdminChatRecordConversationListQuery {
  characterId?: string;
  includeHidden?: boolean;
  onlyReviewed?: boolean;
  dateFrom?: string;
  dateTo?: string;
  activityWindow?: AdminChatRecordActivityWindow;
  sortBy?: AdminChatRecordConversationSort;
  page?: number;
  pageSize?: number;
}

export interface AdminChatRecordConversationListItem {
  id: string;
  title: string;
  characterId: string | null;
  characterName: string;
  characterAvatar?: string | null;
  relationship?: string | null;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  lastClearedAt: string | null;
  hasClearedHistory: boolean;
  visibleMessageCount: number;
  storedMessageCount: number;
  recentMessageCount7d: number;
  recentMessageCount30d: number;
  lastVisibleMessage?: Message | null;
  lastStoredMessage?: Message | null;
  review?: AdminChatRecordConversationReview | null;
}

export interface AdminChatRecordConversationListResponse {
  items: AdminChatRecordConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminChatRecordOverview {
  totalConversationCount: number;
  activeConversationCount7d: number;
  activeConversationCount30d: number;
  messageCount7d: number;
  messageCount30d: number;
  requestCount30d: number;
  totalTokens30d: number;
  estimatedCost30d: number;
  currency: "CNY" | "USD";
}

export interface AdminChatRecordCharacterSummary {
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  isOnline: boolean;
  currentActivity?: string | null;
  expertDomains: string[];
  intimacyLevel: number;
  lastActiveAt?: string | null;
}

export interface AdminChatRecordConversationStats {
  includeClearedHistory: boolean;
  messageCount: number;
  visibleMessageCount: number;
  storedMessageCount: number;
  userMessageCount: number;
  characterMessageCount: number;
  proactiveMessageCount: number;
  attachmentMessageCount: number;
  systemMessageCount: number;
  recentMessageCount7d: number;
  recentMessageCount30d: number;
  firstResponseAverageMs: number | null;
  firstResponseMedianMs: number | null;
}

export interface AdminChatRecordConversationTrendPoint {
  date: string;
  totalMessages: number;
  userMessages: number;
  characterMessages: number;
  proactiveMessages: number;
  attachmentMessages: number;
}

export interface AdminChatRecordConversationMix {
  userShare: number;
  characterShare: number;
  proactiveShare: number;
  attachmentShare: number;
  systemShare: number;
}

export interface AdminChatRecordConversationInsight {
  activeDays7d: number;
  activeDays30d: number;
  averageMessagesPerActiveDay30d: number | null;
  lastUserMessageAt: string | null;
  lastCharacterMessageAt: string | null;
  mostActiveWeekday: string | null;
  mix: AdminChatRecordConversationMix;
  trend7d: AdminChatRecordConversationTrendPoint[];
  trend30d: AdminChatRecordConversationTrendPoint[];
}

export interface AdminChatRecordConversationReview {
  conversationId: string;
  status: AdminChatRecordReviewStatus;
  tags: string[];
  note?: string | null;
  hasNote: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminChatRecordConversationDetail {
  conversation: AdminChatRecordConversationListItem;
  character: AdminChatRecordCharacterSummary | null;
  stats: AdminChatRecordConversationStats;
  insight: AdminChatRecordConversationInsight;
  review: AdminChatRecordConversationReview | null;
}

export interface AdminChatRecordMessagesQuery {
  cursor?: string;
  limit?: number;
  aroundMessageId?: string;
  before?: number;
  after?: number;
  includeClearedHistory?: boolean;
}

export interface AdminChatRecordMessagesPage {
  items: Message[];
  total: number;
  nextCursor?: string;
  hasMore: boolean;
  mode: "latest" | "around";
  includeClearedHistory: boolean;
  aroundMessageId?: string | null;
}

export interface AdminChatRecordConversationSearchQuery
  extends SearchChatMessagesQuery {
  includeClearedHistory?: boolean;
}

export type AdminChatRecordConversationSearchResponse =
  ChatMessageSearchResponse;

export interface AdminChatRecordTokenUsageSummary {
  allTimeOverview: TokenUsageOverview;
  recent30dOverview: TokenUsageOverview;
  recent30dTrend: TokenUsageTrendPoint[];
  recent30dBreakdown: Pick<
    TokenUsageBreakdownResponse,
    "byScene" | "byModel" | "byBillingSource"
  >;
  recentRecords: TokenUsageRecordListResponse;
}

export interface AdminChatRecordConversationExportQuery {
  format?: AdminChatRecordExportFormat;
  includeClearedHistory?: boolean;
}

export interface AdminChatRecordConversationExportPayload {
  exportedAt: string;
  includeClearedHistory: boolean;
  conversation: AdminChatRecordConversationListItem;
  character: AdminChatRecordCharacterSummary | null;
  stats: AdminChatRecordConversationStats;
  insight: AdminChatRecordConversationInsight;
  review: AdminChatRecordConversationReview | null;
  messages: Message[];
  tokenUsage: AdminChatRecordTokenUsageSummary;
}

export interface AdminChatRecordConversationExportResponse {
  format: AdminChatRecordExportFormat;
  fileName: string;
  contentType: string;
  content: string;
  payload: AdminChatRecordConversationExportPayload;
}

export interface AdminChatRecordUpsertReviewRequest {
  status: AdminChatRecordReviewStatus;
  tags?: string[];
  note?: string | null;
}
