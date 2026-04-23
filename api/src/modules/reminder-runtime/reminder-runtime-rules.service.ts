import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigService } from '../config/config.service';
import {
  DEFAULT_REMINDER_RUNTIME_RULES,
  normalizeReminderRuntimeRules,
  REMINDER_RUNTIME_RULES_CONFIG_KEY,
  type ReminderRuntimeRulesValue,
} from './reminder-runtime.types';

@Injectable()
export class ReminderRuntimeRulesService {
  private readonly logger = new Logger(ReminderRuntimeRulesService.name);
  private cachedRules: ReminderRuntimeRulesValue =
    DEFAULT_REMINDER_RUNTIME_RULES;

  constructor(private readonly systemConfig: SystemConfigService) {}

  async getRules(): Promise<ReminderRuntimeRulesValue> {
    const raw = await this.systemConfig.getConfig(
      REMINDER_RUNTIME_RULES_CONFIG_KEY,
    );
    if (!raw?.trim()) {
      this.cachedRules = DEFAULT_REMINDER_RUNTIME_RULES;
      return this.cachedRules;
    }

    try {
      this.cachedRules = normalizeReminderRuntimeRules(
        JSON.parse(raw) as Partial<ReminderRuntimeRulesValue>,
      );
      return this.cachedRules;
    } catch (error) {
      this.logger.warn(
        `Failed to parse ${REMINDER_RUNTIME_RULES_CONFIG_KEY}, using defaults.`,
        error instanceof Error ? error.message : undefined,
      );
      this.cachedRules = DEFAULT_REMINDER_RUNTIME_RULES;
      return this.cachedRules;
    }
  }

  getCachedRules() {
    return this.cachedRules;
  }

  async setRules(
    input: Partial<ReminderRuntimeRulesValue>,
  ): Promise<ReminderRuntimeRulesValue> {
    const current = await this.getRules();
    const normalized = normalizeReminderRuntimeRules({
      ...current,
      ...input,
      promptTemplates: {
        ...current.promptTemplates,
        ...(input.promptTemplates ?? {}),
      },
      textTemplates: {
        ...current.textTemplates,
        ...(input.textTemplates ?? {}),
      },
    });

    await this.systemConfig.setConfig(
      REMINDER_RUNTIME_RULES_CONFIG_KEY,
      JSON.stringify(normalized),
    );
    this.cachedRules = normalized;
    return normalized;
  }
}
