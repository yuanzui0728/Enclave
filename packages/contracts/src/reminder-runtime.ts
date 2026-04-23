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

export interface ReminderRuntimeRules {
  defaultReminderHour: number;
  defaultReminderMinute: number;
  habitDefaultHour: number;
  habitDefaultMinute: number;
  checkinHours: number[];
  checkinMinIntervalHours: number;
  maxListItems: number;
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
