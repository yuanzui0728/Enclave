import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

// Empty string = connect to current origin, Vite proxy forwards /socket.io to backend
const WS_URL = import.meta.env.DEV ? '' : '';

type MessageHandler = (msg: unknown) => void;
type TypingHandler = (data: { characterId: string }) => void;
type ConversationUpdateHandler = (data: unknown) => void;

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket?.connected) return;
    const token = useAuthStore.getState().token;
    this.socket = io(`${WS_URL}/chat`, {
      transports: ['websocket'],
      autoConnect: true,
      auth: { token },
    });
    this.socket.on('connect', () => console.log('[WS] connected'));
    this.socket.on('disconnect', () => console.log('[WS] disconnected'));
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  joinConversation(conversationId: string) {
    this.socket?.emit('join_conversation', { conversationId });
  }

  sendMessage(payload: {
    conversationId: string;
    characterId: string;
    text: string;
    userId?: string;
  }) {
    this.socket?.emit('send_message', payload);
  }

  onNewMessage(handler: MessageHandler) {
    this.socket?.on('new_message', handler);
  }

  onTypingStart(handler: TypingHandler) {
    this.socket?.on('typing_start', handler);
  }

  onTypingStop(handler: TypingHandler) {
    this.socket?.on('typing_stop', handler);
  }

  onConversationUpdated(handler: ConversationUpdateHandler) {
    this.socket?.on('conversation_updated', handler);
  }

  offNewMessage(handler: MessageHandler) {
    this.socket?.off('new_message', handler);
  }

  offTypingStart(handler: TypingHandler) {
    this.socket?.off('typing_start', handler);
  }

  offTypingStop(handler: TypingHandler) {
    this.socket?.off('typing_stop', handler);
  }

  offConversationUpdated(handler: ConversationUpdateHandler) {
    this.socket?.off('conversation_updated', handler);
  }

  isConnected() {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
