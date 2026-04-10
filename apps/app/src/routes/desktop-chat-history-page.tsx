import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearConversationHistory,
  clearGroupMessages,
  getConversationMessages,
  getConversations,
  getGroupMessages,
  type ConversationListItem,
  type GroupMessage,
  type Message,
} from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import {
  filterSearchableChatMessages,
  useLocalChatMessageActionState,
} from "../features/chat/local-chat-message-actions";
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { sanitizeDisplayedChatText } from "../lib/chat-text";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import {
  formatConversationTimestamp,
  formatMessageTimestamp,
  parseTimestamp,
} from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const INITIAL_HISTORY_LIMIT = 80;
const HISTORY_LOAD_STEP = 80;

export function DesktopChatHistoryPage() {
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const localMessageActionState = useLocalChatMessageActionState();
  const { reminders } = useMessageReminders();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(INITIAL_HISTORY_LIMIT);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );

  useEffect(() => {
    if (!conversations.length) {
      setSelectedConversationId(null);
      return;
    }

    if (
      selectedConversationId &&
      conversations.some((item) => item.id === selectedConversationId)
    ) {
      return;
    }

    setSelectedConversationId(conversations[0].id);
  }, [conversations, selectedConversationId]);

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;

  const messagesQuery = useQuery({
    queryKey: [
      "desktop-chat-history",
      baseUrl,
      selectedConversation?.id,
      selectedConversation?.type,
      historyLimit,
    ],
    queryFn: async () => {
      if (!selectedConversation) {
        return [];
      }

      if (isPersistedGroupConversation(selectedConversation)) {
        return getGroupMessages(selectedConversation.id, baseUrl, {
          limit: historyLimit,
        });
      }

      return getConversationMessages(selectedConversation.id, baseUrl, {
        limit: historyLimit,
      });
    },
    enabled: Boolean(selectedConversation),
    placeholderData: (previousData) => previousData ?? [],
  });

  const clearMutation = useMutation({
    mutationFn: async (conversation: ConversationListItem) => {
      if (isPersistedGroupConversation(conversation)) {
        return clearGroupMessages(conversation.id, baseUrl);
      }

      return clearConversationHistory(conversation.id, baseUrl);
    },
    onSuccess: async (_, conversation) => {
      setNotice(`${conversation.title} 的聊天记录已清空。`);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "desktop-chat-history",
            baseUrl,
            conversation.id,
            conversation.type,
          ],
        }),
      ]);
    },
  });

  const historyRows = useMemo(
    () =>
      normalizeHistoryRows(
        filterSearchableChatMessages(
          (messagesQuery.data ?? []) as Array<Message | GroupMessage>,
          localMessageActionState,
        ),
        reminders,
      ).sort(
        (left, right) =>
          (parseTimestamp(right.createdAt) ?? 0) -
          (parseTimestamp(left.createdAt) ?? 0),
      ),
    [localMessageActionState, messagesQuery.data, reminders],
  );
  const mayHaveEarlierMessages =
    historyRows.length > 0 && historyRows.length >= historyLimit;

  useEffect(() => {
    setHistoryLimit(INITIAL_HISTORY_LIMIT);
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,249,240,0.96))]">
      <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,248,238,0.96))]">
        <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
          <div className="text-base font-medium text-[color:var(--text-primary)]">
            聊天记录管理
          </div>
          <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
            先按会话查看和清理消息，逐步往更像微信电脑端的历史翻阅工作流收口。
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {conversationsQuery.isLoading ? (
            <LoadingBlock label="正在读取会话..." />
          ) : null}
          {conversationsQuery.isError &&
          conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}

          <div className="space-y-1.5">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedConversationId(conversation.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition",
                  conversation.id === selectedConversationId
                    ? "border-[rgba(249,115,22,0.20)] bg-white/94 shadow-[var(--shadow-soft)]"
                    : "border-transparent bg-transparent hover:border-[color:var(--border-faint)] hover:bg-white/82",
                )}
              >
                <AvatarChip name={conversation.title} size="wechat" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                    {conversation.title}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {conversation.type === "group" ? "群聊" : "单聊"} ·{" "}
                    {formatConversationTimestamp(conversation.lastActivityAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="min-w-0 flex-1 overflow-auto p-6">
        {selectedConversation ? (
          <DesktopEntryShell
            badge="History"
            title={selectedConversation.title}
            description="这里先承接当前会话的聊天摘要、逐步加载更早消息和清理动作，让桌面端先具备微信式历史翻阅工作流。"
            aside={
              <div className="space-y-3">
                <InfoCard
                  label="会话类型"
                  value={
                    selectedConversation.type === "group" ? "群聊" : "单聊"
                  }
                />
                <InfoCard
                  label="最近活跃"
                  value={formatConversationTimestamp(
                    selectedConversation.lastActivityAt,
                  )}
                />
                <InfoCard label="已加载" value={`${historyRows.length} 条`} />
                <InfoCard
                  label="本机提醒"
                  value={`${historyRows.filter((item) => item.reminderAt).length} 条`}
                />
                <InfoCard label="加载窗口" value={`最近 ${historyLimit} 条`} />
                <InfoCard
                  label="更早消息"
                  value={mayHaveEarlierMessages ? "继续展开" : "已全部加载"}
                />
              </div>
            }
          >
            {notice ? (
              <InlineNotice tone="success">{notice}</InlineNotice>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void messagesQuery.refetch();
                  setNotice(
                    `已刷新当前会话最近 ${historyRows.length} 条记录。`,
                  );
                }}
              >
                刷新记录
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!mayHaveEarlierMessages) {
                    setNotice("当前会话的聊天记录已经全部加载。");
                    return;
                  }

                  setHistoryLimit((current) => current + HISTORY_LOAD_STEP);
                }}
                disabled={!historyRows.length || messagesQuery.isFetching}
              >
                {messagesQuery.isFetching
                  ? "正在加载更早消息..."
                  : mayHaveEarlierMessages
                    ? `加载更早消息（当前 ${historyRows.length} 条）`
                    : "历史已全部加载"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => clearMutation.mutate(selectedConversation)}
                disabled={clearMutation.isPending}
                className="border-[rgba(239,68,68,0.18)] text-[color:var(--state-danger-text)]"
              >
                {clearMutation.isPending ? "清空中..." : "清空当前会话记录"}
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              {messagesQuery.isLoading ? (
                <LoadingBlock label="正在读取聊天记录..." />
              ) : null}
              {messagesQuery.isError && messagesQuery.error instanceof Error ? (
                <ErrorBlock message={messagesQuery.error.message} />
              ) : null}
              {clearMutation.isError && clearMutation.error instanceof Error ? (
                <ErrorBlock message={clearMutation.error.message} />
              ) : null}

              {historyRows.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-[color:var(--border-faint)] bg-white/92 p-5 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {item.senderName}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {formatMessageTimestamp(item.createdAt)}
                      </div>
                    </div>
                    <span className="rounded-full bg-[rgba(255,138,61,0.10)] px-2.5 py-1 text-[11px] text-[color:var(--brand-primary)]">
                      {item.typeLabel}
                    </span>
                    {item.reminderAt ? (
                      <span className="rounded-full bg-[rgba(59,130,246,0.12)] px-2.5 py-1 text-[11px] text-[#2563eb]">
                        提醒 · {formatMessageTimestamp(item.reminderAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">
                    {item.preview}
                  </div>
                </div>
              ))}

              {!messagesQuery.isLoading && !historyRows.length ? (
                <EmptyState
                  title="当前会话还没有可管理的记录"
                  description="可能刚刚清空过，或者这个会话目前还没有任何消息。"
                />
              ) : null}

              {!messagesQuery.isLoading &&
              historyRows.length > 0 &&
              mayHaveEarlierMessages ? (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setHistoryLimit((current) => current + HISTORY_LOAD_STEP)
                    }
                    disabled={messagesQuery.isFetching}
                    className="rounded-full"
                  >
                    {messagesQuery.isFetching
                      ? "正在加载更早消息..."
                      : "继续加载更早消息"}
                  </Button>
                </div>
              ) : null}
            </div>
          </DesktopEntryShell>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="先从左侧选择一个会话"
              description="聊天记录管理会优先按会话承接查看和清理操作。"
            />
          </div>
        )}
      </section>
    </div>
  );
}

function normalizeHistoryRows(
  messages: Array<Message | GroupMessage>,
  reminders: Array<{ messageId: string; remindAt: string }>,
) {
  const reminderMap = new Map(
    reminders.map((item) => [item.messageId, item.remindAt]),
  );

  return messages.map((item) => ({
    id: item.id,
    senderName: item.senderName,
    createdAt: item.createdAt,
    preview: resolveMessagePreview(item),
    reminderAt: reminderMap.get(item.id),
    typeLabel: resolveMessageTypeLabel(item.type),
  }));
}

function resolveMessagePreview(item: Message | GroupMessage) {
  if (item.attachment?.kind === "image") {
    return item.text.trim() || `图片 · ${item.attachment.fileName}`;
  }

  if (item.attachment?.kind === "file") {
    return item.text.trim() || `文件 · ${item.attachment.fileName}`;
  }

  if (item.attachment?.kind === "voice") {
    return item.text.trim() || "语音";
  }

  if (item.attachment?.kind === "contact_card") {
    return item.text.trim() || `名片 · ${item.attachment.name}`;
  }

  if (item.attachment?.kind === "location_card") {
    return item.text.trim() || `位置 · ${item.attachment.title}`;
  }

  if (item.type === "sticker" && item.attachment?.kind === "sticker") {
    return `表情 · ${item.attachment.label ?? item.attachment.stickerId}`;
  }

  const preview =
    item.senderType === "user"
      ? item.text.trim()
      : sanitizeDisplayedChatText(item.text);

  return preview || "这条消息没有文本内容。";
}

function resolveMessageTypeLabel(type: Message["type"] | GroupMessage["type"]) {
  if (type === "image") {
    return "图片";
  }

  if (type === "file") {
    return "文件";
  }

  if (type === "voice") {
    return "语音";
  }

  if (type === "contact_card") {
    return "名片";
  }

  if (type === "location_card") {
    return "位置";
  }

  if (type === "sticker") {
    return "表情";
  }

  if (type === "system") {
    return "系统";
  }

  return "文本";
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-white/88 p-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
