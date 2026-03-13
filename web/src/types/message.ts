export type MessageType = 'text' | 'image' | 'system';
export type SenderType = 'user' | 'character';

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderId: string; // character id or 'user'
  senderName: string;
  senderAvatar: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  createdAt: Date;
  isRead: boolean;
}

export interface Conversation {
  id: string;
  userId?: string;
  type: 'direct' | 'group';
  title: string; // for group chats
  participants: string[]; // character ids
  lastMessage?: Message;
  unreadCount: number;
  createdAt?: Date;
  updatedAt: Date;
  // for group chats: which character triggered group creation
  groupTriggerReason?: string;
}
