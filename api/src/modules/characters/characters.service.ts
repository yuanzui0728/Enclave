import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CharacterEntity } from './character.entity';
import { PersonalityProfile } from '../ai/ai.types';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { AIRelationshipEntity } from '../social/ai-relationship.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { CharacterBlueprintEntity } from './character-blueprint.entity';
import { CharacterBlueprintRevisionEntity } from './character-blueprint-revision.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { VideoChannelFollowEntity } from '../feed/video-channel-follow.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { AIBehaviorLogEntity } from '../analytics/ai-behavior-log.entity';
import { ModerationReportEntity } from '../moderation/moderation-report.entity';
import { DEFAULT_CHARACTER_IDS } from './default-characters';
import {
  getCelebrityCharacterPreset,
  getCelebrityCharacterPresetGroup,
  listCelebrityCharacterPresets,
  CELEBRITY_CHARACTER_PRESETS,
} from './celebrity-character-presets';

export type Character = CharacterEntity;

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(CharacterEntity)
    private repo: Repository<CharacterEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<CharacterEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  findById(id: string): Promise<CharacterEntity | null> {
    return this.repo.findOneBy({ id });
  }

  async findByDomains(domains: string[]): Promise<CharacterEntity[]> {
    const all = await this.findAll();
    return all.filter((c) => c.expertDomains.some((d) => domains.includes(d)));
  }

  async getProfile(id: string): Promise<PersonalityProfile | undefined> {
    const char = await this.repo.findOneBy({ id });
    return char?.profile;
  }

  async upsert(character: CharacterEntity): Promise<void> {
    await this.repo.save(character);
  }

  /**
   * 返回硬编码预设目录中所有角色的完整数据（不查 DB）。
   * 供前台发现页使用——用户加好友前不需要管理员先"安装"。
   */
  listPresetCatalog(): CharacterEntity[] {
    return CELEBRITY_CHARACTER_PRESETS.map(
      (preset) => preset.character as CharacterEntity,
    );
  }

  /**
   * 确保预设角色已写入 DB。
   * - 已存在：直接返回 DB 记录（保留管理员改动）
   * - 不存在但匹配预设：从硬编码安装后返回
   * - 不是预设角色：返回 null（自定义角色应已在 DB）
   */
  async ensurePresetCharacterInstalled(
    characterId: string,
  ): Promise<CharacterEntity | null> {
    const existing = await this.repo.findOneBy({ id: characterId });
    if (existing) return existing;

    const preset = CELEBRITY_CHARACTER_PRESETS.find(
      (p) => p.id === characterId,
    );
    if (!preset) return null;

    return this.installCelebrityPreset(preset.presetKey);
  }

  async listCelebrityPresets() {
    const installedCharacters = await this.repo.find({
      where: { sourceType: 'preset_catalog' },
    });
    const installedBySourceKey = new Map(
      installedCharacters
        .filter((character) => character.sourceKey)
        .map((character) => [
          character.sourceKey as string,
          { id: character.id, name: character.name },
        ]),
    );

    return listCelebrityCharacterPresets().map((preset) => {
      const group = getCelebrityCharacterPresetGroup(preset.groupKey);
      const installedCharacter = installedBySourceKey.get(preset.presetKey);
      return {
        presetKey: preset.presetKey,
        groupKey: group.key,
        groupLabel: group.label,
        groupDescription: group.description,
        groupOrder: group.sortOrder,
        id: preset.id,
        name: preset.name,
        avatar: preset.avatar,
        relationship: preset.relationship,
        description: preset.description,
        expertDomains: preset.expertDomains,
        installed: Boolean(installedCharacter),
        installedCharacterId: installedCharacter?.id ?? null,
        installedCharacterName: installedCharacter?.name ?? null,
      };
    });
  }

  async installCelebrityPreset(presetKey: string): Promise<CharacterEntity> {
    const preset = getCelebrityCharacterPreset(presetKey);
    if (!preset) {
      throw new NotFoundException(`Preset ${presetKey} not found`);
    }

    const existing = await this.repo.findOne({
      where: [
        { id: preset.id },
        { sourceType: 'preset_catalog', sourceKey: preset.presetKey },
      ],
    });
    if (existing) {
      return existing;
    }

    return this.repo.save(
      this.repo.create({
        ...preset.character,
        id: preset.id,
        sourceType: 'preset_catalog',
        sourceKey: preset.presetKey,
        deletionPolicy: 'archive_allowed',
        isTemplate: false,
      }),
    );
  }

  async installCelebrityPresetBatch(presetKeys: string[]) {
    const normalizedPresetKeys = Array.from(
      new Set(
        presetKeys
          .map((presetKey) => presetKey.trim())
          .filter((presetKey) => presetKey.length > 0),
      ),
    );
    if (normalizedPresetKeys.length === 0) {
      throw new BadRequestException('至少选择一个名人预设。');
    }

    const missingPresetKeys = normalizedPresetKeys.filter(
      (presetKey) => !getCelebrityCharacterPreset(presetKey),
    );
    if (missingPresetKeys.length > 0) {
      throw new NotFoundException(
        `Preset ${missingPresetKeys.join(', ')} not found`,
      );
    }

    const installedCharacters = await Promise.all(
      normalizedPresetKeys.map((presetKey) =>
        this.installCelebrityPreset(presetKey),
      ),
    );

    return {
      presetKeys: normalizedPresetKeys,
      installedCount: installedCharacters.length,
      installedCharacters,
    };
  }

  async delete(id: string): Promise<void> {
    const character = await this.repo.findOneBy({ id });
    if (!character) {
      return;
    }

    if (
      character.deletionPolicy === 'protected' ||
      (DEFAULT_CHARACTER_IDS as readonly string[]).includes(id)
    ) {
      throw new BadRequestException('默认保底角色不可删除。');
    }

    await this.dataSource.transaction(async (manager) => {
      const conversationRepo = manager.getRepository(ConversationEntity);
      const messageRepo = manager.getRepository(MessageEntity);
      const groupRepo = manager.getRepository(GroupEntity);
      const groupMemberRepo = manager.getRepository(GroupMemberEntity);
      const groupMessageRepo = manager.getRepository(GroupMessageEntity);
      const friendRequestRepo = manager.getRepository(FriendRequestEntity);
      const friendshipRepo = manager.getRepository(FriendshipEntity);
      const aiRelationshipRepo = manager.getRepository(AIRelationshipEntity);
      const narrativeArcRepo = manager.getRepository(NarrativeArcEntity);
      const blueprintRepo = manager.getRepository(CharacterBlueprintEntity);
      const blueprintRevisionRepo = manager.getRepository(
        CharacterBlueprintRevisionEntity,
      );
      const momentPostRepo = manager.getRepository(MomentPostEntity);
      const momentCommentRepo = manager.getRepository(MomentCommentEntity);
      const momentLikeRepo = manager.getRepository(MomentLikeEntity);
      const feedPostRepo = manager.getRepository(FeedPostEntity);
      const feedCommentRepo = manager.getRepository(FeedCommentEntity);
      const videoChannelFollowRepo = manager.getRepository(VideoChannelFollowEntity);
      const feedInteractionRepo = manager.getRepository(
        UserFeedInteractionEntity,
      );
      const aiBehaviorLogRepo = manager.getRepository(AIBehaviorLogEntity);
      const moderationReportRepo =
        manager.getRepository(ModerationReportEntity);
      const characterRepo = manager.getRepository(CharacterEntity);

      const directConversations = (await conversationRepo.find()).filter(
        (conversation) =>
          conversation.type !== 'group' &&
          conversation.participants.includes(id),
      );
      const directConversationIds = directConversations.map(
        (conversation) => conversation.id,
      );

      if (directConversationIds.length > 0) {
        await messageRepo.delete({
          conversationId: In(directConversationIds),
        });
        await conversationRepo.delete({ id: In(directConversationIds) });
      }

      const createdGroups = await groupRepo.find({
        where: { creatorId: id, creatorType: 'character' },
      });
      const createdGroupIds = createdGroups.map((group) => group.id);
      if (createdGroupIds.length > 0) {
        await groupMessageRepo.delete({ groupId: In(createdGroupIds) });
        await groupMemberRepo.delete({ groupId: In(createdGroupIds) });
        await groupRepo.delete({ id: In(createdGroupIds) });
      }

      await groupMessageRepo.delete({ senderId: id, senderType: 'character' });
      await groupMemberRepo.delete({ memberId: id, memberType: 'character' });

      const momentPostIds = (
        await momentPostRepo.find({
          where: { authorId: id, authorType: 'character' },
        })
      ).map((post) => post.id);

      await momentCommentRepo.delete({ authorId: id, authorType: 'character' });
      await momentLikeRepo.delete({ authorId: id, authorType: 'character' });
      if (momentPostIds.length > 0) {
        await momentCommentRepo.delete({ postId: In(momentPostIds) });
        await momentLikeRepo.delete({ postId: In(momentPostIds) });
        await momentPostRepo.delete({ id: In(momentPostIds) });
      }

      const feedPostIds = (
        await feedPostRepo.find({
          where: { authorId: id, authorType: 'character' },
        })
      ).map((post) => post.id);

      await feedCommentRepo.delete({ authorId: id, authorType: 'character' });
      if (feedPostIds.length > 0) {
        await feedCommentRepo.delete({ postId: In(feedPostIds) });
        await feedInteractionRepo.delete({ postId: In(feedPostIds) });
        await feedPostRepo.delete({ id: In(feedPostIds) });
      }

      await friendRequestRepo.delete({ characterId: id });
      await friendshipRepo.delete({ characterId: id });
      await videoChannelFollowRepo.delete({ authorId: id, authorType: 'character' });
      await narrativeArcRepo.delete({ characterId: id });
      await aiBehaviorLogRepo.delete({ characterId: id });
      await moderationReportRepo.delete({ targetType: 'character', targetId: id });
      await blueprintRevisionRepo.delete({ characterId: id });
      await blueprintRepo.delete({ characterId: id });
      await aiRelationshipRepo
        .createQueryBuilder()
        .delete()
        .where('characterIdA = :id OR characterIdB = :id', { id })
        .execute();
      await characterRepo.delete(id);
    });
  }
}
