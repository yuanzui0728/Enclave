import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BellOff, FileText, Plus, UserPlus, Users } from "lucide-react";
import {
  clearConversationHistory,
  clearGroupMessages,
  getBlockedCharacters,
  getConversations,
  getOfficialAccountMessageEntries,
  hideConversation,
  hideGroup,
  markConversationRead,
  markGroupRead,
  setConversationMuted,
  setConversationPinned,
  setGroupPinned,
  updateGroupPreferences,
  type ConversationListItem,
} from "@yinjie/contracts";
import { ErrorBlock, InlineNotice, LoadingBlock, TextField } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import { OfficialServiceConversationCard } from "../../../components/official-service-conversation-card";
import { SubscriptionInboxCard } from "../../../components/subscription-inbox-card";
import { DesktopSubscriptionWorkspace } from "../official-accounts/desktop-subscription-workspace";
import { OfficialAccountServiceThread } from "../../official-accounts/service/official-account-service-thread";
import {
  sanitizeDisplayedChatText,
  splitChatTextSegments,
  summarizeChatMentions,
} from "../../../lib/chat-text";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { formatConversationTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import {
  ConversationThreadPanel,
  type ChatRouteContextNotice,
} from "../../chat/conversation-thread-panel";
import GroupChatThreadPanel from "../../chat/group-chat-thread-panel-view";
import {
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "./desktop-chat-header-actions";
import { DesktopConversationContextMenu } from "./desktop-conversation-context-menu";
import { DesktopChatSidePanel } from "./desktop-chat-side-panel";
import { DesktopChatDetailsPanel } from "./desktop-chat-details-panel";
import { DesktopChatHistoryPanel } from "./desktop-chat-history-panel";
import { createDesktopNote } from "./desktop-notes-storage";

type DesktopChatWorkspaceProps = {
  selectedConversationId?: string;
  selectedServiceAccountId?: string;
  highlightedMessageId?: string;
  routeContextNotice?: ChatRouteContextNotice;
  selectedSpecialView?: "subscription-inbox";
};

type DesktopQuickActionItem = {
  key: string;
  label: string;
  icon: typeof Users;
};

const desktopQuickActionItems: DesktopQuickActionItem[] = [
  {
    key: "create-group",
    label: "发起群聊",
    icon: Users,
  },
  {
    key: "add-friend",
    label: "添加朋友",
    icon: UserPlus,
  },
  {
    key: "create-note",
    label: "新建笔记",
    icon: FileText,
  },
];

export function DesktopChatWorkspace({
  selectedConversationId,
  selectedServiceAccountId,
  highlightedMessageId,
  routeContextNotice,
  selectedSpecialView,
}: DesktopChatWorkspaceProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchTerm, setSearchTerm] = useState("");
  const [rightPanelMode, setRightPanelMode] =
    useState<DesktopChatSidePanelMode>(null);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<{
    conversation: ConversationListItem;
    x: number;
    y: number;
  } | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
    refetchInterval: 3_000,
  });
  const messageEntriesQuery = useQuery({
    queryKey: ["app-official-message-entries", baseUrl],
    queryFn: () => getOfficialAccountMessageEntries(baseUrl),
    enabled: Boolean(ownerId),
    refetchInterval: 3_000,
  });

  const blockedQuery = useQuery({
    queryKey: ["app-chat-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );

  const conversations = useMemo(
    () =>
      (conversationsQuery.data ?? []).filter(
        (conversation) =>
          isPersistedGroupConversation(conversation) ||
          !conversation.participants.some((id) => blockedCharacterIds.has(id)),
      ),
    [blockedCharacterIds, conversationsQuery.data],
  );

  const filteredConversations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const title = conversation.title.toLowerCase();
      const preview = sanitizeDisplayedChatText(
        conversation.lastMessage?.text ?? "",
      ).toLowerCase();
      return title.includes(keyword) || preview.includes(keyword);
    });
  }, [conversations, searchTerm]);
  const subscriptionInboxSummary = messageEntriesQuery.data?.subscriptionInbox;
  const serviceConversations =
    messageEntriesQuery.data?.serviceConversations ?? [];
  const subscriptionInboxActive = selectedSpecialView === "subscription-inbox";
  const serviceConversationActive = Boolean(selectedServiceAccountId);
  const showSubscriptionInboxItem = useMemo(() => {
    if (!subscriptionInboxSummary) {
      return false;
    }

    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return true;
    }

    return (
      "订阅号消息".includes(keyword) ||
      (subscriptionInboxSummary.preview ?? "").toLowerCase().includes(keyword)
    );
  }, [searchTerm, subscriptionInboxSummary]);
  const filteredServiceConversations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return serviceConversations;
    }

    return serviceConversations.filter((conversation) => {
      return (
        conversation.account.name.toLowerCase().includes(keyword) ||
        (conversation.preview ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [searchTerm, serviceConversations]);

  const activeConversation = useMemo(() => {
    if (subscriptionInboxActive || serviceConversationActive) {
      return null;
    }

    if (!filteredConversations.length) {
      return null;
    }

    if (selectedConversationId) {
      return (
        filteredConversations.find(
          (conversation) => conversation.id === selectedConversationId,
        ) ?? filteredConversations[0]
      );
    }

    return filteredConversations[0];
  }, [
    filteredConversations,
    selectedConversationId,
    serviceConversationActive,
    subscriptionInboxActive,
  ]);

  useEffect(() => {
    if (
      !activeConversation ||
      subscriptionInboxActive ||
      serviceConversationActive
    ) {
      setRightPanelMode(null);
    }
  }, [activeConversation, serviceConversationActive, subscriptionInboxActive]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!conversationContextMenu) {
      return;
    }

    const closeMenu = () => setConversationContextMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [conversationContextMenu]);

  const conversationActionMutation = useMutation({
    mutationFn: async ({
      action,
      conversation,
    }: {
      action: "pin" | "mute" | "read" | "hide" | "clear";
      conversation: ConversationListItem;
    }) => {
      if (isPersistedGroupConversation(conversation)) {
        switch (action) {
          case "pin":
            return setGroupPinned(
              conversation.id,
              { pinned: !conversation.isPinned },
              baseUrl,
            );
          case "mute":
            return updateGroupPreferences(
              conversation.id,
              { isMuted: !conversation.isMuted },
              baseUrl,
            );
          case "read":
            return markGroupRead(conversation.id, baseUrl);
          case "hide":
            return hideGroup(conversation.id, baseUrl);
          case "clear":
            return clearGroupMessages(conversation.id, baseUrl);
        }
      }

      switch (action) {
        case "pin":
          return setConversationPinned(
            conversation.id,
            { pinned: !conversation.isPinned },
            baseUrl,
          );
        case "mute":
          return setConversationMuted(
            conversation.id,
            { muted: !conversation.isMuted },
            baseUrl,
          );
        case "read":
          return markConversationRead(conversation.id, baseUrl);
        case "hide":
          return hideConversation(conversation.id, baseUrl);
        case "clear":
          return clearConversationHistory(conversation.id, baseUrl);
      }
    },
    onSuccess: async (_, variables) => {
      const { action, conversation } = variables;
      const isGroupConversation = isPersistedGroupConversation(conversation);

      setConversationContextMenu(null);
      setNotice(buildConversationActionNotice(action, conversation));

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-group", baseUrl, conversation.id],
            })
          : Promise.resolve(),
        action === "clear" && isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-group-messages", baseUrl, conversation.id],
            })
          : Promise.resolve(),
        action === "clear" && !isGroupConversation
          ? queryClient.invalidateQueries({
              queryKey: ["app-conversation-messages", baseUrl, conversation.id],
            })
          : Promise.resolve(),
      ]);

      if (
        action === "hide" &&
        (selectedConversationId === conversation.id ||
          activeConversation?.id === conversation.id)
      ) {
        setRightPanelMode(null);
        void navigate({ to: "/tabs/chat" });
      }
    },
    onError: (error) => {
      setConversationContextMenu(null);
      setNotice(error instanceof Error ? error.message : "会话操作失败。");
    },
  });

  function handleQuickAction(key: DesktopQuickActionItem["key"]) {
    setIsQuickMenuOpen(false);
    setNotice(null);

    if (key === "create-group") {
      void navigate({ to: "/group/new" });
      return;
    }

    if (key === "add-friend") {
      void navigate({ to: "/friend-requests" });
      return;
    }

    const note = createDesktopNote();
    void navigate({ to: "/notes", hash: note.id });
  }

  function handleToggleSidePanel(
    mode: Exclude<DesktopChatSidePanelMode, null>,
  ) {
    setRightPanelMode((current) => (current === mode ? null : mode));
  }

  function handleDesktopCallAction(kind: DesktopChatCallKind) {
    setNotice(
      kind === "video"
        ? "视频通话入口已保留，真实通话能力后续补齐。"
        : "语音通话入口已保留，真实通话能力后续补齐。",
    );
  }

  function handleConversationContextMenu(
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) {
    event.preventDefault();
    setConversationContextMenu({
      conversation,
      x: event.clientX,
      y: event.clientY,
    });
  }

  return (
    <div className="relative flex h-full min-h-0">
      {isQuickMenuOpen ? (
        <button
          type="button"
          aria-label="关闭快捷菜单"
          onClick={() => setIsQuickMenuOpen(false)}
          className="absolute inset-0 z-10 cursor-default"
        />
      ) : null}

      <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[#f5f5f5]">
        <div className="border-b border-[color:var(--border-faint)] bg-[#f7f7f7] px-4 py-4">
          <div className="relative z-20 flex items-center gap-2">
            <TextField
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索"
              className="flex-1 rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2.5 shadow-none hover:bg-white focus:shadow-none"
            />
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsQuickMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)] transition hover:bg-white"
                aria-label="打开快捷菜单"
              >
                <Plus size={18} strokeWidth={2.2} />
              </button>

              {isQuickMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-44 overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.6)] bg-[rgba(44,44,44,0.96)] p-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.22)]">
                  {desktopQuickActionItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleQuickAction(item.key)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/10"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-white">
                          <Icon size={16} />
                        </div>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          {notice ? (
            <InlineNotice className="mt-3 text-xs" tone="info">
              {notice}
            </InlineNotice>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {conversationsQuery.isLoading ? (
            <LoadingBlock label="正在读取会话..." />
          ) : null}
          {conversationsQuery.isError &&
          conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}
          {messageEntriesQuery.isError &&
          messageEntriesQuery.error instanceof Error ? (
            <ErrorBlock message={messageEntriesQuery.error.message} />
          ) : null}
          {blockedQuery.isError && blockedQuery.error instanceof Error ? (
            <ErrorBlock message={blockedQuery.error.message} />
          ) : null}

          <div className="space-y-1.5">
            {showSubscriptionInboxItem && subscriptionInboxSummary ? (
              <SubscriptionInboxCard
                summary={subscriptionInboxSummary}
                variant="desktop"
                active={subscriptionInboxActive}
                onClick={() => {
                  void navigate({ to: "/chat/subscription-inbox" });
                }}
              />
            ) : null}

            {filteredServiceConversations.map((conversation) => (
              <OfficialServiceConversationCard
                key={conversation.accountId}
                conversation={conversation}
                variant="desktop"
                active={conversation.accountId === selectedServiceAccountId}
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/service/$accountId",
                    params: { accountId: conversation.accountId },
                  });
                }}
              />
            ))}

            {filteredConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                active={conversation.id === activeConversation?.id}
                conversation={conversation}
                onContextMenu={handleConversationContextMenu}
              />
            ))}
          </div>

          {!conversationsQuery.isLoading &&
          !filteredConversations.length &&
          !filteredServiceConversations.length &&
          !showSubscriptionInboxItem &&
          searchTerm.trim() ? (
            <div className="pt-4">
              <EmptyState
                title="没有匹配的会话"
                description="换个关键词试试。"
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 flex-1">
        {subscriptionInboxActive ? (
          <DesktopSubscriptionWorkspace />
        ) : selectedServiceAccountId ? (
          <OfficialAccountServiceThread
            accountId={selectedServiceAccountId}
            variant="desktop"
          />
        ) : activeConversation ? (
          isPersistedGroupConversation(activeConversation) ? (
            <GroupChatThreadPanel
              groupId={activeConversation.id}
              variant="desktop"
              desktopSidePanelMode={rightPanelMode}
              onToggleDesktopHistory={() => handleToggleSidePanel("history")}
              onToggleDesktopDetails={() => handleToggleSidePanel("details")}
              onDesktopCallAction={handleDesktopCallAction}
              highlightedMessageId={
                activeConversation.id === selectedConversationId
                  ? highlightedMessageId
                  : undefined
              }
              routeContextNotice={
                activeConversation.id === selectedConversationId
                  ? routeContextNotice
                  : undefined
              }
            />
          ) : (
            <ConversationThreadPanel
              conversationId={activeConversation.id}
              variant="desktop"
              desktopSidePanelMode={rightPanelMode}
              onToggleDesktopHistory={() => handleToggleSidePanel("history")}
              onToggleDesktopDetails={() => handleToggleSidePanel("details")}
              onDesktopCallAction={handleDesktopCallAction}
              highlightedMessageId={
                activeConversation.id === selectedConversationId
                  ? highlightedMessageId
                  : undefined
              }
              routeContextNotice={
                activeConversation.id === selectedConversationId
                  ? routeContextNotice
                  : undefined
              }
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center px-10" />
        )}
      </section>

      {activeConversation && rightPanelMode ? (
        <DesktopChatSidePanel
          mode={rightPanelMode}
          title={rightPanelMode === "history" ? "聊天记录" : "聊天信息"}
          subtitle={activeConversation.title}
          onClose={() => setRightPanelMode(null)}
        >
          {rightPanelMode === "history" ? (
            <DesktopChatHistoryPanel conversation={activeConversation} />
          ) : (
            <DesktopChatDetailsPanel
              conversation={activeConversation}
              onOpenHistory={() => setRightPanelMode("history")}
            />
          )}
        </DesktopChatSidePanel>
      ) : null}

      {conversationContextMenu ? (
        <DesktopConversationContextMenu
          x={conversationContextMenu.x}
          y={conversationContextMenu.y}
          isPinned={conversationContextMenu.conversation.isPinned}
          isMuted={conversationContextMenu.conversation.isMuted}
          showMarkRead={conversationContextMenu.conversation.unreadCount > 0}
          busy={conversationActionMutation.isPending}
          onClose={() => setConversationContextMenu(null)}
          onTogglePinned={() =>
            conversationActionMutation.mutate({
              action: "pin",
              conversation: conversationContextMenu.conversation,
            })
          }
          onToggleMuted={() =>
            conversationActionMutation.mutate({
              action: "mute",
              conversation: conversationContextMenu.conversation,
            })
          }
          onMarkRead={() =>
            conversationActionMutation.mutate({
              action: "read",
              conversation: conversationContextMenu.conversation,
            })
          }
          onHide={() =>
            conversationActionMutation.mutate({
              action: "hide",
              conversation: conversationContextMenu.conversation,
            })
          }
          onClear={() =>
            conversationActionMutation.mutate({
              action: "clear",
              conversation: conversationContextMenu.conversation,
            })
          }
        />
      ) : null}
    </div>
  );
}

function ConversationCard({
  active,
  conversation,
  onContextMenu,
}: {
  active: boolean;
  conversation: ConversationListItem;
  onContextMenu: (
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) => void;
}) {
  return (
    <ConversationCardLink
      active={active}
      conversation={conversation}
      onContextMenu={onContextMenu}
    />
  );
}

function ConversationCardLink({
  active,
  conversation,
  onContextMenu,
}: {
  active: boolean;
  conversation: ConversationListItem;
  onContextMenu: (
    event: MouseEvent<HTMLElement>,
    conversation: ConversationListItem,
  ) => void;
}) {
  const className = active
    ? "flex items-center gap-3 rounded-[12px] border border-black/6 bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
    : conversation.isPinned
      ? "flex items-center gap-3 rounded-[12px] border border-transparent bg-[#ededed] px-4 py-3 transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[#e7e7e7]"
      : "flex items-center gap-3 rounded-[12px] border border-transparent bg-transparent px-4 py-3 transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white";
  const preview = buildConversationPreview(conversation);
  const isGroupConversation = isPersistedGroupConversation(conversation);
  const mentionSummary = isGroupConversation
    ? summarizeChatMentions(conversation.lastMessage?.text ?? "")
    : null;
  const hasMentionAllReminder = Boolean(
    isGroupConversation &&
    conversation.unreadCount > 0 &&
    mentionSummary?.hasMentionAll,
  );

  const content = (
    <>
      {isGroupConversation ? (
        <GroupAvatarChip
          name={conversation.title}
          members={conversation.participants}
        />
      ) : (
        <AvatarChip name={conversation.title} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {conversation.title}
            </div>
            {isGroupConversation ? (
              <span className="shrink-0 rounded-full bg-[#ededed] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">
                群聊
              </span>
            ) : null}
          </div>
          <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
            {formatConversationTimestamp(
              conversation.lastMessage?.createdAt ?? conversation.updatedAt,
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="truncate text-sm text-[color:var(--text-secondary)]">
            {preview.prefix ? (
              <span className="text-[color:var(--text-muted)]">
                {preview.prefix}
              </span>
            ) : null}
            <span>{renderConversationPreviewText(preview.text)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasMentionAllReminder ? (
              <span className="shrink-0 rounded-full bg-[rgba(249,115,22,0.14)] px-2 py-0.5 text-[10px] font-medium text-[#c2410c]">
                有人@所有人
              </span>
            ) : null}
            {conversation.isMuted ? (
              <BellOff
                size={13}
                className="text-[color:var(--text-dim)]"
                aria-label="消息免打扰"
              />
            ) : null}
            {conversation.unreadCount > 0 ? (
              conversation.isMuted ? (
                <div
                  className="h-2.5 w-2.5 rounded-full bg-[#fa5151]"
                  aria-label={`${conversation.unreadCount} 条未读消息`}
                />
              ) : (
                <div className="min-w-6 rounded-full bg-[#fa5151] px-2 py-0.5 text-center text-[11px] text-white shadow-[0_4px_12px_rgba(250,81,81,0.22)]">
                  {conversation.unreadCount > 99
                    ? "99+"
                    : conversation.unreadCount}
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  if (isPersistedGroupConversation(conversation)) {
    return (
      <Link
        to="/group/$groupId"
        params={{ groupId: conversation.id }}
        className={className}
        onContextMenu={(event) => onContextMenu(event, conversation)}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link
      to="/chat/$conversationId"
      params={{ conversationId: conversation.id }}
      className={className}
      onContextMenu={(event) => onContextMenu(event, conversation)}
    >
      {content}
    </Link>
  );
}

function buildConversationActionNotice(
  action: "pin" | "mute" | "read" | "hide" | "clear",
  conversation: ConversationListItem,
) {
  switch (action) {
    case "pin":
      return conversation.isPinned ? "已取消置顶聊天。" : "聊天已置顶。";
    case "mute":
      return conversation.isMuted ? "已关闭消息免打扰。" : "已开启消息免打扰。";
    case "read":
      return "已标记为已读。";
    case "hide":
      return isPersistedGroupConversation(conversation)
        ? "群聊已隐藏。"
        : "聊天已隐藏。";
    case "clear":
      return isPersistedGroupConversation(conversation)
        ? "群聊记录已清空。"
        : "聊天记录已清空。";
  }
}

function buildConversationPreview(conversation: ConversationListItem) {
  const lastMessage = conversation.lastMessage;
  if (!lastMessage) {
    return {
      prefix: "",
      text: isPersistedGroupConversation(conversation)
        ? "打开群聊查看最近消息。"
        : "打开这个会话查看最近聊天记录。",
    };
  }

  const text = formatMessagePreviewText(lastMessage.type, lastMessage.text);
  if (!isPersistedGroupConversation(conversation)) {
    return {
      prefix: "",
      text,
    };
  }

  if (lastMessage.senderType === "system") {
    return {
      prefix: "",
      text,
    };
  }

  const senderLabel =
    lastMessage.senderType === "user"
      ? "我："
      : `${lastMessage.senderName || "群成员"}：`;

  return {
    prefix: senderLabel,
    text,
  };
}

function formatMessagePreviewText(type: string | undefined, text: string) {
  const displayedText = sanitizeDisplayedChatText(text);
  if (displayedText) {
    return displayedText;
  }

  if (type === "image") {
    return "[图片]";
  }

  if (type === "file") {
    return "[文件]";
  }

  if (type === "contact_card") {
    return "[名片]";
  }

  if (type === "location_card") {
    return "[位置]";
  }

  if (type === "sticker") {
    return "[表情]";
  }

  return "打开会话查看最新消息。";
}

function renderConversationPreviewText(text: string): ReactNode {
  const segments = splitChatTextSegments(text);
  if (!segments.length) {
    return text;
  }

  return segments.map((segment, index) => {
    if (segment.kind === "text") {
      return <span key={`text-${index}`}>{segment.text}</span>;
    }

    return (
      <span
        key={`mention-${index}-${segment.text}`}
        className={
          segment.tone === "all"
            ? "rounded-[7px] bg-[rgba(249,115,22,0.14)] px-1 py-0.5 text-[#c2410c]"
            : "rounded-[7px] bg-[rgba(59,130,246,0.12)] px-1 py-0.5 text-[#2563eb]"
        }
      >
        {segment.text}
      </span>
    );
  });
}
