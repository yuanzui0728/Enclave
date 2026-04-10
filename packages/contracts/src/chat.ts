import type {
  ContactCardAttachment,
  FileAttachment,
  ImageAttachment,
  LocationCardAttachment,
  MessageAttachment,
  UploadableAttachment,
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
  | "contact_card"
  | "location_card";
export type GroupMemberType = "user" | "character";

export interface Message {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string;
  senderName: string;
  type: MessageType;
  text: string;
  attachment?: MessageAttachment;
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  participants: string[];
  messages: Message[];
  isPinned: boolean;
  pinnedAt?: string;
  isMuted: boolean;
  mutedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastReadAt?: string;
  lastClearedAt?: string;
  lastActivityAt: string;
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
    };

export interface UploadChatAttachmentResponse {
  attachment: UploadableAttachment;
}
