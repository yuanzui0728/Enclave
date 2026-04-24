export const SELF_AGENT_RULES_CONFIG_KEY = 'self_agent_rules';

export type SelfAgentPolicyRulesValue = {
  enabled: boolean;
  allowActionRuntimeDelegation: boolean;
  allowReminderRuntimeDelegation: boolean;
  forceConfirmationForDelegatedActions: boolean;
  blockedActionConnectorKeys: string[];
  blockedActionOperationKeys: string[];
};

export type SelfAgentHeartbeatRulesValue = {
  enabled: boolean;
  everyMinutes: number;
  activeHoursStart: number;
  activeHoursEnd: number;
  maxItemsPerCategory: number;
  allowNightlySilentScan: boolean;
};

export type SelfAgentRulesValue = {
  policy: SelfAgentPolicyRulesValue;
  heartbeat: SelfAgentHeartbeatRulesValue;
};

export type SelfAgentRunTriggerTypeValue = 'conversation' | 'heartbeat';
export type SelfAgentRunStatusValue =
  | 'handled'
  | 'suggested'
  | 'skipped'
  | 'blocked'
  | 'error';
export type SelfAgentRunRouteKeyValue =
  | 'action_runtime'
  | 'reminder_runtime'
  | 'self_chat'
  | 'heartbeat'
  | 'ignored';
export type SelfAgentRunPolicyDecisionValue =
  | 'delegated'
  | 'confirm_required'
  | 'clarify_required'
  | 'suggest_only'
  | 'fallback'
  | 'blocked'
  | 'disabled';

export const DEFAULT_SELF_AGENT_RULES: SelfAgentRulesValue = {
  policy: {
    enabled: true,
    allowActionRuntimeDelegation: true,
    allowReminderRuntimeDelegation: true,
    forceConfirmationForDelegatedActions: true,
    blockedActionConnectorKeys: [],
    blockedActionOperationKeys: [],
  },
  heartbeat: {
    enabled: true,
    everyMinutes: 30,
    activeHoursStart: 8,
    activeHoursEnd: 23,
    maxItemsPerCategory: 3,
    allowNightlySilentScan: false,
  },
};

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const normalized =
    typeof value === 'number'
      ? Math.trunc(value)
      : typeof value === 'string' && value.trim()
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(normalized)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, normalized));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return fallback;
}

export function normalizeSelfAgentRules(
  input?: Partial<SelfAgentRulesValue> | null,
): SelfAgentRulesValue {
  const policyInput = input?.policy ?? {};
  const heartbeatInput = input?.heartbeat ?? {};

  return {
    policy: {
      enabled: normalizeBoolean(
        policyInput.enabled,
        DEFAULT_SELF_AGENT_RULES.policy.enabled,
      ),
      allowActionRuntimeDelegation: normalizeBoolean(
        policyInput.allowActionRuntimeDelegation,
        DEFAULT_SELF_AGENT_RULES.policy.allowActionRuntimeDelegation,
      ),
      allowReminderRuntimeDelegation: normalizeBoolean(
        policyInput.allowReminderRuntimeDelegation,
        DEFAULT_SELF_AGENT_RULES.policy.allowReminderRuntimeDelegation,
      ),
      forceConfirmationForDelegatedActions: normalizeBoolean(
        policyInput.forceConfirmationForDelegatedActions,
        DEFAULT_SELF_AGENT_RULES.policy.forceConfirmationForDelegatedActions,
      ),
      blockedActionConnectorKeys: normalizeStringArray(
        policyInput.blockedActionConnectorKeys,
      ),
      blockedActionOperationKeys: normalizeStringArray(
        policyInput.blockedActionOperationKeys,
      ),
    },
    heartbeat: {
      enabled: normalizeBoolean(
        heartbeatInput.enabled,
        DEFAULT_SELF_AGENT_RULES.heartbeat.enabled,
      ),
      everyMinutes: clampInteger(
        heartbeatInput.everyMinutes,
        5,
        24 * 60,
        DEFAULT_SELF_AGENT_RULES.heartbeat.everyMinutes,
      ),
      activeHoursStart: clampInteger(
        heartbeatInput.activeHoursStart,
        0,
        23,
        DEFAULT_SELF_AGENT_RULES.heartbeat.activeHoursStart,
      ),
      activeHoursEnd: clampInteger(
        heartbeatInput.activeHoursEnd,
        0,
        23,
        DEFAULT_SELF_AGENT_RULES.heartbeat.activeHoursEnd,
      ),
      maxItemsPerCategory: clampInteger(
        heartbeatInput.maxItemsPerCategory,
        1,
        10,
        DEFAULT_SELF_AGENT_RULES.heartbeat.maxItemsPerCategory,
      ),
      allowNightlySilentScan: normalizeBoolean(
        heartbeatInput.allowNightlySilentScan,
        DEFAULT_SELF_AGENT_RULES.heartbeat.allowNightlySilentScan,
      ),
    },
  };
}
