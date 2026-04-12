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
import { AiProviderAuthError } from '../ai/ai.types';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';
import type {
  ContactCardAttachment,
  FileAttachment,
  GroupMessage,
  ImageAttachment,
  LocationCardAttachment,
  Message,
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

  constructor(
    private readonly chatService: ChatService,
    private readonly replyLogicRules: ReplyLogicRulesService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitThreadMessage(roomId: string, message: Message | GroupMessage) {
    if (!this.server) {
      return;
    }

    this.server.to(roomId).emit('new_message', message);
  }

  emitConversationUpdated(payload: {
    id: string;
    type: 'direct' | 'group';
    title: string;
    participants: string[];
  }) {
    if (!this.server) {
      return;
    }

    this.server.to(payload.id).emit('conversation_updated', payload);
  }

  @SubscribeMessage('join_conversation')
  handleJoin(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    void client.join(data.conversationId);
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
      const runtimeRules = await this.replyLogicRules.getRules();
      if (activity === 'sleeping') {
        await this.emitSystemMessage(convId, [
          ...runtimeRules.sleepHintMessages,
        ]);
        const delay =
          runtimeRules.sleepDelayMs.min +
          Math.random() *
            (runtimeRules.sleepDelayMs.max - runtimeRules.sleepDelayMs.min);
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
        await this.emitSystemMessage(convId, [
          ...(runtimeRules.busyHintMessages[
            activity as keyof typeof runtimeRules.busyHintMessages
          ] ?? ['对方现在有些忙，稍后会回复你。']),
        ]);
        const delay =
          runtimeRules.busyDelayMs.min +
          Math.random() *
            (runtimeRules.busyDelayMs.max - runtimeRules.busyDelayMs.min);
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
    this.emitThreadMessage(convId, message);
    return message;
  }

  private async emitSystemMessage(conversationId: string, hints: string[]) {
    const message = await this.chatService.saveSystemMessage(
      conversationId,
      hints[Math.floor(Math.random() * hints.length)],
    );
    this.emitThreadMessage(conversationId, message);
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
        this.emitThreadMessage(convId, message);
      }
    } catch (error) {
      this.server
        .to(convId)
        .emit('typing_stop', { conversationId: convId, characterId });
      await this.emitConversationFailure(convId);
      this.emitConversationError(convId, error);
    }
  }

  private async emitConversationFailure(conversationId: string) {
    const messages = await this.chatService.getMessages(conversationId);
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.senderType === 'user');

    if (latestUserMessage) {
      this.server.to(conversationId).emit('new_message', latestUserMessage);
    }
  }

  private emitConversationError(conversationId: string, error: unknown) {
    this.server.to(conversationId).emit('error', {
      message: this.describeReplyFailure(error),
    });
  }

  private describeReplyFailure(error: unknown) {
    if (error instanceof AiProviderAuthError) {
      if (error.source === 'owner_custom') {
        return '消息已送达，但你当前保存的专属 AI Key 已失效。请到“我 > 设置”里更新，或先清除专属 API Key 后再试。';
      }

      return '消息已送达，但当前隐界实例的 AI Provider Key 无效，暂时无法生成回复。请检查实例后台 Provider 配置，或在“我 > 设置”里改用可用的专属 API Key。';
    }

    if (
      error instanceof Error &&
      /invalid token|api key|authentication/i.test(error.message)
    ) {
      return '消息已送达，但当前世界配置的 AI Key 无效，暂时无法生成回复。请到“我 > 设置”里更新 API Key。';
    }

    return '消息已送达，但对方暂时无法回复。请稍后再试。';
  }
}
