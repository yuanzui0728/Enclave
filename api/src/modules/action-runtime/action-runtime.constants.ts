import type {
  ActionConnectorOperationValue,
  ActionConnectorSeedValue,
  ActionRuntimePromptTemplatesValue,
  ActionRuntimeRulesValue,
} from './action-runtime.types';

export const ACTION_RUNTIME_RULES_CONFIG_KEY = 'action_runtime_rules';

const DEFAULT_PROMPT_TEMPLATES: ActionRuntimePromptTemplatesValue = {
  plannerSystemPrompt: `你现在在替“我自己”处理真实世界动作请求。

你的任务不是闲聊，也不是客服回执，而是把用户真正想让你动的那一步压缩成动作草案：
1. 判断这是智能家居、外卖、订票，还是普通聊天
2. 能执行就给出结构化动作计划
3. 缺参数就明确指出还缺什么
4. 涉及真实成本或不可逆副作用时必须提醒确认

注意：
- 不要把“建议”和“已经执行”混在一起
- 不要在信息不足时硬凑参数
- 不要把需要确认的动作当成已完成
- 后续给用户看的话要短、直接、像熟人办事时会说的话，不要像系统通知、工单回执或操作手册
- 不要用（动作）、[旁白]、*动作* 这类舞台说明`,
  clarificationTemplate:
    '你这是想让我处理「{{title}}」对吧？现在还差这些信息：{{missingSlots}}。你补一句，我就接着往下走。',
  confirmationTemplate:
    '这一步一继续就会真的执行「{{title}}」。我现在抓到的关键信息是：{{slotSummary}}。没问题的话你回“确认执行”，我就继续。',
  successTemplate: '「{{title}}」已经处理好了。{{resultSummary}}',
  failureTemplate: '「{{title}}」这次没跑通，卡在：{{errorMessage}}',
  cancelledTemplate: '那我先不动「{{title}}」了。你后面想继续，直接再提一句。',
  pendingConfirmationReminderTemplate:
    '这一步还卡在确认上。要继续就回“确认执行”，不做了就回“取消”。',
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

const DEFAULT_CONNECTOR_OPERATIONS: Record<
  string,
  ActionConnectorOperationValue[]
> = {
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
    id: 'connector-official-home-assistant-smart-home',
    connectorKey: 'official-home-assistant-smart-home',
    displayName: 'Home Assistant 智能家居',
    providerType: 'official_api',
    status: 'disabled',
    endpointConfigPayload: {
      baseUrl: '',
      timeoutMs: 12000,
      provider: 'home_assistant',
      deviceTargets: {
        '客厅:空调': {
          entityId: 'climate.living_room_ac',
          serviceDomain: 'climate',
          turnOnService: 'turn_on',
          turnOffService: 'turn_off',
          setTemperatureService: 'set_temperature',
          temperatureField: 'temperature',
        },
        '客厅:灯': {
          entityId: 'light.living_room_main',
          serviceDomain: 'light',
          turnOnService: 'turn_on',
          turnOffService: 'turn_off',
        },
      },
      notes:
        'credential 填 Home Assistant Long-Lived Access Token；deviceTargets 用 “房间:设备” 映射到 entity/service。',
    },
    capabilitiesPayload: DEFAULT_CONNECTOR_OPERATIONS['mock-smart-home'],
  },
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
  const normalized = (value ?? []).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

export function normalizeActionRuntimeRules(
  input?: Partial<ActionRuntimeRulesValue> | null,
): ActionRuntimeRulesValue {
  const defaults = DEFAULT_ACTION_RUNTIME_RULES;
  return {
    plannerMode:
      input?.plannerMode === 'heuristic' || input?.plannerMode === 'llm'
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
              (
                item,
              ): item is ActionRuntimeRulesValue['policy']['autoExecuteRiskLevels'][number] =>
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
