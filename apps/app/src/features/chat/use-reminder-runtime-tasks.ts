import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelReminderTask,
  completeReminderTask,
  getReminderTasks,
  snoozeReminderTask,
  type ReminderTaskRecord,
  type SnoozeReminderTaskRequest,
} from "@yinjie/contracts";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

type UseReminderRuntimeTasksOptions = {
  enabled?: boolean;
};

function buildReminderTasksQueryKey(baseUrl?: string, status?: string) {
  return ["app-reminder-runtime-tasks", baseUrl, status ?? "all"] as const;
}

export function useReminderRuntimeTasks(
  options: UseReminderRuntimeTasksOptions = {},
) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const activeStatus = "active" as const;

  const tasksQuery = useQuery({
    queryKey: buildReminderTasksQueryKey(baseUrl, activeStatus),
    queryFn: () => getReminderTasks({ status: activeStatus }, baseUrl),
    enabled: enabled && Boolean(baseUrl),
    refetchInterval: enabled ? 30_000 : false,
  });

  const invalidateReminderQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["app-reminder-runtime-tasks", baseUrl],
      }),
      queryClient.invalidateQueries({
        queryKey: ["app-reminder-runtime-upcoming", baseUrl],
      }),
    ]);
  };

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!baseUrl) {
        throw new Error("当前世界地址不可用，暂时无法更新提醒。");
      }

      return completeReminderTask(taskId, baseUrl);
    },
    onSuccess: () => {
      void invalidateReminderQueries();
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async ({
      taskId,
      payload,
    }: {
      taskId: string;
      payload: SnoozeReminderTaskRequest;
    }) => {
      if (!baseUrl) {
        throw new Error("当前世界地址不可用，暂时无法更新提醒。");
      }

      return snoozeReminderTask(taskId, payload, baseUrl);
    },
    onSuccess: () => {
      void invalidateReminderQueries();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!baseUrl) {
        throw new Error("当前世界地址不可用，暂时无法更新提醒。");
      }

      return cancelReminderTask(taskId, baseUrl);
    },
    onSuccess: () => {
      void invalidateReminderQueries();
    },
  });

  async function completeTask(taskId: string) {
    return completeMutation.mutateAsync(taskId);
  }

  async function snoozeTask(
    taskId: string,
    payload: SnoozeReminderTaskRequest,
  ) {
    return snoozeMutation.mutateAsync({ taskId, payload });
  }

  async function cancelTask(taskId: string) {
    return cancelMutation.mutateAsync(taskId);
  }

  return {
    tasks: (tasksQuery.data ?? []) as ReminderTaskRecord[],
    isLoading: tasksQuery.isLoading,
    isFetching: tasksQuery.isFetching,
    error:
      tasksQuery.error instanceof Error ? tasksQuery.error.message : undefined,
    completeTask,
    snoozeTask,
    cancelTask,
    completePendingTaskId: completeMutation.variables ?? null,
    snoozePendingTaskId: snoozeMutation.variables?.taskId ?? null,
    cancelPendingTaskId: cancelMutation.variables ?? null,
  };
}
