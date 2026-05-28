export interface StickerAttachment {
  kind: 'sticker';
  sourceType?: 'builtin' | 'custom';
  packId?: string;
  stickerId: string;
  url: string;
  mimeType?: string;
  width: number;
  height: number;
  label?: string;
}

export interface ImageAttachment {
  kind: 'image';
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
    | 'plain_text'
    | 'pdf_text'
    | 'pdf_ocr'
    | 'docx_text'
    | 'docx_ocr'
    | 'legacy_word_text'
    | 'legacy_word_ocr'
    | 'provider_file_fallback';
  parser?: string;
  previewText?: string;
  pageCount?: number;
  characterCount?: number;
  truncated?: boolean;
}

export interface FileAttachment {
  kind: 'file';
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
  kind: 'voice';
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
    | 'audio_transcription'
    | 'video_transcription'
    | 'document_text_extraction';
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
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
  kind: 'contact_card';
  characterId: string;
  name: string;
  avatar?: string;
  relationship?: string;
  bio?: string;
  recommendationMetadata?: {
    recommendationId: string;
    reasonSummary: string;
    sourceThreadId: string;
    sourceThreadType: 'direct' | 'group';
    sourceThreadTitle?: string | null;
    sourceMessageId?: string | null;
    relationshipState: 'friend' | 'pending' | 'not_friend';
    badgeLabel?: string | null;
  };
}

export interface LocationCardAttachment {
  kind: 'location_card';
  sceneId: string;
  title: string;
  subtitle?: string;
}

export interface NoteCardAttachmentAsset {
  id: string;
  kind: 'image' | 'file';
  fileName: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
}

export interface NoteCardAttachment {
  kind: 'note_card';
  noteId: string;
  title: string;
  excerpt: string;
  tags: string[];
  assets: NoteCardAttachmentAsset[];
  updatedAt: string;
}

/**
 * 视频号帖子转发卡片：用户/角色把视频号一条帖子转发到私聊里时的最小快照。
 */
export interface FeedPostCardAttachment {
  kind: 'feed_post_card';
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  title?: string;
  excerpt: string;
  mediaType: 'text' | 'image' | 'video' | 'audio';
  coverUrl?: string;
  primaryMediaUrl?: string;
  durationMs?: number;
  surface: 'channels';
}

export type CallLogEndedReason =
  | 'user_hangup'
  | 'timeout'
  | 'error'
  | 'no_answer';

export interface CallLogAttachment {
  kind: 'call_log';
  mode: 'voice' | 'video';
  thread: 'direct' | 'group';
  durationSec: number;
  endedReason: CallLogEndedReason;
  startedAt: string;
  endedAt: string;
  participantCount?: number;
}

/**
 * 红包卡片：聊天里发/收红包的最小展示快照。账本真值在 cloud-api（HongbaoEntity）。
 * direction: outgoing=用户发给 AI；incoming=AI 发给用户。
 * status: pending 未领取 / claimed 已领取 / refunded 已退回 / expired 已过期。
 */
export interface RedPacketAttachment {
  kind: 'red_packet';
  hongbaoId: string;
  direction: 'outgoing' | 'incoming';
  status: 'pending' | 'claimed' | 'refunded' | 'expired';
  amountCents: number;
  currency: string;
  message: string;
  senderName: string;
  expiresAt: string;
}

/**
 * 礼物卡片：聊天里送/收商城虚拟礼物的最小展示快照。账本真值在 cloud-api
 * （GiftRecordEntity / GoodsInventoryEntity）。direction: outgoing=用户送给 AI；incoming=AI 送给用户。
 * 与红包不同：礼物无领取态（送出即转移虚拟物），故无 status/expiresAt。
 */
export interface GiftAttachment {
  kind: 'gift';
  giftRecordId: string;
  direction: 'outgoing' | 'incoming';
  goodsCode: string;
  goodsName: string;
  iconUrl: string | null;
  quantity: number;
  message: string;
  senderName: string;
}

export type MessageAttachment =
  | StickerAttachment
  | ImageAttachment
  | FileAttachment
  | VoiceAttachment
  | ContactCardAttachment
  | LocationCardAttachment
  | NoteCardAttachment
  | FeedPostCardAttachment
  | CallLogAttachment
  | RedPacketAttachment
  | GiftAttachment;

export interface Message {
  id: string;
  conversationId: string;
  senderType: 'user' | 'character' | 'system';
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type:
    | 'text'
    | 'system'
    | 'proactive'
    | 'sticker'
    | 'image'
    | 'file'
    | 'voice'
    | 'contact_card'
    | 'location_card'
    | 'note_card'
    | 'feed_post_card'
    | 'call_log'
    | 'red_packet';
  text: string;
  attachment?: MessageAttachment;
  createdAt: Date;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderType: 'user' | 'character' | 'system';
  senderName: string;
  senderAvatar?: string;
  type:
    | 'text'
    | 'system'
    | 'sticker'
    | 'image'
    | 'file'
    | 'voice'
    | 'contact_card'
    | 'location_card'
    | 'note_card'
    | 'feed_post_card'
    | 'call_log'
    | 'red_packet';
  text: string;
  attachment?: MessageAttachment;
  createdAt: Date;
}

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  creatorId: string;
  creatorType: 'user' | 'character';
  announcement?: string;
  isMuted: boolean;
  mutedAt?: Date;
  isPinned: boolean;
  pinnedAt?: Date;
  savedToContacts: boolean;
  savedToContactsAt?: Date;
  showMemberNicknames: boolean;
  notifyOnAtMe: boolean;
  notifyOnAtAll: boolean;
  notifyOnAnnouncement: boolean;
  lastClearedAt?: Date;
  lastReadAt?: Date;
  isHidden: boolean;
  hiddenAt?: Date;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  source?: 'conversation' | 'group';
  title: string;
  avatar?: string;
  participants: string[]; // character ids
  messages: Message[];
  isPinned: boolean;
  pinnedAt?: Date;
  isMuted: boolean;
  mutedAt?: Date;
  strongReminderUntil?: Date;
  lastReadAt?: Date;
  lastClearedAt?: Date;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
