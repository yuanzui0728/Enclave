import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThanOrEqual, Repository } from 'typeorm';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { filterUserFacingConversations } from '../chat/conversation-visibility';
import {
  MediaInsightJobEntity,
  type MediaInsightJobStatus,
  type MediaInsightJobThreadType,
  type MediaInsightKind,
} from '../chat/media-insight-job.entity';
import { AdminConversationReviewEntity } from './admin-conversation-review.entity';
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
  onlyReviewed?: boolean | string;
  dateFrom?: string;
  dateTo?: string;
  activityWindow?: string;
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

type ChatRecordMediaInsightQuery = {
  threadType?: string;
  threadId?: string;
  status?: string;
  kind?: string;
  limit?: number | string;
};

type ChatRecordMessageMediaInsight = {
  jobId: string;
  kind: MediaInsightKind;
  status: MediaInsightJobStatus;
  provider?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt?: string | null;
};

type ChatRecordMessage = Omit<ChatMessage, 'createdAt'> & {
  createdAt: string;
  mediaInsight?: ChatRecordMessageMediaInsight | null;
};

type ChatRecordMediaInsightJobItem = {
  id: string;
  threadType: MediaInsightJobThreadType;
  threadId: string;
  sourceMessageId: string;
  sourceMessageCreatedAt: string;
  insightKind: MediaInsightKind;
  status: MediaInsightJobStatus;
  attemptCount: number;
  source: {
    url: string;
    mimeType: string | null;
    fileName: string | null;
    characterId: string | null;
  };
  result: {
    provider: string | null;
    hasTranscriptText: boolean;
    transcriptTextPreview: string | null;
    hasExtractedText: boolean;
    extractedTextPreview: string | null;
  };
  error: {
    code: string | null;
    message: string | null;
    cancelReason: string | null;
  };
  executeAfter: string;
  lastAttemptAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatRecordMediaInsightListResponse = {
  items: ChatRecordMediaInsightJobItem[];
  total: number;
  limit: number;
  filters: {
    threadType: MediaInsightJobThreadType | null;
    threadId: string | null;
    status: MediaInsightJobStatus | null;
    kind: MediaInsightKind | null;
  };
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
  review?: ChatRecordConversationReview | null;
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

type ChatRecordConversationTrendPoint = {
  date: string;
  totalMessages: number;
  userMessages: number;
  characterMessages: number;
  proactiveMessages: number;
  attachmentMessages: number;
};

type ChatRecordConversationMix = {
  userShare: number;
  characterShare: number;
  proactiveShare: number;
  attachmentShare: number;
  systemShare: number;
};

type ChatRecordConversationInsight = {
  activeDays7d: number;
  activeDays30d: number;
  averageMessagesPerActiveDay30d: number | null;
  lastUserMessageAt: string | null;
  lastCharacterMessageAt: string | null;
  mostActiveWeekday: string | null;
  mix: ChatRecordConversationMix;
  trend7d: ChatRecordConversationTrendPoint[];
  trend30d: ChatRecordConversationTrendPoint[];
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

type ChatRecordConversationReviewStatus =
  | 'backlog'
  | 'watching'
  | 'important'
  | 'resolved';

type ChatRecordConversationReview = {
  conversationId: string;
  status: ChatRecordConversationReviewStatus;
  tags: string[];
  note?: string | null;
  hasNote: boolean;
  createdAt: string;
  updatedAt: string;
};

type ChatRecordExportFormat = 'markdown' | 'json';

type ChatRecordConversationExportQuery = {
  format?: string;
  includeClearedHistory?: boolean | string;
};

type ChatRecordConversationExportPayload = {
  exportedAt: string;
  includeClearedHistory: boolean;
  conversation: ChatRecordConversationListItem;
  character: ChatRecordConversationCharacterSummary | null;
  stats: ChatRecordConversationStats;
  insight: ChatRecordConversationInsight;
  review: ChatRecordConversationReview | null;
  messages: ChatRecordMessage[];
  tokenUsage: ChatRecordTokenUsageSummary;
};

type ChatRecordConversationExportResponse = {
  format: ChatRecordExportFormat;
  fileName: string;
  contentType: string;
  content: string;
  payload: ChatRecordConversationExportPayload;
};

type ChatRecordConversationReviewInput = {
  status?: string;
  tags?: string[];
  note?: string | null;
};

const DEFAULT_LIST_PAGE_SIZE = 24;
const MAX_LIST_PAGE_SIZE = 100;
const DEFAULT_MESSAGE_PAGE_SIZE = 60;
const MAX_MESSAGE_PAGE_SIZE = 200;
const DEFAULT_MEDIA_INSIGHT_PAGE_SIZE = 50;
const MAX_MEDIA_INSIGHT_PAGE_SIZE = 200;

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
    @InjectRepository(AdminConversationReviewEntity)
    private readonly reviewRepo: Repository<AdminConversationReviewEntity>,
    @InjectRepository(MediaInsightJobEntity)
    private readonly mediaInsightJobRepo: Repository<MediaInsightJobEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly usageLedger: AiUsageLedgerService,
  ) {}

  async getOverview() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const conversations = filterUserFacingConversations(
      await this.conversationRepo.find({
        where: {
          ownerId: owner.id,
          type: 'direct',
        },
        order: {
          lastActivityAt: 'DESC',
        },
      }),
    );

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

    const conversationIds = conversations.map(
      (conversation) => conversation.id,
    );
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
      currency: recentUsage[0]?.currency === 'USD' ? 'USD' : ('CNY' as const),
    };
  }

  async listMediaInsights(
    query: ChatRecordMediaInsightQuery,
  ): Promise<ChatRecordMediaInsightListResponse> {
    const limit = Math.min(
      this.normalizePositiveInteger(
        query.limit,
        DEFAULT_MEDIA_INSIGHT_PAGE_SIZE,
      ),
      MAX_MEDIA_INSIGHT_PAGE_SIZE,
    );
    const threadType = this.normalizeMediaInsightThreadType(query.threadType);
    const threadId = query.threadId?.trim() || null;
    const status = this.normalizeMediaInsightStatus(query.status);
    const kind = this.normalizeMediaInsightKind(query.kind);
    const where: FindOptionsWhere<MediaInsightJobEntity> = {};

    if (threadType) {
      where.threadType = threadType;
    }
    if (threadId) {
      where.threadId = threadId;
    }
    if (status) {
      where.status = status;
    }
    if (kind) {
      where.insightKind = kind;
    }

    const [jobs, total] = await this.mediaInsightJobRepo.findAndCount({
      where,
      order: {
        updatedAt: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
    });

    return {
      items: jobs.map((job) => this.toMediaInsightJobContract(job)),
      total,
      limit,
      filters: {
        threadType,
        threadId,
        status,
        kind,
      },
    };
  }

  async listConversations(query: ChatRecordConversationListQuery) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const includeHidden = this.normalizeBoolean(query.includeHidden);
    const onlyReviewed = this.normalizeBoolean(query.onlyReviewed);
    const page = this.normalizePositiveInteger(query.page, 1);
    const pageSize = Math.min(
      this.normalizePositiveInteger(query.pageSize, DEFAULT_LIST_PAGE_SIZE),
      MAX_LIST_PAGE_SIZE,
    );
    const sortBy = this.normalizeConversationSort(query.sortBy);
    const activityWindow = this.normalizeActivityWindow(query.activityWindow);
    const dateFrom = this.normalizeDate(query.dateFrom);
    const dateTo = this.normalizeDate(query.dateTo);
    const conversations = filterUserFacingConversations(
      await this.conversationRepo.find({
        where: {
          ownerId: owner.id,
          type: 'direct',
        },
        order: {
          lastActivityAt: 'DESC',
          updatedAt: 'DESC',
        },
      }),
    );
    const directConversations = conversations.filter((conversation) => {
      if (!includeHidden && conversation.isHidden) {
        return false;
      }
      const characterId = this.getDirectConversationCharacterId(conversation);
      if (
        query.characterId?.trim() &&
        characterId !== query.characterId.trim()
      ) {
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

    const listItems = (
      await this.buildConversationListItems(directConversations, {
        ownerId: owner.id,
      })
    ).filter(
      (item) =>
        this.matchesActivityWindow(item, activityWindow) &&
        (!onlyReviewed || Boolean(item.review)),
    );
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
    const conversation =
      await this.requireOwnedDirectConversation(conversationId);
    const includeClearedHistory = this.normalizeBoolean(
      query.includeClearedHistory,
    );
    const storedMessages = await this.loadStoredMessages(conversation.id);
    const visibleMessages = this.filterVisibleMessages(
      conversation,
      storedMessages,
    );
    const activeMessages = includeClearedHistory
      ? storedMessages
      : visibleMessages;
    const character = await this.loadConversationCharacter(conversation);

    const conversationItems = await this.buildConversationListItems(
      [conversation],
      {
        ownerId: conversation.ownerId,
        preloadedMessages: new Map([[conversation.id, storedMessages]]),
        preloadedCharacters: character ? [character] : [],
      },
    );
    if (!conversationItems[0]) {
      throw new NotFoundException(
        `Conversation ${conversationId} could not be built`,
      );
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
      insight: this.buildConversationInsight(activeMessages),
      review: conversationItems[0].review ?? null,
    };
  }

  async getConversationMessages(
    conversationId: string,
    query: ChatRecordConversationMessagesQuery,
  ): Promise<ChatRecordConversationMessagesPage> {
    const conversation =
      await this.requireOwnedDirectConversation(conversationId);
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
    const consumedNewestCount = this.normalizeNonNegativeInteger(
      query.cursor,
      0,
    );
    const end = Math.max(0, allMessages.length - consumedNewestCount);
    const start = Math.max(0, end - limit);
    const items = allMessages
      .slice(start, end)
      .map((item) => this.toMessageContract(item));
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
    const conversation =
      await this.requireOwnedDirectConversation(conversationId);
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
    const [
      allTimeOverview,
      recent30dOverview,
      recent30dTrend,
      recent30dBreakdown,
      recentRecords,
    ] = await Promise.all([
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

  async upsertConversationReview(
    conversationId: string,
    payload: ChatRecordConversationReviewInput,
  ) {
    const conversation =
      await this.requireOwnedDirectConversation(conversationId);
    const existing = await this.reviewRepo.findOneBy({
      conversationId: conversation.id,
      ownerId: conversation.ownerId,
    });
    const review = this.reviewRepo.create({
      ...(existing ?? {}),
      conversationId: conversation.id,
      ownerId: conversation.ownerId,
      status: this.normalizeReviewStatus(payload.status),
      tags: this.normalizeReviewTags(payload.tags),
      note: this.normalizeReviewNote(payload.note),
    });
    const saved = await this.reviewRepo.save(review);
    return this.toReviewContract(saved);
  }

  async deleteConversationReview(conversationId: string) {
    const conversation =
      await this.requireOwnedDirectConversation(conversationId);
    await this.reviewRepo.delete({
      conversationId: conversation.id,
      ownerId: conversation.ownerId,
    });
    return { success: true };
  }

  async exportConversation(
    conversationId: string,
    query: ChatRecordConversationExportQuery,
  ): Promise<ChatRecordConversationExportResponse> {
    const format = this.normalizeExportFormat(query.format);
    const payload = await this.buildConversationExportPayload(
      conversationId,
      this.normalizeBoolean(query.includeClearedHistory),
    );
    const content =
      format === 'json'
        ? JSON.stringify(payload, null, 2)
        : this.renderConversationMarkdown(payload);
    const extension = format === 'json' ? 'json' : 'md';
    const scopeLabel = payload.includeClearedHistory ? 'full' : 'visible';
    const fileName = `${this.slugifyFileName(payload.conversation.characterName || 'conversation')}-${scopeLabel}-${payload.exportedAt.slice(0, 10)}.${extension}`;

    return {
      format,
      fileName,
      contentType:
        format === 'json'
          ? 'application/json; charset=utf-8'
          : 'text/markdown; charset=utf-8',
      content,
      payload,
    };
  }

  private async buildConversationListItems(
    conversations: ConversationEntity[],
    options?: {
      ownerId?: string;
      preloadedMessages?: Map<string, MessageEntity[]>;
      preloadedCharacters?: CharacterEntity[];
      preloadedReviews?: Map<string, AdminConversationReviewEntity>;
    },
  ): Promise<ChatRecordConversationListItem[]> {
    if (!conversations.length) {
      return [];
    }

    const conversationIds = conversations.map(
      (conversation) => conversation.id,
    );
    const characterIds = Array.from(
      new Set(
        conversations
          .map((conversation) =>
            this.getDirectConversationCharacterId(conversation),
          )
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const ownerId = options?.ownerId ?? conversations[0]?.ownerId;
    const [storedMessages, characters, reviews] = await Promise.all([
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
      options?.preloadedReviews
        ? Promise.resolve(options.preloadedReviews)
        : ownerId
          ? this.loadConversationReviewMap(conversationIds, ownerId)
          : Promise.resolve(new Map<string, AdminConversationReviewEntity>()),
    ]);
    const characterMap = new Map(
      characters.map((character) => [character.id, character]),
    );

    return conversations.map((conversation) => {
      const directCharacterId =
        this.getDirectConversationCharacterId(conversation);
      const character = directCharacterId
        ? (characterMap.get(directCharacterId) ?? null)
        : null;
      const currentStoredMessages = storedMessages.get(conversation.id) ?? [];
      const currentVisibleMessages = this.filterVisibleMessages(
        conversation,
        currentStoredMessages,
      );
      const review = reviews.get(conversation.id) ?? null;
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
        review: review ? this.toReviewContract(review) : null,
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

  private async loadConversationReviewMap(
    conversationIds: string[],
    ownerId: string,
  ) {
    if (!conversationIds.length) {
      return new Map<string, AdminConversationReviewEntity>();
    }

    const reviews = await this.reviewRepo.find({
      where: {
        ownerId,
        conversationId: In(conversationIds),
      },
      order: {
        updatedAt: 'DESC',
      },
    });

    return new Map(reviews.map((review) => [review.conversationId, review]));
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

      if (latestUserMessageAt && message.senderType === 'character') {
        firstResponseDurations.push(
          Math.max(
            0,
            message.createdAt.getTime() - latestUserMessageAt.getTime(),
          ),
        );
        latestUserMessageAt = null;
      }
    }

    const sortedDurations = [...firstResponseDurations].sort(
      (left, right) => left - right,
    );
    const attachmentMessageCount = messages.filter((message) =>
      this.isAttachmentLikeMessage(message),
    ).length;

    return {
      includeClearedHistory,
      messageCount: messages.length,
      visibleMessageCount,
      storedMessageCount,
      userMessageCount: messages.filter(
        (message) => message.senderType === 'user',
      ).length,
      characterMessageCount: messages.filter(
        (message) => message.senderType === 'character',
      ).length,
      proactiveMessageCount: messages.filter(
        (message) => message.type === 'proactive',
      ).length,
      attachmentMessageCount,
      systemMessageCount: messages.filter(
        (message) => message.type === 'system',
      ).length,
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

  private async buildConversationExportPayload(
    conversationId: string,
    includeClearedHistory: boolean,
  ): Promise<ChatRecordConversationExportPayload> {
    const detail = await this.getConversationDetail(conversationId, {
      includeClearedHistory,
    });
    const conversation =
      await this.requireOwnedDirectConversation(conversationId);
    const storedMessages = await this.loadStoredMessages(conversation.id);
    const visibleMessages = this.filterVisibleMessages(
      conversation,
      storedMessages,
    );
    const activeMessages = includeClearedHistory
      ? storedMessages
      : visibleMessages;
    const tokenUsage = await this.getConversationTokenUsage(conversationId);

    return {
      exportedAt: new Date().toISOString(),
      includeClearedHistory,
      conversation: detail.conversation,
      character: detail.character,
      stats: detail.stats,
      insight: detail.insight,
      review: detail.review,
      messages: activeMessages.map((message) =>
        this.toMessageContract(message),
      ),
      tokenUsage,
    };
  }

  private buildConversationInsight(
    messages: MessageEntity[],
  ): ChatRecordConversationInsight {
    const trend7d = this.buildTrendPoints(messages, 7);
    const trend30d = this.buildTrendPoints(messages, 30);
    const totalMessages = messages.length;
    const userMessages = messages.filter(
      (message) => message.senderType === 'user',
    ).length;
    const characterMessages = messages.filter(
      (message) => message.senderType === 'character',
    ).length;
    const proactiveMessages = messages.filter(
      (message) => message.type === 'proactive',
    ).length;
    const attachmentMessages = messages.filter((message) =>
      this.isAttachmentLikeMessage(message),
    ).length;
    const systemMessages = messages.filter(
      (message) => message.type === 'system',
    ).length;
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.senderType === 'user');
    const lastCharacterMessage = [...messages]
      .reverse()
      .find((message) => message.senderType === 'character');
    const activeDays7d = trend7d.filter(
      (item) => item.totalMessages > 0,
    ).length;
    const activeDays30d = trend30d.filter(
      (item) => item.totalMessages > 0,
    ).length;
    const weekdayLabel = this.resolveMostActiveWeekday(messages);

    return {
      activeDays7d,
      activeDays30d,
      averageMessagesPerActiveDay30d: activeDays30d
        ? Math.round(
            (trend30d.reduce((sum, item) => sum + item.totalMessages, 0) /
              activeDays30d) *
              10,
          ) / 10
        : null,
      lastUserMessageAt: lastUserMessage?.createdAt.toISOString() ?? null,
      lastCharacterMessageAt:
        lastCharacterMessage?.createdAt.toISOString() ?? null,
      mostActiveWeekday: weekdayLabel,
      mix: {
        userShare: this.calculateShare(userMessages, totalMessages),
        characterShare: this.calculateShare(characterMessages, totalMessages),
        proactiveShare: this.calculateShare(proactiveMessages, totalMessages),
        attachmentShare: this.calculateShare(attachmentMessages, totalMessages),
        systemShare: this.calculateShare(systemMessages, totalMessages),
      },
      trend7d,
      trend30d,
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

  private toReviewContract(
    review: AdminConversationReviewEntity,
  ): ChatRecordConversationReview {
    const note = this.normalizeReviewNote(review.note);
    return {
      conversationId: review.conversationId,
      status: this.normalizeReviewStatus(review.status),
      tags: this.normalizeReviewTags(review.tags ?? []),
      note,
      hasNote: Boolean(note),
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  private toMessageContract(entity: MessageEntity): ChatRecordMessage {
    const attachment = this.parseAttachment(entity);

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
      attachment,
      mediaInsight: this.toMessageMediaInsight(attachment),
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private toMediaInsightJobContract(
    job: MediaInsightJobEntity,
  ): ChatRecordMediaInsightJobItem {
    const resultPayload = this.parseMediaInsightResultPayload(job);
    const transcriptText = this.getStringRecordValue(
      resultPayload,
      'transcriptText',
    );
    const extractedText = this.getStringRecordValue(
      resultPayload,
      'extractedText',
    );
    const provider =
      job.resultProvider?.trim() ||
      this.getStringRecordValue(resultPayload, 'provider') ||
      null;

    return {
      id: job.id,
      threadType: job.threadType,
      threadId: job.threadId,
      sourceMessageId: job.sourceMessageId,
      sourceMessageCreatedAt: job.sourceMessageCreatedAt.toISOString(),
      insightKind: job.insightKind,
      status: job.status,
      attemptCount: job.attemptCount,
      source: {
        url: job.sourceUrl,
        mimeType: job.mimeType ?? null,
        fileName: job.fileName ?? null,
        characterId: job.characterId ?? null,
      },
      result: {
        provider,
        hasTranscriptText: Boolean(transcriptText?.trim()),
        transcriptTextPreview: this.truncateInsightPreview(transcriptText),
        hasExtractedText: Boolean(extractedText?.trim()),
        extractedTextPreview: this.truncateInsightPreview(extractedText),
      },
      error: {
        code: job.errorCode ?? null,
        message: job.errorMessage ?? null,
        cancelReason: job.cancelReason ?? null,
      },
      executeAfter: job.executeAfter.toISOString(),
      lastAttemptAt: job.lastAttemptAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      cancelledAt: job.cancelledAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private toMessageMediaInsight(
    attachment: MessageAttachment | undefined,
  ): ChatRecordMessageMediaInsight | null {
    if (
      !attachment ||
      (attachment.kind !== 'file' && attachment.kind !== 'voice') ||
      !attachment.insight
    ) {
      return null;
    }

    return {
      jobId: attachment.insight.jobId,
      kind: attachment.insight.kind,
      status: attachment.insight.status,
      provider: attachment.insight.provider ?? null,
      errorCode: attachment.insight.errorCode ?? null,
      errorMessage: attachment.insight.errorMessage ?? null,
      updatedAt: attachment.insight.updatedAt ?? null,
    };
  }

  private parseMediaInsightResultPayload(
    job: Pick<MediaInsightJobEntity, 'resultPayload'>,
  ): Record<string, unknown> {
    if (!job.resultPayload) {
      return {};
    }

    try {
      const parsed = JSON.parse(job.resultPayload) as unknown;
      return this.isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private getStringRecordValue(
    value: Record<string, unknown>,
    key: string,
  ): string | null {
    const fieldValue = value[key];
    return typeof fieldValue === 'string' ? fieldValue : null;
  }

  private truncateInsightPreview(value: string | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

  private normalizeConversationSort(value: string | undefined) {
    if (value === 'recentMessageCount30d' || value === 'storedMessageCount') {
      return value;
    }

    return 'lastActivityAt';
  }

  private normalizeReviewStatus(
    value: string | undefined | null,
  ): ChatRecordConversationReviewStatus {
    if (value === 'watching' || value === 'important' || value === 'resolved') {
      return value;
    }

    return 'backlog';
  }

  private normalizeReviewTags(value: string[] | undefined | null) {
    return (value ?? [])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  private normalizeReviewNote(value: string | undefined | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, 4000) : null;
  }

  private normalizeActivityWindow(value: string | undefined) {
    if (value === '7d' || value === '30d') {
      return value;
    }

    return 'all';
  }

  private normalizeMediaInsightThreadType(
    value: string | undefined,
  ): MediaInsightJobThreadType | null {
    if (value === 'conversation' || value === 'group') {
      return value;
    }

    return null;
  }

  private normalizeMediaInsightStatus(
    value: string | undefined,
  ): MediaInsightJobStatus | null {
    if (
      value === 'pending' ||
      value === 'processing' ||
      value === 'completed' ||
      value === 'cancelled' ||
      value === 'failed'
    ) {
      return value;
    }

    return null;
  }

  private normalizeMediaInsightKind(
    value: string | undefined,
  ): MediaInsightKind | null {
    if (
      value === 'audio_transcription' ||
      value === 'video_transcription' ||
      value === 'document_text_extraction'
    ) {
      return value;
    }

    return null;
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

  private matchesActivityWindow(
    item: Pick<
      ChatRecordConversationListItem,
      'recentMessageCount7d' | 'recentMessageCount30d'
    >,
    activityWindow: 'all' | '7d' | '30d',
  ) {
    if (activityWindow === '7d') {
      return item.recentMessageCount7d > 0;
    }

    if (activityWindow === '30d') {
      return item.recentMessageCount30d > 0;
    }

    return true;
  }

  private buildTrendPoints(
    messages: MessageEntity[],
    days: number,
  ): ChatRecordConversationTrendPoint[] {
    const startDate = this.startOfLocalDay(this.daysAgo(days - 1));
    const buckets = new Map<string, ChatRecordConversationTrendPoint>();

    for (let offset = 0; offset < days; offset += 1) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + offset);
      const key = this.formatLocalDayKey(currentDate);
      buckets.set(key, {
        date: key,
        totalMessages: 0,
        userMessages: 0,
        characterMessages: 0,
        proactiveMessages: 0,
        attachmentMessages: 0,
      });
    }

    for (const message of messages) {
      const key = this.formatLocalDayKey(message.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) {
        continue;
      }

      bucket.totalMessages += 1;
      if (message.senderType === 'user') {
        bucket.userMessages += 1;
      }
      if (message.senderType === 'character') {
        bucket.characterMessages += 1;
      }
      if (message.type === 'proactive') {
        bucket.proactiveMessages += 1;
      }
      if (this.isAttachmentLikeMessage(message)) {
        bucket.attachmentMessages += 1;
      }
    }

    return Array.from(buckets.values());
  }

  private resolveMostActiveWeekday(messages: MessageEntity[]) {
    if (!messages.length) {
      return null;
    }

    const weekdayCounts = new Map<number, number>();
    const lastThirtyDays = this.daysAgo(30).getTime();

    for (const message of messages) {
      if (message.createdAt.getTime() < lastThirtyDays) {
        continue;
      }
      const weekday = message.createdAt.getDay();
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
    }

    if (!weekdayCounts.size) {
      return null;
    }

    const [weekdayIndex] = [...weekdayCounts.entries()].sort((left, right) => {
      return right[1] - left[1] || left[0] - right[0];
    })[0];

    return (
      ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][weekdayIndex] ??
      null
    );
  }

  private calculateShare(count: number, total: number) {
    if (!total) {
      return 0;
    }

    return Math.round((count / total) * 1000) / 1000;
  }

  private startOfLocalDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private formatLocalDayKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeExportFormat(
    value: string | undefined,
  ): ChatRecordExportFormat {
    return value === 'json' ? 'json' : 'markdown';
  }

  private renderConversationMarkdown(
    payload: ChatRecordConversationExportPayload,
  ) {
    const header = [
      `# 聊天记录导出：${payload.conversation.characterName}`,
      '',
      `- 导出时间：${payload.exportedAt}`,
      `- 会话 ID：${payload.conversation.id}`,
      `- 导出口径：${payload.includeClearedHistory ? '包含清空前历史' : '仅当前可见历史'}`,
      `- 最后活跃：${payload.conversation.lastActivityAt ?? '暂无'}`,
      `- 最后清空：${payload.conversation.lastClearedAt ?? '未清空'}`,
      '',
      '## 会话概览',
      '',
      `- 当前口径消息数：${payload.stats.messageCount}`,
      `- 用户消息数：${payload.stats.userMessageCount}`,
      `- 角色消息数：${payload.stats.characterMessageCount}`,
      `- 主动消息数：${payload.stats.proactiveMessageCount}`,
      `- 附件消息数：${payload.stats.attachmentMessageCount}`,
      `- 近 7 天活跃天数：${payload.insight.activeDays7d}`,
      `- 近 30 天活跃天数：${payload.insight.activeDays30d}`,
      `- 活跃日均消息：${payload.insight.averageMessagesPerActiveDay30d ?? '暂无'}`,
      `- 高峰工作日：${payload.insight.mostActiveWeekday ?? '暂无'}`,
      '',
      '## 复盘池',
      '',
      `- 标记状态：${payload.review?.status ?? '未标记'}`,
      `- 标签：${payload.review?.tags.join('、') || '暂无'}`,
      `- 备注：${payload.review?.note ?? '暂无'}`,
      '',
      '## Token 成本',
      '',
      `- 累计请求：${payload.tokenUsage.allTimeOverview.requestCount}`,
      `- 累计 Token：${payload.tokenUsage.allTimeOverview.totalTokens}`,
      `- 累计成本：${payload.tokenUsage.allTimeOverview.estimatedCost} ${payload.tokenUsage.allTimeOverview.currency}`,
      `- 近 30 天成本：${payload.tokenUsage.recent30dOverview.estimatedCost} ${payload.tokenUsage.recent30dOverview.currency}`,
      '',
      '### 近 30 天主要模型',
      ...this.renderBreakdownLines(
        payload.tokenUsage.recent30dBreakdown.byModel,
      ),
      '',
      '### 近 30 天主要场景',
      ...this.renderBreakdownLines(
        payload.tokenUsage.recent30dBreakdown.byScene,
      ),
      '',
      '## 对话正文',
      '',
    ];

    const transcript = payload.messages.flatMap((message, index) => {
      const blocks = [
        `### ${index + 1}. ${message.senderName} · ${message.senderType} · ${message.type}`,
        `- 时间：${message.createdAt}`,
      ];

      if (message.attachment) {
        blocks.push(`- 附件：${this.describeAttachment(message)}`);
      }

      blocks.push('');
      blocks.push(this.quoteMarkdownText(message.text?.trim() || '空消息'));
      blocks.push('');

      return blocks;
    });

    return [...header, ...transcript].join('\n');
  }

  private renderBreakdownLines(
    items: Array<{
      label: string;
      requestCount: number;
      totalTokens: number;
      estimatedCost: number;
    }>,
  ) {
    if (!items.length) {
      return ['- 暂无'];
    }

    return items
      .slice(0, 5)
      .map(
        (item) =>
          `- ${item.label}：请求 ${item.requestCount}，Token ${item.totalTokens}，成本 ${item.estimatedCost}`,
      );
  }

  private quoteMarkdownText(text: string) {
    return text
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join('\n');
  }

  private describeAttachment(
    message: Pick<ChatRecordMessage, 'attachment' | 'type'>,
  ) {
    const attachment = message.attachment;
    if (!attachment) {
      return '无';
    }

    if (
      attachment.kind === 'image' ||
      attachment.kind === 'file' ||
      attachment.kind === 'voice'
    ) {
      return `${message.type} · ${attachment.fileName}`;
    }

    if (attachment.kind === 'sticker') {
      return `sticker · ${attachment.label ?? attachment.stickerId}`;
    }

    if (attachment.kind === 'contact_card') {
      return `contact_card · ${attachment.name}`;
    }

    if (attachment.kind === 'location_card') {
      return `location_card · ${attachment.title}`;
    }

    return `note_card · ${attachment.title}`;
  }

  private slugifyFileName(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'conversation';
  }

  private roundCost(value: number) {
    return Math.round(value * 10000) / 10000;
  }

  private daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
