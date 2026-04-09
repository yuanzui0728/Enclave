import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

interface SendMessagePayload {
  conversationId: string;
  characterId: string;
  text: string;
}

const configuredSocketOrigins = process.env.CORS_ALLOWED_ORIGINS
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const SLEEP_HINTS = [
  '对方已经睡着了，明天醒来会看到这条消息。',
  '夜深了，对方暂时离线，明天再继续聊吧。',
  '这条消息已经送达，只是对方现在还在休息。',
];

const BUSY_HINTS: Record<string, string[]> = {
  working: [
    '对方正在忙工作，稍后会回来。',
    '消息已经送达，对方处理完手头的事会回复你。',
    '对方这会儿有点忙，先把消息留在这里。',
  ],
  commuting: [
    '对方正在路上，稍后会查看消息。',
    '消息已经送达，对方安顿下来后会回复你。',
    '对方现在可能在移动中，信号稳定后会回来。',
  ],
};

@WebSocketGateway({
  cors: {
    origin:
      !configuredSocketOrigins?.length || configuredSocketOrigins.includes('*')
        ? true
        : configuredSocketOrigins,
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  handleJoin(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.conversationId);
    return { event: 'joined', data: data.conversationId };
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody() payload: SendMessagePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { conversationId, characterId, text } = payload;

    try {
      let convId = conversationId;
      const existing = await this.chatService.getConversation(convId);
      if (!existing) {
        const conv = await this.chatService.getOrCreateConversation(characterId, conversationId);
        convId = conv.id;
      }

      const activity = await this.chatService.getCharacterActivity(characterId);
      if (activity === 'sleeping') {
        this.emitSystemMessage(convId, SLEEP_HINTS);
        return { event: 'message_sent', data: { conversationId: convId } };
      }

      if (activity && ['working', 'commuting'].includes(activity)) {
        this.emitSystemMessage(convId, BUSY_HINTS[activity] ?? ['对方现在有些忙，稍后会回复你。']);
        const delay = 8_000 + Math.random() * 7_000;
        setTimeout(() => {
          void this.deliverConversationReply(convId, characterId, text);
        }, delay);
        return { event: 'message_sent', data: { conversationId: convId } };
      }

      await this.deliverConversationReply(convId, characterId, text);
      return { event: 'message_sent', data: { conversationId: convId } };
    } catch (err) {
      this.logger.error('Error handling message', err);
      client.emit('error', { message: '消息发送失败，请稍后重试。' });
    }
  }

  async sendProactiveMessage(
    convId: string,
    characterId: string,
    characterName: string,
    text: string,
  ) {
    const message = await this.chatService.saveProactiveMessage(
      convId,
      characterId,
      characterName,
      text,
    );
    this.server.to(convId).emit('new_message', message);
    return message;
  }

  private emitSystemMessage(conversationId: string, hints: string[]) {
    this.server.to(conversationId).emit('new_message', {
      id: `msg_${Date.now()}_sys`,
      conversationId,
      senderType: 'system',
      senderId: 'system',
      senderName: 'system',
      type: 'system',
      text: hints[Math.floor(Math.random() * hints.length)],
      createdAt: new Date(),
    });
  }

  private async deliverConversationReply(convId: string, characterId: string, text: string) {
    this.server.to(convId).emit('typing_start', { conversationId: convId, characterId });

    try {
      const messages = await this.chatService.sendMessage(convId, text);
      const aiReply = messages.find((message) => message.senderType === 'character');
      if (aiReply) {
        const delay = Math.min(Math.max(aiReply.text.length * 16, 400), 3_000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      this.server.to(convId).emit('typing_stop', { conversationId: convId, characterId });

      for (const message of messages) {
        this.server.to(convId).emit('new_message', message);
      }

      const conv = await this.chatService.getConversation(convId);
      if (conv?.type === 'group') {
        this.server.to(convId).emit('conversation_updated', {
          id: convId,
          type: conv.type,
          title: conv.title,
          participants: conv.participants,
        });
      }
    } catch (error) {
      this.server.to(convId).emit('typing_stop', { conversationId: convId, characterId });
      throw error;
    }
  }
}
