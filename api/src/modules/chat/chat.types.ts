export interface StickerAttachment {
  kind: 'sticker';
  packId: string;
  stickerId: string;
  url: string;
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
}

export interface FileAttachment {
  kind: 'file';
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
}

export interface VoiceAttachment {
  kind: 'voice';
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs?: number;
}

export interface ContactCardAttachment {
  kind: 'contact_card';
  characterId: string;
  name: string;
  avatar?: string;
  relationship?: string;
  bio?: string;
}

export interface LocationCardAttachment {
  kind: 'location_card';
  sceneId: string;
  title: string;
  subtitle?: string;
}

export type MessageAttachment =
  | StickerAttachment
  | ImageAttachment
  | FileAttachment
  | VoiceAttachment
  | ContactCardAttachment
  | LocationCardAttachment;

export interface Message {
  id: string;
  conversationId: string;
  senderType: 'user' | 'character' | 'system';
  senderId: string;
  senderName: string;
  type:
    | 'text'
    | 'system'
    | 'proactive'
    | 'sticker'
    | 'image'
    | 'file'
    | 'voice'
    | 'contact_card'
    | 'location_card';
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
    | 'location_card';
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
  title: string;
  participants: string[]; // character ids
  messages: Message[];
  isPinned: boolean;
  pinnedAt?: Date;
  isMuted: boolean;
  mutedAt?: Date;
  lastReadAt?: Date;
  lastClearedAt?: Date;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
