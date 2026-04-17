import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigService } from '../config/config.service';
import {
  DEFAULT_FOLLOWUP_RUNTIME_RULES,
  FOLLOWUP_RUNTIME_RULES_CONFIG_KEY,
  normalizeFollowupRuntimeRules,
  type FollowupRuntimeRulesValue,
} from './followup-runtime.types';

@Injectable()
export class FollowupRuntimeRulesService {
  private readonly logger = new Logger(FollowupRuntimeRulesService.name);
  private cachedRules: FollowupRuntimeRulesValue =
    DEFAULT_FOLLOWUP_RUNTIME_RULES;

  constructor(private readonly systemConfig: SystemConfigService) {}

  async getRules(): Promise<FollowupRuntimeRulesValue> {
    const raw = await this.systemConfig.getConfig(
      FOLLOWUP_RUNTIME_RULES_CONFIG_KEY,
    );
    if (!raw?.trim()) {
      this.cachedRules = DEFAULT_FOLLOWUP_RUNTIME_RULES;
      return this.cachedRules;
    }

    try {
      this.cachedRules = normalizeFollowupRuntimeRules(
        JSON.parse(raw) as Partial<FollowupRuntimeRulesValue>,
      );
      return this.cachedRules;
    } catch (error) {
      this.logger.warn(
        `Failed to parse ${FOLLOWUP_RUNTIME_RULES_CONFIG_KEY}, using defaults.`,
        error instanceof Error ? error.message : undefined,
      );
      this.cachedRules = DEFAULT_FOLLOWUP_RUNTIME_RULES;
      return this.cachedRules;
    }
  }

  getCachedRules() {
    return this.cachedRules;
  }

  async setRules(
    input: Partial<FollowupRuntimeRulesValue>,
  ): Promise<FollowupRuntimeRulesValue> {
    const normalized = normalizeFollowupRuntimeRules(input);
    await this.systemConfig.setConfig(
      FOLLOWUP_RUNTIME_RULES_CONFIG_KEY,
      JSON.stringify(normalized),
    );
    this.cachedRules = normalized;
    return normalized;
  }
}
