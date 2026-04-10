import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMessageReminder,
  getMessageReminders,
  markMessageReminderNotified,
  removeMessageReminder,
  type CreateMessageReminderRequest,
  type MessageReminderRecord,
} from "@yinjie/contracts";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  removeLocalChatMessageReminder,
  replaceLocalChatMessageReminders,
  type LocalChatMessageReminderRecord,
  useLocalChatMessageActionState,
} from "./local-chat-message-actions";

type SetMessageReminderInput = CreateMessageReminderRequest;

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
    previewText: reminder.previewText?.trim() || "聊天消息",
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
  const migrationInFlightRef = useRef(false);

  const remindersQuery = useQuery({
    queryKey: ["app-message-reminders", baseUrl],
    queryFn: () => getMessageReminders(baseUrl),
    enabled: Boolean(baseUrl),
    refetchInterval: 10_000,
  });

  const createReminderMutation = useMutation({
    mutationFn: async (payload: SetMessageReminderInput) => {
      if (!baseUrl) {
        throw new Error("当前世界地址不可用，暂时无法同步提醒。");
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
        throw new Error("当前世界地址不可用，暂时无法同步提醒。");
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
        throw new Error("当前世界地址不可用，暂时无法同步提醒。");
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
      migrationInFlightRef.current
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

    migrationInFlightRef.current = true;
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
      migrationInFlightRef.current = false;
    });
  }, [baseUrl, localReminders, queryClient, remindersQuery.data, remindersQuery.isSuccess]);

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
        throw new Error("当前消息暂时不能设提醒。");
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
    notifyReminder,
  };
}
