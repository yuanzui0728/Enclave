import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
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
import { DesktopLayoutRequiredState } from "../components/desktop-layout-required-state";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import {
  buildDesktopChatHistoryRouteHash,
  parseDesktopChatHistoryRouteState,
} from "../features/desktop/chat/desktop-chat-history-route-state";
import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";
import {
  filterSearchableChatMessages,
  useLocalChatMessageActionState,
} from "../features/chat/local-chat-message-actions";
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { DesktopUtilityShell } from "../features/desktop/desktop-utility-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { sanitizeDisplayedChatText } from "../lib/chat-text";
import {
  getConversationThreadLabel,
  getConversationThreadType,
  isPersistedGroupConversation,
} from "../lib/conversation-route";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseDesktopChatHistoryRouteState(hash);
  const localMessageActionState = useLocalChatMessageActionState();
  const { reminders } = useMessageReminders();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(routeState.conversationId ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(INITIAL_HISTORY_LIMIT);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: isDesktopLayout,
  });

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );

  useEffect(() => {
    const nextRouteConversationId = routeState.conversationId ?? null;
    setSelectedConversationId((current) =>
      current === nextRouteConversationId ? current : nextRouteConversationId,
    );
  }, [routeState.conversationId]);

  useEffect(() => {
    if (!conversations.length) {
      if (selectedConversationId !== null) {
        setSelectedConversationId(null);
      }
      return;
    }

    if (
      routeState.conversationId &&
      conversations.some((item) => item.id === routeState.conversationId)
    ) {
      if (selectedConversationId !== routeState.conversationId) {
        setSelectedConversationId(routeState.conversationId);
      }
      return;
    }

    if (
      selectedConversationId &&
      conversations.some((item) => item.id === selectedConversationId)
    ) {
      return;
    }

    setSelectedConversationId(conversations[0].id);
  }, [conversations, routeState.conversationId, selectedConversationId]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    const nextHash = buildDesktopChatHistoryRouteHash(selectedConversationId);
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (normalizedHash === (nextHash ?? "")) {
      return;
    }

    void navigate({
      to: "/desktop/chat-history",
      hash: nextHash,
      replace: true,
    });
  }, [
    hash,
    isDesktopLayout,
    navigate,
    selectedConversationId,
  ]);

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;

  const messagesQuery = useQuery({
    queryKey: [
      "desktop-chat-history",
      baseUrl,
      selectedConversation?.id,
      selectedConversation
        ? getConversationThreadType(selectedConversation)
        : undefined,
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
    enabled: isDesktopLayout && Boolean(selectedConversation),
    placeholderData: (previousData, previousQuery) => {
      const previousConversationId = previousQuery?.queryKey[2];
      const previousConversationType = previousQuery?.queryKey[3];
      const currentConversationId = selectedConversation?.id;
      const currentConversationType = selectedConversation
        ? getConversationThreadType(selectedConversation)
        : undefined;

      if (
        previousConversationId !== currentConversationId ||
        previousConversationType !== currentConversationType
      ) {
        return [];
      }

      return previousData ?? [];
    },
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
            getConversationThreadType(conversation),
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

  const navigateToHistoryMessage = (
    conversation: ConversationListItem,
    messageId: string,
  ) => {
    void navigate({
      to: buildDesktopChatThreadPath({
        conversationId: conversation.id,
        messageId,
      }),
    });
  };

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
    return (
      <DesktopLayoutRequiredState
        title="聊天记录当前仅提供桌面布局"
        description="聊天记录工作区目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到消息页继续查看会话。"
        actionLabel="返回消息"
        fallbackTo="/tabs/chat"
      />
    );
  }

  return (
    <DesktopUtilityShell
      title="聊天记录"
      subtitle={
        selectedConversation
          ? `${selectedConversation.title} · 已加载 ${historyRows.length} 条`
          : "按会话查看、展开和清理最近聊天记录"
      }
      toolbar={
        selectedConversation ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void messagesQuery.refetch();
                setNotice(`已刷新当前会话最近 ${historyRows.length} 条记录。`);
              }}
              className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[#f5f7f7]"
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
              className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[#f5f7f7]"
            >
              {messagesQuery.isFetching
                ? "正在加载..."
                : mayHaveEarlierMessages
                  ? "加载更早消息"
                  : "历史已全部加载"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => clearMutation.mutate(selectedConversation)}
              disabled={clearMutation.isPending}
              className="h-8 rounded-[10px] border-[rgba(239,68,68,0.18)] bg-[rgba(254,242,242,0.92)] px-3 text-[12px] text-[color:var(--state-danger-text)] shadow-none hover:bg-[rgba(254,226,226,0.95)]"
            >
              {clearMutation.isPending ? "清空中..." : "清空记录"}
            </Button>
          </>
        ) : null
      }
      sidebar={
        <>
          <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              会话列表
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              选择一个会话后再查看历史消息。
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

            <div className="space-y-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition",
                    conversation.id === selectedConversationId
                      ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)]"
                      : "border-transparent bg-transparent hover:border-[color:var(--border-faint)] hover:bg-white/80",
                  )}
                >
                  {isPersistedGroupConversation(conversation) ? (
                    <GroupAvatarChip
                      name={conversation.title}
                      members={conversation.participants}
                      size="wechat"
                    />
                  ) : (
                    <AvatarChip name={conversation.title} size="wechat" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                      {conversation.title}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {getConversationThreadLabel(conversation)} ·{" "}
                      {formatConversationTimestamp(conversation.lastActivityAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      }
      aside={
        selectedConversation ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                当前会话
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                辅助查看当前加载窗口与提醒数量。
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="space-y-3">
                <InfoCard
                  label="会话类型"
                  value={getConversationThreadLabel(selectedConversation)}
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
                  value={mayHaveEarlierMessages ? "还可继续展开" : "已全部加载"}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <EmptyState
              title="先选会话"
              description="右侧会显示当前会话的加载与提醒摘要。"
            />
          </div>
        )
      }
    >
      <div className="p-5">
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

        <div className="mt-4 space-y-2.5">
          {messagesQuery.isLoading ? (
            <LoadingBlock label="正在读取聊天记录..." />
          ) : null}
          {messagesQuery.isError && messagesQuery.error instanceof Error ? (
            <ErrorBlock message={messagesQuery.error.message} />
          ) : null}
          {clearMutation.isError && clearMutation.error instanceof Error ? (
            <ErrorBlock message={clearMutation.error.message} />
          ) : null}

          {!selectedConversation ? (
            <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/80 p-6">
              <EmptyState
                title="先从左侧选择一个会话"
                description="聊天记录管理会优先按会话承接查看和清理操作。"
              />
            </div>
          ) : null}

          {selectedConversation
            ? historyRows.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4"
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
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="rounded-[8px] bg-[#f3f4f6] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                        {item.typeLabel}
                      </span>
                      {item.reminderAt ? (
                        <span className="rounded-[8px] bg-[rgba(59,130,246,0.12)] px-2.5 py-1 text-[11px] text-[#2563eb]">
                          提醒 · {formatMessageTimestamp(item.reminderAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                    {item.preview}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        navigateToHistoryMessage(selectedConversation, item.id)
                      }
                      className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 text-[12px] shadow-none hover:bg-white"
                    >
                      定位到原消息
                    </Button>
                  </div>
                </div>
              ))
            : null}

          {selectedConversation &&
          !messagesQuery.isLoading &&
          !historyRows.length ? (
            <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/80 p-6">
              <EmptyState
                title="当前会话还没有可管理的记录"
                description="可能刚刚清空过，或者这个会话目前还没有任何消息。"
              />
            </div>
          ) : null}

          {selectedConversation &&
          !messagesQuery.isLoading &&
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
                className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-white px-4 text-[12px] shadow-none hover:bg-[#f5f7f7]"
              >
                {messagesQuery.isFetching
                  ? "正在加载更早消息..."
                  : "继续加载更早消息"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </DesktopUtilityShell>
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
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-4">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
