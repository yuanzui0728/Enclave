import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { FriendshipEntity } from './friendship.entity';
import { FriendRequestEntity } from './friend-request.entity';
import { AIRelationshipEntity } from './ai-relationship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { NarrativeService } from '../narrative/narrative.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  DEFAULT_CHARACTER_IDS,
  SELF_CHARACTER_ID,
} from '../characters/default-characters';
import { ChatService } from '../chat/chat.service';
import { CharactersService } from '../characters/characters.service';
import { listCelebrityCharacterPresets } from '../characters/celebrity-character-presets';
import { AppEvents, EventBusService } from '../events/event-bus.service';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';

const ACTIVE_FRIENDSHIP_STATUSES = new Set(['friend', 'close', 'best']);

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
  ) {}

  async getPendingRequests(): Promise<FriendRequestEntity[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.friendRequestRepo.find({
      where: { ownerId: owner.id, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async acceptRequest(requestId: string): Promise<FriendshipEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const req = await this.friendRequestRepo.findOneBy({
      id: requestId,
      ownerId: owner.id,
    });
    if (!req) throw new Error('Request not found');

    const shouldNotifyConversation = req.status !== 'accepted';
    if (shouldNotifyConversation) {
      req.status = 'accepted';
      await this.friendRequestRepo.save(req);
    }

    const friendship = await this.activateFriendship(
      owner.id,
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
        ownerId: owner.id,
        acceptedAt: new Date(),
      });
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType: 'friend_request_accept',
        sourceEntityId: req.id,
        dedupeKey: `friendship:accept:${req.id}`,
        summaryText: `用户接受了来自 ${req.characterName} 的好友请求。`,
        payload: {
          action: 'accept_request',
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

    for (const characterId of DEFAULT_CHARACTER_IDS) {
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
            intimacyLevel: characterId === SELF_CHARACTER_ID ? 100 : 60,
            status: 'friend',
          }),
        );
      }

      await this.narrativeService.ensureArc(character.id, character.name);
    }
  }

  async triggerSceneFriendRequest(
    scene: string,
  ): Promise<FriendRequestEntity | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();

    // 从硬编码预设中按场景过滤，不依赖 DB 是否已安装
    const allPresets = listCelebrityCharacterPresets();
    const candidates = allPresets.filter((p) =>
      (p.character.triggerScenes ?? []).includes(scene),
    );
    if (candidates.length === 0) return null;

    const existingFriendships = await this.friendshipRepo.find({
      where: { ownerId: owner.id },
    });
    const existingIds = new Set(
      existingFriendships.map((friendship) => friendship.characterId),
    );
    const available = candidates.filter((p) => !existingIds.has(p.id));
    if (available.length === 0) return null;

    const preset = available[Math.floor(Math.random() * available.length)];
    const char = preset.character as CharacterEntity;

    const existing = await this.friendRequestRepo.findOneBy({
      ownerId: owner.id,
      characterId: char.id,
      status: 'pending',
    });
    if (existing) return null;

    let greeting = `Hi, I'm ${char.name}. We crossed paths at ${scene}. Want to connect?`;
    const runtimeProfile =
      (await this.charactersService.getRuntimeProfileFromCharacter(char)) ??
      char.profile;
    try {
      const result = await this.ai.generateReply({
        profile: runtimeProfile,
        conversationHistory: [],
        userMessage: `Write a short friend request greeting after meeting someone in ${scene}. Keep it under 30 words.`,
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
      triggerScene: scene,
      greeting,
      status: 'pending',
      expiresAt: tomorrow,
    });
    return this.friendRequestRepo.save(req);
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

    let greeting = `Hi, I'm ${char.name}. We just met in Yinjie.`;
    const runtimeProfile =
      (await this.charactersService.getRuntimeProfileFromCharacter(char)) ??
      char.profile;
    try {
      const result = await this.ai.generateReply({
        profile: runtimeProfile,
        conversationHistory: [],
        userMessage:
          'Write a short, warm self-introduction after a random encounter. Keep it under 25 words.',
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
      initiator?: 'user' | 'character';
    },
  ): Promise<FriendRequestEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    // 预设角色首次添加好友时自动写入 DB；已在 DB 的角色（含管理员改过的）直接返回
    const char =
      (await this.charactersService.ensurePresetCharacterInstalled(
        characterId,
      )) ?? (await this.characterRepo.findOneBy({ id: characterId }));
    if (!char) throw new Error('Character not found');

    const existing = await this.friendRequestRepo.findOneBy({
      ownerId: owner.id,
      characterId,
      status: 'pending',
    });
    if (existing) {
      if (!options?.autoAccept) {
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
      const initiator = options?.initiator === 'character' ? 'character' : 'user';
      await this.cyberAvatar.captureSignal({
        ownerId: owner.id,
        signalType: 'friendship_event',
        sourceSurface: 'social',
        sourceEntityType:
          initiator === 'character'
            ? 'friend_request_receive'
            : 'friend_request_send',
        sourceEntityId: saved.id,
        dedupeKey: `friendship:${
          initiator === 'character' ? 'receive-request' : 'send-request'
        }:${saved.id}`,
        summaryText:
          initiator === 'character'
            ? `${char.name} 向用户发起了好友申请。`
            : `用户向 ${char.name} 发送了好友申请。`,
        payload: {
          action:
            initiator === 'character'
              ? 'receive_friend_request'
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

    if (existing) {
      if (ACTIVE_FRIENDSHIP_STATUSES.has(existing.status)) {
        friendship = existing;
        shouldNotifyConversation = false;
      } else {
        existing.status = 'friend';
        friendship = await this.friendshipRepo.save(existing);
      }
    } else {
      friendship = await this.friendshipRepo.save(
        this.friendshipRepo.create({
          ownerId,
          characterId,
          intimacyLevel: 10,
          status: 'friend',
        }),
      );
    }

    await this.narrativeService.ensureArc(characterId, characterName);

    if (shouldNotifyConversation) {
      const conversation =
        await this.chatService.getOrCreateConversation(characterId);
      await this.chatService.saveSystemMessage(
        conversation.id,
        `你已添加了${characterName}，现在可以开始聊天了。`,
      );
    }

    return friendship;
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
