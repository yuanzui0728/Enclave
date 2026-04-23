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

export type ReminderRuntimeRulesValue = {
  defaultReminderHour: number;
  defaultReminderMinute: number;
  habitDefaultHour: number;
  habitDefaultMinute: number;
  checkinHours: number[];
  checkinMinIntervalHours: number;
  maxListItems: number;
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

export const DEFAULT_REMINDER_RUNTIME_RULES: ReminderRuntimeRulesValue =
  Object.freeze({
    defaultReminderHour: 9,
    defaultReminderMinute: 0,
    habitDefaultHour: 20,
    habitDefaultMinute: 30,
    checkinHours: [13, 21],
    checkinMinIntervalHours: 8,
    maxListItems: 6,
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

export function normalizeReminderRuntimeRules(
  value: Partial<ReminderRuntimeRulesValue> | undefined,
): ReminderRuntimeRulesValue {
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
  };
}
