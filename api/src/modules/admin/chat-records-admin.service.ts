import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import {
  searchMessages as searchVisibleMessages,
  sliceMessagesAround,
  type MessageSearchQuery,
} from '../chat/message-search.utils';
import { MessageEntity } from '../chat/message.entity';
import {
  type Message as ChatMessage,
  type MessageAttachment,
} from '../chat/chat.types';

type ChatRecordConversationListQuery = {
  characterId?: string;
  includeHidden?: boolean | string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  page?: number | string;
  pageSize?: number | string;
};

type ChatRecordConversationMessagesQuery = {
  cursor?: string;
  limit?: number | string;
  aroundMessageId?: string;
  before?: number | string;
  after?: number | string;
  includeClearedHistory?: boolean | string;
};

type ChatRecordConversationSearchQuery = Omit<MessageSearchQuery, 'limit'> & {
  limit?: number | string;
  includeClearedHistory?: boolean | string;
};

type ChatRecordMessage = Omit<ChatMessage, 'createdAt'> & {
  createdAt: string;
};

type ChatRecordConversationListItem = {
  id: string;
  title: string;
  characterId: string | null;
  characterName: string;
  characterAvatar?: string | null;
  relationship?: string | null;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  lastClearedAt: string | null;
  hasClearedHistory: boolean;
  visibleMessageCount: number;
  storedMessageCount: number;
  recentMessageCount7d: number;
  recentMessageCount30d: number;
  lastVisibleMessage?: ChatRecordMessage | null;
  lastStoredMessage?: ChatRecordMessage | null;
};

type ChatRecordConversationCharacterSummary = {
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  isOnline: boolean;
  currentActivity?: string | null;
  expertDomains: string[];
  intimacyLevel: number;
  lastActiveAt?: string | null;
};

type ChatRecordConversationStats = {
  includeClearedHistory: boolean;
  messageCount: number;
  visibleMessageCount: number;
  storedMessageCount: number;
  userMessageCount: number;
  characterMessageCount: number;
  proactiveMessageCount: number;
  attachmentMessageCount: number;
  systemMessageCount: number;
  recentMessageCount7d: number;
  recentMessageCount30d: number;
  firstResponseAverageMs: number | null;
  firstResponseMedianMs: number | null;
};

type ChatRecordConversationMessagesPage = {
  items: ChatRecordMessage[];
  total: number;
  nextCursor?: string;
  hasMore: boolean;
  mode: 'latest' | 'around';
  includeClearedHistory: boolean;
  aroundMessageId?: string | null;
};

type ChatRecordTokenUsageSummary = {
  allTimeOverview: Awaited<ReturnType<AiUsageLedgerService['getOverview']>>;
  recent30dOverview: Awaited<ReturnType<AiUsageLedgerService['getOverview']>>;
  recent30dTrend: Awaited<ReturnType<AiUsageLedgerService['getTrend']>>;
  recent30dBreakdown: Pick<
    Awaited<ReturnType<AiUsageLedgerService['getBreakdown']>>,
    'byScene' | 'byModel' | 'byBillingSource'
  >;
  recentRecords: Awaited<ReturnType<AiUsageLedgerService['getRecords']>>;
};

const DEFAULT_LIST_PAGE_SIZE = 24;
const MAX_LIST_PAGE_SIZE = 100;
const DEFAULT_MESSAGE_PAGE_SIZE = 60;
const MAX_MESSAGE_PAGE_SIZE = 200;

@Injectable()
export class ChatRecordsAdminService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(AiUsageLedgerEntity)
    private readonly usageRepo: Repository<AiUsageLedgerEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly usageLedger: AiUsageLedgerService,
  ) {}

  async getOverview() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const conversations = await this.conversationRepo.find({
      where: {
        ownerId: owner.id,
        type: 'direct',
      },
      order: {
        lastActivityAt: 'DESC',
      },
    });

    if (!conversations.length) {
      return {
        totalConversationCount: 0,
        activeConversationCount7d: 0,
        activeConversationCount30d: 0,
        messageCount7d: 0,
        messageCount30d: 0,
        requestCount30d: 0,
        totalTokens30d: 0,
        estimatedCost30d: 0,
        currency: 'CNY' as const,
      };
    }

    const conversationIds = conversations.map((conversation) => conversation.id);
    const sevenDaysAgo = this.daysAgo(7);
    const thirtyDaysAgo = this.daysAgo(30);

    const [recentMessages, recentUsage] = await Promise.all([
      this.messageRepo.find({
        where: {
          conversationId: In(conversationIds),
          createdAt: MoreThanOrEqual(thirtyDaysAgo),
        },
        order: {
          createdAt: 'DESC',
        },
      }),
      this.usageRepo.find({
        where: {
          conversationId: In(conversationIds),
          occurredAt: MoreThanOrEqual(thirtyDaysAgo),
        },
        order: {
          occurredAt: 'DESC',
        },
      }),
    ]);

    const activeConversationIds30d = new Set(
      recentMessages.map((message) => message.conversationId),
    );
    const activeConversationIds7d = new Set(
      recentMessages
        .filter((message) => message.createdAt >= sevenDaysAgo)
        .map((message) => message.conversationId),
    );

    return {
      totalConversationCount: conversations.length,
      activeConversationCount7d: activeConversationIds7d.size,
      activeConversationCount30d: activeConversationIds30d.size,
      messageCount7d: recentMessages.filter(
        (message) => message.createdAt >= sevenDaysAgo,
      ).length,
      messageCount30d: recentMessages.length,
      requestCount30d: recentUsage.length,
      totalTokens30d: recentUsage.reduce(
        (sum, record) => sum + (record.totalTokens ?? 0),
        0,
      ),
      estimatedCost30d: this.roundCost(
        recentUsage.reduce(
          (sum, record) => sum + (record.estimatedCost ?? 0),
          0,
        ),
      ),
      currency:
        recentUsage[0]?.currency === 'USD' ? 'USD' : ('CNY' as const),
    };
  }

  async listConversations(query: ChatRecordConversationListQuery) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const includeHidden = this.normalizeBoolean(query.includeHidden);
    const page = this.normalizePositiveInteger(query.page, 1);
    const pageSize = Math.min(
      this.normalizePositiveInteger(query.pageSize, DEFAULT_LIST_PAGE_SIZE),
      MAX_LIST_PAGE_SIZE,
    );
    const sortBy = this.normalizeConversationSort(query.sortBy);
    const dateFrom = this.normalizeDate(query.dateFrom);
    const dateTo = this.normalizeDate(query.dateTo);
    const conversations = await this.conversationRepo.find({
      where: {
        ownerId: owner.id,
        type: 'direct',
      },
      order: {
        lastActivityAt: 'DESC',
        updatedAt: 'DESC',
      },
    });
    const directConversations = conversations.filter((conversation) => {
      if (!includeHidden && conversation.isHidden) {
        return false;
      }
      const characterId = this.getDirectConversationCharacterId(conversation);
      if (query.characterId?.trim() && characterId !== query.characterId.trim()) {
        return false;
      }
      const lastActivityAt = conversation.lastActivityAt?.getTime() ?? 0;
      if (dateFrom && lastActivityAt < dateFrom.getTime()) {
        return false;
      }
      if (dateTo && lastActivityAt > dateTo.getTime()) {
        return false;
      }
      return true;
    });

    const listItems = await this.buildConversationListItems(directConversations);
    listItems.sort((left, right) => {
      if (sortBy === 'recentMessageCount30d') {
        return (
          right.recentMessageCount30d - left.recentMessageCount30d ||
          this.compareIsoDate(right.lastActivityAt, left.lastActivityAt)
        );
      }

      if (sortBy === 'storedMessageCount') {
        return (
          right.storedMessageCount - left.storedMessageCount ||
          this.compareIsoDate(right.lastActivityAt, left.lastActivityAt)
        );
      }

      return this.compareIsoDate(right.lastActivityAt, left.lastActivityAt);
    });

    const total = listItems.length;
    const start = Math.max(0, (page - 1) * pageSize);
    const items = listItems.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getConversationDetail(
    conversationId: string,
    query: { includeClearedHistory?: boolean | string },
  ) {
    const conversation = await this.requireOwnedDirectConversation(conversationId);
    const includeClearedHistory = this.normalizeBoolean(
      query.includeClearedHistory,
    );
    const storedMessages = await this.loadStoredMessages(conversation.id);
    const visibleMessages = this.filterVisibleMessages(conversation, storedMessages);
    const activeMessages = includeClearedHistory ? storedMessages : visibleMessages;
    const character = await this.loadConversationCharacter(conversation);

    const conversationItems = await this.buildConversationListItems([conversation], {
      preloadedMessages: new Map([[conversation.id, storedMessages]]),
      preloadedCharacters: character ? [character] : [],
    });
    if (!conversationItems[0]) {
      throw new NotFoundException(`Conversation ${conversationId} could not be built`);
    }
    return {
      conversation: conversationItems[0],
      character: character ? this.toCharacterSummary(character) : null,
      stats: this.buildConversationStats(
        activeMessages,
        visibleMessages.length,
        storedMessages.length,
        includeClearedHistory,
      ),
    };
  }

  async getConversationMessages(
    conversationId: string,
    query: ChatRecordConversationMessagesQuery,
  ): Promise<ChatRecordConversationMessagesPage> {
    const conversation = await this.requireOwnedDirectConversation(conversationId);
    const includeClearedHistory = this.normalizeBoolean(
      query.includeClearedHistory,
    );
    const allMessages = includeClearedHistory
      ? await this.loadStoredMessages(conversation.id)
      : this.filterVisibleMessages(
          conversation,
          await this.loadStoredMessages(conversation.id),
        );
    const aroundMessageId = query.aroundMessageId?.trim();

    if (aroundMessageId) {
      const aroundItems = sliceMessagesAround(
        allMessages,
        aroundMessageId,
        this.normalizeNonNegativeInteger(query.before, 24),
        this.normalizeNonNegativeInteger(query.after, 24),
      );
      if (!aroundItems) {
        throw new NotFoundException(`Message ${aroundMessageId} not found`);
      }

      return {
        items: aroundItems.map((item) => this.toMessageContract(item)),
        total: allMessages.length,
        hasMore: false,
        mode: 'around',
        includeClearedHistory,
        aroundMessageId,
      };
    }

    const limit = Math.min(
      this.normalizePositiveInteger(query.limit, DEFAULT_MESSAGE_PAGE_SIZE),
      MAX_MESSAGE_PAGE_SIZE,
    );
    const consumedNewestCount = this.normalizeNonNegativeInteger(query.cursor, 0);
    const end = Math.max(0, allMessages.length - consumedNewestCount);
    const start = Math.max(0, end - limit);
    const items = allMessages.slice(start, end).map((item) => this.toMessageContract(item));
    const nextCursor =
      start > 0 ? String(consumedNewestCount + items.length) : undefined;

    return {
      items,
      total: allMessages.length,
      nextCursor,
      hasMore: Boolean(nextCursor),
      mode: 'latest',
      includeClearedHistory,
      aroundMessageId: null,
    };
  }

  async searchConversationMessages(
    conversationId: string,
    query: ChatRecordConversationSearchQuery,
  ) {
    const conversation = await this.requireOwnedDirectConversation(conversationId);
    const includeClearedHistory = this.normalizeBoolean(
      query.includeClearedHistory,
    );
    const allMessages = includeClearedHistory
      ? await this.loadStoredMessages(conversation.id)
      : this.filterVisibleMessages(
          conversation,
          await this.loadStoredMessages(conversation.id),
        );
    const result = searchVisibleMessages(
      allMessages.map((message) => this.toSearchableMessage(message)),
      this.toMessageSearchQuery(query),
    );

    return {
      items: result.items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      total: result.total,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getConversationTokenUsage(
    conversationId: string,
  ): Promise<ChatRecordTokenUsageSummary> {
    await this.requireOwnedDirectConversation(conversationId);
    const now = new Date();
    const thirtyDaysAgo = this.daysAgo(30);
    const from = thirtyDaysAgo.toISOString();
    const to = now.toISOString();
    const [allTimeOverview, recent30dOverview, recent30dTrend, recent30dBreakdown, recentRecords] =
      await Promise.all([
        this.usageLedger.getOverview({ conversationId }),
        this.usageLedger.getOverview({ conversationId, from, to }),
        this.usageLedger.getTrend({
          conversationId,
          from,
          to,
          grain: 'day',
        }),
        this.usageLedger.getBreakdown({
          conversationId,
          from,
          to,
          limit: 6,
        }),
        this.usageLedger.getRecords({
          conversationId,
          page: 1,
          pageSize: 8,
        }),
      ]);

    return {
      allTimeOverview,
      recent30dOverview,
      recent30dTrend,
      recent30dBreakdown: {
        byScene: recent30dBreakdown.byScene,
        byModel: recent30dBreakdown.byModel,
        byBillingSource: recent30dBreakdown.byBillingSource,
      },
      recentRecords,
    };
  }

  private async buildConversationListItems(
    conversations: ConversationEntity[],
    options?: {
      preloadedMessages?: Map<string, MessageEntity[]>;
      preloadedCharacters?: CharacterEntity[];
    },
  ): Promise<ChatRecordConversationListItem[]> {
    if (!conversations.length) {
      return [];
    }

    const conversationIds = conversations.map((conversation) => conversation.id);
    const characterIds = Array.from(
      new Set(
        conversations
          .map((conversation) => this.getDirectConversationCharacterId(conversation))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const [storedMessages, characters] = await Promise.all([
      options?.preloadedMessages
        ? Promise.resolve(options.preloadedMessages)
        : this.loadStoredMessagesMap(conversationIds),
      options?.preloadedCharacters
        ? Promise.resolve(options.preloadedCharacters)
        : characterIds.length
          ? this.characterRepo.find({
              where: { id: In(characterIds) },
            })
          : Promise.resolve([]),
    ]);
    const characterMap = new Map(
      characters.map((character) => [character.id, character]),
    );

    return conversations.map((conversation) => {
      const directCharacterId =
        this.getDirectConversationCharacterId(conversation);
      const character = directCharacterId
        ? characterMap.get(directCharacterId) ?? null
        : null;
      const currentStoredMessages = storedMessages.get(conversation.id) ?? [];
      const currentVisibleMessages = this.filterVisibleMessages(
        conversation,
        currentStoredMessages,
      );
      const sevenDaysAgo = this.daysAgo(7).getTime();
      const thirtyDaysAgo = this.daysAgo(30).getTime();
      const recentMessageCount7d = currentStoredMessages.filter(
        (message) => message.createdAt.getTime() >= sevenDaysAgo,
      ).length;
      const recentMessageCount30d = currentStoredMessages.filter(
        (message) => message.createdAt.getTime() >= thirtyDaysAgo,
      ).length;

      return {
        id: conversation.id,
        title: character?.name?.trim() || conversation.title,
        characterId: directCharacterId,
        characterName:
          character?.name?.trim() ||
          conversation.title ||
          directCharacterId ||
          'Unknown',
        characterAvatar: character?.avatar ?? null,
        relationship: character?.relationship ?? null,
        isHidden: conversation.isHidden,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        lastActivityAt: conversation.lastActivityAt?.toISOString() ?? null,
        lastClearedAt: conversation.lastClearedAt?.toISOString() ?? null,
        hasClearedHistory:
          currentStoredMessages.length > currentVisibleMessages.length,
        visibleMessageCount: currentVisibleMessages.length,
        storedMessageCount: currentStoredMessages.length,
        recentMessageCount7d,
        recentMessageCount30d,
        lastVisibleMessage: currentVisibleMessages.length
          ? this.toMessageContract(
              currentVisibleMessages[currentVisibleMessages.length - 1],
            )
          : null,
        lastStoredMessage: currentStoredMessages.length
          ? this.toMessageContract(
              currentStoredMessages[currentStoredMessages.length - 1],
            )
          : null,
      };
    });
  }

  private async requireOwnedDirectConversation(conversationId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const conversation = await this.conversationRepo.findOneBy({
      id: conversationId,
      ownerId: owner.id,
      type: 'direct',
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return conversation;
  }

  private async loadStoredMessagesMap(conversationIds: string[]) {
    if (!conversationIds.length) {
      return new Map<string, MessageEntity[]>();
    }

    const messages = await this.messageRepo.find({
      where: {
        conversationId: In(conversationIds),
      },
      order: {
        createdAt: 'ASC',
      },
    });
    const grouped = new Map<string, MessageEntity[]>();

    for (const message of messages) {
      const current = grouped.get(message.conversationId);
      if (current) {
        current.push(message);
        continue;
      }
      grouped.set(message.conversationId, [message]);
    }

    return grouped;
  }

  private async loadStoredMessages(conversationId: string) {
    return this.messageRepo.find({
      where: {
        conversationId,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  private filterVisibleMessages(
    conversation: Pick<ConversationEntity, 'lastClearedAt'>,
    messages: MessageEntity[],
  ) {
    if (!conversation.lastClearedAt) {
      return messages;
    }

    const cutoff = conversation.lastClearedAt.getTime();
    return messages.filter((message) => message.createdAt.getTime() > cutoff);
  }

  private async loadConversationCharacter(conversation: ConversationEntity) {
    const characterId = this.getDirectConversationCharacterId(conversation);
    if (!characterId) {
      return null;
    }

    return this.characterRepo.findOneBy({ id: characterId });
  }

  private getDirectConversationCharacterId(
    conversation: Pick<ConversationEntity, 'participants'>,
  ) {
    const normalizedIds = (conversation.participants ?? [])
      .map((participantId) => participantId.trim())
      .filter(Boolean);
    return normalizedIds.length ? normalizedIds[0] : null;
  }

  private buildConversationStats(
    messages: MessageEntity[],
    visibleMessageCount: number,
    storedMessageCount: number,
    includeClearedHistory: boolean,
  ): ChatRecordConversationStats {
    const sevenDaysAgo = this.daysAgo(7).getTime();
    const thirtyDaysAgo = this.daysAgo(30).getTime();
    const firstResponseDurations: number[] = [];
    let latestUserMessageAt: Date | null = null;

    for (const message of messages) {
      if (message.senderType === 'user') {
        latestUserMessageAt = message.createdAt;
        continue;
      }

      if (
        latestUserMessageAt &&
        message.senderType === 'character'
      ) {
        firstResponseDurations.push(
          Math.max(0, message.createdAt.getTime() - latestUserMessageAt.getTime()),
        );
        latestUserMessageAt = null;
      }
    }

    const sortedDurations = [...firstResponseDurations].sort((left, right) => left - right);
    const attachmentMessageCount = messages.filter((message) =>
      this.isAttachmentLikeMessage(message),
    ).length;

    return {
      includeClearedHistory,
      messageCount: messages.length,
      visibleMessageCount,
      storedMessageCount,
      userMessageCount: messages.filter((message) => message.senderType === 'user').length,
      characterMessageCount: messages.filter(
        (message) => message.senderType === 'character',
      ).length,
      proactiveMessageCount: messages.filter(
        (message) => message.type === 'proactive',
      ).length,
      attachmentMessageCount,
      systemMessageCount: messages.filter((message) => message.type === 'system').length,
      recentMessageCount7d: messages.filter(
        (message) => message.createdAt.getTime() >= sevenDaysAgo,
      ).length,
      recentMessageCount30d: messages.filter(
        (message) => message.createdAt.getTime() >= thirtyDaysAgo,
      ).length,
      firstResponseAverageMs: firstResponseDurations.length
        ? Math.round(
            firstResponseDurations.reduce((sum, value) => sum + value, 0) /
              firstResponseDurations.length,
          )
        : null,
      firstResponseMedianMs: sortedDurations.length
        ? sortedDurations[Math.floor(sortedDurations.length / 2)]
        : null,
    };
  }

  private isAttachmentLikeMessage(message: Pick<MessageEntity, 'type'>) {
    return (
      message.type !== 'text' &&
      message.type !== 'system' &&
      message.type !== 'proactive'
    );
  }

  private toCharacterSummary(
    character: CharacterEntity,
  ): ChatRecordConversationCharacterSummary {
    return {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      relationship: character.relationship,
      isOnline: character.isOnline,
      currentActivity: character.currentActivity ?? null,
      expertDomains: character.expertDomains ?? [],
      intimacyLevel: character.intimacyLevel,
      lastActiveAt: character.lastActiveAt?.toISOString() ?? null,
    };
  }

  private toMessageContract(entity: MessageEntity): ChatRecordMessage {
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
        | 'voice'
        | 'contact_card'
        | 'location_card'
        | 'note_card',
      text:
        entity.senderType === 'user'
          ? entity.text
          : sanitizeAiText(entity.text),
      attachment: this.parseAttachment(entity),
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private toSearchableMessage(entity: MessageEntity): ChatMessage {
    return {
      id: entity.id,
      conversationId: entity.conversationId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderId: entity.senderId,
      senderName: entity.senderName,
      type: entity.type as ChatMessage['type'],
      text:
        entity.senderType === 'user'
          ? entity.text
          : sanitizeAiText(entity.text),
      attachment: this.parseAttachment(entity),
      createdAt: entity.createdAt,
    };
  }

  private toMessageSearchQuery(
    query: ChatRecordConversationSearchQuery,
  ): MessageSearchQuery {
    return {
      keyword: query.keyword,
      category: query.category,
      messageType: query.messageType,
      senderId: query.senderId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      cursor: query.cursor,
      limit: this.normalizePositiveInteger(query.limit, 50),
    };
  }

  private parseAttachment(entity: MessageEntity): MessageAttachment | undefined {
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

  private normalizeConversationSort(value: string | undefined) {
    if (value === 'recentMessageCount30d' || value === 'storedMessageCount') {
      return value;
    }

    return 'lastActivityAt';
  }

  private normalizeBoolean(value: boolean | string | undefined) {
    return value === true || value === 'true' || value === '1';
  }

  private normalizePositiveInteger(
    value: number | string | undefined,
    fallback: number,
  ) {
    const parsed =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : Number(value);
    return parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private normalizeNonNegativeInteger(
    value: number | string | undefined,
    fallback: number,
  ) {
    const parsed =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : Number(value);
    return parsed >= 0 ? Math.floor(parsed) : fallback;
  }

  private normalizeDate(value: string | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private compareIsoDate(left: string | null, right: string | null) {
    return (Date.parse(left ?? '') || 0) - (Date.parse(right ?? '') || 0);
  }

  private roundCost(value: number) {
    return Math.round(value * 10000) / 10000;
  }

  private daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
