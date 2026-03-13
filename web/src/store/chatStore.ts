import { create } from 'zustand';
import type { Conversation, Message } from '../types/message';
import { api } from '../services/api';

interface ChatStore {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  isLoading: boolean;
  fetchConversations: (userId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  addMessage: (conversationId: string, message: Message) => void;
  markAsRead: (conversationId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  messages: {},
  isLoading: false,

  fetchConversations: async (userId) => {
    set({ isLoading: true });
    try {
      const data = await api.getConversations(userId) as Conversation[];
      const parsed = data.map((c) => ({
        ...c,
        unreadCount: (c as Conversation).unreadCount ?? 0,
        createdAt: new Date(c.createdAt as unknown as string),
        updatedAt: new Date(c.updatedAt as unknown as string),
        lastMessage: c.lastMessage
          ? { ...c.lastMessage, createdAt: new Date((c.lastMessage as Message).createdAt) }
          : undefined,
      }));
      set({ conversations: parsed });
    } catch (e) {
      console.error('fetchConversations error', e);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchMessages: async (conversationId) => {
    try {
      const data = await api.getMessages(conversationId) as Message[];
      const parsed = data.map((m) => ({
        ...m,
        senderAvatar: (m as Message).senderAvatar ?? '',
        isRead: (m as Message).isRead ?? true,
        createdAt: new Date(m.createdAt as unknown as string),
      }));
      set((state) => ({ messages: { ...state.messages, [conversationId]: parsed } }));
    } catch (e) {
      console.error('fetchMessages error', e);
    }
  },

  addMessage: (conversationId, message) => {
    set((state) => {
      const existing = state.messages[conversationId] ?? [];
      const updatedConvs = state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: message, updatedAt: message.createdAt }
          : c
      );
      return {
        messages: { ...state.messages, [conversationId]: [...existing, message] },
        conversations: updatedConvs,
      };
    });
  },

  markAsRead: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    }));
  },
}));
