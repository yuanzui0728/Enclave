export type MessageSenderType = "user" | "character" | "system";
export type ConversationType = "direct" | "group";
export type MessageType = "text" | "system";
export type GroupMemberType = "user" | "character";

export interface Message {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string;
  senderName: string;
  type: MessageType;
  text: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  type: ConversationType;
  title: string;
  participants: string[];
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  lastReadAt?: string;
}

export interface ConversationListItem extends Conversation {
  lastMessage?: Message;
  unreadCount: number;
}

export interface GetOrCreateConversationRequest {
  userId: string;
  characterId: string;
}

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  creatorId: string;
  creatorType: GroupMemberType;
  createdAt: string;
}

export interface CreateGroupRequest {
  name: string;
  creatorId: string;
  creatorType: GroupMemberType;
  memberIds: string[];
}

export interface GroupMember {
  id: string;
  groupId: string;
  memberId: string;
  memberType: GroupMemberType;
  memberName?: string;
  memberAvatar?: string;
  role: "owner" | "member";
  joinedAt: string;
}

export interface AddGroupMemberRequest {
  memberId: string;
  memberType: GroupMemberType;
  memberName: string;
  memberAvatar?: string;
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
  createdAt: string;
}

export interface SendGroupMessageRequest {
  senderId: string;
  senderType: GroupMemberType;
  senderName: string;
  senderAvatar?: string;
  text: string;
}
