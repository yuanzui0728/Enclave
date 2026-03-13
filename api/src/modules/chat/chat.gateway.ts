import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';

interface SendMessagePayload {
  conversationId: string;
  characterId: string;
  text: string;
  userId?: string;
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
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
    const { conversationId, characterId, text, userId } = payload;

    if (!userId) {
      client.emit('error', { message: '未登录，请先登录' });
      return;
    }

    try {
      let convId = conversationId;
      const existing = await this.chatService.getConversation(convId);
      if (!existing) {
        const conv = await this.chatService.getOrCreateConversation(userId, characterId, conversationId);
        convId = conv.id;
      }

      this.server.to(convId).emit('typing_start', { characterId });

      const messages = await this.chatService.sendMessage(convId, userId, text);

      this.server.to(convId).emit('typing_stop', { characterId });

      for (const msg of messages) {
        this.server.to(convId).emit('new_message', msg);
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

      return { event: 'message_sent', data: { conversationId: convId } };
    } catch (err) {
      this.logger.error('Error handling message', err);
      client.emit('error', { message: '消息发送失败，请重试' });
    }
  }
}
