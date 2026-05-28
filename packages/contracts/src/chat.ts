import type {
  ContactCardAttachment,
  FileAttachment,
  ImageAttachment,
  LocationCardAttachment,
  MessageAttachment,
  NoteCardAttachment,
  StickerAttachment,
  UploadableAttachment,
  VoiceAttachment,
} from "./attachments";

export type MessageSenderType = "user" | "character" | "system";
export type ConversationType = "direct" | "group";
export type MessageType =
  | "text"
  | "system"
  | "proactive"
  | "sticker"
  | "image"
  | "file"
  | "voice"
  | "contact_card"
  | "location_card"
  | "note_card"
  | "feed_post_card"
  | "call_log"
  | "red_packet";
export type GroupMemberType = "user" | "character";
export type ChatMessageSearchCategory = "all" | "media" | "files" | "links";

export interface GetChatMessagesQuery {
  limit?: number;
  aroundMessageId?: string;
  before?: number;
  after?: number;
}

export interface SearchChatMessagesQuery {
  keyword?: string;
  category?: ChatMessageSearchCategory;
  messageType?: MessageType | "all";
  senderId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export interface ChatMessageSearchItem {
  messageId: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  messageType: MessageType;
  previewText: string;
  categories: ChatMessageSearchCategory[];
  attachment?: MessageAttachment;
}

export interface ChatMessageSearchResponse {
  items: ChatMessageSearchItem[];
  total: number;
  nextCursor?: string;
  hasMore: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type: MessageType;
  text: string;
  attachment?: MessageAttachment;
  createdAt: string;
}

// 「我」(分身) 把用户请求派发给专家居民当子 agent 的协作线程。折叠在「我」的 ack 气泡
// (anchorMessageId) 下，用户可展开看「我↔专家」全过程并随时介入。
export type AgentDelegationStatus =
  | "pending_anchor"
  | "queued"
  | "working"
  | "awaiting_synthesis"
  | "completed"
  | "failed";

export type AgentDelegationTranscriptSenderType =
  | "self"
  | "expert"
  | "user"
  | "system";

export interface AgentDelegationTranscriptMessage {
  id: string;
  senderType: AgentDelegationTranscriptSenderType;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface AgentDelegation {
  id: string;
  batchId: string;
  parentConversationId: string;
  anchorMessageId: string | null;
  expertCharacterId: string;
  expertName: string;
  taskBrief: string;
  status: AgentDelegationStatus;
  messages: AgentDelegationTranscriptMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface InterveneAgentDelegationRequest {
  text: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  source?: "conversation" | "group";
  title: string;
  avatar?: string;
  participants: string[];
  messages: Message[];
  isPinned: boolean;
  pinnedAt?: string;
  isMuted: boolean;
  mutedAt?: string;
  strongReminderUntil?: string;
  createdAt: string;
  updatedAt: string;
  lastReadAt?: string;
  lastClearedAt?: string;
  lastActivityAt: string;
  sparkStreak?: number;
}

export interface ConversationListItem extends Conversation {
  lastMessage?: Message;
  unreadCount: number;
}

export interface GetOrCreateConversationRequest {
  characterId: string;
}

export interface SetConversationPinnedRequest {
  pinned: boolean;
}

export interface SetConversationMutedRequest {
  muted: boolean;
}

export interface SetConversationStrongReminderRequest {
  enabled: boolean;
  durationHours?: number;
}

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  creatorId: string;
  creatorType: GroupMemberType;
  announcement?: string;
  isMuted: boolean;
  mutedAt?: string;
  isPinned: boolean;
  pinnedAt?: string;
  savedToContacts: boolean;
  savedToContactsAt?: string;
  showMemberNicknames: boolean;
  notifyOnAtMe: boolean;
  notifyOnAtAll: boolean;
  notifyOnAnnouncement: boolean;
  lastClearedAt?: string;
  lastReadAt?: string;
  isHidden: boolean;
  hiddenAt?: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupRequest {
  name: string;
  creatorId?: string;
  creatorType?: GroupMemberType;
  memberIds: string[];
  sourceConversationId?: string;
  sharedMessageIds?: string[];
}

export interface GroupMember {
  id: string;
  groupId: string;
  memberId: string;
  memberType: GroupMemberType;
  memberName?: string;
  memberAvatar?: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface AddGroupMemberRequest {
  memberId: string;
  memberType: GroupMemberType;
  memberName?: string;
  memberAvatar?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  announcement?: string | null;
}

export interface SetGroupPinnedRequest {
  pinned: boolean;
}

export interface UpdateGroupPreferencesRequest {
  isMuted?: boolean;
  savedToContacts?: boolean;
  showMemberNicknames?: boolean;
  notifyOnAtMe?: boolean;
  notifyOnAtAll?: boolean;
  notifyOnAnnouncement?: boolean;
}

export interface UpdateGroupOwnerProfileRequest {
  nickname: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderType: GroupMemberType | "system";
  senderName: string;
  senderAvatar?: string;
  text: string;
  type: MessageType;
  attachment?: MessageAttachment;
  createdAt: string;
}

export type SendGroupMessageRequest =
  | {
      senderId?: string;
      senderType?: GroupMemberType;
      type?: "text";
      text: string;
    }
  | {
      senderId?: string;
      senderType?: GroupMemberType;
      type: "image";
      text?: string;
      attachment: ImageAttachment;
    }
  | {
      senderId?: string;
      senderType?: GroupMemberType;
      type: "file";
      text?: string;
      attachment: FileAttachment;
    }
  | {
      senderId?: string;
      senderType?: GroupMemberType;
      type: "voice";
      text?: string;
      attachment: VoiceAttachment;
    }
  | {
      senderId?: string;
      senderType?: GroupMemberType;
      type: "contact_card";
      text?: string;
      attachment: ContactCardAttachment;
    }
  | {
      senderId?: string;
      senderType?: GroupMemberType;
      type: "location_card";
      text?: string;
      attachment: LocationCardAttachment;
    }
  | {
      senderId?: string;
      senderType?: GroupMemberType;
      type: "note_card";
      text?: string;
      attachment: NoteCardAttachment;
    }
  | {
      senderId?: string;
      senderType?: GroupMemberType;
      type: "sticker";
      text?: string;
      attachment: StickerAttachment;
    };

export interface UploadChatAttachmentResponse {
  attachment: UploadableAttachment;
}
