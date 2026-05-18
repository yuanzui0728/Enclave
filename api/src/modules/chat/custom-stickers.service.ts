import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  resolveApiPath,
  resolveDataPath,
  resolveRepoPath,
} from '../../database/database-path';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  resolveReadableChatAttachmentPath,
} from './chat-attachment-storage';
import { ConversationEntity } from './conversation.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import { GroupEntity } from './group.entity';
import { MessageEntity } from './message.entity';
import type {
  ImageAttachment,
  MessageAttachment,
  StickerAttachment,
} from './chat.types';
import {
  type StickerPack,
  getStickerPackCatalog,
  findStickerAttachment,
} from './sticker-catalog';
import { ChatCustomStickerEntity } from './custom-sticker.entity';

const MAX_CUSTOM_STICKERS = 300;
const MAX_CUSTOM_STICKER_EDGE = 320;
const MAX_CUSTOM_GIF_BYTES = 2 * 1024 * 1024;
const CUSTOM_STICKER_ASSET_ROUTE = '/api/chat/stickers/assets/';
const CHAT_ATTACHMENT_ROUTE = '/api/chat/attachments/';

export type UploadedStickerFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

export type CustomStickerRecord = StickerAttachment & {
  id: string;
  fileName: string;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
};

export type StickerCatalogResponse = {
  builtinPacks: StickerPack[];
  customStickers: CustomStickerRecord[];
  maxCustomStickerCount: number;
  customStickerCount: number;
};

type CreateCustomStickerInput = {
  label?: string;
  keywords?: string[] | string;
  width?: number;
  height?: number;
  source?: 'upload' | 'message_image' | 'message_sticker';
  sourceThreadType?: 'conversation' | 'group';
  sourceThreadId?: string;
  sourceMessageId?: string;
};

type CreateCustomStickerFromMessageInput = {
  threadType: 'conversation' | 'group';
  threadId: string;
  messageId: string;
  label?: string;
  keywords?: string[] | string;
};

type ResolvedMessageStickerSource = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  label?: string;
  source: 'message_image' | 'message_sticker';
  sourceThreadType: 'conversation' | 'group';
  sourceThreadId: string;
  sourceMessageId: string;
};

@Injectable()
export class CustomStickersService {
  constructor(
    @InjectRepository(ChatCustomStickerEntity)
    private readonly customStickerRepo: Repository<ChatCustomStickerEntity>,
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
  ) {}

  async getStickerCatalog(): Promise<StickerCatalogResponse> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const customStickers = await this.customStickerRepo.find({
      where: { ownerId: owner.id },
      order: {
        updatedAt: 'DESC',
        createdAt: 'DESC',
      },
    });

    return {
      builtinPacks: getStickerPackCatalog(),
      customStickers: customStickers.map((item) =>
        this.serializeCustomSticker(item),
      ),
      maxCustomStickerCount: MAX_CUSTOM_STICKERS,
      customStickerCount: customStickers.length,
    };
  }

  async createCustomSticker(
    file: UploadedStickerFile,
    input: CreateCustomStickerInput = {},
  ): Promise<CustomStickerRecord> {
    this.assertUploadableStickerMimeType(file.mimetype);

    return this.createCustomStickerFromBuffer(file.buffer, {
      label: input.label,
      keywords: input.keywords,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      width: input.width,
      height: input.height,
      source: input.source ?? 'upload',
      sourceThreadType: input.sourceThreadType,
      sourceThreadId: input.sourceThreadId,
      sourceMessageId: input.sourceMessageId,
    });
  }

  async createCustomStickerFromMessage(
    input: CreateCustomStickerFromMessageInput,
  ): Promise<CustomStickerRecord> {
    const source = await this.resolveMessageStickerSource(input);
    return this.createCustomStickerFromBuffer(source.buffer, {
      label: input.label || source.label,
      keywords: input.keywords,
      originalName: source.fileName,
      mimeType: source.mimeType,
      sizeBytes: source.buffer.length,
      width: source.width,
      height: source.height,
      source: source.source,
      sourceThreadType: source.sourceThreadType,
      sourceThreadId: source.sourceThreadId,
      sourceMessageId: source.sourceMessageId,
    });
  }

  async deleteCustomSticker(id: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const sticker = await this.customStickerRepo.findOne({
      where: {
        id,
        ownerId: owner.id,
      },
    });

    if (!sticker) {
      throw new AppError('CHAT_STICKER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '自定义表情不存在。',
      });
    }

    await this.customStickerRepo.remove(sticker);
    const targetPath = path.join(
      this.resolveCustomStickerStorageDir(),
      sticker.storageFileName,
    );
    await rm(targetPath, {
      force: true,
    }).catch(() => undefined);
    return {
      success: true,
    };
  }

  async resolveStickerAttachment(input: {
    sourceType?: 'builtin' | 'custom';
    stickerId: string;
    packId?: string;
  }): Promise<StickerAttachment | null> {
    if ((input.sourceType ?? 'builtin') === 'custom') {
      return this.findCustomStickerAttachment(input.stickerId);
    }

    if (!input.packId?.trim()) {
      return null;
    }

    return findStickerAttachment(input.packId, input.stickerId);
  }

  getCustomStickerStorageDir() {
    return this.resolveCustomStickerStorageDir();
  }

  resolveReadableCustomStickerPath(fileName: string) {
    const normalized = this.normalizeCustomStickerFileName(fileName);
    const candidates = [
      path.join(this.resolveCustomStickerStorageDir(), normalized),
      path.join(this.resolveLegacyCustomStickerStorageDir(), normalized),
    ];
    return candidates.find((candidatePath) => existsSync(candidatePath)) ?? candidates[0];
  }

  normalizeCustomStickerFileName(fileName: string) {
    const normalized = path.basename(fileName).trim();
    if (!normalized) {
      throw new AppError('CHAT_STICKER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Custom sticker not found',
      });
    }

    return normalized;
  }

  private async createCustomStickerFromBuffer(
    buffer: Buffer,
    input: {
      label?: string;
      keywords?: string[] | string;
      originalName?: string;
      mimeType: string;
      sizeBytes: number;
      width?: number;
      height?: number;
      source: 'upload' | 'message_image' | 'message_sticker';
      sourceThreadType?: 'conversation' | 'group';
      sourceThreadId?: string;
      sourceMessageId?: string;
    },
  ): Promise<CustomStickerRecord> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const normalizedMimeType = normalizeStickerMimeType(input.mimeType);
    this.assertCustomStickerAssetProfile({
      mimeType: normalizedMimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      source: input.source,
    });

    const assetHash = createHash('sha256').update(buffer).digest('hex');
    const existing = await this.customStickerRepo.findOne({
      where: {
        ownerId: owner.id,
        assetHash,
      },
      order: {
        updatedAt: 'DESC',
      },
    });
    if (existing) {
      existing.lastUsedAt = new Date();
      await this.customStickerRepo.save(existing);
      return this.serializeCustomSticker(existing);
    }

    const count = await this.customStickerRepo.count({
      where: {
        ownerId: owner.id,
      },
    });
    if (count >= MAX_CUSTOM_STICKERS) {
      throw new AppError('CHAT_STICKER_LIMIT_REACHED', {
        params: { max: MAX_CUSTOM_STICKERS },
        legacyMessage: `自定义表情最多只能保存 ${MAX_CUSTOM_STICKERS} 个。`,
      });
    }

    const displayName = normalizeDisplayStickerName(
      input.originalName,
      input.label,
      normalizedMimeType,
    );
    const extension =
      path.extname(displayName) || guessStickerExtension(normalizedMimeType);
    const baseName = path.basename(displayName, extension) || 'custom-sticker';
    const storedFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(baseName)}${extension}`;
    const storageDir = this.resolveCustomStickerStorageDir();

    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, storedFileName), buffer);

    const label =
      normalizeStickerLabel(input.label) ||
      path.basename(displayName, extension) ||
      '自定义表情';
    const entity = this.customStickerRepo.create({
      ownerId: owner.id,
      label,
      keywordsPayload: JSON.stringify(
        normalizeStickerKeywords(input.keywords, label, displayName),
      ),
      fileName: displayName,
      storageFileName: storedFileName,
      mimeType: normalizedMimeType,
      // 存相对 URL 而非快照 PUBLIC_API_BASE_URL：公网入口端口/协议变更后绝对 URL 会永远 404。
      // 前端 contracts/client.ts normalizeAttachmentAssetUrl 渲染时按当前 apiBaseUrl absolutize。
      url: `${CUSTOM_STICKER_ASSET_ROUTE}${storedFileName}`,
      sizeBytes: input.sizeBytes,
      width: normalizeOptionalDimension(input.width),
      height: normalizeOptionalDimension(input.height),
      assetHash,
      source: input.source,
      sourceThreadType: input.sourceThreadType ?? null,
      sourceThreadId: input.sourceThreadId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
    });
    await this.customStickerRepo.save(entity);
    return this.serializeCustomSticker(entity);
  }

  private async resolveMessageStickerSource(
    input: CreateCustomStickerFromMessageInput,
  ): Promise<ResolvedMessageStickerSource> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();

    if (input.threadType === 'conversation') {
      const conversation = await this.conversationRepo.findOne({
        where: {
          id: input.threadId,
          ownerId: owner.id,
        },
      });
      if (!conversation) {
        throw new AppError('CHAT_CONVERSATION_NOT_FOUND', {
          status: HttpStatus.NOT_FOUND,
          legacyMessage: '会话不存在。',
        });
      }

      const message = await this.messageRepo.findOne({
        where: {
          id: input.messageId,
          conversationId: input.threadId,
        },
      });
      if (!message) {
        throw new AppError('CHAT_MESSAGE_NOT_FOUND', {
          status: HttpStatus.NOT_FOUND,
          legacyMessage: '消息不存在。',
        });
      }

      const attachment = this.parseAttachment(
        message.attachmentKind,
        message.attachmentPayload,
      );
      return this.buildMessageStickerSource({
        attachment,
        threadType: 'conversation',
        threadId: input.threadId,
        messageId: input.messageId,
      });
    }

    const group = await this.groupRepo.findOne({
      where: {
        id: input.threadId,
      },
    });
    if (!group) {
      throw new AppError('CHAT_GROUP_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '群聊不存在。',
      });
    }

    const membership = await this.groupMemberRepo.findOne({
      where: {
        groupId: input.threadId,
        memberId: owner.id,
      },
    });
    if (!membership) {
      throw new AppError('CHAT_GROUP_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '群聊不存在。',
      });
    }

    const message = await this.groupMessageRepo.findOne({
      where: {
        id: input.messageId,
        groupId: input.threadId,
      },
    });
    if (!message) {
      throw new AppError('CHAT_MESSAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '消息不存在。',
      });
    }

    const attachment = this.parseAttachment(
      message.attachmentKind,
      message.attachmentPayload,
    );
    return this.buildMessageStickerSource({
      attachment,
      threadType: 'group',
      threadId: input.threadId,
      messageId: input.messageId,
    });
  }

  private async buildMessageStickerSource(input: {
    attachment?: MessageAttachment;
    threadType: 'conversation' | 'group';
    threadId: string;
    messageId: string;
  }): Promise<ResolvedMessageStickerSource> {
    if (!input.attachment) {
      throw new AppError('CHAT_STICKER_MESSAGE_NO_IMPORTABLE', {
        legacyMessage: '这条消息没有可导入的表情内容。',
      });
    }

    if (input.attachment.kind === 'image') {
      const buffer = await this.readStickerSourceBuffer(input.attachment);
      return {
        buffer,
        fileName: input.attachment.fileName || 'image-sticker',
        mimeType: normalizeStickerMimeType(input.attachment.mimeType),
        width: normalizeOptionalDimension(input.attachment.width),
        height: normalizeOptionalDimension(input.attachment.height),
        label:
          path.basename(
            input.attachment.fileName || 'image-sticker',
            path.extname(input.attachment.fileName || ''),
          ) || '图片表情',
        source: 'message_image',
        sourceThreadType: input.threadType,
        sourceThreadId: input.threadId,
        sourceMessageId: input.messageId,
      };
    }

    if (input.attachment.kind === 'sticker') {
      const buffer = await this.readStickerSourceBuffer(input.attachment);
      return {
        buffer,
        fileName: `${input.attachment.label || input.attachment.stickerId}${guessStickerExtension(input.attachment.mimeType || inferStickerMimeType(input.attachment.url))}`,
        mimeType: normalizeStickerMimeType(
          input.attachment.mimeType || inferStickerMimeType(input.attachment.url),
        ),
        width: normalizeOptionalDimension(input.attachment.width),
        height: normalizeOptionalDimension(input.attachment.height),
        label: input.attachment.label || input.attachment.stickerId,
        source: 'message_sticker',
        sourceThreadType: input.threadType,
        sourceThreadId: input.threadId,
        sourceMessageId: input.messageId,
      };
    }

    throw new AppError('CHAT_STICKER_MESSAGE_NOT_SUPPORTED', {
      legacyMessage: '当前消息暂不支持添加到表情。',
    });
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

  private async readStickerSourceBuffer(
    attachment: StickerAttachment | ImageAttachment,
  ) {
    const pathname = extractAssetPathname(attachment.url);
    if (!pathname) {
      throw new AppError('CHAT_STICKER_RESOURCE_INVALID', {
        legacyMessage: '当前资源无法添加到表情。',
      });
    }

    if (pathname.startsWith(CUSTOM_STICKER_ASSET_ROUTE)) {
      const fileName = pathname.slice(CUSTOM_STICKER_ASSET_ROUTE.length);
      return readFile(this.resolveReadableCustomStickerPath(fileName)).catch(
        () => {
          throw new AppError('CHAT_STICKER_ASSET_NOT_FOUND', {
            status: HttpStatus.NOT_FOUND,
            legacyMessage: '自定义表情资源不存在。',
          });
        },
      );
    }

    if (pathname.startsWith(CHAT_ATTACHMENT_ROUTE)) {
      const fileName = normalizeStoredAssetFileName(
        pathname.slice(CHAT_ATTACHMENT_ROUTE.length),
      );
      return readFile(resolveReadableChatAttachmentPath(fileName)).catch(() => {
        throw new AppError('CHAT_STICKER_IMAGE_NOT_FOUND', {
          status: HttpStatus.NOT_FOUND,
          legacyMessage: '图片资源不存在。',
        });
      });
    }

    if (pathname.startsWith('/stickers/')) {
      const targetPath = path.join(
        resolveRepoPath('apps/app/public'),
        pathname.replace(/^\/+/, ''),
      );
      return readFile(targetPath).catch(() => {
        throw new AppError('CHAT_STICKER_BUILTIN_NOT_FOUND', {
          status: HttpStatus.NOT_FOUND,
          legacyMessage: '内置表情资源不存在。',
        });
      });
    }

    throw new AppError('CHAT_STICKER_RESOURCE_NOT_SUPPORTED', {
      legacyMessage: '当前资源暂不支持添加到表情。',
    });
  }

  private async findCustomStickerAttachment(
    stickerId: string,
  ): Promise<StickerAttachment | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const entity = await this.customStickerRepo.findOne({
      where: {
        id: stickerId,
        ownerId: owner.id,
      },
    });
    return entity ? this.buildCustomStickerAttachment(entity) : null;
  }

  private serializeCustomSticker(
    entity: ChatCustomStickerEntity,
  ): CustomStickerRecord {
    return {
      ...this.buildCustomStickerAttachment(entity),
      id: entity.id,
      fileName: entity.fileName,
      keywords: parseStickerKeywords(entity.keywordsPayload),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private buildCustomStickerAttachment(
    entity: ChatCustomStickerEntity,
  ): StickerAttachment {
    return {
      kind: 'sticker',
      sourceType: 'custom',
      stickerId: entity.id,
      url: entity.url,
      mimeType: entity.mimeType,
      width: normalizeOptionalDimension(entity.width) ?? 160,
      height: normalizeOptionalDimension(entity.height) ?? 160,
      label: entity.label,
    };
  }

  private resolveCustomStickerStorageDir(): string {
    return resolveDataPath('chat-stickers');
  }

  private resolveLegacyCustomStickerStorageDir(): string {
    return resolveApiPath('storage', 'chat-stickers');
  }

  private assertUploadableStickerMimeType(mimeType: string) {
    const normalized = normalizeStickerMimeType(mimeType);
    if (!normalized.startsWith('image/')) {
      throw new AppError('CHAT_STICKER_UPLOAD_IMAGE_ONLY', {
        legacyMessage: '只能上传图片或动图作为表情。',
      });
    }
  }

  private assertCustomStickerAssetProfile(input: {
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    source: 'upload' | 'message_image' | 'message_sticker';
  }) {
    const width = normalizeOptionalDimension(input.width);
    const height = normalizeOptionalDimension(input.height);
    const largestEdge = Math.max(width ?? 0, height ?? 0);

    if (largestEdge > MAX_CUSTOM_STICKER_EDGE) {
      throw new AppError('CHAT_STICKER_EDGE_TOO_LARGE', {
        params: { maxEdge: MAX_CUSTOM_STICKER_EDGE },
        legacyMessage: `表情最大边长不能超过 ${MAX_CUSTOM_STICKER_EDGE}px，请先压缩后再试。`,
      });
    }

    if (
      input.mimeType === 'image/gif' &&
      input.sizeBytes > MAX_CUSTOM_GIF_BYTES
    ) {
      throw new AppError('CHAT_STICKER_GIF_TOO_LARGE', {
        params: { maxBytesText: formatStickerFileSize(MAX_CUSTOM_GIF_BYTES) },
        legacyMessage: `GIF 表情不能超过 ${formatStickerFileSize(MAX_CUSTOM_GIF_BYTES)}，请先压缩后再试。`,
      });
    }
  }
}

function extractAssetPathname(url: string) {
  if (!url?.trim()) {
    return null;
  }

  try {
    if (/^https?:\/\//i.test(url.trim())) {
      return new URL(url.trim()).pathname;
    }
  } catch {
    return null;
  }

  return url.startsWith('/') ? url : null;
}

function normalizeDisplayStickerName(
  originalName?: string,
  label?: string,
  mimeType?: string,
) {
  const trimmedOriginalName = originalName?.trim();
  if (trimmedOriginalName) {
    return path.basename(trimmedOriginalName);
  }

  const normalizedLabel = normalizeStickerLabel(label);
  const extension = guessStickerExtension(mimeType || 'image/png');
  return `${normalizedLabel || 'custom-sticker'}${extension}`;
}

function normalizeStickerLabel(value?: string) {
  return value?.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function normalizeStickerKeywords(
  value: string[] | string | undefined,
  label: string,
  fileName: string,
) {
  const tokens = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,，、|/]+/)
      : [];
  const baseName = path.basename(fileName, path.extname(fileName));

  return Array.from(
    new Set(
      [label, baseName, ...tokens]
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  );
}

function parseStickerKeywords(value?: string | null) {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function normalizeStoredAssetFileName(value: string) {
  const normalized = path.basename(value).trim();
  if (!normalized) {
    throw new AppError('CHAT_ASSET_NOT_FOUND', {
      status: HttpStatus.NOT_FOUND,
      legacyMessage: 'Asset not found',
    });
  }

  return normalized;
}

function normalizeOptionalDimension(value?: number | null) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return undefined;
  }

  return Math.round(value);
}

function normalizeStickerMimeType(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return 'image/png';
  }

  if (normalized === 'image/jpg') {
    return 'image/jpeg';
  }

  return normalized;
}

function guessStickerExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') {
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

  if (mimeType === 'image/svg+xml') {
    return '.svg';
  }

  return '.png';
}

function inferStickerMimeType(url: string) {
  const pathname = extractAssetPathname(url) || '';
  if (pathname.endsWith('.gif')) {
    return 'image/gif';
  }

  if (pathname.endsWith('.webp')) {
    return 'image/webp';
  }

  if (pathname.endsWith('.svg')) {
    return 'image/svg+xml';
  }

  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  return 'image/png';
}

function formatStickerFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
  }

  return `${Math.round(bytes / 1024)}KB`;
}
// i18n-ignore-end
