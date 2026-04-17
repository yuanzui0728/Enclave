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
      throw new BadRequestException('至少选择一个微信联系人。');
    }
    if (contacts.length > 20) {
      throw new BadRequestException('单次最多预览 20 个微信联系人。');
    }

    const items: WechatSyncPreviewItemValue[] = [];
    for (const contact of contacts) {
      items.push(await this.previewContact(contact));
    }

    return { items };
  }

  async import(
    input: WechatSyncImportRequestValue,
  ): Promise<WechatSyncImportResponseValue> {
    const normalizedItems = (input.items ?? []).filter((item) =>
      item?.contact?.username?.trim(),
    );
    if (!normalizedItems.length) {
      throw new BadRequestException('至少选择一个预览通过的微信联系人。');
    }
    if (normalizedItems.length > 20) {
      throw new BadRequestException('单次最多导入 20 个微信联系人。');
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

      const sourceKey = buildWechatSourceKey(contact.username);
      const existing = await this.characterRepo.findOneBy({
        sourceType: 'wechat_import',
        sourceKey,
      });
      const previousSnapshot =
        existing?.profile?.wechatSyncImport?.currentSnapshot ??
        existing?.profile?.wechatSyncImport?.previousSnapshot ??
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

      saved.profile = {
        ...saved.profile,
        wechatSyncImport: {
          currentSnapshot: buildImportSnapshot({
            contact,
            character: saved,
            status,
            autoAddFriend: item.autoAddFriend !== false,
            seedMoments: item.seedMoments !== false,
            seededMomentCount,
            previousSnapshot,
          }),
          previousSnapshot,
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
          friendship.source = contact.source || 'wechat_import';
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
      throw new NotFoundException('微信同步角色不存在。');
    }
    if (character.sourceType !== 'wechat_import') {
      throw new BadRequestException('只支持补建微信同步导入的角色好友关系。');
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

    friendship.source = friendship.source || 'wechat_import';
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
      throw new NotFoundException('微信同步角色不存在。');
    }
    if (character.sourceType !== 'wechat_import') {
      throw new BadRequestException('只支持回滚微信同步导入的角色。');
    }

    await this.charactersService.delete(characterId);
    return {
      success: true,
      characterId,
    };
  }

  private async previewContact(
    contact: WechatSyncContactBundleValue,
  ): Promise<WechatSyncPreviewItemValue> {
    const warnings = buildPreviewWarnings(contact);
    const confidence = resolvePreviewConfidence(contact);
    let draftCharacter: Partial<CharacterEntity>;

    try {
      const raw = await this.ai.generateQuickCharacter(
        this.buildQuickCharacterDescription(contact),
      );
      draftCharacter = this.normalizeCharacterDraft(raw, contact);
    } catch (error) {
      this.logger.warn(
        `Falling back to heuristic character draft for ${contact.username}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      warnings.push('AI 画像生成失败，已回退到启发式草稿，请在导入前检查。');
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
      `${name} 是你从微信同步来的熟人朋友，和你已经有真实聊天历史。`;
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
    const memorySummary =
      normalizeText(profile.memorySummary) ||
      normalizeText(contact.chatSummary) ||
      buildFallbackMemorySummary(contact, name);
    const coreMemory =
      normalizeText(memory.coreMemory) ||
      buildFallbackCoreMemory(contact, name);
    const recentSummary = normalizeText(memory.recentSummary) || memorySummary;

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
      sourceKey: buildWechatSourceKey(contact.username),
      deletionPolicy: 'archive_allowed',
      isTemplate: false,
      expertDomains,
      profile: {
        characterId: id,
        name,
        relationship,
        expertDomains,
        coreLogic:
          normalizeText(profile.coreLogic) ||
          basePrompt ||
          buildFallbackCoreLogic(contact, name, relationship),
        scenePrompts: {
          chat:
            normalizeText(scenePrompts.chat) ||
            buildFallbackChatPrompt(contact, name),
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
        systemPrompt: normalizeText(profile.systemPrompt),
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
          occupation: normalizeText(identity.occupation) || '微信联系人',
          background:
            normalizeText(identity.background) ||
            `用户通过微信认识 ${name}，两人已经积累了真实聊天记录。`,
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
            '微信熟人式社交，真实、不端着。',
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
      currentStatus: '已从微信同步',
      currentActivity: 'free',
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
      ? `- 聊天摘要：${contact.chatSummary.trim()}`
      : '- 聊天摘要：暂无';
    const momentHint = contact.momentHighlights.length
      ? `- 朋友圈/近况摘要：${contact.momentHighlights
          .slice(0, 3)
          .map((item) => item.text.trim())
          .filter(Boolean)
          .join('；')}`
      : '- 朋友圈/近况摘要：当前未提供';
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
      '要求：角色要保留真实微信熟人的说话味道、互动边界和话题偏好，不要写得像万能助理。',
    ].join('\n');
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
    return `已从微信同步导入 ${characterName}，现在可以继续聊天了。`;
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
      .slice(0, 16),
    momentHighlights: (input?.momentHighlights ?? [])
      .map((item) => ({
        postedAt: normalizeNullableText(item?.postedAt),
        text: normalizeText(item?.text) || '',
        location: normalizeNullableText(item?.location),
        mediaHint: normalizeNullableText(item?.mediaHint),
      }))
      .filter((item) => item.text.length > 0)
      .slice(0, 6),
  };
}

function buildPreviewWarnings(contact: WechatSyncContactBundleValue) {
  const warnings: string[] = [];

  if (contact.isGroup) {
    warnings.push('这是群聊，不建议按联系人角色导入。');
  }
  if (contact.messageCount < 20) {
    warnings.push('聊天样本偏少，生成的人设可能比较粗糙。');
  }
  if (!contact.sampleMessages.length) {
    warnings.push('没有提取到代表性聊天样本，只能依赖联系人基础资料生成。');
  }
  if (!contact.momentHighlights.length) {
    warnings.push('当前没有朋友圈/近况摘要，本轮画像主要依赖聊天记录。');
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

function buildWechatSourceKey(username: string) {
  return `wechat:${username}`;
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
    return `${name} 是你从微信同步导入的熟人朋友，平时常聊 ${contact.topicKeywords
      .slice(0, 4)
      .join('、')}。`;
  }

  return `${name} 是你从微信同步导入的熟人朋友，已经和你有真实聊天历史。`;
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
  return `${name} 是你从微信同步来的熟人朋友，双方已经通过微信积累了真实互动${tags}。`;
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
    return `${name} 和用户已经在微信上聊过不少内容，最近的真实表达包括：${snippets.join(
      '；',
    )}`;
  }

  return `${name} 是用户从微信同步进来的现实熟人，互动方式要保持熟人聊天的自然边界。`;
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
    '你和用户本来就在微信认识，已经不是陌生人。',
    '说话方式要像现实里的微信熟人，真实、有边界、有温度，不要像客服、专家机器人或万能助理。',
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
    return `${name} 回复时尽量保留微信熟人的说话味道。可参考这类真实表达：${examples}`;
  }
  return `${name} 回复时要像已经在微信认识的熟人朋友，语气自然，不端着，不套模板。`;
}

function buildImportSnapshot(input: {
  contact: WechatSyncContactBundleValue;
  character: CharacterEntity;
  status: 'created' | 'updated';
  autoAddFriend: boolean;
  seedMoments: boolean;
  seededMomentCount: number;
  previousSnapshot?: { version: number } | null;
}) {
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
