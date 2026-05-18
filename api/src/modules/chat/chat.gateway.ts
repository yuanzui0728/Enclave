// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { AiProviderAuthError } from '../ai/ai.types';
import { SubscriptionExpiredException } from '../subscription/subscription-expired.exception';
import {
  WorldLanguageService,
  type WorldLanguageCode,
} from '../config/world-language.service';
import type {
  ContactCardAttachment,
  FileAttachment,
  GroupMessage,
  ImageAttachment,
  LocationCardAttachment,
  Message,
  NoteCardAttachment,
  VoiceAttachment,
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
        sourceType?: 'builtin' | 'custom';
        packId?: string;
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
      type: 'voice';
      text?: string;
      attachment: VoiceAttachment;
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
    }
  | {
      conversationId: string;
      characterId: string;
      type: 'note_card';
      text?: string;
      attachment: NoteCardAttachment;
    };

const configuredSocketOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',')
  .map((value) => value.trim())
  .filter(Boolean);

// 进程启动时刻作为 buildId：每次 API 重启都换一个，
// 客户端 socket 连上后比较上次记的 buildId，不同就让浏览器自动 reload + 清 SW。
// 这是给用户完全透明的「自动升级」机制——无需手动 unregister。
const SYSTEM_BUILD_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly worldLanguage: WorldLanguageService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    // socket 连接握手后立即下发 buildId，客户端比对自己的旧版本决定是否 reload。
    client.emit('system.hello', { buildId: SYSTEM_BUILD_ID });
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

  emitTypingStart(
    roomId: string,
    characterId: string,
    stage: 'reply' | 'image_generation' = 'reply',
  ) {
    if (!this.server) {
      return;
    }

    this.server
      .to(roomId)
      .emit('typing_start', { conversationId: roomId, characterId, stage });
  }

  emitTypingStop(
    roomId: string,
    characterId: string,
    stage: 'reply' | 'image_generation' = 'reply',
  ) {
    if (!this.server) {
      return;
    }

    this.server
      .to(roomId)
      .emit('typing_stop', { conversationId: roomId, characterId, stage });
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

      await this.deliverConversationReply(convId, characterId, payload);
      return { event: 'message_sent', data: { conversationId: convId } };
    } catch (err) {
      this.logger.error('Error handling message', err);
      client.emit(
        'error',
        this.toChatErrorPayload(await this.describeReplyFailure(err), err),
      );
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

  async sendProactiveAttachmentMessage(
    convId: string,
    characterId: string,
    characterName: string,
    attachment: Parameters<ChatService['saveProactiveAttachmentMessage']>[3],
    text?: string,
  ) {
    const message = await this.chatService.saveProactiveAttachmentMessage(
      convId,
      characterId,
      characterName,
      attachment,
      text,
    );
    this.emitThreadMessage(convId, message);
    return message;
  }

  /**
   * 用户主动塞进会话的附件卡片消息（如视频号转发到聊天）。
   * 不触发 AI 回复，只把消息落库 + socket emit。
   */
  async sendUserAttachmentMessage(
    convId: string,
    senderId: string,
    senderName: string,
    attachment: Parameters<ChatService['saveUserAttachmentMessage']>[3],
    text?: string,
  ) {
    const message = await this.chatService.saveUserAttachmentMessage(
      convId,
      senderId,
      senderName,
      attachment,
      text,
    );
    this.emitThreadMessage(convId, message);
    return message;
  }

  private async emitSystemNotice(conversationId: string, text: string) {
    const message = await this.chatService.saveSystemMessage(
      conversationId,
      text,
    );
    this.emitThreadMessage(conversationId, message);
  }

  private async deliverConversationReply(
    convId: string,
    characterId: string,
    payload: SendMessagePayload,
  ) {
    this.emitTypingStart(convId, characterId, 'reply');

    try {
      const { messages, scheduledReplyArtifactJobIds } =
        await this.chatService.sendMessageDetailed(convId, payload);

      this.emitTypingStop(convId, characterId, 'reply');

      for (const message of messages) {
        this.emitThreadMessage(convId, message);
      }

      void this.chatService.activateReplyArtifactJobs(
        scheduledReplyArtifactJobIds,
      );
    } catch (error) {
      // 这里曾经吞掉所有 generateReply / planAssistantReplyModalities / actionRuntime
      // 异常，只给前端发本地化的"对方暂时无法回复"，stderr/stdout 都没有任何
      // 痕迹——用户报"导入私有角色无法对话"时排查只能盲查 DB / 复现。
      // 这条 logger.error 至少保留 stack，让 dev-services/api-*.err.log 能搜到。
      this.logger.error(
        `conversation reply failed conv=${convId} char=${characterId}`,
        error instanceof Error ? error.stack : String(error),
      );
      this.emitTypingStop(convId, characterId, 'reply');
      await this.emitConversationFailure(convId);
      const failureMessage = await this.describeReplyFailure(error);
      if (this.shouldPersistReplyFailure(error)) {
        await this.emitSystemNotice(convId, failureMessage);
        return;
      }
      this.emitConversationError(
        convId,
        this.toChatErrorPayload(failureMessage, error),
      );
    }
  }

  private async emitConversationFailure(conversationId: string) {
    // 走查 R3：原版 getMessages(convId) 拉整条会话的所有消息再 reverse().find 出
    // 最后一条 user msg。长聊天（1000+ 条）这里是一次完整的全表 SELECT + JS
    // 全表 reverse + 全表 find，server 端跟着卡。reply 失败回放路径在 AI 不稳
    // / cloud token 过期时高频触发。直接走 chat.service.getLastUserMessage
    // (ORDER BY createdAt DESC LIMIT 1) 一条出来。
    const latestUserMessage =
      await this.chatService.getLastUserMessage(conversationId);

    if (latestUserMessage) {
      this.server.to(conversationId).emit('new_message', latestUserMessage);
    }
  }

  private emitConversationError(
    conversationId: string,
    payload: { message: string; code?: string; meta?: unknown },
  ) {
    this.server.to(conversationId).emit('error', payload);
  }

  private toChatErrorPayload(defaultMessage: string, error: unknown) {
    if (error instanceof SubscriptionExpiredException) {
      const response = error.getResponse() as {
        code?: string;
        message?: string;
        meta?: unknown;
      };
      return {
        message: response.message || error.message,
        code: response.code || SubscriptionExpiredException.CODE,
        meta: response.meta,
      };
    }

    return {
      message: defaultMessage,
    };
  }

  private shouldPersistReplyFailure(error: unknown) {
    return (
      error instanceof AiProviderAuthError ||
      (error instanceof Error &&
        /invalid token|api key|authentication/i.test(error.message))
    );
  }

  private async describeReplyFailure(error: unknown) {
    const language = await this.worldLanguage.getLanguage();
    if (error instanceof AiProviderAuthError) {
      if (error.source === 'owner_custom') {
        return this.getLocalizedReplyFailure(language, 'owner_key');
      }

      return this.getLocalizedReplyFailure(language, 'provider_key');
    }

    if (
      error instanceof Error &&
      /invalid token|api key|authentication/i.test(error.message)
    ) {
      return this.getLocalizedReplyFailure(language, 'world_key');
    }

    return this.getLocalizedReplyFailure(language, 'temporary');
  }

  private getLocalizedReplyFailure(
    language: WorldLanguageCode,
    kind: 'owner_key' | 'provider_key' | 'world_key' | 'temporary',
  ) {
    const values: Record<
      WorldLanguageCode,
      Record<'owner_key' | 'provider_key' | 'world_key' | 'temporary', string>
    > = {
      'zh-CN': {
        owner_key:
          '消息已送达，但你当前保存的专属 AI Key 已失效。请到“我 > 设置”里更新，或先清除专属 API Key 后再试。',
        provider_key:
          '消息已送达，但当前隐界实例的 AI Provider Key 无效，暂时无法生成回复。请检查实例后台 Provider 配置，或在“我 > 设置”里改用可用的专属 API Key。',
        world_key:
          '消息已送达，但当前世界配置的 AI Key 无效，暂时无法生成回复。请到“我 > 设置”里更新 API Key。',
        temporary: '消息已送达，但对方暂时无法回复。请稍后再试。',
      },
      'en-US': {
        owner_key:
          'The message was delivered, but your saved personal AI Key is no longer valid. Update it in Me > Settings, or clear the personal API Key and try again.',
        provider_key:
          'The message was delivered, but this Yinjie instance has an invalid AI Provider Key. Check the admin Provider settings, or use a valid personal API Key in Me > Settings.',
        world_key:
          'The message was delivered, but the current world AI Key is invalid. Update the API Key in Me > Settings.',
        temporary:
          'The message was delivered, but they cannot reply right now. Please try again later.',
      },
      'ja-JP': {
        owner_key:
          'メッセージは届きましたが、保存されている専用 AI Key が無効です。「自分 > 設定」で更新するか、専用 API Key をいったん削除してから再試行してください。',
        provider_key:
          'メッセージは届きましたが、この隠界インスタンスの AI Provider Key が無効です。管理后台の Provider 設定を確認するか、「自分 > 設定」で有効な専用 API Key を使ってください。',
        world_key:
          'メッセージは届きましたが、現在の世界の AI Key が無効です。「自分 > 設定」で API Key を更新してください。',
        temporary:
          'メッセージは届きましたが、相手はいま返信できません。少し待ってからもう一度試してください。',
      },
      'ko-KR': {
        owner_key:
          '메시지는 전달됐지만 저장된 전용 AI Key가 더 이상 유효하지 않아요. 나 > 설정에서 업데이트하거나 전용 API Key를 지운 뒤 다시 시도해 주세요.',
        provider_key:
          '메시지는 전달됐지만 현재 은계 인스턴스의 AI Provider Key가 유효하지 않아요. 관리자 Provider 설정을 확인하거나 나 > 설정에서 사용 가능한 전용 API Key로 바꿔 주세요.',
        world_key:
          '메시지는 전달됐지만 현재 세계의 AI Key가 유효하지 않아요. 나 > 설정에서 API Key를 업데이트해 주세요.',
        temporary:
          '메시지는 전달됐지만 상대가 지금은 답장할 수 없어요. 잠시 후 다시 시도해 주세요.',
      },
    };
    return values[language][kind];
  }
}
// i18n-ignore-end
