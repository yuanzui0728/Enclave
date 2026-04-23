import { mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThan, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiSpeechAssetsService } from '../ai/ai-speech-assets.service';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { AiMessagePart, ChatMessage } from '../ai/ai.types';
import { WorldOwnerService } from '../auth/world-owner.service';
import { REMINDER_CHARACTER_ID } from '../characters/reminder-character';
import { CharactersService } from '../characters/characters.service';
import { NarrativeService } from '../narrative/narrative.service';
import { ReminderRuntimeService } from '../reminder-runtime/reminder-runtime.service';
import { ActionRuntimeService } from '../action-runtime/action-runtime.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { ConversationEntity } from './conversation.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import { MessageEntity } from './message.entity';
import {
  searchMessages as searchVisibleMessages,
  sliceMessagesAround,
  type MessageSearchQuery,
  type MessageSearchResponse,
} from './message-search.utils';
import {
  ContactCardAttachment,
  Conversation,
  FileAttachment,
  ImageAttachment,
  LocationCardAttachment,
  Message,
  MessageAttachment,
  NoteCardAttachment,
  VoiceAttachment,
} from './chat.types';
import { CustomStickersService } from './custom-stickers.service';
import {
  resolvePrimaryChatAttachmentStorageDir,
  resolveReadableChatAttachmentPath,
} from './chat-attachment-storage';

type SendConversationMessageInput =
  | {
      type?: 'text';
      text: string;
    }
  | {
      type: 'sticker';
      text?: string;
      sticker: {
        sourceType?: 'builtin' | 'custom';
        packId?: string;
        stickerId: string;
      };
    }
  | {
      type: 'image';
      text?: string;
      attachment: ImageAttachment;
    }
  | {
      type: 'file';
      text?: string;
      attachment: FileAttachment;
    }
  | {
      type: 'voice';
      text?: string;
      attachment: VoiceAttachment;
    }
  | {
      type: 'contact_card';
      text?: string;
      attachment: ContactCardAttachment;
    }
  | {
      type: 'location_card';
      text?: string;
      attachment: LocationCardAttachment;
    }
  | {
      type: 'note_card';
      text?: string;
      attachment: NoteCardAttachment;
    };

type UploadedAttachmentFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

type ConversationMessageListQuery = {
  limit?: number;
  aroundMessageId?: string;
  before?: number;
  after?: number;
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private conversationHistory: Map<string, ChatMessage[]> = new Map();
  private readonly defaultStrongReminderHours = 3;
  private readonly maxStrongReminderHours = 24;

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly speechAssets: AiSpeechAssetsService,
    private readonly characters: CharactersService,
    private readonly narrativeService: NarrativeService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly actionRuntime: ActionRuntimeService,
    private readonly cyberAvatar: CyberAvatarService,
    private readonly customStickersService: CustomStickersService,
    private readonly reminderRuntime: ReminderRuntimeService,
    @InjectRepository(ConversationEntity)
    private convRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private msgRepo: Repository<MessageEntity>,
    @InjectRepository(GroupEntity)
    private groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private groupMemberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupMessageEntity)
    private groupMessageRepo: Repository<GroupMessageEntity>,
  ) {}

  async getOrCreateConversation(
    characterId: string,
    conversationId?: string,
  ): Promise<Conversation> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const convId = conversationId ?? `direct_${characterId}`;

    let entity = await this.convRepo.findOneBy({ id: convId });
    if (!entity) {
      const char = await this.characters.findById(characterId);
      entity = this.convRepo.create({
        id: convId,
        ownerId: owner.id,
        type: 'direct',
        title: char?.name ?? characterId,
        participants: [characterId],
        isPinned: false,
        isHidden: false,
        lastActivityAt: new Date(),
      });
      entity = await this.convRepo.save(entity);
      this.conversationHistory.set(convId, []);
    } else {
      entity = await this.normalizeLegacyConversationEntity(entity);
    }

    if (entity.isHidden) {
      entity = await this.convRepo.save({
        ...entity,
        isHidden: false,
        hiddenAt: null,
      });
    }

    return this.serializeConversation(entity);
  }

  async getConversation(convId: string): Promise<Conversation | undefined> {
    const entity = await this.convRepo.findOneBy({ id: convId });
    if (!entity) {
      return undefined;
    }

    const normalized = await this.normalizeLegacyConversationEntity(entity);
    return this.serializeConversation(normalized);
  }

  async getConversations(): Promise<
    (Conversation & { lastMessage?: Message; unreadCount: number })[]
  > {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const convs = await this.convRepo.find({
      where: { ownerId: owner.id, isHidden: false },
    });

    const result: (Conversation & {
      lastMessage?: Message;
      unreadCount: number;
    })[] = [];
    for (const rawConversation of convs) {
      const conv =
        await this.normalizeLegacyConversationEntity(rawConversation);
      const cutoff = this.getVisibleMessageCutoff(conv);
      const lastMsgEntity = await this.msgRepo.findOne({
        where: this.buildMessageWhere(conv.id, cutoff),
        order: { createdAt: 'DESC' },
      });
      const lastMessage = lastMsgEntity
        ? await this.serializeMessage(lastMsgEntity)
        : undefined;

      const unreadCutoff = this.getUnreadCutoff(conv);
      const unreadCount = await this.msgRepo.count({
        where: this.buildMessageWhere(conv.id, unreadCutoff, {
          senderType: 'character',
        }),
      });

      result.push({
        ...(await this.serializeConversation(conv)),
        lastMessage,
        unreadCount,
      });
    }

    const groupMemberships = await this.groupMemberRepo.find({
      where: {
        memberId: owner.id,
        memberType: 'user',
      },
    });
    const groupIds = [...new Set(groupMemberships.map((item) => item.groupId))];
    const groups = groupIds.length
      ? await this.groupRepo.find({
          where: { id: In(groupIds), isHidden: false },
        })
      : [];

    for (const group of groups) {
      const members = await this.groupMemberRepo.find({
        where: { groupId: group.id },
        order: { joinedAt: 'ASC' },
      });
      const lastGroupMessage = await this.groupMessageRepo.findOne({
        where: group.lastClearedAt
          ? {
              groupId: group.id,
              createdAt: MoreThan(group.lastClearedAt),
            }
          : { groupId: group.id },
        order: { createdAt: 'DESC' },
      });
      const unreadCutoff = this.getGroupUnreadCutoff(group);
      const unreadCount = await this.groupMessageRepo.count({
        where: this.buildGroupMessageWhere(group.id, unreadCutoff, {
          senderType: 'character',
        }),
      });

      result.push({
        ...this.groupToConversation(group, members, lastGroupMessage),
        unreadCount,
      });
    }

    result.sort((left, right) => {
      if (left.isPinned !== right.isPinned) {
        return left.isPinned ? -1 : 1;
      }

      const pinnedDelta =
        this.getSortableTimestamp(right.pinnedAt) -
        this.getSortableTimestamp(left.pinnedAt);
      if (pinnedDelta !== 0) {
        return pinnedDelta;
      }

      return (
        this.getSortableTimestamp(right.lastActivityAt) -
        this.getSortableTimestamp(left.lastActivityAt)
      );
    });

    return result;
  }

  async markConversationRead(convId: string): Promise<void> {
    const entity = await this.requireOwnedConversation(convId);
    await this.convRepo.save({
      ...entity,
      lastReadAt: new Date(),
    });
  }

  async markConversationUnread(convId: string): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const lastCharacterMessage = await this.msgRepo.findOne({
      where: this.buildMessageWhere(
        convId,
        this.getVisibleMessageCutoff(entity),
        {
          senderType: 'character',
        },
      ),
      order: { createdAt: 'DESC' },
    });

    if (!lastCharacterMessage) {
      return this.serializeConversation(entity);
    }

    const previousReadAt = new Date(
      lastCharacterMessage.createdAt.getTime() - 1,
    );
    const lastClearedAt = entity.lastClearedAt
      ? new Date(entity.lastClearedAt)
      : null;
    const nextReadAt =
      lastClearedAt && previousReadAt.getTime() < lastClearedAt.getTime()
        ? lastClearedAt
        : previousReadAt;
    const updated = await this.convRepo.save({
      ...entity,
      lastReadAt: nextReadAt,
    });

    return this.serializeConversation(updated);
  }

  async recallConversationMessage(
    convId: string,
    messageId: string,
  ): Promise<Message> {
    const entity = await this.requireOwnedConversation(convId);
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const message = await this.msgRepo.findOneBy({
      id: messageId,
      conversationId: convId,
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (message.senderType !== 'user' || message.senderId !== owner.id) {
      throw new BadRequestException('只能撤回自己发送的消息。');
    }

    const recalled = await this.msgRepo.save({
      ...message,
      senderType: 'system',
      senderId: 'system',
      senderName: 'system',
      type: 'system',
      text: '你撤回了一条消息',
      attachmentKind: null,
      attachmentPayload: null,
    });

    this.conversationHistory.delete(entity.id);
    return this.serializeMessage(recalled);
  }

  async deleteConversationMessage(
    convId: string,
    messageId: string,
  ): Promise<{ success: true }> {
    const entity = await this.requireOwnedConversation(convId);
    const message = await this.msgRepo.findOneBy({
      id: messageId,
      conversationId: convId,
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    await this.msgRepo.delete({ id: message.id });
    this.conversationHistory.delete(entity.id);
    await this.syncConversationLastActivity(entity);

    return { success: true };
  }

  async setConversationPinned(
    convId: string,
    pinned: boolean,
  ): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const updated = await this.convRepo.save({
      ...entity,
      isPinned: pinned,
      pinnedAt: pinned ? new Date() : null,
    });

    return this.serializeConversation(updated);
  }

  async setConversationMuted(
    convId: string,
    muted: boolean,
  ): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const updated = await this.convRepo.save({
      ...entity,
      isMuted: muted,
      mutedAt: muted ? new Date() : null,
    });
    return this.serializeConversation(updated);
  }

  async setConversationStrongReminder(
    convId: string,
    enabled: boolean,
    durationHours?: number,
  ): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const nextStrongReminderUntil = enabled
      ? new Date(
          Date.now() +
            this.resolveStrongReminderDurationHours(durationHours) *
              60 *
              60 *
              1000,
        )
      : null;
    const updated = await this.convRepo.save({
      ...entity,
      strongReminderUntil: nextStrongReminderUntil,
    });
    return this.serializeConversation(updated);
  }

  async hideConversation(convId: string): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const updated = await this.convRepo.save({
      ...entity,
      isHidden: true,
      hiddenAt: new Date(),
    });

    return this.serializeConversation(updated);
  }

  async clearConversationHistory(convId: string): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const now = new Date();
    const updated = await this.convRepo.save({
      ...entity,
      lastClearedAt: now,
      lastReadAt: now,
    });

    this.conversationHistory.set(convId, []);
    return this.serializeConversation(updated);
  }

  async getMessages(
    conversationId: string,
    query: number | ConversationMessageListQuery = {},
  ): Promise<Message[]> {
    const conversation = await this.requireOwnedConversation(conversationId);
    const options: ConversationMessageListQuery =
      typeof query === 'number' ? { limit: query } : query;
    const aroundMessageId = options.aroundMessageId?.trim();

    if (aroundMessageId) {
      const entities =
        await this.listVisibleConversationMessageEntities(conversation);
      const window = sliceMessagesAround(
        entities,
        aroundMessageId,
        options.before,
        options.after,
      );
      if (!window) {
        throw new NotFoundException(`Message ${aroundMessageId} not found`);
      }

      return this.serializeMessages(window);
    }

    const limit = options.limit;
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      const where = this.buildMessageWhere(
        conversationId,
        this.getVisibleMessageCutoff(conversation),
      );
      const entities = (
        await this.msgRepo.find({
          where,
          order: { createdAt: 'DESC' },
          take: limit,
        })
      ).reverse();
      return this.serializeMessages(entities);
    }

    return this.serializeMessages(
      await this.listVisibleConversationMessageEntities(conversation),
    );
  }

  async searchConversationMessages(
    conversationId: string,
    query: MessageSearchQuery,
  ): Promise<MessageSearchResponse> {
    const conversation = await this.requireOwnedConversation(conversationId);
    const messages = await this.serializeMessages(
      await this.listVisibleConversationMessageEntities(conversation),
    );

    return searchVisibleMessages(messages, query);
  }

  async getCharacterActivity(charId: string): Promise<string | undefined> {
    const char = await this.characters.findById(charId);
    return char?.currentActivity;
  }

  async saveUploadedAttachment(
    file: UploadedAttachmentFile,
    metadata: { width?: number; height?: number; durationMs?: number },
  ): Promise<ImageAttachment | FileAttachment | VoiceAttachment> {
    const isImage = file.mimetype.startsWith('image/');
    const isVoice = file.mimetype.startsWith('audio/');
    const displayName = normalizeDisplayAttachmentName(
      file.originalname,
      isImage ? 'image' : isVoice ? 'voice' : 'file',
      file.mimetype,
    );
    const extension =
      path.extname(displayName) || guessAttachmentExtension(file.mimetype);
    const baseName = path.basename(displayName, extension) || 'attachment';
    const storedFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeAttachmentFileName(baseName)}${extension}`;
    const storageDir = this.resolveAttachmentStorageDir();
    const normalizedMimeType = file.mimetype || 'application/octet-stream';

    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, storedFileName), file.buffer);

    if (isImage) {
      return {
        kind: 'image',
        url: `${this.resolvePublicApiBaseUrl()}/api/chat/attachments/${storedFileName}`,
        mimeType: normalizedMimeType,
        fileName: displayName,
        size: file.size,
        width: normalizeOptionalDimension(metadata.width),
        height: normalizeOptionalDimension(metadata.height),
      };
    }

    if (isVoice) {
      return {
        kind: 'voice',
        url: `${this.resolvePublicApiBaseUrl()}/api/chat/attachments/${storedFileName}`,
        mimeType: normalizedMimeType,
        fileName: displayName,
        size: file.size,
        durationMs: normalizeOptionalDimension(metadata.durationMs),
      };
    }

    return {
      kind: 'file',
      url: `${this.resolvePublicApiBaseUrl()}/api/chat/attachments/${storedFileName}`,
      mimeType: normalizedMimeType,
      fileName: displayName,
      size: file.size,
    };
  }

  getAttachmentStorageDir(): string {
    return this.resolveAttachmentStorageDir();
  }

  resolveAttachmentFilePath(fileName: string): string {
    return resolveReadableChatAttachmentPath(fileName);
  }

  normalizeAttachmentFileName(fileName: string): string {
    const normalized = path.basename(fileName).trim();
    if (!normalized) {
      throw new NotFoundException('Attachment not found');
    }

    return normalized;
  }

  async saveProactiveMessage(
    conversationId: string,
    characterId: string,
    characterName: string,
    text: string,
  ): Promise<Message> {
    const entity = await this.requireOwnedConversation(conversationId);

    const messageEntity = this.msgRepo.create({
      id: `msg_${Date.now()}_proactive`,
      conversationId,
      senderType: 'character',
      senderId: characterId,
      senderName: characterName,
      type: 'proactive',
      text,
    });

    await this.msgRepo.save(messageEntity);
    await this.touchConversationActivity(
      entity,
      messageEntity.createdAt ?? new Date(),
    );

    const history = await this.ensureConversationHistory(entity);
    history.push({
      role: 'assistant',
      content: sanitizeAiText(text),
      parts: this.buildTextAiParts(sanitizeAiText(text)),
      characterId,
    });
    this.conversationHistory.set(conversationId, history);

    return this.serializeMessage(messageEntity);
  }

  async saveProactiveAttachmentMessage(
    conversationId: string,
    characterId: string,
    characterName: string,
    attachment: MessageAttachment,
    text?: string,
  ): Promise<Message> {
    const entity = await this.requireOwnedConversation(conversationId);
    const fallbackText =
      text?.trim() || this.getAttachmentFallbackText(attachment);

    const messageEntity = this.msgRepo.create({
      id: `msg_${Date.now()}_${attachment.kind}`,
      conversationId,
      senderType: 'character',
      senderId: characterId,
      senderName: characterName,
      type: attachment.kind,
      text: fallbackText,
      attachmentKind: attachment.kind,
      attachmentPayload: JSON.stringify(attachment),
    });

    await this.msgRepo.save(messageEntity);
    await this.touchConversationActivity(
      entity,
      messageEntity.createdAt ?? new Date(),
    );

    const history = await this.ensureConversationHistory(entity);
    history.push({
      role: 'assistant',
      content: fallbackText,
      parts: this.buildAiParts(fallbackText, attachment),
      characterId,
    });
    this.conversationHistory.set(conversationId, history);

    return this.serializeMessage(messageEntity);
  }

  async saveSystemMessage(
    conversationId: string,
    text: string,
  ): Promise<Message> {
    const entity = await this.requireOwnedConversation(conversationId);

    const messageEntity = this.msgRepo.create({
      id: `msg_${Date.now()}_sys`,
      conversationId,
      senderType: 'system',
      senderId: 'system',
      senderName: 'system',
      type: 'system',
      text,
    });

    await this.msgRepo.save(messageEntity);
    await this.touchConversationActivity(
      entity,
      messageEntity.createdAt ?? new Date(),
    );
    return this.serializeMessage(messageEntity);
  }

  async sendMessage(
    convId: string,
    input: SendConversationMessageInput,
  ): Promise<Message[]> {
    const entity = await this.requireOwnedConversation(convId);

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const aiKeyOverride =
      (await this.worldOwnerService.getOwnerAiConfig()) ?? undefined;
    const normalizedInput = await this.normalizeOutgoingMessageInput(
      input,
      convId,
    );

    const userMsgEntity = this.msgRepo.create({
      id: `msg_${Date.now()}`,
      conversationId: convId,
      senderType: 'user',
      senderId: owner.id,
      senderName: owner.username?.trim() || 'You',
      type: normalizedInput.type,
      text: normalizedInput.text,
      attachmentKind: normalizedInput.attachment?.kind ?? null,
      attachmentPayload: normalizedInput.attachment
        ? JSON.stringify(normalizedInput.attachment)
        : null,
    });
    await this.msgRepo.save(userMsgEntity);
    await this.touchConversationActivity(
      entity,
      userMsgEntity.createdAt ?? new Date(),
    );

    const userMsg = await this.serializeMessage(userMsgEntity);
    const history = await this.ensureConversationHistory(entity);
    history.push({
      role: 'user',
      content: normalizedInput.promptText,
      parts: normalizedInput.aiParts,
    });

    const results: Message[] = [userMsg];

    const charId = entity.participants[0];
    const profile = await this.characters.getProfile(charId);
    if (!profile) {
      throw new Error(`Profile not found for ${charId}`);
    }
    void this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'direct_message',
      sourceSurface: 'chat',
      sourceEntityType: 'conversation_message',
      sourceEntityId: userMsgEntity.id,
      dedupeKey: `direct_message:${userMsgEntity.id}`,
      summaryText: `单聊对 ${entity.title} 发送：${normalizedInput.promptText.slice(0, 120)}`,
      payload: {
        conversationId: convId,
        conversationTitle: entity.title,
        characterId: charId,
        messageType: normalizedInput.type,
        text: normalizedInput.promptText,
      },
      occurredAt: userMsgEntity.createdAt ?? new Date(),
    });

    const charEntity = await this.characters.findById(charId);
    const lastMsg = await this.msgRepo.findOne({
      where: {
        conversationId: convId,
        senderType: 'user',
      },
      order: { createdAt: 'DESC' },
    });
    const chatContext = {
      currentActivity: charEntity?.currentActivity,
      lastChatAt: lastMsg?.createdAt,
    };
    const actionResult = charEntity
      ? await this.actionRuntime.handleConversationTurn({
          conversationId: convId,
          ownerId: owner.id,
          character: charEntity,
          userMessage: normalizedInput.promptText,
        })
      : { handled: false };
    const reminderResult =
      charId === REMINDER_CHARACTER_ID
        ? await this.reminderRuntime.handleConversationTurn({
            conversationId: convId,
            userMessage: normalizedInput.promptText,
            sourceMessageId: userMsgEntity.id,
          })
        : { handled: false };

    const assistantReplyText = actionResult.handled
      ? (actionResult.responseText?.trim() ?? '')
      : reminderResult.handled
        ? (reminderResult.responseText?.trim() ?? '')
      : (
          await this.ai.generateReply({
            profile,
            conversationHistory: history,
            userMessage: normalizedInput.promptText,
            userMessageParts: normalizedInput.aiParts,
            chatContext,
            aiKeyOverride,
            usageContext: {
              surface: 'app',
              scene: 'chat_reply',
              scopeType: 'conversation',
              scopeId: convId,
              scopeLabel: entity.title,
              ownerId: owner.id,
              characterId: charId,
              characterName: profile.name,
              conversationId: convId,
            },
          })
        ).text;

    if (assistantReplyText) {
      const aiEntity = this.msgRepo.create({
        id: `msg_${Date.now()}_ai`,
        conversationId: convId,
        senderType: 'character',
        senderId: charId,
        senderName: profile.name,
        type: 'text',
        text: assistantReplyText,
      });
      const savedAiEntity = await this.msgRepo.save(aiEntity);
      await this.touchConversationActivity(
        entity,
        savedAiEntity.createdAt ?? new Date(),
      );
      if (this.shouldIncludeAssistantMessageInHistory(assistantReplyText)) {
        history.push({
          role: 'assistant',
          content: assistantReplyText,
          parts: this.buildTextAiParts(assistantReplyText),
          characterId: charId,
        });
      }
      this.conversationHistory.set(convId, history);
      results.push(await this.serializeMessage(savedAiEntity));
    }

    const runtimeRules = await this.replyLogicRules.getRules();
    if (
      history.length % runtimeRules.memoryCompressionEveryMessages === 0 &&
      history.length > 0
    ) {
      const primaryCharId = entity.participants[0];
      const char = await this.characters.findById(primaryCharId);
      if (char) {
        const runtimeProfile =
          (await this.characters.getRuntimeProfileFromCharacter(char)) ??
          char.profile;
        const newMemory = await this.ai.compressMemory(
          history,
          runtimeProfile,
          {
            surface: 'app',
            scene: 'memory_compress',
            scopeType: 'conversation',
            scopeId: convId,
            scopeLabel: entity.title,
            ownerId: entity.ownerId,
            characterId: primaryCharId,
            characterName: char.name,
            conversationId: convId,
          },
        );
        if (!char.profile.memory) {
          char.profile.memory = {
            coreMemory: char.profile.memorySummary ?? '',
            recentSummary: newMemory,
            forgettingCurve: 70,
          };
        } else {
          char.profile.memory.recentSummary = newMemory;
        }
        await this.characters.upsert(char);
      }
    }

    await this.syncNarrativeArc(entity);
    return results;
  }

  private shouldCreateVoiceReply(
    inputType:
      | 'text'
      | 'sticker'
      | 'image'
      | 'file'
      | 'voice'
      | 'contact_card'
      | 'location_card'
      | 'note_card',
  ) {
    return inputType === 'voice';
  }

  private async createAssistantReplyMessageEntity(input: {
    conversationId: string;
    characterId: string;
    characterName: string;
    text: string;
    replyToInputType:
      | 'text'
      | 'sticker'
      | 'image'
      | 'file'
      | 'voice'
      | 'contact_card'
      | 'location_card'
      | 'note_card';
  }) {
    const baseMessage = {
      conversationId: input.conversationId,
      senderType: 'character' as const,
      senderId: input.characterId,
      senderName: input.characterName,
      type: 'text' as const,
      text: input.text,
      attachmentKind: null as string | null,
      attachmentPayload: null as string | null,
    };

    if (!this.shouldCreateVoiceReply(input.replyToInputType)) {
      return baseMessage;
    }

    try {
      const synthesized = await this.ai.synthesizeSpeech({
        text: input.text,
        conversationId: input.conversationId,
        characterId: input.characterId,
        instructions: buildAssistantSpeechInstructions(input.characterName),
      });
      const asset = await this.speechAssets.saveGeneratedSpeech(
        synthesized.buffer,
        {
          mimeType: synthesized.mimeType,
          fileExtension: synthesized.fileExtension,
          baseName: `chat-reply-${input.characterId}`,
        },
      );
      const attachment: VoiceAttachment = {
        kind: 'voice',
        url: asset.audioUrl,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        size: synthesized.buffer.length,
        transcriptText: input.text,
      };

      return {
        ...baseMessage,
        type: 'voice' as const,
        attachmentKind: attachment.kind,
        attachmentPayload: JSON.stringify(attachment),
      };
    } catch (error) {
      this.logger.warn(
        'Failed to synthesize assistant voice reply, falling back to text.',
        {
          conversationId: input.conversationId,
          characterId: input.characterId,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );
      return baseMessage;
    }
  }

  private async enrichAttachmentForAi(
    attachment: MessageAttachment,
    conversationId?: string,
  ): Promise<MessageAttachment> {
    if (attachment.kind === 'voice') {
      if (attachment.transcriptText?.trim()) {
        return attachment;
      }

      const transcription = await this.ai.tryTranscribeMediaFromUrl({
        url: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        conversationId,
        mode: 'chat_attachment',
      });
      return transcription?.text
        ? {
            ...attachment,
            transcriptText: transcription.text,
          }
        : attachment;
    }

    if (
      attachment.kind === 'file' &&
      /^(audio|video)\//i.test(attachment.mimeType)
    ) {
      if (attachment.transcriptText?.trim()) {
        return attachment;
      }

      const transcription = await this.ai.tryTranscribeMediaFromUrl({
        url: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        conversationId,
        mode: 'chat_attachment',
      });
      return transcription?.text
        ? {
            ...attachment,
            transcriptText: transcription.text,
          }
        : attachment;
    }

    return attachment;
  }

  private async syncNarrativeArc(
    conversation: ConversationEntity,
  ): Promise<void> {
    const primaryCharacterId = conversation.participants[0];
    if (!primaryCharacterId) {
      return;
    }

    const messageCount = await this.msgRepo.count({
      where: this.buildMessageWhere(
        conversation.id,
        this.getVisibleMessageCutoff(conversation),
      ),
    });

    if (messageCount < 4) {
      return;
    }

    const primaryCharacter = await this.characters.findById(primaryCharacterId);
    await this.narrativeService.recordConversationTurn({
      characterId: primaryCharacterId,
      characterName: primaryCharacter?.name,
      messageCount,
    });
  }

  private async ensureConversationHistory(
    conversation: ConversationEntity,
  ): Promise<ChatMessage[]> {
    const existing = this.conversationHistory.get(conversation.id);
    if (existing) {
      return existing;
    }

    const allMsgs = await this.msgRepo.find({
      where: this.buildMessageWhere(
        conversation.id,
        this.getVisibleMessageCutoff(conversation),
      ),
      order: { createdAt: 'ASC' },
    });
    const rebuiltHistory: ChatMessage[] = [];
    for (const message of allMsgs) {
      if (message.senderType === 'system') {
        continue;
      }

      const attachment = this.parseAttachment(message);
      const baseText =
        message.senderType === 'user'
          ? message.text
          : sanitizeAiText(message.text);

      if (
        message.senderType === 'character' &&
        !this.shouldIncludeAssistantMessageInHistory(baseText)
      ) {
        continue;
      }

      rebuiltHistory.push({
        role: message.senderType === 'user' ? 'user' : 'assistant',
        content:
          message.senderType === 'user'
            ? this.buildMessagePromptText(baseText, attachment)
            : baseText,
        parts:
          message.senderType === 'user'
            ? this.buildAiParts(baseText, attachment)
            : this.buildTextAiParts(baseText),
        characterId:
          message.senderType === 'character' ? message.senderId : undefined,
      });
    }

    this.conversationHistory.set(conversation.id, rebuiltHistory);
    return rebuiltHistory;
  }

  private async requireOwnedConversation(
    convId: string,
  ): Promise<ConversationEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const entity = await this.convRepo.findOneBy({
      id: convId,
      ownerId: owner.id,
    });
    if (!entity) {
      throw new NotFoundException(`Conversation ${convId} not found`);
    }

    return this.normalizeLegacyConversationEntity(entity);
  }

  private buildMessageWhere(
    conversationId: string,
    cutoff?: Date,
    extra: Partial<FindOptionsWhere<MessageEntity>> = {},
  ): FindOptionsWhere<MessageEntity> {
    return {
      conversationId,
      ...extra,
      ...(cutoff ? { createdAt: MoreThan(cutoff) } : {}),
    };
  }

  private listVisibleConversationMessageEntities(
    conversation: ConversationEntity,
  ) {
    return this.msgRepo.find({
      where: this.buildMessageWhere(
        conversation.id,
        this.getVisibleMessageCutoff(conversation),
      ),
      order: { createdAt: 'ASC' },
    });
  }

  private getVisibleMessageCutoff(
    conversation: ConversationEntity,
  ): Date | undefined {
    return conversation.lastClearedAt
      ? new Date(conversation.lastClearedAt)
      : undefined;
  }

  private getUnreadCutoff(conversation: ConversationEntity): Date | undefined {
    const timestamps = [conversation.lastReadAt, conversation.lastClearedAt]
      .filter((value): value is Date => Boolean(value))
      .map((value) => new Date(value).getTime());

    if (timestamps.length === 0) {
      return undefined;
    }

    return new Date(Math.max(...timestamps));
  }

  private shouldIncludeAssistantMessageInHistory(text: string) {
    const normalized = sanitizeAiText(text).trim();
    if (!normalized) {
      return false;
    }

    return !(
      normalized.startsWith('消息已送达，但') ||
      normalized.includes('没有配置可用的 AI Key') ||
      normalized.includes('AI Provider Key 无效') ||
      normalized.includes('AI Key 无效') ||
      normalized.includes('专属 AI Key 已失效')
    );
  }

  private getSortableTimestamp(value?: Date): number {
    if (!value) {
      return 0;
    }

    return new Date(value).getTime();
  }

  private async syncConversationLastActivity(
    conversation: ConversationEntity,
  ): Promise<void> {
    const lastMessage = await this.msgRepo.findOne({
      where: this.buildMessageWhere(
        conversation.id,
        this.getVisibleMessageCutoff(conversation),
      ),
      order: { createdAt: 'DESC' },
    });
    const timestamps = [
      lastMessage?.createdAt,
      conversation.lastClearedAt ?? undefined,
      conversation.createdAt,
    ]
      .filter((value): value is Date => Boolean(value))
      .map((value) => new Date(value).getTime());

    if (!timestamps.length) {
      return;
    }

    const nextLastActivityAt = new Date(Math.max(...timestamps));
    if (
      conversation.lastActivityAt &&
      conversation.lastActivityAt.getTime() === nextLastActivityAt.getTime()
    ) {
      return;
    }

    conversation.lastActivityAt = nextLastActivityAt;
    await this.convRepo.save(conversation);
  }

  private async touchConversationActivity(
    conversation: ConversationEntity,
    at: Date,
  ) {
    conversation.lastActivityAt = at;
    if (conversation.isHidden) {
      conversation.isHidden = false;
      conversation.hiddenAt = null;
    }
    await this.convRepo.save(conversation);
  }

  private _entityToConversation(entity: ConversationEntity): Conversation {
    return {
      id: entity.id,
      type: 'direct',
      source: 'conversation',
      title: entity.title,
      avatar: undefined,
      participants: entity.participants,
      messages: [],
      isPinned: entity.isPinned ?? false,
      pinnedAt: entity.pinnedAt ?? undefined,
      isMuted: entity.isMuted ?? false,
      mutedAt: entity.mutedAt ?? undefined,
      strongReminderUntil: entity.strongReminderUntil ?? undefined,
      lastReadAt: entity.lastReadAt ?? undefined,
      lastClearedAt: entity.lastClearedAt ?? undefined,
      lastActivityAt:
        entity.lastActivityAt ?? entity.updatedAt ?? entity.createdAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private async normalizeLegacyConversationEntity(
    entity: ConversationEntity,
  ): Promise<ConversationEntity> {
    const normalizedParticipants = [
      ...new Set(
        (entity.participants ?? []).map((item) => item.trim()).filter(Boolean),
      ),
    ];
    const primaryCharacterId = normalizedParticipants[0];
    const normalizedTitle = entity.title?.trim() ?? '';
    const needsNormalization =
      entity.type !== 'direct' ||
      normalizedParticipants.length !== 1 ||
      !normalizedTitle;

    if (!needsNormalization) {
      return entity;
    }

    const primaryCharacter = primaryCharacterId
      ? await this.characters.findById(primaryCharacterId)
      : null;
    const nextTitle =
      primaryCharacter?.name?.trim() ||
      normalizedTitle ||
      primaryCharacterId ||
      'Direct conversation';

    this.conversationHistory.delete(entity.id);

    return this.convRepo.save({
      ...entity,
      type: 'direct',
      participants: primaryCharacterId ? [primaryCharacterId] : [],
      title: nextTitle,
    });
  }

  private _entityToMessage(entity: MessageEntity): Message {
    return {
      id: entity.id,
      conversationId: entity.conversationId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderId: entity.senderId,
      senderName: entity.senderName,
      senderAvatar: undefined,
      type: entity.type as
        | 'text'
        | 'system'
        | 'proactive'
        | 'sticker'
        | 'image'
        | 'file'
        | 'voice'
        | 'contact_card'
        | 'location_card'
        | 'note_card',
      text:
        entity.senderType === 'user'
          ? entity.text
          : sanitizeAiText(entity.text),
      attachment: this.parseAttachment(entity),
      createdAt: entity.createdAt,
    };
  }

  private groupToConversation(
    group: GroupEntity,
    members: GroupMemberEntity[],
    lastMessageEntity?: GroupMessageEntity | null,
  ): Conversation & { lastMessage?: Message } {
    const lastMessage = lastMessageEntity
      ? this.groupMessageToConversationMessage(group.id, lastMessageEntity)
      : undefined;

    return {
      id: group.id,
      type: 'group',
      source: 'group',
      title: group.name,
      avatar: group.avatar ?? undefined,
      participants: members.map((member) => member.memberId),
      messages: [],
      isPinned: group.isPinned ?? false,
      pinnedAt: group.pinnedAt ?? undefined,
      isMuted: group.isMuted ?? false,
      mutedAt: group.mutedAt ?? undefined,
      lastReadAt: group.lastReadAt ?? undefined,
      lastClearedAt: group.lastClearedAt ?? undefined,
      lastActivityAt:
        group.lastActivityAt ??
        lastMessage?.createdAt ??
        group.updatedAt ??
        group.createdAt,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      lastMessage,
    };
  }

  private async serializeConversation(
    entity: ConversationEntity,
  ): Promise<Conversation> {
    const conversation = this._entityToConversation(entity);
    const characterId = conversation.participants[0]?.trim();
    if (!characterId) {
      return conversation;
    }

    const avatar = await this.resolveCharacterAvatar(characterId);
    if (!avatar) {
      return conversation;
    }

    return {
      ...conversation,
      avatar,
    };
  }

  private async serializeMessages(entities: MessageEntity[]): Promise<Message[]> {
    return Promise.all(entities.map((entity) => this.serializeMessage(entity)));
  }

  private async serializeMessage(entity: MessageEntity): Promise<Message> {
    const message = this._entityToMessage(entity);
    if (message.senderType !== 'character') {
      return message;
    }

    const senderAvatar = await this.resolveCharacterAvatar(message.senderId);
    if (!senderAvatar) {
      return message;
    }

    return {
      ...message,
      senderAvatar,
    };
  }

  private async resolveCharacterAvatar(characterId?: string | null) {
    const normalizedCharacterId = characterId?.trim();
    if (!normalizedCharacterId) {
      return undefined;
    }

    const character = await this.characters.findById(normalizedCharacterId);
    return character?.avatar?.trim() || undefined;
  }

  private resolveStrongReminderDurationHours(durationHours?: number) {
    if (
      !Number.isFinite(durationHours) ||
      !durationHours ||
      durationHours <= 0
    ) {
      return this.defaultStrongReminderHours;
    }

    return Math.min(durationHours, this.maxStrongReminderHours);
  }

  private groupMessageToConversationMessage(
    conversationId: string,
    entity: GroupMessageEntity,
  ): Message {
    return {
      id: entity.id,
      conversationId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderId: entity.senderId,
      senderName: entity.senderName,
      type: entity.type as
        | 'text'
        | 'system'
        | 'proactive'
        | 'sticker'
        | 'image'
        | 'file'
        | 'voice'
        | 'contact_card'
        | 'location_card',
      text:
        entity.senderType === 'user'
          ? entity.text
          : sanitizeAiText(entity.text),
      attachment: this.parseGroupAttachment(entity),
      createdAt: entity.createdAt,
    };
  }

  private parseGroupAttachment(
    entity: GroupMessageEntity,
  ): MessageAttachment | undefined {
    if (!entity.attachmentKind || !entity.attachmentPayload) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(entity.attachmentPayload) as MessageAttachment;
      if (parsed.kind !== entity.attachmentKind) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  private buildGroupMessageWhere(
    groupId: string,
    since?: Date,
    extra: Partial<
      Pick<GroupMessageEntity, 'senderType' | 'senderId' | 'type'>
    > = {},
  ): FindOptionsWhere<GroupMessageEntity> {
    return {
      groupId,
      ...(since ? { createdAt: MoreThan(since) } : {}),
      ...extra,
    };
  }

  private getGroupUnreadCutoff(group: GroupEntity): Date | undefined {
    const timestamps = [group.lastReadAt, group.lastClearedAt]
      .filter(Boolean)
      .map((value) => new Date(value!));

    if (!timestamps.length) {
      return undefined;
    }

    return timestamps.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest,
    );
  }

  private async normalizeOutgoingMessageInput(
    input: SendConversationMessageInput,
    conversationId?: string,
  ): Promise<{
    type:
      | 'text'
      | 'sticker'
      | 'image'
      | 'file'
      | 'voice'
      | 'contact_card'
      | 'location_card'
      | 'note_card';
    text: string;
    promptText: string;
    aiParts: AiMessagePart[];
    attachment?: MessageAttachment;
  }> {
    if (input.type === 'sticker') {
      const attachment =
        await this.customStickersService.resolveStickerAttachment({
          sourceType: input.sticker.sourceType,
          packId: input.sticker.packId,
          stickerId: input.sticker.stickerId,
        });
      if (!attachment) {
        throw new NotFoundException('Sticker not found');
      }

      const fallbackText =
        input.text?.trim() ||
        `[表情包] ${attachment.label ?? attachment.stickerId}`;
      return {
        type: 'sticker',
        text: fallbackText,
        promptText: fallbackText,
        aiParts: this.buildAiParts(fallbackText, attachment),
        attachment,
      };
    }

    if (
      input.type === 'image' ||
      input.type === 'file' ||
      input.type === 'voice' ||
      input.type === 'contact_card' ||
      input.type === 'location_card' ||
      input.type === 'note_card'
    ) {
      if (!input.attachment || input.attachment.kind !== input.type) {
        throw new NotFoundException('Attachment payload is invalid');
      }
      const attachment = await this.enrichAttachmentForAi(
        input.attachment,
        conversationId,
      );

      const fallbackText =
        input.text?.trim() || this.getAttachmentFallbackText(attachment);
      const promptText = this.buildMessagePromptText(fallbackText, attachment);
      return {
        type: input.type,
        text: fallbackText,
        promptText,
        aiParts: this.buildAiParts(fallbackText, attachment),
        attachment,
      };
    }

    const text = input.text.trim();
    if (!text) {
      throw new NotFoundException('Message text is required');
    }

    return {
      type: 'text',
      text,
      promptText: text,
      aiParts: this.buildTextAiParts(text),
    };
  }

  private buildAiParts(
    text: string,
    attachment?: MessageAttachment,
  ): AiMessagePart[] {
    if (!attachment) {
      return this.buildTextAiParts(text);
    }

    const promptText = this.buildMessagePromptText(text, attachment);

    if (attachment.kind === 'image') {
      return [
        {
          type: 'image',
          imageUrl: attachment.url,
          detail: 'auto',
          altText: promptText,
          mimeType: attachment.mimeType,
        },
      ];
    }

    if (attachment.kind === 'file') {
      return [
        {
          type: 'file',
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          url: attachment.url,
          summaryText: promptText,
        },
      ];
    }

    if (attachment.kind === 'voice') {
      return this.buildTextAiParts(
        this.buildMessagePromptText(text, attachment),
      );
    }

    if (attachment.kind === 'contact_card') {
      return [
        {
          type: 'contact_card',
          name: attachment.name,
          relationship: attachment.relationship,
          bio: attachment.bio,
          summaryText: promptText,
        },
      ];
    }

    if (attachment.kind === 'location_card') {
      return [
        {
          type: 'location_card',
          title: attachment.title,
          subtitle: attachment.subtitle,
          summaryText: promptText,
        },
      ];
    }

    if (attachment.kind === 'note_card') {
      return this.buildTextAiParts(promptText);
    }

    return [
      {
        type: 'sticker',
        label: attachment.label,
        summaryText: promptText,
      },
    ];
  }

  private buildTextAiParts(text: string): AiMessagePart[] {
    return [{ type: 'text', text }];
  }

  private buildMessagePromptText(
    text: string,
    attachment?: MessageAttachment,
  ): string {
    if (!attachment) {
      return text;
    }

    const fallbackText = this.getAttachmentFallbackText(attachment);
    const caption =
      text.trim() && text.trim() !== fallbackText ? text.trim() : undefined;

    if (attachment.kind === 'image') {
      const dimensions =
        attachment.width && attachment.height
          ? `，尺寸 ${attachment.width}x${attachment.height}`
          : '';
      const captionText = caption ? `，补充说明：${caption}` : '';
      return `发来一张图片，文件名：${attachment.fileName}${dimensions}${captionText}`.trim();
    }

    if (attachment.kind === 'file') {
      const sizeText = formatAttachmentSize(attachment.size);
      const captionText = caption ? `，补充说明：${caption}` : '';
      if (
        /^(audio|video)\//i.test(attachment.mimeType) &&
        attachment.transcriptText?.trim()
      ) {
        const mediaLabel = attachment.mimeType.startsWith('video/')
          ? '视频'
          : '音频';
        return `发来一个${mediaLabel}文件《${attachment.fileName}》${sizeText ? `，大小：${sizeText}` : ''}${captionText}，转写内容：${attachment.transcriptText.trim()}`.trim();
      }

      return `发来一个文件《${attachment.fileName}》${attachment.mimeType ? `，类型：${attachment.mimeType}` : ''}${sizeText ? `，大小：${sizeText}` : ''}${captionText}`.trim();
    }

    if (attachment.kind === 'voice') {
      const durationText =
        attachment.durationMs && attachment.durationMs > 0
          ? `，时长：${formatAttachmentDuration(attachment.durationMs)}`
          : '';
      const captionText = caption ? `，补充说明：${caption}` : '';
      const transcriptText = attachment.transcriptText?.trim();
      const transcription = transcriptText
        ? `，转写内容：${transcriptText}`
        : '';
      return `发来一条语音消息${durationText}${captionText}${transcription}`.trim();
    }

    if (attachment.kind === 'contact_card') {
      return `分享了一张名片：${attachment.name}${attachment.relationship ? `，关系：${attachment.relationship}` : ''}${attachment.bio ? `，简介：${attachment.bio}` : ''}`.trim();
    }

    if (attachment.kind === 'location_card') {
      return `分享了一个位置：${attachment.title}${attachment.subtitle ? `，${attachment.subtitle}` : ''}`.trim();
    }

    if (attachment.kind === 'note_card') {
      const detailParts = [
        `分享了一条笔记：${attachment.title}`,
        attachment.excerpt ? `摘要：${attachment.excerpt}` : '',
        attachment.tags.length
          ? `标签：${attachment.tags.map((tag) => `#${tag}`).join(' ')}`
          : '',
      ].filter(Boolean);
      const captionText = caption ? `，补充说明：${caption}` : '';
      return `${detailParts.join('，')}${captionText}`.trim();
    }

    return caption
      ? `发送了一个表情包：${attachment.label ?? attachment.stickerId}，补充说明：${caption}`
      : `发送了一个表情包：${attachment.label ?? attachment.stickerId}`;
  }

  private getAttachmentFallbackText(attachment: MessageAttachment): string {
    if (attachment.kind === 'image') {
      return `[图片] ${attachment.fileName}`.trim();
    }

    if (attachment.kind === 'file') {
      return `[文件] ${attachment.fileName}`.trim();
    }

    if (attachment.kind === 'voice') {
      const durationText =
        attachment.durationMs && attachment.durationMs > 0
          ? ` ${formatAttachmentDuration(attachment.durationMs)}`
          : '';
      return `[语音]${durationText}`.trim();
    }

    if (attachment.kind === 'contact_card') {
      return `[名片] ${attachment.name}`.trim();
    }

    if (attachment.kind === 'location_card') {
      return `[位置] ${attachment.title}`.trim();
    }

    if (attachment.kind === 'note_card') {
      return `[笔记] ${attachment.title}`.trim();
    }

    return `[表情包] ${attachment.label ?? attachment.stickerId}`.trim();
  }

  private parseAttachment(
    entity: MessageEntity,
  ): MessageAttachment | undefined {
    if (!entity.attachmentKind || !entity.attachmentPayload) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(entity.attachmentPayload) as MessageAttachment;
      if (parsed.kind !== entity.attachmentKind) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  private resolveAttachmentStorageDir(): string {
    return resolvePrimaryChatAttachmentStorageDir();
  }

  private resolvePublicApiBaseUrl(): string {
    return (
      process.env.PUBLIC_API_BASE_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? 3000}`
    ).replace(/\/+$/, '');
  }
}

function sanitizeAttachmentFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function formatAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return '';
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

function formatAttachmentDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '';
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds}"`;
}

function guessAttachmentExtension(mimeType: string) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return '.jpg';
  }

  if (mimeType === 'image/png') {
    return '.png';
  }

  if (mimeType === 'image/webp') {
    return '.webp';
  }

  if (mimeType === 'image/gif') {
    return '.gif';
  }

  if (mimeType === 'application/pdf') {
    return '.pdf';
  }

  if (mimeType === 'audio/webm' || mimeType === 'audio/webm;codecs=opus') {
    return '.webm';
  }

  if (mimeType === 'audio/ogg' || mimeType === 'audio/ogg;codecs=opus') {
    return '.ogg';
  }

  if (mimeType === 'audio/mp4') {
    return '.m4a';
  }

  if (mimeType === 'audio/mpeg') {
    return '.mp3';
  }

  if (mimeType === 'audio/wav') {
    return '.wav';
  }

  if (mimeType === 'text/plain') {
    return '.txt';
  }

  if (mimeType === 'application/zip') {
    return '.zip';
  }

  return '.bin';
}

function normalizeDisplayAttachmentName(
  originalName: string | undefined,
  fallbackBaseName: string,
  mimeType: string,
) {
  const rawName = (originalName ?? '').trim();
  const baseName = rawName ? path.basename(rawName) : fallbackBaseName;
  const extension =
    path.extname(baseName) || guessAttachmentExtension(mimeType);
  const nameWithoutExtension =
    path.basename(baseName, extension).trim() || fallbackBaseName;

  return `${nameWithoutExtension}${extension}`;
}

function normalizeOptionalDimension(value?: number) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value);
}

function buildAssistantSpeechInstructions(characterName: string) {
  const normalizedName = characterName.trim() || '助手';
  return `请用自然、温和、清晰的口语表达，以 ${normalizedName} 的身份朗读，不要加入舞台说明。`;
}
