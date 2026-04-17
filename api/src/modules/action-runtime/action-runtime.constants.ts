import type {
  ActionConnectorOperationValue,
  ActionConnectorSeedValue,
  ActionRuntimePromptTemplatesValue,
  ActionRuntimeRulesValue,
} from './action-runtime.types';

export const ACTION_RUNTIME_RULES_CONFIG_KEY = 'action_runtime_rules';

const DEFAULT_PROMPT_TEMPLATES: ActionRuntimePromptTemplatesValue = {
    plannerSystemPrompt: `你正在为“我自己”角色处理真实世界动作请求。

你的任务不是闲聊，而是把用户的话压缩成一个动作草案：
1. 判断这是智能家居、外卖、订票，还是普通聊天
2. 能执行就给出结构化动作计划
3. 缺参数就明确指出还缺什么
4. 涉及真实成本或不可逆副作用时必须提醒确认

注意：
- 不要把“建议”和“已经执行”混在一起
- 不要在信息不足时硬凑参数
- 不要把需要确认的动作当成已完成`,
    clarificationTemplate:
      '我已经识别到你想让我处理「{{title}}」，但现在还缺这些信息：{{missingSlots}}。你直接补一句就行。',
    confirmationTemplate:
      '这一步会真正执行「{{title}}」。当前关键信息是：{{slotSummary}}。如果你确认，我就继续；直接回复“确认执行”就行。',
    successTemplate:
      '{{connectorName}} 已经完成「{{title}}」。结果：{{resultSummary}}',
    failureTemplate:
      '这次没执行成「{{title}}」。原因是：{{errorMessage}}',
    cancelledTemplate:
      '这次我先不动「{{title}}」了。你后面想继续，直接再说一遍就行。',
    pendingConfirmationReminderTemplate:
      '这一步还在等你确认。要继续就回复“确认执行”，要取消就回复“取消”。',
};

export const DEFAULT_ACTION_RUNTIME_RULES: ActionRuntimeRulesValue = {
  plannerMode: 'llm_with_heuristic_fallback',
  promptTemplates: DEFAULT_PROMPT_TEMPLATES,
  policy: {
    enabled: true,
    selfRoleOnly: true,
    confirmationKeywords: ['确认', '确认执行', '就这么办', '执行吧', '下单吧'],
    rejectionKeywords: ['取消', '先别', '不要了', '算了', '暂停'],
    autoExecuteRiskLevels: ['read_only', 'reversible_low_risk'],
    trustedOperationKeys: [
      'smart_home_control',
      'food_delivery_prepare',
      'ticket_booking_prepare',
    ],
  },
};

const DEFAULT_CONNECTOR_OPERATIONS: Record<string, ActionConnectorOperationValue[]> = {
    'mock-smart-home': [
      {
        operationKey: 'smart_home_control',
        domain: 'smart_home',
        label: '控制智能家居',
        description: '模拟控制灯光、空调、窗帘等设备状态。',
        riskLevel: 'reversible_low_risk',
        requiresConfirmation: false,
        requiredSlots: ['device', 'action'],
      },
    ],
    'mock-food-delivery': [
      {
        operationKey: 'food_delivery_prepare',
        domain: 'food_delivery',
        label: '整理外卖候选',
        description: '模拟筛选外卖方案、预算和送达时间。',
        riskLevel: 'read_only',
        requiresConfirmation: false,
        requiredSlots: [],
      },
      {
        operationKey: 'food_delivery_submit',
        domain: 'food_delivery',
        label: '模拟外卖下单',
        description: '模拟提交外卖订单，需要用户明确确认。',
        riskLevel: 'cost_or_irreversible',
        requiresConfirmation: true,
        requiredSlots: ['preference', 'address'],
      },
    ],
    'mock-ticketing': [
      {
        operationKey: 'ticket_booking_prepare',
        domain: 'ticketing',
        label: '整理订票方案',
        description: '模拟整理票务候选方案和时段选择。',
        riskLevel: 'read_only',
        requiresConfirmation: false,
        requiredSlots: ['route', 'date'],
      },
      {
        operationKey: 'ticket_booking_submit',
        domain: 'ticketing',
        label: '模拟票务预订',
        description: '模拟提交票务预订，需要用户明确确认。',
        riskLevel: 'cost_or_irreversible',
        requiresConfirmation: true,
        requiredSlots: ['route', 'date'],
      },
    ],
};

export const DEFAULT_ACTION_CONNECTOR_SEEDS: ActionConnectorSeedValue[] = [
  {
    id: 'connector-http-smart-home',
    connectorKey: 'http-smart-home',
    displayName: 'HTTP 智能家居桥',
    providerType: 'http_bridge',
    status: 'disabled',
    endpointConfigPayload: {
      url: '',
      method: 'POST',
      timeoutMs: 12000,
      headers: {},
      notes: '接收 action-runtime JSON payload 并返回 resultSummary / result。',
    },
    capabilitiesPayload: DEFAULT_CONNECTOR_OPERATIONS['mock-smart-home'],
  },
  {
    id: 'connector-http-food-delivery',
    connectorKey: 'http-food-delivery',
    displayName: 'HTTP 外卖桥',
    providerType: 'http_bridge',
    status: 'disabled',
    endpointConfigPayload: {
      url: '',
      method: 'POST',
      timeoutMs: 12000,
      headers: {},
      notes: '接收 action-runtime JSON payload 并返回 resultSummary / result。',
    },
    capabilitiesPayload: DEFAULT_CONNECTOR_OPERATIONS['mock-food-delivery'],
  },
  {
    id: 'connector-http-ticketing',
    connectorKey: 'http-ticketing',
    displayName: 'HTTP 订票桥',
    providerType: 'http_bridge',
    status: 'disabled',
    endpointConfigPayload: {
      url: '',
      method: 'POST',
      timeoutMs: 12000,
      headers: {},
      notes: '接收 action-runtime JSON payload 并返回 resultSummary / result。',
    },
    capabilitiesPayload: DEFAULT_CONNECTOR_OPERATIONS['mock-ticketing'],
  },
  {
    id: 'connector-mock-smart-home',
    connectorKey: 'mock-smart-home',
    displayName: 'Mock 智能家居',
    providerType: 'mock',
    status: 'ready',
    endpointConfigPayload: {
      mockArea: 'default-home',
    },
    capabilitiesPayload: DEFAULT_CONNECTOR_OPERATIONS['mock-smart-home'],
  },
  {
    id: 'connector-mock-food-delivery',
    connectorKey: 'mock-food-delivery',
    displayName: 'Mock 外卖',
    providerType: 'mock',
    status: 'ready',
    endpointConfigPayload: {
      city: '上海',
    },
    capabilitiesPayload: DEFAULT_CONNECTOR_OPERATIONS['mock-food-delivery'],
  },
  {
    id: 'connector-mock-ticketing',
    connectorKey: 'mock-ticketing',
    displayName: 'Mock 订票',
    providerType: 'mock',
    status: 'ready',
    endpointConfigPayload: {
      locale: 'zh-CN',
    },
    capabilitiesPayload: DEFAULT_CONNECTOR_OPERATIONS['mock-ticketing'],
  },
];

function sanitizeTemplate(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function sanitizeStringArray(value: string[] | undefined, fallback: string[]) {
  const normalized = (value ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

export function normalizeActionRuntimeRules(
  input?: Partial<ActionRuntimeRulesValue> | null,
): ActionRuntimeRulesValue {
  const defaults = DEFAULT_ACTION_RUNTIME_RULES;
  return {
    plannerMode:
      input?.plannerMode === 'heuristic' ||
      input?.plannerMode === 'llm'
        ? input.plannerMode
        : 'llm_with_heuristic_fallback',
    promptTemplates: {
      plannerSystemPrompt: sanitizeTemplate(
        input?.promptTemplates?.plannerSystemPrompt,
        defaults.promptTemplates.plannerSystemPrompt,
      ),
      clarificationTemplate: sanitizeTemplate(
        input?.promptTemplates?.clarificationTemplate,
        defaults.promptTemplates.clarificationTemplate,
      ),
      confirmationTemplate: sanitizeTemplate(
        input?.promptTemplates?.confirmationTemplate,
        defaults.promptTemplates.confirmationTemplate,
      ),
      successTemplate: sanitizeTemplate(
        input?.promptTemplates?.successTemplate,
        defaults.promptTemplates.successTemplate,
      ),
      failureTemplate: sanitizeTemplate(
        input?.promptTemplates?.failureTemplate,
        defaults.promptTemplates.failureTemplate,
      ),
      cancelledTemplate: sanitizeTemplate(
        input?.promptTemplates?.cancelledTemplate,
        defaults.promptTemplates.cancelledTemplate,
      ),
      pendingConfirmationReminderTemplate: sanitizeTemplate(
        input?.promptTemplates?.pendingConfirmationReminderTemplate,
        defaults.promptTemplates.pendingConfirmationReminderTemplate,
      ),
    },
    policy: {
      enabled: input?.policy?.enabled !== false,
      selfRoleOnly: input?.policy?.selfRoleOnly !== false,
      confirmationKeywords: sanitizeStringArray(
        input?.policy?.confirmationKeywords,
        defaults.policy.confirmationKeywords,
      ),
      rejectionKeywords: sanitizeStringArray(
        input?.policy?.rejectionKeywords,
        defaults.policy.rejectionKeywords,
      ),
      autoExecuteRiskLevels:
        (input?.policy?.autoExecuteRiskLevels ?? []).filter(Boolean).length > 0
          ? (input?.policy?.autoExecuteRiskLevels ?? []).filter(
              (item): item is ActionRuntimeRulesValue['policy']['autoExecuteRiskLevels'][number] =>
                item === 'read_only' ||
                item === 'reversible_low_risk' ||
                item === 'cost_or_irreversible',
            )
          : [...defaults.policy.autoExecuteRiskLevels],
      trustedOperationKeys: sanitizeStringArray(
        input?.policy?.trustedOperationKeys,
        defaults.policy.trustedOperationKeys,
      ),
    },
  };
}
