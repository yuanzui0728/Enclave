import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThan, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { AiMessagePart, ChatMessage } from '../ai/ai.types';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharactersService } from '../characters/characters.service';
import { NarrativeService } from '../narrative/narrative.service';
import { ConversationEntity } from './conversation.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import { MessageEntity } from './message.entity';
import {
  ContactCardAttachment,
  Conversation,
  FileAttachment,
  ImageAttachment,
  LocationCardAttachment,
  Message,
  MessageAttachment,
  StickerAttachment,
} from './chat.types';
import { findStickerAttachment } from './sticker-catalog';

type SendConversationMessageInput =
  | {
      type?: 'text';
      text: string;
    }
  | {
      type: 'sticker';
      text?: string;
      sticker: {
        packId: string;
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
      type: 'contact_card';
      text?: string;
      attachment: ContactCardAttachment;
    }
  | {
      type: 'location_card';
      text?: string;
      attachment: LocationCardAttachment;
    };

type UploadedAttachmentFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

@Injectable()
export class ChatService {
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly narrativeService: NarrativeService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly replyLogicRules: ReplyLogicRulesService,
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
    } else if (entity.isHidden) {
      entity = await this.convRepo.save({
        ...entity,
        isHidden: false,
        hiddenAt: null,
      });
    }

    return this._entityToConversation(entity);
  }

  async getConversation(convId: string): Promise<Conversation | undefined> {
    const entity = await this.convRepo.findOneBy({ id: convId });
    return entity ? this._entityToConversation(entity) : undefined;
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
    for (const conv of convs) {
      const cutoff = this.getVisibleMessageCutoff(conv);
      const lastMsgEntity = await this.msgRepo.findOne({
        where: this.buildMessageWhere(conv.id, cutoff),
        order: { createdAt: 'DESC' },
      });
      const lastMessage = lastMsgEntity
        ? this._entityToMessage(lastMsgEntity)
        : undefined;

      const unreadCutoff = this.getUnreadCutoff(conv);
      const unreadCount = await this.msgRepo.count({
        where: this.buildMessageWhere(conv.id, unreadCutoff, {
          senderType: 'character',
        }),
      });

      result.push({
        ...this._entityToConversation(conv),
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
    await this.convRepo.update({ id: convId }, { lastReadAt: new Date() });
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

    return this._entityToConversation(updated);
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
    return this._entityToConversation(updated);
  }

  async hideConversation(convId: string): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const updated = await this.convRepo.save({
      ...entity,
      isHidden: true,
      hiddenAt: new Date(),
    });

    return this._entityToConversation(updated);
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
    return this._entityToConversation(updated);
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const conversation = await this.convRepo.findOneBy({ id: conversationId });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const entities = await this.msgRepo.find({
      where: this.buildMessageWhere(
        conversationId,
        this.getVisibleMessageCutoff(conversation),
      ),
      order: { createdAt: 'ASC' },
    });

    return entities.map((entity) => this._entityToMessage(entity));
  }

  async getCharacterActivity(charId: string): Promise<string | undefined> {
    const char = await this.characters.findById(charId);
    return char?.currentActivity;
  }

  async saveUploadedAttachment(
    file: UploadedAttachmentFile,
    metadata: { width?: number; height?: number },
  ): Promise<ImageAttachment | FileAttachment> {
    const isImage = file.mimetype.startsWith('image/');
    const displayName = normalizeDisplayAttachmentName(
      file.originalname,
      isImage ? 'image' : 'file',
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
    const entity = await this.convRepo.findOneBy({ id: conversationId });
    if (!entity) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

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

    return this._entityToMessage(messageEntity);
  }

  async saveSystemMessage(
    conversationId: string,
    text: string,
  ): Promise<Message> {
    const entity = await this.convRepo.findOneBy({ id: conversationId });
    if (!entity) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

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
    return this._entityToMessage(messageEntity);
  }

  async sendMessage(
    convId: string,
    input: SendConversationMessageInput,
  ): Promise<Message[]> {
    const entity = await this.convRepo.findOneBy({ id: convId });
    if (!entity) {
      throw new NotFoundException(`Conversation ${convId} not found`);
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const aiKeyOverride =
      (await this.worldOwnerService.getOwnerAiConfig()) ?? undefined;
    const normalizedInput = this.normalizeOutgoingMessageInput(input);

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

    const userMsg = this._entityToMessage(userMsgEntity);
    const history = await this.ensureConversationHistory(entity);
    history.push({
      role: 'user',
      content: normalizedInput.promptText,
      parts: normalizedInput.aiParts,
    });

    const results: Message[] = [userMsg];

    if (entity.type === 'direct') {
      const charId = entity.participants[0];
      const profile = await this.characters.getProfile(charId);
      if (!profile) {
        throw new Error(`Profile not found for ${charId}`);
      }

      if (normalizedInput.type === 'text') {
        const intent = await this.ai.classifyIntent(
          normalizedInput.promptText,
          profile.name,
          profile.expertDomains,
        );

        if (intent.needsGroupChat && intent.requiredDomains.length > 0) {
          const ownerConversations = await this.convRepo.find({
            where: { ownerId: owner.id },
          });
          const ownerFriendIds = new Set(
            ownerConversations
              .flatMap((conversation) => conversation.participants)
              .filter((id) => id !== charId),
          );

          const invitedChars = (
            await this.characters.findByDomains(intent.requiredDomains)
          )
            .filter(
              (character) =>
                character.id !== charId && ownerFriendIds.has(character.id),
            )
            .slice(0, 2);

          if (invitedChars.length > 0) {
            entity.type = 'group';
            entity.title = 'Temporary group chat';
            invitedChars.forEach((character) => {
              if (!entity.participants.includes(character.id)) {
                entity.participants.push(character.id);
              }
            });
            await this.convRepo.save(entity);

            const invitedNames = invitedChars
              .map((character) => character.name)
              .join(', ');
            const coordPrompt = `Explain that you want to invite ${invitedNames} into this conversation to help with the user's question. Keep it under 30 words.`;
            const coordReply = await this.ai.generateReply({
              profile,
              conversationHistory: history,
              userMessage: coordPrompt,
              userMessageParts: this.buildTextAiParts(coordPrompt),
              aiKeyOverride,
            });
            const coordEntity = this.msgRepo.create({
              id: `msg_${Date.now()}_coord`,
              conversationId: convId,
              senderType: 'character',
              senderId: charId,
              senderName: profile.name,
              type: 'text',
              text: coordReply.text,
            });
            await this.msgRepo.save(coordEntity);
            await this.touchConversationActivity(
              entity,
              coordEntity.createdAt ?? new Date(),
            );
            history.push({
              role: 'assistant',
              content: coordReply.text,
              parts: this.buildTextAiParts(coordReply.text),
              characterId: charId,
            });
            results.push(this._entityToMessage(coordEntity));

            for (const invited of invitedChars) {
              const sysEntity = this.msgRepo.create({
                id: `msg_${Date.now()}_sys_${invited.id}`,
                conversationId: convId,
                senderType: 'system',
                senderId: 'system',
                senderName: 'system',
                type: 'system',
                text: `${profile.name} invited ${invited.name} into the conversation.`,
              });
              await this.msgRepo.save(sysEntity);
              await this.touchConversationActivity(
                entity,
                sysEntity.createdAt ?? new Date(),
              );
              results.push(this._entityToMessage(sysEntity));
            }

            for (const invited of invitedChars) {
              const invitedProfile = await this.characters.getProfile(
                invited.id,
              );
              if (!invitedProfile) {
                continue;
              }

              const reply = await this.ai.generateReply({
                profile: invitedProfile,
                conversationHistory: history,
                userMessage: normalizedInput.promptText,
                userMessageParts: normalizedInput.aiParts,
                isGroupChat: true,
                aiKeyOverride,
              });
              const aiEntity = this.msgRepo.create({
                id: `msg_${Date.now()}_${invited.id}`,
                conversationId: convId,
                senderType: 'character',
                senderId: invited.id,
                senderName: invited.name,
                type: 'text',
                text: reply.text,
              });
              await this.msgRepo.save(aiEntity);
              await this.touchConversationActivity(
                entity,
                aiEntity.createdAt ?? new Date(),
              );
              history.push({
                role: 'assistant',
                content: reply.text,
                parts: this.buildTextAiParts(reply.text),
                characterId: invited.id,
              });
              results.push(this._entityToMessage(aiEntity));
            }

            await this.syncNarrativeArc(entity);
            this.conversationHistory.set(convId, history);
            return results;
          }
        }
      }

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
      const reply = await this.ai.generateReply({
        profile,
        conversationHistory: history,
        userMessage: normalizedInput.promptText,
        userMessageParts: normalizedInput.aiParts,
        chatContext,
        aiKeyOverride,
      });
      const aiEntity = this.msgRepo.create({
        id: `msg_${Date.now()}_ai`,
        conversationId: convId,
        senderType: 'character',
        senderId: charId,
        senderName: profile.name,
        type: 'text',
        text: reply.text,
      });
      await this.msgRepo.save(aiEntity);
      await this.touchConversationActivity(
        entity,
        aiEntity.createdAt ?? new Date(),
      );
      history.push({
        role: 'assistant',
        content: reply.text,
        parts: this.buildTextAiParts(reply.text),
        characterId: charId,
      });
      this.conversationHistory.set(convId, history);
      results.push(this._entityToMessage(aiEntity));
    } else {
      for (const charId of entity.participants) {
        const profile = await this.characters.getProfile(charId);
        if (!profile) {
          continue;
        }

        const reply = await this.ai.generateReply({
          profile,
          conversationHistory: history,
          userMessage: normalizedInput.promptText,
          userMessageParts: normalizedInput.aiParts,
          isGroupChat: true,
          aiKeyOverride,
        });
        const aiEntity = this.msgRepo.create({
          id: `msg_${Date.now()}_${charId}`,
          conversationId: convId,
          senderType: 'character',
          senderId: charId,
          senderName: profile.name,
          type: 'text',
          text: reply.text,
        });
        await this.msgRepo.save(aiEntity);
        await this.touchConversationActivity(
          entity,
          aiEntity.createdAt ?? new Date(),
        );
        history.push({
          role: 'assistant',
          content: reply.text,
          parts: this.buildTextAiParts(reply.text),
          characterId: charId,
        });
        results.push(this._entityToMessage(aiEntity));
      }

      this.conversationHistory.set(convId, history);
    }

    const runtimeRules = await this.replyLogicRules.getRules();
    if (
      history.length % runtimeRules.memoryCompressionEveryMessages === 0 &&
      history.length > 0
    ) {
      const primaryCharId = entity.participants[0];
      const char = await this.characters.findById(primaryCharId);
      if (char) {
        const newMemory = await this.ai.compressMemory(history, char.profile);
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
    const rebuiltHistory = allMsgs.map((message) => {
      const attachment = this.parseAttachment(message);
      const baseText =
        message.senderType === 'user'
          ? message.text
          : sanitizeAiText(message.text);

      return {
        role: message.senderType === 'user' ? 'user' : 'assistant',
        content: this.buildMessagePromptText(baseText, attachment),
        parts: this.buildAiParts(baseText, attachment),
        characterId:
          message.senderType === 'character' ? message.senderId : undefined,
      } satisfies ChatMessage;
    });

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

    return entity;
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

  private getSortableTimestamp(value?: Date): number {
    if (!value) {
      return 0;
    }

    return new Date(value).getTime();
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
      type: entity.type as 'direct' | 'group',
      title: entity.title,
      participants: entity.participants,
      messages: [],
      isPinned: entity.isPinned ?? false,
      pinnedAt: entity.pinnedAt ?? undefined,
      isMuted: entity.isMuted ?? false,
      mutedAt: entity.mutedAt ?? undefined,
      lastReadAt: entity.lastReadAt ?? undefined,
      lastClearedAt: entity.lastClearedAt ?? undefined,
      lastActivityAt:
        entity.lastActivityAt ?? entity.updatedAt ?? entity.createdAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private _entityToMessage(entity: MessageEntity): Message {
    return {
      id: entity.id,
      conversationId: entity.conversationId,
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
        | 'contact_card'
        | 'location_card',
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
      title: group.name,
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

  private normalizeOutgoingMessageInput(input: SendConversationMessageInput): {
    type:
      | 'text'
      | 'sticker'
      | 'image'
      | 'file'
      | 'contact_card'
      | 'location_card';
    text: string;
    promptText: string;
    aiParts: AiMessagePart[];
    attachment?: MessageAttachment;
  } {
    if (input.type === 'sticker') {
      const attachment = findStickerAttachment(
        input.sticker.packId,
        input.sticker.stickerId,
      );
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
      input.type === 'contact_card' ||
      input.type === 'location_card'
    ) {
      if (!input.attachment || input.attachment.kind !== input.type) {
        throw new NotFoundException('Attachment payload is invalid');
      }

      const fallbackText =
        input.text?.trim() || this.getAttachmentFallbackText(input.attachment);
      const promptText = this.buildMessagePromptText(
        fallbackText,
        input.attachment,
      );
      return {
        type: input.type,
        text: fallbackText,
        promptText,
        aiParts: this.buildAiParts(fallbackText, input.attachment),
        attachment: input.attachment,
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
      return `发来一个文件《${attachment.fileName}》${attachment.mimeType ? `，类型：${attachment.mimeType}` : ''}${sizeText ? `，大小：${sizeText}` : ''}${captionText}`.trim();
    }

    if (attachment.kind === 'contact_card') {
      return `分享了一张名片：${attachment.name}${attachment.relationship ? `，关系：${attachment.relationship}` : ''}${attachment.bio ? `，简介：${attachment.bio}` : ''}`.trim();
    }

    if (attachment.kind === 'location_card') {
      return `分享了一个位置：${attachment.title}${attachment.subtitle ? `，${attachment.subtitle}` : ''}`.trim();
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

    if (attachment.kind === 'contact_card') {
      return `[名片] ${attachment.name}`.trim();
    }

    if (attachment.kind === 'location_card') {
      return `[位置] ${attachment.title}`.trim();
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
    const cwd = process.cwd();
    const apiRoot =
      existsSync(path.join(cwd, 'src')) &&
      existsSync(path.join(cwd, 'package.json'))
        ? cwd
        : path.join(cwd, 'api');

    return path.join(apiRoot, 'storage', 'chat-attachments');
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
