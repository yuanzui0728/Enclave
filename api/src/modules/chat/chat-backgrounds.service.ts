import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { ConversationEntity } from './conversation.entity';
import { GroupEntity } from './group.entity';
import type {
  ChatBackgroundAsset,
  ConversationBackgroundSettings,
} from './chat-background.types';
import {
  normalizeChatBackgroundAsset,
  parseChatBackgroundAsset,
} from './chat-background.utils';

type UploadedBackgroundFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

@Injectable()
export class ChatBackgroundsService {
  constructor(
    private readonly worldOwnerService: WorldOwnerService,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
  ) {}

  async getConversationBackgroundSettings(
    conversationId: string,
  ): Promise<ConversationBackgroundSettings> {
    const conversation = await this.requireOwnedConversation(conversationId);
    const defaultBackground =
      (await this.worldOwnerService.getDefaultChatBackground()) ?? null;
    const conversationBackground =
      parseChatBackgroundAsset(conversation.chatBackgroundPayload) ?? null;
    const mode =
      conversation.chatBackgroundMode === 'custom' && conversationBackground
        ? 'custom'
        : 'inherit';

    return {
      mode,
      conversationBackground,
      defaultBackground,
      effectiveBackground:
        mode === 'custom' ? conversationBackground : defaultBackground,
    };
  }

  async updateConversationBackground(
    conversationId: string,
    input: {
      mode: 'inherit' | 'custom';
      background?: ChatBackgroundAsset | null;
    },
  ): Promise<ConversationBackgroundSettings> {
    const conversation = await this.requireOwnedConversation(conversationId);

    if (input.mode === 'custom' && !input.background) {
      throw new BadRequestException('请先选择当前聊天的背景图。');
    }

    conversation.chatBackgroundMode = input.mode;
    conversation.chatBackgroundPayload =
      input.mode === 'custom' && input.background
        ? JSON.stringify(normalizeChatBackgroundAsset(input.background))
        : null;

    await this.conversationRepo.save(conversation);
    return this.getConversationBackgroundSettings(conversationId);
  }

  async clearConversationBackground(
    conversationId: string,
  ): Promise<ConversationBackgroundSettings> {
    const conversation = await this.requireOwnedConversation(conversationId);
    conversation.chatBackgroundMode = 'inherit';
    conversation.chatBackgroundPayload = null;
    await this.conversationRepo.save(conversation);
    return this.getConversationBackgroundSettings(conversationId);
  }

  async getGroupBackgroundSettings(
    groupId: string,
  ): Promise<ConversationBackgroundSettings> {
    const group = await this.requireOwnedGroup(groupId);
    const defaultBackground =
      (await this.worldOwnerService.getDefaultChatBackground()) ?? null;
    const conversationBackground =
      parseChatBackgroundAsset(group.chatBackgroundPayload) ?? null;
    const mode =
      group.chatBackgroundMode === 'custom' && conversationBackground
        ? 'custom'
        : 'inherit';

    return {
      mode,
      conversationBackground,
      defaultBackground,
      effectiveBackground:
        mode === 'custom' ? conversationBackground : defaultBackground,
    };
  }

  async updateGroupBackground(
    groupId: string,
    input: {
      mode: 'inherit' | 'custom';
      background?: ChatBackgroundAsset | null;
    },
  ): Promise<ConversationBackgroundSettings> {
    const group = await this.requireOwnedGroup(groupId);

    if (input.mode === 'custom' && !input.background) {
      throw new BadRequestException('请先选择当前聊天的背景图。');
    }

    group.chatBackgroundMode = input.mode;
    group.chatBackgroundPayload =
      input.mode === 'custom' && input.background
        ? JSON.stringify(normalizeChatBackgroundAsset(input.background))
        : null;

    await this.groupRepo.save(group);
    return this.getGroupBackgroundSettings(groupId);
  }

  async clearGroupBackground(
    groupId: string,
  ): Promise<ConversationBackgroundSettings> {
    const group = await this.requireOwnedGroup(groupId);
    group.chatBackgroundMode = 'inherit';
    group.chatBackgroundPayload = null;
    await this.groupRepo.save(group);
    return this.getGroupBackgroundSettings(groupId);
  }

  async saveUploadedChatBackground(
    file: UploadedBackgroundFile,
    metadata: { width?: number; height?: number },
  ): Promise<ChatBackgroundAsset> {
    if (!file.mimetype.startsWith('image/')) {
      throw new NotFoundException('当前只支持上传图片作为聊天背景。');
    }

    const originalName = sanitizeFileName(
      file.originalname ?? 'chat-background',
    );
    const extension = path.extname(originalName) || guessImageExtension(file.mimetype);
    const baseName = path.basename(originalName, extension) || 'chat-background';
    const storedFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(baseName)}${extension}`;
    const storageDir = this.resolveBackgroundStorageDir();

    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, storedFileName), file.buffer);

    const url = `${this.resolvePublicApiBaseUrl()}/api/chat/backgrounds/${storedFileName}`;

    return {
      source: 'upload',
      assetId: storedFileName,
      url,
      thumbnailUrl: url,
      label: originalName.endsWith(extension)
        ? originalName
        : `${originalName}${extension}`,
      width: normalizeOptionalDimension(metadata.width),
      height: normalizeOptionalDimension(metadata.height),
    };
  }

  getBackgroundStorageDir() {
    return this.resolveBackgroundStorageDir();
  }

  normalizeBackgroundFileName(fileName: string) {
    const normalized = path.basename(fileName).trim();
    if (!normalized) {
      throw new NotFoundException('Chat background not found');
    }

    return normalized;
  }

  private async requireOwnedConversation(conversationId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const conversation = await this.conversationRepo.findOneBy({
      id: conversationId,
      ownerId: owner.id,
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return conversation;
  }

  private async requireOwnedGroup(groupId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const group = await this.groupRepo.findOneBy({
      id: groupId,
      creatorId: owner.id,
      creatorType: 'user',
    });

    if (!group) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }

    return group;
  }

  private resolveBackgroundStorageDir() {
    const cwd = process.cwd();
    const apiRoot =
      existsSync(path.join(cwd, 'src')) &&
      existsSync(path.join(cwd, 'package.json'))
        ? cwd
        : path.join(cwd, 'api');

    return path.join(apiRoot, 'storage', 'chat-backgrounds');
  }

  private resolvePublicApiBaseUrl() {
    return (
      process.env.PUBLIC_API_BASE_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? 3000}`
    ).replace(/\/+$/, '');
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

function guessImageExtension(mimeType: string) {
  if (mimeType === 'image/png') {
    return '.png';
  }

  if (mimeType === 'image/webp') {
    return '.webp';
  }

  if (mimeType === 'image/gif') {
    return '.gif';
  }

  return '.jpg';
}

function normalizeOptionalDimension(value?: number) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value);
}
