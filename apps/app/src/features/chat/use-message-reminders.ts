import { useEffect, useMemo } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMessageReminder,
  getMessageReminders,
  markMessageReminderNotified,
  removeMessageReminder,
  type CreateMessageReminderRequest,
  type MessageReminderRecord,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

const t = translateRuntimeMessage;
import {
  removeLocalChatMessageReminder,
  replaceLocalChatMessageReminders,
  type LocalChatMessageReminderRecord,
  useLocalChatMessageActionState,
} from "./local-chat-message-actions";

type SetMessageReminderInput = CreateMessageReminderRequest;

// 模块级互斥，跨 hook 实例共享。一次 mobile 渲染树通常同时有 4 处 useMessageReminders
// (mobile-shell / chat-list-page / chat-message-list / mobile-reminder-toast-host)，
// 每个实例自己的 useRef 互不知情；任意一个有"本地遗留 reminder 没同步过来"时，
// 4 个实例的 migration effect 在同一 tick 里都看到 ref.current === false → 4 份
// 并发的 createMessageReminder 同时往 server 灌同一个 messageId，server 端没幂等
// 就会得到 4 条重复记录，下次 refetch 用户看到同一个提醒列了 4 行。
// 改成 module-level let，谁先抢到谁去 migrate，其他实例等下一轮。
let migrationInFlight = false;

function buildLegacyReminderRecord(
  reminder: LocalChatMessageReminderRecord,
): MessageReminderRecord {
  const sourceId = `legacy-message-reminder-${reminder.messageId}`;
  return {
    id: sourceId,
    sourceId,
    messageId: reminder.messageId,
    threadId: reminder.threadId,
    threadType: reminder.threadType,
    threadTitle: reminder.threadTitle,
    previewText: reminder.previewText?.trim() || t(msg`聊天消息`),
    remindAt: reminder.remindAt,
    notifiedAt: reminder.notifiedAt,
    createdAt: reminder.notifiedAt ?? reminder.remindAt,
  };
}

function mergeReminderRecords(
  remoteReminders: readonly MessageReminderRecord[],
  localReminders: readonly LocalChatMessageReminderRecord[],
) {
  const remoteMessageIdSet = new Set(
    remoteReminders.map((reminder) => reminder.messageId),
  );

  return [
    ...remoteReminders,
    ...localReminders
      .filter((reminder) => !remoteMessageIdSet.has(reminder.messageId))
      .map(buildLegacyReminderRecord),
  ];
}

export function useMessageReminders() {
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const { reminders: localReminders } = useLocalChatMessageActionState();

  const remindersQuery = useQuery({
    queryKey: ["app-message-reminders", baseUrl],
    queryFn: () => getMessageReminders(baseUrl),
    enabled: Boolean(baseUrl),
    // 提醒清单很少在 10s 内连续变更：30s + 切回窗口时刷新已经够用。
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    // 走查 R3：useMessageReminders 被 mobile-shell（常驻）+ mobile-reminder-toast-host
    // （常驻）+ chat-message-list（每个单聊/群聊页都挂）+ chat-list-page 多处订阅，
    // 没 staleTime → react-query 默认 stale=0：用户每进 / 切一段单聊都让
    // chat-message-list 的 observer mount，立刻 background refetch 一次
    // GET /message-reminders（公网隧道 ~600ms）。refetchInterval=30s 已经保证
    // 30s 内一次定时刷新，mount 触发的重发本身就是浪费。补 staleTime 复用
    // 现有 cache。createReminderMutation / removeReminderMutation /
    // markNotifiedMutation 全部走 setQueryData 同步更新，30s 内 stale 也不
    // 会让用户看到过期数据。
    staleTime: 30_000,
  });

  const createReminderMutation = useMutation({
    mutationFn: async (payload: SetMessageReminderInput) => {
      if (!baseUrl) {
        throw new Error(t(msg`当前世界地址不可用，暂时无法同步提醒。`));
      }

      return createMessageReminder(payload, baseUrl);
    },
    onSuccess: (record) => {
      queryClient.setQueryData<MessageReminderRecord[]>(
        ["app-message-reminders", baseUrl],
        (current = []) => [
          record,
          ...current.filter((item) => item.sourceId !== record.sourceId),
        ],
      );
      removeLocalChatMessageReminder(record.messageId);
    },
  });

  const removeReminderMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!baseUrl) {
        throw new Error(t(msg`当前世界地址不可用，暂时无法同步提醒。`));
      }

      await removeMessageReminder(sourceId, baseUrl);
      return sourceId;
    },
    onSuccess: (sourceId) => {
      queryClient.setQueryData<MessageReminderRecord[]>(
        ["app-message-reminders", baseUrl],
        (current = []) => current.filter((item) => item.sourceId !== sourceId),
      );
    },
  });

  const markNotifiedMutation = useMutation({
    mutationFn: async ({
      sourceId,
      notifiedAt,
    }: {
      sourceId: string;
      notifiedAt?: string;
    }) => {
      if (!baseUrl) {
        throw new Error(t(msg`当前世界地址不可用，暂时无法同步提醒。`));
      }

      return markMessageReminderNotified(
        sourceId,
        notifiedAt ? { notifiedAt } : undefined,
        baseUrl,
      );
    },
    onSuccess: (record) => {
      queryClient.setQueryData<MessageReminderRecord[]>(
        ["app-message-reminders", baseUrl],
        (current = []) =>
          current.map((item) =>
            item.sourceId === record.sourceId ? record : item,
          ),
      );
      removeLocalChatMessageReminder(record.messageId);
    },
  });

  useEffect(() => {
    if (
      !baseUrl ||
      !remindersQuery.isSuccess ||
      !localReminders.length ||
      migrationInFlight
    ) {
      return;
    }

    const remoteReminders = remindersQuery.data ?? [];
    const remoteMessageIdSet = new Set(
      remoteReminders.map((reminder) => reminder.messageId),
    );
    const remainingLocalReminders = localReminders.filter(
      (reminder) => !remoteMessageIdSet.has(reminder.messageId),
    );

    if (remainingLocalReminders.length !== localReminders.length) {
      replaceLocalChatMessageReminders(remainingLocalReminders);
    }

    const pendingMigrationReminders = remainingLocalReminders.filter(
      (reminder) => reminder.threadId.trim(),
    );
    if (!pendingMigrationReminders.length) {
      return;
    }

    migrationInFlight = true;
    void Promise.allSettled(
      pendingMigrationReminders.map((reminder) =>
        createMessageReminder(
          {
            threadId: reminder.threadId,
            threadType: reminder.threadType,
            messageId: reminder.messageId,
            remindAt: reminder.remindAt,
            notifiedAt: reminder.notifiedAt,
          },
          baseUrl,
        ),
      ),
    ).then((results) => {
      const migratedRecords: MessageReminderRecord[] = [];
      const failedMessageIds = new Set<string>();

      results.forEach((result, index) => {
        const reminder = pendingMigrationReminders[index];
        if (result.status === "fulfilled") {
          migratedRecords.push(result.value);
          return;
        }

        failedMessageIds.add(reminder.messageId);
      });

      queryClient.setQueryData<MessageReminderRecord[]>(
        ["app-message-reminders", baseUrl],
        (current = []) => {
          const next = [...current];
          migratedRecords.forEach((record) => {
            const existingIndex = next.findIndex(
              (item) => item.sourceId === record.sourceId,
            );
            if (existingIndex >= 0) {
              next[existingIndex] = record;
              return;
            }

            next.unshift(record);
          });
          return next;
        },
      );

      replaceLocalChatMessageReminders(
        remainingLocalReminders.filter((reminder) =>
          failedMessageIds.has(reminder.messageId),
        ),
      );
      migrationInFlight = false;
    });
  }, [
    baseUrl,
    localReminders,
    queryClient,
    remindersQuery.data,
    remindersQuery.isSuccess,
  ]);

  const reminders = useMemo(
    () => mergeReminderRecords(remindersQuery.data ?? [], localReminders),
    [localReminders, remindersQuery.data],
  );
  const reminderMap = useMemo(
    () => new Map(reminders.map((reminder) => [reminder.messageId, reminder])),
    [reminders],
  );

  async function setReminder(
    input: SetMessageReminderInput,
    fallbackReminder?: LocalChatMessageReminderRecord,
  ) {
    if (!baseUrl || !input.threadId.trim()) {
      if (!fallbackReminder) {
        throw new Error(t(msg`当前消息暂时不能设提醒。`));
      }

      replaceLocalChatMessageReminders([
        fallbackReminder,
        ...localReminders.filter((item) => item.messageId !== input.messageId),
      ]);
      return buildLegacyReminderRecord(fallbackReminder);
    }

    return createReminderMutation.mutateAsync(input);
  }

  async function clearReminder(messageId: string) {
    const reminder = reminderMap.get(messageId);
    removeLocalChatMessageReminder(messageId);
    if (!reminder || reminder.sourceId.startsWith("legacy-")) {
      return;
    }

    await removeReminderMutation.mutateAsync(reminder.sourceId);
  }

  async function clearReminders(messageIds: readonly string[]) {
    const uniqueMessageIds = Array.from(
      new Set(messageIds.filter((messageId) => messageId.trim())),
    );
    if (!uniqueMessageIds.length) {
      return;
    }

    const results = await Promise.allSettled(
      uniqueMessageIds.map((messageId) => clearReminder(messageId)),
    );
    const rejectedResult = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejectedResult) {
      throw rejectedResult.reason;
    }
  }

  async function notifyReminder(messageId: string, notifiedAt?: string) {
    const reminder = reminderMap.get(messageId);
    if (!reminder) {
      return;
    }

    if (!baseUrl || reminder.sourceId.startsWith("legacy-")) {
      replaceLocalChatMessageReminders(
        localReminders.map((item) =>
          item.messageId === messageId
            ? {
                ...item,
                notifiedAt: notifiedAt ?? new Date().toISOString(),
              }
            : item,
        ),
      );
      return;
    }

    await markNotifiedMutation.mutateAsync({
      sourceId: reminder.sourceId,
      notifiedAt,
    });
  }

  return {
    reminders,
    reminderMap,
    isLoading: remindersQuery.isLoading,
    isFetching: remindersQuery.isFetching,
    setReminder,
    clearReminder,
    clearReminders,
    notifyReminder,
  };
}
