export type FeedSurface = "feed" | "channels";
export type FeedAuthorType = "user" | "character";
export type FeedMediaType = "text" | "image" | "video";
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

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: FeedAuthorType;
  surface: FeedSurface;
  text: string;
  title?: string | null;
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
  text: string;
  title?: string;
  surface?: FeedSurface;
  mediaUrl?: string;
  coverUrl?: string;
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

export interface FeedViewRequest {
  progressSeconds?: number;
  completed?: boolean;
}

export interface FeedShareRequest {
  channel?: "native" | "copy" | "system" | "unknown";
}
