import { NotFoundException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual } from 'typeorm';
import { ActionRuntimeService } from '../action-runtime/action-runtime.service';
import { ActionRunEntity } from '../action-runtime/action-run.entity';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { SELF_CHARACTER_ID } from '../characters/default-characters';
import { FollowupOpenLoopEntity } from '../followup-runtime/followup-open-loop.entity';
import { ReminderRuntimeService } from '../reminder-runtime/reminder-runtime.service';
import { ReminderTaskEntity } from '../reminder-runtime/reminder-task.entity';
import { SelfAgentHeartbeatRunEntity } from './self-agent-heartbeat-run.entity';
import { SelfAgentRulesService } from './self-agent-rules.service';
import { SelfAgentRunEntity } from './self-agent-run.entity';
import { SelfAgentWorkspaceService } from './self-agent-workspace.service';
import type {
  SelfAgentRulesValue,
  SelfAgentRunPolicyDecisionValue,
  SelfAgentRunRouteKeyValue,
  SelfAgentRunStatusValue,
  SelfAgentRunTriggerTypeValue,
} from './self-agent.types';

type SelfAgentHandlingResult = {
  handled: boolean;
  responseText?: string;
  handledBy?: 'action_runtime' | 'reminder_runtime';
};

type SelfAgentWorkspaceDocumentName =
  | 'AGENTS.md'
  | 'SOUL.md'
  | 'USER.md'
  | 'IDENTITY.md'
  | 'TOOLS.md'
  | 'HEARTBEAT.md'
  | 'MEMORY.md';

type SelfAgentHeartbeatTrigger = 'manual' | 'scheduler';

type SelfAgentHeartbeatFindingRecord = {
  type:
    | 'open_loop'
    | 'upcoming_reminder'
    | 'action_confirmation'
    | 'action_missing_slots';
  title: string;
  summary: string;
  count: number;
  items: string[];
};

type SelfAgentRunRecordInput = {
  triggerType: SelfAgentRunTriggerTypeValue;
  status: SelfAgentRunStatusValue;
  routeKey: SelfAgentRunRouteKeyValue;
  policyDecision: SelfAgentRunPolicyDecisionValue;
  summary: string;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  ownerId?: string | null;
  characterId?: string | null;
  inputPreview?: string | null;
  outputPreview?: string | null;
  detailsPayload?: Record<string, unknown> | null;
};

@Injectable()
export class SelfAgentService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ActionRunEntity)
    private readonly actionRunRepo: Repository<ActionRunEntity>,
    @InjectRepository(ReminderTaskEntity)
    private readonly reminderTaskRepo: Repository<ReminderTaskEntity>,
    @InjectRepository(FollowupOpenLoopEntity)
    private readonly followupOpenLoopRepo: Repository<FollowupOpenLoopEntity>,
    @InjectRepository(SelfAgentHeartbeatRunEntity)
    private readonly heartbeatRunRepo: Repository<SelfAgentHeartbeatRunEntity>,
    @InjectRepository(SelfAgentRunEntity)
    private readonly runRepo: Repository<SelfAgentRunEntity>,
    private readonly actionRuntime: ActionRuntimeService,
    private readonly reminderRuntime: ReminderRuntimeService,
    private readonly rulesService: SelfAgentRulesService,
    private readonly workspace: SelfAgentWorkspaceService,
  ) {}

  async handleConversationTurn(input: {
    conversationId: string;
    ownerId: string;
    character: CharacterEntity;
    userMessage: string;
    sourceMessageId: string;
  }): Promise<SelfAgentHandlingResult> {
    if (!this.isSelfCharacter(input.character)) {
      return { handled: false };
    }

    const rules = await this.rulesService.getRules();
    if (!rules.policy.enabled) {
      await this.saveRunRecord({
        triggerType: 'conversation',
        status: 'skipped',
        routeKey: 'ignored',
        policyDecision: 'disabled',
        summary: 'self-agent 当前已关闭，本轮没有接管这条消息。',
        conversationId: input.conversationId,
        sourceMessageId: input.sourceMessageId,
        ownerId: input.ownerId,
        characterId: input.character.id,
        inputPreview: input.userMessage,
        detailsPayload: {
          reason: 'policy_disabled',
        },
      });
      return { handled: false };
    }

    if (rules.policy.allowActionRuntimeDelegation) {
      const actionResult = await this.actionRuntime.handleConversationTurn({
        conversationId: input.conversationId,
        ownerId: input.ownerId,
        character: input.character,
        userMessage: input.userMessage,
        delegatedBy: 'self_agent',
        forceConfirmation:
          rules.policy.forceConfirmationForDelegatedActions,
        blockedConnectorKeys: rules.policy.blockedActionConnectorKeys,
        blockedOperationKeys: rules.policy.blockedActionOperationKeys,
      });
      if (actionResult.handled) {
        const latestActionRun = await this.findLatestActionRun({
          conversationId: input.conversationId,
          ownerId: input.ownerId,
          characterId: input.character.id,
        });
        await this.saveRunRecord({
          triggerType: 'conversation',
          status:
            latestActionRun?.status === 'cancelled' &&
            latestActionRun.policyDecisionPayload?.reason ===
              'blocked_by_delegate_policy'
              ? 'blocked'
              : 'handled',
          routeKey: 'action_runtime',
          policyDecision: this.resolveActionPolicyDecision(latestActionRun),
          summary: this.buildActionRunSummary(latestActionRun),
          conversationId: input.conversationId,
          sourceMessageId: input.sourceMessageId,
          ownerId: input.ownerId,
          characterId: input.character.id,
          inputPreview: input.userMessage,
          outputPreview: actionResult.responseText ?? null,
          detailsPayload: latestActionRun
            ? {
                actionRunId: latestActionRun.id,
                actionRunStatus: latestActionRun.status,
                connectorKey: latestActionRun.connectorKey,
                operationKey: latestActionRun.operationKey,
                title: latestActionRun.title,
              }
            : null,
        });
        return {
          handled: true,
          responseText: actionResult.responseText,
          handledBy: 'action_runtime',
        };
      }
    }

    if (rules.policy.allowReminderRuntimeDelegation) {
      const reminderResult = await this.reminderRuntime.handleConversationTurn({
        conversationId: input.conversationId,
        userMessage: input.userMessage,
        sourceMessageId: input.sourceMessageId,
      });
      if (reminderResult.handled) {
        await this.saveRunRecord({
          triggerType: 'conversation',
          status: 'handled',
          routeKey: 'reminder_runtime',
          policyDecision: 'delegated',
          summary: 'self-agent 将这条消息路由给了 reminder-runtime。',
          conversationId: input.conversationId,
          sourceMessageId: input.sourceMessageId,
          ownerId: input.ownerId,
          characterId: input.character.id,
          inputPreview: input.userMessage,
          outputPreview: reminderResult.responseText ?? null,
        });
        return {
          handled: true,
          responseText: reminderResult.responseText,
          handledBy: 'reminder_runtime',
        };
      }
    }

    return { handled: false };
  }

  async buildChatPromptSections(input: { character: CharacterEntity }) {
    if (!this.isSelfCharacter(input.character)) {
      return [];
    }

    return this.workspace.buildChatPromptSections(input);
  }

  async getRules(): Promise<SelfAgentRulesValue> {
    return this.rulesService.getRules();
  }

  async setRules(patch: Partial<SelfAgentRulesValue>) {
    return this.rulesService.setRules(patch);
  }

  async recordFallbackConversationTurn(input: {
    conversationId: string;
    ownerId: string;
    character: CharacterEntity;
    sourceMessageId: string;
    userMessage: string;
    assistantReplyText: string;
    workspaceSectionCount: number;
  }) {
    if (!this.isSelfCharacter(input.character)) {
      return null;
    }

    const rules = await this.rulesService.getRules();
    return this.saveRunRecord({
      triggerType: 'conversation',
      status: 'handled',
      routeKey: 'self_chat',
      policyDecision: rules.policy.enabled ? 'fallback' : 'disabled',
      summary: 'self-agent 本轮回落到普通自我对话回复。',
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      ownerId: input.ownerId,
      characterId: input.character.id,
      inputPreview: input.userMessage,
      outputPreview: input.assistantReplyText,
      detailsPayload: {
        workspaceSectionCount: input.workspaceSectionCount,
      },
    });
  }

  async getAdminOverview() {
    const now = new Date();
    const [selfCharacter, owner] = await Promise.all([
      this.requireSelfCharacter(),
      this.requireOwner(),
    ]);
    const [
      workspaceDocuments,
      activeOpenLoopCount,
      upcomingReminderCount,
      awaitingActionConfirmationCount,
      awaitingActionSlotsCount,
      rules,
      recentHeartbeatRuns,
      recentRuns,
    ] = await Promise.all([
      this.workspace.listWorkspaceDocuments({ character: selfCharacter }),
      this.followupOpenLoopRepo.count({
        where: { status: In(['open', 'watching', 'recommended']) },
      }),
      this.reminderTaskRepo.count({
        where: {
          ownerId: owner.id,
          status: 'active',
          nextTriggerAt: LessThanOrEqual(
            new Date(now.getTime() + 24 * 60 * 60 * 1000),
          ),
        },
      }),
      this.actionRunRepo.count({
        where: {
          ownerId: owner.id,
          status: 'awaiting_confirmation',
        },
      }),
      this.actionRunRepo.count({
        where: {
          ownerId: owner.id,
          status: 'awaiting_slots',
        },
      }),
      this.rulesService.getRules(),
      this.heartbeatRunRepo.find({
        order: { updatedAt: 'DESC', createdAt: 'DESC' },
        take: 12,
      }),
      this.runRepo.find({
        order: { updatedAt: 'DESC', createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    return {
      identity: {
        ownerId: owner.id,
        ownerName: owner.username?.trim() || '世界主人',
        ownerSignature: owner.signature?.trim() || null,
        characterId: selfCharacter.id,
        characterName: selfCharacter.name,
        characterSourceKey: selfCharacter.sourceKey?.trim() || null,
      },
      rules,
      workspaceDocuments,
      stats: {
        activeOpenLoopCount,
        upcomingReminderCount,
        awaitingActionConfirmationCount,
        awaitingActionSlotsCount,
        heartbeatRunCount: recentHeartbeatRuns.length,
        runCount: recentRuns.length,
      },
      recentHeartbeatRuns: recentHeartbeatRuns.map((item) =>
        this.serializeHeartbeatRun(item),
      ),
      recentRuns: recentRuns.map((item) => this.serializeRun(item)),
    };
  }

  async getWorkspaceDocument(name: SelfAgentWorkspaceDocumentName) {
    const selfCharacter = await this.requireSelfCharacter();
    return this.workspace.getWorkspaceDocument({
      character: selfCharacter,
      name,
    });
  }

  async updateWorkspaceDocument(
    name: SelfAgentWorkspaceDocumentName,
    content: string,
  ) {
    const selfCharacter = await this.requireSelfCharacter();
    return this.workspace.updateWorkspaceDocument({
      character: selfCharacter,
      name,
      content,
    });
  }

  async runHeartbeat(options?: { trigger?: SelfAgentHeartbeatTrigger }) {
    const [selfCharacter, owner, rules] = await Promise.all([
      this.requireSelfCharacter(),
      this.requireOwner(),
      this.rulesService.getRules(),
    ]);
    const trigger = options?.trigger ?? 'manual';
    const now = new Date();
    const baseRunInput = {
      conversationId: null,
      sourceMessageId: null,
      ownerId: owner.id,
      characterId: selfCharacter.id,
      inputPreview: null,
    };

    if (!rules.heartbeat.enabled) {
      const disabledRun = await this.heartbeatRunRepo.save(
        this.heartbeatRunRepo.create({
          triggerType: trigger,
          status: 'noop',
          summary: 'heartbeat 已关闭，本轮跳过巡检。',
          suggestedMessage: null,
          findingsPayload: [],
          errorMessage: null,
        }),
      );
      await this.saveRunRecord({
        triggerType: 'heartbeat',
        status: 'skipped',
        routeKey: 'heartbeat',
        policyDecision: 'disabled',
        summary: disabledRun.summary,
        ...baseRunInput,
      });
      return this.serializeHeartbeatRun(disabledRun);
    }

    if (
      !rules.heartbeat.allowNightlySilentScan &&
      !this.isWithinHeartbeatWindow(now, rules)
    ) {
      const skippedRun = await this.heartbeatRunRepo.save(
        this.heartbeatRunRepo.create({
          triggerType: trigger,
          status: 'noop',
          summary: 'heartbeat 当前不在主动时段，本轮保持静默。',
          suggestedMessage: null,
          findingsPayload: [],
          errorMessage: null,
        }),
      );
      await this.saveRunRecord({
        triggerType: 'heartbeat',
        status: 'skipped',
        routeKey: 'heartbeat',
        policyDecision: 'suggest_only',
        summary: skippedRun.summary,
        ...baseRunInput,
      });
      return this.serializeHeartbeatRun(skippedRun);
    }

    const [openLoops, upcomingReminders, awaitingConfirmationRuns, awaitingSlotRuns] =
      await Promise.all([
        this.followupOpenLoopRepo.find({
          where: { status: In(['open', 'watching', 'recommended']) },
          order: { updatedAt: 'DESC', createdAt: 'DESC' },
          take: rules.heartbeat.maxItemsPerCategory,
        }),
        this.reminderTaskRepo.find({
          where: {
            ownerId: owner.id,
            status: 'active',
            nextTriggerAt: LessThanOrEqual(
              new Date(now.getTime() + 24 * 60 * 60 * 1000),
            ),
          },
          order: { nextTriggerAt: 'ASC', dueAt: 'ASC', updatedAt: 'DESC' },
          take: rules.heartbeat.maxItemsPerCategory,
        }),
        this.actionRunRepo.find({
          where: {
            ownerId: owner.id,
            status: 'awaiting_confirmation',
          },
          order: { updatedAt: 'DESC', createdAt: 'DESC' },
          take: rules.heartbeat.maxItemsPerCategory,
        }),
        this.actionRunRepo.find({
          where: {
            ownerId: owner.id,
            status: 'awaiting_slots',
          },
          order: { updatedAt: 'DESC', createdAt: 'DESC' },
          take: rules.heartbeat.maxItemsPerCategory,
        }),
      ]);

    const findings: SelfAgentHeartbeatFindingRecord[] = [];
    if (awaitingConfirmationRuns.length > 0) {
      findings.push({
        type: 'action_confirmation',
        title: '待确认动作',
        summary: `还有 ${awaitingConfirmationRuns.length} 个真实动作卡在确认上。`,
        count: awaitingConfirmationRuns.length,
        items: awaitingConfirmationRuns.map((item) => item.title),
      });
    }
    if (awaitingSlotRuns.length > 0) {
      findings.push({
        type: 'action_missing_slots',
        title: '待补参数动作',
        summary: `还有 ${awaitingSlotRuns.length} 个动作在等补参数。`,
        count: awaitingSlotRuns.length,
        items: awaitingSlotRuns.map((item) => item.title),
      });
    }
    if (upcomingReminders.length > 0) {
      findings.push({
        type: 'upcoming_reminder',
        title: '即将到期提醒',
        summary: `接下来 24 小时内有 ${upcomingReminders.length} 个提醒需要留意。`,
        count: upcomingReminders.length,
        items: upcomingReminders.map((item) => item.title),
      });
    }
    if (openLoops.length > 0) {
      findings.push({
        type: 'open_loop',
        title: '未闭环事项',
        summary: `目前还有 ${openLoops.length} 个话头没真正落下。`,
        count: openLoops.length,
        items: openLoops.map((item) => item.summary),
      });
    }

    const suggestedMessage = this.buildHeartbeatMessage(findings);
    const run = this.heartbeatRunRepo.create({
      triggerType: trigger,
      status: findings.length > 0 ? 'success' : 'noop',
      summary:
        findings.length > 0
          ? `heartbeat 命中了 ${findings.length} 类待处理事项。`
          : 'heartbeat 已扫描，本轮没有发现需要主动提起的事项。',
      suggestedMessage,
      findingsPayload: findings,
      errorMessage: null,
    });
    const saved = await this.heartbeatRunRepo.save(run);
    await this.saveRunRecord({
      triggerType: 'heartbeat',
      status: findings.length > 0 ? 'suggested' : 'skipped',
      routeKey: 'heartbeat',
      policyDecision: 'suggest_only',
      summary: saved.summary,
      outputPreview: saved.suggestedMessage ?? null,
      detailsPayload: {
        findingsCount: findings.length,
      },
      ...baseRunInput,
    });
    return this.serializeHeartbeatRun(saved);
  }

  private isSelfCharacter(character: CharacterEntity) {
    return (
      character.id === SELF_CHARACTER_ID ||
      character.relationshipType === 'self' ||
      character.sourceKey?.trim() === 'self'
    );
  }

  private async requireSelfCharacter() {
    const character = await this.characterRepo.findOneBy({
      id: SELF_CHARACTER_ID,
    });
    if (!character) {
      throw new NotFoundException('默认 self 角色尚未落库。');
    }
    return character;
  }

  private async requireOwner() {
    const owner = await this.userRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (!owner) {
      throw new NotFoundException('世界主人不存在。');
    }
    return owner;
  }

  private async findLatestActionRun(input: {
    conversationId: string;
    ownerId: string;
    characterId: string;
  }) {
    return this.actionRunRepo.findOne({
      where: {
        conversationId: input.conversationId,
        ownerId: input.ownerId,
        characterId: input.characterId,
      },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  private serializeHeartbeatRun(run: SelfAgentHeartbeatRunEntity) {
    return {
      id: run.id,
      triggerType: run.triggerType as SelfAgentHeartbeatTrigger,
      status: run.status as 'success' | 'noop' | 'error',
      summary: run.summary,
      suggestedMessage: run.suggestedMessage ?? null,
      findings: Array.isArray(run.findingsPayload)
        ? (run.findingsPayload as SelfAgentHeartbeatFindingRecord[])
        : [],
      errorMessage: run.errorMessage ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private serializeRun(run: SelfAgentRunEntity) {
    return {
      id: run.id,
      triggerType: run.triggerType,
      status: run.status,
      routeKey: run.routeKey,
      policyDecision: run.policyDecision,
      conversationId: run.conversationId ?? null,
      sourceMessageId: run.sourceMessageId ?? null,
      ownerId: run.ownerId ?? null,
      characterId: run.characterId ?? null,
      summary: run.summary,
      inputPreview: run.inputPreview ?? null,
      outputPreview: run.outputPreview ?? null,
      details: run.detailsPayload ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private async saveRunRecord(input: SelfAgentRunRecordInput) {
    const run = this.runRepo.create({
      triggerType: input.triggerType,
      status: input.status,
      routeKey: input.routeKey,
      policyDecision: input.policyDecision,
      conversationId: input.conversationId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
      ownerId: input.ownerId ?? null,
      characterId: input.characterId ?? null,
      summary: input.summary,
      inputPreview: this.truncatePreview(input.inputPreview),
      outputPreview: this.truncatePreview(input.outputPreview),
      detailsPayload: input.detailsPayload ?? null,
    });
    return this.runRepo.save(run);
  }

  private resolveActionPolicyDecision(run: ActionRunEntity | null) {
    if (!run) {
      return 'delegated' as const;
    }

    if (
      run.status === 'cancelled' &&
      run.policyDecisionPayload?.reason === 'blocked_by_delegate_policy'
    ) {
      return 'blocked' as const;
    }
    if (run.status === 'awaiting_confirmation') {
      return 'confirm_required' as const;
    }
    if (run.status === 'awaiting_slots') {
      return 'clarify_required' as const;
    }
    return 'delegated' as const;
  }

  private buildActionRunSummary(run: ActionRunEntity | null) {
    if (!run) {
      return 'self-agent 将消息路由给了 action-runtime。';
    }

    if (
      run.status === 'cancelled' &&
      run.policyDecisionPayload?.reason === 'blocked_by_delegate_policy'
    ) {
      return `self-agent 命中动作链，但被统一策略拦下：${run.title}`;
    }
    if (run.status === 'awaiting_confirmation') {
      return `self-agent 已转入动作确认：${run.title}`;
    }
    if (run.status === 'awaiting_slots') {
      return `self-agent 已转入动作补参数：${run.title}`;
    }
    if (run.status === 'succeeded') {
      return `self-agent 已委托 action-runtime 执行完成：${run.title}`;
    }
    if (run.status === 'failed') {
      return `self-agent 委托 action-runtime 失败：${run.title}`;
    }
    return `self-agent 已委托 action-runtime：${run.title}`;
  }

  private isWithinHeartbeatWindow(
    now: Date,
    rules: SelfAgentRulesValue,
  ) {
    const hour = now.getHours();
    return (
      hour >= rules.heartbeat.activeHoursStart &&
      hour <= rules.heartbeat.activeHoursEnd
    );
  }

  private truncatePreview(value?: string | null) {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }
    return normalized.length > 220
      ? `${normalized.slice(0, 217).trimEnd()}...`
      : normalized;
  }

  private buildHeartbeatMessage(findings: SelfAgentHeartbeatFindingRecord[]) {
    if (!findings.length) {
      return null;
    }

    return findings
      .map((finding) => {
        if (finding.type === 'action_confirmation') {
          return `有${finding.count}个动作还卡在确认上。`;
        }
        if (finding.type === 'action_missing_slots') {
          return `还有${finding.count}个动作在等你补一句关键信息。`;
        }
        if (finding.type === 'upcoming_reminder') {
          return `接下来有${finding.count}件提醒快到了。`;
        }
        return `还有${finding.count}件事其实没真正落下。`;
      })
      .join('');
  }
}
