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
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';
import {
  WorldLanguageService,
  type WorldLanguageCode,
} from '../config/world-language.service';
import { describeAttachmentForDisplay } from './attachment-semantic-text';
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
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly worldLanguage: WorldLanguageService,
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
    const replyText =
      payload.type === 'sticker'
        ? (payload.text ?? '[表情包]')
        : 'attachment' in payload
          ? (payload.text ?? describeAttachmentForDisplay(payload.attachment))
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
        await this.emitSystemMessage(
          convId,
          'sleeping',
          runtimeRules.sleepHintMessages,
        );
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
        const busyActivity =
          activity as keyof typeof runtimeRules.busyHintMessages;
        await this.emitSystemMessage(
          convId,
          busyActivity,
          runtimeRules.busyHintMessages[busyActivity] ?? [],
        );
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
      client.emit('error', { message: await this.describeReplyFailure(err) });
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

  private async emitSystemMessage(
    conversationId: string,
    kind: 'sleeping' | 'working' | 'commuting',
    hints: string[],
  ) {
    const language = await this.worldLanguage.getLanguage();
    const candidates =
      language === 'zh-CN'
        ? hints
        : this.getLocalizedStateGateHints(language, kind);
    const message = await this.chatService.saveSystemMessage(
      conversationId,
      candidates[Math.floor(Math.random() * candidates.length)] ??
        this.getLocalizedStateGateHints(language, kind)[0],
    );
    this.emitThreadMessage(conversationId, message);
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
    replyText: string,
  ) {
    this.emitTypingStart(convId, characterId, 'reply');

    try {
      const { messages, scheduledReplyArtifactJobIds } =
        await this.chatService.sendMessageDetailed(convId, payload);
      const aiReply = messages.find(
        (message) => message.senderType === 'character',
      );
      if (aiReply) {
        const lengthBasis =
          aiReply.type === 'sticker' ? replyText.length : aiReply.text.length;
        const delay = Math.min(Math.max(lengthBasis * 16, 400), 3_000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      this.emitTypingStop(convId, characterId, 'reply');

      for (const message of messages) {
        this.emitThreadMessage(convId, message);
      }

      void this.chatService.activateReplyArtifactJobs(
        scheduledReplyArtifactJobIds,
      );
    } catch (error) {
      this.emitTypingStop(convId, characterId, 'reply');
      await this.emitConversationFailure(convId);
      const failureMessage = await this.describeReplyFailure(error);
      if (this.shouldPersistReplyFailure(error)) {
        await this.emitSystemNotice(convId, failureMessage);
        return;
      }
      this.emitConversationError(convId, failureMessage);
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

  private emitConversationError(conversationId: string, message: string) {
    this.server.to(conversationId).emit('error', {
      message,
    });
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

  private getLocalizedStateGateHints(
    language: WorldLanguageCode,
    kind: 'sleeping' | 'working' | 'commuting',
  ) {
    const values: Record<
      WorldLanguageCode,
      Record<'sleeping' | 'working' | 'commuting', string[]>
    > = {
      'zh-CN': {
        sleeping: [
          '对方已经睡着了，明天醒来会看到这条消息。',
          '夜深了，对方暂时离线，明天再继续聊吧。',
          '这条消息已经送达，只是对方现在还在休息。',
        ],
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
      },
      'en-US': {
        sleeping: [
          'They are asleep now and will see this when they wake up.',
          'It is late, and they are offline for now. You can keep talking tomorrow.',
          'The message was delivered, but they are resting right now.',
        ],
        working: [
          'They are busy with work and will come back later.',
          'The message was delivered. They will reply after handling what is in front of them.',
          'They are a little busy right now, so the message is waiting here.',
        ],
        commuting: [
          'They are on the move and will check the message later.',
          'The message was delivered. They will reply after they settle in.',
          'They may be moving right now and will come back when the connection is stable.',
        ],
      },
      'ja-JP': {
        sleeping: [
          '相手はもう眠っています。起きたらこのメッセージを見るはずです。',
          '夜も遅いので、相手は今オフラインです。続きは明日にしましょう。',
          'メッセージは届いていますが、相手はいま休んでいます。',
        ],
        working: [
          '相手はいま仕事で忙しいようです。あとで戻ってきます。',
          'メッセージは届いています。手元の用事が落ち着いたら返信します。',
          '相手はいま少し忙しいので、メッセージだけ先に置いておきます。',
        ],
        commuting: [
          '相手はいま移動中です。あとでメッセージを確認します。',
          'メッセージは届いています。落ち着いたら返信します。',
          '相手はいま移動中かもしれません。通信が安定したら戻ってきます。',
        ],
      },
      'ko-KR': {
        sleeping: [
          '상대는 이미 잠들었고, 일어나면 이 메시지를 볼 거예요.',
          '밤이 늦어 상대가 잠시 오프라인이에요. 내일 이어서 이야기해요.',
          '메시지는 전달됐지만, 상대는 지금 쉬고 있어요.',
        ],
        working: [
          '상대는 지금 일로 바빠서 조금 뒤에 돌아올 거예요.',
          '메시지는 전달됐어요. 하던 일을 마치면 답장할 거예요.',
          '상대가 지금 조금 바빠서, 메시지를 먼저 남겨둘게요.',
        ],
        commuting: [
          '상대는 지금 이동 중이라 나중에 메시지를 확인할 거예요.',
          '메시지는 전달됐어요. 자리를 잡으면 답장할 거예요.',
          '상대가 이동 중일 수 있어요. 연결이 안정되면 돌아올 거예요.',
        ],
      },
    };
    return values[language][kind];
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
