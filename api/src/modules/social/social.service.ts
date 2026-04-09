import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FriendshipEntity } from './friendship.entity';
import { FriendRequestEntity } from './friend-request.entity';
import { AIRelationshipEntity } from './ai-relationship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { NarrativeService } from '../narrative/narrative.service';
import { WorldOwnerService } from '../auth/world-owner.service';

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
    const friendships = await this.friendshipRepo.find({ where: { ownerId: owner.id } });
    const result = await Promise.all(
      friendships.map(async (friendship) => ({
        friendship,
        character: await this.characterRepo.findOneBy({ id: friendship.characterId }),
      })),
    );
    return result.filter((entry) => entry.character !== null);
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

  async updateIntimacy(characterId: string, delta: number): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const friendship = await this.friendshipRepo.findOneBy({ ownerId: owner.id, characterId });
    if (!friendship) return;
    friendship.intimacyLevel = Math.min(100, Math.max(0, friendship.intimacyLevel + delta));
    friendship.lastInteractedAt = new Date();
    await this.friendshipRepo.save(friendship);
  }
}
