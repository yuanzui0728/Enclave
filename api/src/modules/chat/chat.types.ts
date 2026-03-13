export interface Message {
  id: string;
  conversationId: string;
  senderType: 'user' | 'character';
  senderId: string;
  senderName: string;
  type: 'text' | 'system';
  text: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  type: 'direct' | 'group';
  title: string;
  participants: string[]; // character ids
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
