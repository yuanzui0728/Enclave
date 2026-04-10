import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SystemConfigService } from '../config/config.service';
import { ConversationEntity } from './conversation.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import type { MessageAttachment } from './chat.types';
import { MessageEntity } from './message.entity';

export interface MessageReminderRecord {
  id: string;
  sourceId: string;
  messageId: string;
  threadId: string;
  threadType: 'direct' | 'group';
  threadTitle?: string;
  previewText: string;
  remindAt: string;
  notifiedAt?: string;
  createdAt: string;
}

export interface CreateMessageReminderInput {
  threadId: string;
  threadType: 'direct' | 'group';
  messageId: string;
  remindAt: string;
  notifiedAt?: string;
}

export interface MarkMessageReminderNotifiedInput {
  notifiedAt?: string;
}

type ReminderMessageSnapshot = {
  id: string;
  senderType: 'user' | 'character' | 'system';
  text: string;
  type:
    | 'text'
    | 'system'
    | 'proactive'
    | 'sticker'
    | 'image'
    | 'file'
    | 'voice'
    | 'contact_card'
    | 'location_card';
  attachment?: MessageAttachment;
};

const MESSAGE_REMINDERS_CONFIG_KEY = 'message_reminder_records';
const MAX_MESSAGE_REMINDERS = 500;
const chatReplyPrefixPattern = /^\[\[chat_reply:([^\]]+)\]\]\n?/;

@Injectable()
export class MessageRemindersService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly groupMemberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupMessageEntity)
    private readonly groupMessageRepo: Repository<GroupMessageEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async listMessageReminders(): Promise<MessageReminderRecord[]> {
    return this.readMessageReminders();
  }

  async createMessageReminder(
    input: CreateMessageReminderInput,
  ): Promise<MessageReminderRecord> {
    if (!input.threadId.trim() || !input.messageId.trim()) {
      throw new BadRequestException('提醒消息缺少必要参数。');
    }

    const remindAt = normalizeIsoTimestamp(input.remindAt);
    if (!remindAt) {
      throw new BadRequestException('提醒时间格式无效。');
    }

    const reminder =
      input.threadType === 'group'
        ? await this.buildGroupMessageReminder(input, remindAt)
        : await this.buildConversationMessageReminder(input, remindAt);
    const current = await this.readMessageReminders();
    const nextReminders = [
      reminder,
      ...current.filter((item) => item.sourceId !== reminder.sourceId),
    ].slice(0, MAX_MESSAGE_REMINDERS);

    await this.writeMessageReminders(nextReminders);
    return reminder;
  }

  async markMessageReminderNotified(
    sourceId: string,
    input?: MarkMessageReminderNotifiedInput,
  ): Promise<MessageReminderRecord> {
    const normalizedSourceId = decodeURIComponent(sourceId).trim();
    if (!normalizedSourceId) {
      throw new BadRequestException('提醒标识不能为空。');
    }

    const nextNotifiedAt =
      normalizeIsoTimestamp(input?.notifiedAt) ?? new Date().toISOString();
    const current = await this.readMessageReminders();
    let updatedReminder: MessageReminderRecord | null = null;
    const nextReminders = current.map((item) => {
      if (item.sourceId !== normalizedSourceId) {
        return item;
      }

      updatedReminder = {
        ...item,
        notifiedAt: nextNotifiedAt,
      };
      return updatedReminder;
    });

    if (!updatedReminder) {
      throw new NotFoundException(`Reminder ${normalizedSourceId} not found`);
    }

    await this.writeMessageReminders(nextReminders);
    return updatedReminder;
  }

  async removeMessageReminder(sourceId: string): Promise<{ success: true }> {
    const normalizedSourceId = decodeURIComponent(sourceId).trim();
    if (!normalizedSourceId) {
      throw new BadRequestException('提醒标识不能为空。');
    }

    const current = await this.readMessageReminders();
    const nextReminders = current.filter(
      (item) => item.sourceId !== normalizedSourceId,
    );

    if (nextReminders.length !== current.length) {
      await this.writeMessageReminders(nextReminders);
    }

    return { success: true as const };
  }

  private async buildConversationMessageReminder(
    input: CreateMessageReminderInput,
    remindAt: string,
  ): Promise<MessageReminderRecord> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const conversation = await this.conversationRepo.findOneBy({
      id: input.threadId,
      ownerId: owner.id,
    });

    if (!conversation || conversation.type !== 'direct') {
      throw new NotFoundException(`Conversation ${input.threadId} not found`);
    }

    const message = await this.messageRepo.findOneBy({
      id: input.messageId,
      conversationId: conversation.id,
    });

    if (!message) {
      throw new NotFoundException(`Message ${input.messageId} not found`);
    }

    return this.buildMessageReminderRecord({
      threadId: conversation.id,
      threadType: 'direct',
      threadTitle: conversation.title,
      remindAt,
      notifiedAt: normalizeIsoTimestamp(input.notifiedAt),
      snapshot: {
        id: message.id,
        senderType: message.senderType as 'user' | 'character' | 'system',
        text: message.text,
        type: message.type as ReminderMessageSnapshot['type'],
        attachment: this.parseAttachment(
          message.attachmentKind,
          message.attachmentPayload,
        ),
      },
    });
  }

  private async buildGroupMessageReminder(
    input: CreateMessageReminderInput,
    remindAt: string,
  ): Promise<MessageReminderRecord> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const membership = await this.groupMemberRepo.findOneBy({
      groupId: input.threadId,
      memberId: owner.id,
      memberType: 'user',
    });

    if (!membership) {
      throw new NotFoundException(`Group ${input.threadId} not found`);
    }

    const group = await this.groupRepo.findOneBy({ id: input.threadId });
    if (!group) {
      throw new NotFoundException(`Group ${input.threadId} not found`);
    }

    const message = await this.groupMessageRepo.findOneBy({
      id: input.messageId,
      groupId: group.id,
    });

    if (!message) {
      throw new NotFoundException(
        `Group message ${input.messageId} not found`,
      );
    }

    return this.buildMessageReminderRecord({
      threadId: group.id,
      threadType: 'group',
      threadTitle: group.name,
      remindAt,
      notifiedAt: normalizeIsoTimestamp(input.notifiedAt),
      snapshot: {
        id: message.id,
        senderType: message.senderType as 'user' | 'character' | 'system',
        text: message.text,
        type: message.type as ReminderMessageSnapshot['type'],
        attachment: this.parseAttachment(
          message.attachmentKind,
          message.attachmentPayload,
        ),
      },
    });
  }

  private buildMessageReminderRecord(input: {
    threadId: string;
    threadType: 'direct' | 'group';
    threadTitle?: string;
    remindAt: string;
    notifiedAt?: string;
    snapshot: ReminderMessageSnapshot;
  }): MessageReminderRecord {
    const sourceId = `message-reminder-${input.snapshot.id}`;

    return {
      id: sourceId,
      sourceId,
      messageId: input.snapshot.id,
      threadId: input.threadId,
      threadType: input.threadType,
      threadTitle: input.threadTitle?.trim() || undefined,
      previewText: this.buildReminderPreview(input.snapshot),
      remindAt: input.remindAt,
      notifiedAt: input.notifiedAt,
      createdAt: new Date().toISOString(),
    };
  }

  private buildReminderPreview(snapshot: ReminderMessageSnapshot) {
    const displayedText =
      snapshot.senderType === 'user'
        ? stripChatReplyPrefix(snapshot.text).trim()
        : sanitizeDisplayedAssistantText(snapshot.text).trim();

    if (displayedText) {
      return displayedText;
    }

    if (snapshot.type === 'image') {
      return snapshot.attachment?.kind === 'image' &&
        snapshot.attachment.fileName
        ? `[图片] ${snapshot.attachment.fileName}`
        : '[图片]';
    }

    if (snapshot.type === 'file') {
      return snapshot.attachment?.kind === 'file' &&
        snapshot.attachment.fileName
        ? `[文件] ${snapshot.attachment.fileName}`
        : '[文件]';
    }

    if (snapshot.type === 'voice') {
      return snapshot.attachment?.kind === 'voice'
        ? `[语音] ${formatVoiceDurationLabel(snapshot.attachment.durationMs)}`
        : '[语音]';
    }

    if (snapshot.type === 'contact_card') {
      return snapshot.attachment?.kind === 'contact_card'
        ? `[名片] ${snapshot.attachment.name}`
        : '[名片]';
    }

    if (snapshot.type === 'location_card') {
      return snapshot.attachment?.kind === 'location_card'
        ? `[位置] ${snapshot.attachment.title}`
        : '[位置]';
    }

    if (snapshot.type === 'sticker') {
      return snapshot.attachment?.kind === 'sticker' &&
        snapshot.attachment.label
        ? `[表情] ${snapshot.attachment.label}`
        : '[表情]';
    }

    return '聊天消息';
  }

  private parseAttachment(
    attachmentKind?: string | null,
    attachmentPayload?: string | null,
  ): MessageAttachment | undefined {
    if (!attachmentKind || !attachmentPayload) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(attachmentPayload) as MessageAttachment;
      if (parsed.kind !== attachmentKind) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  private async readMessageReminders(): Promise<MessageReminderRecord[]> {
    const raw = await this.systemConfigService.getConfig(
      MESSAGE_REMINDERS_CONFIG_KEY,
    );
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as MessageReminderRecord[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(isMessageReminderRecord)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, MAX_MESSAGE_REMINDERS);
    } catch {
      return [];
    }
  }

  private async writeMessageReminders(reminders: MessageReminderRecord[]) {
    await this.systemConfigService.setConfig(
      MESSAGE_REMINDERS_CONFIG_KEY,
      JSON.stringify(reminders),
    );
  }
}

function stripChatReplyPrefix(text: string) {
  return text.replace(chatReplyPrefixPattern, '');
}

function sanitizeDisplayedAssistantText(text: string) {
  return sanitizeAiText(stripChatReplyPrefix(text));
}

function formatVoiceDurationLabel(durationMs?: number) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return '1"';
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds}"`;
}

function normalizeIsoTimestamp(value?: string) {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function isMessageReminderRecord(value: unknown): value is MessageReminderRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<MessageReminderRecord>;
  return (
    typeof item.id === 'string' &&
    typeof item.sourceId === 'string' &&
    typeof item.messageId === 'string' &&
    typeof item.threadId === 'string' &&
    (item.threadType === 'direct' || item.threadType === 'group') &&
    typeof item.previewText === 'string' &&
    typeof item.remindAt === 'string' &&
    typeof item.createdAt === 'string'
  );
}
