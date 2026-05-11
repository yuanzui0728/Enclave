import type { FavoriteNoteAsset } from "./favorites";
import type { FollowupRecommendationAttachmentMetadata } from "./followup-runtime";

export interface StickerAttachment {
  kind: "sticker";
  sourceType?: "builtin" | "custom";
  packId?: string;
  stickerId: string;
  url: string;
  mimeType?: string;
  width: number;
  height: number;
  label?: string;
}

export interface ImageAttachment {
  kind: "image";
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
  width?: number;
  height?: number;
  generatedContext?: GeneratedAttachmentContext;
}

export interface DocumentAttachmentInsight {
  extractionMode:
    | "plain_text"
    | "pdf_text"
    | "pdf_ocr"
    | "docx_text"
    | "docx_ocr"
    | "legacy_word_text"
    | "legacy_word_ocr"
    | "provider_file_fallback";
  parser?: string;
  previewText?: string;
  pageCount?: number;
  characterCount?: number;
  truncated?: boolean;
}

export interface FileAttachment {
  kind: "file";
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
  transcriptText?: string;
  extractedText?: string;
  documentInsight?: DocumentAttachmentInsight;
  insight?: AttachmentInsight;
}

export interface VoiceAttachment {
  kind: "voice";
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs?: number;
  transcriptText?: string;
  insight?: AttachmentInsight;
}

export interface AttachmentInsight {
  jobId: string;
  kind:
    | "audio_transcription"
    | "video_transcription"
    | "document_text_extraction";
  status: "pending" | "processing" | "completed" | "cancelled" | "failed";
  updatedAt?: string;
  provider?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface GeneratedAttachmentContext {
  sourceReplyArtifactJobId?: string;
  sourceMessageId?: string;
  historyText?: string;
  imagePrompt?: string;
}

export interface ContactCardAttachment {
  kind: "contact_card";
  characterId: string;
  name: string;
  avatar?: string;
  relationship?: string;
  bio?: string;
  recommendationMetadata?: FollowupRecommendationAttachmentMetadata;
}

export interface LocationCardAttachment {
  kind: "location_card";
  sceneId: string;
  title: string;
  subtitle?: string;
}

export interface NoteCardAttachment {
  kind: "note_card";
  noteId: string;
  title: string;
  excerpt: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
  updatedAt: string;
}

/**
 * 视频号帖子转发卡片：用户/角色把视频号一条帖子转发到私聊里时
 * 携带的最小快照——点开后跳回视频号详情。
 */
export interface FeedPostCardAttachment {
  kind: "feed_post_card";
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  title?: string;
  excerpt: string;
  mediaType: "text" | "image" | "video" | "audio";
  coverUrl?: string;
  primaryMediaUrl?: string;
  durationMs?: number;
  surface: "channels";
}

export type MessageAttachment =
  | StickerAttachment
  | ImageAttachment
  | FileAttachment
  | VoiceAttachment
  | ContactCardAttachment
  | LocationCardAttachment
  | NoteCardAttachment
  | FeedPostCardAttachment;

export type UploadableAttachment =
  | ImageAttachment
  | FileAttachment
  | VoiceAttachment;
