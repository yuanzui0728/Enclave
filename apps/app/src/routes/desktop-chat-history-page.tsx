import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
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
import { useRuntimeTranslator } from "@yinjie/i18n";
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
import { DesktopChatConfirmDialog } from "../features/desktop/chat/desktop-chat-confirm-dialog";
import {
  filterSearchableChatMessages,
  useLocalChatMessageActionState,
} from "../features/chat/local-chat-message-actions";
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { DesktopUtilityShell } from "../features/desktop/desktop-utility-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { getConversationDisplayTitle } from "../lib/conversation-preview";
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
import { resolveMessageSemanticPreview } from "../lib/message-attachment-semantic";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const INITIAL_HISTORY_LIMIT = 80;
const HISTORY_LOAD_STEP = 80;

export function DesktopChatHistoryPage() {
  const t = useRuntimeTranslator();
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
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

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
      setNotice(
        t(
          msg`${getConversationDisplayTitle(conversation.title)} 的聊天记录已清空。`,
        ),
      );
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
        t,
      ).sort(
        (left, right) =>
          (parseTimestamp(right.createdAt) ?? 0) -
          (parseTimestamp(left.createdAt) ?? 0),
      ),
    [localMessageActionState, messagesQuery.data, reminders, t],
  );
  const rawMessageCount = messagesQuery.data?.length ?? 0;
  // 本地隐藏/撤回会让 historyRows.length < rawMessageCount，按过滤后长度判断会误判"已全部加载"
  const mayHaveEarlierMessages =
    rawMessageCount > 0 && rawMessageCount >= historyLimit;

  // 走查电脑端群聊 R6：和姊妹 desktop-chat-files-page R5（commit cf5e1606c）/
  // DesktopGroupDetailCard R4（commit 165ca9815）同款 pattern。聊天记录页
  //「定位到原消息」按钮 line 484-493 inline onClick → navigateToHistoryMessage
  //（selectedConversation, item.id）→ 直接 push /tabs/chat?...messageId=...
  // 无任何 throttle。同帧 <16ms 双击都通过 → 2 条相同 history 项 → 用户从
  // 被定位的群消息返回历史页要按 2 次返回；群消息 around-message 窗口拉取
  // 走 getGroupMessages 公网 RTT（~600ms），thread panel 内 highlightedMessageId
  // 触发的 anchor-window fetch 第 2 次也会重复发出。按 messageId 分锁（不同
  // 历史行同帧连点是合法操作），raf 释放兜底 disabled / 同会话内 hash-update
  // 边界。
  const navigatingHistoryMessageIdsRef = useRef<Set<string>>(new Set());
  const navigateToHistoryMessage = (
    conversation: ConversationListItem,
    messageId: string,
  ) => {
    if (navigatingHistoryMessageIdsRef.current.has(messageId)) {
      return;
    }
    navigatingHistoryMessageIdsRef.current.add(messageId);
    void navigate({
      to: buildDesktopChatThreadPath({
        conversationId: conversation.id,
        messageId,
      }),
    });
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        navigatingHistoryMessageIdsRef.current.delete(messageId);
      });
    } else {
      navigatingHistoryMessageIdsRef.current.delete(messageId);
    }
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
        title={t(msg`聊天记录当前仅提供桌面布局`)}
        description={t(msg`聊天记录工作区目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到消息页继续查看会话。`)}
        actionLabel={t(msg`返回消息`)}
        fallbackTo="/tabs/chat"
      />
    );
  }

  return (
    <DesktopUtilityShell
      title={t(msg`聊天记录`)}
      subtitle={
        selectedConversation
          ? // 走查电脑端单聊 R91：和 R90 desktop-chat-files-page 同款——subtitle
            // 直接拼 selectedConversation.title，没经 getConversationDisplayTitle
            // 翻 sentinel。direct 会话在 normalizeLegacyConversationEntity 全部
            // fallback 失败时落字面量「未知联系人」/「Direct conversation」，
            // 非中文 locale 用户切到 en/ja/ko 后顶栏副标继续显示中文。本文件
            // line 198 toast / line 372 sidebar 行都已走 getConversationDisplayTitle，
            // 只有页面顶栏 subtitle 漏。
            t(msg`${getConversationDisplayTitle(selectedConversation.title)} · 已加载 ${historyRows.length} 条`)
          : t(msg`按会话查看、展开和清理最近聊天记录`)
      }
      toolbar={
        selectedConversation ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void messagesQuery.refetch();
                setNotice(t(msg`已刷新当前会话最近的记录。`));
              }}
              className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[#f5f7f7]"
            >
              {t(msg`刷新记录`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!mayHaveEarlierMessages) {
                  setNotice(t(msg`当前会话的聊天记录已经全部加载。`));
                  return;
                }

                setHistoryLimit((current) => current + HISTORY_LOAD_STEP);
              }}
              disabled={!historyRows.length || messagesQuery.isFetching}
              className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[#f5f7f7]"
            >
              {messagesQuery.isFetching
                ? t(msg`正在加载...`)
                : mayHaveEarlierMessages
                  ? t(msg`加载更早消息`)
                  : t(msg`历史已全部加载`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setClearConfirmOpen(true)}
              disabled={clearMutation.isPending}
              className="h-8 rounded-[10px] border-[rgba(239,68,68,0.18)] bg-[rgba(254,242,242,0.92)] px-3 text-[12px] text-[color:var(--state-danger-text)] shadow-none hover:bg-[rgba(254,226,226,0.95)]"
            >
              {clearMutation.isPending ? t(msg`清空中...`) : t(msg`清空记录`)}
            </Button>
          </>
        ) : null
      }
      sidebar={
        <>
          <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`会话列表`)}
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              {t(msg`选择一个会话后再查看历史消息。`)}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
            {conversationsQuery.isLoading ? (
              <LoadingBlock label={t(msg`正在读取会话...`)} />
            ) : null}
            {conversationsQuery.isError &&
            conversationsQuery.error instanceof Error ? (
              <ErrorBlock message={conversationsQuery.error.message} />
            ) : null}

            <div className="space-y-1">
              {conversations.map((conversation) => {
                const displayTitle = getConversationDisplayTitle(
                  conversation.title,
                );
                return (
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
                      name={displayTitle}
                      members={conversation.participants}
                      size="wechat"
                    />
                  ) : (
                    <AvatarChip
                      name={displayTitle}
                      src={conversation.avatar}
                      size="wechat"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                      {displayTitle}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {getConversationThreadLabel(conversation)} ·{" "}
                      {formatConversationTimestamp(conversation.lastActivityAt)}
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          </div>
        </>
      }
      aside={
        selectedConversation ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {t(msg`当前会话`)}
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                {t(msg`辅助查看当前加载窗口与提醒数量。`)}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="space-y-3">
                <InfoCard
                  label={t(msg`会话类型`)}
                  value={getConversationThreadLabel(selectedConversation)}
                />
                <InfoCard
                  label={t(msg`最近活跃`)}
                  value={formatConversationTimestamp(
                    selectedConversation.lastActivityAt,
                  )}
                />
                <InfoCard label={t(msg`已加载`)} value={t(msg`${historyRows.length} 条`)} />
                <InfoCard
                  label={t(msg`本机提醒`)}
                  value={t(msg`${historyRows.filter((item) => item.reminderAt).length} 条`)}
                />
                <InfoCard label={t(msg`加载窗口`)} value={t(msg`最近 ${historyLimit} 条`)} />
                <InfoCard
                  label={t(msg`更早消息`)}
                  value={mayHaveEarlierMessages ? t(msg`还可继续展开`) : t(msg`已全部加载`)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <EmptyState
              title={t(msg`先选会话`)}
              description={t(msg`右侧会显示当前会话的加载与提醒摘要。`)}
            />
          </div>
        )
      }
    >
      <div className="p-5">
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

        <div className="mt-4 space-y-2.5">
          {messagesQuery.isLoading ? (
            <LoadingBlock label={t(msg`正在读取聊天记录...`)} />
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
                title={t(msg`先从左侧选择一个会话`)}
                description={t(msg`聊天记录管理会优先按会话承接查看和清理操作。`)}
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
                          {t(msg`提醒 · ${formatMessageTimestamp(item.reminderAt)}`)}
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
                      {t(msg`定位到原消息`)}
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
                title={t(msg`当前会话还没有可管理的记录`)}
                description={t(msg`可能刚刚清空过，或者这个会话目前还没有任何消息。`)}
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
                  ? t(msg`正在加载更早消息...`)
                  : t(msg`继续加载更早消息`)}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <DesktopChatConfirmDialog
        open={clearConfirmOpen && Boolean(selectedConversation)}
        title={t(msg`清空聊天记录`)}
        description={
          selectedConversation && isPersistedGroupConversation(selectedConversation)
            ? t(msg`确认清空这个群聊的聊天记录吗？`)
            : t(msg`确认清空这段聊天记录吗？`)
        }
        confirmLabel={t(msg`清空记录`)}
        pendingLabel={t(msg`正在清空...`)}
        danger
        pending={clearMutation.isPending}
        onClose={() => {
          if (clearMutation.isPending) {
            return;
          }
          setClearConfirmOpen(false);
        }}
        onConfirm={() => {
          if (!selectedConversation || clearMutation.isPending) {
            return;
          }
          clearMutation.mutate(selectedConversation, {
            onSettled: () => setClearConfirmOpen(false),
          });
        }}
      />
    </DesktopUtilityShell>
  );
}

function normalizeHistoryRows(
  messages: Array<Message | GroupMessage>,
  reminders: Array<{ messageId: string; remindAt: string }>,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  const reminderMap = new Map(
    reminders.map((item) => [item.messageId, item.remindAt]),
  );

  return messages.map((item) => ({
    id: item.id,
    senderName: item.senderName,
    createdAt: item.createdAt,
    preview: resolveMessagePreview(item, t),
    reminderAt: reminderMap.get(item.id),
    typeLabel: resolveMessageTypeLabel(item.type, t),
  }));
}

function resolveMessagePreview(
  item: Message | GroupMessage,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  return (
    resolveMessageSemanticPreview(item, {
      maxChars: 220,
    }) || t(msg`这条消息没有文本内容。`)
  );
}

function resolveMessageTypeLabel(
  type: Message["type"] | GroupMessage["type"],
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  if (type === "image") {
    return t(msg`图片`);
  }

  if (type === "file") {
    return t(msg`文件`);
  }

  if (type === "voice") {
    return t(msg`语音`);
  }

  if (type === "contact_card") {
    return t(msg`名片`);
  }

  if (type === "location_card") {
    return t(msg`位置`);
  }

  if (type === "note_card") {
    return t(msg`笔记`);
  }

  if (type === "feed_post_card") {
    return t(msg`视频号动态`);
  }

  if (type === "sticker") {
    return t(msg`表情`);
  }

  if (type === "system") {
    return t(msg`系统`);
  }

  return t(msg`文本`);
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
