export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: "user" | "character";
  text: string;
  mediaUrl?: string;
  mediaType: "text" | "image" | "video";
  likeCount: number;
  commentCount: number;
  aiReacted: boolean;
  createdAt: string;
}

export interface FeedComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: "user" | "character";
  text: string;
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
}

export interface CreateFeedCommentRequest {
  text: string;
}
