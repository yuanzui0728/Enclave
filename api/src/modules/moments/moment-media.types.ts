export type MomentContentType =
  | 'text'
  | 'image_album'
  | 'video'
  | 'live_photo'
  | 'audio_card';

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
  // 由 AiOrchestratorService.describeImageFromUrl 一次性生成并落到 mediaPayload，
  // 让用文本模型（MiniMax-M2.7 这类不带 vision 的默认 provider）也能看到"图里有啥"，
  // 不再因为 supportsNativeImageInput=false 在 buildChatCompletionMessage 里被静默丢掉，
  // 角色就不会继续回"图片我看不到"了。
  imageCaption?: string;
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

export interface MomentAudioAsset {
  id: string;
  kind: 'audio';
  url: string;
  posterUrl?: string;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs?: number;
  title?: string;
  lyrics?: string;
}

export type MomentMediaAsset =
  | MomentImageAsset
  | MomentVideoAsset
  | MomentAudioAsset;

export type MomentVisibility = 'public' | 'friends' | 'private';

export type CreateMomentInput = {
  text?: string;
  location?: string;
  contentType?: MomentContentType;
  media?: MomentMediaAsset[];
  visibility?: MomentVisibility;
};
