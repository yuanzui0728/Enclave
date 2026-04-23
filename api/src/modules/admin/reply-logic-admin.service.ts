import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { filterUserFacingConversations } from '../chat/conversation-visibility';
import { MessageEntity } from '../chat/message.entity';
import { GroupEntity } from '../chat/group.entity';
import { GroupMemberEntity } from '../chat/group-member.entity';
import { GroupMessageEntity } from '../chat/group-message.entity';
import { GroupReplyTaskEntity } from '../chat/group-reply-task.entity';
import { GroupReplyTaskService } from '../chat/group-reply-task.service';
import {
  buildGroupReplyIssueSummaryFromTasks,
  calculateGroupReplyCancelRate,
  calculateGroupReplyFailureRate,
  GROUP_REPLY_TASK_ARCHIVE_STATS_CONFIG_KEY,
  normalizeGroupReplyTaskArchiveStore,
  type GroupReplyTaskArchiveStore,
} from '../chat/group-reply-task-observability';
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
import type { GroupReplyPlannerCandidateDiagnostic } from '../chat/group-reply.types';
import type {
  ReplyLogicActorSnapshot,
  ReplyLogicCharacterSnapshot,
  ReplyLogicCharacterObservability,
  ReplyLogicConversationSnapshot,
  ReplyLogicGroupReplyActorDriftSummary,
  ReplyLogicGroupReplyArchiveSummary,
  ReplyLogicGroupReplyArchiveActorSummary,
  ReplyLogicGroupReplyArchiveTrendPoint,
  ReplyLogicGroupReplyCandidateSummary,
  ReplyLogicGroupReplyIssueSummary,
  ReplyLogicGroupReplyRuntimeSummary,
  ReplyLogicGroupReplySelectionDisposition,
  ReplyLogicGroupReplyTaskCleanupResult,
  ReplyLogicGroupReplyTaskRetryResult,
  ReplyLogicGroupReplyTaskSummary,
  ReplyLogicGroupReplyTaskStatus,
  ReplyLogicGroupReplyTurnRetryResult,
  ReplyLogicGroupReplyTurnSummary,
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

type StoredGroupReplyPlannerContext = {
  maxSpeakers: number;
  explicitInterest: boolean;
  hasMentionAll: boolean;
  mentionTargets: string[];
  replyTargetCharacterId?: string | null;
};

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
    @InjectRepository(GroupReplyTaskEntity)
    private readonly groupReplyTaskRepo: Repository<GroupReplyTaskEntity>,
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
    private readonly groupReplyTaskService: GroupReplyTaskService,
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
      characters: characters.map((character) =>
        this.toCharacterOverviewItem(character),
      ),
      conversations,
    };
  }

  async getRuntimeRules() {
    return this.replyLogicRules.getRules();
  }

  async setRuntimeRules(
    payload: Parameters<ReplyLogicRulesService['setRules']>[0],
  ) {
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

    const [
      provider,
      worldContext,
      storedConversations,
      narrativeArc,
      observability,
    ] = await Promise.all([
      this.resolveProviderSummary(owner),
      this.resolveWorldContextSummary(),
      this.conversationRepo.find({ where: { ownerId: owner.id } }),
      this.narrativeArcRepo.findOne({
        where: { ownerId: owner.id, characterId },
        order: { createdAt: 'DESC' },
      }),
      this.buildCharacterObservability(character),
    ]);
    const conversations = filterUserFacingConversations(storedConversations);
    const runtimeRules = await this.replyLogicRules.getRules();

    const relatedConversationIds = conversations
      .filter((conversation) =>
        this.getStoredConversationParticipantIds(conversation).includes(
          characterId,
        ),
      )
      .map((conversation) => conversation.id);
    const primaryConversation = conversations.find((conversation) =>
      this.getStoredConversationParticipantIds(conversation).includes(
        characterId,
      ),
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
      const participantIds =
        this.getStoredConversationParticipantIds(storedConversation);
      const visibleMessages =
        await this.loadConversationMessages(storedConversation);
      const visibleHistory = visibleMessages.map((message) =>
        this.toHistoryItemFromConversationMessage(message, false, runtimeRules),
      );
      const characters = (
        await this.characterRepo.find({
          where: { id: In(participantIds) },
        })
      ).sort(
        (left, right) =>
          participantIds.indexOf(left.id) - participantIds.indexOf(right.id),
      );
      const actors = await Promise.all(
        characters.map((character) =>
          this.buildActorSnapshot({
            character,
            isGroupChat: false,
            visibleMessages,
            lastChatAt: this.findLastUserMessageAt(visibleMessages),
            includeStateGate: true,
          }),
        ),
      );
      const arcs = await this.loadNarrativeArcs(
        owner.id,
        characters.map((item) => item.id),
      );

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
              note: actors[0].windowMessages.some(
                (message) => message.id === item.id,
              )
                ? runtimeRules.inspectorTemplates.historyIncludedNote
                : runtimeRules.inspectorTemplates.historyExcludedNote,
            }))
          : visibleHistory,
        actors,
        narrativeArcs: arcs.map((item) => this.toNarrativeSummary(item)),
        groupReplyRuntime: null,
        branchSummary: {
          kind: 'direct',
          title: runtimeRules.inspectorTemplates.directBranchTitle,
          notes: [runtimeRules.inspectorTemplates.directBranchNextReplyNote],
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
    const [arcs, groupReplyRuntime] = await Promise.all([
      this.loadNarrativeArcs(owner.id, characterIds),
      this.loadGroupReplyRuntime(group.id),
    ]);

    return {
      provider,
      worldContext,
      conversation: this.toGroupConversationItem(group, members, characters),
      visibleMessages: messages.map((message) =>
        this.toHistoryItemFromGroupMessage(
          message,
          actors[0]?.windowMessages.some((item) => item.id === message.id) ??
            false,
          runtimeRules,
        ),
      ),
      actors,
      narrativeArcs: arcs.map((item) => this.toNarrativeSummary(item)),
      groupReplyRuntime,
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

    const conversations = filterUserFacingConversations(
      await this.conversationRepo.find({
        where: { ownerId: owner.id },
      }),
    );
    const primaryConversation = conversations.find((conversation) =>
      this.getStoredConversationParticipantIds(conversation).includes(
        characterId,
      ),
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
      const participantIds =
        this.getStoredConversationParticipantIds(storedConversation);
      const visibleMessages =
        await this.loadConversationMessages(storedConversation);
      const characters = (
        await this.characterRepo.find({
          where: { id: In(participantIds) },
        })
      ).sort(
        (left, right) =>
          participantIds.indexOf(left.id) - participantIds.indexOf(right.id),
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
        isGroupChat: false,
        visibleMessages,
        lastChatAt: this.findLastUserMessageAt(visibleMessages),
        includeStateGate: true,
        previewUserMessage: userMessage,
      });

      return {
        scope: 'conversation',
        targetId: conversationId,
        actorCharacterId: selectedCharacter.id,
        userMessage,
        actor,
        notes: [runtimeRules.inspectorTemplates.previewDirectConversation],
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
      lastChatAt: this.findLastUserMessageAt(messages),
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

  async retryGroupReplyTask(
    taskId: string,
  ): Promise<ReplyLogicGroupReplyTaskRetryResult> {
    const task = await this.groupReplyTaskService.retryTask(taskId);
    return {
      taskId: task.id,
      groupId: task.groupId,
      status: task.status as ReplyLogicGroupReplyTaskStatus,
      executeAfter: task.executeAfter.toISOString(),
      note: '任务已重新入队，会在下一轮扫描时尽快执行。',
    };
  }

  async retryGroupReplyTurn(
    turnId: string,
  ): Promise<ReplyLogicGroupReplyTurnRetryResult> {
    const result = await this.groupReplyTaskService.retryTurn(turnId);
    return {
      ...result,
      note:
        result.retriedTaskCount > 0
          ? '本轮可重试任务已重新入队。'
          : '当前轮次没有可重新入队的任务。',
    };
  }

  async cleanupGroupReplyTasks(input?: {
    olderThanDays?: number | null;
    groupId?: string | null;
    statuses?: string[] | null;
  }): Promise<ReplyLogicGroupReplyTaskCleanupResult> {
    const result = await this.groupReplyTaskService.cleanupTasks({
      olderThanDays: input?.olderThanDays ?? undefined,
      groupId: input?.groupId?.trim() || undefined,
      statuses: (input?.statuses ?? []).filter(
        (status): status is ReplyLogicGroupReplyTaskStatus =>
          ['sent', 'cancelled', 'failed'].includes(status),
      ),
    });

    return {
      deletedCount: result.deletedCount,
      cutoff: result.cutoff.toISOString(),
      statuses: result.statuses as ReplyLogicGroupReplyTaskStatus[],
      groupId: result.groupId,
      note:
        result.deletedCount > 0
          ? '已清理超出保留期的终态任务。'
          : '当前没有命中清理条件的终态任务。',
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
    const [allStoredConversations, memberships, characters] = await Promise.all(
      [
        this.conversationRepo.find({
          where: { ownerId },
          order: { lastActivityAt: 'DESC' },
        }),
        this.groupMemberRepo.find({
          where: { memberId: ownerId, memberType: 'user' },
        }),
        this.characterRepo.find(),
      ],
    );
    const storedConversations = filterUserFacingConversations(
      allStoredConversations,
    );
    const characterMap = new Map(
      characters.map((character) => [character.id, character]),
    );
    const storedItems = storedConversations.map((conversation) => ({
      participantIds: this.getStoredConversationParticipantIds(conversation),
      id: conversation.id,
      title: conversation.title,
      type: 'direct' as const,
      source: 'conversation' as const,
      participantNames: this.getStoredConversationParticipantIds(
        conversation,
      ).map(
        (participantId) =>
          characterMap.get(participantId)?.name ?? participantId,
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

  private async resolveProviderSummary(
    owner: UserEntity,
  ): Promise<ReplyLogicProviderSummary> {
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
    const model =
      configuredAiModel?.trim() || envModel?.trim() || 'deepseek-chat';
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
      configuredProviderEndpoint.trim().replace(/\/+$/, '') !==
        endpoint.replace(/\/+$/, '')
    ) {
      notes.push(runtimeRules.providerTemplates.endpointPriorityNote);
    }
    if (
      configuredProviderModel?.trim() &&
      configuredProviderModel.trim() !== model
    ) {
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
        runtimeRules.inspectorTemplates.previewDefaultUserMessage,
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
        (activity ??
          'free') as keyof typeof runtimeRules.semanticLabels.activityLabels
      ] ??
      activity ??
      runtimeRules.semanticLabels.activityLabels.free;
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
        reason: renderTemplate(
          runtimeRules.observabilityTemplates.stateGateBusy,
          {
            activity: activityLabel,
          },
        ),
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

  private findLastUserMessageAt(
    messages: Array<MessageEntity | GroupMessageEntity>,
  ) {
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

  private async loadGroupReplyRuntime(
    groupId: string,
  ): Promise<ReplyLogicGroupReplyRuntimeSummary> {
    const [
      pendingTaskCount,
      processingTaskCount,
      failedTaskCount,
      taskEntities,
      archiveStore,
    ] = await Promise.all([
      this.groupReplyTaskRepo.count({
        where: { groupId, status: 'pending' },
      }),
      this.groupReplyTaskRepo.count({
        where: { groupId, status: 'processing' },
      }),
      this.groupReplyTaskRepo.count({
        where: { groupId, status: 'failed' },
      }),
      this.groupReplyTaskRepo.find({
        where: { groupId },
        order: {
          triggerMessageCreatedAt: 'DESC',
          createdAt: 'DESC',
        },
        take: 96,
      }),
      this.readGroupReplyArchiveStore(),
    ]);

    const tasksByTurn = new Map<string, GroupReplyTaskEntity[]>();
    for (const task of taskEntities) {
      const bucket = tasksByTurn.get(task.turnId) ?? [];
      bucket.push(task);
      tasksByTurn.set(task.turnId, bucket);
    }

    const recentTurns = [...tasksByTurn.values()]
      .slice(0, 8)
      .map((tasks) => this.toGroupReplyTurnSummary(tasks));
    const issueSummary = buildGroupReplyIssueSummaryFromTasks(taskEntities, 8);
    const archiveSummary = this.toGroupReplyArchiveSummary(
      groupId,
      archiveStore,
    );

    return {
      pendingTaskCount,
      processingTaskCount,
      failedTaskCount,
      archiveSummary,
      actorDriftSummary: this.buildGroupReplyActorDriftSummary(
        recentTurns,
        archiveSummary,
      ),
      issueSummary,
      recentTurns,
      notes: [
        '同群新用户消息进入后，尚未发出的旧轮任务会被取消。',
        '后续角色任务会在执行时读取触发消息后的已发角色回复，尽量避免重复。',
      ],
    };
  }

  private toGroupReplyTurnSummary(
    tasks: GroupReplyTaskEntity[],
  ): ReplyLogicGroupReplyTurnSummary {
    const orderedTasks = [...tasks].sort(
      (left, right) => left.sequenceIndex - right.sequenceIndex,
    );
    const primaryTask = orderedTasks[0];
    const plannerContext = this.parsePlannerContextPayload(
      primaryTask.plannerContextPayload,
    );
    const storedCandidates = this.parsePlannerCandidatesPayload(
      primaryTask.plannerCandidatesPayload,
    );
    const fallbackCandidates = orderedTasks.map((task) =>
      this.toGroupReplyCandidateSummaryFromTask(task),
    );
    const candidates =
      storedCandidates.length > 0 ? storedCandidates : fallbackCandidates;
    const statusCounts: Record<ReplyLogicGroupReplyTaskStatus, number> = {
      pending: 0,
      processing: 0,
      sent: 0,
      cancelled: 0,
      failed: 0,
    };

    for (const task of orderedTasks) {
      statusCounts[task.status as ReplyLogicGroupReplyTaskStatus] += 1;
    }
    const updatedAt = orderedTasks.reduce(
      (latest, task) =>
        latest.getTime() > task.updatedAt.getTime() ? latest : task.updatedAt,
      primaryTask.updatedAt,
    );

    return {
      turnId: primaryTask.turnId,
      triggerMessageId: primaryTask.triggerMessageId,
      triggerMessageCreatedAt:
        primaryTask.triggerMessageCreatedAt.toISOString(),
      createdAt: primaryTask.createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      maxSpeakers: plannerContext?.maxSpeakers ?? orderedTasks.length,
      explicitInterest: plannerContext?.explicitInterest ?? false,
      hasMentionAll: plannerContext?.hasMentionAll ?? false,
      mentionTargets: plannerContext?.mentionTargets ?? [],
      replyTargetCharacterId: plannerContext?.replyTargetCharacterId ?? null,
      statusCounts,
      candidates,
      tasks: orderedTasks.map((task) => this.toGroupReplyTaskSummary(task)),
    };
  }

  private toGroupReplyTaskSummary(
    task: GroupReplyTaskEntity,
  ): ReplyLogicGroupReplyTaskSummary {
    return {
      id: task.id,
      actorCharacterId: task.actorCharacterId,
      actorName: task.actorName,
      score: task.score,
      randomPassed: task.randomPassed,
      isExplicitTarget: task.isExplicitTarget,
      isReplyTarget: task.isReplyTarget,
      recentSpeakerIndex: task.recentSpeakerIndex,
      selectionDisposition:
        task.selectionDisposition as ReplyLogicGroupReplySelectionDisposition,
      sequenceIndex: task.sequenceIndex,
      status: task.status as ReplyLogicGroupReplyTaskStatus,
      executeAfter: task.executeAfter.toISOString(),
      lastAttemptAt: task.lastAttemptAt?.toISOString() ?? null,
      sentAt: task.sentAt?.toISOString() ?? null,
      cancelledAt: task.cancelledAt?.toISOString() ?? null,
      cancelReason: task.cancelReason ?? null,
      errorMessage: task.errorMessage ?? null,
    };
  }

  private toGroupReplyCandidateSummaryFromTask(
    task: GroupReplyTaskEntity,
  ): ReplyLogicGroupReplyCandidateSummary {
    return {
      characterId: task.actorCharacterId,
      characterName: task.actorName,
      score: task.score,
      randomPassed: task.randomPassed,
      isExplicitTarget: task.isExplicitTarget,
      isReplyTarget: task.isReplyTarget,
      recentSpeakerIndex: task.recentSpeakerIndex,
      selectionDisposition:
        task.selectionDisposition as ReplyLogicGroupReplySelectionDisposition,
    };
  }

  private parsePlannerContextPayload(
    payload?: string | null,
  ): StoredGroupReplyPlannerContext | null {
    if (!payload) {
      return null;
    }

    try {
      const parsed = JSON.parse(payload) as StoredGroupReplyPlannerContext;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private parsePlannerCandidatesPayload(
    payload?: string | null,
  ): ReplyLogicGroupReplyCandidateSummary[] {
    if (!payload) {
      return [];
    }

    try {
      const parsed = JSON.parse(
        payload,
      ) as GroupReplyPlannerCandidateDiagnostic[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((candidate) => ({
        characterId: candidate.characterId,
        characterName: candidate.characterName,
        score: candidate.score,
        randomPassed: candidate.randomPassed,
        isExplicitTarget: candidate.isExplicitTarget,
        isReplyTarget: candidate.isReplyTarget,
        recentSpeakerIndex: candidate.recentSpeakerIndex,
        selectionDisposition:
          candidate.selectionDisposition as ReplyLogicGroupReplySelectionDisposition,
      }));
    } catch {
      return [];
    }
  }

  private async readGroupReplyArchiveStore(): Promise<GroupReplyTaskArchiveStore> {
    const raw = await this.systemConfig.getConfig(
      GROUP_REPLY_TASK_ARCHIVE_STATS_CONFIG_KEY,
    );
    if (!raw) {
      return normalizeGroupReplyTaskArchiveStore(null);
    }

    try {
      return normalizeGroupReplyTaskArchiveStore(JSON.parse(raw));
    } catch {
      // ignore invalid archived stats payload and recreate it
    }

    return normalizeGroupReplyTaskArchiveStore(null);
  }

  private toGroupReplyArchiveSummary(
    groupId: string,
    store: GroupReplyTaskArchiveStore,
  ): ReplyLogicGroupReplyArchiveSummary | null {
    const bucket = store.groups[groupId];
    if (!bucket || bucket.archivedTaskCount < 1) {
      return null;
    }

    return {
      archivedTaskCount: bucket.archivedTaskCount,
      archivedTurnCount: bucket.archivedTurnCount,
      statusCounts: { ...bucket.statusCounts },
      failureRate: calculateGroupReplyFailureRate(bucket.statusCounts),
      cancelRate: calculateGroupReplyCancelRate(bucket.statusCounts),
      trend: Object.values(bucket.dailyStats)
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-30)
        .map(
          (item): ReplyLogicGroupReplyArchiveTrendPoint => ({
            date: item.date,
            taskCount: item.taskCount,
            turnCount: item.turnCount,
            sentCount: item.statusCounts.sent,
            cancelledCount: item.statusCounts.cancelled,
            failedCount: item.statusCounts.failed,
            failureRate: calculateGroupReplyFailureRate(item.statusCounts),
            cancelRate: calculateGroupReplyCancelRate(item.statusCounts),
          }),
        ),
      actorSummary: Object.values(bucket.actorStats)
        .sort((left, right) => {
          const rightIssueCount =
            right.statusCounts.failed + right.statusCounts.cancelled;
          const leftIssueCount =
            left.statusCounts.failed + left.statusCounts.cancelled;
          if (rightIssueCount !== leftIssueCount) {
            return rightIssueCount - leftIssueCount;
          }
          return right.taskCount - left.taskCount;
        })
        .map(
          (item): ReplyLogicGroupReplyArchiveActorSummary => ({
            actorCharacterId: item.actorCharacterId,
            actorName: item.actorName,
            taskCount: item.taskCount,
            turnCount: item.turnCount,
            sentCount: item.statusCounts.sent,
            cancelledCount: item.statusCounts.cancelled,
            failedCount: item.statusCounts.failed,
            failureRate: calculateGroupReplyFailureRate(item.statusCounts),
            cancelRate: calculateGroupReplyCancelRate(item.statusCounts),
            issueRate:
              item.taskCount > 0
                ? (item.statusCounts.failed + item.statusCounts.cancelled) /
                  item.taskCount
                : 0,
            trend: Object.values(item.dailyStats)
              .sort((left, right) => left.date.localeCompare(right.date))
              .slice(-30)
              .map(
                (dailyItem): ReplyLogicGroupReplyArchiveTrendPoint => ({
                  date: dailyItem.date,
                  taskCount: dailyItem.taskCount,
                  turnCount: dailyItem.turnCount,
                  sentCount: dailyItem.statusCounts.sent,
                  cancelledCount: dailyItem.statusCounts.cancelled,
                  failedCount: dailyItem.statusCounts.failed,
                  failureRate: calculateGroupReplyFailureRate(
                    dailyItem.statusCounts,
                  ),
                  cancelRate: calculateGroupReplyCancelRate(
                    dailyItem.statusCounts,
                  ),
                }),
              ),
            issueSummary: item.issueSummary,
          }),
        ),
      issueSummary: bucket.issueSummary,
      lastArchivedAt: bucket.lastArchivedAt ?? null,
      lastCutoff: bucket.lastCutoff ?? null,
    };
  }

  private buildGroupReplyActorDriftSummary(
    recentTurns: ReplyLogicGroupReplyTurnSummary[],
    archiveSummary: ReplyLogicGroupReplyArchiveSummary | null,
  ): ReplyLogicGroupReplyActorDriftSummary[] {
    const actorRuntimeMap = new Map<
      string,
      {
        actorName: string;
        tasks: ReplyLogicGroupReplyTaskSummary[];
        turnIds: Set<string>;
        openTaskCount: number;
      }
    >();

    for (const turn of recentTurns) {
      for (const task of turn.tasks) {
        const actorRuntime = actorRuntimeMap.get(task.actorCharacterId) ?? {
          actorName: task.actorName,
          tasks: [],
          turnIds: new Set<string>(),
          openTaskCount: 0,
        };
        actorRuntime.actorName = task.actorName;
        actorRuntime.tasks.push(task);
        actorRuntime.turnIds.add(turn.turnId);
        if (task.status === 'pending' || task.status === 'processing') {
          actorRuntime.openTaskCount += 1;
        }
        actorRuntimeMap.set(task.actorCharacterId, actorRuntime);
      }
    }

    const groupBaseline =
      archiveSummary && archiveSummary.archivedTaskCount >= 12
        ? {
            source: 'group_archive' as const,
            taskCount: archiveSummary.archivedTaskCount,
            turnCount: archiveSummary.archivedTurnCount,
            failureRate: archiveSummary.failureRate,
            cancelRate: archiveSummary.cancelRate,
            issueRate: archiveSummary.failureRate + archiveSummary.cancelRate,
          }
        : null;

    return [...actorRuntimeMap.entries()]
      .map(([actorCharacterId, actorRuntime]) => {
        const terminalTasks = actorRuntime.tasks.filter(
          (task) =>
            task.status === 'sent' ||
            task.status === 'cancelled' ||
            task.status === 'failed',
        );
        const recentTaskCount = terminalTasks.length;
        const recentSentCount = terminalTasks.filter(
          (task) => task.status === 'sent',
        ).length;
        const recentCancelledCount = terminalTasks.filter(
          (task) => task.status === 'cancelled',
        ).length;
        const recentFailedCount = terminalTasks.filter(
          (task) => task.status === 'failed',
        ).length;
        const recentFailureRate =
          recentTaskCount > 0 ? recentFailedCount / recentTaskCount : 0;
        const recentCancelRate =
          recentTaskCount > 0 ? recentCancelledCount / recentTaskCount : 0;
        const recentIssueRate =
          recentTaskCount > 0
            ? (recentFailedCount + recentCancelledCount) / recentTaskCount
            : 0;
        const actorArchiveSummary =
          archiveSummary?.actorSummary.find(
            (actor) => actor.actorCharacterId === actorCharacterId,
          ) ?? null;
        const actorBaseline =
          actorArchiveSummary &&
          actorArchiveSummary.taskCount >= 6 &&
          actorArchiveSummary.turnCount >= 3
            ? {
                source: 'actor_archive' as const,
                taskCount: actorArchiveSummary.taskCount,
                turnCount: actorArchiveSummary.turnCount,
                failureRate: actorArchiveSummary.failureRate,
                cancelRate: actorArchiveSummary.cancelRate,
                issueRate: actorArchiveSummary.issueRate,
              }
            : null;
        const baseline = actorBaseline ?? groupBaseline;
        const baselineSource: ReplyLogicGroupReplyActorDriftSummary['baselineSource'] =
          baseline?.source ?? 'none';
        const baselineTaskCount = baseline?.taskCount ?? 0;
        const baselineTurnCount = baseline?.turnCount ?? 0;
        const baselineFailureRate = baseline?.failureRate ?? 0;
        const baselineCancelRate = baseline?.cancelRate ?? 0;
        const baselineIssueRate = baseline?.issueRate ?? 0;
        const failureRateDelta = recentFailureRate - baselineFailureRate;
        const cancelRateDelta = recentCancelRate - baselineCancelRate;
        const issueRateDelta = recentIssueRate - baselineIssueRate;

        return {
          actorCharacterId,
          actorName: actorRuntime.actorName,
          severity: this.classifyGroupReplyActorDrift({
            baselineSource,
            recentTaskCount,
            recentFailureRate,
            recentCancelRate,
            recentIssueRate,
            failureRateDelta,
            cancelRateDelta,
            issueRateDelta,
          }),
          baselineSource,
          recentTaskCount,
          recentTurnCount: actorRuntime.turnIds.size,
          openTaskCount: actorRuntime.openTaskCount,
          recentSentCount,
          recentCancelledCount,
          recentFailedCount,
          recentFailureRate,
          recentCancelRate,
          recentIssueRate,
          baselineTaskCount,
          baselineTurnCount,
          baselineFailureRate,
          baselineCancelRate,
          baselineIssueRate,
          failureRateDelta,
          cancelRateDelta,
          issueRateDelta,
          issueSummary: buildGroupReplyIssueSummaryFromTasks(
            terminalTasks.map((task) => ({
              status: task.status,
              cancelReason: task.cancelReason,
              errorMessage: task.errorMessage,
            })),
            3,
          ),
        };
      })
      .sort((left, right) => {
        const severityDelta =
          this.rankGroupReplyActorDriftSeverity(right.severity) -
          this.rankGroupReplyActorDriftSeverity(left.severity);
        if (severityDelta !== 0) {
          return severityDelta;
        }
        if (right.issueRateDelta !== left.issueRateDelta) {
          return right.issueRateDelta - left.issueRateDelta;
        }
        if (right.recentIssueRate !== left.recentIssueRate) {
          return right.recentIssueRate - left.recentIssueRate;
        }
        return right.recentTaskCount - left.recentTaskCount;
      });
  }

  private classifyGroupReplyActorDrift(input: {
    baselineSource: 'actor_archive' | 'group_archive' | 'none';
    recentTaskCount: number;
    recentFailureRate: number;
    recentCancelRate: number;
    recentIssueRate: number;
    failureRateDelta: number;
    cancelRateDelta: number;
    issueRateDelta: number;
  }): ReplyLogicGroupReplyActorDriftSummary['severity'] {
    if (input.recentTaskCount < 2) {
      return 'stable';
    }

    if (input.baselineSource === 'none') {
      if (
        input.recentTaskCount >= 3 &&
        (input.recentIssueRate >= 0.5 ||
          input.recentFailureRate >= 0.34 ||
          input.recentCancelRate >= 0.5)
      ) {
        return 'warning';
      }
      if (
        input.recentIssueRate >= 0.34 ||
        input.recentFailureRate >= 0.25 ||
        input.recentCancelRate >= 0.34
      ) {
        return 'watch';
      }
      return 'stable';
    }

    if (
      input.recentTaskCount >= 3 &&
      (input.issueRateDelta >= 0.25 ||
        input.failureRateDelta >= 0.2 ||
        input.cancelRateDelta >= 0.2)
    ) {
      return 'warning';
    }

    if (
      input.issueRateDelta >= 0.12 ||
      input.failureRateDelta >= 0.1 ||
      input.cancelRateDelta >= 0.1
    ) {
      return 'watch';
    }

    return 'stable';
  }

  private rankGroupReplyActorDriftSeverity(
    severity: ReplyLogicGroupReplyActorDriftSummary['severity'],
  ) {
    switch (severity) {
      case 'warning':
        return 2;
      case 'watch':
        return 1;
      default:
        return 0;
    }
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
    const participantIds =
      this.getStoredConversationParticipantIds(conversation);
    const characters = await this.characterRepo.find({
      where: { id: In(participantIds) },
    });
    const characterMap = new Map(
      characters.map((character) => [character.id, character.name]),
    );

    return {
      id: conversation.id,
      title: conversation.title,
      type: 'direct',
      source: 'conversation',
      participantIds,
      participantNames: participantIds.map(
        (participantId) => characterMap.get(participantId) ?? participantId,
      ),
      lastActivityAt: conversation.lastActivityAt?.toISOString() ?? null,
    };
  }

  private getStoredConversationParticipantIds(
    conversation: Pick<ConversationEntity, 'participants'>,
  ) {
    const normalizedIds = (conversation.participants ?? [])
      .map((participantId) => participantId.trim())
      .filter(Boolean);
    return normalizedIds.length > 0 ? [normalizedIds[0]] : [];
  }

  private toGroupConversationItem(
    group: GroupEntity,
    members: GroupMemberEntity[],
    characters: CharacterEntity[],
  ): ReplyLogicOverviewConversationItem {
    const characterMap = new Map(
      characters.map((character) => [character.id, character.name]),
    );

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
