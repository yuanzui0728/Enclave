import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigService } from '../config/config.service';
import {
  DEFAULT_SELF_AGENT_RULES,
  normalizeSelfAgentRules,
  SELF_AGENT_RULES_CONFIG_KEY,
  type SelfAgentRulesValue,
} from './self-agent.types';

@Injectable()
export class SelfAgentRulesService {
  private readonly logger = new Logger(SelfAgentRulesService.name);
  private cachedRules: SelfAgentRulesValue = DEFAULT_SELF_AGENT_RULES;

  constructor(private readonly systemConfig: SystemConfigService) {}

  async getRules(): Promise<SelfAgentRulesValue> {
    const raw = await this.systemConfig.getConfig(SELF_AGENT_RULES_CONFIG_KEY);
    if (!raw?.trim()) {
      this.cachedRules = DEFAULT_SELF_AGENT_RULES;
      return this.cachedRules;
    }

    try {
      this.cachedRules = normalizeSelfAgentRules(
        JSON.parse(raw) as Partial<SelfAgentRulesValue>,
      );
      return this.cachedRules;
    } catch (error) {
      this.logger.warn(
        `Failed to parse ${SELF_AGENT_RULES_CONFIG_KEY}, using defaults.`,
        error instanceof Error ? error.message : undefined,
      );
      this.cachedRules = DEFAULT_SELF_AGENT_RULES;
      return this.cachedRules;
    }
  }

  async setRules(
    patch: Partial<SelfAgentRulesValue>,
  ): Promise<SelfAgentRulesValue> {
    const current = await this.getRules();
    const normalized = normalizeSelfAgentRules({
      ...current,
      ...patch,
      policy: {
        ...current.policy,
        ...(patch.policy ?? {}),
      },
      heartbeat: {
        ...current.heartbeat,
        ...(patch.heartbeat ?? {}),
      },
    });

    await this.systemConfig.setConfig(
      SELF_AGENT_RULES_CONFIG_KEY,
      JSON.stringify(normalized),
    );
    this.cachedRules = normalized;
    return normalized;
  }
}
