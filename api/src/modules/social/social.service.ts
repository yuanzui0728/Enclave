import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FriendshipEntity } from './friendship.entity';
import { FriendRequestEntity } from './friend-request.entity';
import { AIRelationshipEntity } from './ai-relationship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';

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
  ) {}

  async getPendingRequests(userId: string): Promise<FriendRequestEntity[]> {
    return this.friendRequestRepo.find({
      where: { userId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async acceptRequest(requestId: string, userId: string): Promise<FriendshipEntity> {
    const req = await this.friendRequestRepo.findOneBy({ id: requestId, userId });
    if (!req) throw new Error('Request not found');

    req.status = 'accepted';
    await this.friendRequestRepo.save(req);

    // Create friendship
    const existing = await this.friendshipRepo.findOneBy({ userId, characterId: req.characterId });
    if (existing) return existing;

    const friendship = this.friendshipRepo.create({
      userId,
      characterId: req.characterId,
      intimacyLevel: 10,
    });
    return this.friendshipRepo.save(friendship);
  }

  async declineRequest(requestId: string, userId: string): Promise<void> {
    await this.friendRequestRepo.update({ id: requestId, userId }, { status: 'declined' });
  }

  async getFriends(userId: string): Promise<{ friendship: FriendshipEntity; character: CharacterEntity | null }[]> {
    const friendships = await this.friendshipRepo.find({ where: { userId } });
    const result = await Promise.all(
      friendships.map(async (f) => ({
        friendship: f,
        character: await this.characterRepo.findOneBy({ id: f.characterId }),
      })),
    );
    return result.filter((r) => r.character !== null);
  }

  async triggerSceneFriendRequest(userId: string, scene: string): Promise<FriendRequestEntity | null> {
    // Find characters whose trigger_scenes match the current scene
    const chars = await this.characterRepo.find();
    const candidates = chars.filter((c) => c.triggerScenes?.includes(scene));
    if (candidates.length === 0) return null;

    // Pick a random candidate that isn't already a friend
    const existingFriendships = await this.friendshipRepo.find({ where: { userId } });
    const existingIds = new Set(existingFriendships.map((f) => f.characterId));
    const available = candidates.filter((c) => !existingIds.has(c.id));
    if (available.length === 0) return null;

    const char = available[Math.floor(Math.random() * available.length)];

    // Check no pending request already exists
    const existing = await this.friendRequestRepo.findOneBy({ userId, characterId: char.id, status: 'pending' });
    if (existing) return null;

    // Generate greeting via AI
    let greeting = `嗨，我是${char.name}，我们在${scene}遇到了，加个好友吧？`;
    try {
      const result = await this.ai.generateReply({
        profile: char.profile,
        conversationHistory: [],
        userMessage: `你在${scene}偶遇了一个陌生人，想主动加对方好友，发一句简短的自我介绍和加好友的理由，不超过30字。`,
      });
      greeting = result.text;
    } catch {
      // use default greeting
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const req = this.friendRequestRepo.create({
      userId,
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

  async shake(userId: string): Promise<{ character: CharacterEntity; greeting: string } | null> {
    const all = await this.characterRepo.find();
    const existingFriendships = await this.friendshipRepo.find({ where: { userId } });
    const existingIds = new Set(existingFriendships.map((f) => f.characterId));
    const available = all.filter((c) => !existingIds.has(c.id));
    if (available.length === 0) return null;

    const char = available[Math.floor(Math.random() * available.length)];

    let greeting = `嗨，我是${char.name}，我们在隐界相遇了！`;
    try {
      const result = await this.ai.generateReply({
        profile: char.profile,
        conversationHistory: [],
        userMessage: `你通过"摇一摇"功能和一个陌生人相遇了，发一句简短的自我介绍，不超过25字，要有你的个性。`,
      });
      greeting = result.text;
    } catch {
      // use default
    }

    return { character: char, greeting };
  }

  async sendFriendRequest(userId: string, characterId: string, greeting: string): Promise<FriendRequestEntity> {
    const char = await this.characterRepo.findOneBy({ id: characterId });
    if (!char) throw new Error('Character not found');

    const existing = await this.friendRequestRepo.findOneBy({ userId, characterId, status: 'pending' });
    if (existing) return existing;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const req = this.friendRequestRepo.create({
      userId,
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

  async updateIntimacy(userId: string, characterId: string, delta: number): Promise<void> {
    let friendship = await this.friendshipRepo.findOneBy({ userId, characterId });
    if (!friendship) return;
    friendship.intimacyLevel = Math.min(100, Math.max(0, friendship.intimacyLevel + delta));
    friendship.lastInteractedAt = new Date();
    await this.friendshipRepo.save(friendship);
  }
}
