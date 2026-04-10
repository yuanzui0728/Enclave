import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import {
  ContactCardAttachment,
  FileAttachment,
  Group,
  GroupMessage,
  ImageAttachment,
  LocationCardAttachment,
  MessageAttachment,
} from './chat.types';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { CharactersService } from '../characters/characters.service';
import { WorldOwnerService } from '../auth/world-owner.service';

export interface CreateGroupDto {
  name: string;
  memberIds: string[];
}

export interface AddMemberDto {
  memberId: string;
  memberType: 'user' | 'character';
  memberName: string;
  memberAvatar?: string;
}

export interface UpdateGroupDto {
  name?: string;
  announcement?: string | null;
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
      type: 'contact_card';
      text?: string;
      attachment: ContactCardAttachment;
    }
  | {
      type: 'location_card';
      text?: string;
      attachment: LocationCardAttachment;
    };

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    @InjectRepository(GroupEntity)
    private groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private memberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupMessageEntity)
    private messageRepo: Repository<GroupMessageEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly worldOwnerService: WorldOwnerService,
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

    this.logger.log(
      `Created group ${group.id} with ${dto.memberIds.length + 1} members`,
    );
    return this.toGroup(group);
  }

  async addMember(
    groupId: string,
    dto: AddMemberDto,
  ): Promise<GroupMemberEntity> {
    const existing = await this.memberRepo.findOne({
      where: { groupId, memberId: dto.memberId },
    });

    if (existing) {
      this.logger.warn(`Member ${dto.memberId} already in group ${groupId}`);
      return existing;
    }

    const member = this.memberRepo.create({
      groupId,
      memberId: dto.memberId,
      memberType: dto.memberType,
      memberName: dto.memberName,
      memberAvatar: dto.memberAvatar,
      role: 'member',
    });

    await this.memberRepo.save(member);
    this.logger.log(`Added member ${dto.memberId} to group ${groupId}`);
    return member;
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const group = await this.findAccessibleGroup(groupId);
    return group ? this.toGroup(group) : null;
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
    return this.toGroupMessage(message);
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
    userMessage: string,
    senderName: string,
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
    const history = recentMessages.reverse().map((message) => ({
      role: 'user' as const,
      content: `[${message.senderName}]: ${
        message.senderType === 'user'
          ? message.text
          : sanitizeAiText(message.text)
      }`,
    }));

    for (const member of members) {
      const char = await this.characters.findById(member.memberId);
      if (!char) continue;

      const replyChance =
        char.activityFrequency === 'high'
          ? 0.7
          : char.activityFrequency === 'low'
            ? 0.2
            : 0.4;
      if (Math.random() > replyChance) continue;

      const profile = await this.characters.getProfile(member.memberId);
      if (!profile) continue;

      const delay = 5000 + Math.random() * 25000;
      setTimeout(async () => {
        try {
          const reply = await this.ai.generateReply({
            profile,
            conversationHistory: history,
            userMessage: `${senderName} said: ${userMessage}`,
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
      }, delay);
    }
  }

  private normalizeOutgoingMessageInput(input: SendGroupMessageInput): {
    type: 'text' | 'image' | 'file' | 'contact_card' | 'location_card';
    text: string;
    attachment?: MessageAttachment;
  } {
    if (
      input.type === 'image' ||
      input.type === 'file' ||
      input.type === 'contact_card' ||
      input.type === 'location_card'
    ) {
      if (!input.attachment || input.attachment.kind !== input.type) {
        throw new Error('Attachment payload is invalid');
      }

      return {
        type: input.type,
        text:
          input.text?.trim() ||
          this.getAttachmentFallbackText(input.attachment),
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
    };
  }

  private getAttachmentFallbackText(attachment: MessageAttachment) {
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

    return '[附件]';
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

  private toGroup(entity: GroupEntity): Group {
    return {
      id: entity.id,
      name: entity.name,
      avatar: entity.avatar ?? undefined,
      creatorId: entity.creatorId,
      creatorType: entity.creatorType as 'user' | 'character',
      announcement: entity.announcement ?? undefined,
      isPinned: entity.isPinned ?? false,
      pinnedAt: entity.pinnedAt ?? undefined,
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
}
