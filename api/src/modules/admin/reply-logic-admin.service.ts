import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
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
import { MomentPostEntity } from '../moments/moment-post.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { SchedulerTelemetryService } from '../scheduler/scheduler-telemetry.service';
import type { SchedulerJobId } from '../scheduler/scheduler-telemetry.types';
import type {
  ReplyLogicActorSnapshot,
  ReplyLogicCharacterSnapshot,
  ReplyLogicCharacterObservability,
  ReplyLogicConversationSnapshot,
  ReplyLogicHistoryItem,
  ReplyLogicNarrativeArcSummary,
  ReplyLogicOverview,
  ReplyLogicOverviewConversationItem,
  ReplyLogicPreviewResult,
  ReplyLogicOverviewCharacterItem,
  ReplyLogicProviderSummary,
  ReplyLogicPromptSection,
  ReplyLogicStateGateSummary,
  ReplyLogicWorldContextSummary,
} from './reply-logic-admin.types';

function renderTemplate(
  template: string,
  variables: Record<string, string | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

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
    @InjectRepository(MomentPostEntity)
    private readonly momentPostRepo: Repository<MomentPostEntity>,
    @InjectRepository(FeedPostEntity)
    private readonly feedPostRepo: Repository<FeedPostEntity>,
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly worldService: WorldService,
    private readonly ai: AiOrchestratorService,
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly schedulerTelemetry: SchedulerTelemetryService,
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

    const [provider, worldContext, conversations, narrativeArc, observability] =
      await Promise.all([
        this.resolveProviderSummary(owner),
        this.resolveWorldContextSummary(),
        this.conversationRepo.find({ where: { ownerId: owner.id } }),
        this.narrativeArcRepo.findOne({
          where: { ownerId: owner.id, characterId },
          order: { createdAt: 'DESC' },
        }),
        this.buildCharacterObservability(character),
      ]);
    const runtimeRules = await this.replyLogicRules.getRules();

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
      observability,
      relatedConversationIds,
      notes: [
        runtimeRules.inspectorTemplates.characterViewIntro,
        primaryConversation
          ? runtimeRules.inspectorTemplates.characterViewHistoryFound
          : runtimeRules.inspectorTemplates.characterViewHistoryMissing,
      ],
    };
  }

  async getConversationSnapshot(
    conversationId: string,
  ): Promise<ReplyLogicConversationSnapshot> {
    const owner = await this.getOwnerOrThrow();
    const [provider, worldContext, runtimeRules] = await Promise.all([
      this.resolveProviderSummary(owner),
      this.resolveWorldContextSummary(),
      this.replyLogicRules.getRules(),
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
        this.toHistoryItemFromConversationMessage(message, false, runtimeRules),
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
                ? runtimeRules.inspectorTemplates.historyIncludedNote
                : runtimeRules.inspectorTemplates.historyExcludedNote,
            }))
          : visibleHistory,
        actors,
        narrativeArcs: arcs.map((item) => this.toNarrativeSummary(item)),
        branchSummary: {
          kind: storedConversation.type === 'group' ? 'stored_group' : 'direct',
          title:
            storedConversation.type === 'group'
              ? runtimeRules.inspectorTemplates.storedGroupTitle
              : runtimeRules.inspectorTemplates.directBranchTitle,
          notes:
            storedConversation.type === 'group'
              ? [
                  runtimeRules.inspectorTemplates.storedGroupUpgradedNote,
                  runtimeRules.inspectorTemplates.storedGroupNextReplyNote,
                ]
              : [runtimeRules.inspectorTemplates.directBranchNextReplyNote],
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
          runtimeRules,
        ),
      ),
      actors,
      narrativeArcs: arcs.map((item) => this.toNarrativeSummary(item)),
      branchSummary: {
        kind: 'formal_group',
        title: runtimeRules.inspectorTemplates.formalGroupTitle,
        notes: [
          runtimeRules.inspectorTemplates.formalGroupStateGateNote,
          runtimeRules.inspectorTemplates.formalGroupReplyRuleNote,
        ],
      },
    };
  }

  async previewCharacterReply(
    characterId: string,
    userMessage: string,
  ): Promise<ReplyLogicPreviewResult> {
    const owner = await this.getOwnerOrThrow();
    const character = await this.characterRepo.findOneBy({ id: characterId });
    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    const conversations = await this.conversationRepo.find({
      where: { ownerId: owner.id },
    });
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
      previewUserMessage: userMessage,
    });
    const runtimeRules = await this.replyLogicRules.getRules();

    return {
      scope: 'character',
      targetId: characterId,
      actorCharacterId: character.id,
      userMessage,
      actor,
      notes: [
        runtimeRules.inspectorTemplates.previewCharacterIntro,
        primaryConversation
          ? runtimeRules.inspectorTemplates.previewCharacterWithHistory
          : runtimeRules.inspectorTemplates.previewCharacterWithoutHistory,
      ],
    };
  }

  async previewConversationReply(
    conversationId: string,
    userMessage: string,
    actorCharacterId?: string,
  ): Promise<ReplyLogicPreviewResult> {
    const owner = await this.getOwnerOrThrow();
    const runtimeRules = await this.replyLogicRules.getRules();
    const storedConversation = await this.conversationRepo.findOneBy({
      id: conversationId,
      ownerId: owner.id,
    });

    if (storedConversation) {
      const visibleMessages = await this.loadConversationMessages(
        storedConversation,
      );
      const characters = (
        await this.characterRepo.find({
          where: { id: In(storedConversation.participants) },
        })
      ).sort(
        (left, right) =>
          storedConversation.participants.indexOf(left.id) -
          storedConversation.participants.indexOf(right.id),
      );
      const selectedCharacter =
        characters.find((character) => character.id === actorCharacterId) ??
        characters[0];
      if (!selectedCharacter) {
        throw new NotFoundException(
          `Conversation ${conversationId} has no character participants`,
        );
      }

      const actor = await this.buildActorSnapshot({
        character: selectedCharacter,
        isGroupChat: storedConversation.type === 'group',
        visibleMessages,
        lastChatAt:
          storedConversation.type === 'direct'
            ? this.findLastUserMessageAt(visibleMessages)
            : undefined,
        includeStateGate: storedConversation.type === 'direct',
        previewUserMessage: userMessage,
      });

      return {
        scope: 'conversation',
        targetId: conversationId,
        actorCharacterId: selectedCharacter.id,
        userMessage,
        actor,
        notes:
          storedConversation.type === 'group'
            ? [runtimeRules.inspectorTemplates.previewStoredGroup]
            : [runtimeRules.inspectorTemplates.previewDirectConversation],
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
    const selectedCharacter =
      characters.find((character) => character.id === actorCharacterId) ??
      characters[0];
    if (!selectedCharacter) {
      throw new NotFoundException(
        `Conversation ${conversationId} has no character participants`,
      );
    }

    const actor = await this.buildActorSnapshot({
      character: selectedCharacter,
      isGroupChat: true,
      visibleMessages: messages,
      includeStateGate: false,
      previewUserMessage: userMessage,
    });

    return {
      scope: 'conversation',
      targetId: conversationId,
      actorCharacterId: selectedCharacter.id,
      userMessage,
      actor,
      notes: [runtimeRules.inspectorTemplates.previewFormalGroup],
    };
  }

  private async getOwnerOrThrow() {
    const owner = await this.userRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
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
    const runtimeRules = await this.replyLogicRules.getRules();
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
      notes.push(runtimeRules.providerTemplates.endpointPriorityNote);
    }
    if (configuredProviderModel?.trim() && configuredProviderModel.trim() !== model) {
      notes.push(runtimeRules.providerTemplates.modelPriorityNote);
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
      text: await this.worldService.buildContextString(worldContext),
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

  private async buildCharacterObservability(
    character: CharacterEntity,
  ): Promise<ReplyLogicCharacterObservability> {
    const runtimeRules = await this.replyLogicRules.getRules();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const currentHour = now.getHours();
    const startHour = character.activeHoursStart ?? 8;
    const endHour = character.activeHoursEnd ?? 23;
    const triggerScenes = [...(character.triggerScenes ?? [])];
    const memoryText = [
      character.profile?.memory?.coreMemory,
      character.profile?.memory?.recentSummary,
    ]
      .filter(Boolean)
      .join('\n');
    const memoryEnabled = Boolean(memoryText.trim());
    const relevantJobIds: SchedulerJobId[] = [
      'update_ai_active_status',
      'update_character_status',
      'check_moment_schedule',
      'check_channels_schedule',
      'trigger_scene_friend_requests',
      'trigger_memory_proactive_messages',
    ];
    const [todayMoments, weeklyChannels] = await Promise.all([
      this.momentPostRepo.count({
        where: {
          authorId: character.id,
          postedAt: MoreThanOrEqual(todayStart),
        },
      }),
      this.feedPostRepo.count({
        where: {
          authorId: character.id,
          createdAt: MoreThanOrEqual(weekStart),
          surface: 'channels',
        },
      }),
    ]);
    const notes: string[] = [];

    if (character.onlineMode === 'manual') {
      notes.push(runtimeRules.runtimeNoteTemplates.manualOnlineMode);
    }
    if (character.activityMode === 'manual') {
      notes.push(runtimeRules.runtimeNoteTemplates.manualActivityMode);
    }
    if ((character.momentsFrequency ?? 0) < 1) {
      notes.push(runtimeRules.runtimeNoteTemplates.zeroMomentFrequency);
    }
    if ((character.feedFrequency ?? 0) < 1) {
      notes.push(runtimeRules.runtimeNoteTemplates.zeroChannelFrequency);
    }
    if (!triggerScenes.length) {
      notes.push(runtimeRules.runtimeNoteTemplates.missingTriggerScenes);
    }
    if (!memoryEnabled) {
      notes.push(runtimeRules.runtimeNoteTemplates.missingMemorySeed);
    }

    return {
      activeWindow: {
        startHour,
        endHour,
        currentHour,
        label: `${startHour}:00 - ${endHour}:00`,
        isWithinWindow: currentHour >= startHour && currentHour <= endHour,
      },
      contentCadence: {
        todayMoments,
        momentsTarget: character.momentsFrequency ?? 0,
        weeklyChannels,
        channelsTarget: character.feedFrequency ?? 0,
      },
      triggerScenes,
      memoryProactive: {
        enabled: memoryEnabled,
        reason: memoryEnabled
          ? runtimeRules.runtimeNoteTemplates.memoryProactiveEnabled
          : runtimeRules.runtimeNoteTemplates.memoryProactiveDisabled,
      },
      relevantJobs: (await this.schedulerTelemetry.listJobs()).filter((job) =>
        relevantJobIds.includes(job.id),
      ),
      recentRuns: this.schedulerTelemetry.listRecentRuns({
        limit: 12,
        jobIds: relevantJobIds,
      }),
      lifeEvents: this.schedulerTelemetry.listCharacterEvents(character.id, 12),
      notes,
    };
  }

  private async buildActorSnapshot(input: {
    character: CharacterEntity;
    isGroupChat: boolean;
    visibleMessages: Array<MessageEntity | GroupMessageEntity>;
    lastChatAt?: Date;
    includeStateGate: boolean;
    previewUserMessage?: string;
  }): Promise<ReplyLogicActorSnapshot> {
    const character = input.character;
    const runtimeRules = await this.replyLogicRules.getRules();
    const history = input.visibleMessages.map((message) =>
      this.toChatHistoryMessage(message),
    );
    const inspection = await this.ai.inspectReplyPreparation({
      profile: character.profile,
      conversationHistory: history,
      userMessage:
        input.previewUserMessage?.trim() ||
        '【预览】如果此刻用户发送一条新消息，请基于当前设定准备回复。',
      isGroupChat: input.isGroupChat,
      chatContext: input.isGroupChat
        ? undefined
        : {
            currentActivity: character.currentActivity,
            lastChatAt: input.lastChatAt,
          },
    });
    const promptSections = (
      await this.promptBuilder.buildChatSystemPromptSections(
        character.profile,
        input.isGroupChat,
        input.isGroupChat
          ? undefined
          : {
              currentActivity: character.currentActivity,
              lastChatAt: input.lastChatAt,
            },
      )
    ).map(
        (section): ReplyLogicPromptSection => ({
          key: section.key,
          label: section.label,
          content: section.content,
          active: section.active,
        }),
      );
    const stateGate = input.includeStateGate
      ? this.describeDirectStateGate(runtimeRules, character.currentActivity)
      : this.describeNonDirectStateGate(runtimeRules);

    return {
      character: this.toCharacterContract(character),
      isGroupChat: input.isGroupChat,
      stateGate,
      model: inspection.model,
      apiAvailable: inspection.apiAvailable,
      lastChatAt: input.lastChatAt?.toISOString() ?? null,
      forgettingCurve: character.profile.memory?.forgettingCurve ?? 70,
      historyWindow: inspection.historyWindow,
      visibleHistoryCount: input.visibleMessages.length,
      windowMessages: input.visibleMessages
        .slice(-inspection.historyWindow)
        .map((message) => this.toHistoryItem(message, true, runtimeRules)),
      requestMessages: inspection.requestMessages,
      promptSections,
      effectivePrompt: inspection.systemPrompt,
      worldContextText: inspection.worldContextText ?? null,
      notes: [
        inspection.apiAvailable
          ? runtimeRules.observabilityTemplates.actorNoteApiAvailable
          : runtimeRules.observabilityTemplates.actorNoteApiUnavailable,
        input.isGroupChat
          ? runtimeRules.observabilityTemplates.actorNoteGroupContext
          : runtimeRules.observabilityTemplates.actorNoteDirectContext,
      ],
    };
  }

  private describeDirectStateGate(
    runtimeRules: Awaited<ReturnType<ReplyLogicRulesService['getRules']>>,
    activity?: string | null,
  ): ReplyLogicStateGateSummary {
    const activityLabel =
      runtimeRules.semanticLabels.activityLabels[
        (activity ?? 'free') as keyof typeof runtimeRules.semanticLabels.activityLabels
      ] ?? activity ?? runtimeRules.semanticLabels.activityLabels.free;
    if (activity === 'sleeping') {
      return {
        mode: 'sleep_hint_delay',
        activity,
        reason: renderTemplate(
          runtimeRules.observabilityTemplates.stateGateSleeping,
          {
            activity: activityLabel,
          },
        ),
        delayMs: { ...runtimeRules.sleepDelayMs },
        hintMessages: [...runtimeRules.sleepHintMessages],
      };
    }

    if (activity === 'working' || activity === 'commuting') {
      return {
        mode: 'busy_hint_delay',
        activity,
        reason: renderTemplate(runtimeRules.observabilityTemplates.stateGateBusy, {
          activity: activityLabel,
        }),
        delayMs: { ...runtimeRules.busyDelayMs },
        hintMessages: [...(runtimeRules.busyHintMessages[activity] ?? [])],
      };
    }

    return {
      mode: 'immediate',
      activity: activity ?? null,
      reason: renderTemplate(
        runtimeRules.observabilityTemplates.stateGateImmediate,
        {
          activity: activityLabel,
        },
      ),
      hintMessages: [],
    };
  }

  private describeNonDirectStateGate(
    runtimeRules: Awaited<ReturnType<ReplyLogicRulesService['getRules']>>,
  ): ReplyLogicStateGateSummary {
    return {
      mode: 'not_applied',
      reason: renderTemplate(
        runtimeRules.observabilityTemplates.stateGateNotApplied,
        {},
      ),
      hintMessages: [],
    };
  }

  private toHistoryItem(
    message: MessageEntity | GroupMessageEntity,
    includedInWindow: boolean,
    runtimeRules: Awaited<ReturnType<ReplyLogicRulesService['getRules']>>,
  ): ReplyLogicHistoryItem {
    if ('conversationId' in message) {
      return this.toHistoryItemFromConversationMessage(
        message,
        includedInWindow,
        runtimeRules,
      );
    }

    return this.toHistoryItemFromGroupMessage(
      message,
      includedInWindow,
      runtimeRules,
    );
  }

  private toHistoryItemFromConversationMessage(
    message: MessageEntity,
    includedInWindow: boolean,
    runtimeRules: Awaited<ReturnType<ReplyLogicRulesService['getRules']>>,
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
      note: includedInWindow
        ? runtimeRules.inspectorTemplates.historyIncludedNote
        : runtimeRules.inspectorTemplates.historyExcludedNote,
    };
  }

  private toHistoryItemFromGroupMessage(
    message: GroupMessageEntity,
    includedInWindow: boolean,
    runtimeRules: Awaited<ReturnType<ReplyLogicRulesService['getRules']>>,
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
      note: includedInWindow
        ? runtimeRules.inspectorTemplates.historyIncludedNote
        : runtimeRules.inspectorTemplates.historyExcludedNote,
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
