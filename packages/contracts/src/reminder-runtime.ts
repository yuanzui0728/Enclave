export const REMINDER_CHARACTER_ID = "char-default-reminder";

export type ReminderTaskKind = "one_time" | "recurring" | "habit";
export type ReminderTaskStatus = "active" | "completed" | "cancelled";
export type ReminderTaskPriority = "hard" | "soft";

export interface ReminderRecurrenceRule {
  unit: "daily" | "weekly" | "habit";
  hour: number;
  minute: number;
  weekdays?: number[];
  cadenceDays?: number;
}

export interface ReminderRuntimePromptTemplates {
  momentNudgeMorningTemplates: string;
  momentNudgeEveningTemplates: string;
  momentNudgeGeneralTemplates: string;
}

export interface ReminderRuntimeTextTemplates {
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
}

export interface ReminderRuntimeParserPeriodDefault {
  patterns: string[];
  hour: number;
  minute: number;
}

export interface ReminderRuntimeParserCategoryKeywords {
  growth: string[];
  lifestyle: string[];
  health: string[];
  shopping: string[];
}

export interface ReminderRuntimeParserPeriodDefaults {
  sleepBefore: ReminderRuntimeParserPeriodDefault;
  morning: ReminderRuntimeParserPeriodDefault;
  lateMorning: ReminderRuntimeParserPeriodDefault;
  noon: ReminderRuntimeParserPeriodDefault;
  afternoon: ReminderRuntimeParserPeriodDefault;
  dusk: ReminderRuntimeParserPeriodDefault;
  evening: ReminderRuntimeParserPeriodDefault;
}

export type ReminderRuntimeParserMode =
  | "rules_only"
  | "rules_with_llm_fallback";

export interface ReminderRuntimeParserRules {
  parserMode: ReminderRuntimeParserMode;
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
  categoryKeywords: ReminderRuntimeParserCategoryKeywords;
  periodDefaultClocks: ReminderRuntimeParserPeriodDefaults;
}

export interface ReminderRuntimeRules {
  defaultReminderHour: number;
  defaultReminderMinute: number;
  habitDefaultHour: number;
  habitDefaultMinute: number;
  checkinHours: number[];
  checkinMinIntervalHours: number;
  maxListItems: number;
  promptTemplates: ReminderRuntimePromptTemplates;
  textTemplates: ReminderRuntimeTextTemplates;
  parserRules: ReminderRuntimeParserRules;
}

export interface ReminderTaskRecord {
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
}

export interface ReminderTaskMutationResult {
  task: ReminderTaskRecord;
}

export interface GetReminderTasksQuery {
  status?: ReminderTaskStatus;
}

export interface SnoozeReminderTaskRequest {
  minutes?: number;
  hours?: number;
  until?: string;
}

export interface ReminderRuntimeOverviewStats {
  activeTaskCount: number;
  dueSoonTaskCount: number;
  overdueTaskCount: number;
  habitTaskCount: number;
  hardTaskCount: number;
  deliveredTodayCount: number;
  completedTodayCount: number;
  momentCountToday: number;
}

export interface ReminderRuntimeMessageRecord {
  id: string;
  conversationId: string;
  text: string;
  createdAt: string;
}

export interface ReminderRuntimeMomentRecord {
  id: string;
  text: string;
  generationKind: string;
  slot?: string | null;
  slotLabel?: string | null;
  likeCount: number;
  commentCount: number;
  postedAt: string;
}

export interface ReminderRuntimeOverview {
  rules: ReminderRuntimeRules;
  stats: ReminderRuntimeOverviewStats;
  activeTasks: ReminderTaskRecord[];
  upcomingTasks: ReminderTaskRecord[];
  recentDeliveredTasks: ReminderTaskRecord[];
  recentCompletedTasks: ReminderTaskRecord[];
  recentMessages: ReminderRuntimeMessageRecord[];
  recentMoments: ReminderRuntimeMomentRecord[];
}

export type ReminderRuntimePreviewAction =
  | "help"
  | "list"
  | "cancel"
  | "complete"
  | "snooze"
  | "create"
  | "unhandled";

export type ReminderRuntimePreviewSource =
  | "rules"
  | "llm_fallback"
  | "none";

export interface ReminderRuntimePreviewMatchedRules {
  intentPatterns: string[];
  createKeywords: string[];
  dailyKeywords: string[];
  weeklyKeywords: string[];
  habitIntentKeywords: string[];
  habitKeywords: string[];
  hardKeywords: string[];
  categoryKeywords: string[];
  periodKey?: keyof ReminderRuntimeParserPeriodDefaults | null;
  periodPatterns: string[];
}

export interface ReminderRuntimePreviewParsedTask {
  title: string;
  category: string;
  kind: ReminderTaskKind;
  priority: ReminderTaskPriority;
  dueAt?: string | null;
  nextTriggerAt?: string | null;
  recurrenceRule?: ReminderRecurrenceRule | null;
}

export interface ReminderRuntimePreviewReferencedTask {
  id: string;
  title: string;
  scheduleText: string;
}

export interface ReminderRuntimePreviewResult {
  handled: boolean;
  action: ReminderRuntimePreviewAction;
  source: ReminderRuntimePreviewSource;
  reason: string;
  evaluatedAt: string;
  timezone: string;
  normalizedText: string;
  extractedTitle?: string | null;
  canonicalMessage?: string | null;
  fallbackReason?: string | null;
  responseText?: string | null;
  needsClarification: boolean;
  parsedTask?: ReminderRuntimePreviewParsedTask | null;
  referencedTask?: ReminderRuntimePreviewReferencedTask | null;
  matchedRules: ReminderRuntimePreviewMatchedRules;
}
