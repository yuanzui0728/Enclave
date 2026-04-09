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
import type {
  ContactCardAttachment,
  FileAttachment,
  ImageAttachment,
  LocationCardAttachment,
} from './chat.types';

type SendMessagePayload =
  | {
      conversationId: string;
      characterId: string;
      type?: 'text';
      text: string;
    }
  | {
      conversationId: string;
      characterId: string;
      type: 'sticker';
      text?: string;
      sticker: {
        packId: string;
        stickerId: string;
      };
    }
  | {
      conversationId: string;
      characterId: string;
      type: 'image';
      text?: string;
      attachment: ImageAttachment;
    }
  | {
      conversationId: string;
      characterId: string;
      type: 'file';
      text?: string;
      attachment: FileAttachment;
    }
  | {
      conversationId: string;
      characterId: string;
      type: 'contact_card';
      text?: string;
      attachment: ContactCardAttachment;
    }
  | {
      conversationId: string;
      characterId: string;
      type: 'location_card';
      text?: string;
      attachment: LocationCardAttachment;
    };

const configuredSocketOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',')
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
    const { conversationId, characterId } = payload;
    const replyText =
      payload.type === 'sticker'
        ? (payload.text ?? '[表情包]')
        : payload.type === 'image'
          ? (payload.text ?? `[图片] ${payload.attachment.fileName}`)
          : payload.type === 'file'
            ? (payload.text ?? `[文件] ${payload.attachment.fileName}`)
            : payload.type === 'contact_card'
              ? (payload.text ?? `[名片] ${payload.attachment.name}`)
              : payload.type === 'location_card'
                ? (payload.text ?? `[位置] ${payload.attachment.title}`)
                : payload.text;

    try {
      let convId = conversationId;
      const existing = await this.chatService.getConversation(convId);
      if (!existing) {
        const conv = await this.chatService.getOrCreateConversation(
          characterId,
          conversationId,
        );
        convId = conv.id;
      }

      const activity = await this.chatService.getCharacterActivity(characterId);
      if (activity === 'sleeping') {
        await this.emitSystemMessage(convId, SLEEP_HINTS);
        const delay = 12_000 + Math.random() * 10_000;
        setTimeout(() => {
          void this.deliverConversationReply(
            convId,
            characterId,
            payload,
            replyText,
          );
        }, delay);
        return { event: 'message_sent', data: { conversationId: convId } };
      }

      if (activity && ['working', 'commuting'].includes(activity)) {
        await this.emitSystemMessage(
          convId,
          BUSY_HINTS[activity] ?? ['对方现在有些忙，稍后会回复你。'],
        );
        const delay = 8_000 + Math.random() * 7_000;
        setTimeout(() => {
          void this.deliverConversationReply(
            convId,
            characterId,
            payload,
            replyText,
          );
        }, delay);
        return { event: 'message_sent', data: { conversationId: convId } };
      }

      await this.deliverConversationReply(
        convId,
        characterId,
        payload,
        replyText,
      );
      return { event: 'message_sent', data: { conversationId: convId } };
    } catch (err) {
      this.logger.error('Error handling message', err);
      client.emit('error', { message: this.describeReplyFailure(err) });
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

  private async emitSystemMessage(conversationId: string, hints: string[]) {
    const message = await this.chatService.saveSystemMessage(
      conversationId,
      hints[Math.floor(Math.random() * hints.length)],
    );
    this.server.to(conversationId).emit('new_message', message);
  }

  private async deliverConversationReply(
    convId: string,
    characterId: string,
    payload: SendMessagePayload,
    replyText: string,
  ) {
    this.server
      .to(convId)
      .emit('typing_start', { conversationId: convId, characterId });

    try {
      const messages = await this.chatService.sendMessage(convId, payload);
      const aiReply = messages.find(
        (message) => message.senderType === 'character',
      );
      if (aiReply) {
        const lengthBasis =
          aiReply.type === 'sticker' ? replyText.length : aiReply.text.length;
        const delay = Math.min(Math.max(lengthBasis * 16, 400), 3_000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      this.server
        .to(convId)
        .emit('typing_stop', { conversationId: convId, characterId });

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
      this.server
        .to(convId)
        .emit('typing_stop', { conversationId: convId, characterId });
      await this.emitConversationFailure(convId, error);
      throw error;
    }
  }

  private async emitConversationFailure(
    conversationId: string,
    error: unknown,
  ) {
    const messages = await this.chatService.getMessages(conversationId);
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.senderType === 'user');

    if (latestUserMessage) {
      this.server.to(conversationId).emit('new_message', latestUserMessage);
    }

    const systemMessage = await this.chatService.saveSystemMessage(
      conversationId,
      this.describeReplyFailure(error),
    );
    this.server.to(conversationId).emit('new_message', systemMessage);
  }

  private describeReplyFailure(error: unknown) {
    if (
      error instanceof Error &&
      /invalid token|api key|authentication/i.test(error.message)
    ) {
      return '消息已送达，但当前世界配置的 AI Key 无效，暂时无法生成回复。请到“我 > 设置”里更新 API Key。';
    }

    return '消息已送达，但对方暂时无法回复。请稍后再试。';
  }
}
