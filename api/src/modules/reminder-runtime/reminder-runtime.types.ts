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

export function normalizeReminderRuntimeRules(
  value: Partial<ReminderRuntimeRulesValue> | undefined,
): ReminderRuntimeRulesValue {
  const promptTemplates: Partial<ReminderRuntimePromptTemplatesValue> =
    value?.promptTemplates ?? {};
  const textTemplates: Partial<ReminderRuntimeTextTemplatesValue> =
    value?.textTemplates ?? {};

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
  };
}
