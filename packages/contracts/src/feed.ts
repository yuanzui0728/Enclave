import type {
  MomentImageAsset,
  MomentMediaAsset,
  MomentVideoAsset,
} from "./moments";

export type FeedSurface = "feed" | "channels";
export type FeedAuthorType = "user" | "character";
export type FeedMediaType = "text" | "image" | "video" | "audio";
export type FeedPublishStatus = "draft" | "published" | "hidden" | "deleted";
export type FeedSourceKind =
  | "seed"
  | "ai_generated"
  | "owner_upload"
  | "character_generated"
  | "live_clip";
export type FeedChannelHomeSection =
  | "recommended"
  | "friends"
  | "following"
  | "live";

export interface FeedPostOwnerState {
  hasLiked: boolean;
  hasFavorited: boolean;
  isFollowingAuthor: boolean;
  isNotInterested: boolean;
  hasViewed: boolean;
  hasShared: boolean;
  lastViewedAt?: string | null;
  watchProgressSeconds?: number | null;
  completed?: boolean;
}

export type FeedImageAsset = MomentImageAsset;
export type FeedVideoAsset = MomentVideoAsset;
export type FeedMediaAsset = MomentMediaAsset;

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: FeedAuthorType;
  visibility: "public" | "friends" | "private";
  canInteract: boolean;
  surface: FeedSurface;
  text: string;
  title?: string | null;
  media: FeedMediaAsset[];
  mediaUrl?: string;
  coverUrl?: string | null;
  mediaType: FeedMediaType;
  durationMs?: number | null;
  aspectRatio?: number | null;
  topicTags?: string[];
  publishStatus?: FeedPublishStatus;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  favoriteCount: number;
  viewCount: number;
  watchCount: number;
  completeCount: number;
  aiReacted: boolean;
  sourceKind?: FeedSourceKind;
  recommendationScore?: number;
  statsPayload?: Record<string, unknown> | null;
  ownerState?: FeedPostOwnerState;
  createdAt: string;
}

export interface FeedComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: FeedAuthorType;
  text: string;
  parentCommentId?: string | null;
  replyToCommentId?: string | null;
  replyToAuthorId?: string | null;
  // 当评论是另一条评论的回复时，附带该被回复评论作者的显示名。
  // 让 UI 在 commentsPreview 只截最后 3 条、被回复的根评论已超出 preview 窗口
  // 时，仍能渲出"回复 X：..."的上下文（否则原本是 lookup-by-id 漏 → 静默吞掉）。
  replyToAuthorName?: string | null;
  likeCount: number;
  status?: "published" | "hidden" | "deleted";
  likedByOwner?: boolean;
  createdAt: string;
}

export interface FeedPostListItem extends FeedPost {
  commentsPreview: FeedComment[];
}

export interface FeedPostWithComments extends FeedPost {
  comments: FeedComment[];
}

export interface FeedListResponse {
  posts: FeedPostListItem[];
  total: number;
}

export interface CreateFeedPostRequest {
  text?: string;
  title?: string;
  surface?: FeedSurface;
  media?: FeedMediaAsset[];
  mediaUrl?: string;
  coverUrl?: string | null;
  mediaType?: FeedMediaType;
  durationMs?: number;
  aspectRatio?: number;
  topicTags?: string[];
}

export interface CreateFeedCommentRequest {
  text: string;
}

export interface FeedChannelAuthorSummary {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: FeedAuthorType;
  followerCount: number;
  postCount: number;
  isFollowing: boolean;
  latestCreatedAt?: string | null;
}

export interface FeedChannelAuthorProfile {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: FeedAuthorType;
  bio?: string | null;
  followerCount: number;
  isFollowing: boolean;
  recentPosts: FeedPostListItem[];
}

export interface FeedChannelLiveEntry {
  id: string;
  postId: string;
  title: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  startedAt: string;
  status: "live" | "upcoming" | "replay";
  coverUrl?: string | null;
}

export interface FeedChannelHomeResponse {
  sections: Array<{
    key: FeedChannelHomeSection;
    label: string;
    count: number;
  }>;
  activeSection: FeedChannelHomeSection;
  posts: FeedPostListItem[];
  authors: FeedChannelAuthorSummary[];
  liveEntries: FeedChannelLiveEntry[];
  total: number;
}

// 视频号首页"装饰位"——sections 计数、作者推荐位、直播位、评论预览。
// 走第二个并行请求，不卡列表渲染（见 feed.service.ts getChannelHomeDecorations）。
export interface FeedChannelHomeDecorationsResponse {
  sections: Array<{
    key: FeedChannelHomeSection;
    label: string;
    count: number;
  }>;
  activeSection: FeedChannelHomeSection;
  authors: FeedChannelAuthorSummary[];
  liveEntries: FeedChannelLiveEntry[];
  commentsPreviewByPostId: Record<string, FeedComment[]>;
}

export interface FeedViewRequest {
  progressSeconds?: number;
  completed?: boolean;
}

export interface FeedShareRequest {
  channel?: "native" | "copy" | "system" | "unknown";
}
