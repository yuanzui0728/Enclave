import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { UserEntity } from './user.entity';
import { decryptUserApiKey, encryptUserApiKey } from './api-key-crypto';
import type { AiKeyOverride } from '../ai/ai.types';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';

type UpdateWorldOwnerInput = {
  username?: string;
  avatar?: string;
  signature?: string;
  onboardingCompleted?: boolean;
};

@Injectable()
export class WorldOwnerService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async ensureSingleOwnerMigration() {
    const users = await this.userRepo.find({
      order: { createdAt: 'ASC' },
    });

    if (users.length === 0) {
      const owner = this.userRepo.create({
        username: '',
        passwordHash: this.generatePlaceholderPasswordHash(),
        onboardingCompleted: false,
        avatar: '',
        signature: '',
        customApiKey: null,
        customApiBase: null,
      });
      return this.userRepo.save(owner);
    }

    const [owner, ...others] = users;
    if (others.length === 0) {
      return owner;
    }

    const removedOwnerIds = others.map((entry) => entry.id);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(FriendshipEntity).delete({ ownerId: In(removedOwnerIds) });
      await manager.getRepository(FriendRequestEntity).delete({ ownerId: In(removedOwnerIds) });
      await manager.getRepository(NarrativeArcEntity).delete({ ownerId: In(removedOwnerIds) });
      await manager.getRepository(UserFeedInteractionEntity).delete({ userId: In(removedOwnerIds) });

      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentLikeEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentCommentEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentPostEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(FeedCommentEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(FeedPostEntity)
        .where('authorId IN (:...ids) AND authorType = :authorType', {
          ids: removedOwnerIds,
          authorType: 'user',
        })
        .execute();

      const ownerConversations = await manager.getRepository(ConversationEntity).find({
        select: ['id'],
        where: { ownerId: owner.id },
      });
      const ownerConversationIds = ownerConversations.map((entry) => entry.id);

      await manager
        .createQueryBuilder()
        .delete()
        .from(ConversationEntity)
        .where('userId IN (:...ids)', { ids: removedOwnerIds })
        .execute();

      await manager
        .createQueryBuilder()
        .delete()
        .from(MessageEntity)
        .where('senderType = :senderType AND senderId IN (:...ids)', {
          senderType: 'user',
          ids: removedOwnerIds,
        })
        .execute();

      if (ownerConversationIds.length > 0) {
        await manager
          .createQueryBuilder()
          .delete()
          .from(MessageEntity)
          .where('conversationId NOT IN (:...conversationIds)', {
            conversationIds: ownerConversationIds,
          })
          .execute();
      }

      const removedGroups = await manager.getRepository(GroupEntity).find({
        select: ['id'],
        where: {
          creatorType: 'user',
          creatorId: In(removedOwnerIds),
        },
      });
      const removedGroupIds = removedGroups.map((entry) => entry.id);

      if (removedGroupIds.length > 0) {
        await manager.getRepository(GroupMemberEntity).delete({ groupId: In(removedGroupIds) });
        await manager.getRepository(GroupMessageEntity).delete({ groupId: In(removedGroupIds) });
        await manager.getRepository(GroupEntity).delete({ id: In(removedGroupIds) });
      }

      await manager.getRepository(UserEntity).delete({ id: In(removedOwnerIds) });
    });

    return this.getOwnerOrThrow();
  }

  async getOwnerOrThrow() {
    const owner = await this.userRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (!owner) {
      return this.ensureSingleOwnerMigration();
    }

    return owner;
  }

  async getOwnerProfile() {
    const owner = await this.getOwnerOrThrow();
    return this.serializeOwner(owner);
  }

  async updateOwner(input: UpdateWorldOwnerInput) {
    const owner = await this.getOwnerOrThrow();
    const nextUsername = input.username?.trim();
    const nextAvatar = input.avatar?.trim();
    const nextSignature = input.signature?.trim();

    owner.username = nextUsername ?? owner.username;
    owner.avatar = nextAvatar ?? owner.avatar ?? '';
    owner.signature = nextSignature ?? owner.signature ?? '';
    if (typeof input.onboardingCompleted === 'boolean') {
      owner.onboardingCompleted = input.onboardingCompleted;
    }

    await this.userRepo.save(owner);
    return this.serializeOwner(owner);
  }

  async setOwnerApiKey(apiKey: string, apiBase?: string) {
    const owner = await this.getOwnerOrThrow();
    owner.customApiKey = encryptUserApiKey(apiKey.trim());
    owner.customApiBase = apiBase?.trim() ? apiBase.trim() : null;
    await this.userRepo.save(owner);
    return this.serializeOwner(owner);
  }

  async clearOwnerApiKey() {
    const owner = await this.getOwnerOrThrow();
    owner.customApiKey = null;
    owner.customApiBase = null;
    await this.userRepo.save(owner);
    return this.serializeOwner(owner);
  }

  async getOwnerAiConfig(): Promise<AiKeyOverride | null> {
    const owner = await this.getOwnerOrThrow();
    const decryptedApiKey = decryptUserApiKey(owner.customApiKey);
    if (!decryptedApiKey?.trim()) {
      return null;
    }

    return {
      apiKey: decryptedApiKey,
      apiBase: owner.customApiBase ?? undefined,
    };
  }

  private serializeOwner(owner: UserEntity) {
    return {
      id: owner.id,
      username: owner.username,
      onboardingCompleted: owner.onboardingCompleted,
      avatar: owner.avatar ?? '',
      signature: owner.signature ?? '',
      hasCustomApiKey: Boolean(owner.customApiKey),
      customApiBase: owner.customApiBase ?? null,
      createdAt: owner.createdAt.toISOString(),
    };
  }

  private generatePlaceholderPasswordHash() {
    return `world_owner_${Date.now()}`;
  }
}
