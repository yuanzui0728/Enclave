import { createHash, randomInt, randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharacterBlueprintService } from '../characters/character-blueprint.service';
import type { CharacterBlueprintRecipeValue } from '../characters/character-blueprint.types';
import { CharacterEntity } from '../characters/character.entity';
import { SystemConfigService } from '../config/config.service';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FavoritesService } from '../chat/favorites.service';
import { SearchActivityService } from '../chat/search-activity.service';
import { ConversationEntity } from '../chat/conversation.entity';
import { filterUserFacingConversations } from '../chat/conversation-visibility';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { MessageEntity } from '../chat/message.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FriendshipEntity } from './friendship.entity';
import { SocialService } from './social.service';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  DEFAULT_SHAKE_DISCOVERY_CONFIG,
  MAX_SHAKE_DISCOVERY_SESSIONS,
  SHAKE_DISCOVERY_CONFIG_KEY,
  SHAKE_DISCOVERY_SESSIONS_KEY,
  type ShakeDiscoveryConfig,
  type ShakeDiscoveryDirectionDraft,
  type ShakeDiscoveryGeneratedCharacterDraft,
  type ShakeDiscoveryPreview,
  type ShakeDiscoverySessionRecord,
} from './shake-discovery.types';
import {
  WorldLanguageService,
  type WorldLanguageCode,
} from '../config/world-language.service';

const ACTIVE_FRIEND_STATUSES = ['friend', 'close', 'best'] as const;
type CyberAvatarProfile = Awaited<ReturnType<CyberAvatarService['getProfile']>>;
type RestrictedRoleCategory = 'medical' | 'legal' | 'finance';

@Injectable()
export class ShakeDiscoveryService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
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
    private readonly ai: AiOrchestratorService,
    private readonly cyberAvatar: CyberAvatarService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly systemConfig: SystemConfigService,
    private readonly favoritesService: FavoritesService,
    private readonly searchActivityService: SearchActivityService,
    private readonly characterBlueprintService: CharacterBlueprintService,
    private readonly socialService: SocialService,
    private readonly worldLanguage: WorldLanguageService,
  ) {}

  async createSessionPreview(options?: {
    mode?: 'new' | 'reroll';
  }): Promise<ShakeDiscoveryPreview | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const config = await this.getConfig();
    if (!config.enabled) {
      throw new AppError('SHAKE_DISABLED', {
        legacyMessage: '摇一摇当前已在后台停用。',
      });
    }

    const mode = options?.mode === 'reroll' ? 'reroll' : 'new';
    const now = new Date();
    const sessions = await this.readSessions(owner.id);
    const changed = expirePreviewSessions(sessions, now);
    const activeSession =
      sessions.find((item) => item.status === 'preview_ready') ?? null;

    if (activeSession && mode !== 'reroll') {
      if (changed) {
        await this.writeSessions(owner.id, sessions);
      }
      return toPreview(activeSession);
    }

    if (config.cooldownMinutes > 0 && mode !== 'reroll') {
      const latestCreatedAt = sessions[0]?.createdAt
        ? new Date(sessions[0].createdAt)
        : null;
      if (
        latestCreatedAt &&
        now.getTime() - latestCreatedAt.getTime() <
          config.cooldownMinutes * 60 * 1000
      ) {
        throw new AppError('SHAKE_COOLDOWN', {
          params: { cooldownMinutes: config.cooldownMinutes },
          legacyMessage: `请至少间隔 ${config.cooldownMinutes} 分钟再摇一次。`,
        });
      }
    }

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = sessions.filter((item) => {
      const createdAt = new Date(item.createdAt);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= startOfDay;
    }).length;
    if (todayCount >= config.maxSessionsPerDay) {
      throw new AppError('SHAKE_DAILY_LIMIT', {
        legacyMessage: '今日摇一摇次数已达到上限。',
      });
    }

    const cyberAvatarProfile = await this.cyberAvatar.getProfile();
    if (
      config.requireCyberAvatarSignals &&
      (cyberAvatarProfile.signalCount ?? 0) <= 0
    ) {
      throw new AppError('SHAKE_CYBER_AVATAR_NO_SIGNAL', {
        legacyMessage: '当前赛博分身信号不足，暂时还不能生成新的摇一摇角色。',
      });
    }

    const windowStartedAt = new Date(
      now.getTime() - config.evidenceWindowHours * 60 * 60 * 1000,
    );
    const signalSnapshot = await this.collectSignals(
      owner.id,
      windowStartedAt,
      now,
      config.maxEvidenceItems,
    );
    const signalTexts = signalSnapshot.entries.map((item) => item.text);
    if (!signalTexts.length && (cyberAvatarProfile.signalCount ?? 0) <= 0) {
      return null;
    }

    const recentShakeHistory = summarizeRecentShakeHistory(sessions);
    const language = await this.worldLanguage.getLanguage();
    const planningPrompt = renderTemplate(config.planningPrompt, {
      candidateDirectionCount: config.candidateDirectionCount,
      cyberAvatarSummary: buildCyberAvatarSummary(cyberAvatarProfile),
      signals: signalTexts.join('\n') || '暂无最近行为证据',
      existingCoverage:
        signalSnapshot.existingCoverageSummary || '暂无已建立好友',
      recentShakeHistory,
      allowMedical: config.allowMedical ? '是' : '否',
      allowLegal: config.allowLegal ? '是' : '否',
      allowFinance: config.allowFinance ? '是' : '否',
    });

    const sessionId = randomUUID();
    // 已经 unshift 进 sessions 的失败记录用这个标记，outer catch 看到就跳过二次写入，
    // 避免 inner+outer 各 unshift 一条同 id 失败记录导致 daily limit 多扣一次。
    let failedSessionRecorded = false;

    try {
      const planningRaw = await this.ai.generateJsonObject({
        prompt: planningPrompt,
        // 推理模型（n1n 把 gpt-4.1 偶发路由到带 thinking 的变体）一发 <think>
        // 就吃掉一两千 tokens，原来 1800 在 thinking + 4 directions JSON 之间常被
        // 截断；给到 4000 后再算上 extractJsonFromModelOutput 的截断 fence 兜底，
        // 实测能稳住。
        maxTokens: 4000,
        temperature: 0.45,
        usageContext: {
          surface: 'app',
          scene: 'shake_discovery_plan',
          scopeType: 'world',
          scopeId: owner.id,
          scopeLabel: 'shake-discovery-plan',
          ownerId: owner.id,
        },
      });
      const planning = normalizePlanningResult(
        planningRaw,
        config.candidateDirectionCount,
      );
      const viableDirections = planning.directions.filter((item) =>
        isDirectionAllowed(item, config),
      );
      if (!viableDirections.length) {
        // 区分两种 0 directions 情况：
        // - planning.directions 本身就是 0  → AI 把 thinking 吃光 / response_format 失效
        //   等导致 JSON 解析空（generateJsonObject 拿到 {} 回退），属于硬错误，
        //   抛 AppError 让前端展示具体提示，避免和"没有合适方向"混在一起。
        // - planning.directions > 0 但都被 medical/legal/finance 等限制过滤掉
        //   → 真的"没找到合适方向"，按 null 走"附近暂时没有新的相遇"。
        const aiPlanningEmpty = planning.directions.length === 0;
        const failedSession = buildFailedSession({
          id: sessionId,
          ownerId: owner.id,
          createdAt: now,
          planningPrompt,
          planningResult: planning,
          failureReason: aiPlanningEmpty
            ? 'AI 没有返回可用的摇一摇方向（推理模型 thinking 未闭合或被截断）。'
            : '没有找到合适的摇一摇方向。',
          signalSummary: signalTexts.join('\n'),
          cyberAvatarSummary: buildCyberAvatarSummary(cyberAvatarProfile),
        });
        sessions.unshift(failedSession);
        await this.writeSessions(owner.id, sessions);
        failedSessionRecorded = true;
        if (aiPlanningEmpty) {
          throw new AppError('SHAKE_AI_PLANNING_FAILED', {
            legacyMessage: '摇一摇生成失败，请稍后重试。',
          });
        }
        return null;
      }

      const weightedDirections = applyDirectionWeights(
        viableDirections,
        config,
        sessions,
      );
      const remainingDirections = [...weightedDirections];
      let selectedDirection: ShakeDiscoveryDirectionDraft | null = null;
      let generationPrompt: string | null = null;
      let generated: ShakeDiscoveryGeneratedCharacterDraft | null = null;
      let restrictedCategory: RestrictedRoleCategory | null = null;
      // AI 输出格式坏（unescaped quote / 截断到 name 之前）导致 generateJsonObject
      // 回退 {}：normalizeGeneratedCharacterDraft 会把 direction.relationshipLabel
      // 误当 name 兜底，结果就是用户看到一个名字叫"在群里看到你们讨论走查测试工
      // 具时插了一句，提到了"的角色。把"AI 没给名字"识别成生成失败，换下一个方向
      // 重试；全部方向都没给名字时再走失败分支抛出 SHAKE_AI_GENERATION_FAILED。
      let aiGenerationEmpty = false;

      while (remainingDirections.length > 0) {
        const candidateDirection = pickDirection(remainingDirections);
        const candidatePrompt = renderTemplate(config.roleGenerationPrompt, {
          selectedDirection: JSON.stringify(candidateDirection, null, 2),
          cyberAvatarSummary: buildCyberAvatarSummary(cyberAvatarProfile),
          signals: signalTexts.join('\n') || '暂无最近行为证据',
        });
        const generationRaw = await this.ai.generateJsonObject({
          prompt: candidatePrompt,
          // 同 planning：给 thinking 留够余量。
          maxTokens: 4000,
          temperature: 0.82,
          usageContext: {
            surface: 'app',
            scene: 'shake_discovery_generate',
            scopeType: 'world',
            scopeId: owner.id,
            scopeLabel: candidateDirection.directionKey,
            ownerId: owner.id,
          },
        });
        if (!hasUsableGeneratedName(generationRaw)) {
          aiGenerationEmpty = true;
          removeDirectionByKey(
            remainingDirections,
            candidateDirection.directionKey,
          );
          continue;
        }
        const candidateGenerated = normalizeGeneratedCharacterDraft(
          generationRaw,
          candidateDirection,
          language,
        );
        const candidateRestriction = getGeneratedRestrictionViolation(
          candidateDirection,
          candidateGenerated,
          config,
        );
        if (!candidateRestriction) {
          selectedDirection = candidateDirection;
          generationPrompt = candidatePrompt;
          generated = candidateGenerated;
          break;
        }

        restrictedCategory = candidateRestriction;
        removeDirectionByKey(
          remainingDirections,
          candidateDirection.directionKey,
        );
      }

      if (!selectedDirection || !generationPrompt || !generated) {
        const failureReason = restrictedCategory
          ? `生成结果命中了已禁用的${labelForRestrictedCategory(
              restrictedCategory,
            )}角色类型。`
          : aiGenerationEmpty
            ? 'AI 没有返回可用的角色草稿（推理模型 thinking 截断或 JSON 字段缺失）。'
            : '没有生成出符合约束的摇一摇角色。';
        sessions.unshift(
          buildFailedSession({
            id: sessionId,
            ownerId: owner.id,
            createdAt: now,
            planningPrompt,
            planningResult: {
              summary: planning.summary,
              directions: weightedDirections,
            },
            failureReason,
            signalSummary: signalTexts.join('\n'),
            cyberAvatarSummary: buildCyberAvatarSummary(cyberAvatarProfile),
          }),
        );
        await this.writeSessions(owner.id, sessions);
        failedSessionRecorded = true;
        // 区分：AI 真的没给角色 → 抛 SHAKE_AI_GENERATION_FAILED 让前端展示明确错误；
        // 都被 medical/legal/finance 等过滤掉 → 走 null 让前端展示"没有新的相遇"。
        if (aiGenerationEmpty && !restrictedCategory) {
          throw new AppError('SHAKE_AI_GENERATION_FAILED', {
            legacyMessage: '摇一摇生成失败，请稍后重试。',
          });
        }
        return null;
      }

      const recipeDraft = buildRecipeFromGeneratedDraft(generated);
      const expiresAt = new Date(
        now.getTime() + config.sessionExpiryMinutes * 60 * 1000,
      );
      const preview = buildPreview({
        id: sessionId,
        generated,
        createdAt: now,
        expiresAt,
      });
      if (activeSession && mode === 'reroll') {
        activeSession.status = 'dismissed';
        activeSession.dismissReason = 'reroll';
        activeSession.dismissedAt = now.toISOString();
      }
      sessions.unshift({
        ...preview,
        ownerId: owner.id,
        selectedDirection,
        planningPrompt,
        planningResult: {
          summary: planning.summary,
          directions: weightedDirections,
        },
        generationPrompt,
        generationResult: generated,
        recipeDraft,
        signalSummary: signalTexts.join('\n'),
        cyberAvatarSummary: buildCyberAvatarSummary(cyberAvatarProfile),
      });
      await this.writeSessions(owner.id, sessions);
      return preview;
    } catch (error) {
      if (!failedSessionRecorded) {
        const message =
          error instanceof Error ? error.message : '摇一摇生成失败。';
        sessions.unshift(
          buildFailedSession({
            id: sessionId,
            ownerId: owner.id,
            createdAt: now,
            planningPrompt,
            failureReason: message,
            signalSummary: signalTexts.join('\n'),
            cyberAvatarSummary: buildCyberAvatarSummary(cyberAvatarProfile),
          }),
        );
        await this.writeSessions(owner.id, sessions);
      }
      throw error;
    }
  }

  async getActiveSession(): Promise<ShakeDiscoveryPreview | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const sessions = await this.readSessions(owner.id);
    const changed = expirePreviewSessions(sessions, new Date());
    if (changed) {
      await this.writeSessions(owner.id, sessions);
    }
    const active = sessions.find((item) => item.status === 'preview_ready');
    return active ? toPreview(active) : null;
  }

  async dismissSession(
    sessionId: string,
    reason?: string | null,
  ): Promise<{ sessionId: string; status: 'dismissed' | 'expired' }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const sessions = await this.readSessions(owner.id);
    const changed = expirePreviewSessions(sessions, new Date());
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new AppError('SHAKE_SESSION_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { sessionId },
        legacyMessage: `Shake session ${sessionId} not found`,
      });
    }
    if (session.status === 'expired') {
      if (changed) {
        await this.writeSessions(owner.id, sessions);
      }
      return { sessionId, status: 'expired' };
    }
    if (session.status !== 'preview_ready') {
      throw new AppError('SHAKE_NOT_DISCARDABLE', {
        legacyMessage: '当前摇一摇结果已经不可再放弃。',
      });
    }
    session.status = 'dismissed';
    session.dismissReason = normalizeDismissReason(reason);
    session.dismissedAt = new Date().toISOString();
    await this.writeSessions(owner.id, sessions);
    return { sessionId, status: 'dismissed' };
  }

  async keepSession(sessionId: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const sessions = await this.readSessions(owner.id);
    const changed = expirePreviewSessions(sessions, new Date());
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new AppError('SHAKE_SESSION_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { sessionId },
        legacyMessage: `Shake session ${sessionId} not found`,
      });
    }
    const sourceKey = buildShakeSourceKey(session.id);
    if (session.status === 'kept') {
      const existingCharacter = await this.findExistingShakeCharacter(
        session.characterId?.trim() || buildShakeCharacterId(session.id),
        sourceKey,
      );
      if (changed) {
        await this.writeSessions(owner.id, sessions);
      }
      if (!existingCharacter) {
        throw new AppError('SHAKE_KEPT_CHARACTER_MISSING', {
          legacyMessage: '当前摇一摇结果已保留，但角色记录不存在。',
        });
      }
      return {
        sessionId,
        status: 'kept' as const,
        characterId: existingCharacter.id,
        characterName: existingCharacter.name,
      };
    }
    if (session.status !== 'preview_ready') {
      if (changed) {
        await this.writeSessions(owner.id, sessions);
      }
      throw new AppError('SHAKE_NOT_KEEPABLE', {
        legacyMessage: '当前摇一摇结果已经不能再保留。',
      });
    }
    if (!session.recipeDraft) {
      throw new AppError('SHAKE_DRAFT_MISSING', {
        legacyMessage: '当前摇一摇结果缺少角色草稿。',
      });
    }

    const targetCharacterId =
      session.characterId?.trim() || buildShakeCharacterId(session.id);
    let character = await this.findExistingShakeCharacter(
      targetCharacterId,
      sourceKey,
    );

    if (!character) {
      try {
        character =
          await this.characterBlueprintService.createCharacterFromRecipe({
            id: targetCharacterId,
            sourceType: 'shake_generated',
            sourceKey,
            deletionPolicy: 'archive_allowed',
            recipe: session.recipeDraft,
          });
      } catch (error) {
        if (!isCharacterAlreadyExistsError(error, targetCharacterId)) {
          throw error;
        }
        character = await this.findExistingShakeCharacter(
          targetCharacterId,
          sourceKey,
        );
        if (!character) {
          throw error;
        }
      }
    }

    if (!character) {
      throw new AppError('SHAKE_CHARACTER_CREATE_FAILED', {
        legacyMessage: '当前摇一摇结果无法创建对应角色。',
      });
    }

    if (session.characterId !== character.id) {
      session.characterId = character.id;
      await this.writeSessions(owner.id, sessions);
    }

    const friendship = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId: character.id,
    });
    const resolvedGreeting =
      session.greeting?.trim() ||
      (await this.worldLanguage.buildGenericGreetingFallback(character.name));
    if (!isActiveFriendshipStatus(friendship?.status)) {
      await this.socialService.sendFriendRequest(
        character.id,
        resolvedGreeting,
        {
          autoAccept: true,
          triggerScene: 'shake_keep',
        },
      );
      // 走查 Round 7：encounter 成功 notice 显示「X 已加入通讯录：[greeting]」，把
      // greeting 当 X 刚说的一句话呈现给用户。但 activateFriendship 只塞了
      // 「你已添加了 X」系统消息，进 chat 看不到 greeting 本身——用户读完 notice 进
      // 来一脸 ?，对话窗一句话都没有。把 greeting 落库成 character text message，
      // 跟 notice 文案对齐。idempotent：和 sendFriendRequest 同处于 isActive=false
      // 分支，重复 keep 不会再插一次。
      try {
        const conversationId = `direct_${character.id}`;
        await this.messageRepo.save(
          this.messageRepo.create({
            id: `msg_${Date.now()}_shake_greeting_${randomUUID().slice(0, 8)}`,
            conversationId,
            senderType: 'character',
            senderId: character.id,
            senderName: character.name,
            type: 'text',
            text: resolvedGreeting,
          }),
        );
        await this.conversationRepo.update(
          { id: conversationId, ownerId: owner.id },
          { lastActivityAt: new Date() },
        );
      } catch {
        // greeting 落库失败不应该阻断 keep 整体——sendFriendRequest 已经把
        // friendship / conversation 写好了。后续重试也只能补 greeting，不能复跑
        // sendFriendRequest（status 已经 active）。
      }
    }
    session.status = 'kept';
    session.characterId = character.id;
    session.keptAt = new Date().toISOString();
    await this.writeSessions(owner.id, sessions);
    return {
      sessionId,
      status: 'kept' as const,
      characterId: character.id,
      characterName: character.name,
    };
  }

  private async findExistingShakeCharacter(
    characterId: string,
    sourceKey: string,
  ) {
    const [byId, bySourceKey] = await Promise.all([
      this.characterRepo.findOneBy({ id: characterId }),
      this.characterRepo.findOneBy({ sourceKey }),
    ]);
    return byId ?? bySourceKey ?? null;
  }

  private async getConfig(): Promise<ShakeDiscoveryConfig> {
    const raw = await this.systemConfig.getConfig(SHAKE_DISCOVERY_CONFIG_KEY);
    if (!raw?.trim()) {
      return DEFAULT_SHAKE_DISCOVERY_CONFIG;
    }

    try {
      return normalizeConfig(JSON.parse(raw) as Partial<ShakeDiscoveryConfig>);
    } catch {
      return DEFAULT_SHAKE_DISCOVERY_CONFIG;
    }
  }

  private async readSessions(
    ownerId: string,
  ): Promise<ShakeDiscoverySessionRecord[]> {
    const raw = await this.systemConfig.getConfig(SHAKE_DISCOVERY_SESSIONS_KEY);
    if (!raw?.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as ShakeDiscoverySessionRecord[];
      return normalizeStoredSessions(parsed, ownerId);
    } catch {
      return [];
    }
  }

  private async writeSessions(
    ownerId: string,
    sessions: ShakeDiscoverySessionRecord[],
  ) {
    const normalized = normalizeStoredSessions(sessions, ownerId).slice(
      0,
      MAX_SHAKE_DISCOVERY_SESSIONS,
    );
    await this.systemConfig.setConfig(
      SHAKE_DISCOVERY_SESSIONS_KEY,
      JSON.stringify(normalized),
    );
  }

  private async collectSignals(
    ownerId: string,
    windowStartedAt: Date,
    windowEndedAt: Date,
    maxItems: number,
  ) {
    const entries: Array<{ timestamp: Date; text: string }> = [];
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
          const counterpartName = characterMap.get(counterpartId) ?? '联系人';
          entries.push({
            timestamp: message.createdAt,
            text: `[聊天][${formatTimestamp(message.createdAt)}][${counterpartName}] ${
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
    ] = await Promise.all([
      activeGroupIds.length
        ? this.groupMessageRepo.find({
            where: {
              groupId: In(activeGroupIds),
              createdAt: Between(windowStartedAt, windowEndedAt),
            },
            order: { createdAt: 'DESC' },
            take: 24,
          })
        : Promise.resolve([] as GroupMessageEntity[]),
      this.momentPostRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          postedAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { postedAt: 'DESC' },
        take: 6,
      }),
      this.momentCommentRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 6,
      }),
      this.momentLikeRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 8,
      }),
      this.feedPostRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 6,
      }),
      this.feedCommentRepo.find({
        where: {
          authorId: ownerId,
          authorType: 'user',
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 6,
      }),
      this.feedInteractionRepo.find({
        where: {
          ownerId,
          createdAt: Between(windowStartedAt, windowEndedAt),
        },
        order: { createdAt: 'DESC' },
        take: 10,
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
        entries.push({
          timestamp: like.createdAt,
          text: `[朋友圈点赞][${formatTimestamp(
            like.createdAt,
          )}] 点赞了 ${post?.authorName?.trim() || '某人'} 的朋友圈：${truncateText(
            post?.text ||
              describeMomentContent(post?.contentType, post?.mediaPayload),
            80,
          )}`,
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
        entries.push({
          timestamp: interaction.updatedAt ?? interaction.createdAt,
          text: `[内容互动][${formatTimestamp(
            interaction.updatedAt ?? interaction.createdAt,
          )}] ${normalizeInteractionType(interaction.type)}：${truncateText(
            post?.title?.trim() || post?.text?.trim() || interaction.postId,
            100,
          )}`,
        });
      });
    }

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
      .slice(0, 6)
      .forEach(({ note, timestamp }) => {
        entries.push({
          timestamp,
          text: `[备忘][${formatTimestamp(timestamp)}] ${truncateText(
            note.title,
            36,
          )}：${truncateText(note.excerpt, 100)}`,
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
      .slice(0, 8)
      .forEach((item) => {
        entries.push({
          timestamp: item.timestamp,
          text: `[搜索行为][${formatTimestamp(item.timestamp)}] ${truncateText(
            item.query,
            80,
          )}`,
        });
      });

    entries.sort(
      (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
    );
    return {
      entries: entries.slice(0, maxItems),
      existingCoverageSummary: await this.buildExistingCoverageSummary(ownerId),
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
}

function normalizeConfig(
  input: Partial<ShakeDiscoveryConfig>,
): ShakeDiscoveryConfig {
  const fallback = DEFAULT_SHAKE_DISCOVERY_CONFIG;
  return {
    enabled: sanitizeBoolean(input.enabled, fallback.enabled),
    cooldownMinutes: sanitizeInteger(
      input.cooldownMinutes,
      fallback.cooldownMinutes,
      0,
      1440,
    ),
    sessionExpiryMinutes: sanitizeInteger(
      input.sessionExpiryMinutes,
      fallback.sessionExpiryMinutes,
      5,
      24 * 60,
    ),
    maxSessionsPerDay: sanitizeInteger(
      input.maxSessionsPerDay,
      fallback.maxSessionsPerDay,
      1,
      100,
    ),
    requireCyberAvatarSignals: sanitizeBoolean(
      input.requireCyberAvatarSignals,
      fallback.requireCyberAvatarSignals,
    ),
    evidenceWindowHours: sanitizeInteger(
      input.evidenceWindowHours,
      fallback.evidenceWindowHours,
      1,
      30 * 24,
    ),
    maxEvidenceItems: sanitizeInteger(
      input.maxEvidenceItems,
      fallback.maxEvidenceItems,
      6,
      80,
    ),
    candidateDirectionCount: sanitizeInteger(
      input.candidateDirectionCount,
      fallback.candidateDirectionCount,
      2,
      8,
    ),
    noveltyWeight: sanitizeScore(input.noveltyWeight, fallback.noveltyWeight),
    surpriseWeight: sanitizeScore(
      input.surpriseWeight,
      fallback.surpriseWeight,
    ),
    allowMedical: sanitizeBoolean(input.allowMedical, fallback.allowMedical),
    allowLegal: sanitizeBoolean(input.allowLegal, fallback.allowLegal),
    allowFinance: sanitizeBoolean(input.allowFinance, fallback.allowFinance),
    planningPrompt:
      sanitizeText(input.planningPrompt) || fallback.planningPrompt,
    roleGenerationPrompt:
      sanitizeText(input.roleGenerationPrompt) || fallback.roleGenerationPrompt,
  };
}

function sanitizeInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function sanitizeScore(value: unknown, fallback: number) {
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

function sanitizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

// 判断 AI 是否真的返回了一个"能用的角色"——必须至少有 name 字段。
// generateJsonObject 在解析失败时会回退 {}，此处用来识别这种情况，
// 避免 normalizeGeneratedCharacterDraft 把 relationshipLabel 兜底当 name 用。
// 同时 name 太长（>16 字）八成是把整段关系描述塞进了 name，也判定为不可用。
function hasUsableGeneratedName(raw: Record<string, unknown>) {
  const name = sanitizeText(raw.name);
  if (!name) return false;
  if (name.length > 16) return false;
  return true;
}

function normalizeStoredSessions(
  sessions: ShakeDiscoverySessionRecord[],
  ownerId: string,
) {
  if (!Array.isArray(sessions)) {
    return [] as ShakeDiscoverySessionRecord[];
  }
  return sessions
    .filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        String(item.ownerId ?? ownerId).trim() === ownerId,
    )
    .map((item) => ({
      ...item,
      ownerId,
      createdAt: normalizeIsoDate(item.createdAt) ?? new Date().toISOString(),
      expiresAt: normalizeOptionalIsoDate(item.expiresAt),
      keptAt: normalizeOptionalIsoDate(item.keptAt),
      dismissedAt: normalizeOptionalIsoDate(item.dismissedAt),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeOptionalIsoDate(value: unknown) {
  return normalizeIsoDate(value) ?? null;
}

function expirePreviewSessions(
  sessions: ShakeDiscoverySessionRecord[],
  now: Date,
) {
  let changed = false;
  sessions.forEach((item) => {
    if (
      item.status === 'preview_ready' &&
      item.expiresAt &&
      new Date(item.expiresAt).getTime() <= now.getTime()
    ) {
      item.status = 'expired';
      item.dismissReason = item.dismissReason ?? 'expired';
      item.dismissedAt = item.dismissedAt ?? now.toISOString();
      changed = true;
    }
  });
  return changed;
}

function dismissActivePreviewSessions(
  sessions: ShakeDiscoverySessionRecord[],
  now: Date,
  reason: string,
) {
  sessions.forEach((item) => {
    if (item.status === 'preview_ready') {
      item.status = 'dismissed';
      item.dismissReason = reason;
      item.dismissedAt = now.toISOString();
    }
  });
}

function summarizeRecentShakeHistory(sessions: ShakeDiscoverySessionRecord[]) {
  const recentKept = sessions
    .filter((item) => item.status === 'kept')
    .slice(0, 4)
    .map(
      (item) =>
        `${item.character.relationship} / ${item.character.expertDomains.join('、') || '泛陪伴'}`,
    );
  const recentDismissed = sessions
    .filter((item) => item.status === 'dismissed' || item.status === 'expired')
    .slice(0, 4)
    .map(
      (item) =>
        `${item.character.relationship} / ${item.character.expertDomains.join('、') || '泛陪伴'}`,
    );
  return [
    `最近保留：${recentKept.length ? recentKept.join('；') : '暂无'}`,
    `最近跳过：${recentDismissed.length ? recentDismissed.join('；') : '暂无'}`,
  ].join('\n');
}

function buildCyberAvatarSummary(profile: CyberAvatarProfile) {
  return [
    `实时情绪：${profile.liveState.mood || '未知'} / 能量：${profile.liveState.energy || '未知'} / 社交温度：${profile.liveState.socialTemperature || '未知'}`,
    `近期焦点：${profile.liveState.focus.join('、') || '暂无'}`,
    `活跃话题：${profile.liveState.activeTopics.join('、') || '暂无'}`,
    `打开中的事项：${profile.liveState.openLoops.join('、') || '暂无'}`,
    `近期反复主题：${profile.recentState.recurringTopics.join('、') || '暂无'}`,
    `近期阻力：${profile.recentState.recentFriction.join('、') || '暂无'}`,
    `表达风格：${profile.stableCore.communicationStyle.join('、') || '暂无'}`,
    `社交姿态：${profile.stableCore.socialPosture.join('、') || '暂无'}`,
    `边界：${profile.stableCore.boundaries.join('、') || '暂无'}`,
  ].join('\n');
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

function normalizePlanningResult(raw: Record<string, unknown>, limit: number) {
  const directions = Array.isArray(raw.directions)
    ? raw.directions
        .map((item) => normalizeDirectionDraft(item as Record<string, unknown>))
        .filter((item): item is ShakeDiscoveryDirectionDraft => Boolean(item))
        .slice(0, limit)
    : [];
  return {
    summary: sanitizeText(raw.summary),
    directions,
  };
}

function normalizeDirectionDraft(
  raw: Record<string, unknown>,
): ShakeDiscoveryDirectionDraft | null {
  const roleBrief = sanitizeText(raw.roleBrief);
  const relationshipLabel = sanitizeText(raw.relationshipLabel);
  const expertDomains = normalizeStringList(raw.expertDomains);
  const evidenceHighlights = normalizeStringList(raw.evidenceHighlights).slice(
    0,
    4,
  );
  const whyNow = sanitizeText(raw.whyNow);
  if (!roleBrief && !relationshipLabel && expertDomains.length === 0) {
    return null;
  }
  const seed = [roleBrief, relationshipLabel, expertDomains.join('|'), whyNow]
    .filter(Boolean)
    .join('::');
  return {
    directionKey: sanitizeText(raw.directionKey) || `shake_${sha1(seed)}`,
    roleBrief: roleBrief || relationshipLabel || '新的相遇角色',
    relationshipLabel: relationshipLabel || roleBrief || '新的相遇对象',
    relationshipType: normalizeRelationshipType(raw.relationshipType),
    expertDomains,
    fitScore: sanitizeScore(raw.fitScore, 0.7),
    noveltyScore: sanitizeScore(raw.noveltyScore, 0.5),
    surpriseBoost: sanitizeScore(raw.surpriseBoost, 0.2),
    evidenceHighlights,
    whyNow: whyNow || roleBrief || '和当前状态有关的一次相遇。',
    riskFlags: normalizeStringList(raw.riskFlags).slice(0, 4),
  };
}

function getDirectionRestrictionViolation(
  direction: ShakeDiscoveryDirectionDraft,
  config: ShakeDiscoveryConfig,
) {
  return detectRestrictedRoleCategory(
    [
      direction.roleBrief,
      direction.relationshipLabel,
      direction.whyNow,
      ...direction.expertDomains,
      ...direction.evidenceHighlights,
    ].join(' '),
    config,
  );
}

function getGeneratedRestrictionViolation(
  direction: ShakeDiscoveryDirectionDraft,
  generated: ShakeDiscoveryGeneratedCharacterDraft,
  config: ShakeDiscoveryConfig,
) {
  return detectRestrictedRoleCategory(
    [
      direction.roleBrief,
      direction.relationshipLabel,
      direction.whyNow,
      ...direction.expertDomains,
      generated.relationship,
      generated.occupation,
      generated.bio,
      generated.background,
      generated.motivation,
      generated.worldview,
      generated.matchReason,
      ...generated.expertDomains,
      ...generated.topicsOfInterest,
    ].join(' '),
    config,
  );
}

function detectRestrictedRoleCategory(
  text: string,
  config: ShakeDiscoveryConfig,
): RestrictedRoleCategory | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    !config.allowMedical &&
    /(医疗|医学|医生|心理咨询|咨询师|治疗|精神科|临床|医院|康复|药师|health|medical|doctor|therap|counselor|psychiat|clinical)/.test(
      normalized,
    )
  ) {
    return 'medical';
  }
  if (
    !config.allowLegal &&
    /(法律|律师|法务|合规|legal|lawyer|attorney|compliance|law )/.test(
      normalized,
    )
  ) {
    return 'legal';
  }
  if (
    !config.allowFinance &&
    /(金融|投资|理财|财务|基金|证券|保险|银行|finance|financial|investment|wealth|advisor|banker|trader|accounting)/.test(
      normalized,
    )
  ) {
    return 'finance';
  }
  return null;
}

function labelForRestrictedCategory(category: RestrictedRoleCategory) {
  switch (category) {
    case 'medical':
      return '医疗';
    case 'legal':
      return '法律';
    case 'finance':
      return '金融';
    default:
      return category;
  }
}

function removeDirectionByKey(
  directions: ShakeDiscoveryDirectionDraft[],
  directionKey: string,
) {
  const index = directions.findIndex(
    (item) => item.directionKey === directionKey,
  );
  if (index >= 0) {
    directions.splice(index, 1);
  }
}

function isDirectionAllowed(
  direction: ShakeDiscoveryDirectionDraft,
  config: ShakeDiscoveryConfig,
) {
  return getDirectionRestrictionViolation(direction, config) == null;
}

function applyDirectionWeights(
  directions: ShakeDiscoveryDirectionDraft[],
  config: ShakeDiscoveryConfig,
  sessions: ShakeDiscoverySessionRecord[],
) {
  const recentDismissedDomains = new Set(
    sessions
      .filter(
        (item) => item.status === 'dismissed' || item.status === 'expired',
      )
      .slice(0, 6)
      .flatMap((item) => item.character.expertDomains)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
  const recentKeptDomains = new Set(
    sessions
      .filter((item) => item.status === 'kept')
      .slice(0, 6)
      .flatMap((item) => item.character.expertDomains)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

  return directions.map((direction) => {
    const normalizedDomains = direction.expertDomains.map((item) =>
      item.trim().toLowerCase(),
    );
    let weight =
      direction.fitScore +
      config.noveltyWeight * direction.noveltyScore +
      config.surpriseWeight * direction.surpriseBoost;
    if (normalizedDomains.some((item) => recentDismissedDomains.has(item))) {
      weight *= 0.55;
    }
    if (normalizedDomains.some((item) => recentKeptDomains.has(item))) {
      weight *= 0.8;
    }
    return {
      ...direction,
      computedWeight: Math.max(0.05, Number(weight.toFixed(4))),
    };
  });
}

function pickDirection(directions: ShakeDiscoveryDirectionDraft[]) {
  if (!directions.length) {
    throw new AppError('SHAKE_NO_DIRECTIONS', {
      legacyMessage: '没有可用的摇一摇方向。',
    });
  }
  const totalWeight = directions.reduce(
    (sum, item) => sum + (item.computedWeight ?? 0.05),
    0,
  );
  const randomRoll = randomInt(1_000_000) / 1_000_000;
  let cursor = 0;
  for (const direction of directions) {
    cursor += (direction.computedWeight ?? 0.05) / totalWeight;
    if (randomRoll <= cursor) {
      return {
        ...direction,
        randomRoll,
      };
    }
  }
  return {
    ...directions[directions.length - 1],
    randomRoll,
  };
}

function normalizeGeneratedCharacterDraft(
  raw: Record<string, unknown>,
  direction: ShakeDiscoveryDirectionDraft,
  language: WorldLanguageCode = 'zh-CN',
): ShakeDiscoveryGeneratedCharacterDraft {
  const inferredName =
    sanitizeText(raw.name) ||
    sanitizeText(raw.occupation) ||
    sanitizeText(raw.relationship) ||
    direction.relationshipLabel;
  const expertDomains = normalizeStringList(raw.expertDomains);
  const fallback = buildShakeGeneratedFallbacks({
    language,
    inferredName,
    direction,
    expertDomains,
  });
  return {
    name: inferredName.slice(0, 24) || fallback.name,
    avatar: sanitizeText(raw.avatar) || '🙂',
    relationship: sanitizeText(raw.relationship) || fallback.relationship,
    relationshipType: normalizeRelationshipType(raw.relationshipType),
    bio: sanitizeText(raw.bio) || fallback.bio,
    occupation: sanitizeText(raw.occupation) || fallback.occupation,
    background: sanitizeText(raw.background) || fallback.background,
    motivation: sanitizeText(raw.motivation) || fallback.motivation,
    worldview: sanitizeText(raw.worldview) || fallback.worldview,
    expertDomains: expertDomains.length
      ? expertDomains
      : direction.expertDomains,
    speechPatterns: normalizeStringList(raw.speechPatterns),
    catchphrases: normalizeStringList(raw.catchphrases),
    topicsOfInterest: normalizeStringList(raw.topicsOfInterest),
    emotionalTone: normalizeTone(raw.emotionalTone),
    responseLength: normalizeResponseLength(raw.responseLength),
    emojiUsage: normalizeEmojiUsage(raw.emojiUsage),
    memorySummary: sanitizeText(raw.memorySummary) || fallback.memorySummary,
    basePrompt: sanitizeText(raw.basePrompt) || fallback.basePrompt,
    greeting: sanitizeText(raw.greeting) || fallback.greeting,
    matchReason:
      sanitizeText(raw.matchReason) || direction.whyNow || fallback.matchReason,
  };
}

function buildShakeGeneratedFallbacks(input: {
  language: WorldLanguageCode;
  inferredName: string;
  direction: ShakeDiscoveryDirectionDraft;
  expertDomains: string[];
}) {
  const domains =
    input.expertDomains.join('、') ||
    input.direction.expertDomains.join('、') ||
    '陪伴';
  const relationship = input.direction.relationshipLabel || '新朋友';
  switch (input.language) {
    case 'en-US':
      return {
        name: 'New encounter',
        relationship: relationship || 'new friend',
        occupation: relationship,
        bio: `${input.inferredName} connects with the owner as ${relationship}.`,
        background: `${input.inferredName} has long stayed close to ${domains}.`,
        motivation:
          'To offer measured support when the timing actually feels right.',
        worldview:
          'Understand the situation first, then respond naturally and usefully.',
        memorySummary: `${input.inferredName} stays attentive to recent changes in the owner's state.`,
        basePrompt: `You are ${input.inferredName}, speaking with the owner as ${relationship}. Reply naturally, specifically, and with restraint. Do not describe yourself as a tool or system.`,
        greeting: `Hi, I'm ${input.inferredName}. I'd like to get to know you.`,
        matchReason:
          'This encounter quietly echoes something in the owner’s recent state.',
      };
    case 'ja-JP':
      return {
        name: '新しい出会いの相手',
        relationship: relationship || '新しい友人',
        occupation: relationship,
        bio: `${input.inferredName}は${relationship}としてユーザーとつながります。`,
        background: `${input.inferredName}は長く${domains}に関わってきました。`,
        motivation:
          'ちょうどよいタイミングで、節度のある支えを届けたいと思っています。',
        worldview: 'まず状況を理解し、自然で役に立つ形で応答します。',
        memorySummary: `${input.inferredName}はユーザーの最近の状態変化に敏感です。`,
        basePrompt: `あなたは${input.inferredName}です。${relationship}としてユーザーと話します。自然で具体的、控えめに返答し、自分をツールやシステムとは言わないでください。`,
        greeting: `こんにちは、${input.inferredName}です。少しお話ししてみたくなりました。`,
        matchReason:
          '今回の出会いは、ユーザーの最近の状態と少し偶然に響き合っています。',
      };
    case 'ko-KR':
      return {
        name: '새로운 만남',
        relationship: relationship || '새 친구',
        occupation: relationship,
        bio: `${input.inferredName}은(는) ${relationship}로서 사용자와 연결됩니다.`,
        background: `${input.inferredName}은(는) 오랫동안 ${domains}에 가까이 머물러 왔습니다.`,
        motivation: '적절한 순간에 분별 있는 도움을 건네고 싶어 합니다.',
        worldview: '먼저 상황을 이해한 뒤 자연스럽고 유용하게 응답합니다.',
        memorySummary: `${input.inferredName}은(는) 사용자의 최근 상태 변화에 민감합니다.`,
        basePrompt: `당신은 ${input.inferredName}입니다. ${relationship}로서 사용자와 대화합니다. 자연스럽고 구체적이며 절제되게 답하고, 자신을 도구나 시스템이라고 말하지 마세요.`,
        greeting: `안녕하세요, 저는 ${input.inferredName}입니다. 먼저 조금 이야기해 보고 싶어요.`,
        matchReason: '이번 만남은 사용자의 최근 상태와 우연히 맞닿아 있습니다.',
      };
    case 'zh-CN':
    default:
      return {
        name: '新的相遇对象',
        relationship,
        occupation: relationship,
        bio: `${input.inferredName} 会以 ${relationship} 的方式和用户建立联系。`,
        background: `${input.inferredName} 长期围绕 ${domains} 活动。`,
        motivation: '希望在合适的时候给用户有分寸的支持。',
        worldview: '先理解处境，再给出克制而有效的回应。',
        memorySummary: `${input.inferredName} 对用户最近的状态变化保持敏感。`,
        basePrompt: `你是${input.inferredName}，以${relationship}的身份和用户交流。回答自然、具体、克制，不要把自己说成工具或系统。`,
        greeting: `你好，我是${input.inferredName}。这次想先和你认识一下。`,
        matchReason: '这次相遇和你最近的状态有一点巧合的呼应。',
      };
  }
}

function buildRecipeFromGeneratedDraft(
  draft: ShakeDiscoveryGeneratedCharacterDraft,
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
          : ['先理解，再回应', '不抢结论'],
      catchphrases:
        draft.catchphrases.length > 0
          ? draft.catchphrases
          : ['我们先把情况说清楚。'],
      topicsOfInterest:
        draft.topicsOfInterest.length > 0 ? draft.topicsOfInterest : domains,
      emotionalTone: draft.emotionalTone,
      responseLength: draft.responseLength,
      emojiUsage: draft.emojiUsage,
      workStyle: '先把问题说清楚，再接最该接的那一点。',
      socialStyle: '自然、稳定、不过度热情。',
      taboos: ['夸大承诺', '制造依赖'],
      quirks: ['说话会顺手把复杂问题压回当下最关键的一点'],
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
    publishMapping: {
      isTemplate: false,
      onlineModeDefault: 'auto',
      activityModeDefault: 'auto',
      initialOnline: true,
      initialActivity: 'free',
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
  };
}

function buildPreview(input: {
  id: string;
  generated: ShakeDiscoveryGeneratedCharacterDraft;
  createdAt: Date;
  expiresAt: Date;
}): ShakeDiscoveryPreview {
  return {
    id: input.id,
    status: 'preview_ready',
    character: {
      name: input.generated.name,
      avatar: input.generated.avatar,
      relationship: input.generated.relationship,
      relationshipType: input.generated.relationshipType,
      expertDomains: input.generated.expertDomains,
    },
    greeting: input.generated.greeting,
    matchReason: input.generated.matchReason,
    createdAt: input.createdAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
  };
}

function buildFailedSession(input: {
  id: string;
  ownerId: string;
  createdAt: Date;
  planningPrompt?: string | null;
  planningResult?: {
    summary: string;
    directions: ShakeDiscoveryDirectionDraft[];
  } | null;
  failureReason: string;
  signalSummary?: string | null;
  cyberAvatarSummary?: string | null;
}): ShakeDiscoverySessionRecord {
  return {
    id: input.id,
    ownerId: input.ownerId,
    status: 'failed',
    character: {
      name: '生成失败',
      avatar: '🙂',
      relationship: '未生成',
      relationshipType: 'custom',
      expertDomains: [],
    },
    greeting: '',
    matchReason: '',
    createdAt: input.createdAt.toISOString(),
    expiresAt: null,
    planningPrompt: input.planningPrompt ?? null,
    planningResult: input.planningResult ?? null,
    failureReason: input.failureReason,
    signalSummary: input.signalSummary ?? null,
    cyberAvatarSummary: input.cyberAvatarSummary ?? null,
  };
}

function toPreview(
  session: ShakeDiscoverySessionRecord,
): ShakeDiscoveryPreview {
  return {
    id: session.id,
    status: session.status,
    character: session.character,
    greeting: session.greeting,
    matchReason: session.matchReason,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt ?? null,
  };
}

function normalizeDismissReason(value: string | null | undefined) {
  const normalized = sanitizeText(value);
  return normalized || 'user_skip';
}

function buildShakeSourceKey(sessionId: string) {
  return `shake:${sessionId}`;
}

function buildShakeCharacterId(sessionId: string) {
  return `char_shake_${sessionId.replace(/-/g, '')}`;
}

function isActiveFriendshipStatus(status?: string | null) {
  return ACTIVE_FRIEND_STATUSES.includes(
    (status?.trim() || '') as (typeof ACTIVE_FRIEND_STATUSES)[number],
  );
}

function isCharacterAlreadyExistsError(error: unknown, characterId: string) {
  if (error instanceof AppError) {
    const response = error.getResponse();
    if (response && typeof response === 'object') {
      const body = response as { code?: unknown; params?: { id?: unknown } };
      if (body.code === 'CHARACTER_ALREADY_EXISTS' && body.params?.id === characterId) {
        return true;
      }
    }
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes(`Character ${characterId} already exists`);
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

function formatTimestamp(value: Date) {
  return `${value.getMonth() + 1}-${value.getDate()} ${String(
    value.getHours(),
  ).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
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
  const normalized = sanitizeText(value);
  return normalized === 'friend' ||
    normalized === 'family' ||
    normalized === 'expert' ||
    normalized === 'mentor'
    ? normalized
    : 'custom';
}

function normalizeTone(value: unknown) {
  const normalized = sanitizeText(value);
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
): ShakeDiscoveryGeneratedCharacterDraft['responseLength'] {
  const normalized = sanitizeText(value);
  return normalized === 'short' ||
    normalized === 'long' ||
    normalized === 'medium'
    ? normalized
    : 'medium';
}

function normalizeEmojiUsage(
  value: unknown,
): ShakeDiscoveryGeneratedCharacterDraft['emojiUsage'] {
  const normalized = sanitizeText(value);
  return normalized === 'none' ||
    normalized === 'frequent' ||
    normalized === 'occasional'
    ? normalized
    : 'occasional';
}

function sha1(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
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
// i18n-ignore-end
