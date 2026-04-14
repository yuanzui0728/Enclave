export type MomentContentType =
  | "text"
  | "image_album"
  | "video"
  | "live_photo";

export interface MomentLivePhotoMetadata {
  enabled: boolean;
  motionUrl?: string;
}

export interface MomentImageAsset {
  id: string;
  kind: "image";
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  fileName: string;
  size: number;
  width?: number;
  height?: number;
  livePhoto?: MomentLivePhotoMetadata;
}

export interface MomentVideoAsset {
  id: string;
  kind: "video";
  url: string;
  posterUrl?: string;
  mimeType: string;
  fileName: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
}

export type MomentMediaAsset = MomentImageAsset | MomentVideoAsset;

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
  contentType: MomentContentType;
  media: MomentMediaAsset[];
  postedAt: string;
  likeCount: number;
  commentCount: number;
  likes: MomentLike[];
  comments: MomentComment[];
  interactions: MomentInteraction[];
}

export interface CreateUserMomentRequest {
  text?: string;
  location?: string;
  contentType?: MomentContentType;
  media?: MomentMediaAsset[];
}

export interface CreateMomentCommentRequest {
  text: string;
}

export interface ToggleMomentLikeResult {
  liked: boolean;
}

export interface UploadMomentMediaResponse {
  media: MomentMediaAsset;
}
