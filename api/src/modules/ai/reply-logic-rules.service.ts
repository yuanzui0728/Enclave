import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigService } from '../config/config.service';
import {
  DEFAULT_REPLY_LOGIC_RUNTIME_RULES,
  REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY,
  type ReplyLogicRuntimeRules,
  normalizeReplyLogicRuntimeRules,
} from './reply-logic.constants';

@Injectable()
export class ReplyLogicRulesService {
  private readonly logger = new Logger(ReplyLogicRulesService.name);

  constructor(private readonly systemConfig: SystemConfigService) {}

  async getRules(): Promise<ReplyLogicRuntimeRules> {
    const raw = await this.systemConfig.getConfig(
      REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY,
    );
    if (!raw) {
      return DEFAULT_REPLY_LOGIC_RUNTIME_RULES;
    }

    try {
      return normalizeReplyLogicRuntimeRules(
        JSON.parse(raw) as Partial<ReplyLogicRuntimeRules>,
      );
    } catch {
      this.logger.warn(
        `Failed to parse ${REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY}, using defaults.`,
      );
      return DEFAULT_REPLY_LOGIC_RUNTIME_RULES;
    }
  }

  async setRules(
    input: Partial<ReplyLogicRuntimeRules>,
  ): Promise<ReplyLogicRuntimeRules> {
    const normalized = normalizeReplyLogicRuntimeRules(input);
    await this.systemConfig.setConfig(
      REPLY_LOGIC_RUNTIME_RULES_CONFIG_KEY,
      JSON.stringify(normalized),
    );
    return normalized;
  }

  async calculateHistoryWindow(forgettingCurve?: number) {
    const rules = await this.getRules();
    const normalized = Math.min(
      100,
      Math.max(0, Math.round(forgettingCurve ?? 70)),
    );
    return Math.round(
      rules.historyWindow.base +
        (normalized / 100) * rules.historyWindow.range,
    );
  }
}
