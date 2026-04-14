export type MomentContentType =
  | 'text'
  | 'image_album'
  | 'video'
  | 'live_photo';

export interface MomentLivePhotoMetadata {
  enabled: boolean;
  motionUrl?: string;
}

export interface MomentImageAsset {
  id: string;
  kind: 'image';
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
  kind: 'video';
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

export type CreateMomentInput = {
  text?: string;
  location?: string;
  contentType?: MomentContentType;
  media?: MomentMediaAsset[];
};
