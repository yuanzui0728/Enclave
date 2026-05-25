// i18n-ignore-start: data / seed / preset content — not user-facing UI.

// 行为发生的"面"：朋友圈 / 广场 / 视频号。
export type BehaviorSurface = "moments" | "feed" | "channels";

// 归一化后的行为类型，跨朋友圈 / feed / 视频号统一口径。
// 注意：share = 分享到外部渠道；forward_to_chat = 转发帖子到聊天。
export type BehaviorType =
  | "comment"
  | "like"
  | "share"
  | "forward_to_chat"
  | "favorite"
  | "view"
  | "follow"
  | "not_interested"
  | "comment_like";

export type BehaviorSourceTable =
  | "moment_comments"
  | "moment_likes"
  | "feed_comments"
  | "user_feed_interactions"
  | "video_channel_follows";

export type BehaviorRecordExportFormat = "markdown" | "json";

// 单条归一化行为记录：合并 moment_comments / moment_likes / feed_comments /
// user_feed_interactions / video_channel_follows 多张异构表为一条时间线条目。
export interface AdminBehaviorRecord {
  // 加表前缀防止跨表 uuid 撞 key：mc:/ml:/fc:/fi:/vf:。
  id: string;
  surface: BehaviorSurface;
  behaviorType: BehaviorType;
  sourceTable: BehaviorSourceTable;
  sourceId: string;
  targetPostId: string | null; // follow 无帖子
  targetPostExcerpt: string | null; // 帖子标题/正文摘要，帖子已删则 null
  targetPostMediaType: string | null; // feed_posts.mediaType：text|image|video
  targetAuthorId: string | null; // 被互动帖子作者（follow 时为被关注作者）
  targetAuthorName: string | null;
  targetAuthorType: "user" | "character" | null;
  text: string | null; // 评论正文；非评论为 null
  payload: Record<string, unknown> | null; // 转发渠道 / 浏览进度 / commentId 等
  postMissing: boolean; // 互动指向的帖子已不存在
  createdAt: string; // ISO
}

export interface AdminBehaviorRecordListQuery {
  surface?: BehaviorSurface;
  behaviorType?: BehaviorType;
  dateFrom?: string;
  dateTo?: string;
  includeHiddenComments?: boolean; // 是否纳入 feed_comments.status='hidden'
  page?: number;
  pageSize?: number;
}

export interface AdminBehaviorRecordListResponse {
  items: AdminBehaviorRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminBehaviorCountBucket {
  key: string; // BehaviorType 或 BehaviorSurface 取值
  count: number;
}

export interface AdminBehaviorTrendPoint {
  date: string; // YYYY-MM-DD 本地日
  total: number;
  comment: number;
  like: number;
  share: number;
  forwardToChat: number;
  favorite: number;
  view: number;
  follow: number;
  notInterested: number;
  commentLike: number;
}

export interface AdminBehaviorTargetRank {
  authorId: string | null;
  authorName: string;
  authorType: "user" | "character" | null;
  count: number;
}

export interface AdminBehaviorPostRank {
  postId: string;
  surface: BehaviorSurface;
  excerpt: string | null;
  authorName: string | null;
  count: number; // 该帖子上主人的互动总数
}

export interface AdminBehaviorOwnerSummary {
  id: string;
  username: string;
  avatar: string | null;
}

export interface AdminBehaviorOverview {
  owner: AdminBehaviorOwnerSummary;
  totalBehaviorCount: number;
  behaviorCount7d: number;
  behaviorCount30d: number;
  countsByType: AdminBehaviorCountBucket[];
  countsBySurface: AdminBehaviorCountBucket[];
  trend7d: AdminBehaviorTrendPoint[];
  trend30d: AdminBehaviorTrendPoint[];
  activeDays7d: number;
  activeDays30d: number;
  mostActiveDay: string | null;
  mostActiveWeekday: string | null;
  topAuthors: AdminBehaviorTargetRank[];
  topPosts: AdminBehaviorPostRank[];
}

export interface AdminBehaviorRecordExportQuery {
  format?: BehaviorRecordExportFormat;
  surface?: BehaviorSurface;
  behaviorType?: BehaviorType;
  dateFrom?: string;
  dateTo?: string;
  includeHiddenComments?: boolean;
}

export interface AdminBehaviorRecordExportPayload {
  exportedAt: string;
  owner: AdminBehaviorOwnerSummary;
  filters: {
    surface: BehaviorSurface | null;
    behaviorType: BehaviorType | null;
    dateFrom: string | null;
    dateTo: string | null;
    includeHiddenComments: boolean;
  };
  total: number;
  records: AdminBehaviorRecord[];
}

export interface AdminBehaviorRecordExportResponse {
  format: BehaviorRecordExportFormat;
  fileName: string;
  contentType: string;
  content: string;
  payload: AdminBehaviorRecordExportPayload;
}
// i18n-ignore-end
