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

export interface FeedPostWithComments extends FeedPost {
  comments: FeedComment[];
}

export interface FeedListResponse {
  posts: FeedPost[];
  total: number;
}

export interface CreateFeedPostRequest {
  authorId?: string;
  text: string;
}

export interface CreateFeedCommentRequest {
  authorId?: string;
  text: string;
}
