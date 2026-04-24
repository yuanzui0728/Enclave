import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharacterEntity } from '../characters/character.entity';
import { CharactersService } from '../characters/characters.service';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { SocialService } from '../social/social.service';
import { FeedService } from '../feed/feed.service';
import { SystemConfigService } from '../config/config.service';
import type {
  WechatSyncContactBundleValue,
  WechatSyncHistoryResponseValue,
  WechatSyncImportRequestValue,
  WechatSyncImportResponseValue,
  WechatSyncPreviewItemValue,
  WechatSyncPreviewRequestValue,
  WechatSyncPreviewResponseValue,
  WechatSyncRetryFriendshipResponseValue,
  WechatSyncRollbackResponseValue,
} from './wechat-sync-admin.types';

type ImportSnapshotRecord = NonNullable<
  NonNullable<CharacterEntity['profile']['wechatSyncImport']>['currentSnapshot']
>;

type ImportChangeRecord = NonNullable<
  NonNullable<CharacterEntity['profile']['wechatSyncImport']>['changeHistory']
>[number];

type ImportChangeDiffRecord = NonNullable<ImportChangeRecord['diffs']>[number];

type WechatSyncAnalysisPromptConfig = {
  systemPrompt: string;
  userPromptTemplate: string;
};

type PreviewContactResult = {
  item: WechatSyncPreviewItemValue;
  aiAvailableForNextContacts: boolean;
};

const WECHAT_SYNC_PREVIEW_CONCURRENCY = 1;
const WECHAT_SYNC_AI_PREVIEW_TIMEOUT_MS = 120_000;
const WECHAT_SYNC_PREVIEW_MAX_SAMPLE_MESSAGES = 60;
const WECHAT_SYNC_PREVIEW_MAX_MOMENT_HIGHLIGHTS = 20;
const WECHAT_SYNC_MIN_MESSAGES_FOR_AI_PREVIEW = 12;
const WECHAT_SYNC_MIN_SAMPLES_FOR_AI_PREVIEW = 3;
const WECHAT_SYNC_SYSTEM_PROMPT_CONFIG_KEY =
  'wechat_sync_analysis_system_prompt';
const WECHAT_SYNC_USER_PROMPT_TEMPLATE_CONFIG_KEY =
  'wechat_sync_analysis_user_prompt_template';
const DEFAULT_WECHAT_SYNC_ANALYSIS_SYSTEM_PROMPT = `你是隐界的“微信熟人角色重建分析师”。
你的任务不是创造一个更讨喜的虚构角色，而是基于微信聊天记录、备注、标签、朋友圈线索和互动节奏，尽可能还原这个真实联系人在用户心中的样子，并输出可导入隐界的角色 JSON 草稿。

分析原则：
1. 准确性、证据一致性、真人还原度优先于速度、戏剧性和讨喜程度。
2. 只依据给定材料下结论。职业、身份、关系亲密度、价值观、说话方式、边界感都必须有聊天或资料线索支撑。
3. 证据不足时必须保守，不要脑补确定事实。可以使用“更像是”“看起来”“倾向于”等表达，但不要编造。
4. 这是用户微信里的真实熟人，不是客服、助理、导师模板或万能陪伴角色。
5. 输出要让认识此人的用户读起来觉得“像他/她本人”，而不是“像 AI 总结的人设”。
6. basePrompt 只保留这个人的表达习惯、互动边界、主动性、熟悉程度和禁区，不要写成系统提示词、操作手册或万能助理说明。
7. relationshipType 默认优先 friend，只有证据非常强时才改为 family、mentor、expert 或 custom。
8. expertDomains 只保留稳定且有证据的领域，不要泛化堆标签。
9. 如果聊天里体现出矛盾、情绪波动、表达克制、回复习惯或身份不确定性，要把这种“不完全确定但真实存在的模糊感”保留下来，不要强行归纳得过于整齐。
10. 输出前先在内部核对：是否有任何字段明显超出证据、是否把真人写成了服务型 AI、是否过度美化或降噪了此人的真实语气。

只输出合法 JSON，不要输出解释、推理过程或额外文字。`;
const DEFAULT_WECHAT_SYNC_ANALYSIS_USER_PROMPT_TEMPLATE = `请根据以下微信联系人资料，重建一个“尽量接近现实本人”的隐界角色草稿。

目标：
- 优先还原真实关系、熟悉程度、说话口气、互动边界、常聊主题、生活状态和可能身份。
- 优先保留这个人的真人感，不要为了更好聊而把对方写得更温柔、更积极、更健谈或更懂用户。
- 如果资料不足，请明确走保守推断：少下结论、少补设定、少发散脑补。
- bio、background、motivation、worldview、memorySummary 要像熟人画像，而不是心理测评或人物小传。
- speechPatterns、catchphrases、topicsOfInterest 必须尽量来自真实聊天表达，不要写空泛套话。
- basePrompt 必须像“这个人本人会怎么说话、怎么回应、有哪些边界”，而不是客服话术或助手提示词。

可用资料：
{{contact_context}}

输出要求：
1. 所有字段尽量贴近证据，不要虚构确定细节。
2. 如果某些字段只能弱判断，也要写得保守自然，不要空泛。
3. 若聊天中能看出关系不对等、长期未联系、只在特定场景互动、或对方回复很克制，请在角色里保留这种分寸感。
4. 最终只输出合法 JSON。`;

@Injectable()
export class WechatSyncAdminService {
  private readonly logger = new Logger(WechatSyncAdminService.name);

  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
    @InjectRepository(FriendRequestEntity)
    private readonly friendRequestRepo: Repository<FriendRequestEntity>,
    @InjectRepository(MomentPostEntity)
    private readonly momentPostRepo: Repository<MomentPostEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly socialService: SocialService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly charactersService: CharactersService,
    private readonly feedService: FeedService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async getHistory(): Promise<WechatSyncHistoryResponseValue> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const characters = await this.characterRepo.find({
      where: { sourceType: 'wechat_import' },
      order: { name: 'ASC' },
    });

    if (!characters.length) {
      return { items: [] };
    }

    const characterIds = characters.map((item) => item.id);
    const [friendships, friendRequests, momentPosts] = await Promise.all([
      this.friendshipRepo.find({
        where: { ownerId: owner.id, characterId: In(characterIds) },
      }),
      this.friendRequestRepo.find({
        where: { ownerId: owner.id, characterId: In(characterIds) },
        order: { createdAt: 'DESC' },
      }),
      this.momentPostRepo.find({
        where: { authorType: 'character', authorId: In(characterIds) },
      }),
    ]);

    const friendshipMap = new Map(
      friendships.map((item) => [item.characterId, item]),
    );
    const requestMap = new Map<string, FriendRequestEntity>();
    for (const request of friendRequests) {
      if (!requestMap.has(request.characterId)) {
        requestMap.set(request.characterId, request);
      }
    }
    const momentCountMap = new Map<string, number>();
    for (const post of momentPosts) {
      momentCountMap.set(
        post.authorId,
        (momentCountMap.get(post.authorId) ?? 0) + 1,
      );
    }

    const items = characters
      .map((character) => {
        const friendship = friendshipMap.get(character.id);
        const request = requestMap.get(character.id);
        const importedAt =
          character.profile?.wechatSyncImport?.currentSnapshot?.importedAt ??
          request?.createdAt?.toISOString() ??
          friendship?.createdAt?.toISOString() ??
          null;

        return {
          character,
          importedAt,
          friendshipStatus: friendship?.status ?? null,
          friendshipCreatedAt: friendship?.createdAt?.toISOString() ?? null,
          lastInteractedAt: friendship?.lastInteractedAt?.toISOString() ?? null,
          seededMomentCount: momentCountMap.get(character.id) ?? 0,
          remarkName: friendship?.remarkName ?? null,
          region: friendship?.region ?? null,
          tags: friendship?.tags ?? [],
        };
      })
      .sort((left, right) => {
        const leftTime = left.importedAt ? Date.parse(left.importedAt) : 0;
        const rightTime = right.importedAt ? Date.parse(right.importedAt) : 0;
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return left.character.name.localeCompare(right.character.name, 'zh-CN');
      });

    return { items };
  }

  async preview(
    input: WechatSyncPreviewRequestValue,
  ): Promise<WechatSyncPreviewResponseValue> {
    const contacts = normalizeContactBundles(input.contacts);
    if (!contacts.length) {
      throw new BadRequestException('至少选择一个联系人。');
    }
    if (contacts.length > 20) {
      throw new BadRequestException('单次最多预览 20 个联系人。');
    }

    const promptConfig = await this.resolveWechatSyncAnalysisPromptConfig();
    const items = new Array<WechatSyncPreviewItemValue>(contacts.length);
    const workerCount = Math.min(
      WECHAT_SYNC_PREVIEW_CONCURRENCY,
      contacts.length,
    );
    let nextIndex = 0;

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const currentIndex = nextIndex++;
          if (currentIndex >= contacts.length) {
            return;
          }

          items[currentIndex] = await this.previewContactAccurate(
            contacts[currentIndex],
            promptConfig,
          );
        }
      }),
    );

    return { items };
  }

  async import(
    input: WechatSyncImportRequestValue,
  ): Promise<WechatSyncImportResponseValue> {
    const normalizedItems = (input.items ?? []).filter((item) =>
      item?.contact?.username?.trim(),
    );
    if (!normalizedItems.length) {
      throw new BadRequestException('至少选择一个预览通过的联系人。');
    }
    if (normalizedItems.length > 20) {
      throw new BadRequestException('单次最多导入 20 个联系人。');
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const items: WechatSyncImportResponseValue['items'] = [];
    const skipped: WechatSyncImportResponseValue['skipped'] = [];

    for (const item of normalizedItems) {
      const contact = normalizeContactBundle(item.contact);
      if (!contact.username) {
        skipped.push({
          contactUsername: '',
          displayName: contact.displayName || '未命名联系人',
          reason: '缺少联系人 username，无法导入。',
        });
        continue;
      }

      if (contact.isGroup) {
        skipped.push({
          contactUsername: contact.username,
          displayName: contact.displayName,
          reason: '当前版本只支持导入单聊联系人，不支持群聊。',
        });
        continue;
      }

      const sourceKey = buildImportedSourceKey(contact);
      const existing = await this.characterRepo.findOneBy({
        sourceType: 'wechat_import',
        sourceKey,
      });
      const existingImportMetadata = existing?.profile?.wechatSyncImport;
      const previousSnapshot =
        existingImportMetadata?.currentSnapshot ??
        existingImportMetadata?.previousSnapshot ??
        null;
      const normalizedCharacter = this.normalizeCharacterDraft(
        item.draftCharacter,
        contact,
        existing?.id,
      );
      let saved = await this.characterRepo.save(
        this.characterRepo.create(
          existing
            ? {
                ...existing,
                ...normalizedCharacter,
                id: existing.id,
              }
            : normalizedCharacter,
        ),
      );
      const status = existing ? 'updated' : 'created';

      let seededMomentCount = 0;
      if (
        item.seedMoments !== false &&
        contact.momentHighlights.length > 0 &&
        (!existing || !(await this.hasCharacterMoments(saved.id)))
      ) {
        seededMomentCount = await this.seedMomentHighlights(saved, contact);
      }

      const currentSnapshot = buildImportSnapshot({
        contact,
        character: saved,
        status,
        autoAddFriend: item.autoAddFriend !== false,
        seedMoments: item.seedMoments !== false,
        seededMomentCount,
        previousSnapshot:
          previousSnapshot ??
          (item.importMode === 'snapshot_restore' &&
          typeof item.restoredFromVersion === 'number'
            ? { version: item.restoredFromVersion }
            : null),
      });
      const snapshotHistory = buildSnapshotHistory(
        currentSnapshot,
        existingImportMetadata,
      );
      const changeHistory = buildChangeHistory({
        currentSnapshot,
        previousSnapshot,
        metadata: existingImportMetadata,
        importMode: item.importMode,
        restoredFromVersion: item.restoredFromVersion,
      });
      saved.profile = {
        ...saved.profile,
        wechatSyncImport: {
          currentSnapshot,
          previousSnapshot: snapshotHistory[1] ?? previousSnapshot,
          snapshotHistory,
          changeHistory,
        },
      };
      saved = await this.characterRepo.save(saved);

      let friendshipCreated = false;
      if (item.autoAddFriend !== false) {
        const beforeFriendship = await this.friendshipRepo.findOneBy({
          ownerId: owner.id,
          characterId: saved.id,
        });
        await this.socialService.sendFriendRequest(
          saved.id,
          this.buildImportedGreeting(saved.name),
          { autoAccept: true },
        );

        const friendship = await this.friendshipRepo.findOneBy({
          ownerId: owner.id,
          characterId: saved.id,
        });
        if (friendship) {
          friendship.remarkName = contact.remarkName || friendship.remarkName;
          friendship.region = contact.region || friendship.region;
          friendship.source = contact.source || 'contact_import';
          friendship.tags = contact.tags.length
            ? contact.tags
            : friendship.tags;
          await this.friendshipRepo.save(friendship);
        }

        friendshipCreated =
          !beforeFriendship ||
          beforeFriendship.status === 'blocked' ||
          beforeFriendship.status === 'removed';
      }

      items.push({
        contactUsername: contact.username,
        displayName: contact.displayName,
        status,
        friendshipCreated,
        seededMomentCount,
        character: saved,
      });
    }

    return {
      importedCount: items.length,
      items,
      skipped,
    };
  }

  async retryFriendship(
    characterId: string,
  ): Promise<WechatSyncRetryFriendshipResponseValue> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const character = await this.characterRepo.findOneBy({ id: characterId });
    if (!character) {
      throw new NotFoundException('联系人导入角色不存在。');
    }
    if (character.sourceType !== 'wechat_import') {
      throw new BadRequestException('只支持补建联系人导入角色的好友关系。');
    }

    const existing = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });
    await this.socialService.sendFriendRequest(
      characterId,
      this.buildImportedGreeting(character.name),
      { autoAccept: true },
    );

    const friendship = await this.friendshipRepo.findOneBy({
      ownerId: owner.id,
      characterId,
    });
    if (!friendship) {
      throw new BadRequestException('好友关系补建失败。');
    }

    friendship.source = friendship.source || 'contact_import';
    await this.friendshipRepo.save(friendship);

    return {
      characterId,
      friendshipCreated:
        !existing ||
        existing.status === 'removed' ||
        existing.status === 'blocked',
      friendshipStatus: friendship.status,
    };
  }

  async rollbackImport(
    characterId: string,
  ): Promise<WechatSyncRollbackResponseValue> {
    const character = await this.characterRepo.findOneBy({ id: characterId });
    if (!character) {
      throw new NotFoundException('联系人导入角色不存在。');
    }
    if (character.sourceType !== 'wechat_import') {
      throw new BadRequestException('只支持回滚联系人导入角色。');
    }

    await this.charactersService.delete(characterId);
    return {
      success: true,
      characterId,
    };
  }

  private async previewContact(
    contact: WechatSyncContactBundleValue,
    options?: {
      allowAi?: boolean;
    },
  ): Promise<PreviewContactResult> {
    const warnings = buildPreviewWarnings(contact);
    const confidence = resolvePreviewConfidence(contact);
    let draftCharacter: Partial<CharacterEntity>;
    let aiAvailableForNextContacts = options?.allowAi !== false;
    const shouldAttemptAi =
      aiAvailableForNextContacts &&
      contact.messageCount >= WECHAT_SYNC_MIN_MESSAGES_FOR_AI_PREVIEW &&
      contact.sampleMessages.length >= WECHAT_SYNC_MIN_SAMPLES_FOR_AI_PREVIEW;

    if (!aiAvailableForNextContacts) {
      warnings.push(
        '本批次 AI 预览暂时不可用，当前已直接生成基础草稿，避免继续长时间等待。',
      );
      draftCharacter = this.normalizeCharacterDraft({}, contact);
      return {
        item: {
          contact,
          draftCharacter,
          warnings,
          confidence,
        },
        aiAvailableForNextContacts,
      };
    }

    if (!shouldAttemptAi) {
      warnings.push(
        '聊天样本较少，当前直接生成基础草稿，避免为低置信度联系人长时间等待。',
      );
      draftCharacter = this.normalizeCharacterDraft({}, contact);
      return {
        item: {
          contact,
          draftCharacter,
          warnings,
          confidence,
        },
        aiAvailableForNextContacts,
      };
    }

    try {
      const raw = await this.ai.generateQuickCharacter(
        this.buildQuickCharacterDescription(contact),
        {
          timeoutMs: WECHAT_SYNC_AI_PREVIEW_TIMEOUT_MS,
        },
      );
      draftCharacter = this.normalizeCharacterDraft(raw, contact);
    } catch (error) {
      this.logger.warn(
        `Falling back to heuristic character draft for ${contact.username}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      warnings.push(
        'AI 角色草稿生成失败，已回退到启发式版本，导入前再过一眼。',
      );
      draftCharacter = this.normalizeCharacterDraft({}, contact);
      aiAvailableForNextContacts = false;
    }

    return {
      item: {
        contact,
        draftCharacter,
        warnings,
        confidence,
      },
      aiAvailableForNextContacts,
    };
  }

  private async previewContactAccurate(
    contact: WechatSyncContactBundleValue,
    promptConfig: WechatSyncAnalysisPromptConfig,
  ): Promise<WechatSyncPreviewItemValue> {
    const warnings = buildPreviewWarnings(contact);
    const confidence = resolvePreviewConfidence(contact);
    let draftCharacter: Partial<CharacterEntity>;

    if (!hasWechatSyncAnalysisEvidence(contact)) {
      warnings.push('当前缺少足够的聊天或资料证据，已回退到保守的基础草稿。');
      draftCharacter = this.normalizeCharacterDraft({}, contact);
      return {
        contact,
        draftCharacter,
        warnings,
        confidence,
      };
    }

    try {
      const raw = await this.ai.generateQuickCharacter(
        this.buildWechatSyncAnalysisPromptContext(contact),
        {
          timeoutMs: WECHAT_SYNC_AI_PREVIEW_TIMEOUT_MS,
          temperature: 0.2,
          maxTokens: 1_800,
          systemPrompt: promptConfig.systemPrompt,
          userPrompt: this.renderWechatSyncAnalysisUserPrompt(
            promptConfig.userPromptTemplate,
            contact,
          ),
        },
      );
      draftCharacter = this.normalizeCharacterDraft(raw, contact);
    } catch (error) {
      this.logger.warn(
        `Falling back to heuristic character draft for ${contact.username}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      warnings.push(
        'AI 角色草稿生成失败，已回退到启发式版本，导入前再过一眼。',
      );
      draftCharacter = this.normalizeCharacterDraft({}, contact);
    }

    return {
      contact,
      draftCharacter,
      warnings,
      confidence,
    };
  }

  private normalizeCharacterDraft(
    raw: Partial<CharacterEntity> | Record<string, unknown>,
    contact: WechatSyncContactBundleValue,
    forcedId?: string,
  ): CharacterEntity {
    const profile = readRecord(isRecord(raw) ? raw.profile : undefined);
    const identity = readRecord(profile.identity);
    const traits = readRecord(profile.traits);
    const memory = readRecord(profile.memory);
    const scenePrompts = readRecord(profile.scenePrompts);
    const behavioralPatterns = readRecord(profile.behavioralPatterns);
    const cognitiveBoundaries = readRecord(profile.cognitiveBoundaries);
    const reasoningConfig = readRecord(profile.reasoningConfig);

    const id = forcedId ?? `char_${randomUUID().slice(0, 8)}`;
    const name =
      normalizeText(isRecord(raw) ? raw.name : undefined) ||
      contact.remarkName ||
      contact.nickname ||
      contact.displayName;
    const relationship =
      normalizeText(isRecord(raw) ? raw.relationship : undefined) ||
      `${name} 是你从${formatImportedPlatformLabel(contact)}导入的熟人朋友，和你已经有真实聊天历史。`;
    const bio =
      normalizeText(isRecord(raw) ? raw.bio : undefined) ||
      buildFallbackBio(contact, name);
    const expertDomains =
      normalizeStringList(isRecord(raw) ? raw.expertDomains : undefined)
        .length > 0
        ? normalizeStringList(isRecord(raw) ? raw.expertDomains : undefined)
        : inferExpertDomains(contact);
    const basePrompt =
      normalizeText(profile.basePrompt) ||
      normalizeText(profile.coreLogic) ||
      buildFallbackCoreLogic(contact, name, relationship);
    const coreLogic =
      normalizeText(profile.coreLogic) ||
      basePrompt ||
      buildFallbackCoreLogic(contact, name, relationship);
    const memorySummary =
      normalizeText(profile.memorySummary) ||
      normalizeText(contact.chatSummary) ||
      buildFallbackMemorySummary(contact, name);
    const coreMemory =
      normalizeText(memory.coreMemory) ||
      buildFallbackCoreMemory(contact, name);
    const recentSummary = normalizeText(memory.recentSummary) || memorySummary;
    const chatScenePrompt =
      normalizeText(scenePrompts.chat) ||
      buildFallbackChatPrompt(contact, name);
    const legacySystemPrompt = normalizeImportedLegacySystemPrompt(
      normalizeText(profile.systemPrompt),
      [coreLogic, basePrompt, chatScenePrompt],
    );

    return {
      id,
      name,
      avatar:
        normalizeText(isRecord(raw) ? raw.avatar : undefined) ||
        name.slice(0, 1),
      relationship,
      relationshipType: 'friend',
      personality: normalizeText(isRecord(raw) ? raw.personality : undefined),
      bio,
      isOnline: false,
      onlineMode: 'auto',
      sourceType: 'wechat_import',
      sourceKey: buildImportedSourceKey(contact),
      deletionPolicy: 'archive_allowed',
      isTemplate: false,
      expertDomains,
      profile: {
        characterId: id,
        name,
        relationship,
        expertDomains,
        coreLogic,
        scenePrompts: {
          chat: chatScenePrompt,
          moments_post: normalizeText(scenePrompts.moments_post) || '',
          moments_comment: normalizeText(scenePrompts.moments_comment) || '',
          feed_post: normalizeText(scenePrompts.feed_post) || '',
          channel_post: normalizeText(scenePrompts.channel_post) || '',
          feed_comment: normalizeText(scenePrompts.feed_comment) || '',
          greeting:
            normalizeText(scenePrompts.greeting) ||
            `你和用户本来就在微信认识，说话要像已经熟悉的真人朋友。`,
          proactive: normalizeText(scenePrompts.proactive) || '',
        },
        coreDirective: normalizeText(profile.coreDirective),
        basePrompt,
        systemPrompt: legacySystemPrompt,
        traits: {
          speechPatterns: normalizeStringList(traits.speechPatterns),
          catchphrases: normalizeStringList(traits.catchphrases),
          topicsOfInterest:
            normalizeStringList(traits.topicsOfInterest).length > 0
              ? normalizeStringList(traits.topicsOfInterest)
              : contact.topicKeywords.slice(0, 8),
          emotionalTone: normalizeText(traits.emotionalTone) || 'grounded',
          responseLength: normalizeResponseLength(traits.responseLength),
          emojiUsage: normalizeEmojiUsage(traits.emojiUsage),
        },
        memorySummary,
        identity: {
          occupation:
            normalizeText(identity.occupation) ||
            `${formatImportedPlatformLabel(contact)}联系人`,
          background:
            normalizeText(identity.background) ||
            `用户通过${formatImportedPlatformLabel(contact)}认识 ${name}，两人已经积累了真实聊天记录。`,
          motivation:
            normalizeText(identity.motivation) || '维持真实自然的熟人关系。',
          worldview:
            normalizeText(identity.worldview) ||
            '说话要像现实里的熟人，而不是客服或工具。',
        },
        behavioralPatterns: {
          workStyle:
            normalizeText(behavioralPatterns.workStyle) ||
            '自然随和，按熟人节奏聊天。',
          socialStyle:
            normalizeText(behavioralPatterns.socialStyle) ||
            `${formatImportedPlatformLabel(contact)}熟人式社交，真实、不端着。`,
          taboos: normalizeStringList(behavioralPatterns.taboos),
          quirks: normalizeStringList(behavioralPatterns.quirks),
        },
        cognitiveBoundaries: {
          expertiseDescription:
            normalizeText(cognitiveBoundaries.expertiseDescription) ||
            '基于真实聊天记录归纳的熟悉领域和表达方式。',
          knowledgeLimits:
            normalizeText(cognitiveBoundaries.knowledgeLimits) ||
            '不要硬装全知，遇到不熟的话题也保持真人边界感。',
          refusalStyle:
            normalizeText(cognitiveBoundaries.refusalStyle) ||
            '遇到不想聊或不确定的话题，像熟人一样自然婉拒。',
        },
        reasoningConfig: {
          enableCoT: normalizeBoolean(reasoningConfig.enableCoT, false),
          enableReflection: normalizeBoolean(
            reasoningConfig.enableReflection,
            false,
          ),
          enableRouting: normalizeBoolean(reasoningConfig.enableRouting, false),
        },
        memory: {
          coreMemory,
          recentSummary,
          forgettingCurve: normalizeNumber(memory.forgettingCurve, 70),
          recentSummaryPrompt:
            normalizeText(memory.recentSummaryPrompt) || undefined,
          coreMemoryPrompt: normalizeText(memory.coreMemoryPrompt) || undefined,
        },
      },
      activityFrequency: resolveActivityFrequency(contact.messageCount),
      momentsFrequency: contact.momentHighlights.length > 0 ? 1 : 0,
      feedFrequency: 1,
      activeHoursStart: 8,
      activeHoursEnd: 23,
      triggerScenes: [],
      intimacyLevel: resolveInitialIntimacy(contact),
      lastActiveAt: undefined,
      aiRelationships: [],
      currentStatus: '已从联系人导入',
      currentActivity: 'free',
      modelRoutingMode: 'inherit_default',
      inferenceProviderAccountId: null,
      inferenceModelId: null,
      allowOwnerKeyOverride: true,
      modelRoutingNotes: '',
      activityMode: 'auto',
    };
  }

  private buildQuickCharacterDescription(
    contact: WechatSyncContactBundleValue,
  ) {
    const topicHint = contact.topicKeywords.length
      ? `- 常聊话题关键词：${contact.topicKeywords.join('、')}`
      : '- 常聊话题关键词：暂无明确标签';
    const tagHint = contact.tags.length
      ? `- 微信标签：${contact.tags.join('、')}`
      : '- 微信标签：无';
    const summaryHint = contact.chatSummary?.trim()
      ? `- 聊天概况：${contact.chatSummary.trim()}`
      : '- 聊天概况：暂无';
    const momentHint = contact.momentHighlights.length
      ? `- 近况线索：${contact.momentHighlights
          .slice(0, 3)
          .map((item) => item.text.trim())
          .filter(Boolean)
          .join('；')}`
      : '- 近况线索：当前未提供';
    const samples = contact.sampleMessages
      .slice(0, 8)
      .map((item) => {
        const sender = item.sender?.trim() ? `${item.sender.trim()}: ` : '';
        return `[${item.timestamp}] ${sender}${item.text}`;
      })
      .join('\n');

    return [
      '请根据下面这位微信联系人资料，生成一个适合导入隐界世界的角色草稿。',
      '这个角色本质上是用户现实微信关系里的熟人朋友，不是陌生人、专家客服或虚拟助理。',
      '关系类型请优先保持为 friend；如果对方明显有某些专业身份，可以体现在 expertDomains、bio 和职业里，但不要把关系改成 mentor/expert。',
      '角色说话要像现实里已经认识的人，不要写成客套模板、万能助理、专家客服，也不要用（动作）、[旁白]、*动作*。',
      '',
      `- 微信 username：${contact.username}`,
      `- 微信显示名：${contact.displayName}`,
      contact.remarkName
        ? `- 微信备注：${contact.remarkName}`
        : '- 微信备注：无',
      contact.nickname ? `- 微信昵称：${contact.nickname}` : '- 微信昵称：无',
      tagHint,
      `- 消息总数：${contact.messageCount}`,
      `- 用户发出消息：${contact.ownerMessageCount}`,
      `- 对方发来消息：${contact.contactMessageCount}`,
      contact.latestMessageAt
        ? `- 最近一条消息时间：${contact.latestMessageAt}`
        : '- 最近一条消息时间：未知',
      topicHint,
      summaryHint,
      momentHint,
      '',
      '聊天样本：',
      samples || '（暂无聊天样本）',
      '',
      '要求：角色要保留真实微信熟人的说话味道、互动边界和话题偏好，别写得像万能助手、客服模板或分析报告。',
    ].join('\n');
  }

  private async resolveWechatSyncAnalysisPromptConfig(): Promise<WechatSyncAnalysisPromptConfig> {
    const [configuredSystemPrompt, configuredUserPromptTemplate] =
      await Promise.all([
        this.systemConfigService.getConfig(
          WECHAT_SYNC_SYSTEM_PROMPT_CONFIG_KEY,
        ),
        this.systemConfigService.getConfig(
          WECHAT_SYNC_USER_PROMPT_TEMPLATE_CONFIG_KEY,
        ),
      ]);

    return {
      systemPrompt: normalizePromptConfigValue(
        configuredSystemPrompt,
        DEFAULT_WECHAT_SYNC_ANALYSIS_SYSTEM_PROMPT,
      ),
      userPromptTemplate: normalizePromptConfigValue(
        configuredUserPromptTemplate,
        DEFAULT_WECHAT_SYNC_ANALYSIS_USER_PROMPT_TEMPLATE,
      ),
    };
  }

  private buildWechatSyncAnalysisPromptContext(
    contact: WechatSyncContactBundleValue,
  ) {
    const topicHint = contact.topicKeywords.length
      ? contact.topicKeywords.join('、')
      : '无明确高频话题标签';
    const tagHint = contact.tags.length ? contact.tags.join('、') : '无';
    const summaryHint = contact.chatSummary?.trim() || '暂无聊天摘要';
    const momentHint = contact.momentHighlights.length
      ? contact.momentHighlights
          .slice(0, WECHAT_SYNC_PREVIEW_MAX_MOMENT_HIGHLIGHTS)
          .map((item, index) => {
            const location = item.location?.trim()
              ? ` / 位置：${item.location.trim()}`
              : '';
            const postedAt = item.postedAt?.trim()
              ? ` / 时间：${item.postedAt.trim()}`
              : '';
            return `${index + 1}. ${item.text.trim()}${location}${postedAt}`;
          })
          .join('\n')
      : '暂无朋友圈或近况线索';
    const samples = contact.sampleMessages
      .slice(0, WECHAT_SYNC_PREVIEW_MAX_SAMPLE_MESSAGES)
      .map((item, index) => {
        const sender = item.sender?.trim() || '未知发送者';
        const direction = item.direction?.trim() || 'unknown';
        const typeLabel = item.typeLabel?.trim() || '文本';
        return `${index + 1}. [${item.timestamp}] [${direction}] [${typeLabel}] ${sender}: ${item.text}`;
      })
      .join('\n');

    return [
      '联系人资料总览：',
      `- 微信 username：${contact.username}`,
      `- 微信显示名：${contact.displayName}`,
      `- 微信备注：${contact.remarkName?.trim() || '无'}`,
      `- 微信昵称：${contact.nickname?.trim() || '无'}`,
      `- 地区：${contact.region?.trim() || '无'}`,
      `- 来源：${contact.source?.trim() || '未知'}`,
      `- 标签：${tagHint}`,
      `- 是否群聊：${contact.isGroup ? '是' : '否'}`,
      '',
      '互动统计：',
      `- 总消息数：${contact.messageCount}`,
      `- 用户发送：${contact.ownerMessageCount}`,
      `- 对方发送：${contact.contactMessageCount}`,
      `- 最近消息时间：${contact.latestMessageAt?.trim() || '未知'}`,
      '',
      '高频话题与摘要：',
      `- 高频关键词：${topicHint}`,
      `- 聊天摘要：${summaryHint}`,
      '',
      '朋友圈 / 近况线索：',
      momentHint,
      '',
      '聊天样本（尽量基于这些真实表达判断人物）：',
      samples || '暂无聊天样本',
    ].join('\n');
  }

  private renderWechatSyncAnalysisUserPrompt(
    template: string,
    contact: WechatSyncContactBundleValue,
  ) {
    const replacements: Record<string, string> = {
      contact_context: this.buildWechatSyncAnalysisPromptContext(contact),
      username: contact.username,
      display_name: contact.displayName,
      remark_name: contact.remarkName?.trim() || '无',
      nickname: contact.nickname?.trim() || '无',
      region: contact.region?.trim() || '无',
      source: contact.source?.trim() || '未知',
      tags: contact.tags.length ? contact.tags.join('、') : '无',
      message_count: String(contact.messageCount),
      owner_message_count: String(contact.ownerMessageCount),
      contact_message_count: String(contact.contactMessageCount),
      latest_message_at: contact.latestMessageAt?.trim() || '未知',
      chat_summary: contact.chatSummary?.trim() || '暂无聊天摘要',
      topic_keywords: contact.topicKeywords.length
        ? contact.topicKeywords.join('、')
        : '无明确高频关键词',
      sample_messages:
        contact.sampleMessages.length > 0
          ? contact.sampleMessages
              .map((item, index) => {
                const sender = item.sender?.trim() || '未知发送者';
                const direction = item.direction?.trim() || 'unknown';
                const typeLabel = item.typeLabel?.trim() || '文本';
                return `${index + 1}. [${item.timestamp}] [${direction}] [${typeLabel}] ${sender}: ${item.text}`;
              })
              .join('\n')
          : '暂无聊天样本',
      moment_highlights:
        contact.momentHighlights.length > 0
          ? contact.momentHighlights
              .map((item, index) => {
                const location = item.location?.trim()
                  ? ` / 位置：${item.location.trim()}`
                  : '';
                const postedAt = item.postedAt?.trim()
                  ? ` / 时间：${item.postedAt.trim()}`
                  : '';
                return `${index + 1}. ${item.text.trim()}${location}${postedAt}`;
              })
              .join('\n')
          : '暂无朋友圈或近况线索',
    };

    return template.replace(
      /\{\{\s*([a-z_]+)\s*\}\}/g,
      (_, key: string) => replacements[key] ?? '',
    );
  }

  private async hasCharacterMoments(characterId: string) {
    return (
      (await this.momentPostRepo.count({
        where: { authorId: characterId, authorType: 'character' },
      })) > 0
    );
  }

  private async seedMomentHighlights(
    character: CharacterEntity,
    contact: WechatSyncContactBundleValue,
  ) {
    const highlights = contact.momentHighlights
      .map((item) => ({
        text: item.text.trim(),
        location: item.location?.trim() || null,
      }))
      .filter((item) => item.text.length > 0)
      .slice(0, 3);

    for (const highlight of highlights) {
      const post = await this.momentPostRepo.save(
        this.momentPostRepo.create({
          authorId: character.id,
          authorName: character.name,
          authorAvatar: character.avatar,
          authorType: 'character',
          text: highlight.text,
          location: highlight.location ?? undefined,
          contentType: 'text',
          mediaPayload: JSON.stringify([]),
        }),
      );
      await this.feedService.syncMomentPostToFeed(post, {
        sourceKind: 'seed',
      });
    }

    return highlights.length;
  }

  private buildImportedGreeting(characterName: string) {
    return `已从本地联系人资料导入 ${characterName}，现在可以继续聊天了。`;
  }
}

function normalizeContactBundles(
  input: WechatSyncContactBundleValue[] | null | undefined,
) {
  const seen = new Set<string>();
  const contacts: WechatSyncContactBundleValue[] = [];

  for (const entry of input ?? []) {
    const contact = normalizeContactBundle(entry);
    if (!contact.username || seen.has(contact.username)) {
      continue;
    }
    seen.add(contact.username);
    contacts.push(contact);
  }

  return contacts;
}

function normalizeContactBundle(
  input?: Partial<WechatSyncContactBundleValue> | null,
): WechatSyncContactBundleValue {
  return {
    username: normalizeText(input?.username) || '',
    displayName:
      normalizeText(input?.displayName) ||
      normalizeText(input?.remarkName) ||
      normalizeText(input?.nickname) ||
      '未命名联系人',
    nickname: normalizeNullableText(input?.nickname),
    remarkName: normalizeNullableText(input?.remarkName),
    region: normalizeNullableText(input?.region),
    source: normalizeNullableText(input?.source),
    tags: normalizeStringList(input?.tags),
    isGroup: input?.isGroup === true,
    messageCount: normalizeNumber(input?.messageCount, 0),
    ownerMessageCount: normalizeNumber(input?.ownerMessageCount, 0),
    contactMessageCount: normalizeNumber(input?.contactMessageCount, 0),
    latestMessageAt: normalizeNullableText(input?.latestMessageAt),
    chatSummary: normalizeNullableText(input?.chatSummary),
    topicKeywords: normalizeStringList(input?.topicKeywords),
    sampleMessages: (input?.sampleMessages ?? [])
      .map((item) => ({
        timestamp: normalizeText(item?.timestamp) || '',
        text: normalizeText(item?.text) || '',
        sender: normalizeNullableText(item?.sender),
        typeLabel: normalizeNullableText(item?.typeLabel),
        direction: normalizeMessageDirection(item?.direction),
      }))
      .filter((item) => item.text.length > 0)
      .slice(0, WECHAT_SYNC_PREVIEW_MAX_SAMPLE_MESSAGES),
    momentHighlights: (input?.momentHighlights ?? [])
      .map((item) => ({
        postedAt: normalizeNullableText(item?.postedAt),
        text: normalizeText(item?.text) || '',
        location: normalizeNullableText(item?.location),
        mediaHint: normalizeNullableText(item?.mediaHint),
      }))
      .filter((item) => item.text.length > 0)
      .slice(0, WECHAT_SYNC_PREVIEW_MAX_MOMENT_HIGHLIGHTS),
  };
}

function buildPreviewWarnings(contact: WechatSyncContactBundleValue) {
  const warnings: string[] = [];

  if (contact.isGroup) {
    warnings.push('这是群聊，不建议按联系人角色导入。');
  }
  if (contact.messageCount < 20) {
    warnings.push('聊天样本偏少，这个人的说话味道可能抓得不太准。');
  }
  if (!contact.sampleMessages.length) {
    warnings.push('没拿到代表性的聊天样本，这轮只能更多靠联系人基础资料来补。');
  }
  if (!contact.momentHighlights.length) {
    warnings.push('当前没有朋友圈或近况线索，这轮角色草稿主要靠聊天记录。');
  }

  return warnings;
}

function resolvePreviewConfidence(contact: WechatSyncContactBundleValue) {
  if (
    contact.messageCount >= 300 &&
    contact.sampleMessages.length >= 8 &&
    contact.contactMessageCount > 0
  ) {
    return 'high' as const;
  }
  if (contact.messageCount >= 60 && contact.sampleMessages.length >= 3) {
    return 'medium' as const;
  }
  return 'low' as const;
}

function buildImportedSourceKey(
  contact: Pick<WechatSyncContactBundleValue, 'username' | 'source'>,
) {
  const platform = inferImportedPlatform(contact);
  const username = contact.username.trim();
  if (!username) {
    return `${platform}:unknown`;
  }
  if (platform === 'wechat') {
    return username.startsWith('wechat:') ? username : `wechat:${username}`;
  }
  return username.startsWith(`${platform}:`)
    ? username
    : `${platform}:${username}`;
}

function inferImportedPlatform(
  contact: Pick<WechatSyncContactBundleValue, 'username' | 'source'>,
) {
  const source = contact.source?.trim().toLowerCase() ?? '';
  if (source.includes('telegram')) {
    return 'telegram' as const;
  }
  if (source.includes('discord')) {
    return 'discord' as const;
  }
  if (source.includes('qq')) {
    return 'qq' as const;
  }
  if (source.includes('whatsapp')) {
    return 'whatsapp' as const;
  }
  if (source.includes('line')) {
    return 'line' as const;
  }
  if (source.includes('instagram')) {
    return 'instagram' as const;
  }
  if (source.includes('slack')) {
    return 'slack' as const;
  }
  if (source.includes('wechat') || source.includes('weflow')) {
    return 'wechat' as const;
  }

  const username = contact.username.trim().toLowerCase();
  if (username.startsWith('telegram:')) {
    return 'telegram' as const;
  }
  if (username.startsWith('discord:')) {
    return 'discord' as const;
  }
  if (username.startsWith('qq:')) {
    return 'qq' as const;
  }
  if (username.startsWith('whatsapp:')) {
    return 'whatsapp' as const;
  }
  if (username.startsWith('line:')) {
    return 'line' as const;
  }
  if (username.startsWith('instagram:')) {
    return 'instagram' as const;
  }
  if (username.startsWith('slack:')) {
    return 'slack' as const;
  }
  if (
    username.startsWith('wechat:') ||
    username.startsWith('wxid_') ||
    username.endsWith('@chatroom')
  ) {
    return 'wechat' as const;
  }

  return 'unknown' as const;
}

function formatImportedPlatformLabel(
  contact: Pick<WechatSyncContactBundleValue, 'username' | 'source'>,
) {
  switch (inferImportedPlatform(contact)) {
    case 'telegram':
      return 'Telegram';
    case 'discord':
      return 'Discord';
    case 'qq':
      return 'QQ';
    case 'whatsapp':
      return 'WhatsApp';
    case 'line':
      return 'LINE';
    case 'instagram':
      return 'Instagram';
    case 'slack':
      return 'Slack';
    case 'wechat':
      return '微信';
    default:
      return '联系人平台';
  }
}

function hasWechatSyncAnalysisEvidence(contact: WechatSyncContactBundleValue) {
  return Boolean(
    contact.chatSummary?.trim() ||
    contact.sampleMessages.some((item) => item.text.trim().length > 0) ||
    contact.topicKeywords.length > 0 ||
    contact.tags.length > 0 ||
    contact.momentHighlights.some((item) => item.text.trim().length > 0),
  );
}

function normalizePromptConfigValue(value: string | null, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function inferExpertDomains(contact: WechatSyncContactBundleValue) {
  const domains = normalizeStringList(contact.topicKeywords).slice(0, 4);
  return domains.length ? domains : ['general'];
}

function buildFallbackBio(contact: WechatSyncContactBundleValue, name: string) {
  const summary = contact.chatSummary?.trim();
  if (summary) {
    return summary.slice(0, 160);
  }

  if (contact.topicKeywords.length) {
    return `${name} 是你从${formatImportedPlatformLabel(contact)}导入的熟人朋友，平时常聊 ${contact.topicKeywords
      .slice(0, 4)
      .join('、')}。`;
  }

  return `${name} 是你从${formatImportedPlatformLabel(contact)}导入的熟人朋友，已经和你有真实聊天历史。`;
}

function buildFallbackMemorySummary(
  contact: WechatSyncContactBundleValue,
  name: string,
) {
  if (contact.chatSummary?.trim()) {
    return contact.chatSummary.trim();
  }

  const tags = contact.tags.length
    ? `，常见标签有 ${contact.tags.join('、')}`
    : '';
  return `${name} 是你从${formatImportedPlatformLabel(contact)}导入的熟人朋友，双方已经积累了真实互动${tags}。`;
}

function buildFallbackCoreMemory(
  contact: WechatSyncContactBundleValue,
  name: string,
) {
  const snippets = contact.sampleMessages
    .slice(0, 3)
    .map((item) => item.text.trim())
    .filter(Boolean);

  if (snippets.length) {
    return `${name} 和用户已经在${formatImportedPlatformLabel(contact)}上聊过不少内容，最近的真实表达包括：${snippets.join(
      '；',
    )}`;
  }

  return `${name} 是用户从${formatImportedPlatformLabel(contact)}导入的现实熟人，互动方式要保持熟人聊天的自然边界。`;
}

function buildFallbackCoreLogic(
  contact: WechatSyncContactBundleValue,
  name: string,
  relationship: string,
) {
  const topics = contact.topicKeywords.length
    ? `平时常聊的话题包括：${contact.topicKeywords.slice(0, 6).join('、')}。`
    : '平时聊天内容较生活化，优先保持真实熟人语气。';
  return [
    `你是 ${name}，${relationship}`,
    `你和用户本来就在${formatImportedPlatformLabel(contact)}认识，已经不是陌生人。`,
    `说话方式要像现实里的${formatImportedPlatformLabel(contact)}熟人，真实、有边界、有温度，不要像客服、专家机器人或万能助理。`,
    topics,
  ].join('\n');
}

function buildFallbackChatPrompt(
  contact: WechatSyncContactBundleValue,
  name: string,
) {
  const examples = contact.sampleMessages
    .slice(0, 4)
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join('；');
  if (examples) {
    return `${name} 回复时尽量保留真实熟人聊天的说话味道。可参考这类真实表达：${examples}`;
  }
  return `${name} 回复时要像已经认识的熟人朋友，语气自然，不端着，不套模板。`;
}

function normalizeImportedLegacySystemPrompt(
  systemPrompt: string,
  candidates: string[],
) {
  if (!systemPrompt) {
    return '';
  }

  const normalizedCandidates = candidates.map((item) => normalizeText(item));
  if (normalizedCandidates.includes(systemPrompt)) {
    return '';
  }

  return systemPrompt;
}

function buildImportSnapshot(input: {
  contact: WechatSyncContactBundleValue;
  character: CharacterEntity;
  status: 'created' | 'updated';
  autoAddFriend: boolean;
  seedMoments: boolean;
  seededMomentCount: number;
  previousSnapshot?: { version: number } | null;
}): ImportSnapshotRecord {
  const nextVersion = (input.previousSnapshot?.version ?? 0) + 1;
  return {
    version: nextVersion,
    importedAt: new Date().toISOString(),
    status: input.status,
    autoAddFriend: input.autoAddFriend,
    seedMoments: input.seedMoments,
    seededMomentCount: input.seededMomentCount,
    contact: cloneWechatContactSnapshot(input.contact),
    draftCharacter: {
      name: input.character.name,
      relationship: input.character.relationship,
      bio: input.character.bio,
      expertDomains: [...(input.character.expertDomains ?? [])],
      memorySummary: input.character.profile?.memorySummary ?? '',
    },
  };
}

function buildChangeHistory(input: {
  currentSnapshot: ImportSnapshotRecord;
  previousSnapshot?: ImportSnapshotRecord | null;
  metadata?: CharacterEntity['profile']['wechatSyncImport'] | null;
  importMode?: 'preview_import' | 'snapshot_restore';
  restoredFromVersion?: number | null;
}) {
  const currentRecord = buildImportChangeRecord(input);
  return dedupeChangeHistory([
    currentRecord,
    ...(input.metadata?.changeHistory ?? []),
  ]).slice(0, 12);
}

function buildImportChangeRecord(input: {
  currentSnapshot: ImportSnapshotRecord;
  previousSnapshot?: ImportSnapshotRecord | null;
  importMode?: 'preview_import' | 'snapshot_restore';
  restoredFromVersion?: number | null;
}): ImportChangeRecord {
  const mode =
    input.importMode === 'snapshot_restore'
      ? 'snapshot_restore'
      : 'preview_import';
  const diffs = buildSnapshotDiffRecords(
    input.previousSnapshot ?? null,
    input.currentSnapshot,
  );
  const changedFields = diffs
    .filter((item) => item.changed)
    .map((item) => item.label);

  return {
    id: randomUUID(),
    recordedAt: input.currentSnapshot.importedAt,
    mode,
    previousVersion: input.previousSnapshot?.version ?? null,
    restoredFromVersion:
      mode === 'snapshot_restore' ? (input.restoredFromVersion ?? null) : null,
    toVersion: input.currentSnapshot.version,
    summary: buildImportChangeSummary({
      mode,
      changedFields,
      currentSnapshot: input.currentSnapshot,
      previousSnapshot: input.previousSnapshot ?? null,
      restoredFromVersion: input.restoredFromVersion ?? null,
    }),
    changedFields,
    diffs,
    resultSnapshot: cloneImportSnapshotRecord(input.currentSnapshot),
  };
}

function buildImportChangeSummary(input: {
  mode: 'preview_import' | 'snapshot_restore';
  changedFields: string[];
  currentSnapshot: ImportSnapshotRecord;
  previousSnapshot?: ImportSnapshotRecord | null;
  restoredFromVersion?: number | null;
}) {
  const changedSummary = summarizeChangedFieldLabels(input.changedFields);
  if (input.mode === 'snapshot_restore') {
    const sourceVersion = input.restoredFromVersion
      ? `v${input.restoredFromVersion}`
      : '所选历史版本';
    if (!input.previousSnapshot) {
      return `已从 ${sourceVersion} 重建线上角色，并写入 v${input.currentSnapshot.version} 恢复记录。`;
    }
    if (!input.changedFields.length) {
      return `已从 ${sourceVersion} 恢复为新的线上版本，恢复结果与恢复前一致。`;
    }
    return `已从 ${sourceVersion} 恢复为 v${input.currentSnapshot.version}，变更 ${input.changedFields.length} 项：${changedSummary}。`;
  }

  if (!input.previousSnapshot) {
    return `首次创建微信同步角色，已写入 v${input.currentSnapshot.version} 导入快照。`;
  }

  if (!input.changedFields.length) {
    return `已按当前预览重新导入 v${input.currentSnapshot.version}，导入字段与上一版一致。`;
  }

  return `已按当前预览更新为 v${input.currentSnapshot.version}，变更 ${input.changedFields.length} 项：${changedSummary}。`;
}

function buildSnapshotDiffRecords(
  previousSnapshot: ImportSnapshotRecord | null,
  currentSnapshot: ImportSnapshotRecord,
) {
  return [
    createSnapshotDiffRecord(
      '角色名',
      previousSnapshot?.draftCharacter.name ?? '',
      currentSnapshot.draftCharacter.name ||
        currentSnapshot.contact.displayName,
    ),
    createSnapshotDiffRecord(
      '关系定位',
      previousSnapshot?.draftCharacter.relationship ?? '',
      currentSnapshot.draftCharacter.relationship,
    ),
    createSnapshotDiffRecord(
      '角色简介',
      previousSnapshot?.draftCharacter.bio ?? '',
      currentSnapshot.draftCharacter.bio,
    ),
    createSnapshotDiffRecord(
      '领域标签',
      (previousSnapshot?.draftCharacter.expertDomains ?? []).join('、'),
      currentSnapshot.draftCharacter.expertDomains.join('、'),
    ),
    createSnapshotDiffRecord(
      '记忆概况',
      previousSnapshot?.draftCharacter.memorySummary ?? '',
      currentSnapshot.draftCharacter.memorySummary,
    ),
    createSnapshotDiffRecord(
      '微信备注/显示名',
      previousSnapshot?.contact.remarkName?.trim() ||
        previousSnapshot?.contact.nickname?.trim() ||
        previousSnapshot?.contact.displayName ||
        '',
      currentSnapshot.contact.remarkName?.trim() ||
        currentSnapshot.contact.nickname?.trim() ||
        currentSnapshot.contact.displayName,
    ),
    createSnapshotDiffRecord(
      '地区',
      previousSnapshot?.contact.region ?? '',
      currentSnapshot.contact.region ?? '',
    ),
    createSnapshotDiffRecord(
      '联系人标签',
      (previousSnapshot?.contact.tags ?? []).join('、'),
      currentSnapshot.contact.tags.join('、'),
    ),
    createSnapshotDiffRecord(
      '聊天概况',
      previousSnapshot?.contact.chatSummary ?? '',
      currentSnapshot.contact.chatSummary ?? '',
    ),
  ];
}

function createSnapshotDiffRecord(
  label: string,
  previousValue: string,
  nextValue: string,
): ImportChangeDiffRecord {
  const normalizedPrevious = normalizeSnapshotDiffValue(previousValue);
  const normalizedNext = normalizeSnapshotDiffValue(nextValue);
  return {
    label,
    previousValue: normalizedPrevious,
    nextValue: normalizedNext,
    changed: normalizedPrevious !== normalizedNext,
  };
}

function normalizeSnapshotDiffValue(value?: string | null) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || '暂无';
}

function summarizeChangedFieldLabels(labels: string[]) {
  if (!labels.length) {
    return '无字段差异';
  }
  if (labels.length <= 3) {
    return labels.join('、');
  }
  return `${labels.slice(0, 3).join('、')}，另 ${labels.length - 3} 项`;
}

function cloneImportSnapshotRecord(
  snapshot: ImportSnapshotRecord,
): ImportSnapshotRecord {
  return {
    version: snapshot.version,
    importedAt: snapshot.importedAt,
    status: snapshot.status,
    autoAddFriend: snapshot.autoAddFriend,
    seedMoments: snapshot.seedMoments,
    seededMomentCount: snapshot.seededMomentCount,
    contact: cloneWechatContactSnapshot(snapshot.contact),
    draftCharacter: {
      name: snapshot.draftCharacter.name,
      relationship: snapshot.draftCharacter.relationship,
      bio: snapshot.draftCharacter.bio,
      expertDomains: [...snapshot.draftCharacter.expertDomains],
      memorySummary: snapshot.draftCharacter.memorySummary,
    },
  };
}

function buildSnapshotHistory(
  currentSnapshot: ImportSnapshotRecord,
  metadata?: CharacterEntity['profile']['wechatSyncImport'] | null,
) {
  const existingHistory = dedupeSnapshotHistory([
    ...(metadata?.snapshotHistory ?? []),
    metadata?.currentSnapshot ?? null,
    metadata?.previousSnapshot ?? null,
  ]);

  return dedupeSnapshotHistory([currentSnapshot, ...existingHistory]).slice(
    0,
    6,
  );
}

function dedupeChangeHistory(
  records: Array<ImportChangeRecord | null | undefined>,
) {
  const seen = new Set<string>();
  const items: ImportChangeRecord[] = [];

  for (const record of records) {
    if (!record) {
      continue;
    }
    if (seen.has(record.id)) {
      continue;
    }
    seen.add(record.id);
    items.push(record);
  }

  return items.sort(
    (left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt),
  );
}

function dedupeSnapshotHistory(
  snapshots: Array<ImportSnapshotRecord | null | undefined>,
) {
  const seen = new Set<string>();
  const items: ImportSnapshotRecord[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot) {
      continue;
    }
    const key = `${snapshot.version}:${snapshot.importedAt}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(snapshot);
  }

  return items.sort(
    (left, right) => Date.parse(right.importedAt) - Date.parse(left.importedAt),
  );
}

function cloneWechatContactSnapshot(contact: WechatSyncContactBundleValue) {
  return {
    username: contact.username,
    displayName: contact.displayName,
    nickname: contact.nickname ?? null,
    remarkName: contact.remarkName ?? null,
    region: contact.region ?? null,
    source: contact.source ?? null,
    tags: [...contact.tags],
    isGroup: contact.isGroup,
    messageCount: contact.messageCount,
    ownerMessageCount: contact.ownerMessageCount,
    contactMessageCount: contact.contactMessageCount,
    latestMessageAt: contact.latestMessageAt ?? null,
    chatSummary: contact.chatSummary ?? null,
    topicKeywords: [...contact.topicKeywords],
    sampleMessages: contact.sampleMessages.map((item) => ({
      timestamp: item.timestamp,
      text: item.text,
      sender: item.sender ?? null,
      typeLabel: item.typeLabel ?? null,
      direction: item.direction ?? 'unknown',
    })),
    momentHighlights: contact.momentHighlights.map((item) => ({
      postedAt: item.postedAt ?? null,
      text: item.text,
      location: item.location ?? null,
      mediaHint: item.mediaHint ?? null,
    })),
  };
}

function resolveActivityFrequency(messageCount: number) {
  if (messageCount >= 2000) {
    return 'high';
  }
  if (messageCount >= 300) {
    return 'normal';
  }
  return 'low';
}

function resolveInitialIntimacy(contact: WechatSyncContactBundleValue) {
  if (contact.messageCount >= 2000) {
    return 80;
  }
  if (contact.messageCount >= 300) {
    return 55;
  }
  if (contact.messageCount >= 60) {
    return 35;
  }
  return 20;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => normalizeText(item)).filter(Boolean))];
}

function normalizeResponseLength(value: unknown): 'short' | 'medium' | 'long' {
  if (value === 'short' || value === 'long') {
    return value;
  }
  return 'medium';
}

function normalizeEmojiUsage(
  value: unknown,
): 'none' | 'occasional' | 'frequent' {
  if (value === 'none' || value === 'frequent') {
    return value;
  }
  return 'occasional';
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeMessageDirection(
  value: unknown,
): WechatSyncContactBundleValue['sampleMessages'][number]['direction'] {
  switch (value) {
    case 'owner':
    case 'contact':
    case 'group_member':
    case 'system':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
}

function normalizeNumber(value: unknown, fallback: number) {
  const normalized =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  return Number.isFinite(normalized) ? normalized : fallback;
}
