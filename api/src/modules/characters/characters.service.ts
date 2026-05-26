import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, ObjectLiteral, Repository } from 'typeorm';
import { CharacterEntity } from './character.entity';
import { PersonalityProfile } from '../ai/ai.types';
import { applyPersistentNaturalDialogueProfile } from '../ai/prompt-naturalness';
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
import { CharacterBlueprintService } from './character-blueprint.service';
import type { CharacterBlueprintRecipeValue } from './character-blueprint.types';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { VideoChannelFollowEntity } from '../feed/video-channel-follow.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';
import { AIBehaviorLogEntity } from '../analytics/ai-behavior-log.entity';
import { ModerationReportEntity } from '../moderation/moderation-report.entity';
import { WorldOwnerService } from '../auth/world-owner.service';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';
import { isSharedWorldMode } from '../tenancy/tenant-context';
import { NeedDiscoveryCandidateEntity } from '../need-discovery/need-discovery-candidate.entity';
import {
  RealWorldRuntimeProfileService,
  hasMeaningfulProfile,
} from '../real-world-sync/real-world-runtime-profile.service';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  buildDefaultCharacters,
  DEFAULT_CHARACTER_IDS,
} from './default-characters';
import {
  getCelebrityCharacterPresetGroup,
} from './celebrity-character-presets';
import {
  BUILT_IN_CHARACTER_PRESETS,
  getBuiltInCharacterPreset,
} from './built-in-character-presets';
import { maybeGetCharacterAvatarBySourceKey } from './character-avatar-assets';

export type Character = CharacterEntity;

@Injectable()
export class CharactersService implements OnModuleInit {
  private readonly logger = new Logger(CharactersService.name);

  constructor(
    @InjectRepository(CharacterEntity)
    private repo: Repository<CharacterEntity>,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly dataSource: DataSource,
    private readonly realWorldRuntimeProfile: RealWorldRuntimeProfileService,
    private readonly blueprintService: CharacterBlueprintService,
  ) {}

  // 租户作用域 repo：shared 模式自动并 ownerId 进 where / 盖到写入行；LPP/wiki 透传（零变化）。
  // 请求/cron-fanout 路径用它（都在租户帧里）；onModuleInit 全局自愈路径仍用裸 this.repo。
  // 直接 new（TenantRepository 只依赖 tenant-context 叶子模块）——不注入 TenantService，
  // 避免 CharactersService→TenantService→SocialService→CharactersService 的 ES import 环
  // 把 TenantService 在装饰期解析成 undefined（会连累 ChatGateway 等的 TenantService 注入）。
  private get scopedRepo(): TenantRepository<CharacterEntity> {
    return new TenantRepository(this.repo);
  }

  async onModuleInit() {
    // 这两个是 LPP 历史单库数据自愈（无租户上下文的全局 find+save）。共享库由迁移管线已
    // 规整，且 boot 期没有租户帧 —— 全局跑既无必要又会绕过租户隔离。shared 模式跳过。
    if (isSharedWorldMode()) return;
    await this.backfillCharacterAvatarAssets();
    await this.backfillEmptyPrivateImportProfiles();
  }

  async findAll(): Promise<CharacterEntity[]> {
    // shared 模式自动按当前租户 ownerId 过滤（passthrough in LPP）。这是 /api/characters
    // 等所有「列当前世界角色」入口的根，scope 在此一处即覆盖 findAllVisibleToOwner /
    // findByDomains 及 feed/moments 等外部调用。
    const characters = await this.scopedRepo.find({ order: { name: 'ASC' } });
    return this.normalizeCharacterAvatars(characters);
  }

  async findById(id: string): Promise<CharacterEntity | null> {
    const character = await this.scopedRepo.findOneBy({ id });
    return this.normalizeCharacterAvatar(character);
  }

  async findManyByIds(ids: string[]): Promise<CharacterEntity[]> {
    const unique = Array.from(
      new Set(ids.map((id) => id?.trim()).filter((id): id is string => !!id)),
    );
    if (!unique.length) return [];
    const characters = await this.scopedRepo.findBy({ id: In(unique) });
    return this.normalizeCharacterAvatars(characters);
  }

  async findAllVisibleToOwner(ownerId?: string): Promise<CharacterEntity[]> {
    const characters = await this.findAll();
    return this.filterNeedGeneratedVisibility(characters, ownerId);
  }

  async isVisibleToOwner(
    characterId: string,
    ownerId?: string,
  ): Promise<boolean> {
    const character = await this.findById(characterId);
    if (!character) {
      return false;
    }

    if (character.sourceType !== 'need_generated') {
      return true;
    }

    const activeFriendCharacterIds =
      await this.getActiveFriendCharacterIdSet(ownerId);
    return activeFriendCharacterIds.has(characterId);
  }

  async findByDomains(domains: string[]): Promise<CharacterEntity[]> {
    const all = await this.findAll();
    return all.filter((c) => c.expertDomains.some((d) => domains.includes(d)));
  }

  async getProfile(id: string): Promise<PersonalityProfile | undefined> {
    const char = await this.scopedRepo.findOneBy({ id });
    return this.getRuntimeProfileFromCharacter(char);
  }

  async getRuntimeProfileFromCharacter(
    character:
      | Pick<
          CharacterEntity,
          | 'id'
          | 'profile'
          | 'name'
          | 'relationship'
          | 'relationshipType'
          | 'expertDomains'
          | 'bio'
          | 'personality'
        >
      | null
      | undefined,
  ): Promise<PersonalityProfile | undefined> {
    return this.realWorldRuntimeProfile.buildRuntimeProfileFromCharacter(
      character,
    );
  }

  async upsert(character: CharacterEntity): Promise<void> {
    // scoped：shared 模式盖当前 owner（复合主键让 save 按 (ownerId,id) 定位，固定 id 角色
    // 不会跨租户覆盖）；LPP 透传。
    await this.scopedRepo.save(character);
  }

  /**
   * 返回世界角色目录中所有内置角色的完整数据（不查 DB）。
   * 默认保底角色和内置目录角色都会包含在内。
   */
  listPresetCatalog(): CharacterEntity[] {
    const seen = new Set<string>();
    const catalogCharacters = [
      ...buildDefaultCharacters(),
      ...BUILT_IN_CHARACTER_PRESETS.map(
        (preset) => preset.character as CharacterEntity,
      ),
    ].filter((character): character is CharacterEntity => {
      if (!character?.id || seen.has(character.id)) {
        return false;
      }

      seen.add(character.id);
      return true;
    });

    return this.normalizeCharacterAvatars(catalogCharacters);
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
    const existing = await this.scopedRepo.findOneBy({ id: characterId });
    if (existing) return this.normalizeCharacterAvatar(existing);

    const preset = BUILT_IN_CHARACTER_PRESETS.find((p) => p.id === characterId);
    if (!preset) return null;

    return this.materializePresetCharacter(preset);
  }

  async listCelebrityPresets() {
    // 既要看常规 preset_catalog 安装记录，也要看 BUILT_IN 里 autoSeed:false
    // 但 ID 已经在 DB 里的居民（典型代表：林医生 / 简衡 走 default-characters.ts
    // 的 protected default_seed 落库，不是 preset_catalog）。否则这些角色在
    // 目录里会被错误展示成"未安装 + 可安装"按钮。
    const presetIds = BUILT_IN_CHARACTER_PRESETS.map((preset) => preset.id);
    const installedCharacters = await this.scopedRepo.find({
      where: [
        { sourceType: 'preset_catalog' },
        { id: In(presetIds) },
      ],
    });
    const installedById = new Map(
      installedCharacters.map((character) => [
        character.id,
        { id: character.id, name: character.name },
      ]),
    );
    const installedBySourceKey = new Map(
      installedCharacters
        .filter((character) => character.sourceKey)
        .map((character) => [
          character.sourceKey as string,
          { id: character.id, name: character.name },
        ]),
    );

    return BUILT_IN_CHARACTER_PRESETS.map((preset) => {
      const group = getCelebrityCharacterPresetGroup(preset.groupKey);
      const installedCharacter =
        installedById.get(preset.id) ??
        installedBySourceKey.get(preset.presetKey);
      return {
        presetKey: preset.presetKey,
        groupKey: group.key,
        autoSeed: preset.autoSeed !== false,
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
    const preset = getBuiltInCharacterPreset(presetKey);
    if (!preset) {
      throw new AppError('PRESET_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { presetKey },
        legacyMessage: `Preset ${presetKey} not found`,
      });
    }

    return this.materializePresetCharacter(preset);
  }

  private async materializePresetCharacter(
    preset: NonNullable<ReturnType<typeof getBuiltInCharacterPreset>>,
  ): Promise<CharacterEntity> {
    const existing = await this.scopedRepo.findOne({
      where: [
        { id: preset.id },
        { sourceType: 'preset_catalog', sourceKey: preset.presetKey },
      ],
    });
    if (existing) {
      return this.normalizeCharacterAvatar(existing) ?? existing;
    }

    // scoped.save 盖当前 owner ownerId；复合主键下对该 owner 是 INSERT，不碰其他租户同 id 行。
    return this.scopedRepo.save(
      this.repo.create({
        ...preset.character,
        id: preset.id,
        profile: preset.character.profile
          ? applyPersistentNaturalDialogueProfile(preset.character.profile)
          : preset.character.profile,
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
      throw new AppError('PRESET_AT_LEAST_ONE', {
        legacyMessage: '至少选择一个预设角色。',
      });
    }

    const missingPresetKeys = normalizedPresetKeys.filter(
      (presetKey) => !getBuiltInCharacterPreset(presetKey),
    );
    if (missingPresetKeys.length > 0) {
      throw new AppError('PRESET_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { presetKey: missingPresetKeys.join(', ') },
        legacyMessage: `Preset ${missingPresetKeys.join(', ')} not found`,
      });
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
    const character = await this.scopedRepo.findOneBy({ id });
    if (!character) {
      return;
    }

    if (
      character.deletionPolicy === 'protected' ||
      (DEFAULT_CHARACTER_IDS as readonly string[]).includes(id)
    ) {
      throw new AppError('CHARACTER_DEFAULT_NOT_DELETABLE', {
        legacyMessage: '默认保底角色不可删除。',
      });
    }

    // shared 模式：固定/preset 角色 id 跨租户共用，级联删除必须按 ownerId 限定，否则 A 删
    // 自己的角色会把 B 的同 id 角色的会话/动态/关系一起删掉。owner-scoped 表经 scoped()
    // 包装（shared 注入 ownerId / LPP 透传）；ai_relationships 的 QB delete 手工加 ownerId。
    // 注：character_blueprints / ai_behavior_logs / need_discovery_candidates 尚无 ownerId 列
    //（未纳入租户隔离，属后续 Phase），仍按 characterId 删 —— 多 owner 下会过删，记为已知缺口。
    const ownerId = character.ownerId; // shared=当前 owner；LPP=NULL
    const scoped = <T extends ObjectLiteral>(r: Repository<T>) =>
      new TenantRepository<T>(r);

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
      const videoChannelFollowRepo = manager.getRepository(
        VideoChannelFollowEntity,
      );
      const feedInteractionRepo = manager.getRepository(
        UserFeedInteractionEntity,
      );
      const aiBehaviorLogRepo = manager.getRepository(AIBehaviorLogEntity);
      const moderationReportRepo = manager.getRepository(
        ModerationReportEntity,
      );
      const needDiscoveryCandidateRepo = manager.getRepository(
        NeedDiscoveryCandidateEntity,
      );
      const characterRepo = manager.getRepository(CharacterEntity);

      // owner-scoped find：只取当前 owner 的会话（shared 注入 ownerId；LPP 透传返回全部=
      // 单 owner 全部）。原裸 find() 在共享库会拉全租户会话并触 afterLoad 读泄漏。
      const directConversations = (await scoped(conversationRepo).find()).filter(
        (conversation) =>
          conversation.type !== 'group' &&
          conversation.participants.includes(id),
      );
      const directConversationIds = directConversations.map(
        (conversation) => conversation.id,
      );

      if (directConversationIds.length > 0) {
        await scoped(messageRepo).delete({
          conversationId: In(directConversationIds),
        });
        await scoped(conversationRepo).delete({ id: In(directConversationIds) });
      }

      const createdGroups = await scoped(groupRepo).find({
        where: { creatorId: id, creatorType: 'character' },
      });
      const createdGroupIds = createdGroups.map((group) => group.id);
      if (createdGroupIds.length > 0) {
        await scoped(groupMessageRepo).delete({ groupId: In(createdGroupIds) });
        await scoped(groupMemberRepo).delete({ groupId: In(createdGroupIds) });
        await scoped(groupRepo).delete({ id: In(createdGroupIds) });
      }

      await scoped(groupMessageRepo).delete({ senderId: id, senderType: 'character' });
      await scoped(groupMemberRepo).delete({ memberId: id, memberType: 'character' });

      const momentPostIds = (
        await scoped(momentPostRepo).find({
          where: { authorId: id, authorType: 'character' },
        })
      ).map((post) => post.id);

      await scoped(momentCommentRepo).delete({ authorId: id, authorType: 'character' });
      await scoped(momentLikeRepo).delete({ authorId: id, authorType: 'character' });
      if (momentPostIds.length > 0) {
        await scoped(momentCommentRepo).delete({ postId: In(momentPostIds) });
        await scoped(momentLikeRepo).delete({ postId: In(momentPostIds) });
        await scoped(momentPostRepo).delete({ id: In(momentPostIds) });
      }

      const feedPostIds = (
        await scoped(feedPostRepo).find({
          where: { authorId: id, authorType: 'character' },
        })
      ).map((post) => post.id);

      await scoped(feedCommentRepo).delete({ authorId: id, authorType: 'character' });
      if (feedPostIds.length > 0) {
        await scoped(feedCommentRepo).delete({ postId: In(feedPostIds) });
        await scoped(feedInteractionRepo).delete({ postId: In(feedPostIds) });
        await scoped(feedPostRepo).delete({ id: In(feedPostIds) });
      }

      await scoped(friendRequestRepo).delete({ characterId: id });
      await scoped(friendshipRepo).delete({ characterId: id });
      await scoped(videoChannelFollowRepo).delete({
        authorId: id,
        authorType: 'character',
      });
      await scoped(narrativeArcRepo).delete({ characterId: id });
      // ai_behavior_logs / blueprints / need_discovery_candidates 暂无 ownerId 列：按
      // characterId 删（多 owner 下对共享 id 会过删，属未纳入隔离的已知缺口）。
      await aiBehaviorLogRepo.delete({ characterId: id });
      await scoped(moderationReportRepo).delete({
        targetType: 'character',
        targetId: id,
      });
      await blueprintRevisionRepo.delete({ characterId: id });
      await blueprintRepo.delete({ characterId: id });
      // ai_relationships 有 ownerId：QB delete 手工加 ownerId（仅 shared；LPP ownerId 为
      // NULL 不能进 WHERE，否则 NULL=:id 永假会漏删）。
      {
        // ⚠️ 必须给 OR 加括号：andWhere 追加 `AND ownerId=?` 时 SQL 的 AND 优先级高于 OR，
        // 不括会变成 `charA=:id OR (charB=:id AND ownerId=?)` → 把其他租户 characterIdA=:id
        // 的关系也删掉（实测 B 的 ai_rels 被误删）。括起来才是 `(charA OR charB) AND owner`。
        let q = aiRelationshipRepo
          .createQueryBuilder()
          .delete()
          .where('(characterIdA = :id OR characterIdB = :id)', { id });
        if (ownerId) q = q.andWhere('ownerId = :__ownerId', { __ownerId: ownerId });
        await q.execute();
      }
      await needDiscoveryCandidateRepo
        .createQueryBuilder()
        .update()
        .set({
          status: 'deleted',
          deletedAt: new Date(),
        })
        .where('characterId = :id', { id })
        .andWhere('status NOT IN (:...lockedStatuses)', {
          lockedStatuses: ['declined', 'expired', 'deleted'],
        })
        .execute();
      // 复合主键下不能用标量 id；scoped delete 按 (ownerId,id) 只删当前 owner 的角色行。
      await scoped(characterRepo).delete({ id });
    });
  }

  /**
   * 从 wiki 导出的 JSON bundle 导入私有角色到当前 world：
   * - 按 name 找现存：仅当 sourceType='private_import' 才覆盖；
   *   命中其他来源（preset/built-in/admin/seed）抛 Conflict，避免静默改写
   *   全 world 共用的内置角色。
   * - 不存在→新建；新建始终 sourceType='private_import'，sourceKey=name。
   * - 有 recipe 但无 profile 时：用 blueprint service 从 recipe 推 profile，
   *   避免用户写的 prompt 配方被静默丢弃（旧版只取 profile，recipe 直接吃）。
   * - 自动给 world-owner 建 friendship（已存在保留 intimacy/status，软删则激活）。
   *
   * undefined 字段 = "bundle 里没写"，对已存在角色不动；string '' / [] / {} =
   * 显式置空。这样保证 round-trip 后未提供的字段不会被意外清空。
   */
  async importPersonalCharacter(input: {
    name: string;
    avatar?: string;
    bio?: string;
    personality?: string | null;
    relationship?: string;
    relationshipType?: string;
    region?: string;
    expertDomains?: string[];
    triggerScenes?: string[] | null;
    recipe?: CharacterBlueprintRecipeValue | null;
    profile?: PersonalityProfile | null;
    isOnline?: boolean;
    onlineMode?: string;
    activityMode?: string;
    currentActivity?: string | null;
    sourceType?: string;
    sourceKey?: string | null;
    deletionPolicy?: string;
    isTemplate?: boolean;
    socialOpenness?: string;
    proactiveBrowseChance?: number;
    intimacyLevel?: number;
    aiRelationships?:
      | { characterId: string; relationshipType: string; strength: number }[]
      | null;
  }): Promise<{
    character: CharacterEntity;
    overwrote: boolean;
    friendshipStatus: string;
  }> {
    const trimmedName = (input.name ?? '').trim();
    if (!trimmedName) {
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '导入文件缺少 name 字段。',
      });
    }
    // 纯零宽字符 / BOM 名字 trim 后非空但"视觉为空"，会在好友列表/对话列表
    // 渲染出无法点击的空标签。和 wiki 私有角色写入路径 / 朋友圈正文一致拒绝。
    if (isPrivateImportNameVisuallyEmpty(trimmedName)) {
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'name 不能是仅零宽字符的空白文本。',
      });
    }
    // 走查 R1：含 \n / \r / \t 等控制字符的 name 会破坏通讯录单行渲染、并把
    // 多行指令塞进 AI prompt。trim 之前判断（trim 只剥首尾空白，不剥中间）。
    if (containsControlChar(input.name ?? '')) {
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'name 不能包含换行符或控制字符。',
      });
    }
    // 防御性长度校验：DB 是 text 列没硬限，但用户填的 bio/persona 直接拼到
    // AI prompt 里，过长会撑爆 context cost；同时 60+KB 的 recipe/profile JSON
    // 几乎一定是误传。在这里挡一道，比上线后被 prompt cost 烧出 P0 强。
    assertPrivateCharacterFieldLimits(input);

    // 走查 R1（2026-05-22 端到端）：原顺序是 character.save → owner.getOwnerOrThrow →
    // friendship.save。罕见但可能：owner 拉取失败（world 启动早期 / world_owner 表
    // 被外部脚本意外删空）时 character 已经落库，但 friendship 没建——DB 里留下
    // 孤儿 row（不在 friend list，但是 findAllVisibleToOwner 仍会显出 + 占用 name 槽位
    // 让下次同名 import 走 existing 路径而不是新建）。用户视角是"导入失败"但状态半截。
    // 把 owner 拉取提到 character.save 之前：失败时 throw，DB 完全干净，用户重试
    // 直接走新建。owner 是 world-shared 单例，调用极轻；提前不影响热路径性能。
    const owner = await this.worldOwnerService.getOwnerOrThrow();

    // scoped：按 name 找现存只在当前 owner 内找，避免跨租户撞名（否则 A 导入会看到 B 的
    // 同名角色，误判冲突或覆盖）。
    const existing = await this.scopedRepo.findOne({
      where: { name: trimmedName },
    });

    if (existing) {
      // protected：默认保底角色（"我自己"等），任何情况都不能覆盖
      if (existing.deletionPolicy === 'protected') {
        throw new AppError('PRIVATE_IMPORT_NAME_RESERVED', {
          status: HttpStatus.CONFLICT,
          legacyMessage: `世界里已存在受保护的同名角色 "${trimmedName}"，无法覆盖。请改用其他名字。`,
        });
      }
      // 非 private_import 来源（preset/built-in/admin 等）：理论上和用户私有
      // 角色无关，但 name 撞上后旧逻辑会静默覆盖、影响全 world。改为拒绝。
      if (existing.sourceType !== 'private_import') {
        throw new AppError('PRIVATE_IMPORT_NAME_RESERVED', {
          status: HttpStatus.CONFLICT,
          legacyMessage: `世界里已存在同名角色 "${trimmedName}"（${existing.sourceType}），不能覆盖。请改用其他名字。`,
        });
      }
    }

    // Patch：只放 input 里"实际提供"的字段；undefined 表示缺失，跳过。
    const patch: Partial<CharacterEntity> = {};
    // 走查第 3 次 R1：avatar 全空白字符串原样存浪费字节，且前端 PreviewAvatar
    // / AvatarChip 都 trim 后落 fallback；统一在入口 trim。
    if (typeof input.avatar === 'string') patch.avatar = input.avatar.trim();
    // 新会话 R1：bio / personality 是多行字段（character profile 长描述），不能像
    // name/relationship 那样一刀切拒所有控制字符（会误伤换行）。但 NULL byte
    // (\x00) + 其它非 \t/\n/\r 的 C0 控制字符（\x01-\x08、\x0B、\x0C、\x0E-\x1F、
    // \x7F）塞进 bio：
    //   - 进 AI prompt 拼接时让 LLM tokenizer 产生 OOV / 异常 token；
    //   - SQLite 存 NULL 字节本身没问题，但 character detail 的 react 渲染
    //     在不可见字符位会留视觉空洞；
    //   - 第三方 SDK 把 string 转 C-string 时会被 NULL 截断。
    // 在入口剥掉这些"不可见但允许 \t/\n/\r"的字节，比把整段 bio reject 更友好。
    if (typeof input.bio === 'string') {
      patch.bio = stripInvisibleControlChars(input.bio);
    }
    if (input.personality !== undefined) {
      patch.personality =
        typeof input.personality === 'string'
          ? stripInvisibleControlChars(input.personality)
          : (input.personality ?? undefined);
    }
    // 走查第 3 次 R1：relationship / relationshipType 是单行 UI 文本（chip / title），
    // 塞 "\n" 会撑高通讯录单行渲染，并把多行指令注入 AI prompt。和 name 同档拒。
    if (typeof input.relationship === 'string') {
      if (containsControlChar(input.relationship)) {
        throw new AppError('PRIVATE_IMPORT_INVALID', {
          status: HttpStatus.BAD_REQUEST,
          legacyMessage: 'relationship 不能包含换行符或控制字符。',
        });
      }
      patch.relationship = input.relationship;
    }
    if (typeof input.relationshipType === 'string') {
      if (containsControlChar(input.relationshipType)) {
        throw new AppError('PRIVATE_IMPORT_INVALID', {
          status: HttpStatus.BAD_REQUEST,
          legacyMessage: 'relationshipType 不能包含换行符或控制字符。',
        });
      }
      patch.relationshipType = input.relationshipType;
    }
    // region：单行 UI 文本（朋友信息页一行展示），含控制字符会撑高单行渲染。
    // 空 trim 后落 null，避免 "" 和 null 两种 "未设置" 状态分裂；和 friendship.region
    // / character.region 的 nullable 列对齐。
    if (typeof input.region === 'string') {
      if (containsControlChar(input.region)) {
        throw new AppError('PRIVATE_IMPORT_INVALID', {
          status: HttpStatus.BAD_REQUEST,
          legacyMessage: 'region 不能包含换行符或控制字符。',
        });
      }
      const trimmedRegion = input.region.trim();
      patch.region = trimmedRegion === '' ? null : trimmedRegion;
    }
    // expertDomains：每个元素是 tag chip。空字符串 / 控制字符都会破坏 chip
    // 渲染（零宽 pill / 撑高单行）。filter 空串 + reject 控制字符。
    if (Array.isArray(input.expertDomains)) {
      const cleaned: string[] = [];
      for (const item of input.expertDomains) {
        if (typeof item !== 'string') continue;
        if (containsControlChar(item)) {
          throw new AppError('PRIVATE_IMPORT_INVALID', {
            status: HttpStatus.BAD_REQUEST,
            legacyMessage: 'expertDomains 元素不能包含换行符或控制字符。',
          });
        }
        const trimmed = item.trim();
        if (trimmed.length > 0) cleaned.push(trimmed);
      }
      patch.expertDomains = cleaned;
    }
    // triggerScenes：每项是 scene id（如 "coffee_shop" / "gym"），用作场景匹配 + UI chip。
    // 第 4 次走查 R2：和 expertDomains 同档 — 元素带 "\n" 会破坏 chip / scene 匹配。
    // null 表示显式清空（保持现有语义）。
    if (input.triggerScenes !== undefined) {
      if (Array.isArray(input.triggerScenes)) {
        const cleaned: string[] = [];
        for (const item of input.triggerScenes) {
          if (typeof item !== 'string') continue;
          if (containsControlChar(item)) {
            throw new AppError('PRIVATE_IMPORT_INVALID', {
              status: HttpStatus.BAD_REQUEST,
              legacyMessage: 'triggerScenes 元素不能包含换行符或控制字符。',
            });
          }
          const trimmed = item.trim();
          if (trimmed.length > 0) cleaned.push(trimmed);
        }
        patch.triggerScenes = cleaned;
      } else {
        patch.triggerScenes = undefined;
      }
    }
    // profile 优先级最高（用户已经在 wiki 端 finalize 过的 PersonalityProfile）。
    // 没传 profile 但传了 recipe → 实时用 blueprint service 把 recipe → profile，
    // 否则用户花几十字段填的 prompt 配方会被静默丢，世界里 AI 完全没人设。
    // bundle 既无 profile 也无 recipe（早期 wiki 写入路径只填 name/bio）→ 用
    // 标量字段合成一个最小可用 baseline，避免 DB 里落 profile={} 这种导致
    // chat 路径 system_prompt 全空、AI 直接拒答的角色行。
    //
    // 第 5 次走查 R2：原条件 `input.profile !== undefined && input.profile !== null`
    // 会把 `profile:{}`（手工 bundle 误传 / 老版 wiki 导出半残）当 truthy 透传，
    // 跳过下面的 baseline fallback 同时还把 existing 的 meaningful profile（含
    // coreLogic 和 chat memory）整盘抹平 —— 验证：POST profile:{} 后 DB 落
    // `{characterId:'...'}`，chat 路径 basePrompt/name 全空，AI 拒答。
    // 改成统一用 hasMeaningfulProfile 判定 "用户实际给了能跑的人设"。
    // 新会话3 R1：profile / recipe 内层 basePrompt / coreLogic / memory.recentSummary
    // / traits 各 string 数组都直接进 AI prompt，恶意 bundle 在这里塞 NULL byte /
    // BIDI / DEL 也会污染 tokenizer。在 patch.profile 落库前递归 strip 一次。
    // tryDeriveProfileFromRecipe 用的是 blueprintService.buildProfileFromRecipe
    // 内部不会主动 strip，所以两个分支都要 strip。
    if (hasMeaningfulProfile(input.profile)) {
      patch.profile = stripInvisibleControlCharsDeep(input.profile);
    } else if (input.recipe) {
      const derived = this.tryDeriveProfileFromRecipe(input.recipe, trimmedName);
      if (derived && hasMeaningfulProfile(derived)) {
        patch.profile = stripInvisibleControlCharsDeep(derived);
      }
    }
    if (!hasMeaningfulProfile(patch.profile)) {
      // 同名 re-import：bundle 没带 profile/recipe（用户可能只想刷一下 bio / avatar），
      // 但现存 row 的 profile 已经被前一次正常 import 填好、且 chat memory 压缩
      // 可能往里追写了 memory.recentSummary —— 这时不能再用 baseline 把 existing.profile
      // 整盘覆盖（会丢角色记忆 + 用户精心填的 coreLogic）。只有现存 row 没 profile
      // 或 profile 不可用时才补 baseline；否则把 patch.profile 删掉、保留 existing。
      const existingProfileMeaningful = hasMeaningfulProfile(existing?.profile);
      if (!existingProfileMeaningful) {
        patch.profile = this.buildBaselineProfileFromInput(trimmedName, input);
      } else {
        delete patch.profile;
      }
    }
    // recipe / explicit profile 路径强制覆盖时，把现存 row 的 memory 子树 merge
    // 回来：用户改个 bio 重新导入，不能把"她还记得上次说过 xxx"这种运行时积累
    // 的对话记忆一起冲掉。
    //
    // 第 4 次走查 R1：原条件 `!patch.profile.memory` 在 recipe 派生路径下永远是
    // false —— applyRecipeToCharacter 总会写一个 memory={...} 子对象（即使
    // recentSummary/coreMemory 是空串，因为 wiki strip 过 memorySeed.recentSummarySeed/
    // coreMemory）。结果保留逻辑根本不触发，用户聊一段时间累出 recentSummary
    // 后重新导入 bundle（即便只改 bio）就把 chat memory 冲没。
    // 正确语义：
    //   - recentSummary / coreMemory 是运行时累积的对话记忆（chat compression 写入），
    //     bundle 里 wiki 永远导不出（被 strip），patch 里只可能是空串。空串不该覆盖。
    //   - forgettingCurve / recentSummaryPrompt / coreMemoryPrompt 是 seed 配置
    //     （wiki UI 暴露给用户填的提示词模板），bundle 显式带值就应该覆盖。
    // 所以走"运行时字段优先 existing，配置字段优先 patch"的细粒度 merge。
    if (patch.profile && existing?.profile?.memory) {
      type MemorySubset = { recentSummary?: string; coreMemory?: string };
      const existingMem = existing.profile.memory as Record<string, unknown> &
        MemorySubset;
      const patchMem = (patch.profile.memory ?? {}) as Record<string, unknown> &
        MemorySubset;
      const mergedMemory: Record<string, unknown> = {
        ...existingMem,
        ...patchMem,
      };
      // 运行时字段：patch 为空 → 用 existing。这样 wiki strip 过 memorySeed
      // 后导出的 bundle re-import 不会清掉 chat memory。
      if (
        (!patchMem.recentSummary || patchMem.recentSummary === '') &&
        existingMem.recentSummary
      ) {
        mergedMemory.recentSummary = existingMem.recentSummary;
      }
      if (
        (!patchMem.coreMemory || patchMem.coreMemory === '') &&
        existingMem.coreMemory
      ) {
        mergedMemory.coreMemory = existingMem.coreMemory;
      }
      patch.profile = {
        ...patch.profile,
        memory: mergedMemory as (typeof patch.profile)['memory'],
      };
    }

    // —— 2026-05-15 起：wiki 私有角色已和 admin 一一对应到这 11 个字段，
    // 透传到 CharacterEntity；undefined 表示用户没填（保留旧值/默认值）。
    if (typeof input.isOnline === 'boolean') patch.isOnline = input.isOnline;
    if (typeof input.onlineMode === 'string') {
      patch.onlineMode = input.onlineMode as CharacterEntity['onlineMode'];
    }
    if (typeof input.activityMode === 'string') {
      patch.activityMode = input.activityMode as CharacterEntity['activityMode'];
    }
    // currentActivity 是 UI 状态 chip（"working" / "sleeping" 等），单行渲染。
    // 第 4 次走查 R2：和 relationship 同档拒控制字符。null 表示显式清空。
    if (input.currentActivity !== undefined) {
      if (
        typeof input.currentActivity === 'string' &&
        containsControlChar(input.currentActivity)
      ) {
        throw new AppError('PRIVATE_IMPORT_INVALID', {
          status: HttpStatus.BAD_REQUEST,
          legacyMessage: 'currentActivity 不能包含换行符或控制字符。',
        });
      }
      patch.currentActivity = (input.currentActivity ??
        undefined) as CharacterEntity['currentActivity'];
    }
    // deletionPolicy / isTemplate：admin-only 字段，private_import 路径不允许改写。
    // 走查 R1：手工 bundle 加 "deletionPolicy":"protected" 落库后会让下次
    // re-import 永远 409 PRIVATE_IMPORT_NAME_RESERVED（service.ts:535 拒覆盖 protected），
    // 用户自己导入的角色也救不回；"isTemplate":true 则会让角色在 friend list /
    // 通讯录 / 角色目录全消失（findAllVisibleToOwner 默认 filter 掉 template）。
    // 这俩都是用户自己点不到的开关——既然 wiki bundle 也不导出（apps/wiki/src/lib/wiki-api.ts
    // PrivateCharacterDto 注释明确排除），import-personal 直接忽略掉。
    if (typeof input.socialOpenness === 'string') {
      patch.socialOpenness =
        input.socialOpenness as CharacterEntity['socialOpenness'];
    }
    if (typeof input.proactiveBrowseChance === 'number') {
      patch.proactiveBrowseChance = input.proactiveBrowseChance;
    }
    if (typeof input.intimacyLevel === 'number') {
      patch.intimacyLevel = input.intimacyLevel;
    }
    if (input.aiRelationships !== undefined) {
      // 走查第 3 次 R1：
      //   (1) bundle 里 relationshipType 没卡控制字符，"bff\nclose" 这种值会
      //       塞进 AI prompt 拼接形成多行指令；
      //   (2) 没 dedup，同一 characterId 写 3 条不同 strength 全部落库，下游
      //       按 Map / array[0] 读时取哪条全看迭代顺序，行为不确定。
      // 这里先把 relationshipType 卡掉、再走 Map 按 characterId 去重（last-wins
      // 保留语义：用户重复填同 id 时通常意图是覆盖前面那条）。
      const rels = input.aiRelationships ?? undefined;
      if (rels) {
        for (const rel of rels) {
          if (
            typeof rel?.relationshipType === 'string' &&
            containsControlChar(rel.relationshipType)
          ) {
            throw new AppError('PRIVATE_IMPORT_INVALID', {
              status: HttpStatus.BAD_REQUEST,
              legacyMessage:
                'aiRelationships.relationshipType 不能包含换行符或控制字符。',
            });
          }
        }
        const dedup = new Map<
          string,
          { characterId: string; relationshipType: string; strength: number }
        >();
        for (const rel of rels) {
          if (!rel?.characterId) continue;
          dedup.set(rel.characterId, rel);
        }
        patch.aiRelationships = Array.from(dedup.values());
      } else {
        patch.aiRelationships = undefined;
      }
    }
    // sourceType / sourceKey 不让 import 路径改写：它们是 import-personal
    // 自身的身份标识（'private_import' + name），用户在 wiki 编辑页改这俩
    // 只对私有角色行本地有效，不应该污染 world 里 CharacterEntity 的 source 标签
    // —— 否则下次 import 时第 485 行的 sourceType 校验会拒绝覆盖。

    // 第 5 次走查 R2 perf：原先流程是先 save、再回头修 profile.characterId /
    // 剥 aiRelationships 自环、再二次 save。新导入路径 baseline profile 落库的
    // characterId 永远是 ''，于是 needsResave 100% 触发，每次新导入都额外做一次
    // DB 写。改成"先算出最终 id、pre-save 一次性修好"，新导入从 2 次写降到 1 次。
    // randomUUID 比 Date.now()+Math.random 更稳，避免极端情况下 PK 冲突 500。
    const desiredId: string = existing
      ? existing.id
      : `private-${randomUUID()}`;
    // profile.characterId 永远 ≡ entity.id：buildBaselineProfileFromInput 这一刻
    // 还没 newId，会落 characterId=''；chat orchestrator 走
    // resolveRuntimeProvider({ characterId: profile.characterId }) 拿空串会跳过
    // character_override 路由——usageContext.characterId 还能兜住但语义上是错的。
    // 手工 bundle 写不匹配的 profile.characterId 也会让 character_override 静默失配，
    // 所以这里强制覆盖到 desiredId。
    if (patch.profile && patch.profile.characterId !== desiredId) {
      patch.profile = { ...patch.profile, characterId: desiredId };
    }
    // aiRelationships 里指向自身的条目剥掉——任何 social-graph tick 走 self-edge
    // 都是死循环或归一化失真的开端。
    if (Array.isArray(patch.aiRelationships)) {
      const withoutSelf = patch.aiRelationships.filter(
        (rel) => rel.characterId !== desiredId,
      );
      if (withoutSelf.length !== patch.aiRelationships.length) {
        patch.aiRelationships = withoutSelf;
      }
    }

    let saved: CharacterEntity;
    if (existing) {
      Object.assign(existing, patch);
      existing.name = trimmedName;
      saved = await this.scopedRepo.save(existing);
    } else {
      saved = await this.scopedRepo.save(
        this.repo.create({
          id: desiredId,
          name: trimmedName,
          avatar: '',
          bio: '',
          relationship: trimmedName,
          relationshipType: 'friend',
          expertDomains: [],
          profile: {} as PersonalityProfile,
          sourceType: 'private_import',
          sourceKey: trimmedName,
          deletionPolicy: 'archive_allowed',
          isTemplate: false,
          // private_import 默认 isOnline=true：用户从 wiki 主动把这个角色导
          // 入"我的世界"就是想跟 ta 互动 —— offline 默认让角色发完欢迎语后
          // 不再发动态、不响应 feed、不被 shake-discovery 匹配，导入完用户的
          // 直觉是"导入完没动静"。wiki bundle 不带 isOnline（admin-only），
          // 这里靠 import-personal 自身的默认 true 兜住；bundle 显式带 false
          // 时仍然透传（patch.isOnline 优先级高）。
          isOnline: true,
          onlineMode: 'auto',
          activityFrequency: 'normal',
          momentsFrequency: 1,
          feedFrequency: 1,
          intimacyLevel: 0,
          socialOpenness: 'normal',
          proactiveBrowseChance: 0.3,
          activityMode: 'auto',
          modelRoutingMode: 'inherit_default',
          allowOwnerKeyOverride: true,
          ...patch,
        } as Partial<CharacterEntity>),
      );
    }

    // Ensure friendship with world-owner so the character shows up in the
    // tenant's friends list.
    //   - 无 friendship 行 → 新建（status='friend'）
    //   - 有 friendship 但 status='removed'（软删除）→ 重新激活成 'friend'，
    //     否则用户 import 完角色仍然不出现在好友列表里
    //   - 'blocked' 是用户明确动作，不触碰
    //   - 其它正常状态（friend/close/best）保留 intimacy/星标
    // owner 在方法开头已经拉好（见走查 R1 注释），这里直接复用。
    const existingFriendship = await this.friendshipRepo.findOne({
      where: { ownerId: owner.id, characterId: saved.id },
    });
    let friendshipStatus: string;
    if (!existingFriendship) {
      const created = await this.friendshipRepo.save(
        this.friendshipRepo.create({
          ownerId: owner.id,
          characterId: saved.id,
          status: 'friend',
          source: 'private_import',
        }),
      );
      friendshipStatus = created.status;
    } else if (existingFriendship.status === 'removed') {
      existingFriendship.status = 'friend';
      // 软删→重激活：保留首次相识的 source；若原本就为空（早期 import 流程没写）
      // 就当作首次 import 回填 'private_import'，避免「来源」继续显示「未设置」。
      if (
        !existingFriendship.source ||
        !existingFriendship.source.trim()
      ) {
        existingFriendship.source = 'private_import';
      }
      const updated = await this.friendshipRepo.save(existingFriendship);
      friendshipStatus = updated.status;
    } else {
      friendshipStatus = existingFriendship.status;
    }

    // 第 5 次走查 R3：return 出 friendshipStatus 让 UI 判定显示哪条文案。
    // 之前 UI 无脑说"已自动加为你的好友"，但 blocked 状态的角色 re-import 后
    // 仍是 blocked（intentional：blocked 是用户明确动作），仍说"好友"是误导。
    return { character: saved, overwrote: !!existing, friendshipStatus };
  }

  /**
   * 把 wiki 私有角色 bundle 里的 recipe → PersonalityProfile。
   * recipe 是用户手填的、可能字段缺失/类型错乱，这里用 try/catch 兜底，
   * 出错就吞掉（按"recipe 没填"处理），避免一份坏 bundle 直接 500。
   */
  /**
   * 既没 profile 也没可用 recipe 时，从 import body 的标量字段
   * (name/relationship/expertDomains/bio/personality) 合成一个最小可用 profile。
   * 至少保证 name/relationship/traits 必填字段存在，让 prompt-builder 不再
   * 渲染出 "你是 undefined" 的 system_prompt。
   * 字段缺省值故意保守（emotionalTone: 自然真实 / responseLength: medium /
   * emojiUsage: occasional），与 RealWorldRuntimeProfileService 的运行时回填
   * 一致；下次用户在 wiki 补全 recipe 再导入，会被 input.profile/recipe 覆盖。
   */
  private buildBaselineProfileFromInput(
    trimmedName: string,
    input: {
      relationship?: string;
      relationshipType?: string;
      expertDomains?: string[];
      bio?: string;
      personality?: string | null;
    },
  ): PersonalityProfile {
    const personalityNote =
      typeof input.personality === 'string' ? input.personality.trim() : '';
    const bioNote = typeof input.bio === 'string' ? input.bio.trim() : '';
    const relationship =
      (typeof input.relationship === 'string' && input.relationship.trim()) ||
      trimmedName;
    const basePrompt =
      [
        trimmedName ? `你是${trimmedName}` : '',
        relationship ? `用户的${relationship}` : '',
        personalityNote ? `性格：${personalityNote}` : '',
        bioNote ? `简介：${bioNote}` : '',
      ]
        .filter(Boolean)
        .join('，') || '';
    return {
      characterId: '',
      name: trimmedName,
      relationship,
      expertDomains: Array.isArray(input.expertDomains)
        ? input.expertDomains.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
      basePrompt,
      memorySummary: '',
      traits: {
        speechPatterns: [],
        catchphrases: [],
        topicsOfInterest: [],
        emotionalTone: '自然真实',
        responseLength: 'medium',
        emojiUsage: 'occasional',
      },
    } as PersonalityProfile;
  }

  private tryDeriveProfileFromRecipe(
    recipe: CharacterBlueprintRecipeValue,
    characterIdHint: string,
  ): PersonalityProfile | null {
    try {
      return this.blueprintService.buildProfileFromRecipe(
        recipe,
        characterIdHint,
      ) as PersonalityProfile;
    } catch (err) {
      // recipe 字段缺失（wiki strip 过 / 第三方脚本上传半残数据）是常见的，
      // 但旧实现走 console.warn 不会进 Nest formatter，stderr 里被淹掉、
      // 用户报"导入私有角色 chat 空回复"时排查只能靠人肉 grep。
      // 走 logger.warn 至少能在 dev-services/api-*.err.log 里搜到 stack。
      this.logger.warn(
        // i18n-ignore-line: backend log line, not user-facing
        `[importPersonalCharacter] recipe → profile failed for "${characterIdHint}": ${(err as Error).message}`,
      );
      return null;
    }
  }

  private normalizeCharacterAvatars(characters: CharacterEntity[]) {
    return characters.map(
      (character) => this.normalizeCharacterAvatar(character) ?? character,
    );
  }

  private normalizeCharacterAvatar(
    character: CharacterEntity | null | undefined,
  ): CharacterEntity | null {
    if (!character) {
      return null;
    }

    const canonicalAvatar = this.resolveCanonicalCharacterAvatar(character);
    if (
      !canonicalAvatar ||
      !this.shouldReplaceCharacterAvatar(character.avatar, canonicalAvatar)
    ) {
      return character;
    }

    return {
      ...character,
      avatar: canonicalAvatar,
    };
  }

  private resolveCanonicalCharacterAvatar(
    character: Pick<CharacterEntity, 'id' | 'sourceKey'>,
  ) {
    const mappedBySourceKey = maybeGetCharacterAvatarBySourceKey(
      character.sourceKey,
    );
    if (mappedBySourceKey) {
      return mappedBySourceKey;
    }

    const builtInPreset = getBuiltInPresetById(character.id);
    const mappedByBuiltInPreset = maybeGetCharacterAvatarBySourceKey(
      builtInPreset?.character?.sourceKey ?? builtInPreset?.presetKey,
    );
    if (mappedByBuiltInPreset) {
      return mappedByBuiltInPreset;
    }

    const defaultCharacter = getDefaultCharacterById(character.id);
    return (
      maybeGetCharacterAvatarBySourceKey(defaultCharacter?.sourceKey) ??
      builtInPreset?.character?.avatar?.trim() ??
      builtInPreset?.avatar?.trim() ??
      defaultCharacter?.avatar?.trim() ??
      null
    );
  }

  private shouldReplaceCharacterAvatar(
    currentAvatar: string | null | undefined,
    canonicalAvatar: string,
  ) {
    const normalizedAvatar = currentAvatar?.trim() ?? '';
    if (!normalizedAvatar) {
      return true;
    }

    if (normalizedAvatar === canonicalAvatar) {
      return false;
    }

    if (normalizedAvatar.startsWith('/api/character-assets/')) {
      return true;
    }

    return !this.isLikelyImageSource(normalizedAvatar);
  }

  private isLikelyImageSource(value: string) {
    return (
      value.startsWith('/') ||
      value.startsWith('./') ||
      value.startsWith('../') ||
      value.startsWith('blob:') ||
      /^https?:\/\//i.test(value) ||
      /^data:image\//i.test(value) ||
      /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value)
    );
  }

  /**
   * 一次性迁移：把 sourceType='private_import' 且 profile 空 / 不可用的历史行
   * 补成 baseline profile，让对话路径不再依赖 RealWorldRuntimeProfileService
   * 的运行时回填（运行时回填没问题，但 chat memory compression / moments
   * generation 等会 mutate `char.profile.memory` 的路径会写在 {} 之上，导致
   * 字段半残）。
   *
   * 仅当 worldOwnerService 已就绪时做（多租户 spawn 早期可能还没装好），失败
   * 兜底不阻塞 boot。幂等：hasMeaningfulProfile 通过后跳过。
   */
  private async backfillEmptyPrivateImportProfiles() {
    let dirtyRows: CharacterEntity[];
    try {
      dirtyRows = await this.repo.find({
        where: { sourceType: 'private_import' },
      });
    } catch (err) {
      this.logger.warn(
        // i18n-ignore-line: backend log line, not user-facing
        `[backfillEmptyPrivateImportProfiles] DB query failed: ${(err as Error).message}`,
      );
      return;
    }
    const pending = dirtyRows.filter(
      (row) => !hasMeaningfulProfile(row.profile),
    );
    if (pending.length === 0) return;

    const healed: CharacterEntity[] = [];
    for (const row of pending) {
      const synthesized = this.buildBaselineProfileFromInput(row.name, {
        relationship: row.relationship,
        relationshipType: row.relationshipType,
        expertDomains: row.expertDomains,
        bio: row.bio,
        personality: row.personality ?? undefined,
      });
      synthesized.characterId = row.id;
      // 历史 row 可能曾经被 memory compression 写过 memory 字段，但 hasMeaningfulProfile
      // 标准是 name/coreLogic/basePrompt/scenePrompts.chat —— memory 单飞不算"可用"。
      // 这里 merge 一下保留旧 memory，避免清掉积累的对话记忆。
      if (row.profile?.memory) {
        synthesized.memory = { ...row.profile.memory };
      }
      row.profile = synthesized;
      healed.push(row);
    }
    await this.repo.save(healed);
    this.logger.log(
      // i18n-ignore-line: backend log line, not user-facing
      `[backfillEmptyPrivateImportProfiles] healed ${healed.length} private_import rows with empty profile`,
    );
  }

  private async backfillCharacterAvatarAssets() {
    const characters = await this.repo.find();
    const pendingUpdates: CharacterEntity[] = [];

    for (const character of characters) {
      const normalizedCharacter = this.normalizeCharacterAvatar(character);
      if (
        normalizedCharacter &&
        normalizedCharacter.avatar !== character.avatar
      ) {
        pendingUpdates.push(normalizedCharacter);
      }
    }

    if (pendingUpdates.length === 0) {
      return;
    }

    await this.repo.save(pendingUpdates);
  }

  private async filterNeedGeneratedVisibility(
    characters: CharacterEntity[],
    ownerId?: string,
  ) {
    const hasNeedGenerated = characters.some(
      (character) => character.sourceType === 'need_generated',
    );
    if (!hasNeedGenerated) {
      return characters;
    }

    const activeFriendCharacterIds =
      await this.getActiveFriendCharacterIdSet(ownerId);
    return characters.filter(
      (character) =>
        character.sourceType !== 'need_generated' ||
        activeFriendCharacterIds.has(character.id),
    );
  }

  async getActiveFriendCharacterIdSet(ownerId?: string) {
    const resolvedOwnerId =
      ownerId ?? (await this.worldOwnerService.getOwnerOrThrow()).id;
    const friendships = await this.friendshipRepo.find({
      select: ['characterId'],
      where: [
        { ownerId: resolvedOwnerId, status: 'friend' },
        { ownerId: resolvedOwnerId, status: 'close' },
        { ownerId: resolvedOwnerId, status: 'best' },
      ],
    });
    return new Set(friendships.map((item) => item.characterId));
  }
}

// trim 后再剥零宽字符（U+200B-U+200D / U+FEFF / U+2060），用来判定"视觉为空"。
// 和 wiki-private-character.service.ts 的 isVisuallyEmpty 同语义，避免纯 ZWS 名字
// 被 trim() 漏过、导入后在通讯录里出现一行点不开的空标签。
function isPrivateImportNameVisuallyEmpty(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return trimmed.replace(/[​-‍﻿⁠]/g, '').length === 0;
}

// 走查 R1：原来 name 没卡控制字符，"line1\nline2" 被允许写入；落库后通讯录
// /聊天列表/朋友圈的单行 title 渲染会把换行展开成换行符或撑高列表项，且
// 用 ${name} 拼 AI prompt 也会被 LLM 当成多行指令。统一在 import 前 reject。
//
// 第 5 次走查 R1：原正则只覆盖 \x00-\x1F\x7F 的 ASCII 控制字符，漏掉了 3 类
// 真实会出问题的非 ASCII 不可见/越权字符：
//   1. U+0085 (NEL)、U+2028 (LINE SEPARATOR)、U+2029 (PARAGRAPH SEPARATOR)
//      — Unicode 行终止符，CSS/Canvas 等单行渲染会断行；JSON 中合法所以前面
//      的 body parser 不拦。Test 7、8、13 验证：包含 U+2028 的 name/relationship
//      被原条件放过、落库后通讯录单行渲染就被撑成多行。
//   2. U+202A-U+202E (BIDI override)、U+200E/U+200F (LTR/RTL marks)
//      — 经典 IDN homograph 攻击向量。Test 11 验证：name="good‮bad" 视觉上
//      渲染成 "gooddab"（U+202E 翻转后续字符方向），用户在通讯录里看到的
//      字面值与 DB 实际存的不一致；同时这字符塞进 AI prompt 也会形成 prompt
//      injection 风险（LLM 看到的 token 顺序和用户视觉看到的不一致）。
//   3. U+FEFF (BOM/ZWNBSP) — 已经被 isPrivateImportNameVisuallyEmpty 在"全
//      零宽"判定里 strip 过，但夹在非空字符中间时这里也要拦（"abc<BOM>def"
//      作为单行 chip 不会断行但会让搜索/dedup 失配）。
const NAME_CONTROL_CHAR_RE =
  /[\x00-\x1F\x7F\u0085\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
function containsControlChar(raw: string): boolean {
  return NAME_CONTROL_CHAR_RE.test(raw);
}

// \u65B0\u4F1A\u8BDD R1\uFF1Abio / personality \u7B49\u591A\u884C\u5B57\u6BB5\u5141\u8BB8 \t \n \r\uFF0C\u4F46\u5176\u5B83 C0 \u63A7\u5236\u5B57\u7B26
// (\x00 NULL / \x01-\x08 / \x0B / \x0C / \x0E-\x1F) + DEL(\x7F) + BIDI override
// \u4ECD\u7136\u662F"\u4E0D\u53EF\u89C1\u4F46\u6709\u526F\u4F5C\u7528"\u7684\u6C61\u67D3\u6E90\u3002\u5265\u6389\u8FD9\u4E9B\u5B57\u8282\u540E\u4FDD\u7559\u6B63\u5E38\u6587\u672C\u3002
//
// \u4E0D\u5265 \u200B-\u200D \u96F6\u5BBD\u8FDE\u63A5\u7B26\u2014\u2014\u8FD9\u4E9B\u5728\u4E2D\u6587/emoji ZWJ \u5E8F\u5217\u91CC\u5408\u6CD5\u9700\u8981\u4FDD\u7559\u3002
const INVISIBLE_CONTROL_CHAR_GLOBAL_RE =
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u0085\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
function stripInvisibleControlChars(raw: string): string {
  return raw.replace(INVISIBLE_CONTROL_CHAR_GLOBAL_RE, '');
}

// \u65B0\u4F1A\u8BDD3 R1\uFF1Aprofile / recipe \u662F JSON object\uFF0C\u5185\u5C42 basePrompt / coreLogic /
// memory.recentSummary / traits.speechPatterns[] \u7B49\u5168\u662F\u5B57\u7B26\u4E32\uFF0C\u5E76\u4E14\u5168\u90FD\u76F4\u63A5
// \u62FC\u8FDB AI prompt\u3002\u539F strip \u53EA\u5BF9 bio / personality \u6807\u91CF\u751F\u6548\uFF0Cprofile \u5185\u5C42\u7684
// NULL byte / DEL / BIDI \u4ECD\u80FD\u843D\u5E93\u3002
//
// \u6539\u6210\u5BF9 profile/recipe \u6574\u4E2A\u5BF9\u8C61\u9012\u5F52 strip \u6240\u6709\u5B57\u7B26\u4E32\u503C\u2014\u2014key \u4FDD\u6301\u539F\u6837\uFF08key
// \u662F\u5F00\u53D1\u8005\u5B9A\u4E49\u7684\u56FA\u5B9A\u96C6\u5408\uFF0C\u4E0D\u4F1A\u88AB\u6076\u610F bundle \u6C61\u67D3\uFF09\u3002\u5BF9 5k \u5B57\u6BB5\u91CF\u7EA7\u7684 profile
// JSON\uFF0C\u904D\u5386\u5F00\u9500 < 1ms\uFF0C\u53EF\u4EE5\u63A5\u53D7\u3002
//
// Array \u9879\u662F string \u2192 strip\uFF1B\u662F object \u2192 \u9012\u5F52\uFF1B\u5176\u5B83\uFF08number / boolean / null /
// undefined\uFF09\u539F\u6837\u4FDD\u7559\u3002\u51FD\u6570\u8FD4\u56DE\u65B0\u5BF9\u8C61\uFF0C\u4E0D mutate \u5165\u53C2\uFF0C\u907F\u514D\u6C61\u67D3 input ref\u3002
function stripInvisibleControlCharsDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return stripInvisibleControlChars(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripInvisibleControlCharsDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripInvisibleControlCharsDeep(v);
    }
    return out as T;
  }
  return value;
}

// 字段长度上限。后端 entity 是 text/json 列没硬限，但用户填的内容直接进
// AI prompt + 全部存全 world，过长会撑爆 context cost / DB 体积。
// 数字偏宽松，目的是挡住误传（粘整本小说 / GB 级文件），不卡正常使用。
const PRIVATE_CHARACTER_FIELD_LIMITS = {
  name: 80,
  avatar: 2000,
  bio: 2000,
  personality: 2000,
  relationship: 200,
  relationshipType: 80,
  // region 不进 AI prompt（只在 character card / 朋友信息页文案展示），但仍要挡
  // 误传：64 字够装 `广东·深圳市福田区` 这类粒度，并发"复制了一篇地区科普"也接得住。
  region: 64,
  expertDomainItem: 80,
  expertDomainCount: 50,
  triggerSceneItem: 80,
  triggerSceneCount: 50,
  recipeJsonBytes: 64 * 1024,
  profileJsonBytes: 64 * 1024,
  // aiRelationships 是独立列，不进 profile JSON cap；走查 R1 发现传 500 个
  // forwards-reference relation 也能落库，对 social graph tick 是开销放大器。
  aiRelationshipsCount: 50,
} as const;

/**
 * Avatar 安全 schema：放行 emoji / 字面量字符串 / http(s) URL / 站内绝对路径。
 * 拒绝 `javascript:` / `data:` / `file:` 等可能引发 XSS / SSRF 的 scheme。
 * 与 apps/wiki/src/lib/string-utils.ts 的 isSafeAvatarValue 严格对齐——
 * 前端早 reject 体感更好，但后端必须再守一道：curl PUT 可以绕过前端。
 *
 * 新会话 R1：原 `value.startsWith('/')` 把 `//evil.example/x.png` 当站内路径
 * 放过。但 `<img src="//evil/x">` 浏览器按当前页面协议解析成 `https://evil/x`
 * —— 这是 scheme-relative URL，允许恶意 bundle 内嵌任意第三方 host 的 image
 * （跟踪像素 / 隐私探针 / 内网 SSRF）。
 *
 * 新会话2 R1：只 reject 字面量 `//` 还不够。WHATWG URL parser 把开头任意 2 个
 * 「斜杠类」字符（`/`、`\` 两两组合）都规范化成 `//` —— 验证：
 *   new URL("/\\evil/x",  "https://yinjie.app/p") → https://evil/x  (external!)
 *   new URL("\\/evil/x",  "...")                 → https://evil/x  (external!)
 *   new URL("\\\\evil/x", "...")                 → https://evil/x  (external!)
 *   new URL("\\evil/x",   "...")                 → https://yinjie.app/evil/x  (OK)
 * 所以 reject 规则要扩成"前两个字符是任意 `/` 或 `\`"。单个 `\` 开头会被 URL
 * parser 归一成 `/`，仍是同源路径，可放过。
 */
const SCHEME_RELATIVE_AVATAR_RE = /^[/\\][/\\]/;
function isSafeAvatarValueBackend(raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;
  if (SCHEME_RELATIVE_AVATAR_RE.test(value)) return false;
  if (value.startsWith('/')) return true;
  if (!value.includes(':')) return true;
  const lc = value.toLowerCase();
  return lc.startsWith('http://') || lc.startsWith('https://');
}

const SOCIAL_OPENNESS_VALUES = ['open', 'normal', 'private'] as const;
// 下游 reply-logic / scheduler / blueprint 都做 `=== 'manual'` 检查，任意非 manual
// 字符串都被当 auto 用，功能上不崩，但 DB 里堆垃圾枚举值，admin 排查 / 数据迁移
// 时一头雾水。和 socialOpenness 同样走白名单。
const ONLINE_MODE_VALUES = ['auto', 'manual'] as const;
const ACTIVITY_MODE_VALUES = ['auto', 'manual'] as const;

export function assertPrivateCharacterFieldLimits(input: {
  name?: string;
  avatar?: string;
  bio?: string;
  personality?: string | null;
  relationship?: string;
  relationshipType?: string;
  region?: string | null;
  expertDomains?: string[];
  triggerScenes?: string[] | null;
  recipe?: unknown;
  profile?: unknown;
  socialOpenness?: string;
  proactiveBrowseChance?: number;
  intimacyLevel?: number;
  onlineMode?: string;
  activityMode?: string;
  aiRelationships?:
    | { characterId: string; relationshipType: string; strength: number }[]
    | null;
}): void {
  const L = PRIVATE_CHARACTER_FIELD_LIMITS;
  const tooLong = (label: string, max: number) =>
    new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: `${label} 超长（上限 ${max}）。`,
    });
  if (input.name && input.name.length > L.name) throw tooLong('name', L.name);
  if (input.avatar && input.avatar.length > L.avatar)
    throw tooLong('avatar', L.avatar);
  if (input.bio && input.bio.length > L.bio) throw tooLong('bio', L.bio);
  if (input.personality && input.personality.length > L.personality)
    throw tooLong('personality', L.personality);
  if (input.relationship && input.relationship.length > L.relationship)
    throw tooLong('relationship', L.relationship);
  if (
    input.relationshipType &&
    input.relationshipType.length > L.relationshipType
  )
    throw tooLong('relationshipType', L.relationshipType);
  if (
    typeof input.region === 'string' &&
    input.region.length > L.region
  )
    throw tooLong('region', L.region);
  // 单行 UI 字段（name / relationship / relationshipType / region）不能含换行符或
  // 控制字符：它们渲染成通讯录单行 chip / 标题，\n 会撑高布局，且这些值直接拼进
  // AI prompt，多行注入是 prompt-injection 面。世界 import-personal 路径本来就逐个
  // 内联拒（name 在本校验器之前、relationship/relationshipType/region 在之后），
  // 但 wiki 私有角色写入路径（createStrict / update / upsertByName）只经过本校验器
  // —— 之前漏了控制字符校验，导致 wiki 里能存下带 \n 的 name，再走"导出 JSON →
  // app 端导入"时被世界侧拒，round-trip 单向断裂。把校验收进共享校验器后两条路径
  // 对齐；世界路径的内联检查保留为冗余（消息完全一致，不改变可观测行为）。
  const singleLineFields: Array<[string, string | null | undefined]> = [
    ['name', input.name],
    ['relationship', input.relationship],
    ['relationshipType', input.relationshipType],
    ['region', input.region],
  ];
  for (const [label, value] of singleLineFields) {
    if (typeof value === 'string' && containsControlChar(value)) {
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: `${label} 不能包含换行符或控制字符。`,
      });
    }
  }
  if (Array.isArray(input.expertDomains)) {
    if (input.expertDomains.length > L.expertDomainCount)
      throw tooLong('expertDomains 个数', L.expertDomainCount);
    for (const item of input.expertDomains) {
      if (typeof item === 'string' && item.length > L.expertDomainItem)
        throw tooLong('expertDomains 元素', L.expertDomainItem);
    }
  }
  if (Array.isArray(input.triggerScenes)) {
    if (input.triggerScenes.length > L.triggerSceneCount)
      throw tooLong('triggerScenes 个数', L.triggerSceneCount);
    for (const item of input.triggerScenes) {
      if (typeof item === 'string' && item.length > L.triggerSceneItem)
        throw tooLong('triggerScenes 元素', L.triggerSceneItem);
    }
  }
  // JSON.stringify 可能因循环引用炸；try/catch 兜底，不要因 size check 把请求干 500。
  if (input.recipe !== undefined && input.recipe !== null) {
    try {
      const bytes = Buffer.byteLength(JSON.stringify(input.recipe), 'utf8');
      if (bytes > L.recipeJsonBytes)
        throw tooLong(
          `recipe JSON (${(bytes / 1024).toFixed(1)} KB)`,
          L.recipeJsonBytes,
        );
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: `recipe JSON 不可序列化：${(err as Error).message}`,
      });
    }
  }
  if (input.profile !== undefined && input.profile !== null) {
    try {
      const bytes = Buffer.byteLength(JSON.stringify(input.profile), 'utf8');
      if (bytes > L.profileJsonBytes)
        throw tooLong(
          `profile JSON (${(bytes / 1024).toFixed(1)} KB)`,
          L.profileJsonBytes,
        );
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: `profile JSON 不可序列化：${(err as Error).message}`,
      });
    }
  }
  // avatar scheme：javascript:/data:/file: 是 XSS/SSRF 攻击面。前端 isSafeAvatarValue
  // 已挡，但 curl PUT 能绕过 —— 后端再守一道。
  if (typeof input.avatar === 'string' && !isSafeAvatarValueBackend(input.avatar)) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: 'avatar 只能填 emoji、http(s) URL 或 / 开头的站内路径。',
    });
  }
  // socialOpenness 必须是 open / normal / private 之一。
  // 前端 SelectField 只给 3 个值，但任意字符串能从 PUT body 写进 DB，让下游
  // moments / social 服务读到非法值（落到默认分支前可能先 throw / NaN）。
  if (
    input.socialOpenness !== undefined &&
    !SOCIAL_OPENNESS_VALUES.includes(
      input.socialOpenness as (typeof SOCIAL_OPENNESS_VALUES)[number],
    )
  ) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: `socialOpenness 取值只能是 ${SOCIAL_OPENNESS_VALUES.join(' / ')}。`,
    });
  }
  // proactiveBrowseChance ∈ [0, 1]；越界值前端会被 parseFloatInRange 卡掉，
  // 这里挡住 curl 直传 99 这种把 social tick 概率拉满的 misuse。
  if (typeof input.proactiveBrowseChance === 'number') {
    if (
      !Number.isFinite(input.proactiveBrowseChance) ||
      input.proactiveBrowseChance < 0 ||
      input.proactiveBrowseChance > 1
    ) {
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'proactiveBrowseChance 必须在 0 - 1 之间。',
      });
    }
  }
  // onlineMode / activityMode 走 'auto' | 'manual' 白名单。下游
  // reply-logic / scheduler / blueprint 都做 `=== 'manual'` 检查，任意非 manual
  // 字符串都被当 auto 用——功能上不崩，但 DB 里堆 "ALWAYS_ONLINE_OMG" 这种垃圾
  // 枚举值，admin 数据排查 / 后续迁移时一头雾水。
  if (
    input.onlineMode !== undefined &&
    !ONLINE_MODE_VALUES.includes(
      input.onlineMode as (typeof ONLINE_MODE_VALUES)[number],
    )
  ) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: `onlineMode 取值只能是 ${ONLINE_MODE_VALUES.join(' / ')}。`,
    });
  }
  if (
    input.activityMode !== undefined &&
    !ACTIVITY_MODE_VALUES.includes(
      input.activityMode as (typeof ACTIVITY_MODE_VALUES)[number],
    )
  ) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: `activityMode 取值只能是 ${ACTIVITY_MODE_VALUES.join(' / ')}。`,
    });
  }
  // aiRelationships 独立列，不进 profile JSON cap，500+ relation 也能落库。
  // social-graph tick 会按这个数组迭代，超量值是显著的 CPU 放大器。
  if (Array.isArray(input.aiRelationships)) {
    if (input.aiRelationships.length > L.aiRelationshipsCount) {
      throw tooLong('aiRelationships 个数', L.aiRelationshipsCount);
    }
  }
  // intimacyLevel ∈ [0, 100]，整数。世界运行时会自动调整，初值越界会让
  // 亲密度系统的归一化 / step 函数出现 NaN 或负偏移。
  if (typeof input.intimacyLevel === 'number') {
    if (
      !Number.isFinite(input.intimacyLevel) ||
      input.intimacyLevel < 0 ||
      input.intimacyLevel > 100
    ) {
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'intimacyLevel 必须在 0 - 100 之间。',
      });
    }
    // 新会话 R1 走查：column 是 TypeORM 推断 INTEGER，bundle 写 1.5 在 SQLite
    // 上会被静默截断成 1（INSERT 1.5 → row 存 1，回读也是 1）。原 Number.isFinite
    // 范围检查放过浮点 → 用户精心填 25.5 期望保留小数，落库变 25，view 端再也
    // 找不回；admin/wiki 数据迁移时也会一头雾水。明确拒，给用户一个可纠正的 400。
    if (!Number.isInteger(input.intimacyLevel)) {
      throw new AppError('PRIVATE_IMPORT_INVALID', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: 'intimacyLevel 必须是整数（0 - 100），不接受小数。',
      });
    }
  }
}
// i18n-ignore-end

let builtInPresetByIdCache:
  | Map<string, (typeof BUILT_IN_CHARACTER_PRESETS)[number]>
  | null = null;
function getBuiltInPresetById(id: string) {
  if (!builtInPresetByIdCache) {
    builtInPresetByIdCache = new Map(
      BUILT_IN_CHARACTER_PRESETS.map((preset) => [preset.id, preset]),
    );
  }
  return builtInPresetByIdCache.get(id);
}

let defaultCharacterByIdCache: Map<string, Partial<CharacterEntity>> | null =
  null;
function getDefaultCharacterById(id: string) {
  if (!defaultCharacterByIdCache) {
    defaultCharacterByIdCache = new Map(
      buildDefaultCharacters()
        .filter((c): c is Partial<CharacterEntity> & { id: string } => !!c.id)
        .map((c) => [c.id, c]),
    );
  }
  return defaultCharacterByIdCache.get(id);
}
