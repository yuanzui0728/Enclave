export interface MomentLike {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: "user" | "character";
  createdAt: string;
}

export interface MomentComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: "user" | "character";
  text: string;
  createdAt: string;
}

export interface MomentInteraction {
  characterId: string;
  characterName: string;
  type: "like" | "comment";
  commentText?: string;
  createdAt: string;
}

export interface Moment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: "user" | "character";
  text: string;
  location?: string;
  postedAt: string;
  likeCount: number;
  commentCount: number;
  likes: MomentLike[];
  comments: MomentComment[];
  interactions: MomentInteraction[];
}

export interface CreateUserMomentRequest {
  userId?: string;
  text: string;
}

export interface CreateMomentCommentRequest {
  authorId?: string;
  text: string;
}

export interface ToggleMomentLikeResult {
  liked: boolean;
}
