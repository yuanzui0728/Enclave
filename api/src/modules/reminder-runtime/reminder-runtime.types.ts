export const REMINDER_RUNTIME_RULES_CONFIG_KEY = 'reminder_runtime_rules';

export type ReminderTaskKind = 'one_time' | 'recurring' | 'habit';
export type ReminderTaskStatus = 'active' | 'completed' | 'cancelled';
export type ReminderTaskPriority = 'hard' | 'soft';

export type ReminderRecurrenceRule = {
  unit: 'daily' | 'weekly' | 'habit';
  hour: number;
  minute: number;
  weekdays?: number[];
  cadenceDays?: number;
};

export type ReminderRuntimePromptTemplatesValue = {
  momentNudgeMorningTemplates: string;
  momentNudgeEveningTemplates: string;
  momentNudgeGeneralTemplates: string;
};

export type ReminderRuntimeTextTemplatesValue = {
  helpMessage: string;
  taskListEmpty: string;
  taskListHeader: string;
  taskListItem: string;
  taskCancelMissing: string;
  taskCancelSuccess: string;
  taskSnoozeMissing: string;
  taskSnoozeSuccess: string;
  taskCompleteMissing: string;
  taskCompleteOneTimeSuccess: string;
  taskCompleteRecurringSuccess: string;
  taskCreateMissingTitle: string;
  taskCreateMissingTime: string;
  taskCreateHabitSuccess: string;
  taskCreateDailySuccess: string;
  taskCreateWeeklySuccess: string;
  taskCreateOneTimeSuccess: string;
  dueReminderHard: string;
  dueReminderHabit: string;
  dueReminderDefault: string;
  checkinWithActiveTasks: string;
  checkinWithoutActiveTasks: string;
};

export type ReminderRuntimeParserPeriodDefaultValue = {
  patterns: string[];
  hour: number;
  minute: number;
};

export type ReminderRuntimeParserCategoryKeywordsValue = {
  growth: string[];
  lifestyle: string[];
  health: string[];
  shopping: string[];
};

export type ReminderRuntimeParserPeriodDefaultsValue = {
  sleepBefore: ReminderRuntimeParserPeriodDefaultValue;
  morning: ReminderRuntimeParserPeriodDefaultValue;
  lateMorning: ReminderRuntimeParserPeriodDefaultValue;
  noon: ReminderRuntimeParserPeriodDefaultValue;
  afternoon: ReminderRuntimeParserPeriodDefaultValue;
  dusk: ReminderRuntimeParserPeriodDefaultValue;
  evening: ReminderRuntimeParserPeriodDefaultValue;
};

export type ReminderRuntimeParserModeValue =
  | 'rules_only'
  | 'rules_with_llm_fallback';

export type ReminderRuntimeParserRulesValue = {
  parserMode: ReminderRuntimeParserModeValue;
  helpIntentPatterns: string[];
  listIntentPatterns: string[];
  cancelIntentPatterns: string[];
  completeIntentPatterns: string[];
  snoozeIntentPatterns: string[];
  createIntentKeywords: string[];
  dailyRecurrenceKeywords: string[];
  weeklyRecurrenceKeywords: string[];
  habitIntentKeywords: string[];
  habitKeywords: string[];
  hardReminderKeywords: string[];
  llmFallbackPrompt: string;
  categoryKeywords: ReminderRuntimeParserCategoryKeywordsValue;
  periodDefaultClocks: ReminderRuntimeParserPeriodDefaultsValue;
};

export type ReminderRuntimeRulesValue = {
  defaultReminderHour: number;
  defaultReminderMinute: number;
  habitDefaultHour: number;
  habitDefaultMinute: number;
  checkinHours: number[];
  checkinMinIntervalHours: number;
  maxListItems: number;
  promptTemplates: ReminderRuntimePromptTemplatesValue;
  textTemplates: ReminderRuntimeTextTemplatesValue;
  parserRules: ReminderRuntimeParserRulesValue;
};

export type ReminderTaskRecordValue = {
  id: string;
  title: string;
  detail?: string | null;
  category: string;
  kind: ReminderTaskKind;
  status: ReminderTaskStatus;
  priority: ReminderTaskPriority;
  timezone: string;
  dueAt?: string | null;
  nextTriggerAt?: string | null;
  lastTriggeredAt?: string | null;
  lastDeliveredAt?: string | null;
  lastCompletedAt?: string | null;
  snoozedUntil?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  completionCount: number;
  recurrenceRule?: ReminderRecurrenceRule | null;
  scheduleText: string;
  createdAt: string;
  updatedAt: string;
};

export type ReminderRuntimePreviewActionValue =
  | 'help'
  | 'list'
  | 'cancel'
  | 'complete'
  | 'snooze'
  | 'create'
  | 'unhandled';

export type ReminderRuntimePreviewSourceValue =
  | 'rules'
  | 'llm_fallback'
  | 'none';

export type ReminderRuntimePreviewMatchedRulesValue = {
  intentPatterns: string[];
  createKeywords: string[];
  dailyKeywords: string[];
  weeklyKeywords: string[];
  habitIntentKeywords: string[];
  habitKeywords: string[];
  hardKeywords: string[];
  categoryKeywords: string[];
  periodKey?: keyof ReminderRuntimeParserPeriodDefaultsValue | null;
  periodPatterns: string[];
};

export type ReminderRuntimePreviewParsedTaskValue = {
  title: string;
  category: string;
  kind: ReminderTaskKind;
  priority: ReminderTaskPriority;
  dueAt?: string | null;
  nextTriggerAt?: string | null;
  recurrenceRule?: ReminderRecurrenceRule | null;
};

export type ReminderRuntimePreviewReferencedTaskValue = {
  id: string;
  title: string;
  scheduleText: string;
};

export type ReminderRuntimePreviewResultValue = {
  handled: boolean;
  action: ReminderRuntimePreviewActionValue;
  source: ReminderRuntimePreviewSourceValue;
  reason: string;
  evaluatedAt: string;
  timezone: string;
  normalizedText: string;
  extractedTitle?: string | null;
  canonicalMessage?: string | null;
  fallbackReason?: string | null;
  responseText?: string | null;
  needsClarification: boolean;
  parsedTask?: ReminderRuntimePreviewParsedTaskValue | null;
  referencedTask?: ReminderRuntimePreviewReferencedTaskValue | null;
  matchedRules: ReminderRuntimePreviewMatchedRulesValue;
};

export const DEFAULT_REMINDER_RUNTIME_PROMPT_TEMPLATES: ReminderRuntimePromptTemplatesValue =
  Object.freeze({
    momentNudgeMorningTemplates: [
      '今天先把{{focus}}开个头。',
      '{{companionLine}}',
      '别把{{focus}}又顺到晚上。',
    ].join('\n'),
    momentNudgeEveningTemplates: [
      '今天的{{focus}}，做一点也算没掉线。',
      '长期的事最怕“明天开始”。{{focus}}，今天先动一下。',
      '{{companionLine}}',
    ].join('\n'),
    momentNudgeGeneralTemplates: [
      '我这边今天继续盯着：{{focus}}。先做一点，别全留给明天。',
      '怕忘的事不用都塞给脑子。{{focus}}，今天往前推一点。',
      '{{companionLine}}',
    ].join('\n'),
  });

export const DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES: ReminderRuntimeTextTemplatesValue =
  Object.freeze({
    helpMessage:
      '你可以直接说“明早8点提醒我吃药”“每周五提醒我买猫粮”“提醒我坚持学英语”。要查、删、延后、完成，也直接跟我说。',
    taskListEmpty:
      '你现在还没让我记着具体的事。要记新的，直接把事项和时间发我。',
    taskListHeader: '你现在让我记着这些：',
    taskListItem: '{{index}}. {{title}}，{{scheduleText}}',
    taskCancelMissing:
      '我没对上你想删的是哪一个。你把事项名再说一遍就行。',
    taskCancelSuccess: '删掉了：{{title}}。',
    taskSnoozeMissing:
      '我没对上要延后的是哪一个。你带上事项名再说一次。',
    taskSnoozeSuccess: '往后顺到了{{untilLabel}}。{{title}}我会再叫你。',
    taskCompleteMissing:
      '我没对上你完成的是哪件事。你把事项名补给我就行。',
    taskCompleteOneTimeSuccess: '收到，{{title}}我记成已完成了。',
    taskCompleteRecurringSuccess:
      '收到，这次{{title}}我记成完成了。下次还是按{{scheduleText}}提醒你。',
    taskCreateMissingTitle:
      '这件事我能替你记，但你还没把事项说清。你可以直接说“明早8点提醒我吃药”。',
    taskCreateMissingTime:
      '这件事我可以替你记，但你还没告诉我具体什么时候提醒。比如“明天早上8点提醒我吃药”。',
    taskCreateHabitSuccess:
      '记下了。我先按每天 {{time}} 轻轻提醒你{{title}}。想换时间就直接告诉我。',
    taskCreateDailySuccess: '记下了。我会每天 {{time}} 提醒你{{title}}。',
    taskCreateWeeklySuccess:
      '记下了。我会每周{{weekdayLabel}} {{time}} 提醒你{{title}}。',
    taskCreateOneTimeSuccess: '记下了。我会在{{dateTimeLabel}}提醒你{{title}}。',
    dueReminderHard: '{{title}}，到点了。先去做。',
    dueReminderHabit: '{{title}}这件事，今天也别断。我在这儿替你提个醒。',
    dueReminderDefault: '{{title}}，别忘了。',
    checkinWithActiveTasks:
      '我这边还替你记着{{activeCount}}件事。要是还有新的，也继续丢给我。',
    checkinWithoutActiveTasks:
      '今天如果还有什么怕忘的，直接发我一句，我替你盯着。',
  });

export const DEFAULT_REMINDER_RUNTIME_PARSER_RULES: ReminderRuntimeParserRulesValue =
  Object.freeze({
    parserMode: 'rules_with_llm_fallback',
    helpIntentPatterns: [
      '(怎么用|你能提醒|你能做什么|怎么提醒|能帮我记什么)',
    ],
    listIntentPatterns: [
      '(有哪些|有什么|列一下|查一下|看看).*(提醒|待提醒|待办|记着)',
      '提醒.*(有哪些|有什么|列一下|查一下|看看)',
    ],
    cancelIntentPatterns: ['(取消|删掉|删除|不用提醒|别提醒|不需要提醒)'],
    completeIntentPatterns: [
      '^(完成了|已完成|搞定了|做完了|买好了|吃过了|吃完了|练了|睡了)',
    ],
    snoozeIntentPatterns: [
      '(延后|晚点|等会|待会|稍后|一小时后|半小时后|明天再提醒|明早再提醒)',
    ],
    createIntentKeywords: [
      '记得提醒我',
      '提醒我',
      '帮我记一下',
      '帮我记着',
      '帮我记住',
      '帮我记',
      '记一下',
      '记着',
      '记住',
    ],
    dailyRecurrenceKeywords: ['每天'],
    weeklyRecurrenceKeywords: ['每周', '每星期', '礼拜'],
    habitIntentKeywords: ['坚持', '长期', '养成', '监督我'],
    habitKeywords: [
      '学英语',
      '英语',
      '锻炼',
      '运动',
      '健身',
      '背单词',
      '喝水',
      '早睡',
      '复盘',
      '看书',
      '读书',
    ],
    hardReminderKeywords: ['吃药', '开会', '会议', '复诊', '考试'],
    llmFallbackPrompt: [
      '你是“小盯”的提醒语义归一化器。你的任务不是直接回复用户，而是把用户原话改写成系统可解析的标准提醒口令。',
      '只有当原话明显与提醒、待办、完成、删除、顺延、查询提醒能力相关时，handled=true；否则 handled=false。',
      '必须严格输出 JSON object，不要输出 markdown 或额外解释。',
      '标准口令必须严格使用以下形式之一：',
      '1. help: 你能帮我记什么',
      '2. list: 看看我有哪些提醒',
      '3. cancel: 删除提醒 <事项>',
      '4. complete: 已完成 <事项>',
      '5. snooze: 明天再提醒 <事项> / 半小时后再提醒 <事项> / 一小时后再提醒 <事项>',
      '6. create 单次: <日期/时段/时间> 提醒我 <事项>',
      '7. create 每天: 每天 <时间> 提醒我 <事项>',
      '8. create 每周: 每周X <时间> 提醒我 <事项>',
      '9. create 习惯: 提醒我坚持 <事项>',
      '要求：',
      '- 不要编造不存在的任务标题。',
      '- 如果是删除、完成、顺延，优先复用给定活跃提醒标题里的原词。',
      '- 如果原话信息不够，handled=false，并在 reason 里说明缺什么，不要硬猜。',
      '- canonicalMessage 只能输出一条标准口令。',
      '输出格式：{"handled":boolean,"action":"help|list|cancel|complete|snooze|create|unhandled","reason":"...","canonicalMessage":"..."}',
    ].join('\n'),
    categoryKeywords: {
      health: ['吃药', '复诊', '体检'],
      shopping: ['买', '采购', '补货', '快递'],
      lifestyle: ['睡', '吃饭', '喝水'],
      growth: ['学', '背单词', '英语', '复盘', '锻炼', '运动', '看书'],
    },
    periodDefaultClocks: {
      sleepBefore: {
        patterns: ['睡前'],
        hour: 23,
        minute: 0,
      },
      morning: {
        patterns: ['明早', '今早', '早上', '早晨'],
        hour: 8,
        minute: 0,
      },
      lateMorning: {
        patterns: ['上午'],
        hour: 9,
        minute: 0,
      },
      noon: {
        patterns: ['中午'],
        hour: 12,
        minute: 30,
      },
      afternoon: {
        patterns: ['下午'],
        hour: 15,
        minute: 0,
      },
      dusk: {
        patterns: ['傍晚'],
        hour: 18,
        minute: 30,
      },
      evening: {
        patterns: ['晚上', '今晚', '明晚'],
        hour: 20,
        minute: 0,
      },
    },
  });

export const DEFAULT_REMINDER_RUNTIME_RULES: ReminderRuntimeRulesValue =
  Object.freeze({
    defaultReminderHour: 9,
    defaultReminderMinute: 0,
    habitDefaultHour: 20,
    habitDefaultMinute: 30,
    checkinHours: [13, 21],
    checkinMinIntervalHours: 8,
    maxListItems: 6,
    promptTemplates: DEFAULT_REMINDER_RUNTIME_PROMPT_TEMPLATES,
    textTemplates: DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES,
    parserRules: DEFAULT_REMINDER_RUNTIME_PARSER_RULES,
  });

function normalizeHour(value: unknown, fallback: number) {
  const next = typeof value === 'number' ? Math.trunc(value) : fallback;
  if (next < 0 || next > 23) {
    return fallback;
  }
  return next;
}

function normalizeMinute(value: unknown, fallback: number) {
  const next = typeof value === 'number' ? Math.trunc(value) : fallback;
  if (next < 0 || next > 59) {
    return fallback;
  }
  return next;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const next = typeof value === 'number' ? Math.trunc(value) : fallback;
  if (next <= 0) {
    return fallback;
  }
  return next;
}

function normalizeTemplate(value: unknown, fallback: string) {
  const next = typeof value === 'string' ? value.trim() : '';
  return next || fallback;
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const next = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return Array.from(new Set(next));
}

function normalizeParserPeriodDefault(
  value: unknown,
  fallback: ReminderRuntimeParserPeriodDefaultValue,
): ReminderRuntimeParserPeriodDefaultValue {
  const record =
    value && typeof value === 'object'
      ? (value as Partial<ReminderRuntimeParserPeriodDefaultValue>)
      : {};

  return {
    patterns: normalizeStringList(record.patterns, fallback.patterns),
    hour: normalizeHour(record.hour, fallback.hour),
    minute: normalizeMinute(record.minute, fallback.minute),
  };
}

export function normalizeReminderRuntimeRules(
  value: Partial<ReminderRuntimeRulesValue> | undefined,
): ReminderRuntimeRulesValue {
  const promptTemplates: Partial<ReminderRuntimePromptTemplatesValue> =
    value?.promptTemplates ?? {};
  const textTemplates: Partial<ReminderRuntimeTextTemplatesValue> =
    value?.textTemplates ?? {};
  const parserRules: Partial<ReminderRuntimeParserRulesValue> =
    value?.parserRules ?? {};
  const parserCategoryKeywords: Partial<ReminderRuntimeParserCategoryKeywordsValue> =
    parserRules.categoryKeywords ?? {};
  const parserPeriodDefaultClocks: Partial<ReminderRuntimeParserPeriodDefaultsValue> =
    parserRules.periodDefaultClocks ?? {};

  return {
    defaultReminderHour: normalizeHour(
      value?.defaultReminderHour,
      DEFAULT_REMINDER_RUNTIME_RULES.defaultReminderHour,
    ),
    defaultReminderMinute: normalizeMinute(
      value?.defaultReminderMinute,
      DEFAULT_REMINDER_RUNTIME_RULES.defaultReminderMinute,
    ),
    habitDefaultHour: normalizeHour(
      value?.habitDefaultHour,
      DEFAULT_REMINDER_RUNTIME_RULES.habitDefaultHour,
    ),
    habitDefaultMinute: normalizeMinute(
      value?.habitDefaultMinute,
      DEFAULT_REMINDER_RUNTIME_RULES.habitDefaultMinute,
    ),
    checkinHours:
      value?.checkinHours
        ?.map((item) => normalizeHour(item, -1))
        .filter((item) => item >= 0)
        .slice(0, 6) ?? [...DEFAULT_REMINDER_RUNTIME_RULES.checkinHours],
    checkinMinIntervalHours: normalizePositiveInteger(
      value?.checkinMinIntervalHours,
      DEFAULT_REMINDER_RUNTIME_RULES.checkinMinIntervalHours,
    ),
    maxListItems: normalizePositiveInteger(
      value?.maxListItems,
      DEFAULT_REMINDER_RUNTIME_RULES.maxListItems,
    ),
    promptTemplates: {
      momentNudgeMorningTemplates: normalizeTemplate(
        promptTemplates.momentNudgeMorningTemplates,
        DEFAULT_REMINDER_RUNTIME_PROMPT_TEMPLATES.momentNudgeMorningTemplates,
      ),
      momentNudgeEveningTemplates: normalizeTemplate(
        promptTemplates.momentNudgeEveningTemplates,
        DEFAULT_REMINDER_RUNTIME_PROMPT_TEMPLATES.momentNudgeEveningTemplates,
      ),
      momentNudgeGeneralTemplates: normalizeTemplate(
        promptTemplates.momentNudgeGeneralTemplates,
        DEFAULT_REMINDER_RUNTIME_PROMPT_TEMPLATES.momentNudgeGeneralTemplates,
      ),
    },
    textTemplates: {
      helpMessage: normalizeTemplate(
        textTemplates.helpMessage,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.helpMessage,
      ),
      taskListEmpty: normalizeTemplate(
        textTemplates.taskListEmpty,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskListEmpty,
      ),
      taskListHeader: normalizeTemplate(
        textTemplates.taskListHeader,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskListHeader,
      ),
      taskListItem: normalizeTemplate(
        textTemplates.taskListItem,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskListItem,
      ),
      taskCancelMissing: normalizeTemplate(
        textTemplates.taskCancelMissing,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCancelMissing,
      ),
      taskCancelSuccess: normalizeTemplate(
        textTemplates.taskCancelSuccess,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCancelSuccess,
      ),
      taskSnoozeMissing: normalizeTemplate(
        textTemplates.taskSnoozeMissing,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskSnoozeMissing,
      ),
      taskSnoozeSuccess: normalizeTemplate(
        textTemplates.taskSnoozeSuccess,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskSnoozeSuccess,
      ),
      taskCompleteMissing: normalizeTemplate(
        textTemplates.taskCompleteMissing,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCompleteMissing,
      ),
      taskCompleteOneTimeSuccess: normalizeTemplate(
        textTemplates.taskCompleteOneTimeSuccess,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCompleteOneTimeSuccess,
      ),
      taskCompleteRecurringSuccess: normalizeTemplate(
        textTemplates.taskCompleteRecurringSuccess,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCompleteRecurringSuccess,
      ),
      taskCreateMissingTitle: normalizeTemplate(
        textTemplates.taskCreateMissingTitle,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCreateMissingTitle,
      ),
      taskCreateMissingTime: normalizeTemplate(
        textTemplates.taskCreateMissingTime,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCreateMissingTime,
      ),
      taskCreateHabitSuccess: normalizeTemplate(
        textTemplates.taskCreateHabitSuccess,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCreateHabitSuccess,
      ),
      taskCreateDailySuccess: normalizeTemplate(
        textTemplates.taskCreateDailySuccess,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCreateDailySuccess,
      ),
      taskCreateWeeklySuccess: normalizeTemplate(
        textTemplates.taskCreateWeeklySuccess,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCreateWeeklySuccess,
      ),
      taskCreateOneTimeSuccess: normalizeTemplate(
        textTemplates.taskCreateOneTimeSuccess,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.taskCreateOneTimeSuccess,
      ),
      dueReminderHard: normalizeTemplate(
        textTemplates.dueReminderHard,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.dueReminderHard,
      ),
      dueReminderHabit: normalizeTemplate(
        textTemplates.dueReminderHabit,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.dueReminderHabit,
      ),
      dueReminderDefault: normalizeTemplate(
        textTemplates.dueReminderDefault,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.dueReminderDefault,
      ),
      checkinWithActiveTasks: normalizeTemplate(
        textTemplates.checkinWithActiveTasks,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.checkinWithActiveTasks,
      ),
      checkinWithoutActiveTasks: normalizeTemplate(
        textTemplates.checkinWithoutActiveTasks,
        DEFAULT_REMINDER_RUNTIME_TEXT_TEMPLATES.checkinWithoutActiveTasks,
      ),
    },
    parserRules: {
      parserMode:
        parserRules.parserMode === 'rules_only' ||
        parserRules.parserMode === 'rules_with_llm_fallback'
          ? parserRules.parserMode
          : DEFAULT_REMINDER_RUNTIME_PARSER_RULES.parserMode,
      helpIntentPatterns: normalizeStringList(
        parserRules.helpIntentPatterns,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.helpIntentPatterns,
      ),
      listIntentPatterns: normalizeStringList(
        parserRules.listIntentPatterns,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.listIntentPatterns,
      ),
      cancelIntentPatterns: normalizeStringList(
        parserRules.cancelIntentPatterns,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.cancelIntentPatterns,
      ),
      completeIntentPatterns: normalizeStringList(
        parserRules.completeIntentPatterns,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.completeIntentPatterns,
      ),
      snoozeIntentPatterns: normalizeStringList(
        parserRules.snoozeIntentPatterns,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.snoozeIntentPatterns,
      ),
      createIntentKeywords: normalizeStringList(
        parserRules.createIntentKeywords,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.createIntentKeywords,
      ),
      dailyRecurrenceKeywords: normalizeStringList(
        parserRules.dailyRecurrenceKeywords,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.dailyRecurrenceKeywords,
      ),
      weeklyRecurrenceKeywords: normalizeStringList(
        parserRules.weeklyRecurrenceKeywords,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.weeklyRecurrenceKeywords,
      ),
      habitIntentKeywords: normalizeStringList(
        parserRules.habitIntentKeywords,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.habitIntentKeywords,
      ),
      habitKeywords: normalizeStringList(
        parserRules.habitKeywords,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.habitKeywords,
      ),
      hardReminderKeywords: normalizeStringList(
        parserRules.hardReminderKeywords,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.hardReminderKeywords,
      ),
      llmFallbackPrompt: normalizeTemplate(
        parserRules.llmFallbackPrompt,
        DEFAULT_REMINDER_RUNTIME_PARSER_RULES.llmFallbackPrompt,
      ),
      categoryKeywords: {
        health: normalizeStringList(
          parserCategoryKeywords.health,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.categoryKeywords.health,
        ),
        shopping: normalizeStringList(
          parserCategoryKeywords.shopping,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.categoryKeywords.shopping,
        ),
        lifestyle: normalizeStringList(
          parserCategoryKeywords.lifestyle,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.categoryKeywords.lifestyle,
        ),
        growth: normalizeStringList(
          parserCategoryKeywords.growth,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.categoryKeywords.growth,
        ),
      },
      periodDefaultClocks: {
        sleepBefore: normalizeParserPeriodDefault(
          parserPeriodDefaultClocks.sleepBefore,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.periodDefaultClocks.sleepBefore,
        ),
        morning: normalizeParserPeriodDefault(
          parserPeriodDefaultClocks.morning,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.periodDefaultClocks.morning,
        ),
        lateMorning: normalizeParserPeriodDefault(
          parserPeriodDefaultClocks.lateMorning,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.periodDefaultClocks.lateMorning,
        ),
        noon: normalizeParserPeriodDefault(
          parserPeriodDefaultClocks.noon,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.periodDefaultClocks.noon,
        ),
        afternoon: normalizeParserPeriodDefault(
          parserPeriodDefaultClocks.afternoon,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.periodDefaultClocks.afternoon,
        ),
        dusk: normalizeParserPeriodDefault(
          parserPeriodDefaultClocks.dusk,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.periodDefaultClocks.dusk,
        ),
        evening: normalizeParserPeriodDefault(
          parserPeriodDefaultClocks.evening,
          DEFAULT_REMINDER_RUNTIME_PARSER_RULES.periodDefaultClocks.evening,
        ),
      },
    },
  };
}
