import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm';
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
  SCENE_LABEL_ZH,
  matchCandidatesByScene,
  normalizeScene,
  pickWeightedRandom,
  type SceneId,
  type SceneMatchSource,
} from './scene-matching';
import { ChatService } from '../chat/chat.service';
import { CharactersService } from '../characters/characters.service';
import { AppEvents, EventBusService } from '../events/event-bus.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { WorldLanguageService } from '../config/world-language.service';
import { addDays, formatLocalDate, getSparkTier } from './spark-utils';

const ACTIVE_FRIENDSHIP_STATUSES = new Set(['friend', 'close', 'best']);
export const DEFAULT_FRIENDSHIP_CHARACTER_IDS = [...DEFAULT_CHARACTER_IDS];

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
    if (!req) throw new Error('Request not found');

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
      throw new Error('Request not found');
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
    const result = await Promise.all(
      friendships.map(async (friendship) => ({
        friendship,
        character: await this.characterRepo.findOneBy({
          id: friendship.characterId,
        }),
      })),
    );
    return result.filter((entry) => entry.character !== null);
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
      throw new Error('Friend not found');
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
      throw new Error('Friend not found');
    }

    friendship.remarkName = normalizeOptionalText(payload.remarkName);
    friendship.tags = normalizeTags(payload.tags);

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

  async ensureDefaultFriendships(ownerId?: string): Promise<void> {
    const resolvedOwnerId =
      ownerId ?? (await this.worldOwnerService.getOwnerOrThrow()).id;

    for (const characterId of DEFAULT_FRIENDSHIP_CHARACTER_IDS) {
      const character = await this.characterRepo.findOneBy({ id: characterId });
      if (!character) {
        continue;
      }

      const existing = await this.friendshipRepo.findOneBy({
        ownerId: resolvedOwnerId,
        characterId,
      });
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
    }
  }

  async triggerSceneFriendRequest(scene: string): Promise<{
    request: FriendRequestEntity | null;
    matchSource: SceneMatchSource;
  }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();

    // 归一化场景 ID（cafe → coffee_shop 等）
    const normalizedScene: SceneId | null = normalizeScene(scene);
    const allPresets = listBuiltInCharacterPresets();

    // 既要排除已经是好友的，也要排除已经有 pending 申请的（避免重复轰炸）。
    const existingFriendships = await this.friendshipRepo.find({
      where: { ownerId: owner.id },
    });
    const friendIds = new Set(
      existingFriendships.map((friendship) => friendship.characterId),
    );
    const pendingRequests = await this.friendRequestRepo.find({
      where: { ownerId: owner.id, status: 'pending' },
    });
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
    let greeting = isFallback
      ? await this.worldLanguage.buildShakeGreetingFallback(char.name)
      : await this.worldLanguage.buildSceneGreetingFallback({
          characterName: char.name,
          scene: promptScene,
        });
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
      greeting = result.text;
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
      triggerScene: normalizedScene ?? scene,
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

    let greeting = await this.worldLanguage.buildShakeGreetingFallback(
      char.name,
    );
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
      greeting = result.text;
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
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    // 预设角色首次添加好友时自动写入 DB；已在 DB 的角色（含管理员改过的）直接返回
    const char =
      (await this.charactersService.ensurePresetCharacterInstalled(
        characterId,
      )) ?? (await this.characterRepo.findOneBy({ id: characterId }));
    if (!char) throw new Error('Character not found');

    const initiator =
      options?.initiator === 'character'
        ? 'character'
        : options?.initiator === 'system'
          ? 'system'
          : 'user';

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
      triggerScene:
        options?.triggerScene?.trim() ||
        (options?.autoAccept ? 'manual_add' : 'shake'),
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
        summaryText: `用户主动添加 ${char.name} 并直接成为好友。`,
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

    await this.friendshipRepo.remove(existing);
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
  }

  async deleteFriend(characterId: string): Promise<{ success: true }> {
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
      throw new Error('Friend not found');
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
            if (!tag) throw new Error('tag required');
            const owner = await this.worldOwnerService.getOwnerOrThrow();
            const fs = await this.friendshipRepo.findOneBy({
              ownerId: owner.id,
              characterId,
            });
            if (!fs || fs.status === 'blocked' || fs.status === 'removed') {
              throw new Error('Friend not found');
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
            if (!tag) throw new Error('tag required');
            const owner = await this.worldOwnerService.getOwnerOrThrow();
            const fs = await this.friendshipRepo.findOneBy({
              ownerId: owner.id,
              characterId,
            });
            if (!fs || fs.status === 'blocked' || fs.status === 'removed') {
              throw new Error('Friend not found');
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
            throw new Error(`Unknown action: ${payload.action as string}`);
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
