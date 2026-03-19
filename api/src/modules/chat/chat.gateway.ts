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

      // Activity-based interception
      const activity = await this.chatService.getCharacterActivity(characterId);

      if (activity === 'sleeping') {
        const sleepReplies = [
          '（消息已送达，对方正在睡觉 💤）',
          '（深夜了，对方已入睡，明天再聊吧）',
          '（对方睡着了，消息明天才能看到）',
        ];
        this.server.to(convId).emit('new_message', {
          id: `msg_${Date.now()}_sys`,
          conversationId: convId,
          senderType: 'system', senderId: 'system', senderName: 'system',
          type: 'system',
          text: sleepReplies[Math.floor(Math.random() * sleepReplies.length)],
          createdAt: new Date(),
        });
        return { event: 'message_sent', data: { conversationId: convId } };
      }

      // Busy state: show "read" hint, delay reply by 10-30 min (simulated as 8-15s in dev)
      const busyActivities = ['working', 'commuting'];
      if (busyActivities.includes(activity ?? '')) {
        const busyHints: Record<string, string[]> = {
          working: ['（对方正在上班，稍后回复）', '（工作中，消息已读，等会儿回）', '（忙着呢，一会儿回你）'],
          commuting: ['（对方在路上，稍后回复）', '（通勤中，消息已读）', '（在地铁上，信号不好，等会儿回）'],
        };
        const hints = busyHints[activity!] ?? ['（对方正忙，稍后回复）'];
        this.server.to(convId).emit('new_message', {
          id: `msg_${Date.now()}_sys`,
          conversationId: convId,
          senderType: 'system', senderId: 'system', senderName: 'system',
          type: 'system',
          text: hints[Math.floor(Math.random() * hints.length)],
          createdAt: new Date(),
        });

        // Async delayed reply (8-15s simulating real busy delay)
        const delay = 8000 + Math.random() * 7000;
        setTimeout(async () => {
          try {
            this.server.to(convId).emit('typing_start', { characterId });
            const messages = await this.chatService.sendMessage(convId, userId!, text);
            const aiReply = messages.find((m) => m.senderType === 'character');
            if (aiReply) {
              const typingDelay = Math.min(Math.max(aiReply.text.length * 16, 400), 3000);
              await new Promise((r) => setTimeout(r, typingDelay));
            }
            this.server.to(convId).emit('typing_stop', { characterId });
            for (const msg of messages) {
              this.server.to(convId).emit('new_message', msg);
            }
          } catch {
            this.server.to(convId).emit('typing_stop', { characterId });
          }
        }, delay);

        return { event: 'message_sent', data: { conversationId: convId } };
      }

      this.server.to(convId).emit('typing_start', { characterId });

      const messages = await this.chatService.sendMessage(convId, userId, text);

      // Simulate realistic typing delay based on reply length
      const aiReply = messages.find((m) => m.senderType === 'character');
      if (aiReply) {
        const charCount = aiReply.text.length;
        // ~60 chars/sec typing speed, capped at 3s
        const delay = Math.min(Math.max(charCount * 16, 400), 3000);
        await new Promise((r) => setTimeout(r, delay));
      }

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

  async sendProactiveMessage(convId: string, characterId: string, characterName: string, text: string) {
    const message = {
      id: `msg_${Date.now()}_proactive`,
      conversationId: convId,
      senderType: 'character',
      senderId: characterId,
      senderName: characterName,
      type: 'text',
      text,
      createdAt: new Date(),
    };
    this.server.to(convId).emit('new_message', message);
  }
}
