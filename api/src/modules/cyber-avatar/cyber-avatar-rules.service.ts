import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigService } from '../config/config.service';
import {
  CYBER_AVATAR_RUNTIME_RULES_CONFIG_KEY,
  DEFAULT_CYBER_AVATAR_RUNTIME_RULES,
} from './cyber-avatar.constants';
import type {
  CyberAvatarMergeRules,
  CyberAvatarPromptTemplates,
  CyberAvatarRuntimeRules,
  CyberAvatarSchedulingRules,
  CyberAvatarSourceToggles,
} from './cyber-avatar.types';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeText(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return clamp(value, min, max);
}

function normalizeSourceToggles(
  value: Partial<CyberAvatarSourceToggles> | undefined,
): CyberAvatarSourceToggles {
  const fallback = DEFAULT_CYBER_AVATAR_RUNTIME_RULES.sourceToggles;
  return {
    includeDirectMessages: sanitizeBoolean(
      value?.includeDirectMessages,
      fallback.includeDirectMessages,
    ),
    includeGroupMessages: sanitizeBoolean(
      value?.includeGroupMessages,
      fallback.includeGroupMessages,
    ),
    includeMomentPosts: sanitizeBoolean(
      value?.includeMomentPosts,
      fallback.includeMomentPosts,
    ),
    includeFeedPosts: sanitizeBoolean(
      value?.includeFeedPosts,
      fallback.includeFeedPosts,
    ),
    includeChannelPosts: sanitizeBoolean(
      value?.includeChannelPosts,
      fallback.includeChannelPosts,
    ),
    includeFeedInteractions: sanitizeBoolean(
      value?.includeFeedInteractions,
      fallback.includeFeedInteractions,
    ),
    includeFriendshipEvents: sanitizeBoolean(
      value?.includeFriendshipEvents,
      fallback.includeFriendshipEvents,
    ),
    includeOwnerProfileUpdates: sanitizeBoolean(
      value?.includeOwnerProfileUpdates,
      fallback.includeOwnerProfileUpdates,
    ),
    includeLocationUpdates: sanitizeBoolean(
      value?.includeLocationUpdates,
      fallback.includeLocationUpdates,
    ),
  };
}

function normalizeSchedulingRules(
  value: Partial<CyberAvatarSchedulingRules> | undefined,
): CyberAvatarSchedulingRules {
  const fallback = DEFAULT_CYBER_AVATAR_RUNTIME_RULES.scheduling;
  return {
    minSignalsPerIncrementalRun: sanitizeNumber(
      value?.minSignalsPerIncrementalRun,
      fallback.minSignalsPerIncrementalRun,
      1,
      100,
    ),
    maxSignalsPerIncrementalRun: sanitizeNumber(
      value?.maxSignalsPerIncrementalRun,
      fallback.maxSignalsPerIncrementalRun,
      1,
      200,
    ),
    minMinutesBetweenIncrementalRuns: sanitizeNumber(
      value?.minMinutesBetweenIncrementalRuns,
      fallback.minMinutesBetweenIncrementalRuns,
      1,
      24 * 60,
    ),
    incrementalScanEveryMinutes: sanitizeNumber(
      value?.incrementalScanEveryMinutes,
      fallback.incrementalScanEveryMinutes,
      1,
      120,
    ),
    deepRefreshEveryHours: sanitizeNumber(
      value?.deepRefreshEveryHours,
      fallback.deepRefreshEveryHours,
      1,
      24 * 14,
    ),
    recentWindowDays: sanitizeNumber(
      value?.recentWindowDays,
      fallback.recentWindowDays,
      1,
      60,
    ),
    stableCoreWindowDays: sanitizeNumber(
      value?.stableCoreWindowDays,
      fallback.stableCoreWindowDays,
      1,
      180,
    ),
    fullRebuildWindowDays: sanitizeNumber(
      value?.fullRebuildWindowDays,
      fallback.fullRebuildWindowDays,
      1,
      365,
    ),
  };
}

function normalizeMergeRules(
  value: Partial<CyberAvatarMergeRules> | undefined,
): CyberAvatarMergeRules {
  const fallback = DEFAULT_CYBER_AVATAR_RUNTIME_RULES.mergeRules;
  return {
    stableCoreChangeThreshold: sanitizeNumber(
      value?.stableCoreChangeThreshold,
      fallback.stableCoreChangeThreshold,
      0,
      1,
    ),
    boundaryChangeThreshold: sanitizeNumber(
      value?.boundaryChangeThreshold,
      fallback.boundaryChangeThreshold,
      0,
      1,
    ),
    preferenceDecayDays: sanitizeNumber(
      value?.preferenceDecayDays,
      fallback.preferenceDecayDays,
      1,
      90,
    ),
    openLoopDecayDays: sanitizeNumber(
      value?.openLoopDecayDays,
      fallback.openLoopDecayDays,
      1,
      60,
    ),
  };
}

function normalizePromptTemplates(
  value: Partial<CyberAvatarPromptTemplates> | undefined,
): CyberAvatarPromptTemplates {
  const fallback = DEFAULT_CYBER_AVATAR_RUNTIME_RULES.promptTemplates;
  return {
    incrementalDigestPrompt: sanitizeText(
      value?.incrementalDigestPrompt,
      fallback.incrementalDigestPrompt,
    ),
    deepRefreshPrompt: sanitizeText(
      value?.deepRefreshPrompt,
      fallback.deepRefreshPrompt,
    ),
    projectionCoreInstructionTemplate: sanitizeText(
      value?.projectionCoreInstructionTemplate,
      fallback.projectionCoreInstructionTemplate,
    ),
    projectionWorldInteractionTemplate: sanitizeText(
      value?.projectionWorldInteractionTemplate,
      fallback.projectionWorldInteractionTemplate,
    ),
    projectionRealWorldInteractionTemplate: sanitizeText(
      value?.projectionRealWorldInteractionTemplate,
      fallback.projectionRealWorldInteractionTemplate,
    ),
    projectionProactiveTemplate: sanitizeText(
      value?.projectionProactiveTemplate,
      fallback.projectionProactiveTemplate,
    ),
    projectionActionPlanningTemplate: sanitizeText(
      value?.projectionActionPlanningTemplate,
      fallback.projectionActionPlanningTemplate,
    ),
    projectionMemoryTemplate: sanitizeText(
      value?.projectionMemoryTemplate,
      fallback.projectionMemoryTemplate,
    ),
  };
}

export function normalizeCyberAvatarRuntimeRules(
  input?: Partial<CyberAvatarRuntimeRules> | null,
): CyberAvatarRuntimeRules {
  const fallback = DEFAULT_CYBER_AVATAR_RUNTIME_RULES;
  const signalWeights = {
    ...fallback.signalWeights,
    ...Object.fromEntries(
      Object.entries(input?.signalWeights ?? {}).map(([key, value]) => [
        key,
        sanitizeNumber(value, fallback.signalWeights[key] ?? 1, 0, 5),
      ]),
    ),
  };

  const scheduling = normalizeSchedulingRules(input?.scheduling);
  const minSignalsPerIncrementalRun = Math.min(
    scheduling.minSignalsPerIncrementalRun,
    scheduling.maxSignalsPerIncrementalRun,
  );

  return {
    enabled: sanitizeBoolean(input?.enabled, fallback.enabled),
    captureEnabled: sanitizeBoolean(
      input?.captureEnabled,
      fallback.captureEnabled,
    ),
    incrementalUpdateEnabled: sanitizeBoolean(
      input?.incrementalUpdateEnabled,
      fallback.incrementalUpdateEnabled,
    ),
    deepRefreshEnabled: sanitizeBoolean(
      input?.deepRefreshEnabled,
      fallback.deepRefreshEnabled,
    ),
    projectionEnabled: sanitizeBoolean(
      input?.projectionEnabled,
      fallback.projectionEnabled,
    ),
    pauseAutoUpdates: sanitizeBoolean(
      input?.pauseAutoUpdates,
      fallback.pauseAutoUpdates,
    ),
    sourceToggles: normalizeSourceToggles(input?.sourceToggles),
    scheduling: {
      ...scheduling,
      minSignalsPerIncrementalRun,
    },
    mergeRules: normalizeMergeRules(input?.mergeRules),
    signalWeights,
    promptTemplates: normalizePromptTemplates(input?.promptTemplates),
  };
}

@Injectable()
export class CyberAvatarRulesService {
  private readonly logger = new Logger(CyberAvatarRulesService.name);
  private cachedRules: CyberAvatarRuntimeRules =
    DEFAULT_CYBER_AVATAR_RUNTIME_RULES;

  constructor(private readonly systemConfig: SystemConfigService) {}

  async getRules(): Promise<CyberAvatarRuntimeRules> {
    const raw = await this.systemConfig.getConfig(
      CYBER_AVATAR_RUNTIME_RULES_CONFIG_KEY,
    );
    if (!raw) {
      this.cachedRules = DEFAULT_CYBER_AVATAR_RUNTIME_RULES;
      return this.cachedRules;
    }

    try {
      this.cachedRules = normalizeCyberAvatarRuntimeRules(
        JSON.parse(raw) as Partial<CyberAvatarRuntimeRules>,
      );
      return this.cachedRules;
    } catch {
      this.logger.warn(
        `Failed to parse ${CYBER_AVATAR_RUNTIME_RULES_CONFIG_KEY}, using defaults.`,
      );
      this.cachedRules = DEFAULT_CYBER_AVATAR_RUNTIME_RULES;
      return this.cachedRules;
    }
  }

  getCachedRules() {
    return this.cachedRules;
  }

  async setRules(
    input: Partial<CyberAvatarRuntimeRules>,
  ): Promise<CyberAvatarRuntimeRules> {
    const normalized = normalizeCyberAvatarRuntimeRules(input);
    await this.systemConfig.setConfig(
      CYBER_AVATAR_RUNTIME_RULES_CONFIG_KEY,
      JSON.stringify(normalized),
    );
    this.cachedRules = normalized;
    return normalized;
  }
}

