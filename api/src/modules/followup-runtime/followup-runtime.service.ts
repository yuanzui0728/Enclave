import { createHash } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharacterEntity } from '../characters/character.entity';
import { CharactersService } from '../characters/characters.service';
import { SELF_CHARACTER_ID } from '../characters/default-characters';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageRemindersService } from '../chat/message-reminders.service';
import { MessageEntity } from '../chat/message.entity';
import { FriendRequestEntity } from '../social/friend-request.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { SocialService } from '../social/social.service';
import type {
  FollowupDirectThreadSnapshotValue,
  FollowupExtractedOpenLoopValue,
  FollowupOpenLoopRecordValue,
  FollowupRecommendationEventResultValue,
  FollowupRecommendationRecordValue,
  FollowupRecommendationRelationshipStateValue,
  FollowupRunRecordValue,
  FollowupRunStatusValue,
  FollowupRunTriggerTypeValue,
  FollowupRuntimeOverviewValue,
  FollowupRuntimeRulesValue,
  FollowupRuntimeStatsValue,
  FollowupSignalSnapshotValue,
  FollowupSignalThreadMessageValue,
} from './followup-runtime.types';
import { FollowupOpenLoopEntity } from './followup-open-loop.entity';
import { FollowupRecommendationEntity } from './followup-recommendation.entity';
import { FollowupRunEntity } from './followup-run.entity';
import { FollowupRuntimeRulesService } from './followup-runtime-rules.service';

const ACTIVE_FRIENDSHIP_STATUSES = new Set(['friend', 'close', 'best']);

type RunScanInput = {
  force?: boolean;
  triggerType?: FollowupRunTriggerTypeValue;
};

type TrackedJobResult = {
  summary: string;
};

type LoopSelectionDraft = {
  loop: FollowupExtractedOpenLoopValue;
  lastMentionedAt: Date;
  openLoopScore: number;
};

type RecommendationCandidate = {
  character: CharacterEntity;
  relationshipState: FollowupRecommendationRelationshipStateValue;
  friendship?: FriendshipEntity | null;
  pendingRequest?: FriendRequestEntity | null;
  score: number;
  matchReasons: string[];
};

@Injectable()
export class FollowupRuntimeService {
  private readonly logger = new Logger(FollowupRuntimeService.name);

  constructor(
    @InjectRepository(FollowupRunEntity)
    private readonly runRepo: Repository<FollowupRunEntity>,
    @InjectRepository(FollowupOpenLoopEntity)
    private readonly openLoopRepo: Repository<FollowupOpenLoopEntity>,
    @InjectRepository(FollowupRecommendationEntity)
    private readonly recommendationRepo: Repository<FollowupRecommendationEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
    @InjectRepository(FriendRequestEntity)
    private readonly friendRequestRepo: Repository<FriendRequestEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly rulesService: FollowupRuntimeRulesService,
    private readonly charactersService: CharactersService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly messageRemindersService: MessageRemindersService,
    private readonly socialService: SocialService,
  ) {}

  async getOverview(): Promise<FollowupRuntimeOverviewValue> {
    const [rules, recentRuns, activeOpenLoops, recentRecommendations, stats] =
      await Promise.all([
        this.rulesService.getRules(),
        this.runRepo.find({
          order: { startedAt: 'DESC', createdAt: 'DESC' },
          take: 20,
        }),
        this.openLoopRepo.find({
          where: {
            status: In(['open', 'watching', 'recommended']),
          },
          order: { updatedAt: 'DESC', createdAt: 'DESC' },
          take: 16,
        }),
        this.recommendationRepo.find({
          order: { updatedAt: 'DESC', createdAt: 'DESC' },
          take: 20,
        }),
        this.buildStats(),
      ]);

    return {
      rules,
      stats,
      recentRuns: recentRuns.map((item) => this.toRunRecord(item)),
      activeOpenLoops: activeOpenLoops.map((item) =>
        this.toOpenLoopRecord(item),
      ),
      recentRecommendations: recentRecommendations.map((item) =>
        this.toRecommendationRecord(item),
      ),
    };
  }

  async getRules(): Promise<FollowupRuntimeRulesValue> {
    return this.rulesService.getRules();
  }

  async setRules(
    patch: Partial<FollowupRuntimeRulesValue>,
  ): Promise<FollowupRuntimeRulesValue> {
    return this.rulesService.setRules(patch);
  }

  async runSchedulerScan(options?: {
    force?: boolean;
  }): Promise<TrackedJobResult> {
    return this.runScan({
      force: options?.force,
      triggerType: options?.force ? 'manual' : 'scheduler',
    });
  }

  async markRecommendationOpened(
    recommendationId: string,
  ): Promise<FollowupRecommendationEventResultValue> {
    const recommendation = await this.requireRecommendation(recommendationId);
    if (!recommendation.openedAt) {
      recommendation.openedAt = new Date();
    }
    if (recommendation.status === 'draft' || recommendation.status === 'sent') {
      recommendation.status = 'opened';
    }

    const saved = await this.recommendationRepo.save(recommendation);
    return this.toRecommendationEventResult(saved);
  }

  async markRecommendationFriendRequestPending(
    recommendationId: string,
    friendRequestId: string,
  ): Promise<FollowupRecommendationEventResultValue> {
    const normalizedFriendRequestId = friendRequestId.trim();
    if (!normalizedFriendRequestId) {
      throw new BadRequestException('friendRequestId is required');
    }

    const recommendation = await this.requireRecommendation(recommendationId);
    if (!recommendation.openedAt) {
      recommendation.openedAt = new Date();
    }
    if (!recommendation.friendRequestStartedAt) {
      recommendation.friendRequestStartedAt = new Date();
    }
    recommendation.friendRequestId = normalizedFriendRequestId;
    recommendation.status = 'friend_request_pending';
    const saved = await this.recommendationRepo.save(recommendation);
    return this.toRecommendationEventResult(saved);
  }

  async markRecommendationChatStarted(
    recommendationId: string,
  ): Promise<FollowupRecommendationEventResultValue> {
    const recommendation = await this.requireRecommendation(recommendationId);
    const now = new Date();
    if (!recommendation.openedAt) {
      recommendation.openedAt = now;
    }
    recommendation.chatStartedAt = now;
    recommendation.resolvedAt = now;
    recommendation.status = 'chat_started';
    const saved = await this.recommendationRepo.save(recommendation);
    await this.markOpenLoopResolved(recommendation.openLoopId, now);
    return this.toRecommendationEventResult(saved);
  }

  async handleFriendRequestAccepted(input: {
    requestId: string;
    acceptedAt: Date;
  }) {
    const recommendation = await this.recommendationRepo.findOneBy({
      friendRequestId: input.requestId,
    });
    if (!recommendation) {
      return;
    }

    recommendation.relationshipState = 'friend';
    recommendation.friendAddedAt = input.acceptedAt;
    recommendation.status = 'friend_added';
    await this.recommendationRepo.save(recommendation);
  }

  async handleFriendRequestDeclined(input: {
    requestId: string;
    declinedAt: Date;
  }) {
    const recommendation = await this.recommendationRepo.findOneBy({
      friendRequestId: input.requestId,
    });
    if (!recommendation) {
      return;
    }

    recommendation.dismissedAt = input.declinedAt;
    recommendation.status = 'dismissed';
    await this.recommendationRepo.save(recommendation);
    await this.reopenOpenLoopIfNeeded(recommendation.openLoopId);
  }

  async handleFriendRequestExpired(input: {
    requestId: string;
    expiredAt: Date;
  }) {
    const recommendation = await this.recommendationRepo.findOneBy({
      friendRequestId: input.requestId,
    });
    if (!recommendation) {
      return;
    }

    recommendation.status = 'expired';
    await this.recommendationRepo.save(recommendation);
    await this.reopenOpenLoopIfNeeded(
      recommendation.openLoopId,
      input.expiredAt,
    );
  }

  private async runScan(input: RunScanInput): Promise<TrackedJobResult> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const rules = await this.rulesService.getRules();
    const now = new Date();
    const lookbackStart = new Date(
      now.getTime() - rules.lookbackHours * 60 * 60 * 1000,
    );
    const run = await this.runRepo.save(
      this.runRepo.create({
        triggerType: input.triggerType ?? 'scheduler',
        status: 'skipped',
        startedAt: now,
        sourceWindowStartedAt: lookbackStart,
        sourceWindowEndedAt: now,
        candidateLoopCount: 0,
        selectedLoopCount: 0,
        emittedRecommendationCount: 0,
      }),
    );

    try {
      const lastSuccess = await this.runRepo.findOne({
        where: {
          status: 'success',
        },
        order: { startedAt: 'DESC', createdAt: 'DESC' },
      });

      if (!input.force && !rules.enabled) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '当前主动跟进在后台被停用。',
          summary: rules.textTemplates.jobSummarySkippedDisabled,
        });
      }

      if (
        !input.force &&
        lastSuccess?.finishedAt &&
        now.getTime() - lastSuccess.finishedAt.getTime() <
          rules.scanIntervalMinutes * 60 * 1000
      ) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '尚未达到下一次主动跟进扫描窗口。',
          summary: '未到下次扫描时间，跳过本次主动跟进。',
        });
      }

      const signalSnapshot = await this.collectSignalSnapshot(
        owner.id,
        lookbackStart,
        now,
        rules,
      );
      run.inputSnapshot = signalSnapshot as unknown as Record<string, unknown>;
      await this.runRepo.save(run);

      if (
        signalSnapshot.directThreads.length === 0 &&
        signalSnapshot.reminders.length === 0
      ) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '当前窗口没有合适的安静线程或手动提醒。',
          summary: rules.textTemplates.jobSummarySkippedNoSignals,
        });
      }

      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const todayRecommendationCount = await this.recommendationRepo.count({
        where: {
          createdAt: MoreThanOrEqual(startOfDay),
          status: Not('draft'),
        },
      });
      if (
        !input.force &&
        todayRecommendationCount >= rules.dailyRecommendationLimit
      ) {
        return this.finishRun(run, {
          status: 'skipped',
          skipReason: '今日推荐次数已到上限。',
          summary: `今日已发出 ${todayRecommendationCount} 条主动跟进推荐。`,
        });
      }

      const extraction = await this.extractOpenLoops(
        signalSnapshot,
        owner.id,
        rules,
      );
      run.promptSnapshot = {
        openLoopExtractionPrompt:
          rules.promptTemplates.openLoopExtractionPrompt,
        handoffMessagePrompt: rules.promptTemplates.handoffMessagePrompt,
        friendRequestGreetingPrompt:
          rules.promptTemplates.friendRequestGreetingPrompt,
        friendRequestNoticePrompt:
          rules.promptTemplates.friendRequestNoticePrompt,
      };
      run.llmOutputPayload = extraction as unknown as Record<string, unknown>;
      const loops = this.normalizeExtractedLoops(
        extraction.loops,
        signalSnapshot,
        rules,
      );
      run.candidateLoopCount = loops.length;
      await this.runRepo.save(run);

      const selectedLoops = await this.selectEligibleLoops(loops, rules, now);
      run.selectedLoopCount = selectedLoops.length;
      await this.runRepo.save(run);

      let emittedCount = 0;
      let autoStartedFriendRequestCount = 0;
      let remainingBudget = Math.max(
        0,
        rules.dailyRecommendationLimit - todayRecommendationCount,
      );

      for (const draft of selectedLoops.slice(
        0,
        rules.maxRecommendationsPerRun,
      )) {
        if (remainingBudget <= 0) {
          break;
        }

        const candidate = await this.resolveRecommendationCandidate(
          owner.id,
          draft.loop,
          rules,
          now,
        );
        if (!candidate) {
          continue;
        }

        const openLoop = await this.openLoopRepo.save(
          this.openLoopRepo.create({
            topicKey: draft.loop.topicKey,
            status:
              rules.executionMode === 'emit_messages'
                ? 'recommended'
                : 'watching',
            summary: draft.loop.summary,
            sourceThreadId: draft.loop.sourceThreadId,
            sourceThreadType: draft.loop.sourceThreadType,
            sourceThreadTitle: draft.loop.sourceThreadTitle ?? null,
            sourceMessageId: draft.loop.sourceMessageId ?? null,
            sourceCharacterIds: draft.loop.sourceCharacterIds,
            domainHints: draft.loop.domainHints,
            targetRelationshipType: draft.loop.targetRelationshipType ?? null,
            urgencyScore: draft.loop.urgencyScore,
            closureScore: draft.loop.closureScore,
            handoffNeedScore: draft.loop.handoffNeedScore,
            reasonSummary: draft.loop.reasonSummary ?? null,
            lastMentionedAt: draft.lastMentionedAt,
            recommendedAt: rules.executionMode === 'emit_messages' ? now : null,
          }),
        );

        const recommendation = await this.recommendationRepo.save(
          this.recommendationRepo.create({
            openLoopId: openLoop.id,
            runId: run.id,
            status: rules.executionMode === 'emit_messages' ? 'sent' : 'draft',
            recommenderCharacterId: SELF_CHARACTER_ID,
            recommenderCharacterName: '我自己',
            targetCharacterId: candidate.character.id,
            targetCharacterName: candidate.character.name,
            targetCharacterAvatar: candidate.character.avatar,
            targetCharacterRelationship: candidate.character.relationship,
            relationshipState: candidate.relationshipState,
            reasonSummary:
              draft.loop.reasonSummary ??
              `${candidate.character.name}更适合接住这个话题。`,
            sourceThreadId: draft.loop.sourceThreadId,
            sourceThreadType: draft.loop.sourceThreadType,
            sourceThreadTitle: draft.loop.sourceThreadTitle ?? null,
            sourceMessageId: draft.loop.sourceMessageId ?? null,
          }),
        );

        if (rules.executionMode !== 'emit_messages') {
          continue;
        }

        let startedFriendRequest: FriendRequestEntity | null = null;
        let badgeLabel = rules.textTemplates.recommendationBadge;

        if (
          rules.autoSendFriendRequestToNotFriend &&
          candidate.relationshipState === 'not_friend'
        ) {
          try {
            startedFriendRequest = await this.startFollowupFriendRequest({
              loop: draft.loop,
              candidate,
              rules,
              ownerId: owner.id,
            });
            recommendation.friendRequestId = startedFriendRequest.id;
            recommendation.friendRequestStartedAt =
              startedFriendRequest.createdAt ?? new Date();
            recommendation.relationshipState = 'pending';
            recommendation.status = 'friend_request_pending';
            badgeLabel = rules.textTemplates.friendRequestBadge;
          } catch (error) {
            this.logger.warn(
              'Failed to auto-start followup friend request, falling back to recommendation message',
              {
                recommendationId: recommendation.id,
                targetCharacterId: candidate.character.id,
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }
        }

        try {
          const handoffMessage = startedFriendRequest
            ? await this.buildFriendRequestNoticeMessage({
                loop: draft.loop,
                candidate,
                rules,
                ownerId: owner.id,
              })
            : await this.buildHandoffMessage({
                loop: draft.loop,
                candidate,
                rules,
                ownerId: owner.id,
              });
          recommendation.handoffSummary = handoffMessage;
          const conversation =
            await this.chatService.getOrCreateConversation(SELF_CHARACTER_ID);
          const textMessage = await this.chatGateway.sendProactiveMessage(
            conversation.id,
            SELF_CHARACTER_ID,
            '我自己',
            handoffMessage,
          );
          const cardMessage =
            await this.chatGateway.sendProactiveAttachmentMessage(
              conversation.id,
              SELF_CHARACTER_ID,
              '我自己',
              {
                kind: 'contact_card',
                characterId: candidate.character.id,
                name: candidate.character.name,
                avatar: candidate.character.avatar,
                relationship: candidate.character.relationship,
                bio: candidate.character.bio,
                recommendationMetadata: {
                  recommendationId: recommendation.id,
                  reasonSummary: recommendation.reasonSummary,
                  sourceThreadId: recommendation.sourceThreadId,
                  sourceThreadType: recommendation.sourceThreadType as
                    | 'direct'
                    | 'group',
                  sourceThreadTitle: recommendation.sourceThreadTitle ?? null,
                  sourceMessageId: recommendation.sourceMessageId ?? null,
                  relationshipState: recommendation.relationshipState as
                    | 'friend'
                    | 'pending'
                    | 'not_friend',
                  badgeLabel,
                },
              },
              `[名片] ${candidate.character.name}`,
            );

          recommendation.messageConversationId = conversation.id;
          recommendation.messageId = textMessage.id;
          recommendation.cardMessageId = cardMessage.id;
          await this.recommendationRepo.save(recommendation);
          emittedCount += 1;
          remainingBudget -= 1;
          if (startedFriendRequest) {
            autoStartedFriendRequestCount += 1;
          }
        } catch (error) {
          if (startedFriendRequest) {
            await this.recommendationRepo.save(recommendation);
            emittedCount += 1;
            remainingBudget -= 1;
            autoStartedFriendRequestCount += 1;
            this.logger.warn(
              'Followup friend request started but owner notification failed',
              {
                recommendationId: recommendation.id,
                friendRequestId: startedFriendRequest.id,
                error: error instanceof Error ? error.message : String(error),
              },
            );
            continue;
          }

          recommendation.status = 'draft';
          recommendation.handoffSummary = null;
          await this.recommendationRepo.save(recommendation);
          openLoop.status = 'watching';
          openLoop.recommendedAt = null;
          await this.openLoopRepo.save(openLoop);
          this.logger.warn('Failed to emit followup recommendation', {
            recommendationId: recommendation.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return this.finishRun(run, {
        status: 'success',
        emittedRecommendationCount: emittedCount,
        summary: renderTemplate(rules.textTemplates.jobSummarySuccess, {
          candidateLoopCount: run.candidateLoopCount,
          selectedLoopCount: run.selectedLoopCount,
          emittedRecommendationCount: emittedCount,
          autoStartedFriendRequestCount,
        }),
      });
    } catch (error) {
      return this.finishRun(run, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        summary: '主动跟进执行失败。',
      });
    }
  }

  private async buildStats(): Promise<FollowupRuntimeStatsValue> {
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      activeOpenLoopCount,
      recommendedOpenLoopCount,
      sentRecommendationCount,
      openedRecommendationCount,
      friendRequestPendingCount,
      friendAddedCount,
      recentRunCount,
    ] = await Promise.all([
      this.openLoopRepo.count({
        where: {
          status: In(['open', 'watching']),
        },
      }),
      this.openLoopRepo.count({
        where: { status: 'recommended' },
      }),
      this.recommendationRepo.count({
        where: {
          status: In([
            'sent',
            'opened',
            'friend_request_pending',
            'friend_added',
            'chat_started',
            'resolved',
          ]),
        },
      }),
      this.recommendationRepo.count({
        where: {
          status: In([
            'opened',
            'friend_request_started',
            'friend_request_pending',
            'friend_added',
            'chat_started',
            'resolved',
          ]),
        },
      }),
      this.recommendationRepo.count({
        where: {
          status: 'friend_request_pending',
        },
      }),
      this.recommendationRepo.count({
        where: {
          status: In(['friend_added', 'chat_started', 'resolved']),
        },
      }),
      this.runRepo.count({
        where: {
          createdAt: MoreThanOrEqual(weekStart),
        },
      }),
    ]);

    return {
      activeOpenLoopCount,
      recommendedOpenLoopCount,
      sentRecommendationCount,
      openedRecommendationCount,
      friendRequestPendingCount,
      friendAddedCount,
      recentRunCount,
    };
  }

  private async collectSignalSnapshot(
    ownerId: string,
    windowStartedAt: Date,
    now: Date,
    rules: FollowupRuntimeRulesValue,
  ): Promise<FollowupSignalSnapshotValue> {
    const quietBefore = new Date(
      now.getTime() - rules.quietHoursThreshold * 60 * 60 * 1000,
    );
    const conversations = await this.conversationRepo.find({
      where: {
        ownerId,
        type: 'direct',
        lastActivityAt: Between(windowStartedAt, quietBefore),
      },
      order: { lastActivityAt: 'DESC', updatedAt: 'DESC' },
      take: 24,
    });
    const characters =
      await this.charactersService.findAllVisibleToOwner(ownerId);
    const characterMap = new Map(characters.map((item) => [item.id, item]));
    const directThreads: FollowupDirectThreadSnapshotValue[] = [];

    for (const conversation of conversations) {
      const sourceCharacterId = conversation.participants.find(
        (participantId) => participantId !== SELF_CHARACTER_ID,
      );
      if (!sourceCharacterId) {
        continue;
      }

      const messages = await this.messageRepo.find({
        where: {
          conversationId: conversation.id,
          createdAt: MoreThanOrEqual(windowStartedAt),
        },
        order: { createdAt: 'DESC' },
        take: rules.maxSourceMessagesPerThread,
      });
      if (!messages.length) {
        continue;
      }

      const sourceCharacter = characterMap.get(sourceCharacterId);
      directThreads.push({
        threadId: conversation.id,
        threadTitle: conversation.title,
        sourceCharacterId,
        sourceCharacterName:
          sourceCharacter?.name ?? conversation.title ?? sourceCharacterId,
        lastActivityAt: conversation.lastActivityAt.toISOString(),
        messages: messages
          .reverse()
          .map((message) => this.toSignalMessage(message)),
      });
    }

    const reminders = (
      await this.messageRemindersService.listMessageReminders()
    )
      .filter((item) => item.threadType === 'direct' && !item.notifiedAt)
      .map((item) => ({
        sourceId: item.sourceId,
        threadId: item.threadId,
        threadType: item.threadType,
        threadTitle: item.threadTitle,
        messageId: item.messageId,
        remindAt: item.remindAt,
        previewText: item.previewText,
      }));

    const domainCatalog = Array.from(
      new Set(
        characters
          .flatMap((character) => character.expertDomains ?? [])
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).slice(0, 120);

    return {
      directThreads,
      reminders,
      domainCatalog,
    };
  }

  private async extractOpenLoops(
    signalSnapshot: FollowupSignalSnapshotValue,
    ownerId: string,
    rules: FollowupRuntimeRulesValue,
  ): Promise<{ loops: unknown[] }> {
    const prompt = [
      rules.promptTemplates.openLoopExtractionPrompt,
      '',
      '最近安静下来的私聊线程：',
      serializeDirectThreads(signalSnapshot.directThreads),
      '',
      '手动消息提醒：',
      serializeReminders(signalSnapshot),
      '',
      '世界内可复用领域标签：',
      signalSnapshot.domainCatalog.length
        ? signalSnapshot.domainCatalog.join('、')
        : '暂无',
    ].join('\n');

    const response = await this.ai.generateJsonObject({
      prompt,
      usageContext: {
        surface: 'admin',
        scene: 'followup_runtime_open_loop_extract',
        scopeType: 'admin_task',
        scopeId: 'followup-runtime',
        scopeLabel: '主动跟进',
        ownerId,
      },
      maxTokens: 1800,
      temperature: 0.1,
      fallback: { loops: [] },
    });

    return {
      loops: Array.isArray(response.loops) ? response.loops : [],
    };
  }

  private normalizeExtractedLoops(
    loops: unknown[],
    signalSnapshot: FollowupSignalSnapshotValue,
    rules: FollowupRuntimeRulesValue,
  ) {
    const threadMap = new Map(
      signalSnapshot.directThreads.map((thread) => [thread.threadId, thread]),
    );
    const reminderMap = new Map(
      signalSnapshot.reminders.map((item) => [item.threadId, item]),
    );

    const normalized: LoopSelectionDraft[] = [];

    for (const item of loops) {
      const raw = item as Partial<FollowupExtractedOpenLoopValue>;
      const sourceThreadId = normalizeText(raw.sourceThreadId);
      if (!sourceThreadId) {
        continue;
      }

      const thread = threadMap.get(sourceThreadId);
      const reminder = reminderMap.get(sourceThreadId);
      const sourceThreadType =
        raw.sourceThreadType === 'group'
          ? 'group'
          : thread?.threadId || reminder?.threadId
            ? 'direct'
            : null;
      if (!sourceThreadType) {
        continue;
      }

      const summary = normalizeText(raw.summary);
      if (!summary) {
        continue;
      }

      const sourceCharacterIds = normalizeStringArray(raw.sourceCharacterIds);
      if (thread?.sourceCharacterId && !sourceCharacterIds.length) {
        sourceCharacterIds.push(thread.sourceCharacterId);
      }

      const domainHints = normalizeStringArray(raw.domainHints).slice(0, 6);
      const urgencyScore = clampScore(raw.urgencyScore);
      const closureScore = clampScore(raw.closureScore);
      const handoffNeedScore = clampScore(raw.handoffNeedScore);
      const topicKey =
        normalizeText(raw.topicKey) ??
        createStableTopicKey(`${sourceThreadId}:${summary}`);
      const sourceMessageId =
        normalizeText(raw.sourceMessageId) ??
        thread?.messages[thread.messages.length - 1]?.id ??
        reminder?.messageId ??
        null;
      const lastMentionedAt = new Date(
        thread?.messages[thread.messages.length - 1]?.createdAt ??
          reminder?.remindAt ??
          new Date().toISOString(),
      );
      const openLoopScore = computeOpenLoopScore({
        urgencyScore,
        closureScore,
        handoffNeedScore,
      });
      if (
        openLoopScore < rules.minOpenLoopScore ||
        handoffNeedScore < rules.minHandoffNeedScore
      ) {
        continue;
      }

      normalized.push({
        loop: {
          topicKey,
          summary,
          sourceThreadId,
          sourceThreadType,
          sourceThreadTitle:
            normalizeText(raw.sourceThreadTitle) ??
            thread?.threadTitle ??
            reminder?.threadTitle ??
            undefined,
          sourceMessageId,
          sourceCharacterIds,
          domainHints,
          targetRelationshipType: normalizeText(raw.targetRelationshipType),
          urgencyScore,
          closureScore,
          handoffNeedScore,
          reasonSummary: normalizeText(raw.reasonSummary),
        },
        lastMentionedAt,
        openLoopScore,
      });
    }

    return normalized
      .sort((left, right) => right.openLoopScore - left.openLoopScore)
      .slice(0, rules.maxOpenLoopsPerRun);
  }

  private async selectEligibleLoops(
    loops: LoopSelectionDraft[],
    rules: FollowupRuntimeRulesValue,
    now: Date,
  ) {
    if (loops.length === 0) {
      return [];
    }

    const topicKeys = Array.from(
      new Set(loops.map((item) => item.loop.topicKey)),
    );
    const cooldownStart = new Date(
      now.getTime() - rules.sameTopicCooldownHours * 60 * 60 * 1000,
    );
    const existingLoops = await this.openLoopRepo.find({
      where: {
        topicKey: In(topicKeys),
        updatedAt: MoreThanOrEqual(cooldownStart),
      },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
    const blockedTopicKeys = new Set(
      existingLoops.map((item) => item.topicKey),
    );

    return loops.filter((item) => !blockedTopicKeys.has(item.loop.topicKey));
  }

  private async resolveRecommendationCandidate(
    ownerId: string,
    loop: FollowupExtractedOpenLoopValue,
    rules: FollowupRuntimeRulesValue,
    now: Date,
  ): Promise<RecommendationCandidate | null> {
    const [characters, friendships, pendingRequests, recentRecommendations] =
      await Promise.all([
        this.charactersService.findAllVisibleToOwner(ownerId),
        this.friendshipRepo.find({
          where: {
            ownerId,
            status: Not(In(['blocked', 'removed'])),
          },
        }),
        this.friendRequestRepo.find({
          where: {
            ownerId,
            status: 'pending',
          },
        }),
        this.recommendationRepo.find({
          where: {
            createdAt: MoreThanOrEqual(
              new Date(
                now.getTime() - rules.sameTopicCooldownHours * 60 * 60 * 1000,
              ),
            ),
          },
        }),
      ]);

    const friendshipMap = new Map(
      friendships.map((item) => [item.characterId, item]),
    );
    const pendingRequestMap = new Map(
      pendingRequests.map((item) => [item.characterId, item]),
    );
    const recentRecommendationTargets = new Set(
      recentRecommendations.map((item) => item.targetCharacterId),
    );
    const loopDomains = new Set(loop.domainHints.map(normalizeDomainKey));
    const sourceCharacterIds = new Set(loop.sourceCharacterIds);
    const candidates = characters
      .filter((character) => character.id !== SELF_CHARACTER_ID)
      .map((character) => {
        const friendship = friendshipMap.get(character.id) ?? null;
        const pendingRequest = pendingRequestMap.get(character.id) ?? null;
        const relationshipState: FollowupRecommendationRelationshipStateValue =
          friendship && ACTIVE_FRIENDSHIP_STATUSES.has(friendship.status)
            ? 'friend'
            : pendingRequest
              ? 'pending'
              : 'not_friend';
        const overlap = computeDomainOverlap(
          loopDomains,
          character.expertDomains,
        );
        const relationshipMatch =
          normalizeText(loop.targetRelationshipType) &&
          normalizeText(character.relationshipType) ===
            normalizeText(loop.targetRelationshipType);
        let score =
          0.22 +
          loop.handoffNeedScore * 0.3 +
          loop.urgencyScore * 0.18 +
          (1 - loop.closureScore) * 0.14 +
          overlap * rules.candidateWeights.domainMatchWeight;
        const matchReasons: string[] = [];

        if (relationshipState === 'friend') {
          score += rules.candidateWeights.existingFriendBoost;
          matchReasons.push('已有好友，能直接细聊');
        }

        if (relationshipMatch) {
          score += rules.candidateWeights.relationshipMatchWeight;
          matchReasons.push('关系定位匹配');
        }

        if (overlap > 0) {
          matchReasons.push(`领域重合度 ${Math.round(overlap * 100)}%`);
        }

        if (sourceCharacterIds.has(character.id)) {
          score -= rules.candidateWeights.sameSourcePenalty;
        }

        if (relationshipState === 'pending') {
          score -= rules.candidateWeights.pendingRequestPenalty;
        }

        if (recentRecommendationTargets.has(character.id)) {
          score -= rules.candidateWeights.recentRecommendationPenalty;
        }

        return {
          character,
          friendship,
          pendingRequest,
          relationshipState,
          score,
          matchReasons,
        } satisfies RecommendationCandidate;
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return (
          relationshipPriority(right.relationshipState) -
          relationshipPriority(left.relationshipState)
        );
      });

    const best = candidates[0] ?? null;
    if (!best || best.score <= 0) {
      return null;
    }

    return best;
  }

  private async buildHandoffMessage(input: {
    loop: FollowupExtractedOpenLoopValue;
    candidate: RecommendationCandidate;
    rules: FollowupRuntimeRulesValue;
    ownerId: string;
  }) {
    const prompt = renderTemplate(
      input.rules.promptTemplates.handoffMessagePrompt,
      {
        loopSummary: input.loop.summary,
        sourceThreadTitle:
          input.loop.sourceThreadTitle ?? input.loop.sourceThreadId,
        targetCharacterName: input.candidate.character.name,
        targetCharacterRelationship:
          input.candidate.character.relationship || '更合适的人',
        reasonSummary:
          input.loop.reasonSummary ??
          (input.candidate.matchReasons.join('，') ||
            `${input.candidate.character.name}更适合继续接住这个话题。`),
      },
    );
    const fallback = renderTemplate(input.rules.textTemplates.fallbackMessage, {
      targetCharacterName: input.candidate.character.name,
    });
    const text = await this.ai.generatePlainText({
      prompt,
      usageContext: {
        surface: 'app',
        scene: 'followup_runtime_handoff_message',
        scopeType: 'character',
        scopeId: SELF_CHARACTER_ID,
        scopeLabel: '我自己',
        ownerId: input.ownerId,
        characterId: SELF_CHARACTER_ID,
        characterName: '我自己',
      },
      maxTokens: 160,
      temperature: 0.45,
      fallback,
    });

    return sanitizeHandoffText(text || fallback);
  }

  private async startFollowupFriendRequest(input: {
    loop: FollowupExtractedOpenLoopValue;
    candidate: RecommendationCandidate;
    rules: FollowupRuntimeRulesValue;
    ownerId: string;
  }) {
    const prompt = renderTemplate(
      input.rules.promptTemplates.friendRequestGreetingPrompt,
      {
        loopSummary: input.loop.summary,
        sourceThreadTitle:
          input.loop.sourceThreadTitle ?? input.loop.sourceThreadId,
        targetCharacterName: input.candidate.character.name,
        targetCharacterRelationship:
          input.candidate.character.relationship || '更合适的人',
        reasonSummary:
          input.loop.reasonSummary ??
          (input.candidate.matchReasons.join('，') ||
            `${input.candidate.character.name}更适合继续接住这个话题。`),
      },
    );
    const fallback = renderTemplate(
      input.rules.textTemplates.friendRequestFallbackGreeting,
      {
        loopSummary: input.loop.summary,
        sourceThreadTitle:
          input.loop.sourceThreadTitle ?? input.loop.sourceThreadId,
        targetCharacterName: input.candidate.character.name,
        targetCharacterRelationship:
          input.candidate.character.relationship || '更合适的人',
        reasonSummary:
          input.loop.reasonSummary ??
          (input.candidate.matchReasons.join('，') ||
            `${input.candidate.character.name}更适合继续接住这个话题。`),
      },
    );
    const text = await this.ai.generatePlainText({
      prompt,
      usageContext: {
        surface: 'app',
        scene: 'followup_runtime_friend_request_greeting',
        scopeType: 'character',
        scopeId: SELF_CHARACTER_ID,
        scopeLabel: '我自己',
        ownerId: input.ownerId,
        characterId: SELF_CHARACTER_ID,
        characterName: '我自己',
      },
      maxTokens: 120,
      temperature: 0.45,
      fallback,
    });

    return this.socialService.sendFriendRequest(
      input.candidate.character.id,
      sanitizeFriendRequestGreeting(text || fallback),
      {
        triggerScene: 'followup_runtime',
      },
    );
  }

  private async buildFriendRequestNoticeMessage(input: {
    loop: FollowupExtractedOpenLoopValue;
    candidate: RecommendationCandidate;
    rules: FollowupRuntimeRulesValue;
    ownerId: string;
  }) {
    const prompt = renderTemplate(
      input.rules.promptTemplates.friendRequestNoticePrompt,
      {
        loopSummary: input.loop.summary,
        sourceThreadTitle:
          input.loop.sourceThreadTitle ?? input.loop.sourceThreadId,
        targetCharacterName: input.candidate.character.name,
        targetCharacterRelationship:
          input.candidate.character.relationship || '更合适的人',
        reasonSummary:
          input.loop.reasonSummary ??
          (input.candidate.matchReasons.join('，') ||
            `${input.candidate.character.name}更适合继续接住这个话题。`),
      },
    );
    const fallback = renderTemplate(
      input.rules.textTemplates.friendRequestFallbackMessage,
      {
        loopSummary: input.loop.summary,
        sourceThreadTitle:
          input.loop.sourceThreadTitle ?? input.loop.sourceThreadId,
        targetCharacterName: input.candidate.character.name,
        targetCharacterRelationship:
          input.candidate.character.relationship || '更合适的人',
        reasonSummary:
          input.loop.reasonSummary ??
          (input.candidate.matchReasons.join('，') ||
            `${input.candidate.character.name}更适合继续接住这个话题。`),
      },
    );
    const text = await this.ai.generatePlainText({
      prompt,
      usageContext: {
        surface: 'app',
        scene: 'followup_runtime_friend_request_notice',
        scopeType: 'character',
        scopeId: SELF_CHARACTER_ID,
        scopeLabel: '我自己',
        ownerId: input.ownerId,
        characterId: SELF_CHARACTER_ID,
        characterName: '我自己',
      },
      maxTokens: 160,
      temperature: 0.45,
      fallback,
    });

    return sanitizeHandoffText(text || fallback);
  }

  private async finishRun(
    run: FollowupRunEntity,
    input: {
      status: FollowupRunStatusValue;
      summary: string;
      skipReason?: string;
      errorMessage?: string;
      emittedRecommendationCount?: number;
    },
  ): Promise<TrackedJobResult> {
    run.status = input.status;
    run.summary = input.summary;
    run.skipReason = input.skipReason ?? null;
    run.errorMessage = input.errorMessage ?? null;
    run.emittedRecommendationCount = input.emittedRecommendationCount ?? 0;
    run.finishedAt = new Date();
    await this.runRepo.save(run);
    return { summary: input.summary };
  }

  private async requireRecommendation(recommendationId: string) {
    const recommendation = await this.recommendationRepo.findOneBy({
      id: recommendationId,
    });
    if (!recommendation) {
      throw new NotFoundException(
        `Followup recommendation ${recommendationId} not found`,
      );
    }
    return recommendation;
  }

  private async markOpenLoopResolved(openLoopId: string, resolvedAt: Date) {
    const openLoop = await this.openLoopRepo.findOneBy({ id: openLoopId });
    if (!openLoop) {
      return;
    }

    openLoop.status = 'resolved';
    openLoop.resolvedAt = resolvedAt;
    await this.openLoopRepo.save(openLoop);
  }

  private async reopenOpenLoopIfNeeded(openLoopId: string, at?: Date) {
    const openLoop = await this.openLoopRepo.findOneBy({ id: openLoopId });
    if (!openLoop) {
      return;
    }

    if (openLoop.status === 'resolved') {
      return;
    }

    openLoop.status = 'watching';
    openLoop.recommendedAt = at ?? openLoop.recommendedAt ?? new Date();
    await this.openLoopRepo.save(openLoop);
  }

  private toSignalMessage(
    message: MessageEntity,
  ): FollowupSignalThreadMessageValue {
    return {
      id: message.id,
      senderType:
        (message.senderType as 'user' | 'character' | 'system') ?? 'system',
      senderId: message.senderId,
      senderName: message.senderName,
      text: sanitizeSignalText(message.text),
      createdAt: message.createdAt.toISOString(),
    };
  }

  private toRunRecord(item: FollowupRunEntity): FollowupRunRecordValue {
    return {
      id: item.id,
      triggerType: item.triggerType as FollowupRunTriggerTypeValue,
      status: item.status as FollowupRunStatusValue,
      startedAt: item.startedAt.toISOString(),
      finishedAt: item.finishedAt?.toISOString() ?? null,
      sourceWindowStartedAt: item.sourceWindowStartedAt?.toISOString() ?? null,
      sourceWindowEndedAt: item.sourceWindowEndedAt?.toISOString() ?? null,
      candidateLoopCount: item.candidateLoopCount,
      selectedLoopCount: item.selectedLoopCount,
      emittedRecommendationCount: item.emittedRecommendationCount,
      summary: item.summary ?? null,
      skipReason: item.skipReason ?? null,
      errorMessage: item.errorMessage ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private toOpenLoopRecord(
    item: FollowupOpenLoopEntity,
  ): FollowupOpenLoopRecordValue {
    return {
      id: item.id,
      topicKey: item.topicKey,
      status: item.status as FollowupOpenLoopRecordValue['status'],
      summary: item.summary,
      sourceThreadId: item.sourceThreadId,
      sourceThreadType: item.sourceThreadType as 'direct' | 'group',
      sourceThreadTitle: item.sourceThreadTitle ?? null,
      sourceMessageId: item.sourceMessageId ?? null,
      sourceCharacterIds: item.sourceCharacterIds ?? [],
      domainHints: item.domainHints ?? [],
      targetRelationshipType: item.targetRelationshipType ?? null,
      urgencyScore: item.urgencyScore,
      closureScore: item.closureScore,
      handoffNeedScore: item.handoffNeedScore,
      reasonSummary: item.reasonSummary ?? null,
      lastMentionedAt: item.lastMentionedAt.toISOString(),
      recommendedAt: item.recommendedAt?.toISOString() ?? null,
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private toRecommendationRecord(
    item: FollowupRecommendationEntity,
  ): FollowupRecommendationRecordValue {
    return {
      id: item.id,
      openLoopId: item.openLoopId,
      status: item.status as FollowupRecommendationRecordValue['status'],
      recommenderCharacterId: item.recommenderCharacterId,
      recommenderCharacterName: item.recommenderCharacterName,
      targetCharacterId: item.targetCharacterId,
      targetCharacterName: item.targetCharacterName,
      targetCharacterAvatar: item.targetCharacterAvatar ?? null,
      targetCharacterRelationship: item.targetCharacterRelationship ?? null,
      relationshipState:
        item.relationshipState as FollowupRecommendationRelationshipStateValue,
      reasonSummary: item.reasonSummary,
      handoffSummary: item.handoffSummary ?? null,
      sourceThreadId: item.sourceThreadId,
      sourceThreadType: item.sourceThreadType as 'direct' | 'group',
      sourceThreadTitle: item.sourceThreadTitle ?? null,
      messageConversationId: item.messageConversationId ?? null,
      messageId: item.messageId ?? null,
      cardMessageId: item.cardMessageId ?? null,
      friendRequestId: item.friendRequestId ?? null,
      openedAt: item.openedAt?.toISOString() ?? null,
      friendRequestStartedAt:
        item.friendRequestStartedAt?.toISOString() ?? null,
      friendAddedAt: item.friendAddedAt?.toISOString() ?? null,
      chatStartedAt: item.chatStartedAt?.toISOString() ?? null,
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
      dismissedAt: item.dismissedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private toRecommendationEventResult(
    item: FollowupRecommendationEntity,
  ): FollowupRecommendationEventResultValue {
    return {
      id: item.id,
      status: item.status as FollowupRecommendationEventResultValue['status'],
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}

function renderTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

function normalizeText(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function clampScore(value: unknown) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numeric));
}

function computeOpenLoopScore(input: {
  urgencyScore: number;
  closureScore: number;
  handoffNeedScore: number;
}) {
  return (
    input.urgencyScore * 0.34 +
    (1 - input.closureScore) * 0.28 +
    input.handoffNeedScore * 0.38
  );
}

function createStableTopicKey(input: string) {
  return createHash('sha1').update(input).digest('hex').slice(0, 18);
}

function serializeDirectThreads(threads: FollowupDirectThreadSnapshotValue[]) {
  if (threads.length === 0) {
    return '无';
  }

  return threads
    .map((thread) => {
      const messageLines = thread.messages
        .map(
          (message) =>
            `${message.createdAt} ${message.senderName}(${message.senderType})：${message.text}`,
        )
        .join('\n');
      return [
        `线程：${thread.threadTitle} (${thread.threadId})`,
        `来源角色：${thread.sourceCharacterName} (${thread.sourceCharacterId})`,
        `最后活跃：${thread.lastActivityAt}`,
        '消息：',
        messageLines,
      ].join('\n');
    })
    .join('\n\n');
}

function serializeReminders(snapshot: FollowupSignalSnapshotValue) {
  if (snapshot.reminders.length === 0) {
    return '无';
  }

  return snapshot.reminders
    .map(
      (item) =>
        `${item.remindAt} / ${item.threadTitle ?? item.threadId} / ${item.previewText}`,
    )
    .join('\n');
}

function sanitizeSignalText(value: string) {
  return sanitizeAiText(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeHandoffText(value: string) {
  return sanitizeAiText(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function sanitizeFriendRequestGreeting(value: string) {
  return sanitizeAiText(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 120)
    .trim();
}

function normalizeDomainKey(value: string) {
  return value.trim().toLowerCase();
}

function computeDomainOverlap(
  loopDomains: Set<string>,
  expertDomains: string[],
) {
  if (loopDomains.size === 0 || !expertDomains.length) {
    return 0;
  }

  const characterDomains = new Set(expertDomains.map(normalizeDomainKey));
  let overlapCount = 0;
  loopDomains.forEach((item) => {
    if (characterDomains.has(item)) {
      overlapCount += 1;
    }
  });

  return overlapCount / Math.max(loopDomains.size, characterDomains.size);
}

function relationshipPriority(
  state: FollowupRecommendationRelationshipStateValue,
) {
  switch (state) {
    case 'friend':
      return 3;
    case 'not_friend':
      return 2;
    case 'pending':
      return 1;
    default:
      return 0;
  }
}
