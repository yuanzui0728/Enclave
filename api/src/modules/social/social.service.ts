import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, MoreThan, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { AppError } from '../../common/app-error.exception';
import { FriendshipEntity } from './friendship.entity';
import { FriendRequestEntity } from './friend-request.entity';
import { AIRelationshipEntity } from './ai-relationship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { NarrativeService } from '../narrative/narrative.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  DEFAULT_CHARACTER_IDS,
  SELF_CHARACTER_ID,
} from '../characters/default-characters';
import { listBuiltInCharacterPresets } from '../characters/built-in-character-presets';
import { listCelebrityCharacterPresets } from '../characters/celebrity-character-presets';
import {
  SCENE_IDS,
  SCENE_LABEL_ZH,
  matchCandidatesByScene,
  normalizeScene,
  pickWeightedRandom,
  type SceneId,
  type SceneMatchSource,
} from './scene-matching';
import { sanitizeGreeting } from './greeting-sanitizer';
import { ChatService } from '../chat/chat.service';
import { CharactersService } from '../characters/characters.service';
import { AppEvents, EventBusService } from '../events/event-bus.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { WorldLanguageService } from '../config/world-language.service';
import { addDays, formatLocalDate, getSparkTier } from './spark-utils';
import { InitialMessageService } from './initial-message.service';

const ACTIVE_FRIENDSHIP_STATUSES = new Set(['friend', 'close', 'best']);
export const DEFAULT_FRIENDSHIP_CHARACTER_IDS = [...DEFAULT_CHARACTER_IDS];

// 走查 R1：场景相遇 trigger-scene 没有任何服务端节流，仅靠前端 2.5s 冷却兜底。
// 直连接口可以无限造好友申请（每次还烧一次 AI greeting），跟"摇一摇" 12/day 形成
// 明显不对等的攻击面。以下两条只限用户主动调（caller='user'）；scheduler 走 cron
// 是系统行为，保留旁路。
const SCENE_USER_DAILY_LIMIT = 30;
const SCENE_USER_MIN_INTERVAL_MS = 1500;

// 走查新 R1：updateFriendProfile 之前完全没卡 remark / tags 长度——前端
// character-detail-page 自己声明了 REMARK_NAME_MAX_LENGTH=20、
// TAGS_INPUT_MAX_LENGTH=200、单 tag 在 normalizeTags 时只是 trim。
// 任何直连接口（curl / Charles 重放 / 第三方端）都能塞 1MB remark 进 DB，
// 让 listFriends 这条 select 在该 owner 上慢成爆栈。后端跟前端拉齐+留点
// buffer：remark 卡 40 字符（前端 20 是 UI 显示宽度，后端给一倍冗余兼容
// emoji 组合字符），单 tag 30、tag 数量 32（>> 前端实际可见 8 行）。
const REMARK_NAME_MAX_BYTES = 40;
const TAG_MAX_LENGTH = 30;
const TAGS_MAX_COUNT = 32;

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    @InjectRepository(FriendshipEntity)
    private friendshipRepo: Repository<FriendshipEntity>,
    @InjectRepository(FriendRequestEntity)
    private friendRequestRepo: Repository<FriendRequestEntity>,
    @InjectRepository(AIRelationshipEntity)
    private aiRelRepo: Repository<AIRelationshipEntity>,
    @InjectRepository(CharacterEntity)
    private characterRepo: Repository<CharacterEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly narrativeService: NarrativeService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly chatService: ChatService,
    private readonly charactersService: CharactersService,
    private readonly cyberAvatar: CyberAvatarService,
    private readonly eventBus: EventBusService,
    private readonly worldLanguage: WorldLanguageService,
    private readonly initialMessageService: InitialMessageService,
  ) {}

  async getPendingRequests(
    direction: 'inbound' | 'outbound' | 'all' = 'inbound',
  ): Promise<FriendRequestEntity[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const where: FindOptionsWhere<FriendRequestEntity> = {
      ownerId: owner.id,
      status: 'pending',
    };
    if (direction === 'inbound') {
      where.acceptAt = IsNull();
    } else if (direction === 'outbound') {
      where.acceptAt = Not(IsNull());
    }
    return this.friendRequestRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async acceptRequest(
    requestId: string,
    options?: { acceptedBy?: 'user' | 'character'; ownerId?: string },
  ): Promise<FriendshipEntity> {
    const acceptedBy = options?.acceptedBy ?? 'user';
    const ownerId =
      options?.ownerId ??
      (await this.worldOwnerService.getOwnerOrThrow()).id;
    const req = await this.friendRequestRepo.findOneBy({
      id: requestId,
      ownerId,
    });
    if (!req)
      throw new AppError('SOCIAL_FRIEND_REQUEST_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Request not found',
      });

    const shouldNotifyConversation = req.status !== 'accepted';
    if (shouldNotifyConversation) {
      req.status = 'accepted';
      await this.friendRequestRepo.save(req);
    }

    const friendship = await this.activateFriendship(
      ownerId,
      req.characterId,
      req.characterName,
      {
        notifyConversation: shouldNotifyConversation,
      },
    );

    if (shouldNotifyConversation) {
      this.eventBus.emit(AppEvents.FRIEND_REQUEST_ACCEPTED, {
        requestId: req.id,
        characterId: req.characterId,
        ownerId,
        acceptedAt: new Date(),
      });
      const isCharacterAccept = acceptedBy === 'character';
      await this.cyberAvatar.captureSignal({
        ownerId,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType: isCharacterAccept
          ? 'friend_request_character_accept'
          : 'friend_request_accept',
        sourceEntityId: req.id,
        dedupeKey: `friendship:${
          isCharacterAccept ? 'character-accept' : 'accept'
        }:${req.id}`,
        summaryText: isCharacterAccept
          ? `${req.characterName} 通过了用户的好友请求。`
          : `用户接受了来自 ${req.characterName} 的好友请求。`,
        payload: {
          action: isCharacterAccept
            ? 'character_accept_request'
            : 'accept_request',
          requestId: req.id,
          characterId: req.characterId,
          characterName: req.characterName,
        },
        occurredAt: new Date(),
      });
    }

    return friendship;
  }

  async declineRequest(requestId: string): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const request = await this.friendRequestRepo.findOneBy({
      id: requestId,
      ownerId: owner.id,
    });
    if (!request) {
      throw new AppError('SOCIAL_FRIEND_REQUEST_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Request not found',
      });
    }

    const shouldEmit = request.status !== 'declined';
    request.status = 'declined';
    await this.friendRequestRepo.save(request);

    if (shouldEmit) {
      this.eventBus.emit(AppEvents.FRIEND_REQUEST_DECLINED, {
        requestId: request.id,
        characterId: request.characterId,
        ownerId: owner.id,
        declinedAt: new Date(),
      });
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType: 'friend_request_decline',
        sourceEntityId: request.id,
        dedupeKey: `friendship:decline:${request.id}`,
        summaryText: `用户拒绝了来自 ${request.characterName} 的好友请求。`,
        payload: {
          action: 'decline_request',
          requestId: request.id,
          characterId: request.characterId,
          characterName: request.characterName,
        },
        occurredAt: new Date(),
      });
    }
  }

  async getFriends(): Promise<
    { friendship: FriendshipEntity; character: CharacterEntity | null }[]
  > {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.ensureDefaultFriendships(owner.id);
    const friendships = await this.friendshipRepo.find({
      where: { ownerId: owner.id, status: Not(In(['blocked', 'removed'])) },
    });
    if (!friendships.length) {
      return [];
    }
    // 原实现对每个 friendship 都跑一次 characterRepo.findOneBy，N 个好友 = N+1 次 SQL。
    // yuanzui0728 默认好友 + 自建角色加起来 30+，每次进通讯录主页都要打 30+ 条
    // SELECT character WHERE id = ?。改成一条 IN([...]) 查询后回到常数次 SQL。
    const characterIds = Array.from(
      new Set(friendships.map((f) => f.characterId)),
    );
    const characters = await this.characterRepo.find({
      where: { id: In(characterIds) },
    });
    const characterById = new Map(characters.map((c) => [c.id, c]));
    const result: {
      friendship: FriendshipEntity;
      character: CharacterEntity | null;
    }[] = [];
    for (const friendship of friendships) {
      const character = characterById.get(friendship.characterId);
      if (character) {
        result.push({ friendship, character });
      }
    }
    return result;
  }

  async setFriendStarred(
    characterId: string,
    starred: boolean,
  ): Promise<FriendshipEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });

    if (
      !friendship ||
      friendship.status === 'blocked' ||
      friendship.status === 'removed'
    ) {
      throw new AppError('SOCIAL_FRIEND_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Friend not found',
      });
    }

    friendship.isStarred = starred;
    friendship.starredAt = starred ? new Date() : null;
    const saved = await this.friendshipRepo.save(friendship);
    await this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'friendship_event',
      sourceSurface: 'social',
      sourceEntityType: 'friend_star',
      sourceEntityId: saved.id,
      dedupeKey: `friendship:star:${saved.id}:${saved.isStarred ? 'on' : 'off'}`,
      summaryText: starred
        ? `用户将 ${characterId} 设为星标好友。`
        : `用户取消了 ${characterId} 的星标好友。`,
      payload: {
        action: starred ? 'star_friend' : 'unstar_friend',
        characterId,
        friendshipId: saved.id,
        isStarred: saved.isStarred,
      },
      occurredAt: new Date(),
    });
    return saved;
  }

  async updateFriendProfile(
    characterId: string,
    payload: {
      remarkName?: string | null;
      tags?: string[] | null;
    },
  ): Promise<FriendshipEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });

    if (
      !friendship ||
      friendship.status === 'blocked' ||
      friendship.status === 'removed'
    ) {
      throw new AppError('SOCIAL_FRIEND_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Friend not found',
      });
    }

    const nextRemarkName = normalizeOptionalText(payload.remarkName);
    if (nextRemarkName && nextRemarkName.length > REMARK_NAME_MAX_BYTES) {
      throw new AppError('SOCIAL_REMARK_NAME_TOO_LONG', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Remark name is too long',
      });
    }
    const nextTags = normalizeTags(payload.tags);
    if (nextTags) {
      if (nextTags.length > TAGS_MAX_COUNT) {
        throw new AppError('SOCIAL_TAGS_TOO_MANY', {
          status: HttpStatus.BAD_REQUEST,
          legacyMessage: 'Too many tags',
        });
      }
      if (nextTags.some((tag) => tag.length > TAG_MAX_LENGTH)) {
        throw new AppError('SOCIAL_TAG_TOO_LONG', {
          status: HttpStatus.BAD_REQUEST,
          legacyMessage: 'Tag is too long',
        });
      }
    }
    friendship.remarkName = nextRemarkName;
    friendship.tags = nextTags;

    const saved = await this.friendshipRepo.save(friendship);
    await this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'friendship_event',
      sourceSurface: 'social',
      sourceEntityType: 'friend_profile_update',
      sourceEntityId: saved.id,
      dedupeKey: `friendship:profile:${saved.id}:${Date.now()}`,
      summaryText: `用户更新了联系人 ${characterId} 的备注或标签。`,
      payload: {
        action: 'update_friend_profile',
        characterId,
        friendshipId: saved.id,
        remarkName: saved.remarkName,
        tags: saved.tags ?? [],
      },
      occurredAt: new Date(),
    });
    return saved;
  }

  async getFriendCharacterIds(ownerId?: string): Promise<string[]> {
    const resolvedOwnerId =
      ownerId ?? (await this.worldOwnerService.getOwnerOrThrow()).id;
    await this.ensureDefaultFriendships(resolvedOwnerId);
    const friendships = await this.friendshipRepo.find({
      where: {
        ownerId: resolvedOwnerId,
        status: Not(In(['blocked', 'removed'])),
      },
    });
    return friendships.map((friendship) => friendship.characterId);
  }

  async isFriendCharacter(
    characterId: string,
    ownerId?: string,
  ): Promise<boolean> {
    const friendCharacterIds = await this.getFriendCharacterIds(ownerId);
    return friendCharacterIds.includes(characterId);
  }

  async getBlockedCharacters(): Promise<
    Array<{
      id: string;
      characterId: string;
      reason?: string;
      createdAt: Date;
    }>
  > {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const blocked = await this.friendshipRepo.find({
      where: { ownerId: owner.id, status: 'blocked' },
      order: { createdAt: 'DESC' },
    });

    return blocked.map((item) => ({
      id: item.id,
      characterId: item.characterId,
      reason: undefined,
      createdAt: item.createdAt,
    }));
  }

  async getBlockedCharacterIds(ownerId?: string): Promise<string[]> {
    const resolvedOwnerId =
      ownerId ?? (await this.worldOwnerService.getOwnerOrThrow()).id;
    const blocked = await this.friendshipRepo.find({
      where: { ownerId: resolvedOwnerId, status: 'blocked' },
      order: { createdAt: 'DESC' },
    });
    return blocked.map((item) => item.characterId);
  }

  /**
   * 把 `DEFAULT_FRIENDSHIP_CHARACTER_IDS` 列出的居民钉为该 owner 的好友。
   *
   * 这是"居民/默认好友/候选好友"三层模型中**唯一**会无条件建立 friendship 的入口
   * （三层模型详见 `built-in-character-presets.ts` 顶部）。其它路径（场景匹配、
   * 摇一摇、雷达）都要走 friend_request 同意流程。
   *
   * 幂等：已存在的 friendship 不会被覆盖，只补 region。
   */
  async ensureDefaultFriendships(ownerId?: string): Promise<void> {
    const resolvedOwnerId =
      ownerId ?? (await this.worldOwnerService.getOwnerOrThrow()).id;

    if (!DEFAULT_FRIENDSHIP_CHARACTER_IDS.length) {
      return;
    }

    // 原实现对 13 个默认角色逐条 findOneBy character + findOneBy friendship，
    // 每次 getFriends() 都额外 26 条 SQL（稳态没新写入也照打）。改成一次 IN()
    // 取齐两份数据后只对真正缺失/欠补的角色写 DB，常态下查询数从 26 退回到 2。
    const characters = await this.characterRepo.find({
      where: { id: In([...DEFAULT_FRIENDSHIP_CHARACTER_IDS]) },
    });
    if (!characters.length) {
      return;
    }
    const characterById = new Map(characters.map((c) => [c.id, c]));
    const existingFriendships = await this.friendshipRepo.find({
      where: {
        ownerId: resolvedOwnerId,
        characterId: In(characters.map((c) => c.id)),
      },
    });
    const existingByCharacterId = new Map(
      existingFriendships.map((f) => [f.characterId, f]),
    );

    for (const characterId of DEFAULT_FRIENDSHIP_CHARACTER_IDS) {
      const character = characterById.get(characterId);
      if (!character) {
        continue;
      }

      const existing = existingByCharacterId.get(characterId);
      if (!existing) {
        await this.friendshipRepo.save(
          this.friendshipRepo.create({
            ownerId: resolvedOwnerId,
            characterId,
            intimacyLevel:
              characterId === SELF_CHARACTER_ID ? 100 : 60,
            status: 'friend',
            region: character.region?.trim() || null,
          }),
        );
      } else if (
        (!existing.region || !existing.region.trim()) &&
        character.region?.trim()
      ) {
        existing.region = character.region.trim();
        await this.friendshipRepo.save(existing);
      }

      await this.narrativeService.ensureArc(character.id, character.name);

      this.initialMessageService.scheduleIfNeeded(resolvedOwnerId, character);
    }
  }

  async triggerSceneFriendRequest(
    scene: string,
    options?: { caller?: 'user' | 'scheduler' },
  ): Promise<{
    request: FriendRequestEntity | null;
    matchSource: SceneMatchSource;
  }> {
    const caller = options?.caller ?? 'user';
    // 走查 R1：直连接口曾接受 '' / null / undefined / 任意字符串，全部跌进
    // fallback 路径并把垃圾值写到 friend_requests.triggerScene，DB 里堆出 ''
    // 和 'invalid_scene_xxx' 这类脏行。统一在入口卡住非字符串/空串。
    if (typeof scene !== 'string' || !scene.trim()) {
      throw new AppError('SOCIAL_SCENE_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '请选择一个场景。',
      });
    }
    // 归一化场景 ID（cafe → coffee_shop 等）
    const normalizedScene: SceneId | null = normalizeScene(scene);
    // 走查 R3：用户主动调时只接受 16 个已知场景或它们的同义词。否则 triggerScene
    // 入库后会是 NULL，下面 daily-limit 查询的 `Not(IsNull())` 把这条漏掉，
    // 攻击面：反复 POST 一个未知 scene 就能绕开 cooldown。scheduler 旁路保留
    // 兼容（admin 可能把自定义场景塞进 sceneFriendRequestScenes，到时候归一不上
    // 也只是落 fallback 文案，不影响节流）。
    if (caller === 'user' && !normalizedScene) {
      throw new AppError('SOCIAL_SCENE_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '请选择一个场景。',
      });
    }
    const owner = await this.worldOwnerService.getOwnerOrThrow();

    const allPresets = listBuiltInCharacterPresets();

    // 走查 R1：用户主动调时按天 cap + 最小间隔卡住直连接口的滥用。scheduler 旁路。
    // 走查 R2：daily cap / cooldown 只看"用户主动场景相遇"产出的 friend_requests。
    // 以前用 triggerScene: Not(IsNull())，会把 shake_keep / shake / manual_add /
    // need_discovery_short_interval 这些其它入口的行一起算进 30/天预算 ——
    // 摇一摇一下午就能把场景相遇额度直接吃光，跟 yuanzui 现网 DB 实测一致
    // (29 shake_keep + 5 manual_add 都会被错误纳入)。改成 In([...SCENE_IDS])
    // 只认 16 个合法场景 ID，scheduler 也走同一组 ID 共享配额（量极小，不会挤压用户）。
    if (caller === 'user') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const dailyWhere = {
        ownerId: owner.id,
        triggerScene: In([...SCENE_IDS]),
        createdAt: MoreThanOrEqual(startOfDay),
      } as const;
      const [count, lastRequest] = await Promise.all([
        this.friendRequestRepo.count({ where: dailyWhere }),
        this.friendRequestRepo.findOne({
          where: dailyWhere,
          select: ['id', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
      ]);
      if (count >= SCENE_USER_DAILY_LIMIT) {
        throw new AppError('SOCIAL_SCENE_DAILY_LIMIT', {
          status: HttpStatus.TOO_MANY_REQUESTS,
          legacyMessage: '今天的场景相遇次数已经用完，明天再试试。',
        });
      }
      if (lastRequest) {
        const last = new Date(lastRequest.createdAt).getTime();
        const elapsed = Date.now() - last;
        if (elapsed < SCENE_USER_MIN_INTERVAL_MS) {
          throw new AppError('SOCIAL_SCENE_COOLDOWN', {
            status: HttpStatus.TOO_MANY_REQUESTS,
            legacyMessage: '别走太急，过一会再去下一个地方。',
          });
        }
      }
    }

    // 既要排除已经是好友的，也要排除已经有 pending 申请的（避免重复轰炸）。
    // 两条 find 互不依赖，并行省一个 RT。
    // 走查 R3-Round1：以前 pending 全捞，包括 expiresAt < now 的"僵尸 pending"。
    // friend_requests 没有 cron 帮它从 pending → expired，所以 24h 没动的 scene
    // 申请会永远卡住对应角色，不能再被场景相遇匹中（实测 yuanzui 91173587559732
    // 这个 world：53 pending 里 2 个 expiresAt 已过期，对应 2 个角色"永远被占用"）。
    // 显式加 expiresAt > now (null 兼容历史数据) 把 dead pending 当作"空位"释放。
    const now = new Date();
    const [existingFriendships, pendingRequests] = await Promise.all([
      this.friendshipRepo.find({ where: { ownerId: owner.id } }),
      this.friendRequestRepo.find({
        where: [
          {
            ownerId: owner.id,
            status: 'pending',
            expiresAt: MoreThan(now),
          },
          {
            ownerId: owner.id,
            status: 'pending',
            expiresAt: IsNull(),
          },
        ],
      }),
    ]);
    const friendIds = new Set(
      existingFriendships.map((friendship) => friendship.characterId),
    );
    const pendingIds = new Set(pendingRequests.map((r) => r.characterId));
    const occupied = new Set([...friendIds, ...pendingIds]);

    let matchSource: SceneMatchSource = 'none';
    let chosenPreset: (typeof allPresets)[number] | null = null;

    // 1) 场景匹配：基于角色实时属性打分
    if (normalizedScene) {
      const scored = matchCandidatesByScene(allPresets, normalizedScene).filter(
        (c) => !occupied.has(c.preset.id),
      );
      if (scored.length > 0) {
        chosenPreset = pickWeightedRandom(scored);
        matchSource = 'scene';
      }
    }

    // 2) 兜底：从所有未占用的预设里随机
    if (!chosenPreset) {
      const fallbackPool = allPresets.filter((p) => !occupied.has(p.id));
      if (fallbackPool.length > 0) {
        chosenPreset =
          fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        matchSource = 'fallback';
      }
    }

    if (!chosenPreset) {
      return { request: null, matchSource: 'none' };
    }

    const char = chosenPreset.character as CharacterEntity;

    // 给 AI prompt 的场景词：优先用归一化后中文标签，否则保留原始输入
    const promptScene = normalizedScene
      ? SCENE_LABEL_ZH[normalizedScene]
      : scene;

    // fallback 命中的角色与请求场景无关，用「不期而遇」的 shake 文案更连贯；
    // scene 命中才让 AI 顺着「在 X 里遇到你」开场。
    const isFallback = matchSource === 'fallback';
    const greetingFallback = isFallback
      ? await this.worldLanguage.buildShakeGreetingFallback(char.name)
      : await this.worldLanguage.buildSceneGreetingFallback({
          characterName: char.name,
          scene: promptScene,
        });
    let greeting = greetingFallback;
    const greetingTask = isFallback
      ? await this.worldLanguage.formatShakeGreetingTask()
      : await this.worldLanguage.formatFriendRequestGreetingTask(promptScene);
    const runtimeProfile =
      (await this.charactersService.getRuntimeProfileFromCharacter(char)) ??
      char.profile;
    try {
      const result = await this.ai.generateReply({
        profile: runtimeProfile,
        conversationHistory: [],
        userMessage: greetingTask,
        usageContext: {
          surface: 'app',
          scene: 'social_greeting_generate',
          scopeType: 'character',
          scopeId: char.id,
          scopeLabel: char.name,
          ownerId: owner.id,
          characterId: char.id,
          characterName: char.name,
        },
      });
      // 推理模型偶发会把"任务回声 + 候选评估"直接吐出来当回复。
      // sanitizeGreeting 检测到就回退到静态开场白，避免一长篇内心戏直接落到用户的好友申请里。
      greeting = sanitizeGreeting(result.text, greetingFallback);
    } catch {
      this.logger.debug('Falling back to default scene greeting');
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const req = this.friendRequestRepo.create({
      ownerId: owner.id,
      characterId: char.id,
      characterName: char.name,
      characterAvatar: char.avatar,
      // 走查 R1：以前是 `normalizedScene ?? scene`，未知场景会把原始字符串原封不动
      // 落库。统一只存归一化值（不认就丢空），避免 friend_requests.triggerScene 长出
      // 'invalid_scene_xxx' 这种脏值。
      triggerScene: normalizedScene ?? undefined,
      greeting,
      status: 'pending',
      expiresAt: tomorrow,
    });
    const saved = await this.friendRequestRepo.save(req);
    return { request: saved, matchSource };
  }

  async shake(): Promise<{
    character: CharacterEntity;
    greeting: string;
  } | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();

    // 从硬编码预设中选，不依赖 DB
    const allPresets = listCelebrityCharacterPresets();
    const existingFriendships = await this.friendshipRepo.find({
      where: { ownerId: owner.id },
    });
    const existingIds = new Set(
      existingFriendships.map((friendship) => friendship.characterId),
    );
    const available = allPresets.filter((p) => !existingIds.has(p.id));
    if (available.length === 0) return null;

    const preset = available[Math.floor(Math.random() * available.length)];
    const char = preset.character as CharacterEntity;

    const shakeFallback = await this.worldLanguage.buildShakeGreetingFallback(
      char.name,
    );
    let greeting = shakeFallback;
    const runtimeProfile =
      (await this.charactersService.getRuntimeProfileFromCharacter(char)) ??
      char.profile;
    try {
      const result = await this.ai.generateReply({
        profile: runtimeProfile,
        conversationHistory: [],
        userMessage: await this.worldLanguage.formatShakeGreetingTask(),
        usageContext: {
          surface: 'app',
          scene: 'social_greeting_generate',
          scopeType: 'character',
          scopeId: char.id,
          scopeLabel: char.name,
          ownerId: owner.id,
          characterId: char.id,
          characterName: char.name,
        },
      });
      greeting = sanitizeGreeting(result.text, shakeFallback);
    } catch {
      this.logger.debug('Falling back to default shake greeting');
    }

    return { character: char, greeting };
  }

  async sendFriendRequest(
    characterId: string,
    greeting: string,
    options?: {
      autoAccept?: boolean;
      expiresAt?: Date | null;
      triggerScene?: string;
      initiator?: 'user' | 'character' | 'system';
    },
  ): Promise<FriendRequestEntity> {
    const initiator =
      options?.initiator === 'character'
        ? 'character'
        : options?.initiator === 'system'
          ? 'system'
          : 'user';
    // 走查 Round 1：自我镜像 char-default-self 不能由用户主动加好友。
    // 前端 add-friend search 已按 relationshipType==='self' 过滤掉这一条结果，
    // 但直接打 /api/social/friend-requests/send 时后端会照样创建一条 pending
    // 请求（acceptAt 还会延迟自动通过），活成"自我加自我好友"的诡异 audit 行。
    // initiator==='user' 时拒绝；initiator==='character'/'system' 仍允许，因为
    // 系统初始化阶段会写入跟 self 的 friendship 行。
    if (characterId === SELF_CHARACTER_ID && initiator === 'user') {
      throw new AppError('SOCIAL_CANNOT_ADD_SELF', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Cannot send friend request to self mirror character',
      });
    }
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    // 预设角色首次添加好友时自动写入 DB；已在 DB 的角色（含管理员改过的）直接返回
    const char =
      (await this.charactersService.ensurePresetCharacterInstalled(
        characterId,
      )) ?? (await this.characterRepo.findOneBy({ id: characterId }));
    if (!char)
      throw new AppError('CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Character not found',
      });

    const existing = await this.friendRequestRepo.findOneBy({
      ownerId: owner.id,
      characterId,
      status: 'pending',
    });
    if (existing) {
      if (!options?.autoAccept) {
        if (
          initiator === 'user' &&
          (!existing.acceptAt || existing.acceptAt.getTime() === 0)
        ) {
          existing.acceptAt = new Date(
            Date.now() + (30 + Math.floor(Math.random() * 60)) * 1000,
          );
          await this.friendRequestRepo.save(existing);
        }
        return existing;
      }

      existing.status = 'accepted';
      existing.expiresAt = null;
      const savedExisting = await this.friendRequestRepo.save(existing);
      await this.activateFriendship(owner.id, char.id, char.name, {
        notifyConversation: true,
      });
      this.eventBus.emit(AppEvents.FRIEND_REQUEST_ACCEPTED, {
        requestId: savedExisting.id,
        characterId: char.id,
        ownerId: owner.id,
        acceptedAt: new Date(),
      });
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType: 'friend_request_auto_accept',
        sourceEntityId: savedExisting.id,
        dedupeKey: `friendship:auto-accept:${savedExisting.id}`,
        summaryText: `用户主动添加 ${char.name} 并直接成为好友。`,
        payload: {
          action: 'auto_accept_existing_request',
          requestId: savedExisting.id,
          characterId: char.id,
          characterName: char.name,
        },
        occurredAt: new Date(),
      });
      return savedExisting;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    let acceptAt: Date | null = null;
    if (!options?.autoAccept && initiator !== 'character') {
      const delaySeconds = await this.decideCharacterAcceptDelay(
        char,
        greeting,
        options?.triggerScene,
      );
      acceptAt = new Date(Date.now() + delaySeconds * 1000);
    }

    const req = this.friendRequestRepo.create({
      ownerId: owner.id,
      characterId,
      characterName: char.name,
      characterAvatar: char.avatar,
      // 走查 Round 1：/api/social/friend-requests/send 是用户在 + → 添加朋友 里
      // 主动搜索后点"添加"的入口，controller 不会传 triggerScene。原默认值在
      // !autoAccept 分支落到 'shake'，让这条 outbound 记录在 admin / debug 视图、
      // friend-request-scene-label 等所有 surface 都被打成「来自摇一摇」。摇一摇
      // 已经有自己的 shake-discovery.service 显式传 triggerScene='shake_keep'；
      // 这里 user-initiated send 的默认应该是 manual_add，跟 autoAccept 分支
      // 保持一致。
      triggerScene: options?.triggerScene?.trim() || 'manual_add',
      greeting,
      status: options?.autoAccept ? 'accepted' : 'pending',
      expiresAt: options?.autoAccept ? null : (options?.expiresAt ?? tomorrow),
      acceptAt: options?.autoAccept ? null : acceptAt,
    });
    const saved = await this.friendRequestRepo.save(req);

    if (options?.autoAccept) {
      await this.activateFriendship(owner.id, char.id, char.name, {
        notifyConversation: true,
      });
      this.eventBus.emit(AppEvents.FRIEND_REQUEST_ACCEPTED, {
        requestId: saved.id,
        characterId: char.id,
        ownerId: owner.id,
        acceptedAt: new Date(),
      });
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType: 'friend_request_auto_accept',
        sourceEntityId: saved.id,
        dedupeKey: `friendship:auto-accept:${saved.id}`,
        // 走查 Round 8：原来 shake_keep 和 manual_add 都打成「用户主动添加 X」，
        // 但 shake_keep 是用户摇一摇后系统自动落库，并不是用户挑了某个角色去加。
        // 这条 summary 会进 cyber-avatar 的 prompt context，AI 误以为用户主动选了
        // 谁，下一次摇一摇的 evidence 也会把它当"主动添加历史"参考。按 triggerScene
        // 区分两种语义。
        summaryText:
          req.triggerScene === 'shake_keep'
            ? `用户摇一摇随机遇到 ${char.name}，已自动加入通讯录。`
            : `用户主动添加 ${char.name} 并直接成为好友。`,
        payload: {
          action: 'auto_accept_friend_request',
          requestId: saved.id,
          characterId: char.id,
          characterName: char.name,
          triggerScene: req.triggerScene,
        },
        occurredAt: new Date(),
      });
    } else {
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType:
          initiator === 'character'
            ? 'friend_request_receive'
            : initiator === 'system'
              ? 'friend_request_auto_send'
              : 'friend_request_send',
        sourceEntityId: saved.id,
        dedupeKey: `friendship:${
          initiator === 'character'
            ? 'receive-request'
            : initiator === 'system'
              ? 'auto-send-request'
              : 'send-request'
        }:${saved.id}`,
        summaryText:
          initiator === 'character'
            ? `${char.name} 向用户发起了好友申请。`
            : initiator === 'system'
              ? `主动跟进替用户向 ${char.name} 发起了好友申请。`
              : `用户向 ${char.name} 发送了好友申请。`,
        payload: {
          action:
            initiator === 'character'
              ? 'receive_friend_request'
              : initiator === 'system'
                ? 'auto_send_friend_request'
                : 'send_friend_request',
          requestId: saved.id,
          characterId: char.id,
          characterName: char.name,
          triggerScene: req.triggerScene,
          initiator,
          greeting,
        },
        occurredAt: new Date(),
      });
    }

    return saved;
  }

  private async decideCharacterAcceptDelay(
    character: CharacterEntity,
    greeting: string,
    triggerScene?: string,
  ): Promise<number> {
    const fallbackDelay = () => 30 + Math.floor(Math.random() * 60);
    const personaSummary = [
      character.personality?.trim(),
      character.bio?.trim(),
      character.relationship?.trim(),
    ]
      .filter(Boolean)
      .slice(0, 3)
      .join('\n')
      .slice(0, 600);

    const prompt = `你是「${character.name}」。
角色档案：
${personaSummary || '（暂无更多信息）'}

刚刚有个陌生人向你发送了好友申请，开场白是：「${greeting?.trim() || '（对方没有写开场白）'}」。
触发场景：${triggerScene?.trim() || '通讯录主动添加'}

请根据你的性格和当时的状态，决定多快通过这个申请：
- "immediate"：几乎不犹豫，立刻通过（开朗、社交主动型）
- "short"：几分钟内通过（中性、礼貌型）
- "medium"：半小时到几小时后通过（慢热、内向、忙碌）
- "long"：要拖几小时甚至到次日才通过（高冷、谨慎、距离感强）

只输出一个 JSON：{"category": "immediate" | "short" | "medium" | "long", "reason": "一句话说明"}。`;

    try {
      const result = await this.ai.generateJsonObject({
        prompt,
        usageContext: {
          surface: 'app',
          scene: 'friend_request_accept_delay',
          scopeType: 'character',
          scopeId: character.id,
          scopeLabel: character.name,
          characterId: character.id,
          characterName: character.name,
        },
        maxTokens: 200,
        temperature: 0.6,
        fallback: { category: 'short' },
      });
      const category =
        typeof result.category === 'string'
          ? result.category.toLowerCase().trim()
          : 'short';
      const reason =
        typeof result.reason === 'string' ? result.reason.slice(0, 120) : '';
      const delaySeconds = this.delayCategoryToSeconds(category);
      this.logger.debug(
        `acceptDelay character=${character.name} category=${category} delay=${delaySeconds}s reason=${reason}`,
      );
      return delaySeconds;
    } catch (error) {
      this.logger.warn(
        `decideCharacterAcceptDelay failed for ${character.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallbackDelay();
    }
  }

  private delayCategoryToSeconds(category: string): number {
    const jitter = (min: number, max: number) =>
      min + Math.floor(Math.random() * Math.max(1, max - min));
    switch (category) {
      case 'immediate':
        return jitter(0, 16);
      case 'medium':
        return jitter(1800, 7200);
      case 'long':
        return jitter(14400, 43200);
      case 'short':
      default:
        return jitter(60, 300);
    }
  }

  async blockCharacter(
    characterId: string,
    reason?: string,
  ): Promise<{
    id: string;
    characterId: string;
    reason?: string;
    createdAt: Date;
  }> {
    void reason;
    // 走查 Round 1：char-default-self 是用户在隐界里的"自我镜像"角色，本质上
    // 就是用户自己。允许拉黑会让自己跟自己的聊天 / 朋友圈链路全废（chatOnly /
    // 朋友圈拉黑等过滤都跟着启效），unblock 之后还要走完整 friend 状态恢复。
    // 走 add-friend search 时前端已按 relationshipType==='self' 过滤掉，
    // 但 /api/social/block 端口没拦，后端兜底拒绝。
    if (characterId === SELF_CHARACTER_ID) {
      throw new AppError('SOCIAL_CANNOT_BLOCK_SELF', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Cannot block self mirror character',
      });
    }
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });

    if (existing) {
      existing.status = 'blocked';
      existing.isStarred = false;
      existing.starredAt = null;
      const saved = await this.friendshipRepo.save(existing);
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType: 'friend_block',
        sourceEntityId: saved.id,
        dedupeKey: `friendship:block:${saved.id}`,
        summaryText: `用户拉黑了联系人 ${characterId}。`,
        payload: {
          action: 'block_friend',
          characterId,
          friendshipId: saved.id,
        },
        occurredAt: new Date(),
      });
      return {
        id: saved.id,
        characterId: saved.characterId,
        reason: undefined,
        createdAt: saved.createdAt,
      };
    }

    const saved = await this.friendshipRepo.save(
      this.friendshipRepo.create({
        ownerId: owner.id,
        characterId,
        intimacyLevel: 0,
        status: 'blocked',
      }),
    );
    await this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'friendship_event',
      sourceSurface: 'social',
      sourceEntityType: 'friend_block',
      sourceEntityId: saved.id,
      dedupeKey: `friendship:block:${saved.id}`,
      summaryText: `用户拉黑了联系人 ${characterId}。`,
      payload: {
        action: 'block_friend',
        characterId,
        friendshipId: saved.id,
      },
      occurredAt: new Date(),
    });

    return {
      id: saved.id,
      characterId: saved.characterId,
      reason: undefined,
      createdAt: saved.createdAt,
    };
  }

  async unblockCharacter(characterId: string): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });
    if (!existing || existing.status !== 'blocked') {
      return;
    }

    if ((DEFAULT_CHARACTER_IDS as readonly string[]).includes(characterId)) {
      existing.status = 'friend';
      await this.friendshipRepo.save(existing);
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType: 'friend_unblock',
        sourceEntityId: existing.id,
        dedupeKey: `friendship:unblock:${existing.id}`,
        summaryText: `用户取消了联系人 ${characterId} 的拉黑状态。`,
        payload: {
          action: 'unblock_friend',
          characterId,
          friendshipId: existing.id,
        },
        occurredAt: new Date(),
      });
      return;
    }

    // TypeORM .remove() 会把 entity 的 id 字段清空（变 undefined），下面
    // captureSignal 用 existing.id 就会写出 NOT NULL constraint failed:
    // cyber_avatar_signals.sourceEntityId。先把 id 拷出来再删。
    const removedFriendshipId = existing.id;
    await this.friendshipRepo.remove(existing);
    await this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'friendship_event',
      sourceSurface: 'social',
      sourceEntityType: 'friend_unblock',
      sourceEntityId: removedFriendshipId,
      dedupeKey: `friendship:unblock:${removedFriendshipId}`,
      summaryText: `用户取消了联系人 ${characterId} 的拉黑状态。`,
      payload: {
        action: 'unblock_friend',
        characterId,
        friendshipId: removedFriendshipId,
      },
      occurredAt: new Date(),
    });
  }

  async deleteFriend(characterId: string): Promise<{ success: true }> {
    // 走查 Round 2：char-default-self（"我自己" 自我镜像）是默认好友，
    // ensureDefaultFriendships 只对 friendship 不存在时补行、status='removed'
    // 的旧行不会被还原。如果用户在批量管理里全选 + 删除把 self 一起带进 deleteFriend，
    // 自己的镜像永久变 status='removed'，通讯录目录 / 朋友圈自己页 / 自我对谈
    // 全部链路断开且不会自愈。后端兜底拒绝。
    if (characterId === SELF_CHARACTER_ID) {
      throw new AppError('SOCIAL_CANNOT_DELETE_SELF', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'Cannot delete self mirror character from contacts',
      });
    }
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });

    if (
      !existing ||
      existing.status === 'blocked' ||
      existing.status === 'removed'
    ) {
      return { success: true };
    }

    existing.status = 'removed';
    existing.isStarred = false;
    existing.starredAt = null;
    // 走查新 R1：原来 deleteFriend 只翻 status='removed'，remarkName/tags 留在
    // 行里。activateFriendship 重新加好友时只把 status 改回 'friend'，备注/
    // 标签照样冒出来——跟微信"删好友再加=清白"的心智模型相悖，且会让用户
    // 在删除前忘了的"对方真名X"备注在 reaccept 后泄回。一并清掉。
    existing.remarkName = null;
    existing.tags = null;
    const saved = await this.friendshipRepo.save(existing);
    await this.cyberAvatar.captureSignal({
      ownerId: owner.id,
      signalType: 'friendship_event',
      sourceSurface: 'social',
      sourceEntityType: 'friend_remove',
      sourceEntityId: saved.id,
      dedupeKey: `friendship:remove:${saved.id}`,
      summaryText: `用户删除了联系人 ${characterId}。`,
      payload: {
        action: 'remove_friend',
        characterId,
        friendshipId: saved.id,
      },
      occurredAt: new Date(),
    });
    return { success: true };
  }

  async updateFriendPermissions(
    characterId: string,
    payload: {
      momentsHiddenFromMe?: boolean;
      momentsHiddenFromThem?: boolean;
      chatOnly?: boolean;
    },
  ): Promise<FriendshipEntity> {
    // 走查 R1：char-default-self（"我自己" 自我镜像）允许设置可见性 / 仅聊天
    // 等权限毫无业务意义且会破坏自我对谈/自朋友圈链路（chatOnly 触发 feed 过滤、
    // momentsHiddenFromMe 让自己看不到自己的朋友圈）。UI 已经在 add-friend search
    // 和 management 朋友权限列表过滤掉 self，但端口本身没拦——客户端攻击 /
    // 手工 curl 仍可以打。后端兜底拒绝，跟 blockCharacter / deleteFriend 自防
    // 一致。
    if (characterId === SELF_CHARACTER_ID) {
      throw new AppError('SOCIAL_CANNOT_UPDATE_SELF_PERMISSIONS', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage:
          'Cannot update permissions on self mirror character',
      });
    }
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });

    if (
      !friendship ||
      friendship.status === 'blocked' ||
      friendship.status === 'removed'
    ) {
      throw new AppError('SOCIAL_FRIEND_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Friend not found',
      });
    }

    if (typeof payload.momentsHiddenFromMe === 'boolean') {
      friendship.momentsHiddenFromMe = payload.momentsHiddenFromMe;
    }
    if (typeof payload.momentsHiddenFromThem === 'boolean') {
      friendship.momentsHiddenFromThem = payload.momentsHiddenFromThem;
    }
    if (typeof payload.chatOnly === 'boolean') {
      friendship.chatOnly = payload.chatOnly;
    }

    return this.friendshipRepo.save(friendship);
  }

  async bulkFriendshipAction(payload: {
    characterIds: string[];
    action: 'add-tag' | 'remove-tag' | 'star' | 'unstar' | 'delete' | 'block';
    tag?: string;
  }): Promise<{ updated: number; failed: string[] }> {
    const ids = Array.from(new Set(payload.characterIds.filter(Boolean)));
    const failed: string[] = [];
    let updated = 0;

    for (const characterId of ids) {
      try {
        switch (payload.action) {
          case 'star':
            await this.setFriendStarred(characterId, true);
            break;
          case 'unstar':
            await this.setFriendStarred(characterId, false);
            break;
          case 'delete':
            await this.deleteFriend(characterId);
            break;
          case 'block':
            await this.blockCharacter(characterId);
            break;
          case 'add-tag': {
            const tag = payload.tag?.trim();
            if (!tag)
              throw new AppError('SOCIAL_TAG_REQUIRED', {
                status: HttpStatus.BAD_REQUEST,
                legacyMessage: 'tag required',
              });
            const owner = await this.worldOwnerService.getOwnerOrThrow();
            const fs = await this.friendshipRepo.findOneBy({
              ownerId: owner.id,
              characterId,
            });
            if (!fs || fs.status === 'blocked' || fs.status === 'removed') {
              throw new AppError('SOCIAL_FRIEND_NOT_FOUND', {
                status: HttpStatus.NOT_FOUND,
                legacyMessage: 'Friend not found',
              });
            }
            const next = normalizeTags([...(fs.tags ?? []), tag]);
            await this.updateFriendProfile(characterId, {
              remarkName: fs.remarkName ?? null,
              tags: next,
            });
            break;
          }
          case 'remove-tag': {
            const tag = payload.tag?.trim();
            if (!tag)
              throw new AppError('SOCIAL_TAG_REQUIRED', {
                status: HttpStatus.BAD_REQUEST,
                legacyMessage: 'tag required',
              });
            const owner = await this.worldOwnerService.getOwnerOrThrow();
            const fs = await this.friendshipRepo.findOneBy({
              ownerId: owner.id,
              characterId,
            });
            if (!fs || fs.status === 'blocked' || fs.status === 'removed') {
              throw new AppError('SOCIAL_FRIEND_NOT_FOUND', {
                status: HttpStatus.NOT_FOUND,
                legacyMessage: 'Friend not found',
              });
            }
            const next = normalizeTags(
              (fs.tags ?? []).filter((t) => t !== tag),
            );
            await this.updateFriendProfile(characterId, {
              remarkName: fs.remarkName ?? null,
              tags: next,
            });
            break;
          }
          default:
            throw new AppError('SOCIAL_TAG_BATCH_UNKNOWN_ACTION', {
              status: HttpStatus.BAD_REQUEST,
              params: { action: String(payload.action) },
              legacyMessage: `Unknown action: ${payload.action as string}`,
            });
        }
        updated += 1;
      } catch (error) {
        this.logger.warn(
          `bulkFriendshipAction failed for ${characterId}: ${(error as Error).message}`,
        );
        failed.push(characterId);
      }
    }

    return { updated, failed };
  }

  async updateIntimacy(characterId: string, delta: number): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });
    if (!friendship) return;
    friendship.intimacyLevel = Math.min(
      100,
      Math.max(0, friendship.intimacyLevel + delta),
    );
    friendship.lastInteractedAt = new Date();
    await this.friendshipRepo.save(friendship);
  }

  @OnEvent(AppEvents.USER_SENT_MESSAGE, { async: true })
  async handleUserSentMessage(payload: {
    ownerId: string;
    characterId: string;
    conversationId: string;
  }): Promise<void> {
    if (!payload?.characterId) return;
    try {
      await this.recordSparkInteraction(payload.characterId);
    } catch (err) {
      this.logger.warn(
        `recordSparkInteraction failed for ${payload.characterId}: ${(err as Error).message}`,
      );
    }
  }

  async recordSparkInteraction(
    characterId: string,
  ): Promise<{ streak: number; tier: number; isNew: boolean }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });
    if (!friendship) return { streak: 0, tier: 0, isNew: false };

    const now = new Date();
    const today = formatLocalDate(now);
    const yesterday = formatLocalDate(addDays(now, -1));

    if (friendship.sparkLastDay === today) {
      return {
        streak: friendship.sparkStreak,
        tier: getSparkTier(friendship.sparkStreak),
        isNew: false,
      };
    }

    const prevStreak = friendship.sparkStreak ?? 0;
    let nextStreak: number;
    let startedAt: Date | null;
    if (friendship.sparkLastDay === yesterday) {
      nextStreak = prevStreak + 1;
      startedAt = friendship.sparkStartedAt ?? now;
    } else {
      nextStreak = 1;
      startedAt = now;
    }

    friendship.sparkStreak = nextStreak;
    friendship.sparkStartedAt = startedAt;
    friendship.sparkLastDay = today;
    friendship.lastInteractedAt = now;
    await this.friendshipRepo.save(friendship);

    const prevTier = getSparkTier(prevStreak);
    const currTier = getSparkTier(nextStreak);
    if (currTier > prevTier) {
      this.eventBus.emit(AppEvents.SPARK_UPGRADED, {
        ownerId: owner.id,
        characterId,
        streak: nextStreak,
        tier: currTier,
      });
    }

    return { streak: nextStreak, tier: currTier, isNew: prevStreak < 3 && nextStreak >= 3 };
  }

  async resetExpiredSparks(): Promise<number> {
    const now = new Date();
    const today = formatLocalDate(now);
    const yesterday = formatLocalDate(addDays(now, -1));

    const stale = await this.friendshipRepo
      .createQueryBuilder('f')
      .where('f.sparkStreak > 0')
      .andWhere(
        '(f.sparkLastDay IS NULL OR (f.sparkLastDay <> :today AND f.sparkLastDay <> :yesterday))',
        { today, yesterday },
      )
      .select(['f.id', 'f.ownerId', 'f.characterId'])
      .getMany();

    if (stale.length === 0) return 0;

    await this.friendshipRepo
      .createQueryBuilder()
      .update(FriendshipEntity)
      .set({ sparkStreak: 0, sparkStartedAt: null })
      .whereInIds(stale.map((f) => f.id))
      .andWhere(
        '(sparkLastDay IS NULL OR (sparkLastDay <> :today AND sparkLastDay <> :yesterday))',
        { today, yesterday },
      )
      .execute();

    for (const f of stale) {
      this.eventBus.emit(AppEvents.SPARK_RESET, {
        ownerId: f.ownerId,
        characterId: f.characterId,
      });
    }
    return stale.length;
  }

  private async activateFriendship(
    ownerId: string,
    characterId: string,
    characterName: string,
    options?: { notifyConversation?: boolean },
  ): Promise<FriendshipEntity> {
    const existing = await this.friendshipRepo.findOneBy({
      ownerId,
      characterId,
    });
    let friendship: FriendshipEntity;
    let shouldNotifyConversation = options?.notifyConversation === true;

    const character = await this.characterRepo.findOneBy({ id: characterId });
    const characterRegion = character?.region?.trim() || null;

    if (existing) {
      if (ACTIVE_FRIENDSHIP_STATUSES.has(existing.status)) {
        friendship = existing;
        shouldNotifyConversation = false;
      } else {
        existing.status = 'friend';
        if ((!existing.region || !existing.region.trim()) && characterRegion) {
          existing.region = characterRegion;
        }
        friendship = await this.friendshipRepo.save(existing);
      }
    } else {
      friendship = await this.friendshipRepo.save(
        this.friendshipRepo.create({
          ownerId,
          characterId,
          intimacyLevel: 10,
          status: 'friend',
          region: characterRegion,
        }),
      );
    }

    await this.narrativeService.ensureArc(characterId, characterName);

    if (shouldNotifyConversation) {
      const conversation =
        await this.chatService.getOrCreateConversation(characterId);
      await this.chatService.saveSystemMessage(
        conversation.id,
        await this.buildFriendAddedSystemMessage(characterName),
      );
    }

    return friendship;
  }

  private async buildFriendAddedSystemMessage(characterName: string) {
    const language = await this.worldLanguage.getLanguage();
    switch (language) {
      case 'en-US':
        return `You added ${characterName}. You can start chatting now.`;
      case 'ja-JP':
        return `${characterName}を追加しました。これでチャットを始められます。`;
      case 'ko-KR':
        return `${characterName}을(를) 추가했어요. 이제 채팅을 시작할 수 있어요.`;
      case 'zh-CN':
      default:
        return `你已添加了${characterName}，现在可以开始聊天了。`;
    }
  }
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeTags(tags?: string[] | null) {
  if (!tags?.length) {
    return null;
  }

  const normalized = [
    ...new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
  ];
  return normalized.length ? normalized : null;
}
// i18n-ignore-end
