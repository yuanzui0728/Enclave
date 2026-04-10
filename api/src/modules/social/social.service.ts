import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { FriendshipEntity } from './friendship.entity';
import { FriendRequestEntity } from './friend-request.entity';
import { AIRelationshipEntity } from './ai-relationship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { NarrativeService } from '../narrative/narrative.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { DEFAULT_CHARACTER_IDS } from '../characters/default-characters';

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
    const req = await this.friendRequestRepo.findOneBy({ id: requestId, ownerId: owner.id });
    if (!req) throw new Error('Request not found');

    req.status = 'accepted';
    await this.friendRequestRepo.save(req);

    const existing = await this.friendshipRepo.findOneBy({ ownerId: owner.id, characterId: req.characterId });
    if (existing) {
      await this.narrativeService.ensureArc(req.characterId, req.characterName);
      return existing;
    }

    const friendship = this.friendshipRepo.create({
      ownerId: owner.id,
      characterId: req.characterId,
      intimacyLevel: 10,
    });
    const saved = await this.friendshipRepo.save(friendship);
    await this.narrativeService.ensureArc(req.characterId, req.characterName);
    return saved;
  }

  async declineRequest(requestId: string): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.friendRequestRepo.update({ id: requestId, ownerId: owner.id }, { status: 'declined' });
  }

  async getFriends(): Promise<{ friendship: FriendshipEntity; character: CharacterEntity | null }[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    await this.ensureDefaultFriendships(owner.id);
    const friendships = await this.friendshipRepo.find({
      where: { ownerId: owner.id, status: Not('blocked') },
    });
    const result = await Promise.all(
      friendships.map(async (friendship) => ({
        friendship,
        character: await this.characterRepo.findOneBy({ id: friendship.characterId }),
      })),
    );
    return result.filter((entry) => entry.character !== null);
  }

  async setFriendStarred(characterId: string, starred: boolean): Promise<FriendshipEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({ ownerId: owner.id, characterId });

    if (!friendship || friendship.status === 'blocked') {
      throw new Error('Friend not found');
    }

    friendship.isStarred = starred;
    friendship.starredAt = starred ? new Date() : null;
    return this.friendshipRepo.save(friendship);
  }

  async updateFriendProfile(
    characterId: string,
    payload: {
      remarkName?: string | null;
      region?: string | null;
      source?: string | null;
      tags?: string[] | null;
    },
  ): Promise<FriendshipEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({ ownerId: owner.id, characterId });

    if (!friendship || friendship.status === 'blocked') {
      throw new Error('Friend not found');
    }

    friendship.remarkName = normalizeOptionalText(payload.remarkName);
    friendship.region = normalizeOptionalText(payload.region);
    friendship.source = normalizeOptionalText(payload.source);
    friendship.tags = normalizeTags(payload.tags);

    return this.friendshipRepo.save(friendship);
  }

  async getFriendCharacterIds(ownerId?: string): Promise<string[]> {
    const resolvedOwnerId = ownerId ?? (await this.worldOwnerService.getOwnerOrThrow()).id;
    await this.ensureDefaultFriendships(resolvedOwnerId);
    const friendships = await this.friendshipRepo.find({
      where: { ownerId: resolvedOwnerId, status: Not('blocked') },
    });
    return friendships.map((friendship) => friendship.characterId);
  }

  async isFriendCharacter(characterId: string, ownerId?: string): Promise<boolean> {
    const friendCharacterIds = await this.getFriendCharacterIds(ownerId);
    return friendCharacterIds.includes(characterId);
  }

  async getBlockedCharacters(): Promise<Array<{
    id: string;
    characterId: string;
    reason?: string;
    createdAt: Date;
  }>> {
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
    const resolvedOwnerId = ownerId ?? (await this.worldOwnerService.getOwnerOrThrow()).id;
    const blocked = await this.friendshipRepo.find({
      where: { ownerId: resolvedOwnerId, status: 'blocked' },
      order: { createdAt: 'DESC' },
    });
    return blocked.map((item) => item.characterId);
  }

  async ensureDefaultFriendships(ownerId?: string): Promise<void> {
    const resolvedOwnerId = ownerId ?? (await this.worldOwnerService.getOwnerOrThrow()).id;

    for (const characterId of DEFAULT_CHARACTER_IDS) {
      const character = await this.characterRepo.findOneBy({ id: characterId });
      if (!character) {
        continue;
      }

      const existing = await this.friendshipRepo.findOneBy({ ownerId: resolvedOwnerId, characterId });
      if (!existing) {
        await this.friendshipRepo.save(
          this.friendshipRepo.create({
            ownerId: resolvedOwnerId,
            characterId,
            intimacyLevel: characterId === DEFAULT_CHARACTER_IDS[0] ? 100 : 60,
            status: 'friend',
          }),
        );
      }

      await this.narrativeService.ensureArc(character.id, character.name);
    }
  }

  async triggerSceneFriendRequest(scene: string): Promise<FriendRequestEntity | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const chars = await this.characterRepo.find();
    const candidates = chars.filter((character) => character.triggerScenes?.includes(scene));
    if (candidates.length === 0) return null;

    const existingFriendships = await this.friendshipRepo.find({ where: { ownerId: owner.id } });
    const existingIds = new Set(existingFriendships.map((friendship) => friendship.characterId));
    const available = candidates.filter((character) => !existingIds.has(character.id));
    if (available.length === 0) return null;

    const char = available[Math.floor(Math.random() * available.length)];

    const existing = await this.friendRequestRepo.findOneBy({ ownerId: owner.id, characterId: char.id, status: 'pending' });
    if (existing) return null;

    let greeting = `Hi, I'm ${char.name}. We crossed paths at ${scene}. Want to connect?`;
    try {
      const result = await this.ai.generateReply({
        profile: char.profile,
        conversationHistory: [],
        userMessage: `Write a short friend request greeting after meeting someone in ${scene}. Keep it under 30 words.`,
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

  async shake(): Promise<{ character: CharacterEntity; greeting: string } | null> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const all = await this.characterRepo.find();
    const existingFriendships = await this.friendshipRepo.find({ where: { ownerId: owner.id } });
    const existingIds = new Set(existingFriendships.map((friendship) => friendship.characterId));
    const available = all.filter((character) => !existingIds.has(character.id));
    if (available.length === 0) return null;

    const char = available[Math.floor(Math.random() * available.length)];

    let greeting = `Hi, I'm ${char.name}. We just met in Yinjie.`;
    try {
      const result = await this.ai.generateReply({
        profile: char.profile,
        conversationHistory: [],
        userMessage: 'Write a short, warm self-introduction after a random encounter. Keep it under 25 words.',
      });
      greeting = result.text;
    } catch {
      this.logger.debug('Falling back to default shake greeting');
    }

    return { character: char, greeting };
  }

  async sendFriendRequest(characterId: string, greeting: string): Promise<FriendRequestEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const char = await this.characterRepo.findOneBy({ id: characterId });
    if (!char) throw new Error('Character not found');

    const existing = await this.friendRequestRepo.findOneBy({ ownerId: owner.id, characterId, status: 'pending' });
    if (existing) return existing;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const req = this.friendRequestRepo.create({
      ownerId: owner.id,
      characterId,
      characterName: char.name,
      characterAvatar: char.avatar,
      triggerScene: 'shake',
      greeting,
      status: 'pending',
      expiresAt: tomorrow,
    });
    return this.friendRequestRepo.save(req);
  }

  async blockCharacter(characterId: string, _reason?: string): Promise<{
    id: string;
    characterId: string;
    reason?: string;
    createdAt: Date;
  }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.friendshipRepo.findOneBy({ ownerId: owner.id, characterId });

    if (existing) {
      existing.status = 'blocked';
      existing.isStarred = false;
      existing.starredAt = null;
      const saved = await this.friendshipRepo.save(existing);
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

    return {
      id: saved.id,
      characterId: saved.characterId,
      reason: undefined,
      createdAt: saved.createdAt,
    };
  }

  async unblockCharacter(characterId: string): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.friendshipRepo.findOneBy({ ownerId: owner.id, characterId });
    if (!existing || existing.status !== 'blocked') {
      return;
    }

    if ((DEFAULT_CHARACTER_IDS as readonly string[]).includes(characterId)) {
      existing.status = 'friend';
      await this.friendshipRepo.save(existing);
      return;
    }

    await this.friendshipRepo.remove(existing);
  }

  async updateIntimacy(characterId: string, delta: number): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({ ownerId: owner.id, characterId });
    if (!friendship) return;
    friendship.intimacyLevel = Math.min(100, Math.max(0, friendship.intimacyLevel + delta));
    friendship.lastInteractedAt = new Date();
    await this.friendshipRepo.save(friendship);
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

  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  return normalized.length ? normalized : null;
}
