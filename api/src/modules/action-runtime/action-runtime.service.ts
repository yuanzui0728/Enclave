import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { decryptUserApiKey, encryptUserApiKey } from '../auth/api-key-crypto';
import { CharacterEntity } from '../characters/character.entity';
import { CyberAvatarService } from '../cyber-avatar/cyber-avatar.service';
import { DEFAULT_ACTION_CONNECTOR_SEEDS } from './action-runtime.constants';
import { ActionConnectorEntity } from './action-connector.entity';
import { ActionRunEntity } from './action-run.entity';
import { ActionRuntimeRulesService } from './action-runtime-rules.service';
import type {
  ActionConnectorSeedValue,
  ActionConnectorDiscoveryResultValue,
  ActionConnectorTestResultValue,
  ActionExecutionResultValue,
  ActionHandlingResultValue,
  ActionPlanValue,
  ActionRunRetryResultValue,
  ActionRuntimeRulesValue,
} from './action-runtime.types';

function renderTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

function appendTrace(
  tracePayload: Record<string, unknown> | null | undefined,
  event: Record<string, unknown>,
) {
  const existingSteps = Array.isArray(tracePayload?.steps)
    ? [...(tracePayload?.steps as Array<Record<string, unknown>>)]
    : [];
  existingSteps.push({
    ...event,
    at: new Date().toISOString(),
  });
  return {
    ...(tracePayload ?? {}),
    steps: existingSteps,
  };
}

function createRunId() {
  return `action_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createMockReference(prefix: string) {
  return `${prefix.toUpperCase()}-${Date.now().toString().slice(-8)}`;
}

function normalizeUserMessage(input: string) {
  return input.trim();
}

function truncateActionSignalSummary(value: string) {
  const normalized = value.trim();
  return normalized.length > 220
    ? `${normalized.slice(0, 217)}...`
    : normalized;
}

function rankConnectorProvider(
  providerType: ActionConnectorEntity['providerType'],
) {
  if (providerType === 'official_api') {
    return 4;
  }
  if (providerType === 'http_bridge') {
    return 3;
  }
  if (providerType === 'browser_operator') {
    return 2;
  }
  return 1;
}

const HOME_ASSISTANT_ROOM_PATTERNS: Array<[string, RegExp[]]> = [
  ['客厅', [/客厅/, /\bliving[\s_-]?room\b/i, /\blounge\b/i]],
  ['卧室', [/卧室/, /\bbedroom\b/i]],
  ['主卧', [/主卧/, /\bmaster[\s_-]?bedroom\b/i]],
  ['次卧', [/次卧/]],
  ['书房', [/书房/, /\bstudy\b/i, /\boffice\b/i]],
  ['厨房', [/厨房/, /\bkitchen\b/i]],
  ['餐厅', [/餐厅/, /\bdining\b/i]],
  ['阳台', [/阳台/, /\bbalcony\b/i]],
  ['卫生间', [/卫生间/, /\bbath(room)?\b/i, /\bwashroom\b/i]],
  ['玄关', [/玄关/, /\bentry\b/i, /\bfoyer\b/i]],
];

type HomeAssistantRegistryArea = {
  areaId: string;
  name: string;
};

type HomeAssistantRegistryDevice = {
  id: string;
  areaId: string;
  name: string;
};

type HomeAssistantRegistryEntity = {
  entityId: string;
  areaId: string;
  deviceId: string;
  name: string;
};

type HomeAssistantRegistrySnapshot = {
  areasById: Map<string, HomeAssistantRegistryArea>;
  devicesById: Map<string, HomeAssistantRegistryDevice>;
  entitiesById: Map<string, HomeAssistantRegistryEntity>;
};

@Injectable()
export class ActionRuntimeService {
  private connectorsSeeded = false;

  constructor(
    @InjectRepository(ActionConnectorEntity)
    private readonly connectorRepo: Repository<ActionConnectorEntity>,
    @InjectRepository(ActionRunEntity)
    private readonly runRepo: Repository<ActionRunEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly rulesService: ActionRuntimeRulesService,
    private readonly cyberAvatar: CyberAvatarService,
  ) {}

  async handleConversationTurn(input: {
    conversationId: string;
    ownerId: string;
    character: CharacterEntity;
    userMessage: string;
    delegatedBy?: string | null;
  }): Promise<ActionHandlingResultValue> {
    await this.ensureDefaultConnectors();
    const rules = await this.rulesService.getRules();
    const userMessage = normalizeUserMessage(input.userMessage);

    if (!rules.policy.enabled || !userMessage) {
      return { handled: false };
    }

    const canHandleCurrentCharacter = input.delegatedBy
      ? true
      : this.canCreateActionPlan(input.character, rules);

    const pendingRun = await this.findLatestPendingRun(
      input.conversationId,
      input.ownerId,
      input.character.id,
    );

    if (pendingRun) {
      if (!canHandleCurrentCharacter) {
        await this.cancelStalePendingRun({
          run: pendingRun,
          rules,
          reason: 'entry_character_mismatch',
          currentCharacter: input.character,
        });
        return { handled: false };
      }
      const connectors = await this.listReadyConnectorEntities();
      return this.handlePendingRun({
        run: pendingRun,
        userMessage,
        rules,
        connectors,
      });
    }

    if (!canHandleCurrentCharacter) {
      return { handled: false };
    }

    const connectors = await this.listReadyConnectorEntities();
    const preview = await this.planAction({
      message: userMessage,
      conversationId: input.conversationId,
      ownerId: input.ownerId,
      characterId: input.character.id,
      connectors,
      rules,
    });
    if (!preview.handled || !preview.plan) {
      return { handled: false };
    }

    const plan = preview.plan;
    const run = this.runRepo.create({
      id: createRunId(),
      conversationId: input.conversationId,
      ownerId: input.ownerId,
      characterId: input.character.id,
      connectorKey: plan.connectorKey,
      operationKey: plan.operationKey,
      title: plan.title,
      status: 'draft',
      riskLevel: plan.riskLevel,
      requiresConfirmation: plan.requiresConfirmation,
      userGoal: plan.goal,
      slotPayload: { ...plan.slots },
      missingSlots: [...plan.missingSlots],
      planPayload: plan,
      tracePayload: appendTrace(null, {
        phase: 'plan_created',
        entryMode: input.delegatedBy ? 'delegated' : 'direct',
        delegatedBy: input.delegatedBy ?? null,
        plannerMode: rules.plannerMode,
        plannerReason: preview.reason,
        matchedKeywords: plan.matchedKeywords,
        promptPreview: plan.promptPreview,
      }),
    });

    if (plan.missingSlots.length > 0) {
      run.status = 'awaiting_slots';
      run.policyDecisionPayload = {
        reason: 'missing_required_slots',
        missingSlots: [...plan.missingSlots],
      };
      await this.runRepo.save(run);
      return {
        handled: true,
        responseText: this.renderClarification(plan, rules),
      };
    }

    if (this.requiresConfirmation(plan, rules)) {
      run.status = 'awaiting_confirmation';
      run.policyDecisionPayload = {
        reason: 'requires_confirmation',
        autoExecutable: false,
      };
      run.confirmationPayload = {
        requestedAt: new Date().toISOString(),
        confirmationKeywords: [...rules.policy.confirmationKeywords],
      };
      run.tracePayload = appendTrace(run.tracePayload, {
        phase: 'awaiting_confirmation',
        slotSummary: this.describeSlots(plan.slots),
      });
      await this.runRepo.save(run);
      return {
        handled: true,
        responseText: this.renderConfirmation(plan, rules),
      };
    }

    run.status = 'running';
    run.policyDecisionPayload = {
      reason: 'auto_execute',
      autoExecutable: true,
    };
    run.tracePayload = appendTrace(run.tracePayload, {
      phase: 'auto_execute',
    });
    await this.runRepo.save(run);
    return this.executeRun(run, rules, connectors);
  }

  async getAdminOverview() {
    await this.ensureDefaultConnectors();
    const rules = await this.rulesService.getRules();
    const [connectors, recentRuns, operatorCharacter] = await Promise.all([
      this.connectorRepo.find({ order: { displayName: 'ASC' } }),
      this.runRepo.find({
        order: { updatedAt: 'DESC' },
        take: 12,
      }),
      this.findActionRuntimeEntryCharacter(rules.policy.entryCharacterSourceKey),
    ]);

    const totalRuns = await this.runRepo.count();
    const awaitingSlots = await this.runRepo.count({
      where: { status: 'awaiting_slots' },
    });
    const awaitingConfirmation = await this.runRepo.count({
      where: { status: 'awaiting_confirmation' },
    });
    const succeeded = await this.runRepo.count({
      where: { status: 'succeeded' },
    });
    const failed = await this.runRepo.count({
      where: { status: 'failed' },
    });

    return {
      rules,
      connectors: connectors.map((connector) =>
        this.serializeConnector(connector),
      ),
      recentRuns: recentRuns.map((run) => this.serializeRun(run)),
      counts: {
        totalRuns,
        awaitingSlots,
        awaitingConfirmation,
        succeeded,
        failed,
        readyConnectors: connectors.filter((item) => item.status === 'ready')
          .length,
      },
      operatorCharacter: operatorCharacter
        ? {
            id: operatorCharacter.id,
            name: operatorCharacter.name,
            sourceKey: operatorCharacter.sourceKey ?? null,
          }
        : null,
    };
  }

  async getRules() {
    return this.rulesService.getRules();
  }

  async setRules(payload: Partial<ActionRuntimeRulesValue>) {
    return this.rulesService.setRules(payload);
  }

  async listConnectors() {
    await this.ensureDefaultConnectors();
    const connectors = await this.connectorRepo.find({
      order: { displayName: 'ASC' },
    });
    return connectors.map((connector) => this.serializeConnector(connector));
  }

  async updateConnector(
    id: string,
    payload: {
      displayName?: string;
      status?: 'disabled' | 'ready' | 'error';
      endpointConfig?: Record<string, unknown> | null;
      credential?: string | null;
      clearCredential?: boolean;
    },
  ) {
    await this.ensureDefaultConnectors();
    const connector = await this.connectorRepo.findOneBy({ id });
    if (!connector) {
      throw new NotFoundException(`Connector ${id} not found`);
    }

    if (typeof payload.displayName === 'string' && payload.displayName.trim()) {
      connector.displayName = payload.displayName.trim();
    }
    if (
      payload.status === 'disabled' ||
      payload.status === 'ready' ||
      payload.status === 'error'
    ) {
      connector.status = payload.status;
      if (payload.status === 'ready') {
        connector.lastError = null;
      }
    }
    if (payload.endpointConfig !== undefined) {
      connector.endpointConfigPayload = payload.endpointConfig;
    }
    if (payload.clearCredential === true) {
      connector.credentialPayloadEncrypted = null;
    } else if (typeof payload.credential === 'string') {
      const trimmedCredential = payload.credential.trim();
      if (trimmedCredential) {
        connector.credentialPayloadEncrypted =
          encryptUserApiKey(trimmedCredential);
      }
    }

    await this.connectorRepo.save(connector);
    return this.serializeConnector(connector);
  }

  async testConnector(
    id: string,
    payload?: {
      sampleMessage?: string;
    },
  ): Promise<ActionConnectorTestResultValue> {
    await this.ensureDefaultConnectors();
    const connector = await this.connectorRepo.findOneBy({ id });
    if (!connector) {
      throw new NotFoundException(`Connector ${id} not found`);
    }

    const rules = await this.rulesService.getRules();
    const sampleMessage =
      payload?.sampleMessage?.trim() ||
      this.buildDefaultConnectorTestMessage(connector);
    const testedAt = new Date();

    try {
      const samplePlan = this.buildConnectorTestPlan(
        connector,
        sampleMessage,
        rules,
      );

      let executionPayload: Record<string, unknown> | null = null;
      let resultPayload: Record<string, unknown> | null = null;
      let summary: string;
      const execution = await this.executeConnectorOperation(
        samplePlan,
        connector,
        true,
      );
      executionPayload = execution.executionPayload;
      resultPayload = execution.resultPayload;
      summary = execution.resultSummary;

      connector.lastHealthCheckAt = testedAt;
      connector.lastError = null;
      if (connector.status === 'error') {
        connector.status = 'ready';
      }
      await this.connectorRepo.save(connector);

      return {
        ok: true,
        testedAt: testedAt.toISOString(),
        sampleMessage,
        summary,
        connector: this.serializeConnector(connector),
        samplePlan,
        executionPayload,
        resultPayload,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : '连接器测试过程中发生未知异常。';
      connector.lastHealthCheckAt = testedAt;
      connector.lastError = errorMessage;
      if (connector.status !== 'disabled') {
        connector.status = 'error';
      }
      await this.connectorRepo.save(connector);

      return {
        ok: false,
        testedAt: testedAt.toISOString(),
        sampleMessage,
        summary: `${connector.displayName} 自检失败。`,
        connector: this.serializeConnector(connector),
        samplePlan: null,
        executionPayload: null,
        resultPayload: null,
        errorMessage,
      };
    }
  }

  async discoverConnector(
    id: string,
    payload?: {
      query?: string;
      limit?: number;
      endpointConfig?: Record<string, unknown>;
      credential?: string;
    },
  ): Promise<ActionConnectorDiscoveryResultValue> {
    await this.ensureDefaultConnectors();
    const connector = await this.connectorRepo.findOneBy({ id });
    if (!connector) {
      throw new NotFoundException(`Connector ${id} not found`);
    }

    if (
      connector.connectorKey === 'official-home-assistant-smart-home' ||
      (connector.providerType === 'official_api' &&
        (connector.endpointConfigPayload as Record<string, unknown> | null)
          ?.provider === 'home_assistant')
    ) {
      return this.discoverHomeAssistantConnector(connector, payload);
    }

    throw new BadRequestException(
      `当前连接器 ${connector.displayName} 暂不支持自动发现。`,
    );
  }

  async listRuns(limit = 20) {
    await this.ensureDefaultConnectors();
    const runs = await this.runRepo.find({
      order: { updatedAt: 'DESC' },
      take: Math.max(1, Math.min(100, Math.round(limit))),
    });
    return runs.map((run) => this.serializeRun(run));
  }

  async getRun(id: string) {
    await this.ensureDefaultConnectors();
    const run = await this.runRepo.findOneBy({ id });
    if (!run) {
      throw new NotFoundException(`Action run ${id} not found`);
    }
    return this.serializeRunDetail(run);
  }

  async retryRun(id: string): Promise<ActionRunRetryResultValue> {
    await this.ensureDefaultConnectors();
    const run = await this.runRepo.findOneBy({ id });
    if (!run) {
      throw new NotFoundException(`Action run ${id} not found`);
    }

    const plan = run.planPayload;
    if (!plan) {
      throw new BadRequestException('该动作缺少 plan 快照，当前无法重试。');
    }

    const rules = await this.rulesService.getRules();
    const connectors = await this.listReadyConnectorEntities();
    const refreshedPlan: ActionPlanValue = {
      ...plan,
      missingSlots: this.resolveMissingSlots(
        plan.operationKey,
        plan.domain,
        plan.slots,
      ),
    };

    run.planPayload = refreshedPlan;
    run.slotPayload = { ...refreshedPlan.slots };
    run.missingSlots = [...refreshedPlan.missingSlots];
    run.resultSummary = null;
    run.executionPayload = null;
    run.resultPayload = null;
    run.errorPayload = null;
    run.errorMessage = null;
    run.tracePayload = appendTrace(run.tracePayload, {
      phase: 'admin_retry_requested',
      previousStatus: run.status,
      refreshedMissingSlots: [...refreshedPlan.missingSlots],
    });

    if (refreshedPlan.missingSlots.length > 0) {
      run.status = 'awaiting_slots';
      run.policyDecisionPayload = {
        reason: 'missing_required_slots',
        missingSlots: [...refreshedPlan.missingSlots],
      };
      await this.runRepo.save(run);
      return {
        nextStep: 'awaiting_slots',
        responseText: this.renderClarification(refreshedPlan, rules),
        run: this.serializeRunDetail(run),
      };
    }

    const confirmationRecorded = Boolean(
      run.confirmationPayload &&
      typeof run.confirmationPayload === 'object' &&
      'confirmedAt' in run.confirmationPayload &&
      run.confirmationPayload.confirmedAt,
    );
    if (
      this.requiresConfirmation(refreshedPlan, rules) &&
      !confirmationRecorded
    ) {
      run.status = 'awaiting_confirmation';
      run.confirmationPayload = {
        ...(run.confirmationPayload ?? {}),
        requestedAt: new Date().toISOString(),
        confirmationKeywords: [...rules.policy.confirmationKeywords],
      };
      run.policyDecisionPayload = {
        reason: 'requires_confirmation',
        autoExecutable: false,
      };
      await this.runRepo.save(run);
      return {
        nextStep: 'awaiting_confirmation',
        responseText: this.renderConfirmation(refreshedPlan, rules),
        run: this.serializeRunDetail(run),
      };
    }

    run.status = 'running';
    run.policyDecisionPayload = {
      reason: confirmationRecorded
        ? 'retry_after_confirmation'
        : 'retry_execute',
      autoExecutable: true,
    };
    await this.runRepo.save(run);
    const execution = await this.executeRun(run, rules, connectors);
    return {
      nextStep: 'executed',
      responseText: execution.responseText ?? '',
      run: this.serializeRunDetail(run),
    };
  }

  async previewMessage(message: string) {
    await this.ensureDefaultConnectors();
    const rules = await this.rulesService.getRules();
    const connectors = await this.listReadyConnectorEntities();
    const preview = await this.planAction({
      message,
      connectors,
      rules,
    });
    if (!preview.handled || !preview.plan) {
      return {
        handled: false,
        reason: preview.reason,
        plan: null,
        responsePreview: null,
      };
    }

    const plan = preview.plan;
    let responsePreview: string;
    if (plan.missingSlots.length > 0) {
      responsePreview = this.renderClarification(plan, rules);
    } else if (this.requiresConfirmation(plan, rules)) {
      responsePreview = this.renderConfirmation(plan, rules);
    } else {
      const connector = connectors.find(
        (item) => item.connectorKey === plan.connectorKey,
      );
      const execution = await this.executeConnectorOperation(
        plan,
        connector,
        true,
      );
      responsePreview = this.renderSuccess(
        plan,
        connector?.displayName ?? plan.connectorKey,
        execution.resultSummary,
        rules,
      );
    }

    return {
      handled: true,
      reason: preview.reason,
      plan,
      responsePreview,
    };
  }

  private async ensureDefaultConnectors() {
    if (this.connectorsSeeded) {
      return;
    }

    const existing = await this.connectorRepo.find();
    const existingByKey = new Map(
      existing.map((connector) => [connector.connectorKey, connector]),
    );
    const inserts = DEFAULT_ACTION_CONNECTOR_SEEDS.filter(
      (seed) => !existingByKey.has(seed.connectorKey),
    ).map((seed) => this.connectorRepo.create(seed));

    if (inserts.length > 0) {
      await this.connectorRepo.save(inserts);
    }
    this.connectorsSeeded = true;
  }

  private async findActionRuntimeEntryCharacter(sourceKey: string) {
    const normalizedSourceKey = sourceKey.trim();
    if (!normalizedSourceKey) {
      return null;
    }

    const character = await this.characterRepo.findOneBy({
      sourceKey: normalizedSourceKey,
    });
    return character ?? null;
  }

  private canCreateActionPlan(
    character: CharacterEntity,
    rules: ActionRuntimeRulesValue,
  ) {
    const entryCharacterSourceKey = rules.policy.entryCharacterSourceKey.trim();
    if (!entryCharacterSourceKey) {
      return true;
    }

    return this.matchesActionRuntimeEntryCharacter(
      character,
      entryCharacterSourceKey,
    );
  }

  private matchesActionRuntimeEntryCharacter(
    character: CharacterEntity,
    sourceKey: string,
  ) {
    return character.sourceKey?.trim() === sourceKey;
  }

  private async listReadyConnectorEntities() {
    return this.connectorRepo.find({
      where: { status: 'ready' },
      order: { displayName: 'ASC' },
    });
  }

  private async findLatestPendingRun(
    conversationId: string,
    ownerId: string,
    characterId: string,
  ) {
    return this.runRepo.findOne({
      where: [
        {
          conversationId,
          ownerId,
          characterId,
          status: 'awaiting_slots',
        },
        {
          conversationId,
          ownerId,
          characterId,
          status: 'awaiting_confirmation',
        },
      ],
      order: { updatedAt: 'DESC' },
    });
  }

  private async cancelStalePendingRun(input: {
    run: ActionRunEntity;
    rules: ActionRuntimeRulesValue;
    reason: string;
    currentCharacter: CharacterEntity;
  }) {
    const { run, rules, reason, currentCharacter } = input;
    run.status = 'cancelled';
    run.tracePayload = appendTrace(run.tracePayload, {
      phase: 'cancelled',
      reason,
      activeEntryCharacterSourceKey: rules.policy.entryCharacterSourceKey,
      currentCharacterId: currentCharacter.id,
      currentCharacterSourceKey: currentCharacter.sourceKey ?? null,
    });
    run.policyDecisionPayload = {
      ...(run.policyDecisionPayload ?? {}),
      reason,
      activeEntryCharacterSourceKey: rules.policy.entryCharacterSourceKey,
      currentCharacterId: currentCharacter.id,
      currentCharacterSourceKey: currentCharacter.sourceKey ?? null,
    };
    await this.runRepo.save(run);
  }

  private async handlePendingRun(input: {
    run: ActionRunEntity;
    userMessage: string;
    rules: ActionRuntimeRulesValue;
    connectors: ActionConnectorEntity[];
  }): Promise<ActionHandlingResultValue> {
    const { run, userMessage, rules, connectors } = input;
    const normalized = normalizeUserMessage(userMessage);
    const plan = run.planPayload;
    if (!plan) {
      return { handled: false };
    }

    if (
      run.status === 'awaiting_confirmation' &&
      this.matchesKeyword(normalized, rules.policy.rejectionKeywords)
    ) {
      run.status = 'cancelled';
      run.tracePayload = appendTrace(run.tracePayload, {
        phase: 'cancelled',
        reason: 'user_rejected',
      });
      await this.runRepo.save(run);
      await this.captureActionRunSignal(run, plan, 'cancelled');
      return {
        handled: true,
        responseText: this.renderCancelled(plan, rules),
      };
    }

    if (
      run.status === 'awaiting_confirmation' &&
      this.matchesKeyword(normalized, rules.policy.confirmationKeywords)
    ) {
      run.status = 'running';
      run.confirmationPayload = {
        ...(run.confirmationPayload ?? {}),
        confirmedAt: new Date().toISOString(),
        confirmationMessage: normalized,
      };
      run.tracePayload = appendTrace(run.tracePayload, {
        phase: 'confirmation_received',
        confirmationMessage: normalized,
      });
      await this.runRepo.save(run);
      return this.executeRun(run, rules, connectors);
    }

    const mergedPlan = this.mergePlanWithMessage(plan, normalized, rules);
    run.planPayload = mergedPlan;
    run.slotPayload = { ...mergedPlan.slots };
    run.missingSlots = [...mergedPlan.missingSlots];
    run.tracePayload = appendTrace(run.tracePayload, {
      phase: 'user_followup',
      mergedSlots: { ...mergedPlan.slots },
      missingSlots: [...mergedPlan.missingSlots],
    });

    if (mergedPlan.missingSlots.length > 0) {
      run.status = 'awaiting_slots';
      run.policyDecisionPayload = {
        reason: 'missing_required_slots',
        missingSlots: [...mergedPlan.missingSlots],
      };
      await this.runRepo.save(run);
      return {
        handled: true,
        responseText: this.renderClarification(mergedPlan, rules),
      };
    }

    if (this.requiresConfirmation(mergedPlan, rules)) {
      run.status = 'awaiting_confirmation';
      run.confirmationPayload = {
        requestedAt: new Date().toISOString(),
        confirmationKeywords: [...rules.policy.confirmationKeywords],
      };
      await this.runRepo.save(run);
      return {
        handled: true,
        responseText:
          run.status === 'awaiting_confirmation'
            ? this.renderConfirmation(mergedPlan, rules)
            : rules.promptTemplates.pendingConfirmationReminderTemplate,
      };
    }

    run.status = 'running';
    await this.runRepo.save(run);
    return this.executeRun(run, rules, connectors);
  }

  private async executeRun(
    run: ActionRunEntity,
    rules: ActionRuntimeRulesValue,
    connectors: ActionConnectorEntity[],
  ): Promise<ActionHandlingResultValue> {
    const plan = run.planPayload;
    if (!plan) {
      return { handled: false };
    }

    const connector = connectors.find(
      (item) => item.connectorKey === run.connectorKey,
    );
    if (!connector) {
      run.status = 'failed';
      run.errorMessage = '对应连接器当前不可用。';
      run.errorPayload = {
        code: 'CONNECTOR_UNAVAILABLE',
      };
      run.tracePayload = appendTrace(run.tracePayload, {
        phase: 'failed',
        code: 'CONNECTOR_UNAVAILABLE',
      });
      await this.runRepo.save(run);
      await this.captureActionRunSignal(run, plan, 'failed');
      return {
        handled: true,
        responseText: this.renderFailure(plan, run.errorMessage, rules),
      };
    }

    try {
      const execution = await this.executeConnectorOperation(
        plan,
        connector,
        false,
      );
      run.status = 'succeeded';
      run.executionPayload = execution.executionPayload;
      run.resultPayload = execution.resultPayload;
      run.resultSummary = execution.resultSummary;
      run.errorPayload = null;
      run.errorMessage = null;
      run.tracePayload = appendTrace(run.tracePayload, {
        phase: 'succeeded',
        resultSummary: execution.resultSummary,
      });
      await this.runRepo.save(run);
      await this.captureActionRunSignal(run, plan, 'succeeded');
      return {
        handled: true,
        responseText: this.renderSuccess(
          plan,
          connector.displayName,
          execution.resultSummary,
          rules,
        ),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '执行过程中出现未知异常。';
      run.status = 'failed';
      run.errorMessage = message;
      run.errorPayload = {
        code: 'MOCK_EXECUTION_FAILED',
        message,
      };
      run.tracePayload = appendTrace(run.tracePayload, {
        phase: 'failed',
        code: 'MOCK_EXECUTION_FAILED',
        message,
      });
      await this.runRepo.save(run);
      await this.captureActionRunSignal(run, plan, 'failed');
      return {
        handled: true,
        responseText: this.renderFailure(plan, message, rules),
      };
    }
  }

  private async planAction(input: {
    message: string;
    connectors: ActionConnectorEntity[];
    rules: ActionRuntimeRulesValue;
    ownerId?: string;
    characterId?: string;
    conversationId?: string;
  }) {
    const { message, connectors, rules, ownerId, characterId, conversationId } =
      input;
    const cyberAvatarPromptContext =
      await this.buildCyberAvatarActionPromptContext();

    if (rules.plannerMode === 'heuristic') {
      return this.planActionFromMessage(
        message,
        connectors,
        rules,
        cyberAvatarPromptContext,
      );
    }

    try {
      const llmResult = await this.planActionWithLlm({
        message,
        connectors,
        rules,
        ownerId,
        characterId,
        conversationId,
        cyberAvatarPromptContext,
      });
      if (llmResult.handled || rules.plannerMode === 'llm') {
        return llmResult;
      }
    } catch (error) {
      if (rules.plannerMode === 'llm') {
        throw error;
      }
    }

    return this.planActionFromMessage(
      message,
      connectors,
      rules,
      cyberAvatarPromptContext,
    );
  }

  private async planActionWithLlm(input: {
    message: string;
    connectors: ActionConnectorEntity[];
    rules: ActionRuntimeRulesValue;
    ownerId?: string;
    characterId?: string;
    conversationId?: string;
    cyberAvatarPromptContext: string;
  }): Promise<{
    handled: boolean;
    reason: string;
    plan?: ActionPlanValue;
  }> {
    const {
      message,
      connectors,
      rules,
      ownerId,
      characterId,
      conversationId,
      cyberAvatarPromptContext,
    } = input;
    if (!connectors.length) {
      return {
        handled: false,
        reason: '当前没有就绪连接器，LLM planner 跳过。',
      };
    }

    const prompt = this.buildLlmPlannerPrompt(
      message,
      connectors,
      rules,
      cyberAvatarPromptContext,
    );
    const raw = await this.ai.generateJsonObject({
      prompt,
      usageContext: {
        surface: 'app',
        scene: 'action_runtime_plan',
        scopeType: conversationId ? 'conversation' : 'admin_task',
        scopeId: conversationId,
        scopeLabel: conversationId ?? 'action-runtime-plan',
        ownerId,
        characterId,
        conversationId,
      },
      maxTokens: 900,
      temperature: 0.1,
      fallback: {
        handled: false,
        reason: 'planner_failed',
      },
    });

    return this.normalizeLlmPlan(
      raw,
      message,
      connectors,
      rules,
      cyberAvatarPromptContext,
    );
  }

  private planActionFromMessage(
    message: string,
    connectors: ActionConnectorEntity[],
    rules: ActionRuntimeRulesValue,
    cyberAvatarPromptContext = '',
  ): {
    handled: boolean;
    reason: string;
    plan?: ActionPlanValue;
  } {
    const normalized = normalizeUserMessage(message);
    if (!normalized) {
      return {
        handled: false,
        reason: '消息为空，未进入动作链。',
      };
    }

    const smartHomePlan = this.buildSmartHomePlan(
      normalized,
      connectors,
      rules,
      cyberAvatarPromptContext,
    );
    if (smartHomePlan) {
      return {
        handled: true,
        reason: '命中智能家居动作规则。',
        plan: smartHomePlan,
      };
    }

    const foodPlan = this.buildFoodDeliveryPlan(
      normalized,
      connectors,
      rules,
      cyberAvatarPromptContext,
    );
    if (foodPlan) {
      return {
        handled: true,
        reason: '命中外卖动作规则。',
        plan: foodPlan,
      };
    }

    const ticketPlan = this.buildTicketPlan(
      normalized,
      connectors,
      rules,
      cyberAvatarPromptContext,
    );
    if (ticketPlan) {
      return {
        handled: true,
        reason: '命中订票动作规则。',
        plan: ticketPlan,
      };
    }

    return {
      handled: false,
      reason: '当前消息没有命中真实世界动作规则。',
    };
  }

  private buildSmartHomePlan(
    message: string,
    connectors: ActionConnectorEntity[],
    rules: ActionRuntimeRulesValue,
    cyberAvatarPromptContext = '',
  ) {
    const parsed = this.parseSmartHomeSlots(message);

    const hitSmartHome = Boolean(
      parsed.slots.device || parsed.slots.room || message.includes('智能'),
    );
    if (!hitSmartHome) {
      return null;
    }

    const connector = this.findPreferredConnectorForOperation(
      connectors,
      'smart_home_control',
    );
    if (!connector) {
      return null;
    }
    const operation = this.findOperation(connector, 'smart_home_control');
    if (!operation) {
      return null;
    }

    const missingSlots = this.resolveMissingSlots(
      operation.operationKey,
      operation.domain,
      parsed.slots,
    );
    const title = `${(parsed.slots.room as string | undefined) ?? '指定房间'}${
      (parsed.slots.device as string | undefined) ?? '设备'
    }${parsed.actionLabel || '控制'}${
      parsed.slots.temperatureCelsius != null
        ? `${parsed.slots.temperatureCelsius as number}度`
        : ''
    }`;

    return {
      connectorKey: connector.connectorKey,
      operationKey: operation.operationKey,
      domain: operation.domain,
      title,
      goal: message,
      rationale: '识别到设备名称和控制动作，进入智能家居 mock 执行链。',
      riskLevel: operation.riskLevel,
      requiresConfirmation: operation.requiresConfirmation,
      slots: parsed.slots,
      missingSlots,
      matchedKeywords: parsed.matchedKeywords,
      promptPreview: this.buildPromptPreview(
        message,
        connectors,
        rules,
        cyberAvatarPromptContext,
      ),
    };
  }

  private buildFoodDeliveryPlan(
    message: string,
    connectors: ActionConnectorEntity[],
    rules: ActionRuntimeRulesValue,
    cyberAvatarPromptContext = '',
  ) {
    const parsed = this.parseFoodDeliverySlots(message);
    const hitFood =
      message.includes('外卖') ||
      message.includes('点餐') ||
      message.includes('点个') ||
      message.includes('午饭') ||
      message.includes('晚饭') ||
      parsed.matchedKeywords.length > 0;
    if (!hitFood) {
      return null;
    }

    const submitIntent =
      message.includes('下单') ||
      message.includes('直接点') ||
      message.includes('帮我点') ||
      message.includes('现在点');
    const requestedOperationKey = submitIntent
      ? 'food_delivery_submit'
      : 'food_delivery_prepare';
    const connector = this.findPreferredConnectorForOperation(
      connectors,
      requestedOperationKey,
    );
    if (!connector) {
      return null;
    }

    const operation = this.findOperation(connector, requestedOperationKey);
    if (!operation) {
      return null;
    }

    const missingSlots = this.resolveMissingSlots(
      operation.operationKey,
      operation.domain,
      parsed.slots,
    );

    return {
      connectorKey: connector.connectorKey,
      operationKey: operation.operationKey,
      domain: operation.domain,
      title: submitIntent ? '外卖下单' : '外卖候选整理',
      goal: message,
      rationale: submitIntent
        ? '识别到外卖下单意图，先进入确认链。'
        : '识别到外卖需求，先整理候选方案。',
      riskLevel: operation.riskLevel,
      requiresConfirmation: operation.requiresConfirmation,
      slots: parsed.slots,
      missingSlots,
      matchedKeywords: parsed.matchedKeywords,
      promptPreview: this.buildPromptPreview(
        message,
        connectors,
        rules,
        cyberAvatarPromptContext,
      ),
    };
  }

  private buildTicketPlan(
    message: string,
    connectors: ActionConnectorEntity[],
    rules: ActionRuntimeRulesValue,
    cyberAvatarPromptContext = '',
  ) {
    const parsed = this.parseTicketSlots(message);
    const ticketType = message.includes('机票')
      ? '机票'
      : message.includes('火车票') || message.includes('高铁')
        ? '火车票'
        : message.includes('电影票')
          ? '电影票'
          : message.includes('演唱会')
            ? '演出票'
            : '票';
    const hitTicket =
      message.includes('订票') ||
      message.includes('买票') ||
      message.includes('机票') ||
      message.includes('火车票') ||
      message.includes('高铁') ||
      message.includes('电影票') ||
      message.includes('演唱会');
    if (!hitTicket) {
      return null;
    }

    const submitIntent =
      message.includes('直接订') ||
      message.includes('帮我订') ||
      message.includes('买这张') ||
      message.includes('就订这个');
    const requestedOperationKey = submitIntent
      ? 'ticket_booking_submit'
      : 'ticket_booking_prepare';
    const connector = this.findPreferredConnectorForOperation(
      connectors,
      requestedOperationKey,
    );
    if (!connector) {
      return null;
    }

    const operation = this.findOperation(connector, requestedOperationKey);
    if (!operation) {
      return null;
    }

    const slots: Record<string, unknown> = {
      ticketType,
      ...parsed.slots,
    };
    const missingSlots = this.resolveMissingSlots(
      operation.operationKey,
      operation.domain,
      slots,
    );

    return {
      connectorKey: connector.connectorKey,
      operationKey: operation.operationKey,
      domain: operation.domain,
      title: submitIntent ? `${ticketType}预订` : `${ticketType}方案整理`,
      goal: message,
      rationale: submitIntent
        ? '识别到订票执行意图，先进入确认链。'
        : '识别到订票查询意图，先整理候选方案。',
      riskLevel: operation.riskLevel,
      requiresConfirmation: operation.requiresConfirmation,
      slots,
      missingSlots,
      matchedKeywords: parsed.matchedKeywords,
      promptPreview: this.buildPromptPreview(
        message,
        connectors,
        rules,
        cyberAvatarPromptContext,
      ),
    };
  }

  private findPreferredConnectorForOperation(
    connectors: ActionConnectorEntity[],
    operationKey: string,
  ) {
    return [...connectors]
      .filter((connector) => this.findOperation(connector, operationKey))
      .sort((left, right) => {
        const priorityDiff =
          rankConnectorProvider(right.providerType) -
          rankConnectorProvider(left.providerType);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return left.displayName.localeCompare(right.displayName, 'zh-CN');
      })[0];
  }

  private findPreferredConnectorForDomain(
    connectors: ActionConnectorEntity[],
    domain: string,
  ) {
    return [...connectors]
      .filter((connector) =>
        (connector.capabilitiesPayload ?? []).some(
          (capability) => capability.domain === domain,
        ),
      )
      .sort((left, right) => {
        const priorityDiff =
          rankConnectorProvider(right.providerType) -
          rankConnectorProvider(left.providerType);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return left.displayName.localeCompare(right.displayName, 'zh-CN');
      })[0];
  }

  private buildPromptPreview(
    message: string,
    connectors: ActionConnectorEntity[],
    rules: ActionRuntimeRulesValue,
    cyberAvatarPromptContext = '',
  ) {
    const visibleConnectors =
      connectors.length > 0
        ? connectors
        : DEFAULT_ACTION_CONNECTOR_SEEDS.map((seed) =>
            this.connectorRepo.create(seed),
          );
    const connectorSummary = visibleConnectors
      .map((connector) => {
        const operations = (connector.capabilitiesPayload ?? [])
          .map(
            (operation) =>
              `${operation.operationKey}:${operation.requiredSlots.join('+') || 'none'}`,
          )
          .join(', ');
        return `${connector.connectorKey}(${operations})`;
      })
      .join('\n');
    return [
      rules.promptTemplates.plannerSystemPrompt,
      cyberAvatarPromptContext
        ? `赛博分身动作上下文：\n${cyberAvatarPromptContext}`
        : '',
      `用户消息：${message}`,
      `可用连接器：\n${connectorSummary}`,
      `当前 plannerMode：${rules.plannerMode}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildLlmPlannerPrompt(
    message: string,
    connectors: ActionConnectorEntity[],
    rules: ActionRuntimeRulesValue,
    cyberAvatarPromptContext = '',
  ) {
    const connectorCatalog = connectors.map((connector) => ({
      connectorKey: connector.connectorKey,
      displayName: connector.displayName,
      providerType: connector.providerType,
      operations: (connector.capabilitiesPayload ?? []).map((operation) => ({
        operationKey: operation.operationKey,
        domain: operation.domain,
        label: operation.label,
        description: operation.description,
        riskLevel: operation.riskLevel,
        requiresConfirmation: operation.requiresConfirmation,
        requiredSlots: operation.requiredSlots,
      })),
    }));

    return [
      rules.promptTemplates.plannerSystemPrompt,
      cyberAvatarPromptContext
        ? `赛博分身动作上下文：\n${cyberAvatarPromptContext}`
        : '',
      '你必须严格输出 JSON object，不要输出 markdown。',
      '如果当前消息不是明确要你处理真实世界动作，handled=false。',
      '只能从给定连接器和 operationKey 中选择，不允许编造新的 connectorKey / operationKey。',
      '你负责识别意图、选择最合适的 operation、提取 slots、列出 missingSlots。',
      '后端会再次校验缺参、风险和确认逻辑，所以不要把动作结果写成已执行。',
      '输出格式：{"handled":boolean,"reason":"...","connectorKey":"...","operationKey":"...","title":"...","goal":"...","rationale":"...","slots":{},"missingSlots":[],"matchedKeywords":[]}',
      `用户消息：${message}`,
      `可用连接器目录：${JSON.stringify(connectorCatalog, null, 2)}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private normalizeLlmPlan(
    raw: Record<string, unknown>,
    message: string,
    connectors: ActionConnectorEntity[],
    rules: ActionRuntimeRulesValue,
    cyberAvatarPromptContext = '',
  ): {
    handled: boolean;
    reason: string;
    plan?: ActionPlanValue;
  } {
    const handled = raw.handled === true;
    const reason =
      typeof raw.reason === 'string' && raw.reason.trim()
        ? raw.reason.trim()
        : handled
          ? 'LLM planner 命中了真实世界动作。'
          : 'LLM planner 判断当前消息不属于真实世界动作。';
    if (!handled) {
      return {
        handled: false,
        reason,
      };
    }

    const requestedOperationKey =
      typeof raw.operationKey === 'string' ? raw.operationKey.trim() : '';
    if (!requestedOperationKey) {
      return {
        handled: false,
        reason: 'LLM planner 未返回 operationKey。',
      };
    }

    const requestedConnectorKey =
      typeof raw.connectorKey === 'string' ? raw.connectorKey.trim() : '';
    const connector =
      connectors.find(
        (item) =>
          item.connectorKey === requestedConnectorKey &&
          Boolean(this.findOperation(item, requestedOperationKey)),
      ) ??
      this.findPreferredConnectorForOperation(
        connectors,
        requestedOperationKey,
      );
    if (!connector) {
      return {
        handled: false,
        reason: `当前没有可用连接器支持 ${requestedOperationKey}。`,
      };
    }

    const operation = this.findOperation(connector, requestedOperationKey);
    if (!operation) {
      return {
        handled: false,
        reason: `连接器 ${connector.connectorKey} 不支持 ${requestedOperationKey}。`,
      };
    }

    const slots =
      raw.slots && typeof raw.slots === 'object' && !Array.isArray(raw.slots)
        ? { ...(raw.slots as Record<string, unknown>) }
        : {};
    const missingSlots = this.resolveMissingSlots(
      operation.operationKey,
      operation.domain,
      slots,
    );
    const matchedKeywords = Array.isArray(raw.matchedKeywords)
      ? raw.matchedKeywords.map((item) => String(item).trim()).filter(Boolean)
      : this.extractMatchedKeywords(operation.domain, message);

    return {
      handled: true,
      reason,
      plan: {
        connectorKey: connector.connectorKey,
        operationKey: operation.operationKey,
        domain: operation.domain,
        title:
          typeof raw.title === 'string' && raw.title.trim()
            ? raw.title.trim()
            : operation.label,
        goal:
          typeof raw.goal === 'string' && raw.goal.trim()
            ? raw.goal.trim()
            : message,
        rationale:
          typeof raw.rationale === 'string' && raw.rationale.trim()
            ? raw.rationale.trim()
            : reason,
        riskLevel: operation.riskLevel,
        requiresConfirmation: operation.requiresConfirmation,
        slots,
        missingSlots,
        matchedKeywords,
        promptPreview: this.buildLlmPlannerPrompt(
          message,
          connectors,
          rules,
          cyberAvatarPromptContext,
        ),
      },
    };
  }

  private buildDefaultConnectorTestMessage(connector: ActionConnectorEntity) {
    const operationKeys = (connector.capabilitiesPayload ?? []).map(
      (item) => item.operationKey,
    );
    if (operationKeys.includes('smart_home_control')) {
      return '帮我把客厅空调调到24度';
    }
    if (
      operationKeys.includes('food_delivery_submit') ||
      operationKeys.includes('food_delivery_prepare')
    ) {
      return '帮我点个轻食外卖，送到公司前台';
    }
    if (
      operationKeys.includes('ticket_booking_submit') ||
      operationKeys.includes('ticket_booking_prepare')
    ) {
      return '帮我订明天上海到杭州的高铁票';
    }
    return `测试 ${connector.displayName} 的连接状态`;
  }

  private buildConnectorTestPlan(
    connector: ActionConnectorEntity,
    sampleMessage: string,
    rules: ActionRuntimeRulesValue,
  ): ActionPlanValue {
    const preview = this.planActionFromMessage(
      sampleMessage,
      [connector],
      rules,
      '',
    );
    if (
      preview.handled &&
      preview.plan &&
      preview.plan.connectorKey === connector.connectorKey &&
      preview.plan.missingSlots.length === 0
    ) {
      return preview.plan;
    }

    const operationKeys = (connector.capabilitiesPayload ?? []).map(
      (item) => item.operationKey,
    );

    if (operationKeys.includes('smart_home_control')) {
      return {
        connectorKey: connector.connectorKey,
        operationKey: 'smart_home_control',
        domain: 'smart_home',
        title: '客厅空调调到24度',
        goal: sampleMessage,
        rationale: '后台连接器自检使用固定智能家居样例。',
        riskLevel: 'reversible_low_risk',
        requiresConfirmation: false,
        slots: {
          room: '客厅',
          device: '空调',
          action: 'set_temperature',
          temperatureCelsius: 24,
        },
        missingSlots: [],
        matchedKeywords: ['客厅', '空调', '温度'],
        promptPreview: this.buildPromptPreview(
          sampleMessage,
          [connector],
          rules,
        ),
      };
    }
    if (operationKeys.includes('food_delivery_submit')) {
      return {
        connectorKey: connector.connectorKey,
        operationKey: 'food_delivery_submit',
        domain: 'food_delivery',
        title: '外卖下单',
        goal: sampleMessage,
        rationale: '后台连接器自检使用固定外卖样例。',
        riskLevel: 'cost_or_irreversible',
        requiresConfirmation: true,
        slots: {
          preference: '轻食',
          address: '公司前台',
          budgetCny: 48,
        },
        missingSlots: [],
        matchedKeywords: ['轻食', '地址'],
        promptPreview: this.buildPromptPreview(
          sampleMessage,
          [connector],
          rules,
        ),
      };
    }
    if (operationKeys.includes('ticket_booking_submit')) {
      return {
        connectorKey: connector.connectorKey,
        operationKey: 'ticket_booking_submit',
        domain: 'ticketing',
        title: '高铁票预订',
        goal: sampleMessage,
        rationale: '后台连接器自检使用固定订票样例。',
        riskLevel: 'cost_or_irreversible',
        requiresConfirmation: true,
        slots: {
          ticketType: '火车票',
          route: '上海 -> 杭州',
          date: '明天',
        },
        missingSlots: [],
        matchedKeywords: ['上海 -> 杭州', '明天'],
        promptPreview: this.buildPromptPreview(
          sampleMessage,
          [connector],
          rules,
        ),
      };
    }
    throw new BadRequestException(
      `尚未为 ${connector.connectorKey} 定义测试样例。`,
    );
  }

  private async buildCyberAvatarActionPromptContext() {
    return this.cyberAvatar.buildPromptContext({
      sections: [
        'coreInstruction',
        'realWorldInteractionPrompt',
        'actionPlanningPrompt',
        'memoryBlock',
      ],
    });
  }

  private async captureActionRunSignal(
    run: ActionRunEntity,
    plan: ActionPlanValue,
    status: 'succeeded' | 'failed' | 'cancelled',
  ) {
    const summaryText =
      status === 'succeeded'
        ? `完成真实世界动作「${run.title}」：${run.resultSummary ?? '已执行'}`
        : status === 'cancelled'
          ? `取消真实世界动作「${run.title}」`
          : `真实世界动作「${run.title}」执行失败：${
              run.errorMessage ?? '执行失败'
            }`;

    await this.cyberAvatar.captureSignal({
      ownerId: run.ownerId,
      signalType: 'real_world_action',
      sourceSurface: 'action_runtime',
      sourceEntityType: 'action_run',
      sourceEntityId: run.id,
      dedupeKey: `action-run:${run.id}:${status}`,
      summaryText: truncateActionSignalSummary(summaryText),
      payload: {
        status,
        connectorKey: run.connectorKey,
        operationKey: run.operationKey,
        title: run.title,
        goal: run.userGoal,
        riskLevel: run.riskLevel,
        requiresConfirmation: run.requiresConfirmation,
        slots: run.slotPayload,
        matchedKeywords: plan.matchedKeywords,
        resultSummary: run.resultSummary ?? null,
        errorMessage: run.errorMessage ?? null,
      },
      occurredAt: run.updatedAt ?? new Date(),
    });
  }

  private mergePlanWithMessage(
    plan: ActionPlanValue,
    message: string,
    rules: ActionRuntimeRulesValue,
  ) {
    const mergedSlots = {
      ...plan.slots,
      ...this.extractSupplementalSlots(plan.domain, message),
    };
    const nextPlan: ActionPlanValue = {
      ...plan,
      goal: `${plan.goal}\n补充：${message}`,
      slots: mergedSlots,
      matchedKeywords: Array.from(
        new Set([
          ...plan.matchedKeywords,
          ...this.extractMatchedKeywords(plan.domain, message),
        ]),
      ),
      promptPreview: this.buildPromptPreview(
        `${plan.goal}\n补充：${message}`,
        [],
        rules,
      ),
      missingSlots: this.resolveMissingSlots(
        plan.operationKey,
        plan.domain,
        mergedSlots,
      ),
    };
    return nextPlan;
  }

  private extractSupplementalSlots(domain: string, message: string) {
    if (domain === 'smart_home') {
      return this.parseSmartHomeSlots(message).slots;
    }

    if (domain === 'food_delivery') {
      return this.parseFoodDeliverySlots(message).slots;
    }

    if (domain === 'ticketing') {
      return this.parseTicketSlots(message).slots;
    }

    return {};
  }

  private parseSmartHomeSlots(message: string) {
    const matchedKeywords: string[] = [];
    const deviceMap: Array<[string, string[]]> = [
      ['灯', ['灯', '灯光', '台灯']],
      ['空调', ['空调']],
      ['窗帘', ['窗帘']],
      ['电视', ['电视']],
      ['净化器', ['净化器', '空气净化器']],
    ];
    const roomKeywords = ['客厅', '卧室', '书房', '厨房', '阳台', '全屋'];

    const slots: Record<string, unknown> = {};
    const room = roomKeywords.find((keyword) => message.includes(keyword));
    if (room) {
      slots.room = room;
      matchedKeywords.push(room);
    }

    for (const [label, keywords] of deviceMap) {
      if (keywords.some((keyword) => message.includes(keyword))) {
        slots.device = label;
        matchedKeywords.push(label);
        break;
      }
    }

    let actionLabel = '';
    if (
      /调到?\s*\d{2}\s*度/.test(message) ||
      /设为?\s*\d{2}\s*度/.test(message)
    ) {
      slots.action = 'set_temperature';
      actionLabel = '调到';
      matchedKeywords.push('温度');
    } else if (
      ['打开', '开一下', '开', '启动'].some((keyword) =>
        message.includes(keyword),
      )
    ) {
      slots.action = 'turn_on';
      actionLabel = '打开';
    } else if (
      ['关闭', '关掉', '关上', '关', '停掉'].some((keyword) =>
        message.includes(keyword),
      )
    ) {
      slots.action = 'turn_off';
      actionLabel = '关闭';
    }

    const temperatureMatch = message.match(/(\d{2})\s*度/);
    if (temperatureMatch) {
      slots.temperatureCelsius = Number(temperatureMatch[1]);
    }

    return {
      slots,
      matchedKeywords,
      actionLabel,
    };
  }

  private parseFoodDeliverySlots(message: string) {
    const matchedKeywords: string[] = [];
    const preferenceKeywords = [
      '汉堡',
      '轻食',
      '沙拉',
      '咖啡',
      '奶茶',
      '粥',
      '火锅',
      '麻辣烫',
      '面',
      '米饭',
    ];

    const slots: Record<string, unknown> = {};
    const preference = preferenceKeywords.find((keyword) =>
      message.includes(keyword),
    );
    if (preference) {
      slots.preference = preference;
      matchedKeywords.push(preference);
    }

    const budgetMatch = message.match(/(\d{2,4})\s*(?:块|元)/);
    if (budgetMatch) {
      slots.budgetCny = Number(budgetMatch[1]);
      matchedKeywords.push(`预算${budgetMatch[1]}`);
    }

    const addressMatch = message.match(/(?:送到|送去|地址是)([^，。,.；;]+)/);
    if (addressMatch?.[1]?.trim()) {
      slots.address = addressMatch[1].trim();
      matchedKeywords.push('地址');
    }

    return {
      slots,
      matchedKeywords,
    };
  }

  private parseTicketSlots(message: string) {
    const matchedKeywords: string[] = [];
    const slots: Record<string, unknown> = {};

    const routeMatch = message.match(
      /(?:从)?([^\s，。,.；;]{1,8})(?:到|去)([^\s，。,.；;]{1,8})/,
    );
    if (routeMatch) {
      slots.route = `${routeMatch[1].trim()} -> ${routeMatch[2].trim()}`;
      matchedKeywords.push(String(slots.route));
    }

    const dateMatch = message.match(
      /(明天|后天|今晚|周一|周二|周三|周四|周五|周六|周日|下周[一二三四五六日])/,
    );
    if (dateMatch?.[1]) {
      slots.date = dateMatch[1];
      matchedKeywords.push(dateMatch[1]);
    }

    return {
      slots,
      matchedKeywords,
    };
  }

  private extractMatchedKeywords(domain: string, message: string) {
    if (domain === 'smart_home') {
      return ['灯', '空调', '窗帘', '客厅', '卧室', '温度'].filter((keyword) =>
        message.includes(keyword),
      );
    }
    if (domain === 'food_delivery') {
      return ['外卖', '咖啡', '奶茶', '沙拉', '汉堡', '地址'].filter(
        (keyword) => message.includes(keyword),
      );
    }
    if (domain === 'ticketing') {
      return [
        '订票',
        '机票',
        '火车票',
        '电影票',
        '演唱会',
        '明天',
        '后天',
      ].filter((keyword) => message.includes(keyword));
    }
    return [];
  }

  private resolveMissingSlots(
    operationKey: string,
    domain: string,
    slots: Record<string, unknown>,
  ) {
    if (operationKey === 'smart_home_control') {
      const missing: string[] = [];
      if (!slots.device) {
        missing.push('device');
      }
      if (!slots.action) {
        missing.push('action');
      }
      if (
        slots.action === 'set_temperature' &&
        slots.temperatureCelsius == null
      ) {
        missing.push('temperatureCelsius');
      }
      return missing;
    }

    if (operationKey === 'food_delivery_submit') {
      const missing: string[] = [];
      if (!slots.preference) {
        missing.push('preference');
      }
      if (!slots.address) {
        missing.push('address');
      }
      return missing;
    }

    if (
      domain === 'ticketing' &&
      (operationKey === 'ticket_booking_prepare' ||
        operationKey === 'ticket_booking_submit')
    ) {
      const missing: string[] = [];
      if (!slots.route) {
        missing.push('route');
      }
      if (!slots.date) {
        missing.push('date');
      }
      return missing;
    }

    return [];
  }

  private requiresConfirmation(
    plan: ActionPlanValue,
    rules: ActionRuntimeRulesValue,
  ) {
    if (
      rules.policy.autoExecuteRiskLevels.includes(plan.riskLevel) &&
      rules.policy.trustedOperationKeys.includes(plan.operationKey)
    ) {
      return false;
    }
    return plan.requiresConfirmation;
  }

  private matchesKeyword(message: string, keywords: string[]) {
    return keywords.some((keyword) => message.includes(keyword));
  }

  private async executeConnectorOperation(
    plan: ActionPlanValue,
    connector: ActionConnectorEntity | undefined,
    previewOnly: boolean,
  ): Promise<ActionExecutionResultValue> {
    if (!connector) {
      throw new Error('连接器不存在。');
    }

    if (connector.providerType === 'http_bridge') {
      return this.executeHttpBridgeOperation(plan, connector, previewOnly);
    }

    if (connector.providerType === 'official_api') {
      return this.executeOfficialApiOperation(plan, connector, previewOnly);
    }

    if (connector.providerType === 'mock') {
      return this.executeMockOperation(plan, connector, previewOnly);
    }

    throw new Error(
      `当前尚未支持 ${connector.providerType} 类型的真实执行器。`,
    );
  }

  private async executeOfficialApiOperation(
    plan: ActionPlanValue,
    connector: ActionConnectorEntity,
    previewOnly: boolean,
  ): Promise<ActionExecutionResultValue> {
    const endpointConfig =
      connector.endpointConfigPayload &&
      typeof connector.endpointConfigPayload === 'object'
        ? connector.endpointConfigPayload
        : null;
    const provider =
      typeof endpointConfig?.provider === 'string'
        ? endpointConfig.provider.trim()
        : '';
    if (
      provider === 'home_assistant' ||
      connector.connectorKey === 'official-home-assistant-smart-home'
    ) {
      return this.executeHomeAssistantOperation(plan, connector, previewOnly);
    }

    throw new Error(
      `当前未识别 ${connector.displayName} 的 official_api provider。`,
    );
  }

  private async executeHomeAssistantOperation(
    plan: ActionPlanValue,
    connector: ActionConnectorEntity,
    previewOnly: boolean,
  ): Promise<ActionExecutionResultValue> {
    const { endpointConfig, baseUrl, token, timeoutMs } =
      this.resolveHomeAssistantConnection(connector);
    const health = await fetch(`${baseUrl}/api/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const healthText = await health.text();
    if (!health.ok) {
      throw new Error(
        `Home Assistant 健康检查失败 ${health.status}：${healthText.slice(0, 280) || health.statusText}`,
      );
    }

    const target = this.resolveHomeAssistantTarget(plan, endpointConfig);
    if (previewOnly) {
      return {
        resultSummary: target
          ? `Home Assistant 已连通，目标实体 ${target.entityId} 可用于「${plan.title}」。`
          : `Home Assistant 已连通，但当前还没有为「${plan.title}」配置 entity 映射。`,
        executionPayload: {
          providerType: connector.providerType,
          previewOnly: true,
          baseUrl,
          entityId: target?.entityId ?? null,
          serviceDomain: target?.serviceDomain ?? null,
        },
        resultPayload: {
          message: healthText.trim() || 'API running.',
          entityId: target?.entityId ?? null,
          target,
        },
      };
    }

    if (!target) {
      throw new Error(
        `Home Assistant 未找到 ${this.describeSlots(plan.slots)} 对应的 entity 映射。`,
      );
    }

    const serviceCall = this.buildHomeAssistantServiceCall(plan, target);
    const response = await fetch(
      `${baseUrl}/api/services/${serviceCall.domain}/${serviceCall.service}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(serviceCall.payload),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Home Assistant 服务调用失败 ${response.status}：${rawText.slice(0, 280) || response.statusText}`,
      );
    }

    let parsedBody: unknown = null;
    if (rawText.trim()) {
      try {
        parsedBody = JSON.parse(rawText) as unknown;
      } catch {
        parsedBody = rawText;
      }
    }

    return {
      resultSummary: this.buildHomeAssistantResultSummary(plan, target),
      executionPayload: {
        providerType: connector.providerType,
        previewOnly: false,
        baseUrl,
        entityId: target.entityId,
        domain: serviceCall.domain,
        service: serviceCall.service,
        payload: serviceCall.payload,
      },
      resultPayload:
        parsedBody && typeof parsedBody === 'object'
          ? ({
              entityId: target.entityId,
              serviceResult: parsedBody,
            } as Record<string, unknown>)
          : {
              entityId: target.entityId,
              serviceResultRaw: parsedBody ?? rawText,
            },
    };
  }

  private resolveHomeAssistantConnection(
    connector: ActionConnectorEntity,
    overrides?: {
      endpointConfig?: Record<string, unknown>;
      credential?: string;
    },
  ) {
    const endpointConfig =
      overrides?.endpointConfig &&
      typeof overrides.endpointConfig === 'object' &&
      !Array.isArray(overrides.endpointConfig)
        ? overrides.endpointConfig
        : connector.endpointConfigPayload &&
            typeof connector.endpointConfigPayload === 'object'
          ? connector.endpointConfigPayload
          : null;
    const baseUrl =
      typeof endpointConfig?.baseUrl === 'string'
        ? endpointConfig.baseUrl.trim().replace(/\/+$/, '')
        : '';
    if (!baseUrl) {
      throw new Error('Home Assistant connector 缺少 baseUrl。');
    }

    const token =
      overrides?.credential?.trim() ||
      decryptUserApiKey(connector.credentialPayloadEncrypted)?.trim();
    if (!token) {
      throw new Error('Home Assistant connector 尚未配置 access token。');
    }

    const timeoutMs =
      typeof endpointConfig?.timeoutMs === 'number' &&
      endpointConfig.timeoutMs > 0
        ? Math.min(endpointConfig.timeoutMs, 60000)
        : 12000;

    return {
      endpointConfig,
      baseUrl,
      token,
      timeoutMs,
    };
  }

  private resolveHomeAssistantTarget(
    plan: ActionPlanValue,
    endpointConfig: Record<string, unknown> | null,
  ) {
    const deviceTargets =
      endpointConfig?.deviceTargets &&
      typeof endpointConfig.deviceTargets === 'object' &&
      !Array.isArray(endpointConfig.deviceTargets)
        ? (endpointConfig.deviceTargets as Record<string, unknown>)
        : {};
    const room =
      typeof plan.slots.room === 'string' ? plan.slots.room.trim() : '';
    const device =
      typeof plan.slots.device === 'string' ? plan.slots.device.trim() : '';
    const candidateKeys = [
      room && device ? `${room}:${device}` : '',
      room ? `${room}:*` : '',
      device ? `*:${device}` : '',
      device,
    ].filter(Boolean);

    for (const key of candidateKeys) {
      const raw = deviceTargets[key];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        continue;
      }
      const target = raw as Record<string, unknown>;
      const entityId =
        typeof target.entityId === 'string' ? target.entityId.trim() : '';
      if (!entityId) {
        continue;
      }
      return {
        key,
        entityId,
        serviceDomain:
          typeof target.serviceDomain === 'string' &&
          target.serviceDomain.trim()
            ? target.serviceDomain.trim()
            : entityId.split('.')[0] || 'homeassistant',
        turnOnService:
          typeof target.turnOnService === 'string' &&
          target.turnOnService.trim()
            ? target.turnOnService.trim()
            : 'turn_on',
        turnOffService:
          typeof target.turnOffService === 'string' &&
          target.turnOffService.trim()
            ? target.turnOffService.trim()
            : 'turn_off',
        setTemperatureService:
          typeof target.setTemperatureService === 'string' &&
          target.setTemperatureService.trim()
            ? target.setTemperatureService.trim()
            : 'set_temperature',
        temperatureField:
          typeof target.temperatureField === 'string' &&
          target.temperatureField.trim()
            ? target.temperatureField.trim()
            : 'temperature',
        onData:
          target.onData &&
          typeof target.onData === 'object' &&
          !Array.isArray(target.onData)
            ? (target.onData as Record<string, unknown>)
            : {},
        offData:
          target.offData &&
          typeof target.offData === 'object' &&
          !Array.isArray(target.offData)
            ? (target.offData as Record<string, unknown>)
            : {},
        setTemperatureData:
          target.setTemperatureData &&
          typeof target.setTemperatureData === 'object' &&
          !Array.isArray(target.setTemperatureData)
            ? (target.setTemperatureData as Record<string, unknown>)
            : {},
      };
    }

    return null;
  }

  private buildHomeAssistantServiceCall(
    plan: ActionPlanValue,
    target: {
      entityId: string;
      serviceDomain: string;
      turnOnService: string;
      turnOffService: string;
      setTemperatureService: string;
      temperatureField: string;
      onData: Record<string, unknown>;
      offData: Record<string, unknown>;
      setTemperatureData: Record<string, unknown>;
    },
  ) {
    if (plan.slots.action === 'set_temperature') {
      const temperatureCelsius =
        typeof plan.slots.temperatureCelsius === 'number'
          ? plan.slots.temperatureCelsius
          : Number(plan.slots.temperatureCelsius);
      if (!Number.isFinite(temperatureCelsius)) {
        throw new Error('当前动作缺少有效的 temperatureCelsius。');
      }
      return {
        domain: target.serviceDomain,
        service: target.setTemperatureService,
        payload: {
          entity_id: target.entityId,
          ...target.setTemperatureData,
          [target.temperatureField]: temperatureCelsius,
        },
      };
    }

    if (plan.slots.action === 'turn_off') {
      return {
        domain: target.serviceDomain,
        service: target.turnOffService,
        payload: {
          entity_id: target.entityId,
          ...target.offData,
        },
      };
    }

    return {
      domain: target.serviceDomain,
      service: target.turnOnService,
      payload: {
        entity_id: target.entityId,
        ...target.onData,
      },
    };
  }

  private buildHomeAssistantResultSummary(
    plan: ActionPlanValue,
    target: {
      entityId: string;
    },
  ) {
    const room =
      typeof plan.slots.room === 'string' ? plan.slots.room : '指定房间';
    const device =
      typeof plan.slots.device === 'string' ? plan.slots.device : '设备';
    const action = plan.slots.action;
    if (action === 'set_temperature') {
      return `${room}的${device}已通过 Home Assistant 调到 ${plan.slots.temperatureCelsius} 度。`;
    }
    if (action === 'turn_off') {
      return `${room}的${device}已通过 Home Assistant 关闭。`;
    }
    return `${room}的${device}已通过 Home Assistant 打开。目标实体：${target.entityId}`;
  }

  private async discoverHomeAssistantConnector(
    connector: ActionConnectorEntity,
    payload?: {
      query?: string;
      limit?: number;
      endpointConfig?: Record<string, unknown>;
      credential?: string;
    },
  ): Promise<ActionConnectorDiscoveryResultValue> {
    const { baseUrl, token, timeoutMs } = this.resolveHomeAssistantConnection(
      connector,
      {
        endpointConfig: payload?.endpointConfig,
        credential: payload?.credential,
      },
    );
    let registrySnapshot: HomeAssistantRegistrySnapshot | null = null;
    const warnings: string[] = [];
    try {
      registrySnapshot = await this.fetchHomeAssistantRegistrySnapshot(
        baseUrl,
        token,
        timeoutMs,
      );
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Home Assistant registry 拉取失败，已回退到 states 启发式识别：${error.message}`
          : 'Home Assistant registry 拉取失败，已回退到 states 启发式识别。',
      );
    }

    const response = await fetch(`${baseUrl}/api/states`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Home Assistant 实体发现失败 ${response.status}：${rawText.slice(0, 280) || response.statusText}`,
      );
    }

    let parsedBody: unknown = [];
    if (rawText.trim()) {
      try {
        parsedBody = JSON.parse(rawText) as unknown;
      } catch {
        throw new Error('Home Assistant /api/states 返回了无法解析的 JSON。');
      }
    }
    if (!Array.isArray(parsedBody)) {
      throw new Error('Home Assistant /api/states 返回格式异常。');
    }

    const query = payload?.query?.trim() ?? '';
    const normalizedQuery = query.toLowerCase();
    const limit =
      typeof payload?.limit === 'number' && Number.isFinite(payload.limit)
        ? Math.max(1, Math.min(100, Math.round(payload.limit)))
        : 30;
    const rawItems = parsedBody
      .map((item) =>
        this.buildHomeAssistantDiscoveryItem(item, registrySnapshot),
      )
      .filter(
        (
          item,
        ): item is NonNullable<
          ReturnType<typeof this.buildHomeAssistantDiscoveryItem>
        > => Boolean(item),
      )
      .filter((item) => {
        if (!normalizedQuery) {
          return true;
        }
        return [
          item.key,
          item.entityId,
          item.domain,
          item.friendlyName,
          item.state,
          item.suggestedRoom,
          item.suggestedDevice,
          ...item.availableActions,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        const roomSourceDiff =
          this.rankHomeAssistantDiscoverySource(left.roomSource) -
          this.rankHomeAssistantDiscoverySource(right.roomSource);
        if (roomSourceDiff !== 0) {
          return roomSourceDiff;
        }
        if (left.suggestedRoom && !right.suggestedRoom) {
          return -1;
        }
        if (!left.suggestedRoom && right.suggestedRoom) {
          return 1;
        }
        return left.friendlyName.localeCompare(right.friendlyName, 'zh-CN');
      });
    const finalized = this.finalizeHomeAssistantDiscoveryItems(rawItems);
    if (finalized.disambiguatedCount > 0) {
      warnings.push(
        `检测到 ${finalized.disambiguatedCount} 个重复映射键，已自动改成更具体的 key，避免导入时互相覆盖。`,
      );
    }
    const items = finalized.items.slice(0, limit);

    return {
      connector: this.serializeConnector(connector),
      provider: 'home_assistant',
      topologySource: registrySnapshot ? 'websocket_registry' : 'states_only',
      fetchedAt: new Date().toISOString(),
      query,
      warnings,
      itemCount: items.length,
      items,
    };
  }

  private buildHomeAssistantDiscoveryItem(
    item: unknown,
    registrySnapshot?: HomeAssistantRegistrySnapshot | null,
  ) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, unknown>;
    const entityId =
      typeof record.entity_id === 'string' ? record.entity_id.trim() : '';
    if (!entityId || !entityId.includes('.')) {
      return null;
    }

    const domain = entityId.split('.')[0]?.trim();
    if (!domain || !this.isSupportedHomeAssistantDiscoveryDomain(domain)) {
      return null;
    }

    const attributes =
      record.attributes &&
      typeof record.attributes === 'object' &&
      !Array.isArray(record.attributes)
        ? { ...(record.attributes as Record<string, unknown>) }
        : {};
    const friendlyName =
      typeof attributes.friendly_name === 'string' &&
      attributes.friendly_name.trim()
        ? attributes.friendly_name.trim()
        : entityId;
    const state =
      typeof record.state === 'string' && record.state.trim()
        ? record.state.trim()
        : 'unknown';
    const registryEntity = registrySnapshot?.entitiesById.get(entityId) ?? null;
    const registryDevice = registryEntity?.deviceId
      ? (registrySnapshot?.devicesById.get(registryEntity.deviceId) ?? null)
      : null;
    const registryAreaName =
      (registryEntity?.areaId
        ? registrySnapshot?.areasById.get(registryEntity.areaId)?.name
        : '') ||
      (registryDevice?.areaId
        ? registrySnapshot?.areasById.get(registryDevice.areaId)?.name
        : '') ||
      '';
    const heuristicRoom = this.inferHomeAssistantRoom(friendlyName, entityId);
    const suggestedRoom = registryAreaName || heuristicRoom;
    const roomSource = registryEntity?.areaId
      ? 'entity_registry'
      : registryDevice?.areaId
        ? 'device_registry'
        : heuristicRoom
          ? 'heuristic'
          : 'unresolved';
    const registryDeviceName =
      registryDevice?.name || registryEntity?.name || '';
    const suggestedDevice = this.inferHomeAssistantDevice(
      domain,
      friendlyName,
      entityId,
      registryEntity?.name,
      registryDeviceName,
      registryAreaName,
    );
    const deviceSource = registryDevice?.name
      ? 'device_registry'
      : registryEntity?.name
        ? 'entity_registry'
        : 'heuristic';
    const key = suggestedRoom
      ? `${suggestedRoom}:${suggestedDevice}`
      : suggestedDevice || entityId;

    return {
      key,
      entityId,
      domain,
      friendlyName,
      state,
      suggestedRoom,
      suggestedDevice,
      roomSource,
      deviceSource,
      registryAreaName: registryAreaName || null,
      registryDeviceName: registryDeviceName || null,
      targetConfig: this.buildHomeAssistantDiscoveryTargetConfig(
        domain,
        entityId,
        suggestedDevice,
      ),
      availableActions: this.resolveHomeAssistantAvailableActions(
        domain,
        suggestedDevice,
      ),
      attributes: {
        ...attributes,
        registryAreaId:
          registryEntity?.areaId || registryDevice?.areaId || null,
        registryDeviceId: registryEntity?.deviceId || null,
      },
    };
  }

  private isSupportedHomeAssistantDiscoveryDomain(domain: string) {
    return [
      'climate',
      'light',
      'switch',
      'fan',
      'cover',
      'media_player',
      'humidifier',
      'vacuum',
    ].includes(domain);
  }

  private rankHomeAssistantDiscoverySource(source: string) {
    if (source === 'entity_registry') {
      return 0;
    }
    if (source === 'device_registry') {
      return 1;
    }
    if (source === 'heuristic') {
      return 2;
    }
    return 3;
  }

  private finalizeHomeAssistantDiscoveryItems(
    items: Array<
      NonNullable<ReturnType<typeof this.buildHomeAssistantDiscoveryItem>>
    >,
  ) {
    const usedKeys = new Set<string>();
    let disambiguatedCount = 0;
    const nextItems = items.map((item) => {
      let nextKey = item.key;
      if (usedKeys.has(nextKey)) {
        const resolvedKey = this.resolveDisambiguatedHomeAssistantKey(
          item,
          usedKeys,
        );
        if (resolvedKey !== item.key) {
          disambiguatedCount += 1;
        }
        nextKey = resolvedKey;
      }
      usedKeys.add(nextKey);
      return {
        ...item,
        key: nextKey,
      };
    });

    return {
      items: nextItems,
      disambiguatedCount,
    };
  }

  private resolveDisambiguatedHomeAssistantKey(
    item: NonNullable<ReturnType<typeof this.buildHomeAssistantDiscoveryItem>>,
    usedKeys: Set<string>,
  ) {
    const candidates = this.buildHomeAssistantDiscoveryKeyCandidates(item);
    for (const candidate of candidates) {
      if (!candidate || usedKeys.has(candidate)) {
        continue;
      }
      return candidate;
    }
    return item.key;
  }

  private buildHomeAssistantDiscoveryKeyCandidates(
    item: NonNullable<ReturnType<typeof this.buildHomeAssistantDiscoveryItem>>,
  ) {
    const room = item.suggestedRoom.trim();
    const device = item.suggestedDevice.trim();
    const entitySuffix = item.entityId.includes('.')
      ? item.entityId.split('.').slice(1).join('.')
      : item.entityId;
    const labelCandidates = [
      this.extractHomeAssistantSpecificKeyLabel(
        item.registryDeviceName,
        room,
        device,
      ),
      this.extractHomeAssistantSpecificKeyLabel(
        item.friendlyName,
        room,
        device,
      ),
      this.extractHomeAssistantSpecificKeyLabel(entitySuffix, room, device),
      entitySuffix
        ? `${device}-${entitySuffix
            .replace(/[_\s]+/g, '-')
            .replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')}`
        : '',
      item.entityId.replace(/\./g, ':'),
    ]
      .map((value) => value.trim())
      .filter(Boolean);

    return Array.from(
      new Set(
        labelCandidates.map((label) => (room ? `${room}:${label}` : label)),
      ),
    );
  }

  private extractHomeAssistantSpecificKeyLabel(
    rawValue: string | null | undefined,
    room: string,
    genericDevice: string,
  ) {
    const normalized = (rawValue ?? '')
      .trim()
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ');
    if (!normalized) {
      return '';
    }

    let text = normalized;
    if (room) {
      text = text.replace(new RegExp(room, 'gi'), ' ');
    }
    for (const [candidateRoom, patterns] of HOME_ASSISTANT_ROOM_PATTERNS) {
      if (candidateRoom === room) {
        for (const pattern of patterns) {
          text = text.replace(pattern, ' ');
        }
      }
    }
    text = text
      .replace(
        /\b(light|lamp|switch|fan|climate|cover|media player|humidifier|vacuum)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();

    if (!text || text === genericDevice) {
      return '';
    }
    if (
      genericDevice === '灯' &&
      /^(主|副|床头|吊|台|壁|落地|氛围)$/u.test(text)
    ) {
      return `${text}灯`;
    }
    return text;
  }

  private async fetchHomeAssistantRegistrySnapshot(
    baseUrl: string,
    token: string,
    timeoutMs: number,
  ): Promise<HomeAssistantRegistrySnapshot> {
    const wsUrl = this.resolveHomeAssistantWebsocketUrl(baseUrl);
    const commands = [
      { id: 1, type: 'config/area_registry/list' },
      { id: 2, type: 'config/device_registry/list' },
      { id: 3, type: 'config/entity_registry/list_for_display' },
    ] as const;

    const results = await new Promise<{
      areas: unknown;
      devices: unknown;
      entities: unknown;
    }>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      let settled = false;
      const commandResults = new Map<number, unknown>();
      const timeout = setTimeout(() => {
        fail(new Error('Home Assistant WebSocket registry 拉取超时。'));
      }, timeoutMs);

      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        try {
          socket.close();
        } catch {
          // noop
        }
        reject(error);
      };

      const finish = () => {
        if (settled || commandResults.size < commands.length) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        try {
          socket.close();
        } catch {
          // noop
        }
        resolve({
          areas: commandResults.get(1),
          devices: commandResults.get(2),
          entities: commandResults.get(3),
        });
      };

      socket.addEventListener('message', (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          fail(new Error('Home Assistant WebSocket 返回了无法解析的消息。'));
          return;
        }

        if (message.type === 'auth_required') {
          socket.send(
            JSON.stringify({
              type: 'auth',
              access_token: token,
            }),
          );
          return;
        }

        if (message.type === 'auth_invalid') {
          fail(
            new Error(
              typeof message.message === 'string' && message.message.trim()
                ? `Home Assistant WebSocket 鉴权失败：${message.message.trim()}`
                : 'Home Assistant WebSocket 鉴权失败。',
            ),
          );
          return;
        }

        if (message.type === 'auth_ok') {
          for (const command of commands) {
            socket.send(JSON.stringify(command));
          }
          return;
        }

        if (message.type !== 'result') {
          return;
        }

        const id =
          typeof message.id === 'number' ? message.id : Number(message.id);
        if (
          !Number.isFinite(id) ||
          !commands.some((command) => command.id === id)
        ) {
          return;
        }

        if (message.success !== true) {
          const errorMessage =
            message.error && typeof message.error === 'object'
              ? ((message.error as Record<string, unknown>).message as string)
              : null;
          fail(
            new Error(
              errorMessage?.trim()
                ? `Home Assistant WebSocket command ${id} 失败：${errorMessage.trim()}`
                : `Home Assistant WebSocket command ${id} 失败。`,
            ),
          );
          return;
        }

        commandResults.set(id, message.result);
        finish();
      });

      socket.addEventListener('error', () => {
        fail(new Error('Home Assistant WebSocket 连接失败。'));
      });

      socket.addEventListener('close', (event) => {
        if (!settled && commandResults.size < commands.length) {
          fail(
            new Error(
              `Home Assistant WebSocket 连接提前关闭（code=${event.code || 'unknown'}）。`,
            ),
          );
        }
      });
    });

    return this.buildHomeAssistantRegistrySnapshot(results);
  }

  private resolveHomeAssistantWebsocketUrl(baseUrl: string) {
    if (baseUrl.startsWith('https://')) {
      return `wss://${baseUrl.slice('https://'.length)}/api/websocket`;
    }
    if (baseUrl.startsWith('http://')) {
      return `ws://${baseUrl.slice('http://'.length)}/api/websocket`;
    }
    return `${baseUrl.replace(/^ws/i, 'ws')}/api/websocket`;
  }

  private buildHomeAssistantRegistrySnapshot(input: {
    areas: unknown;
    devices: unknown;
    entities: unknown;
  }): HomeAssistantRegistrySnapshot {
    const areasById = new Map<string, HomeAssistantRegistryArea>();
    const devicesById = new Map<string, HomeAssistantRegistryDevice>();
    const entitiesById = new Map<string, HomeAssistantRegistryEntity>();

    if (Array.isArray(input.areas)) {
      for (const item of input.areas) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          continue;
        }
        const record = item as Record<string, unknown>;
        const areaId =
          typeof record.area_id === 'string' ? record.area_id.trim() : '';
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        if (!areaId || !name) {
          continue;
        }
        areasById.set(areaId, {
          areaId,
          name,
        });
      }
    }

    if (Array.isArray(input.devices)) {
      for (const item of input.devices) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          continue;
        }
        const record = item as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        const areaId =
          typeof record.area_id === 'string' ? record.area_id.trim() : '';
        const name = [record.name_by_user, record.name, record.model].find(
          (value) => typeof value === 'string' && value.trim(),
        ) as string | undefined;
        if (!id) {
          continue;
        }
        devicesById.set(id, {
          id,
          areaId,
          name: name?.trim() || id,
        });
      }
    }

    const rawEntities =
      input.entities &&
      typeof input.entities === 'object' &&
      !Array.isArray(input.entities) &&
      Array.isArray((input.entities as Record<string, unknown>).entities)
        ? ((input.entities as Record<string, unknown>).entities as unknown[])
        : Array.isArray(input.entities)
          ? input.entities
          : [];
    for (const item of rawEntities) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const record = item as Record<string, unknown>;
      const entityId = [record.ei, record.entity_id].find(
        (value) => typeof value === 'string' && value.trim(),
      ) as string | undefined;
      if (!entityId?.trim()) {
        continue;
      }
      const areaId = [record.ai, record.area_id].find(
        (value) => typeof value === 'string' && value.trim(),
      ) as string | undefined;
      const deviceId = [record.di, record.device_id].find(
        (value) => typeof value === 'string' && value.trim(),
      ) as string | undefined;
      const name = [record.en, record.name, record.original_name].find(
        (value) => typeof value === 'string' && value.trim(),
      ) as string | undefined;
      entitiesById.set(entityId.trim(), {
        entityId: entityId.trim(),
        areaId: areaId?.trim() || '',
        deviceId: deviceId?.trim() || '',
        name: name?.trim() || entityId.trim(),
      });
    }

    return {
      areasById,
      devicesById,
      entitiesById,
    };
  }

  private inferHomeAssistantRoom(...candidates: string[]) {
    const haystack = candidates.join(' ');
    for (const [room, patterns] of HOME_ASSISTANT_ROOM_PATTERNS) {
      if (patterns.some((pattern) => pattern.test(haystack))) {
        return room;
      }
    }
    return '';
  }

  private inferHomeAssistantDevice(
    domain: string,
    friendlyName: string,
    entityId: string,
    entityRegistryName?: string,
    registryDeviceName?: string,
    registryAreaName?: string,
  ) {
    const haystack = [
      friendlyName,
      entityId,
      entityRegistryName,
      registryDeviceName,
      registryAreaName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (domain === 'climate') {
      return '空调';
    }
    if (domain === 'light') {
      return '灯';
    }
    if (domain === 'cover') {
      return '窗帘';
    }
    if (domain === 'fan') {
      return '风扇';
    }
    if (domain === 'humidifier') {
      return '加湿器';
    }
    if (domain === 'vacuum') {
      return '扫地机器人';
    }
    if (domain === 'media_player') {
      if (
        /(tv|television|电视|投影|projector|display|screen)/i.test(haystack)
      ) {
        return '电视';
      }
      return '音箱';
    }
    if (domain === 'switch') {
      if (/(插座|排插|socket|plug|outlet)/i.test(haystack)) {
        return '插座';
      }
      if (/(净化|purifier)/i.test(haystack)) {
        return '净化器';
      }
      return '开关';
    }
    return '设备';
  }

  private buildHomeAssistantDiscoveryTargetConfig(
    domain: string,
    entityId: string,
    suggestedDevice: string,
  ) {
    const targetConfig: Record<string, unknown> = {
      entityId,
      serviceDomain: domain,
    };

    if (domain === 'climate') {
      targetConfig.turnOnService = 'turn_on';
      targetConfig.turnOffService = 'turn_off';
      targetConfig.setTemperatureService = 'set_temperature';
      targetConfig.temperatureField = 'temperature';
      return targetConfig;
    }

    if (domain === 'cover') {
      targetConfig.turnOnService = 'open_cover';
      targetConfig.turnOffService = 'close_cover';
      return targetConfig;
    }

    if (suggestedDevice === '净化器') {
      targetConfig.turnOnService = 'turn_on';
      targetConfig.turnOffService = 'turn_off';
      return targetConfig;
    }

    targetConfig.turnOnService = 'turn_on';
    targetConfig.turnOffService = 'turn_off';
    return targetConfig;
  }

  private resolveHomeAssistantAvailableActions(
    domain: string,
    suggestedDevice: string,
  ) {
    if (domain === 'climate') {
      return ['turn_on', 'turn_off', 'set_temperature'];
    }
    if (domain === 'cover') {
      return ['turn_on', 'turn_off'];
    }
    if (suggestedDevice === '净化器') {
      return ['turn_on', 'turn_off'];
    }
    return ['turn_on', 'turn_off'];
  }

  private async executeHttpBridgeOperation(
    plan: ActionPlanValue,
    connector: ActionConnectorEntity,
    previewOnly: boolean,
  ): Promise<ActionExecutionResultValue> {
    const endpointConfig =
      connector.endpointConfigPayload &&
      typeof connector.endpointConfigPayload === 'object'
        ? connector.endpointConfigPayload
        : null;
    const url =
      typeof endpointConfig?.url === 'string' ? endpointConfig.url.trim() : '';
    if (!url) {
      throw new Error(
        `连接器 ${connector.displayName} 缺少 endpointConfig.url。`,
      );
    }

    const method =
      typeof endpointConfig?.method === 'string' &&
      ['POST', 'PUT', 'PATCH'].includes(endpointConfig.method.toUpperCase())
        ? endpointConfig.method.toUpperCase()
        : 'POST';
    const timeoutMs =
      typeof endpointConfig?.timeoutMs === 'number' &&
      endpointConfig.timeoutMs > 0
        ? Math.min(endpointConfig.timeoutMs, 60000)
        : 15000;
    const configuredHeaders =
      endpointConfig?.headers &&
      typeof endpointConfig.headers === 'object' &&
      !Array.isArray(endpointConfig.headers)
        ? Object.entries(
            endpointConfig.headers as Record<string, unknown>,
          ).reduce(
            (accumulator, [key, value]) => {
              if (typeof value === 'string' && key.trim()) {
                accumulator[key.trim()] = value;
              }
              return accumulator;
            },
            {} as Record<string, string>,
          )
        : {};

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...configuredHeaders,
      },
      body: JSON.stringify({
        connectorKey: connector.connectorKey,
        operationKey: plan.operationKey,
        domain: plan.domain,
        title: plan.title,
        goal: plan.goal,
        riskLevel: plan.riskLevel,
        requiresConfirmation: plan.requiresConfirmation,
        previewOnly,
        slots: plan.slots,
        missingSlots: plan.missingSlots,
        sentAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(
        `HTTP bridge 返回 ${response.status}：${rawText.slice(0, 280) || response.statusText}`,
      );
    }

    let parsedBody: Record<string, unknown> | null = null;
    if (rawText.trim()) {
      try {
        parsedBody = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        parsedBody = {
          raw: rawText,
        };
      }
    }

    if (parsedBody?.ok === false) {
      throw new Error(
        typeof parsedBody.errorMessage === 'string'
          ? parsedBody.errorMessage
          : typeof parsedBody.message === 'string'
            ? parsedBody.message
            : 'HTTP bridge 显式返回失败。',
      );
    }

    const resultSummary =
      typeof parsedBody?.resultSummary === 'string' &&
      parsedBody.resultSummary.trim()
        ? parsedBody.resultSummary.trim()
        : typeof parsedBody?.summary === 'string' && parsedBody.summary.trim()
          ? parsedBody.summary.trim()
          : typeof parsedBody?.message === 'string' && parsedBody.message.trim()
            ? parsedBody.message.trim()
            : `${connector.displayName} 已完成 ${plan.title}`;

    return {
      resultSummary,
      executionPayload:
        parsedBody?.execution &&
        typeof parsedBody.execution === 'object' &&
        !Array.isArray(parsedBody.execution)
          ? (parsedBody.execution as Record<string, unknown>)
          : {
              providerType: connector.providerType,
              previewOnly,
              httpStatus: response.status,
              url,
              method,
            },
      resultPayload:
        parsedBody?.result &&
        typeof parsedBody.result === 'object' &&
        !Array.isArray(parsedBody.result)
          ? (parsedBody.result as Record<string, unknown>)
          : (parsedBody ?? {}),
    };
  }

  private executeMockOperation(
    plan: ActionPlanValue,
    connector: ActionConnectorEntity | undefined,
    previewOnly: boolean,
  ): ActionExecutionResultValue {
    if (plan.operationKey === 'smart_home_control') {
      const room = (plan.slots.room as string | undefined) ?? '默认房间';
      const device = (plan.slots.device as string | undefined) ?? '设备';
      const action = plan.slots.action as string | undefined;
      const temperatureCelsius = plan.slots.temperatureCelsius as
        | number
        | undefined;
      const actionSummary =
        action === 'turn_on'
          ? '已打开'
          : action === 'turn_off'
            ? '已关闭'
            : action === 'set_temperature'
              ? `已调到 ${temperatureCelsius ?? '--'} 度`
              : '已更新';
      return {
        resultSummary: `${room}的${device}${actionSummary}`,
        executionPayload: {
          providerType: connector?.providerType ?? 'mock',
          previewOnly,
          simulatedState: {
            room,
            device,
            action,
            temperatureCelsius,
          },
        },
        resultPayload: {
          room,
          device,
          action,
          temperatureCelsius,
        },
      };
    }

    if (plan.operationKey === 'food_delivery_prepare') {
      const preference =
        (plan.slots.preference as string | undefined) ?? '家常简餐';
      const budgetCny = (plan.slots.budgetCny as number | undefined) ?? 48;
      return {
        resultSummary: `我先整理了 3 家适合「${preference}」的 mock 外卖，预算控制在 ${budgetCny} 元内，预计 30 分钟左右送达。`,
        executionPayload: {
          providerType: connector?.providerType ?? 'mock',
          previewOnly,
          recommendationCount: 3,
        },
        resultPayload: {
          options: [
            {
              shop: 'Mock 轻食厨房',
              estimateMinutes: 26,
              priceCny: budgetCny - 6,
            },
            {
              shop: 'Mock 便当站',
              estimateMinutes: 31,
              priceCny: budgetCny - 10,
            },
            {
              shop: 'Mock 快手热食',
              estimateMinutes: 34,
              priceCny: budgetCny - 4,
            },
          ],
        },
      };
    }

    if (plan.operationKey === 'food_delivery_submit') {
      const preference = plan.slots.preference as string;
      const address = plan.slots.address as string;
      const orderRef = previewOnly
        ? 'PREVIEW-ORDER'
        : createMockReference('order');
      return {
        resultSummary: `我已经按「${preference}」生成了一笔 mock 外卖订单，送达地址是「${address}」，参考单号 ${orderRef}。`,
        executionPayload: {
          providerType: connector?.providerType ?? 'mock',
          previewOnly,
          submittedAt: new Date().toISOString(),
          orderRef,
        },
        resultPayload: {
          orderRef,
          address,
          etaMinutes: 32,
          totalCny: 42,
        },
      };
    }

    if (plan.operationKey === 'ticket_booking_prepare') {
      const route = plan.slots.route as string;
      const date = plan.slots.date as string;
      return {
        resultSummary: `我先整理了 ${route} 在 ${date} 的 3 个 mock 票务方案，暂时还没有提交预订。`,
        executionPayload: {
          providerType: connector?.providerType ?? 'mock',
          previewOnly,
          optionCount: 3,
        },
        resultPayload: {
          route,
          date,
          options: [
            { departAt: '09:15', arriveAt: '11:40', priceCny: 398 },
            { departAt: '13:30', arriveAt: '15:55', priceCny: 438 },
            { departAt: '18:20', arriveAt: '20:45', priceCny: 416 },
          ],
        },
      };
    }

    if (plan.operationKey === 'ticket_booking_submit') {
      const route = plan.slots.route as string;
      const date = plan.slots.date as string;
      const reservationRef = previewOnly
        ? 'PREVIEW-RESERVATION'
        : createMockReference('ticket');
      return {
        resultSummary: `我已经生成了一笔 ${route} / ${date} 的 mock 票务预订，参考编号 ${reservationRef}。`,
        executionPayload: {
          providerType: connector?.providerType ?? 'mock',
          previewOnly,
          reservationRef,
        },
        resultPayload: {
          route,
          date,
          reservationRef,
          totalCny: 438,
        },
      };
    }

    throw new Error(`Unsupported mock operation: ${plan.operationKey}`);
  }

  private renderClarification(
    plan: ActionPlanValue,
    rules: ActionRuntimeRulesValue,
  ) {
    return renderTemplate(rules.promptTemplates.clarificationTemplate, {
      title: plan.title,
      missingSlots: plan.missingSlots
        .map((slot) => this.humanizeSlotName(slot))
        .join('、'),
    });
  }

  private renderConfirmation(
    plan: ActionPlanValue,
    rules: ActionRuntimeRulesValue,
  ) {
    return renderTemplate(rules.promptTemplates.confirmationTemplate, {
      title: plan.title,
      slotSummary: this.describeSlots(plan.slots),
    });
  }

  private renderSuccess(
    plan: ActionPlanValue,
    connectorName: string,
    resultSummary: string,
    rules: ActionRuntimeRulesValue,
  ) {
    return renderTemplate(rules.promptTemplates.successTemplate, {
      connectorName,
      title: plan.title,
      resultSummary,
    });
  }

  private renderFailure(
    plan: ActionPlanValue,
    errorMessage: string,
    rules: ActionRuntimeRulesValue,
  ) {
    return renderTemplate(rules.promptTemplates.failureTemplate, {
      title: plan.title,
      errorMessage,
    });
  }

  private renderCancelled(
    plan: ActionPlanValue,
    rules: ActionRuntimeRulesValue,
  ) {
    return renderTemplate(rules.promptTemplates.cancelledTemplate, {
      title: plan.title,
    });
  }

  private humanizeSlotName(slot: string) {
    switch (slot) {
      case 'device':
        return '设备';
      case 'action':
        return '控制动作';
      case 'temperatureCelsius':
        return '目标温度';
      case 'preference':
        return '想吃什么';
      case 'address':
        return '送达地址';
      case 'route':
        return '出发地和目的地';
      case 'date':
        return '日期/时间';
      default:
        return slot;
    }
  }

  private describeSlots(slots: Record<string, unknown>) {
    const entries = Object.entries(slots);
    if (!entries.length) {
      return '暂时还没有稳定参数';
    }
    return entries
      .map(
        ([key, value]) =>
          `${this.humanizeSlotName(key)}：${this.humanizeSlotValue(key, value)}`,
      )
      .join('；');
  }

  private humanizeSlotValue(key: string, value: unknown) {
    if (key === 'action') {
      if (value === 'turn_on') {
        return '打开';
      }
      if (value === 'turn_off') {
        return '关闭';
      }
      if (value === 'set_temperature') {
        return '调温';
      }
    }
    return String(value);
  }

  private findOperation(
    connector: ActionConnectorEntity | ActionConnectorSeedValue,
    operationKey: string,
  ) {
    return (connector.capabilitiesPayload ?? []).find(
      (operation) => operation.operationKey === operationKey,
    );
  }

  private serializeConnector(connector: ActionConnectorEntity) {
    return {
      id: connector.id,
      connectorKey: connector.connectorKey,
      displayName: connector.displayName,
      providerType: connector.providerType,
      status: connector.status,
      endpointConfig: connector.endpointConfigPayload ?? null,
      credentialConfigured: Boolean(
        connector.credentialPayloadEncrypted?.trim(),
      ),
      capabilities: [...(connector.capabilitiesPayload ?? [])],
      lastHealthCheckAt: connector.lastHealthCheckAt?.toISOString() ?? null,
      lastError: connector.lastError ?? null,
      updatedAt: connector.updatedAt.toISOString(),
    };
  }

  private serializeRun(run: ActionRunEntity) {
    return {
      id: run.id,
      conversationId: run.conversationId,
      ownerId: run.ownerId,
      characterId: run.characterId,
      connectorKey: run.connectorKey,
      operationKey: run.operationKey,
      status: run.status,
      title: run.title,
      userGoal: run.userGoal,
      riskLevel: run.riskLevel,
      requiresConfirmation: run.requiresConfirmation,
      slotPayload: run.slotPayload ?? {},
      missingSlots: run.missingSlots ?? [],
      resultSummary: run.resultSummary ?? null,
      errorMessage: run.errorMessage ?? null,
      updatedAt: run.updatedAt.toISOString(),
      createdAt: run.createdAt.toISOString(),
    };
  }

  private serializeRunDetail(run: ActionRunEntity) {
    return {
      ...this.serializeRun(run),
      planPayload: run.planPayload ?? null,
      policyDecisionPayload: run.policyDecisionPayload ?? null,
      confirmationPayload: run.confirmationPayload ?? null,
      executionPayload: run.executionPayload ?? null,
      resultPayload: run.resultPayload ?? null,
      errorPayload: run.errorPayload ?? null,
      tracePayload: run.tracePayload ?? null,
    };
  }
}
