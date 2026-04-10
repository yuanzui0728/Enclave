import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { SystemConfigService } from '../config/config.service';
import { PromptBuilderService } from '../ai/prompt-builder.service';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';
import { WorldService } from '../world/world.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import type {
  ReplyLogicActorSnapshot,
  ReplyLogicCharacterSnapshot,
  ReplyLogicConversationSnapshot,
  ReplyLogicHistoryItem,
  ReplyLogicNarrativeArcSummary,
  ReplyLogicOverview,
  ReplyLogicOverviewConversationItem,
  ReplyLogicOverviewCharacterItem,
  ReplyLogicProviderSummary,
  ReplyLogicPromptSection,
  ReplyLogicStateGateSummary,
  ReplyLogicWorldContextSummary,
} from './reply-logic-admin.types';

@Injectable()
export class ReplyLogicAdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly groupMemberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupMessageEntity)
    private readonly groupMessageRepo: Repository<GroupMessageEntity>,
    @InjectRepository(NarrativeArcEntity)
    private readonly narrativeArcRepo: Repository<NarrativeArcEntity>,
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly worldService: WorldService,
    private readonly ai: AiOrchestratorService,
    private readonly replyLogicRules: ReplyLogicRulesService,
  ) {}

  async getOverview(): Promise<ReplyLogicOverview> {
    const owner = await this.getOwnerOrThrow();
    const [characters, conversations, provider, worldContext, runtimeRules] =
      await Promise.all([
        this.characterRepo.find({ order: { name: 'ASC' } }),
        this.listConversationItems(owner.id),
        this.resolveProviderSummary(owner),
        this.resolveWorldContextSummary(),
        this.replyLogicRules.getRules(),
      ]);

    return {
      provider,
      worldContext,
      constants: runtimeRules,
      characters: characters.map((character) => this.toCharacterOverviewItem(character)),
      conversations,
    };
  }

  async getRuntimeRules() {
    return this.replyLogicRules.getRules();
  }

  async setRuntimeRules(payload: Parameters<ReplyLogicRulesService['setRules']>[0]) {
    return this.replyLogicRules.setRules(payload);
  }

  async getCharacterSnapshot(
    characterId: string,
  ): Promise<ReplyLogicCharacterSnapshot> {
    const owner = await this.getOwnerOrThrow();
    const character = await this.characterRepo.findOneBy({ id: characterId });
    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    const [provider, worldContext, conversations, narrativeArc] = await Promise.all([
      this.resolveProviderSummary(owner),
      this.resolveWorldContextSummary(),
      this.conversationRepo.find({ where: { ownerId: owner.id } }),
      this.narrativeArcRepo.findOne({
        where: { ownerId: owner.id, characterId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const relatedConversationIds = conversations
      .filter((conversation) => conversation.participants.includes(characterId))
      .map((conversation) => conversation.id);
    const primaryConversation = conversations.find(
      (conversation) =>
        conversation.type === 'direct' &&
        conversation.participants.includes(characterId),
    );
    const visibleMessages = primaryConversation
      ? await this.loadConversationMessages(primaryConversation)
      : [];
    const actor = await this.buildActorSnapshot({
      character,
      isGroupChat: false,
      visibleMessages,
      lastChatAt: this.findLastUserMessageAt(visibleMessages),
      includeStateGate: true,
    });

    return {
      provider,
      worldContext,
      character: this.toCharacterContract(character),
      actor,
      narrativeArc: narrativeArc ? this.toNarrativeSummary(narrativeArc) : null,
      relatedConversationIds,
      notes: [
        '角色视图使用“单聊直回”逻辑展示 prompt 和状态门控。',
        primaryConversation
          ? '已找到与该角色关联的单聊，会使用该会话的可见历史和最近一次用户发言时间。'
          : '未找到现有单聊，当前视图仅展示角色默认直聊快照。',
      ],
    };
  }

  async getConversationSnapshot(
    conversationId: string,
  ): Promise<ReplyLogicConversationSnapshot> {
    const owner = await this.getOwnerOrThrow();
    const [provider, worldContext] = await Promise.all([
      this.resolveProviderSummary(owner),
      this.resolveWorldContextSummary(),
    ]);

    const storedConversation = await this.conversationRepo.findOneBy({
      id: conversationId,
      ownerId: owner.id,
    });

    if (storedConversation) {
      const visibleMessages = await this.loadConversationMessages(
        storedConversation,
      );
      const visibleHistory = visibleMessages.map((message) =>
        this.toHistoryItemFromConversationMessage(message, false),
      );
      const characters = (
        await this.characterRepo.find({
          where: { id: In(storedConversation.participants) },
        })
      ).sort((left, right) =>
        storedConversation.participants.indexOf(left.id) -
        storedConversation.participants.indexOf(right.id),
      );
      const actors = await Promise.all(
        characters.map((character) =>
          this.buildActorSnapshot({
            character,
            isGroupChat: storedConversation.type === 'group',
            visibleMessages,
            lastChatAt:
              storedConversation.type === 'direct'
                ? this.findLastUserMessageAt(visibleMessages)
                : undefined,
            includeStateGate: storedConversation.type === 'direct',
          }),
        ),
      );
      const arcs = await this.loadNarrativeArcs(owner.id, characters.map((item) => item.id));

      return {
        provider,
        worldContext,
        conversation: await this.toStoredConversationItem(storedConversation),
        visibleMessages: actors.length
          ? visibleHistory.map((item) => ({
              ...item,
              includedInWindow: actors[0].windowMessages.some(
                (message) => message.id === item.id,
              ),
              note: actors[0].windowMessages.some((message) => message.id === item.id)
                ? '进入第一个角色的当前上下文窗口'
                : '在当前可见历史中，但超出第一个角色的窗口',
            }))
          : visibleHistory,
        actors,
        narrativeArcs: arcs.map((item) => this.toNarrativeSummary(item)),
        branchSummary: {
          kind: storedConversation.type === 'group' ? 'stored_group' : 'direct',
          title:
            storedConversation.type === 'group'
              ? '临时群聊已转为 stored conversation'
              : '单聊直回链路',
          notes:
            storedConversation.type === 'group'
              ? [
                  '当前会话来自 conversations 表，但类型已经升级为 group。',
                  '下一次用户消息会直接按 group 分支让所有参与角色回复。',
                ]
              : [
                  '下一次用户消息会先经过当前状态门控，再进入意图分类与单聊回复链。',
                ],
        },
      };
    }

    const group = await this.groupRepo.findOneBy({ id: conversationId });
    if (!group) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const membership = await this.groupMemberRepo.findOneBy({
      groupId: group.id,
      memberId: owner.id,
      memberType: 'user',
    });
    if (!membership) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const [members, messages] = await Promise.all([
      this.groupMemberRepo.find({
        where: { groupId: group.id },
        order: { joinedAt: 'ASC' },
      }),
      this.loadGroupMessages(group),
    ]);
    const characterIds = members
      .filter((member) => member.memberType === 'character')
      .map((member) => member.memberId);
    const characters = (
      await this.characterRepo.find({
        where: { id: In(characterIds) },
      })
    ).sort(
      (left, right) =>
        characterIds.indexOf(left.id) - characterIds.indexOf(right.id),
    );
    const actors = await Promise.all(
      characters.map((character) =>
        this.buildActorSnapshot({
          character,
          isGroupChat: true,
          visibleMessages: messages,
          includeStateGate: false,
        }),
      ),
    );
    const arcs = await this.loadNarrativeArcs(owner.id, characterIds);

    return {
      provider,
      worldContext,
      conversation: await this.toGroupConversationItem(group, members, characters),
      visibleMessages: messages.map((message) =>
        this.toHistoryItemFromGroupMessage(
          message,
          actors[0]?.windowMessages.some((item) => item.id === message.id) ?? false,
        ),
      ),
      actors,
      narrativeArcs: arcs.map((item) => this.toNarrativeSummary(item)),
      branchSummary: {
        kind: 'formal_group',
        title: '正式群聊异步回复链路',
        notes: [
          '正式群聊不会经过单聊状态门控。',
          '角色是否回复取决于 activityFrequency，对应不同的随机回复概率和延迟。',
        ],
      },
    };
  }

  private async getOwnerOrThrow() {
    const owner = await this.userRepo.findOne({ order: { createdAt: 'ASC' } });
    if (!owner) {
      throw new NotFoundException('World owner not found');
    }

    return owner;
  }

  private async listConversationItems(ownerId: string) {
    const [storedConversations, memberships, characters] = await Promise.all([
      this.conversationRepo.find({
        where: { ownerId },
        order: { lastActivityAt: 'DESC' },
      }),
      this.groupMemberRepo.find({
        where: { memberId: ownerId, memberType: 'user' },
      }),
      this.characterRepo.find(),
    ]);
    const characterMap = new Map(characters.map((character) => [character.id, character]));
    const storedItems = storedConversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      type: conversation.type as 'direct' | 'group',
      source: 'conversation' as const,
      participantIds: conversation.participants,
      participantNames: conversation.participants.map(
        (participantId) => characterMap.get(participantId)?.name ?? participantId,
      ),
      lastActivityAt: conversation.lastActivityAt?.toISOString() ?? null,
    }));

    const groupIds = memberships.map((membership) => membership.groupId);
    if (!groupIds.length) {
      return storedItems;
    }

    const [groups, groupMembers] = await Promise.all([
      this.groupRepo.find({
        where: { id: In(groupIds) },
        order: { lastActivityAt: 'DESC' },
      }),
      this.groupMemberRepo.find({
        where: { groupId: In(groupIds) },
        order: { joinedAt: 'ASC' },
      }),
    ]);
    const membersByGroup = new Map<string, GroupMemberEntity[]>();
    for (const member of groupMembers) {
      const bucket = membersByGroup.get(member.groupId) ?? [];
      bucket.push(member);
      membersByGroup.set(member.groupId, bucket);
    }

    const groupItems = groups.map((group) => {
      const members = membersByGroup.get(group.id) ?? [];
      return {
        id: group.id,
        title: group.name,
        type: 'group' as const,
        source: 'group' as const,
        participantIds: members.map((member) => member.memberId),
        participantNames: members.map(
          (member) =>
            member.memberName ??
            characterMap.get(member.memberId)?.name ??
            member.memberId,
        ),
        lastActivityAt: group.lastActivityAt?.toISOString() ?? null,
      };
    });

    return [...storedItems, ...groupItems].sort((left, right) =>
      (right.lastActivityAt ?? '').localeCompare(left.lastActivityAt ?? ''),
    );
  }

  private async resolveProviderSummary(owner: UserEntity): Promise<ReplyLogicProviderSummary> {
    const configuredProviderEndpoint =
      await this.systemConfig.getConfig('provider_endpoint');
    const configuredProviderModel =
      await this.systemConfig.getConfig('provider_model');
    const configuredProviderApiStyle =
      await this.systemConfig.getConfig('provider_api_style');
    const configuredAiModel = await this.systemConfig.getAiModel();
    const envEndpoint = this.config.get<string>('OPENAI_BASE_URL');
    const envModel = this.config.get<string>('AI_MODEL');
    const envApiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    const ownerHasCustomApiKey = Boolean(owner.customApiKey?.trim());
    const endpoint = owner.customApiBase?.trim()
      ? owner.customApiBase.trim()
      : envEndpoint?.trim()
        ? envEndpoint.trim()
        : 'https://api.deepseek.com';
    const endpointSource = owner.customApiBase?.trim()
      ? 'owner_custom_base'
      : envEndpoint?.trim()
        ? 'env_default'
        : 'deepseek_default';
    const model = configuredAiModel?.trim() || envModel?.trim() || 'deepseek-chat';
    const modelSource = configuredAiModel?.trim()
      ? 'system_config_ai_model'
      : envModel?.trim()
        ? 'env_ai_model'
        : 'deepseek_default';
    const apiKeySource = ownerHasCustomApiKey
      ? 'owner_custom'
      : envApiKey?.trim()
        ? 'env_default'
        : 'missing';
    const notes: string[] = [];

    if (
      configuredProviderEndpoint?.trim() &&
      configuredProviderEndpoint.trim().replace(/\/+$/, '') !== endpoint.replace(/\/+$/, '')
    ) {
      notes.push(
        '系统 Provider Endpoint 已配置，但当前聊天主链路仍优先使用世界主人自定义 Base 或环境变量 OPENAI_BASE_URL。',
      );
    }
    if (configuredProviderModel?.trim() && configuredProviderModel.trim() !== model) {
      notes.push(
        'Provider Model 与聊天主链路实际使用的 ai_model 不一致，页面展示的是当前 generateReply() 真正会拿到的模型。',
      );
    }

    return {
      model,
      modelSource,
      endpoint,
      endpointSource,
      apiKeySource,
      ownerCustomBase: owner.customApiBase ?? null,
      configuredProviderEndpoint,
      configuredProviderModel,
      configuredProviderApiStyle,
      notes,
    };
  }

  private async resolveWorldContextSummary(): Promise<ReplyLogicWorldContextSummary | null> {
    const worldContext = await this.worldService.getLatest();
    if (!worldContext) {
      return null;
    }

    return {
      id: worldContext.id,
      text: this.worldService.buildContextString(worldContext),
      timestamp: worldContext.timestamp.toISOString(),
    };
  }

  private toCharacterOverviewItem(
    character: CharacterEntity,
  ): ReplyLogicOverviewCharacterItem {
    return {
      id: character.id,
      name: character.name,
      relationship: character.relationship,
      isOnline: character.isOnline,
      currentActivity: character.currentActivity ?? null,
      expertDomains: character.expertDomains ?? [],
    };
  }

  private async buildActorSnapshot(input: {
    character: CharacterEntity;
    isGroupChat: boolean;
    visibleMessages: Array<MessageEntity | GroupMessageEntity>;
    lastChatAt?: Date;
    includeStateGate: boolean;
  }): Promise<ReplyLogicActorSnapshot> {
    const character = input.character;
    const history = input.visibleMessages.map((message) =>
      this.toChatHistoryMessage(message),
    );
    const inspection = await this.ai.inspectReplyPreparation({
      profile: character.profile,
      conversationHistory: history,
      userMessage: '【预览】如果此刻用户发送一条新消息，请基于当前设定准备回复。',
      isGroupChat: input.isGroupChat,
      chatContext: input.isGroupChat
        ? undefined
        : {
            currentActivity: character.currentActivity,
            lastChatAt: input.lastChatAt,
          },
    });
    const promptSections = this.promptBuilder
      .buildChatSystemPromptSections(
        character.profile,
        input.isGroupChat,
        input.isGroupChat
          ? undefined
          : {
              currentActivity: character.currentActivity,
              lastChatAt: input.lastChatAt,
            },
      )
      .map(
        (section): ReplyLogicPromptSection => ({
          key: section.key,
          label: section.label,
          content: section.content,
          active: section.active,
        }),
      );
    const stateGate = input.includeStateGate
      ? await this.describeDirectStateGate(character.currentActivity)
      : this.describeNonDirectStateGate();

    return {
      character: this.toCharacterContract(character),
      isGroupChat: input.isGroupChat,
      stateGate,
      lastChatAt: input.lastChatAt?.toISOString() ?? null,
      forgettingCurve: character.profile.memory?.forgettingCurve ?? 70,
      historyWindow: inspection.historyWindow,
      visibleHistoryCount: input.visibleMessages.length,
      windowMessages: input.visibleMessages
        .slice(-inspection.historyWindow)
        .map((message) => this.toHistoryItem(message, true)),
      promptSections,
      effectivePrompt: inspection.systemPrompt,
      worldContextText: inspection.worldContextText ?? null,
      notes: [
        inspection.apiAvailable
          ? '当前实例存在可用 API Key，预览使用真实生成链的 prompt 组装结果。'
          : '当前实例没有可用 API Key，实际聊天会返回“先配置 API Key”的兜底提示。',
        input.isGroupChat
          ? '群聊 prompt 不会注入单聊 lastChatAt/currentActivity 的行为上下文。'
          : '单聊 prompt 会注入 currentActivity 和距离上次聊天时间。',
      ],
    };
  }

  private async describeDirectStateGate(
    activity?: string | null,
  ): Promise<ReplyLogicStateGateSummary> {
    const runtimeRules = await this.replyLogicRules.getRules();
    if (activity === 'sleeping') {
      return {
        mode: 'sleep_hint_delay',
        activity,
        reason: '当前活动为 sleeping，先发系统提示，再进入延迟回复。',
        delayMs: { ...runtimeRules.sleepDelayMs },
        hintMessages: [...runtimeRules.sleepHintMessages],
      };
    }

    if (activity === 'working' || activity === 'commuting') {
      return {
        mode: 'busy_hint_delay',
        activity,
        reason: '当前活动为 working / commuting，先发忙碌提示，再进入延迟回复。',
        delayMs: { ...runtimeRules.busyDelayMs },
        hintMessages: [...(runtimeRules.busyHintMessages[activity] ?? [])],
      };
    }

    return {
      mode: 'immediate',
      activity: activity ?? null,
      reason: '当前状态不会触发额外系统提示，下一条消息会直接进入回复链。',
      hintMessages: [],
    };
  }

  private describeNonDirectStateGate(): ReplyLogicStateGateSummary {
    return {
      mode: 'not_applied',
      reason: '当前链路不经过单聊状态门控。',
      hintMessages: [],
    };
  }

  private toHistoryItem(
    message: MessageEntity | GroupMessageEntity,
    includedInWindow: boolean,
  ): ReplyLogicHistoryItem {
    if ('conversationId' in message) {
      return this.toHistoryItemFromConversationMessage(message, includedInWindow);
    }

    return this.toHistoryItemFromGroupMessage(message, includedInWindow);
  }

  private toHistoryItemFromConversationMessage(
    message: MessageEntity,
    includedInWindow: boolean,
  ): ReplyLogicHistoryItem {
    return {
      id: message.id,
      senderType: message.senderType as 'user' | 'character' | 'system',
      senderId: message.senderId,
      senderName: message.senderName,
      type: message.type,
      text:
        message.senderType === 'character'
          ? sanitizeAiText(message.text)
          : message.text,
      attachmentKind: message.attachmentKind ?? null,
      createdAt: message.createdAt.toISOString(),
      includedInWindow,
      note: includedInWindow ? '进入当前窗口' : '未进入当前窗口',
    };
  }

  private toHistoryItemFromGroupMessage(
    message: GroupMessageEntity,
    includedInWindow: boolean,
  ): ReplyLogicHistoryItem {
    return {
      id: message.id,
      senderType: message.senderType as 'user' | 'character' | 'system',
      senderId: message.senderId,
      senderName: message.senderName,
      type: message.type,
      text:
        message.senderType === 'character'
          ? sanitizeAiText(message.text)
          : message.text,
      attachmentKind: message.attachmentKind ?? null,
      createdAt: message.createdAt.toISOString(),
      includedInWindow,
      note: includedInWindow ? '进入当前窗口' : '未进入当前窗口',
    };
  }

  private toChatHistoryMessage(message: MessageEntity | GroupMessageEntity) {
    return {
      role:
        message.senderType === 'user'
          ? ('user' as const)
          : ('assistant' as const),
      content:
        message.senderType === 'user'
          ? message.text
          : sanitizeAiText(message.text),
      characterId:
        message.senderType === 'character' ? message.senderId : undefined,
    };
  }

  private findLastUserMessageAt(messages: Array<MessageEntity | GroupMessageEntity>) {
    const latest = [...messages]
      .reverse()
      .find((message) => message.senderType === 'user');
    return latest?.createdAt;
  }

  private async loadConversationMessages(conversation: ConversationEntity) {
    return this.messageRepo.find({
      where: conversation.lastClearedAt
        ? {
            conversationId: conversation.id,
            createdAt: MoreThan(conversation.lastClearedAt),
          }
        : { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
    });
  }

  private async loadGroupMessages(group: GroupEntity) {
    return this.groupMessageRepo.find({
      where: group.lastClearedAt
        ? {
            groupId: group.id,
            createdAt: MoreThan(group.lastClearedAt),
          }
        : { groupId: group.id },
      order: { createdAt: 'ASC' },
    });
  }

  private async loadNarrativeArcs(ownerId: string, characterIds: string[]) {
    if (!characterIds.length) {
      return [];
    }

    return this.narrativeArcRepo.find({
      where: {
        ownerId,
        characterId: In(characterIds),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private toNarrativeSummary(
    arc: NarrativeArcEntity,
  ): ReplyLogicNarrativeArcSummary {
    return {
      id: arc.id,
      title: arc.title,
      status: arc.status,
      progress: arc.progress,
      createdAt: arc.createdAt.toISOString(),
      completedAt: arc.completedAt?.toISOString() ?? null,
      milestones: (arc.milestones ?? []).map((item) => ({
        label: item.label,
        completedAt: item.completedAt
          ? new Date(item.completedAt).toISOString()
          : null,
      })),
    };
  }

  private async toStoredConversationItem(
    conversation: ConversationEntity,
  ): Promise<ReplyLogicOverviewConversationItem> {
    const characters = await this.characterRepo.find({
      where: { id: In(conversation.participants) },
    });
    const characterMap = new Map(characters.map((character) => [character.id, character.name]));

    return {
      id: conversation.id,
      title: conversation.title,
      type: conversation.type as 'direct' | 'group',
      source: 'conversation',
      participantIds: conversation.participants,
      participantNames: conversation.participants.map(
        (participantId) => characterMap.get(participantId) ?? participantId,
      ),
      lastActivityAt: conversation.lastActivityAt?.toISOString() ?? null,
    };
  }

  private async toGroupConversationItem(
    group: GroupEntity,
    members: GroupMemberEntity[],
    characters: CharacterEntity[],
  ): Promise<ReplyLogicOverviewConversationItem> {
    const characterMap = new Map(characters.map((character) => [character.id, character.name]));

    return {
      id: group.id,
      title: group.name,
      type: 'group',
      source: 'group',
      participantIds: members.map((member) => member.memberId),
      participantNames: members.map(
        (member) =>
          member.memberName ??
          characterMap.get(member.memberId) ??
          member.memberId,
      ),
      lastActivityAt: group.lastActivityAt?.toISOString() ?? null,
    };
  }

  private toCharacterContract(character: CharacterEntity) {
    return {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      relationship: character.relationship,
      relationshipType: character.relationshipType as
        | 'family'
        | 'friend'
        | 'expert'
        | 'mentor'
        | 'custom',
      personality: character.personality,
      bio: character.bio,
      isOnline: character.isOnline,
      onlineMode:
        character.onlineMode === 'manual'
          ? ('manual' as const)
          : ('auto' as const),
      isTemplate: character.isTemplate,
      expertDomains: character.expertDomains,
      profile: character.profile,
      activityFrequency: character.activityFrequency,
      momentsFrequency: character.momentsFrequency,
      feedFrequency: character.feedFrequency,
      activeHoursStart: character.activeHoursStart ?? null,
      activeHoursEnd: character.activeHoursEnd ?? null,
      triggerScenes: character.triggerScenes ?? [],
      intimacyLevel: character.intimacyLevel,
      lastActiveAt: character.lastActiveAt?.toISOString() ?? null,
      aiRelationships: character.aiRelationships ?? null,
      currentStatus: character.currentStatus ?? null,
      currentActivity: character.currentActivity ?? null,
      activityMode:
        character.activityMode === 'manual'
          ? ('manual' as const)
          : ('auto' as const),
    };
  }
}
