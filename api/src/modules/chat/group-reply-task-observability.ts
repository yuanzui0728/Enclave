import type { GroupReplyTaskEntity } from './group-reply-task.entity';

export const GROUP_REPLY_TASK_ARCHIVE_STATS_CONFIG_KEY =
  'group_reply_task_archive_stats_v1';

export type GroupReplyIssueSource = 'cancel_reason' | 'error_message';
export type GroupReplyIssueStatus = 'cancelled' | 'failed';
export type GroupReplyTaskArchiveStatusCounts = {
  sent: number;
  cancelled: number;
  failed: number;
};

export type GroupReplyIssueSummaryRecord = {
  key: string;
  label: string;
  source: GroupReplyIssueSource;
  status: GroupReplyIssueStatus;
  count: number;
};

export type GroupReplyTaskArchiveDailyStat = {
  date: string;
  taskCount: number;
  turnCount: number;
  statusCounts: GroupReplyTaskArchiveStatusCounts;
};

export type GroupReplyTaskArchiveActorStat = {
  actorCharacterId: string;
  actorName: string;
  taskCount: number;
  turnCount: number;
  statusCounts: GroupReplyTaskArchiveStatusCounts;
  dailyStats: Record<string, GroupReplyTaskArchiveDailyStat>;
  issueSummary: GroupReplyIssueSummaryRecord[];
};

export type GroupReplyTaskArchiveBucket = {
  archivedTaskCount: number;
  archivedTurnCount: number;
  statusCounts: GroupReplyTaskArchiveStatusCounts;
  dailyStats: Record<string, GroupReplyTaskArchiveDailyStat>;
  actorStats: Record<string, GroupReplyTaskArchiveActorStat>;
  issueSummary: GroupReplyIssueSummaryRecord[];
  lastArchivedAt?: string | null;
  lastCutoff?: string | null;
};

export type GroupReplyTaskArchiveStore = {
  version: 1;
  global: GroupReplyTaskArchiveBucket;
  groups: Record<string, GroupReplyTaskArchiveBucket>;
};

export function createEmptyGroupReplyTaskArchiveStatusCounts(): GroupReplyTaskArchiveStatusCounts {
  return {
    sent: 0,
    cancelled: 0,
    failed: 0,
  };
}

export function createEmptyGroupReplyTaskArchiveDailyStat(
  date: string,
): GroupReplyTaskArchiveDailyStat {
  return {
    date,
    taskCount: 0,
    turnCount: 0,
    statusCounts: createEmptyGroupReplyTaskArchiveStatusCounts(),
  };
}

export function createEmptyGroupReplyTaskArchiveActorStat(
  actorCharacterId: string,
  actorName: string,
): GroupReplyTaskArchiveActorStat {
  return {
    actorCharacterId,
    actorName,
    taskCount: 0,
    turnCount: 0,
    statusCounts: createEmptyGroupReplyTaskArchiveStatusCounts(),
    dailyStats: {},
    issueSummary: [],
  };
}

export function createEmptyGroupReplyTaskArchiveBucket(): GroupReplyTaskArchiveBucket {
  return {
    archivedTaskCount: 0,
    archivedTurnCount: 0,
    statusCounts: createEmptyGroupReplyTaskArchiveStatusCounts(),
    dailyStats: {},
    actorStats: {},
    issueSummary: [],
    lastArchivedAt: null,
    lastCutoff: null,
  };
}

export function createEmptyGroupReplyTaskArchiveStore(): GroupReplyTaskArchiveStore {
  return {
    version: 1,
    global: createEmptyGroupReplyTaskArchiveBucket(),
    groups: {},
  };
}

export function normalizeGroupReplyErrorMessage(message: string) {
  return message.trim().slice(0, 80) || 'unknown_error';
}

export function formatGroupReplyIssueLabel(
  source: GroupReplyIssueSource,
  value: string,
) {
  if (source === 'cancel_reason') {
    if (value === 'superseded_by_new_user_message') {
      return '新用户消息覆盖了旧轮任务';
    }
    if (value === 'actor_missing') {
      return '角色缺失或画像不可用';
    }
    return value;
  }

  return value;
}

export function buildGroupReplyIssueSummaryFromTasks(
  tasks: Pick<GroupReplyTaskEntity, 'status' | 'cancelReason' | 'errorMessage'>[],
  limit = 8,
): GroupReplyIssueSummaryRecord[] {
  const issueCounts = new Map<string, GroupReplyIssueSummaryRecord>();

  for (const task of tasks) {
    if (task.status === 'cancelled' && task.cancelReason) {
      const key = `cancel:${task.cancelReason}`;
      const existing = issueCounts.get(key);
      issueCounts.set(key, {
        key,
        label: formatGroupReplyIssueLabel('cancel_reason', task.cancelReason),
        source: 'cancel_reason',
        status: 'cancelled',
        count: (existing?.count ?? 0) + 1,
      });
    }

    if (task.status === 'failed' && task.errorMessage) {
      const normalizedError = normalizeGroupReplyErrorMessage(task.errorMessage);
      const key = `error:${normalizedError}`;
      const existing = issueCounts.get(key);
      issueCounts.set(key, {
        key,
        label: formatGroupReplyIssueLabel('error_message', normalizedError),
        source: 'error_message',
        status: 'failed',
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return [...issueCounts.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

export function mergeGroupReplyIssueSummaries(
  current: GroupReplyIssueSummaryRecord[],
  incoming: GroupReplyIssueSummaryRecord[],
  limit = 12,
): GroupReplyIssueSummaryRecord[] {
  const merged = new Map<string, GroupReplyIssueSummaryRecord>();

  for (const item of [...current, ...incoming]) {
    const existing = merged.get(item.key);
    merged.set(item.key, {
      ...item,
      count: (existing?.count ?? 0) + item.count,
    });
  }

  return [...merged.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

export function normalizeGroupReplyTaskArchiveStore(
  input: unknown,
): GroupReplyTaskArchiveStore {
  const emptyStore = createEmptyGroupReplyTaskArchiveStore();
  const emptyBucket = createEmptyGroupReplyTaskArchiveBucket();
  if (!input || typeof input !== 'object') {
    return emptyStore;
  }

  const parsed = input as Partial<GroupReplyTaskArchiveStore>;
  if (parsed.version !== 1) {
    return emptyStore;
  }

  return {
    version: 1,
    global: normalizeGroupReplyTaskArchiveBucket(parsed.global),
    groups: Object.fromEntries(
      Object.entries(parsed.groups ?? {}).map(([groupId, value]) => [
        groupId,
        normalizeGroupReplyTaskArchiveBucket(value),
      ]),
    ),
  };

  function normalizeGroupReplyTaskArchiveBucket(
    bucket: Partial<GroupReplyTaskArchiveBucket> | undefined,
  ): GroupReplyTaskArchiveBucket {
    return {
      ...emptyBucket,
      ...bucket,
      statusCounts: {
        ...emptyBucket.statusCounts,
        ...(bucket?.statusCounts ?? {}),
      },
      dailyStats: Object.fromEntries(
        Object.entries(bucket?.dailyStats ?? {}).map(([date, value]) => [
          date,
          {
            ...createEmptyGroupReplyTaskArchiveDailyStat(date),
            ...value,
            statusCounts: {
              ...createEmptyGroupReplyTaskArchiveStatusCounts(),
              ...(value?.statusCounts ?? {}),
            },
          },
        ]),
      ),
      actorStats: Object.fromEntries(
        Object.entries(bucket?.actorStats ?? {}).map(([actorId, value]) => [
          actorId,
          {
            ...createEmptyGroupReplyTaskArchiveActorStat(
              actorId,
              value?.actorName ?? actorId,
            ),
            ...value,
            statusCounts: {
              ...createEmptyGroupReplyTaskArchiveStatusCounts(),
              ...(value?.statusCounts ?? {}),
            },
            dailyStats: Object.fromEntries(
              Object.entries(value?.dailyStats ?? {}).map(([date, dailyValue]) => [
                date,
                {
                  ...createEmptyGroupReplyTaskArchiveDailyStat(date),
                  ...dailyValue,
                  statusCounts: {
                    ...createEmptyGroupReplyTaskArchiveStatusCounts(),
                    ...(dailyValue?.statusCounts ?? {}),
                  },
                },
              ]),
            ),
            issueSummary: value?.issueSummary ?? [],
          },
        ]),
      ),
      issueSummary: bucket?.issueSummary ?? [],
    };
  }
}

export function calculateGroupReplyFailureRate(
  statusCounts: GroupReplyTaskArchiveStatusCounts,
) {
  const total =
    statusCounts.sent + statusCounts.cancelled + statusCounts.failed;
  return total > 0 ? statusCounts.failed / total : 0;
}

export function calculateGroupReplyCancelRate(
  statusCounts: GroupReplyTaskArchiveStatusCounts,
) {
  const total =
    statusCounts.sent + statusCounts.cancelled + statusCounts.failed;
  return total > 0 ? statusCounts.cancelled / total : 0;
}
