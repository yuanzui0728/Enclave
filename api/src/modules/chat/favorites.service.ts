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

export interface FavoriteRecord {
  id: string;
  sourceId: string;
  category:
    | 'messages'
    | 'contacts'
    | 'officialAccounts'
    | 'moments'
    | 'feed'
    | 'channels';
  title: string;
  description: string;
  meta: string;
  to: string;
  badge: string;
  avatarName?: string;
  avatarSrc?: string;
  collectedAt: string;
}

export interface CreateMessageFavoriteInput {
  threadId: string;
  threadType: 'direct' | 'group';
  messageId: string;
}

type FavoriteMessageSnapshot = {
  id: string;
  senderType: 'user' | 'character' | 'system';
  senderName: string;
  senderAvatar?: string;
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
  createdAt: Date;
};

const FAVORITES_CONFIG_KEY = 'favorites_records';
const MAX_FAVORITES = 500;
const chatReplyPrefixPattern = /^\[\[chat_reply:([^\]]+)\]\]\n?/;

@Injectable()
export class FavoritesService {
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

  async listFavorites(): Promise<FavoriteRecord[]> {
    return this.readFavorites();
  }

  async createMessageFavorite(
    input: CreateMessageFavoriteInput,
  ): Promise<FavoriteRecord> {
    if (!input.threadId.trim() || !input.messageId.trim()) {
      throw new BadRequestException('收藏消息缺少必要参数。');
    }

    const favorite =
      input.threadType === 'group'
        ? await this.buildGroupMessageFavorite(input)
        : await this.buildConversationMessageFavorite(input);
    const current = await this.readFavorites();
    const nextFavorites = [
      favorite,
      ...current.filter((item) => item.sourceId !== favorite.sourceId),
    ].slice(0, MAX_FAVORITES);

    await this.writeFavorites(nextFavorites);
    return favorite;
  }

  async removeFavorite(sourceId: string): Promise<{ success: true }> {
    const normalizedSourceId = decodeURIComponent(sourceId).trim();
    if (!normalizedSourceId) {
      throw new BadRequestException('收藏标识不能为空。');
    }

    const current = await this.readFavorites();
    const nextFavorites = current.filter(
      (item) => item.sourceId !== normalizedSourceId,
    );

    if (nextFavorites.length !== current.length) {
      await this.writeFavorites(nextFavorites);
    }

    return { success: true as const };
  }

  private async buildConversationMessageFavorite(
    input: CreateMessageFavoriteInput,
  ): Promise<FavoriteRecord> {
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

    return this.buildFavoriteRecord({
      badge: '聊天消息',
      threadPath: `/chat/${conversation.id}#chat-message-${message.id}`,
      snapshot: {
        id: message.id,
        senderType: message.senderType as 'user' | 'character' | 'system',
        senderName: message.senderName,
        text: message.text,
        type: message.type as FavoriteMessageSnapshot['type'],
        attachment: this.parseAttachment(
          message.attachmentKind,
          message.attachmentPayload,
        ),
        createdAt: message.createdAt,
      },
      emptySenderLabel: '对方',
    });
  }

  private async buildGroupMessageFavorite(
    input: CreateMessageFavoriteInput,
  ): Promise<FavoriteRecord> {
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

    return this.buildFavoriteRecord({
      badge: '群聊消息',
      threadPath: `/group/${group.id}#chat-message-${message.id}`,
      snapshot: {
        id: message.id,
        senderType: message.senderType as 'user' | 'character' | 'system',
        senderName: message.senderName,
        senderAvatar: message.senderAvatar ?? undefined,
        text: message.text,
        type: message.type as FavoriteMessageSnapshot['type'],
        attachment: this.parseAttachment(
          message.attachmentKind,
          message.attachmentPayload,
        ),
        createdAt: message.createdAt,
      },
      emptySenderLabel: '群成员',
    });
  }

  private buildFavoriteRecord(input: {
    badge: string;
    threadPath: string;
    snapshot: FavoriteMessageSnapshot;
    emptySenderLabel: string;
  }): FavoriteRecord {
    const sourceId = `chat-message-${input.snapshot.id}`;
    const senderName =
      input.snapshot.senderType === 'user'
        ? '我'
        : input.snapshot.senderName?.trim() || input.emptySenderLabel;

    return {
      id: `favorite-${sourceId}`,
      sourceId,
      category: 'messages',
      title: senderName,
      description: this.buildFavoriteDescription(input.snapshot),
      meta: formatFavoriteTimestamp(input.snapshot.createdAt),
      to: input.threadPath,
      badge: input.badge,
      avatarName: senderName,
      avatarSrc: input.snapshot.senderAvatar,
      collectedAt: new Date().toISOString(),
    };
  }

  private buildFavoriteDescription(snapshot: FavoriteMessageSnapshot) {
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

    return '消息';
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

  private async readFavorites(): Promise<FavoriteRecord[]> {
    const raw = await this.systemConfigService.getConfig(FAVORITES_CONFIG_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as FavoriteRecord[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(isFavoriteRecord)
        .sort((left, right) => right.collectedAt.localeCompare(left.collectedAt))
        .slice(0, MAX_FAVORITES);
    } catch {
      return [];
    }
  }

  private async writeFavorites(favorites: FavoriteRecord[]) {
    await this.systemConfigService.setConfig(
      FAVORITES_CONFIG_KEY,
      JSON.stringify(favorites),
    );
  }
}

function stripChatReplyPrefix(text: string) {
  return text.replace(chatReplyPrefixPattern, '');
}

function sanitizeDisplayedAssistantText(text: string) {
  return sanitizeAiText(stripChatReplyPrefix(text));
}

function formatFavoriteTimestamp(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
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

function isFavoriteRecord(value: unknown): value is FavoriteRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<FavoriteRecord>;
  return (
    typeof item.id === 'string' &&
    typeof item.sourceId === 'string' &&
    typeof item.category === 'string' &&
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.meta === 'string' &&
    typeof item.to === 'string' &&
    typeof item.badge === 'string' &&
    typeof item.collectedAt === 'string'
  );
}
