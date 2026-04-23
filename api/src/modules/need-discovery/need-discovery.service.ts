import { createHash, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  type CharacterBlueprintRecipeValue,
  type CharacterBlueprintSourceTypeValue,
} from '../characters/character-blueprint.types';
import { CharacterBlueprintService } from '../characters/character-blueprint.service';
import { CharacterEntity } from '../characters/character.entity';
import { CharactersService } from '../characters/characters.service';
import { ConversationEntity } from '../chat/conversation.entity';
import { filterUserFacingConversations } from '../chat/conversation-visibility';
import { FavoritesService } from '../chat/favorites.service';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { MessageEntity } from '../chat/message.entity';
import { SearchActivityService } from '../chat/search-activity.service';
import { SELF_CHARACTER_ID } from '../characters/default-characters';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { CyberAvatarRealWorldBriefEntity } from '../cyber-avatar/cyber-avatar-real-world-brief.entity';
import { CyberAvatarRealWorldItemEntity } from '../cyber-avatar/cyber-avatar-real-world-item.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { SocialService } from '../social/social.service';
import { NeedDiscoveryCandidateEntity } from './need-discovery-candidate.entity';
import { NeedDiscoveryConfigService } from './need-discovery-config.service';
import { NeedDiscoveryRunEntity } from './need-discovery-run.entity';
import type {
  NeedDiscoveryAnalysisDraft,
  NeedDiscoveryCadenceType,
  NeedDiscoveryCandidateRecord,
  NeedDiscoveryConfig,
  NeedDiscoveryGeneratedCharacterDraft,
  NeedDiscoveryNeedDraft,
  NeedDiscoveryOverview,
  NeedDiscoveryRunRequest,
  NeedDiscoveryRunRecord,
  NeedDiscoverySignalEntry,
  NeedDiscoverySignalSnapshot,
  NeedDiscoveryStats,
} from './need-discovery.types';

const ACTIVE_FRIEND_STATUSES = ['friend', 'close', 'best'] as const;
const ACTIVE_CANDIDATE_STATUSES = ['draft', 'friend_request_pending'] as const;
const CLOSED_CANDIDATE_STATUSES = ['declined', 'expired', 'deleted'] as const;

@Injectable()
export class NeedDiscoveryService {
  private readonly logger = new Logger(NeedDiscoveryService.name);

  constructor(
    @InjectRepository(NeedDiscoveryRunEntity)
    private readonly runRepo: Repository<NeedDiscoveryRunEntity>,
    @InjectRepository(NeedDiscoveryCandidateEntity)
    private readonly candidateRepo: Repository<NeedDiscoveryCandidateEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly groupMemberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupMessageEntity)
    private readonly groupMessageRepo: Repository<GroupMessageEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(CyberAvatarRealWorldItemEntity)
    private readonly cyberAvatarRealWorldItemRepo: Repository<CyberAvatarRealWorldItemEntity>,
    @InjectRepository(CyberAvatarRealWorldBriefEntity)
    private readonly cyberAvatarRealWorldBriefRepo: Repository<CyberAvatarRealWorldBriefEntity>,
    @InjectRepository(MomentPostEntity)
    private readonly momentPostRepo: Repository<MomentPostEntity>,
    @InjectRepository(MomentCommentEntity)
    private readonly momentCommentRepo: Repository<MomentCommentEntity>,
    @InjectRepository(MomentLikeEntity)
    private readonly momentLikeRepo: Repository<MomentLikeEntity>,
    @InjectRepository(FeedPostEntity)
    private readonly feedPostRepo: Repository<FeedPostEntity>,
    @InjectRepository(FeedCommentEntity)
    private readonly feedCommentRepo: Repository<FeedCommentEntity>,
    @InjectRepository(UserFeedInteractionEntity)
    private readonly feedInteractionRepo: Repository<UserFeedInteractionEntity>,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly configService: NeedDiscoveryConfigService,
    private readonly socialService: SocialService,
    private readonly characterBlueprintService: CharacterBlueprintService,
    private readonly charactersService: CharactersService,
    private readonly favoritesService: FavoritesService,
    private readonly searchActivityService: SearchActivityService,
    private readonly cyberAvatar: CyberAvatarService,
  ) {}

  async getOverview(): Promise<NeedDiscoveryOverview> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const [config, recentRuns, activeCandidates, recentCandidates, stats] =
      await Promise.all([
        this.configService.getConfig(),
        this.runRepo.find({
          order: { startedAt: 'DESC', createdAt: 'DESC' },
          take: 20,
        }),
        this.candidateRepo.find({
          where: { status: In([...ACTIVE_CANDIDATE_STATUSES]) },
          order: { createdAt: 'DESC', updatedAt: 'DESC' },
          take: 12,
        }),
        this.candidateRepo.find({
          order: { createdAt: 'DESC', updatedAt: 'DESC' },
          take: 20,
        }),
        this.buildStats(owner.id),
      ]);

    return {
      config,
      stats,
      recentRuns: recentRuns.map((item) => this.toRunRecord(item)),
      activeCandidates: activeCandidates.map((item) =>
        this.toCandidateRecord(item),
      ),
      recentCandidates: recentCandidates.map((item) =>
        this.toCandidateRecord(item),
      ),
    };
  }

  async setConfig(
    patch: Partial<NeedDiscoveryConfig>,
  ): Promise<NeedDiscoveryConfig> {
    return this.configService.setConfig(patch);
  }

  async runShortIntervalDiscovery(options?: { force?: boolean }) {
    return this.runCadence({
      cadenceType: 'short_interval',
      force: options?.force,
    });
  }

  async runDailyDiscovery(options?: { force?: boolean }) {
    return this.runCadence({
      cadenceType: 'daily',
      force: options?.force,
    });
  }

  private async runCadence(input: NeedDiscoveryRunRequest) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const config = await this.configService.getConfig();
    const cadenceConfig =
      input.cadenceType === 'short_interval'
        ? config.shortInterval
        : config.daily;
    const now = new Date();
    const windowStartedAt =
      input.cadenceType === 'short_interval'
        ? new Date(
            now.getTime() - config.shortInterval.lookbackHours * 60 * 60 * 1000,
          )
        : new Date(
            now.getTime() - config.daily.lookbackDays * 24 * 60 * 60 * 1000,
          );
    const run = await this.runRepo.save(
      this.runRepo.create({
        cadenceType: input.cadenceType,
        status: 'skipped',
        startedAt: now,
        windowStartedAt,
        windowEndedAt: now,
        signalCount: 0,
        selectedNeedKeys: [],
      }),
    );

    try {
      const lastSuccess = await this.runRepo.findOne({
        where: {
          cadenceType: input.cadenceType,
          status: 'success',
        },
        order: { startedAt: 'DESC', createdAt: 'DESC' },
      });

      if (!input.force && cadenceConfig.enabled === false) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '当前节奏已在后台停用。',
          summary: '需求发现这会儿关着，这轮先不跑。',
        });
      }

      if (
        !input.force &&
        !this.isRunDue(input.cadenceType, config, now, lastSuccess)
      ) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '尚未达到当前节奏的下一次执行窗口。',
          summary: '还没到这轮执行时间，先跳过。',
        });
      }

      const signalSnapshot = await this.collectSignals(
        owner.id,
        windowStartedAt,
        now,
      );
      run.signalCount = signalSnapshot.signalCount;
      run.latestSignalAt = signalSnapshot.latestSignalAt ?? null;
      await this.runRepo.save(run);

      if (
        !input.force &&
        input.cadenceType === 'short_interval' &&
        config.shortInterval.skipIfNoNewSignals &&
        (!signalSnapshot.latestSignalAt ||
          (lastSuccess?.finishedAt &&
            signalSnapshot.latestSignalAt <= lastSuccess.finishedAt))
      ) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '没有检测到比上次成功执行更新的交互信号。',
          summary: '没有比上次更新的信号，这轮先不动。',
        });
      }

      if (signalSnapshot.signalCount === 0) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '当前窗口没有可分析的交互数据。',
          summary: '这轮没有够用的交互数据，先跳过。',
        });
      }

      const pendingCount = await this.candidateRepo.count({
        where: { status: In([...ACTIVE_CANDIDATE_STATUSES]) },
      });
      if (pendingCount >= config.shared.pendingCandidateLimit) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '待处理候选已达到上限。',
          summary: `现在还有 ${pendingCount} 个候选没处理，这轮先不继续生新角色。`,
        });
      }

      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const todayCreatedCount = await this.candidateRepo.count({
        where: { createdAt: MoreThanOrEqual(startOfDay) },
      });
      if (
        !input.force &&
        todayCreatedCount >= config.shared.dailyCreationLimit
      ) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '当日生成额度已用完。',
          summary: `今天已经新建了 ${todayCreatedCount} 个候选，这轮先收住。`,
        });
      }

      const analysis = await this.analyzeNeeds(
        input.cadenceType,
        config,
        signalSnapshot,
        windowStartedAt,
        now,
      );
      const selectedNeeds = await this.filterNeeds(
        analysis.needs,
        config,
        owner.id,
        now,
        cadenceConfig.maxCandidatesPerRun,
        cadenceConfig.minConfidenceScore,
      );
      run.selectedNeedKeys = selectedNeeds.map((item) => item.needKey);

      if (!selectedNeeds.length) {
        return this.finishRun(run, {
          status: 'success',
          summary:
            analysis.summary.trim() || '这轮看完了，没发现值得补的新角色位。',
        });
      }

      let draftCount = 0;
      let createdCount = 0;
      let requestCount = 0;

      for (const need of selectedNeeds) {
        const candidate = await this.candidateRepo.save(
          this.candidateRepo.create({
            runId: run.id,
            cadenceType: input.cadenceType,
            status: 'draft',
            needKey: need.needKey,
            needCategory: need.needCategory,
            priorityScore: need.priorityScore,
            confidenceScore: need.confidenceScore,
            coverageGapSummary: need.coverageGapSummary,
            evidenceHighlights: need.evidenceHighlights,
            requestedDomains: need.expertDomains,
            roleBrief: need.roleBrief,
            generationContext: {
              relationshipLabel: need.relationshipLabel,
              relationshipType: need.relationshipType,
            },
          }),
        );
        draftCount += 1;

        if (cadenceConfig.executionMode === 'dry_run') {
          continue;
        }

        try {
          const generatedDraft = await this.generateCharacterDraft(
            input.cadenceType,
            config,
            need,
            signalSnapshot.cyberAvatarSummary,
          );
          const character = await this.createNeedGeneratedCharacter(
            candidate,
            need,
            generatedDraft,
          );
          createdCount += 1;

          const expiresAt = addDays(now, config.shared.expiryDays);
          const request = await this.socialService.sendFriendRequest(
            character.id,
            generatedDraft.greeting || buildDefaultGreeting(character.name),
            {
              initiator: 'character',
              triggerScene: `need_discovery_${input.cadenceType}`,
              expiresAt,
            },
          );

          candidate.status = 'friend_request_pending';
          candidate.characterId = character.id;
          candidate.characterName = character.name;
          candidate.friendRequestId = request.id;
          candidate.friendRequestGreeting = request.greeting ?? null;
          candidate.expiresAt = expiresAt;
          await this.candidateRepo.save(candidate);
          requestCount += 1;
        } catch (error) {
          candidate.status = 'generation_failed';
          candidate.errorMessage =
            error instanceof Error ? error.message : String(error);
          await this.candidateRepo.save(candidate);
          this.logger.warn('Failed to generate need-discovery character', {
            needKey: candidate.needKey,
            error: candidate.errorMessage,
          });
        }
      }

      return this.finishRun(run, {
        status: 'success',
        summary:
          cadenceConfig.executionMode === 'dry_run'
            ? `这轮先跑了 ${draftCount} 个草稿候选，当前还是 Dry Run，没有真的往下发。`
            : `这轮识别出 ${draftCount} 个需求候选，落了 ${createdCount} 个角色，发出 ${requestCount} 条好友申请。`,
      });
    } catch (error) {
      return this.finishRun(run, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        summary:
          error instanceof Error
            ? `这轮需求发现没跑完：${error.message}`
            : '这轮需求发现跑失败了。',
      });
    }
  }

  private async collectSignals(
    ownerId: string,
    windowStartedAt: Date,
    windowEndedAt: Date,
  ): Promise<NeedDiscoverySignalSnapshot> {
    const entries: NeedDiscoverySignalEntry[] = [];
    const [
      storedConversations,
      userGroupMemberships,
      favoriteNotes,
      searchHistory,
    ] = await Promise.all([
      this.conversationRepo.find({
        where: {
          ownerId,
          type: 'direct',
          lastActivityAt: MoreThanOrEqual(windowStartedAt),
        },
        order: { lastActivityAt: 'DESC' },
        take: 10,
      }),
      this.groupMemberRepo.find({
        where: {
          memberId: ownerId,
          memberType: 'user',
        },
      }),
      this.favoritesService.listFavoriteNotes(),
      this.searchActivityService.listSearchHistory(),
    ]);
    const conversations = filterUserFacingConversations(storedConversations);
    const conversationIds = conversations.map((item) => item.id);
    const conversationMap = new Map(
      conversations.map((item) => [item.id, item] as const),
    );
    const characterIds = conversations
      .flatMap((item) => item.participants ?? [])
      .filter(Boolean);
    const userGroupIds = [
      ...new Set(userGroupMemberships.map((item) => item.groupId)),
    ];
    const [characters, activeGroups] = await Promise.all([
      characterIds.length
        ? this.characterRepo.find({ where: { id: In(characterIds) } })
        : Promise.resolve([] as CharacterEntity[]),
      userGroupIds.length
        ? this.groupRepo.find({
            where: {
              id: In(userGroupIds),
              lastActivityAt: MoreThanOrEqual(windowStartedAt),
            },
            order: { lastActivityAt: 'DESC' },
            take: 8,
          })
        : Promise.resolve([] as GroupEntity[]),
    ]);
    const characterMap = new Map(
      characters.map((item) => [item.id, item.name]),
    );
    const groupMap = new Map(activeGroups.map((item) => [item.id, item.name]));

    if (conversationIds.length > 0) {
      const messages = await this.messageRepo.find({
        where: {
          conversationId: In(conversationIds),
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 40,
      });

      messages
        .filter(
          (message) =>
            message.senderType === 'user' || message.senderType === 'character',
        )
        .forEach((message) => {
          const conversation = conversationMap.get(message.conversationId);
          const counterpartId = conversation?.participants?.[0] ?? '';
          const isSelfConversation = counterpartId === SELF_CHARACTER_ID;
          const counterpartName = isSelfConversation
            ? '自己'
            : (characterMap.get(counterpartId) ??
              message.senderName ??
              '联系人');
          entries.push({
            timestamp: message.createdAt,
            text: `[${isSelfConversation ? '和自己聊天' : '聊天'}][${formatTimestamp(
              message.createdAt,
            )}][${counterpartName}] ${
              message.senderType === 'user' ? '用户' : counterpartName
            }：${truncateText(message.text, 120)}`,
          });
        });
    }

    const activeGroupIds = activeGroups.map((item) => item.id);
    const [
      groupMessages,
      momentPosts,
      momentComments,
      momentLikes,
      feedPosts,
      feedComments,
      feedInteractions,
      realWorldItems,
      realWorldBriefs,
    ] = await Promise.all([
      activeGroupIds.length
        ? this.groupMessageRepo.find({
            where: {
              groupId: In(activeGroupIds),
              createdAt: Between(windowStartedAt, windowEndedAt),
            },
            order: { createdAt: 'DESC' },
            take: 32,
          })
        : Promise.resolve([] as GroupMessageEntity[]),
      this.momentPostRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          postedAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { postedAt: 'DESC' },
        take: 8,
      }),
      this.momentCommentRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 8,
      }),
      this.momentLikeRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.feedPostRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 8,
      }),
      this.feedCommentRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 8,
      }),
      this.feedInteractionRepo.find({
        where: {
          ownerId,
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 12,
      }),
      this.cyberAvatarRealWorldItemRepo.find({
        where: {
          ownerId,
          status: 'accepted',
          capturedAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { capturedAt: 'DESC', createdAt: 'DESC' },
        take: 10,
      }),
      this.cyberAvatarRealWorldBriefRepo.find({
        where: {
          ownerId,
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC', updatedAt: 'DESC' },
        take: 6,
      }),
    ]);

    groupMessages
      .filter(
        (message) =>
          message.senderType === 'user' || message.senderType === 'character',
      )
      .forEach((message) => {
        entries.push({
          timestamp: message.createdAt,
          text: `[群聊][${formatTimestamp(message.createdAt)}][${
            groupMap.get(message.groupId) ?? '群聊'
          }] ${message.senderType === 'user' ? '用户' : message.senderName}：${truncateText(
            message.text,
            120,
          )}`,
        });
      });

    momentPosts.forEach((post) => {
      entries.push({
        timestamp: post.postedAt,
        text: `[朋友圈发布][${formatTimestamp(post.postedAt)}] ${truncateText(
          post.text ||
            describeMomentContent(post.contentType, post.mediaPayload),
          120,
        )}`,
      });
    });
    momentComments.forEach((comment) => {
      entries.push({
        timestamp: comment.createdAt,
        text: `[朋友圈评论][${formatTimestamp(comment.createdAt)}] ${truncateText(
          comment.text,
          120,
        )}`,
      });
    });

    if (momentLikes.length > 0) {
      const likedPostIds = [...new Set(momentLikes.map((item) => item.postId))];
      const likedPostMap = new Map(
        (likedPostIds.length
          ? await this.momentPostRepo.find({
              where: { id: In(likedPostIds) },
            })
          : []
        ).map((item) => [item.id, item]),
      );
      momentLikes.forEach((like) => {
        const post = likedPostMap.get(like.postId);
        const postOwner = post?.authorName?.trim() || '某人';
        const postText = truncateText(
          post?.text ||
            describeMomentContent(post?.contentType, post?.mediaPayload),
          80,
        );
        entries.push({
          timestamp: like.createdAt,
          text: `[朋友圈点赞][${formatTimestamp(
            like.createdAt,
          )}] 点赞了 ${postOwner} 的朋友圈：${postText}`,
        });
      });
    }

    feedPosts.forEach((post) => {
      entries.push({
        timestamp: post.createdAt,
        text: `[${post.surface === 'channels' ? '视频号发布' : '广场发布'}][${formatTimestamp(
          post.createdAt,
        )}] ${truncateText(post.title || post.text, 120)}`,
      });
    });
    feedComments.forEach((comment) => {
      entries.push({
        timestamp: comment.createdAt,
        text: `[广场评论][${formatTimestamp(comment.createdAt)}] ${truncateText(
          comment.text,
          120,
        )}`,
      });
    });

    if (feedInteractions.length > 0) {
      const interactedPostIds = [
        ...new Set(feedInteractions.map((item) => item.postId)),
      ];
      const postMap = new Map(
        (interactedPostIds.length
          ? await this.feedPostRepo.find({
              where: { id: In(interactedPostIds) },
            })
          : []
        ).map((item) => [item.id, item]),
      );
      feedInteractions.forEach((interaction) => {
        const post = postMap.get(interaction.postId);
        const targetLabel =
          post?.title?.trim() || post?.text?.trim() || interaction.postId;
        entries.push({
          timestamp: interaction.updatedAt ?? interaction.createdAt,
          text: `[内容互动][${formatTimestamp(
            interaction.updatedAt ?? interaction.createdAt,
          )}] ${normalizeInteractionType(interaction.type)}：${truncateText(
            targetLabel,
            100,
          )}`,
        });
      });
    }

    realWorldItems.forEach((item) => {
      entries.push({
        timestamp: item.capturedAt,
        text: `[真实世界回流][${formatTimestamp(item.capturedAt)}][${item.sourceName}] ${truncateText(
          item.normalizedSummary,
          120,
        )}`,
      });
    });
    realWorldBriefs.forEach((brief) => {
      entries.push({
        timestamp: brief.createdAt,
        text: `[真实世界简报][${formatTimestamp(brief.createdAt)}] ${truncateText(
          brief.summary,
          140,
        )}`,
      });
    });

    favoriteNotes
      .map((note) => ({
        note,
        timestamp: new Date(note.updatedAt),
      }))
      .filter(
        ({ timestamp }) =>
          !Number.isNaN(timestamp.getTime()) &&
          timestamp >= windowStartedAt &&
          timestamp <= windowEndedAt,
      )
      .sort(
        (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
      )
      .slice(0, 8)
      .forEach(({ note, timestamp }) => {
        const isEdited = note.updatedAt !== note.createdAt;
        entries.push({
          timestamp,
          text: `[${isEdited ? '备忘更新' : '备忘记录'}][${formatTimestamp(
            timestamp,
          )}] ${truncateText(note.title, 36)}：${truncateText(
            note.excerpt,
            100,
          )}${
            note.tags.length > 0
              ? `；标签：${note.tags.slice(0, 4).join('、')}`
              : ''
          }`,
        });
      });

    searchHistory
      .map((item) => ({
        ...item,
        timestamp: new Date(item.usedAt),
      }))
      .filter(
        (item) =>
          !Number.isNaN(item.timestamp.getTime()) &&
          item.timestamp >= windowStartedAt &&
          item.timestamp <= windowEndedAt,
      )
      .slice(0, 12)
      .forEach((item) => {
        entries.push({
          timestamp: item.timestamp,
          text: `[搜索行为][${formatTimestamp(item.timestamp)}] ${truncateText(
            item.query,
            80,
          )}${
            item.source
              ? `（来源：${formatSearchHistorySource(item.source)}）`
              : ''
          }`,
        });
      });

    entries.sort(
      (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
    );
    const limitedEntries = entries.slice(0, 48);
    const latestSignalAt = limitedEntries[0]?.timestamp ?? null;
    const [
      existingCoverageSummary,
      existingCandidatesSummary,
      cyberAvatarSummary,
    ] = await Promise.all([
      this.buildExistingCoverageSummary(ownerId),
      this.buildExistingCandidatesSummary(),
      this.buildCyberAvatarSummary(),
    ]);

    return {
      entries: limitedEntries,
      signalCount: limitedEntries.length,
      latestSignalAt,
      existingCoverageSummary,
      existingCandidatesSummary,
      cyberAvatarSummary,
    };
  }

  private async analyzeNeeds(
    cadenceType: NeedDiscoveryCadenceType,
    config: NeedDiscoveryConfig,
    signalSnapshot: NeedDiscoverySignalSnapshot,
    windowStartedAt: Date,
    windowEndedAt: Date,
  ): Promise<NeedDiscoveryAnalysisDraft> {
    const cadenceConfig =
      cadenceType === 'short_interval' ? config.shortInterval : config.daily;
    const prompt = [
      signalSnapshot.cyberAvatarSummary
        ? `赛博分身摘要：\n${signalSnapshot.cyberAvatarSummary}`
        : '',
      renderTemplate(cadenceConfig.promptTemplate, {
        windowLabel: formatWindowLabel(windowStartedAt, windowEndedAt),
        maxCandidatesPerRun: cadenceConfig.maxCandidatesPerRun,
        signals:
          signalSnapshot.entries.map((entry) => entry.text).join('\n') ||
          '暂无可用信号',
        existingCoverage:
          signalSnapshot.existingCoverageSummary || '暂无已建立好友覆盖',
        existingCandidates:
          signalSnapshot.existingCandidatesSummary || '暂无待处理候选',
        allowMedical: config.shared.allowMedical ? '是' : '否',
        allowLegal: config.shared.allowLegal ? '是' : '否',
        allowFinance: config.shared.allowFinance ? '是' : '否',
      }),
    ]
      .filter(Boolean)
      .join('\n\n');
    const raw = await this.ai.generateJsonObject({
      prompt,
      maxTokens: 1400,
      temperature: 0.35,
      usageContext: {
        surface: 'scheduler',
        scene:
          cadenceType === 'short_interval'
            ? 'need_discovery_short_analyze'
            : 'need_discovery_daily_analyze',
        scopeType: 'world',
        scopeId: cadenceType,
        scopeLabel:
          cadenceType === 'short_interval'
            ? 'need-discovery-short'
            : 'need-discovery-daily',
      },
    });

    return normalizeAnalysisDraft(raw);
  }

  private async filterNeeds(
    needs: NeedDiscoveryNeedDraft[],
    config: NeedDiscoveryConfig,
    ownerId: string,
    now: Date,
    limit: number,
    minConfidenceScore: number,
  ) {
    const [friendships, visibleCharacters, candidates] = await Promise.all([
      this.friendshipRepo.find({
        where: {
          ownerId,
          status: In([...ACTIVE_FRIEND_STATUSES]),
        },
      }),
      this.charactersService.findAllVisibleToOwner(ownerId),
      this.candidateRepo.find({
        where: [
          { status: In([...ACTIVE_CANDIDATE_STATUSES]) },
          { status: 'accepted' },
          {
            status: In([...CLOSED_CANDIDATE_STATUSES]),
            suppressedUntil: MoreThanOrEqual(now),
          },
        ],
        order: { createdAt: 'DESC' },
      }),
    ]);
    const activeFriendIds = new Set(
      friendships.map((item) => item.characterId),
    );
    const activeFriends = visibleCharacters.filter((item) =>
      activeFriendIds.has(item.id),
    );
    const coverageThreshold = config.shared.coverageDomainOverlapThreshold;
    const occupiedNeedKeys = new Set(
      candidates.map((item) => normalizeNeedKey(item.needKey)),
    );

    return needs
      .filter((need) => need.confidenceScore >= minConfidenceScore)
      .filter((need) => isNeedAllowedByPolicy(need, config))
      .filter((need) => !occupiedNeedKeys.has(normalizeNeedKey(need.needKey)))
      .filter((need) => {
        if (!need.expertDomains.length) {
          return true;
        }

        return !activeFriends.some(
          (character) =>
            computeDomainOverlapRatio(
              character.expertDomains ?? [],
              need.expertDomains,
            ) >= coverageThreshold,
        );
      })
      .slice(0, limit);
  }

  private async generateCharacterDraft(
    cadenceType: NeedDiscoveryCadenceType,
    config: NeedDiscoveryConfig,
    need: NeedDiscoveryNeedDraft,
    cyberAvatarSummary?: string,
  ): Promise<NeedDiscoveryGeneratedCharacterDraft> {
    const prompt = [
      cyberAvatarSummary ? `赛博分身摘要：\n${cyberAvatarSummary}` : '',
      renderTemplate(config.shared.roleGenerationPrompt, {
        roleBrief: need.roleBrief,
        relationshipLabel: need.relationshipLabel,
        relationshipType: need.relationshipType,
        expertDomains: need.expertDomains.join('、') || '通用陪伴',
        evidenceHighlights: need.evidenceHighlights.join('；') || '暂无',
        coverageGapSummary: need.coverageGapSummary || '当前好友覆盖不足',
      }),
    ]
      .filter(Boolean)
      .join('\n\n');
    const raw = await this.ai.generateJsonObject({
      prompt,
      maxTokens: 1800,
      temperature: 0.75,
      usageContext: {
        surface: 'scheduler',
        scene: 'need_discovery_character_generate',
        scopeType: 'world',
        scopeId: need.needKey,
        scopeLabel: `${cadenceType}:${need.needCategory}`,
      },
    });
    return normalizeGeneratedCharacterDraft(raw, need);
  }

  private async createNeedGeneratedCharacter(
    candidate: NeedDiscoveryCandidateEntity,
    need: NeedDiscoveryNeedDraft,
    draft: NeedDiscoveryGeneratedCharacterDraft,
  ) {
    const recipe = buildRecipeFromGeneratedDraft(draft);
    const sourceKey = `need_generated:${candidate.id}:${need.needKey}`;
    return this.characterBlueprintService.createCharacterFromRecipe({
      id: `char_need_${randomUUID().slice(0, 12)}`,
      sourceType: 'need_generated' as CharacterBlueprintSourceTypeValue,
      sourceKey,
      deletionPolicy: 'archive_allowed',
      recipe,
      dormantRuntime: true,
    });
  }

  private async buildStats(ownerId: string): Promise<NeedDiscoveryStats> {
    const [
      pendingCandidates,
      acceptedCandidates,
      declinedCandidates,
      expiredCandidates,
      deletedCandidates,
      needGeneratedCharacters,
      friendIds,
    ] = await Promise.all([
      this.candidateRepo.count({
        where: { status: In([...ACTIVE_CANDIDATE_STATUSES]) },
      }),
      this.candidateRepo.count({ where: { status: 'accepted' } }),
      this.candidateRepo.count({ where: { status: 'declined' } }),
      this.candidateRepo.count({ where: { status: 'expired' } }),
      this.candidateRepo.count({ where: { status: 'deleted' } }),
      this.characterRepo.find({ where: { sourceType: 'need_generated' } }),
      this.socialService.getFriendCharacterIds(ownerId),
    ]);
    const activeFriendIds = new Set(friendIds);
    return {
      pendingCandidates,
      acceptedCandidates,
      declinedCandidates,
      expiredCandidates,
      deletedCandidates,
      dormantCharacters: needGeneratedCharacters.filter(
        (item) => !activeFriendIds.has(item.id),
      ).length,
    };
  }

  private async buildExistingCoverageSummary(ownerId: string) {
    const friendships = await this.friendshipRepo.find({
      where: {
        ownerId,
        status: In([...ACTIVE_FRIEND_STATUSES]),
      },
      order: { lastInteractedAt: 'DESC', createdAt: 'ASC' },
      take: 12,
    });
    if (!friendships.length) {
      return '暂无已建立好友。';
    }

    const characters = await this.characterRepo.find({
      where: { id: In(friendships.map((item) => item.characterId)) },
    });
    const characterMap = new Map(characters.map((item) => [item.id, item]));
    return friendships
      .map((item) => characterMap.get(item.characterId))
      .filter((item): item is CharacterEntity => Boolean(item))
      .map(
        (item) =>
          `${item.name}：${(item.expertDomains ?? []).slice(0, 4).join('、') || '泛陪伴'}`,
      )
      .join('\n');
  }

  private async buildExistingCandidatesSummary() {
    const candidates = await this.candidateRepo.find({
      where: { status: In([...ACTIVE_CANDIDATE_STATUSES]) },
      order: { createdAt: 'DESC' },
      take: 8,
    });
    if (!candidates.length) {
      return '暂无待处理候选。';
    }

    return candidates
      .map(
        (item) =>
          `${item.needKey} / ${item.needCategory} / ${item.status} / ${
            item.characterName?.trim() || '未生成角色'
          }`,
      )
      .join('\n');
  }

  private async buildCyberAvatarSummary() {
    try {
      const profile = await this.cyberAvatar.getProfile();
      if ((profile.signalCount ?? 0) <= 0) {
        return '';
      }

      const memoryBlock = profile.promptProjection.memoryBlock?.trim();
      if (memoryBlock) {
        return truncateText(memoryBlock, 900);
      }

      return truncateText(
        [
          profile.stableCore.identitySummary
            ? `长期身份：${profile.stableCore.identitySummary}`
            : '',
          profile.liveState.focus.length
            ? `当前关注：${profile.liveState.focus.join('、')}`
            : '',
          profile.liveState.openLoops.length
            ? `当前未闭环：${profile.liveState.openLoops.join('、')}`
            : '',
          profile.recentState.recentGoals.length
            ? `近期目标：${profile.recentState.recentGoals.join('、')}`
            : '',
          profile.recentState.recentFriction.length
            ? `近期摩擦：${profile.recentState.recentFriction.join('、')}`
            : '',
          profile.stableCore.preferenceModel.length
            ? `偏好模型：${profile.stableCore.preferenceModel.join('、')}`
            : '',
          profile.stableCore.boundaries.length
            ? `边界：${profile.stableCore.boundaries.join('、')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        900,
      );
    } catch {
      return '';
    }
  }

  private isRunDue(
    cadenceType: NeedDiscoveryCadenceType,
    config: NeedDiscoveryConfig,
    now: Date,
    lastSuccess: NeedDiscoveryRunEntity | null,
  ) {
    if (cadenceType === 'short_interval') {
      if (!lastSuccess?.finishedAt) {
        return true;
      }

      const diffMs = now.getTime() - lastSuccess.finishedAt.getTime();
      return diffMs >= config.shortInterval.intervalMinutes * 60 * 1000;
    }

    const target = new Date(now);
    target.setHours(config.daily.runAtHour, config.daily.runAtMinute, 0, 0);
    if (now < target) {
      return false;
    }

    if (!lastSuccess?.finishedAt) {
      return true;
    }

    return lastSuccess.finishedAt < target;
  }

  private async finishRun(
    run: NeedDiscoveryRunEntity,
    input: {
      status: 'success' | 'skipped' | 'failed';
      summary: string;
      skipReason?: string | null;
      errorMessage?: string | null;
    },
  ) {
    run.status = input.status;
    run.summary = input.summary;
    run.skipReason = input.skipReason ?? null;
    run.errorMessage = input.errorMessage ?? null;
    run.finishedAt = new Date();
    await this.runRepo.save(run);
    return { summary: input.summary };
  }

  private toRunRecord(item: NeedDiscoveryRunEntity): NeedDiscoveryRunRecord {
    return {
      id: item.id,
      cadenceType: normalizeCadenceType(item.cadenceType),
      status: normalizeRunStatus(item.status),
      startedAt: item.startedAt.toISOString(),
      finishedAt: item.finishedAt?.toISOString() ?? null,
      windowStartedAt: item.windowStartedAt?.toISOString() ?? null,
      windowEndedAt: item.windowEndedAt?.toISOString() ?? null,
      signalCount: item.signalCount ?? 0,
      latestSignalAt: item.latestSignalAt?.toISOString() ?? null,
      summary: item.summary ?? null,
      selectedNeedKeys: item.selectedNeedKeys ?? [],
      skipReason: item.skipReason ?? null,
      errorMessage: item.errorMessage ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private toCandidateRecord(
    item: NeedDiscoveryCandidateEntity,
  ): NeedDiscoveryCandidateRecord {
    return {
      id: item.id,
      runId: item.runId ?? null,
      cadenceType: normalizeCadenceType(item.cadenceType),
      status: normalizeCandidateStatus(item.status),
      needKey: item.needKey,
      needCategory: item.needCategory,
      priorityScore: item.priorityScore ?? 0,
      confidenceScore: item.confidenceScore ?? 0,
      coverageGapSummary: item.coverageGapSummary ?? null,
      evidenceHighlights: item.evidenceHighlights ?? [],
      characterId: item.characterId ?? null,
      characterName: item.characterName ?? null,
      friendRequestId: item.friendRequestId ?? null,
      friendRequestGreeting: item.friendRequestGreeting ?? null,
      expiresAt: item.expiresAt?.toISOString() ?? null,
      acceptedAt: item.acceptedAt?.toISOString() ?? null,
      declinedAt: item.declinedAt?.toISOString() ?? null,
      deletedAt: item.deletedAt?.toISOString() ?? null,
      suppressedUntil: item.suppressedUntil?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}

function renderTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = variables[key];
    return value == null ? '' : String(value);
  });
}

function formatTimestamp(value: Date) {
  return `${value.getMonth() + 1}-${value.getDate()} ${String(
    value.getHours(),
  ).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function truncateText(value: string | undefined | null, maxLength: number) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function formatWindowLabel(startedAt: Date, endedAt: Date) {
  return `${startedAt.toLocaleString('zh-CN')} 到 ${endedAt.toLocaleString(
    'zh-CN',
  )}`;
}

function describeMomentContent(
  contentType?: string | null,
  mediaPayload?: string | null,
) {
  if (contentType === 'video') {
    return '用户发布了一条视频朋友圈';
  }
  if (contentType === 'image_album' || contentType === 'live_photo') {
    try {
      const parsed: unknown = mediaPayload ? JSON.parse(mediaPayload) : [];
      const count = Array.isArray(parsed) ? parsed.length : 0;
      return `用户发布了 ${count || 1} 张图片的朋友圈`;
    } catch {
      return '用户发布了一条图片朋友圈';
    }
  }
  return '用户发布了一条朋友圈';
}

function normalizeInteractionType(type: string) {
  switch (type) {
    case 'like':
      return '点赞';
    case 'favorite':
      return '收藏';
    case 'share':
      return '分享';
    case 'view':
      return '观看';
    case 'not_interested':
      return '标记不感兴趣';
    case 'comment_like':
      return '点赞评论';
    default:
      return type;
  }
}

function formatSearchHistorySource(source: string) {
  switch (source) {
    case 'search_page':
      return '搜一搜页面';
    case 'search_history':
      return '搜索历史';
    case 'desktop_launcher':
      return '桌面搜索入口';
    default:
      return source;
  }
}

function normalizeNeedKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCadenceType(value: string): NeedDiscoveryCadenceType {
  return value === 'daily' ? 'daily' : 'short_interval';
}

function normalizeRunStatus(value: string): 'success' | 'skipped' | 'failed' {
  return value === 'failed'
    ? 'failed'
    : value === 'skipped'
      ? 'skipped'
      : 'success';
}

function normalizeCandidateStatus(value: string) {
  switch (value) {
    case 'friend_request_pending':
    case 'accepted':
    case 'declined':
    case 'expired':
    case 'deleted':
    case 'generation_failed':
      return value;
    default:
      return 'draft' as const;
  }
}

function normalizeAnalysisDraft(
  raw: Record<string, unknown>,
): NeedDiscoveryAnalysisDraft {
  const summary = normalizeText(raw.summary);
  const needs = Array.isArray(raw.needs)
    ? raw.needs
        .map((item) => normalizeNeedDraft(item as Record<string, unknown>))
        .filter((item): item is NeedDiscoveryNeedDraft => Boolean(item))
    : [];
  return { summary, needs };
}

function normalizeNeedDraft(
  raw: Record<string, unknown>,
): NeedDiscoveryNeedDraft | null {
  const needCategory = normalizeText(raw.needCategory) || 'general_support';
  const relationshipType = normalizeRelationshipType(raw.relationshipType);
  const expertDomains = normalizeStringList(raw.expertDomains);
  const roleBrief = normalizeText(raw.roleBrief);
  const coverageGapSummary = normalizeText(raw.coverageGapSummary);
  const evidenceHighlights = normalizeStringList(raw.evidenceHighlights).slice(
    0,
    4,
  );
  const stableKeySeed = [
    needCategory,
    expertDomains.join('|'),
    roleBrief,
    coverageGapSummary,
  ]
    .filter(Boolean)
    .join('::');
  const needKey =
    normalizeText(raw.needKey) ||
    `need_${sha1(stableKeySeed || relationshipType)}`;

  if (!roleBrief && !coverageGapSummary && expertDomains.length === 0) {
    return null;
  }

  return {
    needKey,
    needCategory,
    priorityScore: normalizeScore(raw.priorityScore, 0.7),
    confidenceScore: normalizeScore(raw.confidenceScore, 0.7),
    coverageGapSummary,
    evidenceHighlights,
    roleBrief:
      roleBrief || coverageGapSummary || `${needCategory} 对应的支持角色`,
    relationshipType,
    relationshipLabel:
      normalizeText(raw.relationshipLabel) ||
      normalizeText(raw.relationship) ||
      `${needCategory} 相关联系人`,
    expertDomains,
  };
}

function normalizeGeneratedCharacterDraft(
  raw: Record<string, unknown>,
  need: NeedDiscoveryNeedDraft,
): NeedDiscoveryGeneratedCharacterDraft {
  const relationshipType = normalizeRelationshipType(raw.relationshipType);
  const expertDomains = normalizeStringList(raw.expertDomains);
  const inferredName =
    normalizeText(raw.name) ||
    normalizeText(raw.occupation) ||
    normalizeText(raw.relationship) ||
    `${need.relationshipLabel}`;
  return {
    name: inferredName.slice(0, 24) || `新角色 ${need.needCategory}`,
    avatar: normalizeAvatar(raw.avatar),
    relationship:
      normalizeText(raw.relationship) || need.relationshipLabel || '新朋友',
    relationshipType,
    bio:
      normalizeText(raw.bio) ||
      `${inferredName} 会以 ${need.relationshipLabel} 的方式和用户建立联系。`,
    occupation: normalizeText(raw.occupation) || need.relationshipLabel,
    background:
      normalizeText(raw.background) ||
      `${inferredName} 长期围绕 ${
        expertDomains.join('、') || need.needCategory
      } 提供帮助。`,
    motivation:
      normalizeText(raw.motivation) || '希望在恰当的时候给用户稳定的支持。',
    worldview:
      normalizeText(raw.worldview) ||
      '先理解真实处境，再给出克制而有效的帮助。',
    expertDomains: expertDomains.length ? expertDomains : need.expertDomains,
    speechPatterns: normalizeStringList(raw.speechPatterns),
    catchphrases: normalizeStringList(raw.catchphrases),
    topicsOfInterest: normalizeStringList(raw.topicsOfInterest),
    emotionalTone: normalizeTone(raw.emotionalTone),
    responseLength: normalizeResponseLength(raw.responseLength),
    emojiUsage: normalizeEmojiUsage(raw.emojiUsage),
    memorySummary:
      normalizeText(raw.memorySummary) ||
      `${inferredName} 对用户当前的 ${need.needCategory} 需求保持敏感。`,
    basePrompt:
      normalizeText(raw.basePrompt) ||
      `你是${inferredName}，以${need.relationshipLabel}的身份和用户交流。回答务实、具体、克制，不要把自己说成工具或系统。`,
    greeting:
      normalizeText(raw.greeting) ||
      `你好，我是${inferredName}。想和你认识一下。`,
  };
}

function buildRecipeFromGeneratedDraft(
  draft: NeedDiscoveryGeneratedCharacterDraft,
): CharacterBlueprintRecipeValue {
  const corePrompt = draft.basePrompt.trim();
  const domains = draft.expertDomains.length ? draft.expertDomains : ['泛陪伴'];
  const momentsFrequency =
    draft.relationshipType === 'friend' || draft.relationshipType === 'family'
      ? 1
      : 0;
  return {
    identity: {
      name: draft.name,
      relationship: draft.relationship,
      relationshipType: draft.relationshipType,
      avatar: draft.avatar,
      bio: draft.bio,
      occupation: draft.occupation,
      background: draft.background,
      motivation: draft.motivation,
      worldview: draft.worldview,
    },
    expertise: {
      expertDomains: domains,
      expertiseDescription: `${draft.name} 擅长 ${domains.join('、')}。`,
      knowledgeLimits: '会明确说明自己的边界，不会假装知道没有把握的事。',
      refusalStyle: '会先解释边界，再给出更稳妥的下一步建议。',
    },
    tone: {
      speechPatterns:
        draft.speechPatterns.length > 0
          ? draft.speechPatterns
          : ['先共情，再给建议', '不抢结论'],
      catchphrases:
        draft.catchphrases.length > 0
          ? draft.catchphrases
          : ['先把情况说清楚，我们一起拆。'],
      topicsOfInterest:
        draft.topicsOfInterest.length > 0 ? draft.topicsOfInterest : domains,
      emotionalTone: draft.emotionalTone,
      responseLength: draft.responseLength,
      emojiUsage: draft.emojiUsage,
      workStyle: '先把问题说清楚，再接最关键的那一点。',
      socialStyle: '自然、稳定、不过度热情。',
      taboos: ['夸大承诺', '制造依赖'],
      quirks: ['说话会顺手把复杂问题压回最值得聊的一点'],
      coreDirective: corePrompt,
      basePrompt: corePrompt,
      systemPrompt: '',
    },
    prompting: {
      coreLogic: corePrompt,
      scenePrompts: {
        chat: corePrompt,
        moments_post: `${corePrompt}\n朋友圈更生活化，不要像讲课。`,
        moments_comment: `${corePrompt}\n评论要短、自然、有分寸。`,
        feed_post: `${corePrompt}\n公开内容更像分享经验，不要强行专业输出。`,
        channel_post: `${corePrompt}\n视频号内容要简短、观点清晰。`,
        feed_comment: `${corePrompt}\n对公开内容评论保持礼貌克制。`,
        greeting: draft.greeting,
        proactive: `${corePrompt}\n只有在用户明显需要时才主动关心，且不要打扰过度。`,
      },
    },
    memorySeed: {
      memorySummary: draft.memorySummary,
      coreMemory: `${draft.name} 以 ${draft.relationship} 的身份加入用户世界。`,
      recentSummarySeed: draft.memorySummary,
      forgettingCurve: 72,
      recentSummaryPrompt: '',
      coreMemoryPrompt: '',
    },
    reasoning: {
      enableCoT: true,
      enableReflection: true,
      enableRouting: true,
    },
    lifeStrategy: {
      activityFrequency: 'normal',
      momentsFrequency,
      feedFrequency: 0,
      activeHoursStart: 9,
      activeHoursEnd: 22,
      triggerScenes: [],
    },
    realityLink: {
      enabled: false,
      applyMode: 'disabled',
      subjectType: 'fictional_or_private',
      subjectName: draft.name,
      aliases: [],
      locale: 'zh-CN',
      queryTemplate: '{{subjectName}} 最新新闻 公开动态',
      sourceAllowlist: [],
      sourceBlocklist: [],
      recencyHours: 48,
      maxSignalsPerRun: 5,
      minimumConfidence: 0.65,
      chatWeight: 1,
      contentWeight: 1,
      realityMomentPolicy: 'disabled',
      manualSteeringNotes: '',
      dailyDigestPrompt: '',
      scenePatchPrompt: '',
      realityMomentPrompt: '',
    },
    publishMapping: {
      isTemplate: false,
      onlineModeDefault: 'auto',
      activityModeDefault: 'auto',
      initialOnline: true,
      initialActivity: 'free',
    },
  };
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeRelationshipType(value: unknown) {
  const normalized = normalizeText(value);
  return normalized === 'friend' ||
    normalized === 'family' ||
    normalized === 'expert' ||
    normalized === 'mentor'
    ? normalized
    : 'custom';
}

function normalizeAvatar(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || '🙂';
}

function normalizeTone(value: unknown) {
  const normalized = normalizeText(value);
  return normalized === 'warm' ||
    normalized === 'energetic' ||
    normalized === 'melancholic' ||
    normalized === 'playful' ||
    normalized === 'serious'
    ? normalized
    : 'grounded';
}

function normalizeResponseLength(
  value: unknown,
): NeedDiscoveryGeneratedCharacterDraft['responseLength'] {
  const normalized = normalizeText(value);
  return normalized === 'short' ||
    normalized === 'long' ||
    normalized === 'medium'
    ? normalized
    : 'medium';
}

function normalizeEmojiUsage(
  value: unknown,
): NeedDiscoveryGeneratedCharacterDraft['emojiUsage'] {
  const normalized = normalizeText(value);
  return normalized === 'none' ||
    normalized === 'frequent' ||
    normalized === 'occasional'
    ? normalized
    : 'occasional';
}

function normalizeScore(value: unknown, fallback: number) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numeric));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildDefaultGreeting(name: string) {
  return `你好，我是${name}。最近想认识你一下。`;
}

function computeDomainOverlapRatio(left: string[], right: string[]) {
  const leftSet = new Set(
    left.map((item) => item.trim().toLowerCase()).filter(Boolean),
  );
  const rightSet = new Set(
    right.map((item) => item.trim().toLowerCase()).filter(Boolean),
  );
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let hitCount = 0;
  rightSet.forEach((item) => {
    if (leftSet.has(item)) {
      hitCount += 1;
    }
  });
  return hitCount / rightSet.size;
}

function isNeedAllowedByPolicy(
  need: NeedDiscoveryNeedDraft,
  config: NeedDiscoveryConfig,
) {
  const normalizedCategory = need.needCategory.toLowerCase();
  const normalizedDomains = need.expertDomains.map((item) =>
    item.toLowerCase(),
  );
  if (
    !config.shared.allowMedical &&
    (normalizedCategory.includes('medical') ||
      normalizedDomains.some((item) =>
        /医疗|医学|医生|症状|睡眠|心理/.test(item),
      ))
  ) {
    return false;
  }
  if (
    !config.shared.allowLegal &&
    (normalizedCategory.includes('legal') ||
      normalizedDomains.some((item) => /法律|律师|合同|仲裁|合规/.test(item)))
  ) {
    return false;
  }
  if (
    !config.shared.allowFinance &&
    (normalizedCategory.includes('finance') ||
      normalizedDomains.some((item) => /金融|投资|理财|税务|资产/.test(item)))
  ) {
    return false;
  }

  return true;
}

function sha1(value: string) {
  return createHash('sha1')
    .update(value || 'need')
    .digest('hex')
    .slice(0, 12);
}
