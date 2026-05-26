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
import { TenantService } from '../tenancy/tenant.service';
import {
  isSharedWorldMode,
  TenantContext,
  TenantContextStore,
} from '../tenancy/tenant-context';
import { INTERNAL_USER_PHONE_HEADER } from '../tenancy/internal-headers';
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
    private readonly tenantService: TenantService,
  ) {}

  // 把 socket 上绑定的租户身份取回（shared 模式由 handleConnection 从握手头解析后存）。
  private socketTenant(client: Socket): TenantContext | undefined {
    return (client.data as { tenant?: TenantContext })?.tenant;
  }

  // 在 socket 的租户帧里跑 WS 事件处理（shared 模式）。socket.io adapter 不会把 ALS
  // 传进 message handler，所以每个 @SubscribeMessage 都得手动用它包一层；否则下游
  // getOwnerOrThrow 无上下文会 fail-closed 抛。LPP 模式直接跑，行为不变。
  private async withTenant<T>(client: Socket, fn: () => Promise<T>): Promise<T> {
    if (!isSharedWorldMode()) {
      return fn();
    }
    const tenant = this.socketTenant(client);
    if (!tenant) {
      throw new Error('TENANT_CONTEXT_MISSING');
    }
    return TenantContextStore.run(tenant, fn);
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    // shared 模式：从 cloud-api ws-proxy 注入的受信握手头解析 phone → 绑定租户身份到
    // socket，并加入 owner 房间（用于 owner 级广播，如订阅到期）。缺头 = 非法连接，
    // 直接断开（fail-closed）。LPP / wiki 模式没有这个头，跳过，行为不变。
    if (isSharedWorldMode()) {
      const raw = client.handshake.headers[INTERNAL_USER_PHONE_HEADER];
      const phone = (Array.isArray(raw) ? raw[0] : raw)?.trim();
      if (!phone) {
        this.logger.warn(`ws connection without tenant phone, disconnecting ${client.id}`);
        client.disconnect(true);
        return;
      }
      try {
        const tenant = await this.tenantService.ensureTenant(phone);
        (client.data as { tenant?: TenantContext }).tenant = tenant;
        void client.join(`owner:${tenant.ownerId}`);
      } catch (error) {
        this.logger.error(
          `ws tenant bind failed phone=${phone}: ${error instanceof Error ? error.message : String(error)}`,
        );
        client.disconnect(true);
        return;
      }
    }

    // socket 连接握手后立即下发 buildId，客户端比对自己的旧版本决定是否 reload。
    client.emit('system.hello', { buildId: SYSTEM_BUILD_ID });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // 清理 owner 级订阅到期去重记录，避免 Map 随连接数无限增长。
    const tenant = this.socketTenant(client);
    if (tenant) {
      this.subscriptionExpiredEmitAtByOwner.delete(tenant.ownerId);
    }
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

  // 群聊 / 调度器 cron 路径里抓到 SubscriptionExpiredException 时通过 socket
  // 推一条 error,前端 useConversationThread 已挂 handleSocketSubscriptionExpiredError,
  // 不至于让用户陷在"发完消息 AI 沉默"的无感状态。1v1 路径有外层 try/catch + client.emit
  // 已经覆盖了,只有 cron 异步路径需要这个补位。
  // 用 server.emit 全 broadcast(world child 是 owner-only,只服务一个用户),
  // 而不是 .to(roomId) ——后者要求前端正好在该 conversation 房间里,用户切到
  // chat-list / 视频号 / 个人主页就收不到 dialog 了。broadcast 覆盖所有页面 +
  // 多端登录,前端 SubscriptionExpiredDialogHost 是全局 zustand,重复 emit 也只显示一个 dialog。
  // 60s in-process dedupe:用户在群里连发 N 条消息 → cron N 次都 emit 会被前端反复
  // 弹回(关 dialog 再发 → 再弹)。同 SubscriptionService 的 cache TTL 60s 对齐,
  // 一个会员状态周期内只通知一次;cache 过期 lookup 还是 expired 就再 emit 一次。
  // 1h retry 路径(group-reply-task 推 1h 后再跑)间隔远大于 60s,会再 emit,
  // 这是合理的"系统提醒"。
  private lastSubscriptionExpiredEmitAt = 0;
  // shared 模式按 owner 去重（每个 owner 自己的 60s 窗口），LPP 模式用上面的单值。
  private readonly subscriptionExpiredEmitAtByOwner = new Map<string, number>();
  private static readonly SUBSCRIPTION_EXPIRED_EMIT_DEDUPE_MS = 60_000;

  emitSubscriptionExpired(error: SubscriptionExpiredException) {
    if (!this.server) {
      return;
    }
    const now = Date.now();
    const payload = this.toChatErrorPayload(error.message, error);

    // shared 模式：不能 server.emit 全 broadcast（会把一个用户的到期 dialog 推给所有
    // 在线租户）。改成只推给当前租户 owner 房间（该 owner 的所有在线端）。
    if (isSharedWorldMode()) {
      const ctx = TenantContextStore.get();
      if (!ctx) {
        // 没有租户上下文就无从定向，宁可不推也不全 broadcast 串号。
        return;
      }
      const last = this.subscriptionExpiredEmitAtByOwner.get(ctx.ownerId) ?? 0;
      if (now - last < ChatGateway.SUBSCRIPTION_EXPIRED_EMIT_DEDUPE_MS) {
        return;
      }
      this.subscriptionExpiredEmitAtByOwner.set(ctx.ownerId, now);
      this.server.to(`owner:${ctx.ownerId}`).emit('error', payload);
      return;
    }

    // LPP：单 owner 进程，沿用全 broadcast + 单值去重。
    if (
      now - this.lastSubscriptionExpiredEmitAt <
      ChatGateway.SUBSCRIPTION_EXPIRED_EMIT_DEDUPE_MS
    ) {
      return;
    }
    this.lastSubscriptionExpiredEmitAt = now;
    this.server.emit('error', payload);
  }

  @SubscribeMessage('join_conversation')
  async handleJoin(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    // shared 模式：只许加入属于本租户的会话房间——否则别的 owner 猜到 conversationId
    // 就能 join 进来收到 new_message。owner-scoped getConversation + afterLoad 守卫双重
    // 兜底：拿不到（非本人会话）即拒绝 join。LPP 模式沿用旧逻辑（乐观 join，不校验存在）。
    if (isSharedWorldMode()) {
      const allowed = await this.withTenant(client, async () => {
        const conv = await this.chatService.getConversation(data.conversationId);
        return Boolean(conv);
      });
      if (!allowed) {
        return { event: 'join_rejected', data: data.conversationId };
      }
    }
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
      // shared 模式：整个处理链（建会话 / 生成回复 / 落库 / emit）都在 socket 绑定的
      // 租户帧里跑，下游 getOwnerOrThrow 才能拿到正确 owner。LPP 模式 withTenant 直接跑。
      return await this.withTenant(client, async () => {
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
      });
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
