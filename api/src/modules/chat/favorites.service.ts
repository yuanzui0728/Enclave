// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharactersService } from '../characters/characters.service';
import { SystemConfigService } from '../config/config.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { ConversationEntity } from './conversation.entity';
import { FavoriteEntity } from './favorite.entity';
import { FavoriteNoteEntity } from './favorite-note.entity';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import type { MessageAttachment } from './chat.types';
import { MessageEntity } from './message.entity';
import { describeAttachmentForDisplay } from './attachment-semantic-text';
import { FriendRemarkResolver } from '../social/friend-remark-resolver.service';

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
// 走查 R1 抓到没人卡 contentHtml 大小，写 1MB 也照样存。SQLite 单 TEXT 默认上限
// 1GB，不挡的话堆 200 条 1MB 笔记 = 200MB DB，肉眼难发现。512KB 给富文本 +
// 内嵌 base64 小图留足空间，超出就 400。
const MAX_FAVORITE_NOTE_HTML_BYTES = 512 * 1024;
const chatReplyPrefixPattern = /^\[\[chat_reply:([^\]]+)\]\]\n?/;

@Injectable()
export class FavoritesService implements OnModuleInit {
  private readonly logger = new Logger(FavoritesService.name);

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
    @InjectRepository(FavoriteEntity)
    private readonly favoriteRepo: Repository<FavoriteEntity>,
    @InjectRepository(FavoriteNoteEntity)
    private readonly favoriteNoteRepo: Repository<FavoriteNoteEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly systemConfigService: SystemConfigService,
    private readonly cyberAvatar: CyberAvatarService,
    private readonly remarkResolver: FriendRemarkResolver,
    private readonly characters: CharactersService,
  ) {}

  async onModuleInit() {
    // 把旧版 system_config 里的 JSON blob 一次性搬到行级表里。幂等：迁移完成后
    // 旧 key 写入会被清空，下次启动看到 raw=null 直接跳过。
    await this.migrateFavoritesFromConfig();
    await this.migrateFavoriteNotesFromConfig();
    // 老版本 buildConversationMessageFavorite 没顺着 senderId 拉头像，存的
    // 直聊消息收藏 avatarSrc 全是 null。一次性补一下，避免桌面收藏卡都显示成
    // 名字占位渐变。
    await this.backfillDirectMessageFavoriteAvatars();
  }

  private async backfillDirectMessageFavoriteAvatars(): Promise<void> {
    try {
      const rows = await this.favoriteRepo.find({
        where: { category: 'messages' },
      });
      const missing = rows.filter(
        (row) => !row.avatarSrc && row.to.startsWith('/chat/'),
      );
      if (!missing.length) return;

      const avatarCache = new Map<string, string | undefined>();
      const resolveAvatarForConversation = async (
        conversationId: string,
      ): Promise<string | undefined> => {
        if (avatarCache.has(conversationId)) {
          return avatarCache.get(conversationId);
        }
        const conversation = await this.conversationRepo.findOneBy({
          id: conversationId,
        });
        const characterId = conversation?.participants?.[0];
        const avatar = await this.resolveCharacterAvatar(characterId);
        avatarCache.set(conversationId, avatar);
        return avatar;
      };

      let patched = 0;
      for (const row of missing) {
        // to 格式: /chat/<conversationId>#chat-message-<messageId>
        const match = row.to.match(/^\/chat\/([^#]+)/);
        const conversationId = match?.[1]?.trim();
        if (!conversationId) continue;
        const avatar = await resolveAvatarForConversation(conversationId);
        if (!avatar) continue;
        await this.favoriteRepo.update(
          { sourceId: row.sourceId },
          { avatarSrc: avatar },
        );
        patched += 1;
      }
      if (patched > 0) {
        this.logger.log(
          `backfilled avatarSrc on ${patched} direct-message favorites`,
        );
      }
    } catch (error) {
      this.logger.error(
        `backfillDirectMessageFavoriteAvatars failed: ${(error as Error).message}`,
      );
    }
  }

  private async migrateFavoritesFromConfig(): Promise<void> {
    try {
      const raw = await this.systemConfigService.getConfig(
        FAVORITES_CONFIG_KEY,
      );
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        await this.systemConfigService.setConfig(FAVORITES_CONFIG_KEY, '');
        return;
      }
      const records = parsed.filter(isFavoriteRecord) as FavoriteRecord[];
      for (const record of records) {
        await this.favoriteRepo.upsert(
          {
            sourceId: record.sourceId,
            recordId: record.id,
            category: record.category,
            title: record.title,
            description: record.description,
            meta: record.meta,
            to: record.to,
            badge: record.badge,
            avatarName: record.avatarName ?? null,
            avatarSrc: record.avatarSrc ?? null,
            collectedAt: record.collectedAt,
          },
          ['sourceId'],
        );
      }
      // 清空旧 key，避免下次启动重复迁移；用空字符串而非 delete，因为
      // SystemConfigService 没有 delete 方法。
      await this.systemConfigService.setConfig(FAVORITES_CONFIG_KEY, '');
      this.logger.log(
        `migrated ${records.length} favorites from system_config to chat_favorites`,
      );
    } catch (error) {
      this.logger.error(
        `migrateFavoritesFromConfig failed: ${(error as Error).message}`,
      );
    }
  }

  private async migrateFavoriteNotesFromConfig(): Promise<void> {
    try {
      const raw = await this.systemConfigService.getConfig(
        FAVORITE_NOTE_DOCUMENTS_CONFIG_KEY,
      );
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        await this.systemConfigService.setConfig(
          FAVORITE_NOTE_DOCUMENTS_CONFIG_KEY,
          '',
        );
        return;
      }
      const notes = parsed
        .filter(isFavoriteNoteDocument)
        .map((item) => normalizeFavoriteNoteDocument(item));
      for (const note of notes) {
        await this.favoriteNoteRepo.upsert(
          {
            id: note.id,
            title: note.title,
            excerpt: note.excerpt,
            contentHtml: note.contentHtml,
            contentText: note.contentText,
            tags: note.tags,
            assets: note.assets,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          },
          ['id'],
        );
      }
      await this.systemConfigService.setConfig(
        FAVORITE_NOTE_DOCUMENTS_CONFIG_KEY,
        '',
      );
      this.logger.log(
        `migrated ${notes.length} favorite notes from system_config to chat_favorite_notes`,
      );
    } catch (error) {
      this.logger.error(
        `migrateFavoriteNotesFromConfig failed: ${(error as Error).message}`,
      );
    }
  }

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
    // 之前空 body 直接走 input.threadId.trim() → "Cannot read properties of
    // undefined (reading 'trim')" 弹 500。改用可选链 + 字符串守卫，把所有缺字段
    // 的请求都收敛成 CHAT_FAVORITE_PARAMS_REQUIRED 4xx。
    if (
      typeof input?.threadId !== 'string' ||
      !input.threadId.trim() ||
      typeof input?.messageId !== 'string' ||
      !input.messageId.trim() ||
      (input.threadType !== 'direct' && input.threadType !== 'group')
    ) {
      throw new AppError('CHAT_FAVORITE_PARAMS_REQUIRED', {
        legacyMessage: '收藏消息缺少必要参数。',
      });
    }

    const favorite =
      input.threadType === 'group'
        ? await this.buildGroupMessageFavorite(input)
        : await this.buildConversationMessageFavorite(input);
    await this.favoriteRepo.upsert(
      {
        sourceId: favorite.sourceId,
        recordId: favorite.id,
        category: favorite.category,
        title: favorite.title,
        description: favorite.description,
        meta: favorite.meta,
        to: favorite.to,
        badge: favorite.badge,
        avatarName: favorite.avatarName ?? null,
        avatarSrc: favorite.avatarSrc ?? null,
        collectedAt: favorite.collectedAt,
      },
      ['sourceId'],
    );
    await this.trimFavoritesIfNeeded();
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
      throw new AppError('CHAT_FAVORITE_ID_REQUIRED', {
        legacyMessage: '收藏标识不能为空。',
      });
    }

    const noteId = parseFavoriteNoteId(normalizedSourceId);
    if (noteId) {
      return this.removeFavoriteNote(noteId);
    }

    await this.favoriteRepo.delete({ sourceId: normalizedSourceId });
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
    // sanitizeFavoriteNoteHtml 内部 value.trim() 在 contentHtml=undefined/null
    // 时直接抛 → 500。POST {} / {"contentHtml":null} 这种都该 4xx，先在这里收一遍。
    if (typeof input?.contentHtml !== 'string') {
      throw new AppError('CHAT_NOTE_CONTENT_REQUIRED', {
        legacyMessage: '笔记内容不能为空。',
      });
    }
    if (Buffer.byteLength(input.contentHtml, 'utf8') > MAX_FAVORITE_NOTE_HTML_BYTES) {
      throw new AppError('CHAT_NOTE_CONTENT_TOO_LARGE', {
        legacyMessage: '笔记内容过大，请拆分后再保存。',
      });
    }
    const timestamp = new Date().toISOString();
    const note = buildFavoriteNoteDocument({
      id: randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      input,
    });
    // FE handleSave 已经挡了空保存（contentText.trim() && assets.length 都为
    // 空 → 弹"先写点内容"），但直接调 API 还能塞 contentHtml="<p></p>" 的
    // 空笔记，污染 chat_favorite_notes。跟 FE 同标准：正文或附件至少要有一个。
    if (!isFavoriteNoteSubstantive(note)) {
      throw new AppError('CHAT_NOTE_CONTENT_REQUIRED', {
        legacyMessage: '笔记内容不能为空。',
      });
    }
    await this.favoriteNoteRepo.insert({
      id: note.id,
      title: note.title,
      excerpt: note.excerpt,
      contentHtml: note.contentHtml,
      contentText: note.contentText,
      tags: note.tags,
      assets: note.assets,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });
    await this.trimFavoriteNotesIfNeeded();

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
      throw new AppError('CHAT_NOTE_ID_REQUIRED', {
        legacyMessage: '笔记标识不能为空。',
      });
    }
    // 跟 createFavoriteNote 对齐：contentHtml 缺字段 → 4xx 而不是 500。
    if (typeof input?.contentHtml !== 'string') {
      throw new AppError('CHAT_NOTE_CONTENT_REQUIRED', {
        legacyMessage: '笔记内容不能为空。',
      });
    }
    if (Buffer.byteLength(input.contentHtml, 'utf8') > MAX_FAVORITE_NOTE_HTML_BYTES) {
      throw new AppError('CHAT_NOTE_CONTENT_TOO_LARGE', {
        legacyMessage: '笔记内容过大，请拆分后再保存。',
      });
    }

    const existing = await this.getFavoriteNoteOrThrow(normalizedId);
    const nextNote = buildFavoriteNoteDocument({
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      input,
    });
    // 跟 createFavoriteNote 对齐：用 update 把整条笔记清空也算"空笔记"，拒收。
    if (!isFavoriteNoteSubstantive(nextNote)) {
      throw new AppError('CHAT_NOTE_CONTENT_REQUIRED', {
        legacyMessage: '笔记内容不能为空。',
      });
    }
    await this.favoriteNoteRepo.update(
      { id: normalizedId },
      {
        title: nextNote.title,
        excerpt: nextNote.excerpt,
        contentHtml: nextNote.contentHtml,
        contentText: nextNote.contentText,
        tags: nextNote.tags,
        assets: nextNote.assets,
        updatedAt: nextNote.updatedAt,
      },
    );
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
      throw new AppError('CHAT_NOTE_ID_REQUIRED', {
        legacyMessage: '笔记标识不能为空。',
      });
    }

    const removedRow = await this.favoriteNoteRepo.findOneBy({
      id: normalizedId,
    });
    const removedNote = removedRow
      ? this.rowToFavoriteNoteDocument(removedRow)
      : null;
    if (removedNote) {
      await this.favoriteNoteRepo.delete({ id: normalizedId });
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
      throw new AppError('CHAT_CONVERSATION_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { threadId: input.threadId },
        legacyMessage: `Conversation ${input.threadId} not found`,
      });
    }

    const message = await this.messageRepo.findOneBy({
      id: input.messageId,
      conversationId: conversation.id,
    });

    if (!message) {
      throw new AppError('CHAT_MESSAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { messageId: input.messageId },
        legacyMessage: `Message ${input.messageId} not found`,
      });
    }

    const remarkMap = await this.remarkResolver.getOwnerRemarkMap(owner.id);
    // 直聊里 messages 表没有 senderAvatar 列（不像 group_messages 有），
    // 顺着 senderId 去 characters 拉一下，避免收藏卡显示成名字占位渐变。
    const senderAvatar =
      message.senderType === 'character'
        ? await this.resolveCharacterAvatar(message.senderId)
        : undefined;
    return this.buildFavoriteRecord({
      badge: '聊天消息',
      threadPath: `/chat/${conversation.id}#chat-message-${message.id}`,
      snapshot: {
        id: message.id,
        senderType: message.senderType as 'user' | 'character' | 'system',
        senderName: this.remarkResolver.applyCharacterRemark(
          message.senderType,
          message.senderId,
          message.senderName,
          remarkMap,
        ),
        senderAvatar,
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

  private async resolveCharacterAvatar(characterId?: string | null) {
    const normalized = characterId?.trim();
    if (!normalized) return undefined;
    const character = await this.characters.findById(normalized);
    return character?.avatar?.trim() || undefined;
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
      throw new AppError('CHAT_GROUP_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { threadId: input.threadId },
        legacyMessage: `Group ${input.threadId} not found`,
      });
    }

    const group = await this.groupRepo.findOneBy({ id: input.threadId });
    if (!group) {
      throw new AppError('CHAT_GROUP_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { threadId: input.threadId },
        legacyMessage: `Group ${input.threadId} not found`,
      });
    }

    const message = await this.groupMessageRepo.findOneBy({
      id: input.messageId,
      groupId: group.id,
    });

    if (!message) {
      throw new AppError('CHAT_GROUP_MESSAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { messageId: input.messageId },
        legacyMessage: `Group message ${input.messageId} not found`,
      });
    }

    const remarkMap = await this.remarkResolver.getOwnerRemarkMap(owner.id);
    return this.buildFavoriteRecord({
      badge: '群聊消息',
      threadPath: `/group/${group.id}#chat-message-${message.id}`,
      snapshot: {
        id: message.id,
        senderType: message.senderType as 'user' | 'character' | 'system',
        senderName: this.remarkResolver.applyCharacterRemark(
          message.senderType,
          message.senderId,
          message.senderName,
          remarkMap,
        ),
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
    return (
      describeAttachmentForDisplay(snapshot.attachment, {
        maxChars: 160,
      }) || '消息'
    );
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
      throw new AppError('CHAT_NOTE_ID_REQUIRED', {
        legacyMessage: '笔记标识不能为空。',
      });
    }

    const row = await this.favoriteNoteRepo.findOneBy({ id: normalizedId });
    if (!row) {
      throw new AppError('CHAT_NOTE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { noteId: normalizedId },
        legacyMessage: `Favorite note ${normalizedId} not found`,
      });
    }

    return this.rowToFavoriteNoteDocument(row);
  }

  private async readFavorites(): Promise<FavoriteRecord[]> {
    const rows = await this.favoriteRepo.find({
      order: { collectedAt: 'DESC' },
      take: MAX_FAVORITES,
    });
    return rows.map((row) => this.rowToFavoriteRecord(row));
  }

  private async readFavoriteNoteDocuments(): Promise<FavoriteNoteDocument[]> {
    const rows = await this.favoriteNoteRepo.find({
      order: { updatedAt: 'DESC' },
      take: MAX_FAVORITE_NOTES,
    });
    return rows.map((row) => this.rowToFavoriteNoteDocument(row));
  }

  private rowToFavoriteRecord(row: FavoriteEntity): FavoriteRecord {
    return {
      id: row.recordId,
      sourceId: row.sourceId,
      category: row.category as FavoriteRecord['category'],
      title: row.title,
      description: row.description,
      meta: row.meta,
      to: row.to,
      badge: row.badge,
      avatarName: row.avatarName ?? undefined,
      avatarSrc: row.avatarSrc ?? undefined,
      collectedAt: row.collectedAt,
    };
  }

  private rowToFavoriteNoteDocument(
    row: FavoriteNoteEntity,
  ): FavoriteNoteDocument {
    // 跑一遍 normalize 以兜底旧数据里可能不规范的 tag/asset 形状
    return normalizeFavoriteNoteDocument({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      contentHtml: row.contentHtml,
      contentText: row.contentText,
      tags: Array.isArray(row.tags) ? row.tags : [],
      assets: Array.isArray(row.assets) ? (row.assets as FavoriteNoteAsset[]) : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private async trimFavoritesIfNeeded(): Promise<void> {
    const total = await this.favoriteRepo.count();
    if (total <= MAX_FAVORITES) return;
    // SQLite 不支持 DELETE … ORDER BY … LIMIT，先取要保留的 sourceId，再 NOT IN
    const keep = await this.favoriteRepo.find({
      select: ['sourceId'],
      order: { collectedAt: 'DESC' },
      take: MAX_FAVORITES,
    });
    const keepIds = keep.map((row) => row.sourceId);
    if (keepIds.length === 0) return;
    await this.favoriteRepo
      .createQueryBuilder()
      .delete()
      .where('sourceId NOT IN (:...keepIds)', { keepIds })
      .execute();
  }

  private async trimFavoriteNotesIfNeeded(): Promise<void> {
    const total = await this.favoriteNoteRepo.count();
    if (total <= MAX_FAVORITE_NOTES) return;
    const keep = await this.favoriteNoteRepo.find({
      select: ['id'],
      order: { updatedAt: 'DESC' },
      take: MAX_FAVORITE_NOTES,
    });
    const keepIds = keep.map((row) => row.id);
    if (keepIds.length === 0) return;
    await this.favoriteNoteRepo
      .createQueryBuilder()
      .delete()
      .where('id NOT IN (:...keepIds)', { keepIds })
      .execute();
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

// 收藏笔记的 contentHtml 在 chat-message-list 里走 dangerouslySetInnerHTML，
// 必须挡住 javascript:/vbscript:/data:text 等危险协议，再连 <iframe>/<object>/
// <svg> 等 XSS 通道一并去掉。走查 R1 抓到 <a href="javascript:..."> 没被洗，
// 在 message 里点开会执行。
const DANGEROUS_URL_PROTOCOL =
  /^\s*(?:javascript|vbscript|data:(?:text|application))/i;
const DANGEROUS_HTML_TAGS =
  /<\/?(?:iframe|object|embed|style|link|meta|form|input|base|svg|frame|frameset|applet)\b[^>]*>/gi;

function sanitizeFavoriteNoteHtml(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  let html = normalized;
  // <script>...</script>（兜底，DANGEROUS_HTML_TAGS 不覆盖闭合块内文本）
  html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<\/?script\b[^>]*>/gi, '');
  // 直接危险的标签
  html = html.replace(DANGEROUS_HTML_TAGS, '');
  // 三种引号形态的 on* 事件 attr
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  // href/src/xlink:href 里的危险协议改成 # —— 三种引号形态分别匹配
  html = html.replace(
    /(\s(?:href|src|xlink:href)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, attr, doubleQuoted, singleQuoted, unquoted) => {
      const url = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      if (DANGEROUS_URL_PROTOCOL.test(url)) {
        return `${attr}"#"`;
      }
      return match;
    },
  );
  return html;
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

// 单个 tag 最长。走查 R3 抓到 tags=['x'*1000] 也能进库，UI 上一个 tag 撑爆
// 整行。32 字符给 #中文长标签 + 英文短词都够用，超出截断不报错（跟 dedupe
// 保持"宽松接受"的语义）。
const MAX_FAVORITE_NOTE_TAG_CHARS = 32;

function normalizeFavoriteNoteTags(value: string[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .map((tag) => tag.trim().slice(0, MAX_FAVORITE_NOTE_TAG_CHARS))
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
      // 走查 R1 抓到 asset.url 接受 "javascript:..."。笔记发到聊天里
      // chat-message-list 把 asset.url 直接喂 <a href> / <img src>，对方点
      // 链接就 XSS。这里凡命中危险协议整条 asset 丢掉（下方 fileName/url
      // 截断兜底），合法 http(s)/相对路径不受影响。
      url: sanitizeFavoriteAssetUrl(asset.url.trim()),
      mimeType: asset.mimeType?.trim() || undefined,
      // 之前只挡 NaN/Infinity，不挡负数和 1e308。负数当尺寸 + 巨大数都没意义，
      // 一律收敛成 undefined，避免 UI 端再 max-h-{height}px 渲染出问题。
      sizeBytes: clampNonNegativeNumber(asset.sizeBytes),
      width: clampNonNegativeNumber(asset.width),
      height: clampNonNegativeNumber(asset.height),
    }))
    .filter((asset) => asset.fileName && asset.url);
}

function sanitizeFavoriteAssetUrl(value: string) {
  if (DANGEROUS_URL_PROTOCOL.test(value)) {
    return '';
  }
  return value;
}

// asset 的 sizeBytes/width/height 在 normalizeFavoriteNoteAssets 里之前只挡
// NaN/Infinity。负数 + 1e308 这种合法 Number.isFinite() 但语义没意义，全部
// 收敛成 undefined。安全上限按 Number.MAX_SAFE_INTEGER 兜底防止溢出。
function clampNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0) return undefined;
  if (value > Number.MAX_SAFE_INTEGER) return undefined;
  return value;
}

// 跟 FE handleSave 的 hasContent 同标准：只看正文或附件，标签单独不能成笔记。
function isFavoriteNoteSubstantive(note: FavoriteNoteDocument): boolean {
  return Boolean(note.contentText.trim()) || note.assets.length > 0;
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
// i18n-ignore-end
