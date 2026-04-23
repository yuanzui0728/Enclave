import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SystemConfigService } from '../config/config.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
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
    | 'notes'
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

export type FavoriteNoteAsset = {
  id: string;
  kind: 'image' | 'file';
  fileName: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
};

export interface FavoriteNoteSummary {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteNoteDocument extends FavoriteNoteSummary {
  contentHtml: string;
  contentText: string;
}

export interface UpsertFavoriteNoteInput {
  contentHtml: string;
  contentText?: string;
  tags?: string[];
  assets?: FavoriteNoteAsset[];
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
    | 'location_card'
    | 'note_card';
  attachment?: MessageAttachment;
  createdAt: Date;
};

const FAVORITES_CONFIG_KEY = 'favorites_records';
const FAVORITE_NOTE_DOCUMENTS_CONFIG_KEY = 'favorite_note_documents';
const FAVORITE_NOTE_SOURCE_ID_PREFIX = 'favorite-note-';
const MAX_FAVORITES = 500;
const MAX_FAVORITE_NOTES = 200;
const MAX_FAVORITE_NOTE_TAGS = 8;
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
    private readonly cyberAvatar: CyberAvatarService,
  ) {}

  async listFavorites(): Promise<FavoriteRecord[]> {
    const [favorites, notes] = await Promise.all([
      this.readFavorites(),
      this.readFavoriteNoteDocuments(),
    ]);

    return [
      ...favorites,
      ...notes.map((note) => this.buildFavoriteNoteRecord(note)),
    ]
      .sort((left, right) => right.collectedAt.localeCompare(left.collectedAt))
      .slice(0, MAX_FAVORITES + MAX_FAVORITE_NOTES);
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
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.captureFavoriteAction(owner.id, {
      sourceEntityType: 'favorite_message',
      sourceEntityId: favorite.sourceId,
      summaryText: `收藏了一条${favorite.badge}：${favorite.description}`,
      payload: {
        category: favorite.category,
        title: favorite.title,
        description: favorite.description,
        to: favorite.to,
        badge: favorite.badge,
      },
      occurredAt: favorite.collectedAt,
    });
    return favorite;
  }

  async removeFavorite(sourceId: string): Promise<{ success: true }> {
    const normalizedSourceId = decodeURIComponent(sourceId).trim();
    if (!normalizedSourceId) {
      throw new BadRequestException('收藏标识不能为空。');
    }

    const noteId = parseFavoriteNoteId(normalizedSourceId);
    if (noteId) {
      return this.removeFavoriteNote(noteId);
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

  async listFavoriteNotes(): Promise<FavoriteNoteSummary[]> {
    return (await this.readFavoriteNoteDocuments()).map((note) =>
      this.buildFavoriteNoteSummary(note),
    );
  }

  async getFavoriteNote(id: string): Promise<FavoriteNoteDocument> {
    return this.getFavoriteNoteOrThrow(id);
  }

  async createFavoriteNote(
    input: UpsertFavoriteNoteInput,
  ): Promise<FavoriteNoteDocument> {
    const timestamp = new Date().toISOString();
    const note = buildFavoriteNoteDocument({
      id: randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      input,
    });
    const nextNotes = [note, ...(await this.readFavoriteNoteDocuments())].slice(
      0,
      MAX_FAVORITE_NOTES,
    );

    await this.writeFavoriteNoteDocuments(nextNotes);
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.captureFavoriteAction(owner.id, {
      sourceEntityType: 'favorite_note',
      sourceEntityId: note.id,
      summaryText: `新建收藏笔记《${note.title}》：${note.excerpt}`,
      payload: {
        action: 'created',
        title: note.title,
        excerpt: note.excerpt,
        tags: note.tags,
      },
      occurredAt: note.updatedAt,
      dedupeKey: `favorite-note:${note.id}:${note.updatedAt}`,
    });
    return note;
  }

  async updateFavoriteNote(
    id: string,
    input: UpsertFavoriteNoteInput,
  ): Promise<FavoriteNoteDocument> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new BadRequestException('笔记标识不能为空。');
    }

    const existing = await this.getFavoriteNoteOrThrow(normalizedId);
    const nextNote = buildFavoriteNoteDocument({
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      input,
    });
    const nextNotes = (await this.readFavoriteNoteDocuments())
      .map((note) => (note.id === normalizedId ? nextNote : note))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_FAVORITE_NOTES);

    await this.writeFavoriteNoteDocuments(nextNotes);
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.captureFavoriteAction(owner.id, {
      sourceEntityType: 'favorite_note',
      sourceEntityId: nextNote.id,
      summaryText: `更新收藏笔记《${nextNote.title}》：${nextNote.excerpt}`,
      payload: {
        action: 'updated',
        title: nextNote.title,
        excerpt: nextNote.excerpt,
        tags: nextNote.tags,
      },
      occurredAt: nextNote.updatedAt,
      dedupeKey: `favorite-note:${nextNote.id}:${nextNote.updatedAt}`,
    });
    return nextNote;
  }

  async removeFavoriteNote(id: string): Promise<{ success: true }> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new BadRequestException('笔记标识不能为空。');
    }

    const current = await this.readFavoriteNoteDocuments();
    const removedNote =
      current.find((note) => note.id === normalizedId) ?? null;
    const nextNotes = current.filter((note) => note.id !== normalizedId);

    if (nextNotes.length !== current.length) {
      await this.writeFavoriteNoteDocuments(nextNotes);
    }

    if (removedNote) {
      const owner = await this.worldOwnerService.getOwnerOrThrow();
      await this.captureFavoriteAction(owner.id, {
        sourceEntityType: 'favorite_note',
        sourceEntityId: removedNote.id,
        summaryText: `删除收藏笔记《${removedNote.title}》`,
        payload: {
          action: 'removed',
          title: removedNote.title,
          excerpt: removedNote.excerpt,
          tags: removedNote.tags,
        },
      });
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
      throw new NotFoundException(`Group message ${input.messageId} not found`);
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

    if (snapshot.type === 'note_card') {
      return snapshot.attachment?.kind === 'note_card'
        ? `[笔记] ${snapshot.attachment.title}`
        : '[笔记]';
    }

    if (snapshot.type === 'sticker') {
      return snapshot.attachment?.kind === 'sticker' &&
        snapshot.attachment.label
        ? `[表情] ${snapshot.attachment.label}`
        : '[表情]';
    }

    return '消息';
  }

  private buildFavoriteNoteRecord(note: FavoriteNoteDocument): FavoriteRecord {
    return {
      id: `favorite-${note.id}`,
      sourceId: buildFavoriteNoteSourceId(note.id),
      category: 'notes',
      title: note.title,
      description: note.excerpt,
      meta: formatFavoriteTimestamp(new Date(note.updatedAt)),
      to: `/tabs/favorites#draftId=${encodeURIComponent(note.id)}&noteId=${encodeURIComponent(note.id)}`,
      badge: '笔记',
      avatarName: note.title,
      collectedAt: note.updatedAt,
    };
  }

  private buildFavoriteNoteSummary(
    note: FavoriteNoteDocument,
  ): FavoriteNoteSummary {
    return {
      id: note.id,
      title: note.title,
      excerpt: note.excerpt,
      tags: [...note.tags],
      assets: note.assets.map((asset) => ({ ...asset })),
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
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

  private async getFavoriteNoteOrThrow(id: string) {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new BadRequestException('笔记标识不能为空。');
    }

    const note = (await this.readFavoriteNoteDocuments()).find(
      (item) => item.id === normalizedId,
    );

    if (!note) {
      throw new NotFoundException(`Favorite note ${normalizedId} not found`);
    }

    return note;
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
        .sort((left, right) =>
          right.collectedAt.localeCompare(left.collectedAt),
        )
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

  private async readFavoriteNoteDocuments(): Promise<FavoriteNoteDocument[]> {
    const raw = await this.systemConfigService.getConfig(
      FAVORITE_NOTE_DOCUMENTS_CONFIG_KEY,
    );
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as FavoriteNoteDocument[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(isFavoriteNoteDocument)
        .map((item) => normalizeFavoriteNoteDocument(item))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, MAX_FAVORITE_NOTES);
    } catch {
      return [];
    }
  }

  private async writeFavoriteNoteDocuments(notes: FavoriteNoteDocument[]) {
    await this.systemConfigService.setConfig(
      FAVORITE_NOTE_DOCUMENTS_CONFIG_KEY,
      JSON.stringify(notes),
    );
  }

  private async captureFavoriteAction(
    ownerId: string,
    input: {
      sourceEntityType: string;
      sourceEntityId: string;
      summaryText: string;
      payload?: Record<string, unknown>;
      occurredAt?: string;
      dedupeKey?: string;
    },
  ) {
    await this.cyberAvatar.captureSignal({
      ownerId,
      signalType: 'favorite_action',
      sourceSurface: 'favorites',
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      dedupeKey: input.dedupeKey,
      summaryText: truncateFavoriteSignalText(input.summaryText),
      payload: input.payload ?? null,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
    });
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

function buildFavoriteNoteSourceId(noteId: string) {
  return `${FAVORITE_NOTE_SOURCE_ID_PREFIX}${noteId}`;
}

function parseFavoriteNoteId(sourceId: string) {
  if (!sourceId.startsWith(FAVORITE_NOTE_SOURCE_ID_PREFIX)) {
    return null;
  }

  const noteId = sourceId.slice(FAVORITE_NOTE_SOURCE_ID_PREFIX.length).trim();
  return noteId || null;
}

function buildFavoriteNoteDocument(input: {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: UpsertFavoriteNoteInput;
}): FavoriteNoteDocument {
  const contentHtml = sanitizeFavoriteNoteHtml(input.input.contentHtml);
  const contentText = normalizeFavoriteNoteContentText(
    input.input.contentText,
    contentHtml,
  );
  const presentation = buildFavoriteNotePresentation(contentText);

  return {
    id: input.id,
    title: presentation.title,
    excerpt: presentation.excerpt,
    contentHtml,
    contentText,
    tags: normalizeFavoriteNoteTags(input.input.tags),
    assets: normalizeFavoriteNoteAssets(input.input.assets),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function truncateFavoriteSignalText(value: string) {
  const normalized = value.trim();
  return normalized.length > 220
    ? `${normalized.slice(0, 217)}...`
    : normalized;
}

function normalizeFavoriteNoteDocument(
  input: FavoriteNoteDocument,
): FavoriteNoteDocument {
  return buildFavoriteNoteDocument({
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    input: {
      contentHtml: input.contentHtml,
      contentText: input.contentText,
      tags: input.tags,
      assets: input.assets,
    },
  });
}

function sanitizeFavoriteNoteHtml(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  return normalized
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
}

function normalizeFavoriteNoteContentText(
  value: string | undefined,
  contentHtml: string,
) {
  const normalized = (value ?? stripHtmlTags(contentHtml))
    .replace(/\r\n/g, '\n')
    .trim();

  return normalized;
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildFavoriteNotePresentation(contentText: string) {
  const trimmedLines = contentText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const compactText = contentText.replace(/\s+/g, ' ').trim();

  return {
    title: trimmedLines[0]?.slice(0, 32) || '无标题笔记',
    excerpt: compactText
      ? compactText.slice(
          0,
          compactText.length > 120 ? 120 : compactText.length,
        )
      : '空白笔记',
  };
}

function normalizeFavoriteNoteTags(value: string[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => {
      if (seen.has(tag)) {
        return false;
      }

      seen.add(tag);
      return true;
    })
    .slice(0, MAX_FAVORITE_NOTE_TAGS);
}

function normalizeFavoriteNoteAssets(value: FavoriteNoteAsset[] | undefined) {
  if (!Array.isArray(value)) {
    return [] as FavoriteNoteAsset[];
  }

  return value
    .filter(isFavoriteNoteAsset)
    .map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      fileName: asset.fileName.trim(),
      url: asset.url.trim(),
      mimeType: asset.mimeType?.trim() || undefined,
      sizeBytes:
        typeof asset.sizeBytes === 'number' && Number.isFinite(asset.sizeBytes)
          ? asset.sizeBytes
          : undefined,
      width:
        typeof asset.width === 'number' && Number.isFinite(asset.width)
          ? asset.width
          : undefined,
      height:
        typeof asset.height === 'number' && Number.isFinite(asset.height)
          ? asset.height
          : undefined,
    }))
    .filter((asset) => asset.fileName && asset.url);
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

function isFavoriteNoteDocument(value: unknown): value is FavoriteNoteDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<FavoriteNoteDocument>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.excerpt === 'string' &&
    typeof item.contentHtml === 'string' &&
    typeof item.contentText === 'string' &&
    Array.isArray(item.tags) &&
    Array.isArray(item.assets) &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  );
}

function isFavoriteNoteAsset(value: unknown): value is FavoriteNoteAsset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<FavoriteNoteAsset>;
  return (
    typeof item.id === 'string' &&
    (item.kind === 'image' || item.kind === 'file') &&
    typeof item.fileName === 'string' &&
    typeof item.url === 'string'
  );
}
