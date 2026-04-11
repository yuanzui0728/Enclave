import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { ConversationEntity } from './conversation.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import { MessageEntity } from './message.entity';
import { AiMessagePart, ChatMessage } from '../ai/ai.types';
import {
  ContactCardAttachment,
  FileAttachment,
  Group,
  GroupMessage,
  ImageAttachment,
  LocationCardAttachment,
  MessageAttachment,
  StickerAttachment,
  VoiceAttachment,
} from './chat.types';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { CharactersService } from '../characters/characters.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { ChatGateway } from './chat.gateway';

export interface CreateGroupDto {
  name: string;
  memberIds: string[];
  sourceConversationId?: string;
  sharedMessageIds?: string[];
}

export interface AddMemberDto {
  memberId: string;
  memberType: 'user' | 'character';
  memberName?: string;
  memberAvatar?: string;
}

export interface UpdateGroupDto {
  name?: string;
  announcement?: string | null;
}

export interface UpdateGroupPreferencesDto {
  isMuted?: boolean;
  savedToContacts?: boolean;
  showMemberNicknames?: boolean;
  notifyOnAtMe?: boolean;
  notifyOnAtAll?: boolean;
  notifyOnAnnouncement?: boolean;
}

type SendGroupMessageInput =
  | {
      type?: 'text';
      text: string;
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
      type: 'sticker';
      text?: string;
      attachment: StickerAttachment;
    };

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private conversationMessageRepo: Repository<MessageEntity>,
    @InjectRepository(GroupEntity)
    private groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private memberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupMessageEntity)
    private messageRepo: Repository<GroupMessageEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async createGroup(dto: CreateGroupDto): Promise<Group> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const group = this.groupRepo.create({
      name: dto.name,
      creatorId: owner.id,
      creatorType: 'user',
      isHidden: false,
      lastReadAt: new Date(),
      lastActivityAt: new Date(),
    });
    await this.groupRepo.save(group);

    const ownerMember = this.memberRepo.create({
      groupId: group.id,
      memberId: owner.id,
      memberType: 'user',
      memberName: owner.username?.trim() || 'You',
      memberAvatar: owner.avatar ?? undefined,
      role: 'owner',
    });
    await this.memberRepo.save(ownerMember);

    for (const memberId of dto.memberIds) {
      const member = this.memberRepo.create({
        groupId: group.id,
        memberId,
        memberType: 'character',
        role: 'member',
      });
      await this.memberRepo.save(member);
    }

    const sharedMessageCount = await this.copySharedConversationMessages(
      group,
      owner,
      dto,
    );

    this.logger.log(
      `Created group ${group.id} with ${dto.memberIds.length + 1} members and ${sharedMessageCount} shared messages`,
    );
    return this.toGroup(group);
  }

  async addMember(
    groupId: string,
    dto: AddMemberDto,
  ): Promise<GroupMemberEntity> {
    await this.requireOwnedGroup(groupId);
    const existing = await this.memberRepo.findOne({
      where: { groupId, memberId: dto.memberId },
    });

    if (existing) {
      this.logger.warn(`Member ${dto.memberId} already in group ${groupId}`);
      return existing;
    }

    const resolvedMember = await this.resolveMemberProfile(dto);
    const member = this.memberRepo.create({
      groupId,
      memberId: dto.memberId,
      memberType: dto.memberType,
      memberName: resolvedMember.memberName,
      memberAvatar: resolvedMember.memberAvatar,
      role: 'member',
    });

    await this.memberRepo.save(member);
    this.logger.log(`Added member ${dto.memberId} to group ${groupId}`);
    await this.emitGroupConversationUpdated(groupId);
    return member;
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const group = await this.findAccessibleGroup(groupId);
    return group ? this.toGroup(group) : null;
  }

  async listSavedGroups(): Promise<Group[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const groups = await this.groupRepo.find({
      where: {
        creatorId: owner.id,
        creatorType: 'user',
        savedToContacts: true,
      },
      order: {
        savedToContactsAt: 'DESC',
        lastActivityAt: 'DESC',
        updatedAt: 'DESC',
      },
    });

    return groups.map((group) => this.toGroup(group));
  }

  async getMembers(groupId: string): Promise<GroupMemberEntity[]> {
    await this.requireAccessibleGroup(groupId);
    const members = await this.memberRepo.find({
      where: { groupId },
      order: { joinedAt: 'ASC' },
    });

    return Promise.all(
      members.map(async (member) => {
        if (member.memberType !== 'character') {
          return member;
        }

        const character = await this.characters.findById(member.memberId);
        if (!character) {
          return member;
        }

        return {
          ...member,
          memberName: member.memberName ?? character.name,
          memberAvatar: member.memberAvatar ?? character.avatar ?? undefined,
        };
      }),
    );
  }

  async getMessages(groupId: string, limit = 100): Promise<GroupMessage[]> {
    const group = await this.requireAccessibleGroup(groupId);
    const messages = await this.messageRepo.find({
      where: group.lastClearedAt
        ? {
            groupId,
            createdAt: MoreThan(group.lastClearedAt),
          }
        : { groupId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return messages.reverse().map((item) => this.toGroupMessage(item));
  }

  async updateGroup(groupId: string, dto: UpdateGroupDto): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const nextName = dto.name?.trim();
    const nextAnnouncement =
      dto.announcement === undefined
        ? undefined
        : dto.announcement?.trim() || null;
    const updated = await this.groupRepo.save({
      ...group,
      name: nextName || group.name,
      announcement:
        nextAnnouncement === undefined
          ? (group.announcement ?? null)
          : nextAnnouncement,
    });

    await this.emitGroupConversationUpdated(groupId);
    return this.toGroup(updated);
  }

  async updatePreferences(
    groupId: string,
    dto: UpdateGroupPreferencesDto,
  ): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const isMuted =
      dto.isMuted === undefined ? (group.isMuted ?? false) : dto.isMuted;
    const savedToContacts =
      dto.savedToContacts === undefined
        ? (group.savedToContacts ?? false)
        : dto.savedToContacts;
    const updated = await this.groupRepo.save({
      ...group,
      isMuted,
      mutedAt: isMuted ? (group.mutedAt ?? new Date()) : null,
      savedToContacts,
      savedToContactsAt: savedToContacts
        ? (group.savedToContactsAt ?? new Date())
        : null,
      showMemberNicknames:
        dto.showMemberNicknames ?? group.showMemberNicknames ?? true,
      notifyOnAtMe: dto.notifyOnAtMe ?? group.notifyOnAtMe ?? true,
      notifyOnAtAll: dto.notifyOnAtAll ?? group.notifyOnAtAll ?? true,
      notifyOnAnnouncement:
        dto.notifyOnAnnouncement ?? group.notifyOnAnnouncement ?? true,
    });

    await this.emitGroupConversationUpdated(groupId);
    return this.toGroup(updated);
  }

  async setGroupPinned(groupId: string, pinned: boolean): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const updated = await this.groupRepo.save({
      ...group,
      isPinned: pinned,
      pinnedAt: pinned ? new Date() : null,
    });

    return this.toGroup(updated);
  }

  async clearGroupMessages(groupId: string): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const now = new Date();
    const updated = await this.groupRepo.save({
      ...group,
      lastClearedAt: now,
      lastReadAt: now,
    });

    await this.emitGroupConversationUpdated(groupId);
    return this.toGroup(updated);
  }

  async markGroupRead(groupId: string): Promise<Group> {
    const group = await this.requireAccessibleGroup(groupId);
    const updated = await this.groupRepo.save({
      ...group,
      lastReadAt: new Date(),
    });

    return this.toGroup(updated);
  }

  async markGroupUnread(groupId: string): Promise<Group> {
    const group = await this.requireAccessibleGroup(groupId);
    const lastCharacterMessage = await this.messageRepo.findOne({
      where: group.lastClearedAt
        ? {
            groupId,
            senderType: 'character',
            createdAt: MoreThan(group.lastClearedAt),
          }
        : {
            groupId,
            senderType: 'character',
          },
      order: { createdAt: 'DESC' },
    });

    if (!lastCharacterMessage) {
      return this.toGroup(group);
    }

    const previousReadAt = new Date(
      lastCharacterMessage.createdAt.getTime() - 1,
    );
    const lastClearedAt = group.lastClearedAt
      ? new Date(group.lastClearedAt)
      : null;
    const nextReadAt =
      lastClearedAt && previousReadAt.getTime() < lastClearedAt.getTime()
        ? lastClearedAt
        : previousReadAt;
    const updated = await this.groupRepo.save({
      ...group,
      lastReadAt: nextReadAt,
    });

    return this.toGroup(updated);
  }

  async recallOwnerMessage(
    groupId: string,
    messageId: string,
  ): Promise<GroupMessage> {
    await this.requireAccessibleGroup(groupId);
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const message = await this.messageRepo.findOneBy({
      id: messageId,
      groupId,
    });

    if (!message) {
      throw new NotFoundException(`Group message ${messageId} not found`);
    }

    if (message.senderType !== 'user' || message.senderId !== owner.id) {
      throw new BadRequestException('只能撤回自己发送的消息。');
    }

    const recalled = await this.messageRepo.save({
      ...message,
      senderId: 'system',
      senderType: 'system',
      senderName: 'system',
      senderAvatar: undefined,
      text: '你撤回了一条消息',
      type: 'system',
      attachmentKind: null,
      attachmentPayload: null,
    });

    const recalledMessage = this.toGroupMessage(recalled);
    this.chatGateway.emitThreadMessage(groupId, recalledMessage);
    return recalledMessage;
  }

  async deleteMessage(
    groupId: string,
    messageId: string,
  ): Promise<{ success: true }> {
    const group = await this.requireAccessibleGroup(groupId);
    const message = await this.messageRepo.findOneBy({
      id: messageId,
      groupId,
    });

    if (!message) {
      throw new NotFoundException(`Group message ${messageId} not found`);
    }

    await this.messageRepo.delete({ id: message.id });
    await this.syncGroupLastActivity(group);
    await this.emitGroupConversationUpdated(groupId);

    return { success: true };
  }

  async hideGroup(groupId: string): Promise<Group> {
    const group = await this.requireOwnedGroup(groupId);
    const updated = await this.groupRepo.save({
      ...group,
      isHidden: true,
      hiddenAt: new Date(),
    });

    return this.toGroup(updated);
  }

  async updateOwnerNickname(
    groupId: string,
    nickname: string,
  ): Promise<GroupMemberEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.requireOwnedGroup(groupId);
    const member = await this.memberRepo.findOne({
      where: {
        groupId,
        memberId: owner.id,
        memberType: 'user',
      },
    });

    if (!member) {
      throw new NotFoundException(
        `Owner member for group ${groupId} not found`,
      );
    }

    return this.memberRepo.save({
      ...member,
      memberName: nickname.trim() || member.memberName,
    });
  }

  async leaveGroup(groupId: string): Promise<{ success: true }> {
    const group = await this.requireOwnedGroup(groupId);

    await this.memberRepo.delete({ groupId: group.id });
    await this.messageRepo.delete({ groupId: group.id });
    await this.groupRepo.delete({ id: group.id });

    return { success: true };
  }

  async removeMember(groupId: string, memberId: string) {
    await this.requireOwnedGroup(groupId);
    const member = await this.memberRepo.findOne({
      where: {
        groupId,
        memberId,
        memberType: 'character',
      },
    });

    if (!member) {
      throw new NotFoundException(`Member ${memberId} not found in group`);
    }

    await this.memberRepo.delete({ id: member.id });
    await this.emitGroupConversationUpdated(groupId);
    return { success: true as const };
  }

  async sendMessage(
    groupId: string,
    senderId: string,
    senderType: 'user' | 'character',
    senderName: string,
    input: SendGroupMessageInput,
    senderAvatar?: string,
  ): Promise<GroupMessage> {
    const group = await this.requireAccessibleGroup(groupId);
    const normalizedInput = this.normalizeOutgoingMessageInput(input);
    const message = this.messageRepo.create({
      groupId,
      senderId,
      senderType,
      senderName,
      senderAvatar,
      text: normalizedInput.text,
      type: normalizedInput.type,
      attachmentKind: normalizedInput.attachment?.kind ?? null,
      attachmentPayload: normalizedInput.attachment
        ? JSON.stringify(normalizedInput.attachment)
        : null,
    });

    await this.messageRepo.save(message);
    await this.touchGroupActivity(
      group,
      message.createdAt ?? new Date(),
      senderType === 'user',
    );
    const nextMessage = this.toGroupMessage(message);
    this.chatGateway.emitThreadMessage(groupId, nextMessage);
    return nextMessage;
  }

  async sendOwnerMessage(groupId: string, input: SendGroupMessageInput) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.sendMessage(
      groupId,
      owner.id,
      'user',
      owner.username?.trim() || 'You',
      input,
      owner.avatar ?? undefined,
    );
  }

  async sendSystemMessage(
    groupId: string,
    text: string,
  ): Promise<GroupMessage> {
    const group = await this.requireAccessibleGroup(groupId);
    const message = this.messageRepo.create({
      groupId,
      senderId: 'system',
      senderType: 'character',
      senderName: 'system',
      text,
      type: 'system',
    });

    await this.messageRepo.save(message);
    await this.touchGroupActivity(group, message.createdAt ?? new Date());
    return this.toGroupMessage(message);
  }

  async triggerAiReplies(
    groupId: string,
    userMessage: GroupMessage,
  ): Promise<void> {
    await this.requireAccessibleGroup(groupId);
    const members = await this.memberRepo.find({
      where: { groupId, memberType: 'character' },
    });
    const recentMessages = await this.messageRepo.find({
      where: { groupId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    const history = recentMessages
      .filter((message) => message.id !== userMessage.id)
      .reverse()
      .map((message) => this.buildAiHistoryMessage(message));
    const currentUserMessage = this.buildCurrentUserAiMessage(userMessage);
    const runtimeRules = await this.replyLogicRules.getRules();

    for (const member of members) {
      const char = await this.characters.findById(member.memberId);
      if (!char) continue;

      const replyChance =
        runtimeRules.groupReplyChance[
          (char.activityFrequency as 'high' | 'normal' | 'low') ?? 'normal'
        ] ?? runtimeRules.groupReplyChance.normal;
      if (Math.random() > replyChance) continue;

      const profile = await this.characters.getProfile(member.memberId);
      if (!profile) continue;

      const delay =
        runtimeRules.groupReplyDelayMs.min +
        Math.random() *
          (runtimeRules.groupReplyDelayMs.max -
            runtimeRules.groupReplyDelayMs.min);
      setTimeout(() => {
        void (async () => {
          try {
            const reply = await this.ai.generateReply({
              profile,
              conversationHistory: history,
              userMessage: currentUserMessage.content,
              userMessageParts: currentUserMessage.parts,
              isGroupChat: true,
            });
            await this.sendMessage(
              groupId,
              char.id,
              'character',
              char.name,
              {
                text: reply.text,
              },
              char.avatar,
            );
          } catch (err) {
            this.logger.error(
              `AI reply failed for ${char.name} in group ${groupId}`,
              err,
            );
          }
        })();
      }, delay);
    }
  }

  private normalizeOutgoingMessageInput(input: SendGroupMessageInput): {
    type:
      | 'text'
      | 'image'
      | 'file'
      | 'voice'
      | 'contact_card'
      | 'location_card'
      | 'sticker';
    text: string;
    promptText: string;
    aiParts: AiMessagePart[];
    attachment?: MessageAttachment;
  } {
    if (
      input.type === 'image' ||
      input.type === 'file' ||
      input.type === 'voice' ||
      input.type === 'contact_card' ||
      input.type === 'location_card' ||
      input.type === 'sticker'
    ) {
      if (!input.attachment || input.attachment.kind !== input.type) {
        throw new Error('Attachment payload is invalid');
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
      throw new Error('Message text is required');
    }

    return {
      type: 'text',
      text,
      promptText: text,
      aiParts: this.buildTextAiParts(text),
    };
  }

  private buildAiHistoryMessage(message: GroupMessageEntity): ChatMessage {
    const attachment = this.parseAttachment(message);
    const baseText =
      message.senderType === 'user'
        ? message.text
        : sanitizeAiText(message.text);
    const promptText = this.buildMessagePromptText(baseText, attachment);

    return {
      role: 'user',
      content: `[${message.senderName}]: ${promptText}`,
      parts: this.buildAiParts(baseText, attachment),
    };
  }

  private buildCurrentUserAiMessage(message: GroupMessage): ChatMessage {
    const promptText = this.buildMessagePromptText(
      message.text,
      message.attachment,
    );

    return {
      role: 'user',
      content: `[${message.senderName}]: ${promptText}`,
      parts: this.buildAiParts(message.text, message.attachment),
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

    return [
      {
        type: 'text',
        text: promptText,
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
      const sizeText = formatGroupAttachmentSize(attachment.size);
      const captionText = caption ? `，补充说明：${caption}` : '';
      return `发来一个文件《${attachment.fileName}》${attachment.mimeType ? `，类型：${attachment.mimeType}` : ''}${sizeText ? `，大小：${sizeText}` : ''}${captionText}`.trim();
    }

    if (attachment.kind === 'voice') {
      const durationText =
        attachment.durationMs && attachment.durationMs > 0
          ? `，时长：${formatGroupAttachmentDuration(attachment.durationMs)}`
          : '';
      const captionText = caption ? `，补充说明：${caption}` : '';
      return `发来一条语音消息${durationText}${captionText}`.trim();
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

  private getAttachmentFallbackText(attachment: MessageAttachment) {
    if (attachment.kind === 'image') {
      return `[图片] ${attachment.fileName}`.trim();
    }

    if (attachment.kind === 'file') {
      return `[文件] ${attachment.fileName}`.trim();
    }

    if (attachment.kind === 'voice') {
      const durationText =
        attachment.durationMs && attachment.durationMs > 0
          ? ` ${formatGroupAttachmentDuration(attachment.durationMs)}`
          : '';
      return `[语音]${durationText}`.trim();
    }

    if (attachment.kind === 'contact_card') {
      return `[名片] ${attachment.name}`.trim();
    }

    if (attachment.kind === 'location_card') {
      return `[位置] ${attachment.title}`.trim();
    }

    return `[表情] ${attachment.label ?? attachment.stickerId}`.trim();
  }

  private toGroupMessage(entity: GroupMessageEntity): GroupMessage {
    return {
      id: entity.id,
      groupId: entity.groupId,
      senderId: entity.senderId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderName: entity.senderName,
      senderAvatar: entity.senderAvatar ?? undefined,
      type: entity.type as
        | 'text'
        | 'system'
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
      attachment: this.parseAttachment(entity),
      createdAt: entity.createdAt,
    };
  }

  private parseAttachment(
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

  private async findAccessibleGroup(
    groupId: string,
  ): Promise<GroupEntity | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const membership = await this.memberRepo.findOne({
      where: {
        groupId,
        memberId: owner.id,
        memberType: 'user',
      },
    });

    if (!membership) {
      return null;
    }

    return this.groupRepo.findOne({ where: { id: groupId } });
  }

  private async requireAccessibleGroup(groupId: string): Promise<GroupEntity> {
    const group = await this.findAccessibleGroup(groupId);
    if (!group) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }

    return group;
  }

  private async requireOwnedGroup(groupId: string): Promise<GroupEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const group = await this.groupRepo.findOne({
      where: {
        id: groupId,
        creatorId: owner.id,
        creatorType: 'user',
      },
    });

    if (!group) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }

    return group;
  }

  private async resolveMemberProfile(dto: AddMemberDto) {
    if (dto.memberType === 'character') {
      const character = await this.characters.findById(dto.memberId);
      if (!character) {
        throw new NotFoundException(`Character ${dto.memberId} not found`);
      }

      return {
        memberName: dto.memberName?.trim() || character.name,
        memberAvatar: dto.memberAvatar ?? character.avatar ?? undefined,
      };
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    if (dto.memberId !== owner.id) {
      throw new BadRequestException(
        'Only the world owner can be added as user',
      );
    }

    return {
      memberName: dto.memberName?.trim() || owner.username?.trim() || 'You',
      memberAvatar: dto.memberAvatar ?? owner.avatar ?? undefined,
    };
  }

  private async copySharedConversationMessages(
    group: GroupEntity,
    owner: {
      id: string;
      username?: string | null;
      avatar?: string | null;
    },
    dto: CreateGroupDto,
  ) {
    const sourceConversationId = dto.sourceConversationId?.trim();
    const sharedMessageIds = dedupeIds(dto.sharedMessageIds ?? []);
    if (!sourceConversationId || !sharedMessageIds.length) {
      return 0;
    }

    const conversation = await this.conversationRepo.findOne({
      where: {
        id: sourceConversationId,
        ownerId: owner.id,
        type: 'direct',
      },
    });
    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${sourceConversationId} not found`,
      );
    }

    const sourceMessages = await this.conversationMessageRepo.find({
      where: {
        conversationId: sourceConversationId,
        id: In(sharedMessageIds),
      },
      order: { createdAt: 'ASC' },
    });
    if (!sourceMessages.length) {
      return 0;
    }

    const selectedIdSet = new Set(sharedMessageIds);
    const selectedMessages = sourceMessages.filter((message) =>
      selectedIdSet.has(message.id),
    );
    if (!selectedMessages.length) {
      return 0;
    }

    const sourceParticipantName =
      (await this.characters.findById(conversation.participants[0] ?? ''))?.name ??
      conversation.title;

    await this.messageRepo.save(
      this.messageRepo.create({
        groupId: group.id,
        senderId: 'system',
        senderType: 'system',
        senderName: 'system',
        type: 'system',
        text: `已分享你和 ${sourceParticipantName} 的 ${selectedMessages.length} 条聊天记录`,
      }),
    );

    for (const sourceMessage of selectedMessages) {
      await this.messageRepo.save(
        this.messageRepo.create({
          groupId: group.id,
          senderId: sourceMessage.senderId,
          senderType: sourceMessage.senderType,
          senderName: sourceMessage.senderName,
          type: sourceMessage.type,
          text: sourceMessage.text,
          attachmentKind: sourceMessage.attachmentKind ?? null,
          attachmentPayload: sourceMessage.attachmentPayload ?? null,
        }),
      );
    }

    group.lastActivityAt = new Date();
    await this.groupRepo.save(group);
    await this.emitGroupConversationUpdated(group.id);
    return selectedMessages.length;
  }

  private toGroup(entity: GroupEntity): Group {
    return {
      id: entity.id,
      name: entity.name,
      avatar: entity.avatar ?? undefined,
      creatorId: entity.creatorId,
      creatorType: entity.creatorType as 'user' | 'character',
      announcement: entity.announcement ?? undefined,
      isMuted: entity.isMuted ?? false,
      mutedAt: entity.mutedAt ?? undefined,
      isPinned: entity.isPinned ?? false,
      pinnedAt: entity.pinnedAt ?? undefined,
      savedToContacts: entity.savedToContacts ?? false,
      savedToContactsAt: entity.savedToContactsAt ?? undefined,
      showMemberNicknames: entity.showMemberNicknames ?? true,
      notifyOnAtMe: entity.notifyOnAtMe ?? true,
      notifyOnAtAll: entity.notifyOnAtAll ?? true,
      notifyOnAnnouncement: entity.notifyOnAnnouncement ?? true,
      lastClearedAt: entity.lastClearedAt ?? undefined,
      lastReadAt: entity.lastReadAt ?? undefined,
      isHidden: entity.isHidden ?? false,
      hiddenAt: entity.hiddenAt ?? undefined,
      lastActivityAt:
        entity.lastActivityAt ?? entity.updatedAt ?? entity.createdAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private async emitGroupConversationUpdated(groupId: string) {
    const group = await this.groupRepo.findOneBy({ id: groupId });
    if (!group) {
      return;
    }

    const members = await this.memberRepo.find({
      where: { groupId },
      order: { joinedAt: 'ASC' },
    });

    this.chatGateway.emitConversationUpdated({
      id: groupId,
      type: 'group',
      title: group.name,
      participants: members.map((member) => member.memberId),
    });
  }

  private async touchGroupActivity(
    group: GroupEntity,
    at: Date,
    markRead = false,
  ) {
    group.lastActivityAt = at;
    if (group.isHidden) {
      group.isHidden = false;
      group.hiddenAt = null;
    }
    if (markRead) {
      group.lastReadAt = at;
    }
    await this.groupRepo.save(group);
  }

  private async syncGroupLastActivity(group: GroupEntity): Promise<void> {
    const lastMessage = await this.messageRepo.findOne({
      where: group.lastClearedAt
        ? {
            groupId: group.id,
            createdAt: MoreThan(group.lastClearedAt),
          }
        : { groupId: group.id },
      order: { createdAt: 'DESC' },
    });
    const timestamps = [
      lastMessage?.createdAt,
      group.lastClearedAt ?? undefined,
      group.createdAt,
    ]
      .filter((value): value is Date => Boolean(value))
      .map((value) => new Date(value).getTime());

    if (!timestamps.length) {
      return;
    }

    const nextLastActivityAt = new Date(Math.max(...timestamps));
    if (
      group.lastActivityAt &&
      group.lastActivityAt.getTime() === nextLastActivityAt.getTime()
    ) {
      return;
    }

    group.lastActivityAt = nextLastActivityAt;
    await this.groupRepo.save(group);
  }
}

function dedupeIds(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function formatGroupAttachmentSize(size: number) {
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

function formatGroupAttachmentDuration(durationMs: number) {
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
