import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, Plus, UserPlus, Users } from "lucide-react";
import {
  getBlockedCharacters,
  getConversations,
  getOfficialAccountMessageEntries,
  type ConversationListItem,
} from "@yinjie/contracts";
import { ErrorBlock, InlineNotice, LoadingBlock, TextField } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { OfficialServiceConversationCard } from "../../../components/official-service-conversation-card";
import { SubscriptionInboxCard } from "../../../components/subscription-inbox-card";
import { DesktopSubscriptionWorkspace } from "../official-accounts/desktop-subscription-workspace";
import { OfficialAccountServiceThread } from "../../official-accounts/service/official-account-service-thread";
import { sanitizeDisplayedChatText } from "../../../lib/chat-text";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { formatTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import { ConversationThreadPanel } from "../../chat/conversation-thread-panel";
import GroupChatThreadPanel from "../../chat/group-chat-thread-panel-view";
import {
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "./desktop-chat-header-actions";
import {
  DesktopChatSidePanel,
  DesktopChatSidePanelPlaceholder,
} from "./desktop-chat-side-panel";
import { DesktopChatHistoryPanel } from "./desktop-chat-history-panel";
import { createDesktopNote } from "./desktop-notes-storage";

type DesktopChatWorkspaceProps = {
  selectedConversationId?: string;
  selectedServiceAccountId?: string;
  highlightedMessageId?: string;
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
  selectedSpecialView,
}: DesktopChatWorkspaceProps) {
  const navigate = useNavigate();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchTerm, setSearchTerm] = useState("");
  const [rightPanelMode, setRightPanelMode] =
    useState<DesktopChatSidePanelMode>(null);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  function handleToggleSidePanel(mode: Exclude<DesktopChatSidePanelMode, null>) {
    setRightPanelMode((current) => (current === mode ? null : mode));
  }

  function handleDesktopCallAction(kind: DesktopChatCallKind) {
    setNotice(
      kind === "video"
        ? "视频通话入口已保留，真实通话能力后续补齐。"
        : "语音通话入口已保留，真实通话能力后续补齐。",
    );
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

      <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,248,239,0.98))]">
        <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
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
            <DesktopChatSidePanelPlaceholder
              title="聊天信息侧栏"
              description="下一步接入单聊 / 群聊资料、设置项和危险操作。"
            />
          )}
        </DesktopChatSidePanel>
      ) : null}
    </div>
  );
}

function ConversationCard({
  active,
  conversation,
}: {
  active: boolean;
  conversation: ConversationListItem;
}) {
  return <ConversationCardLink active={active} conversation={conversation} />;
}

function ConversationCardLink({
  active,
  conversation,
}: {
  active: boolean;
  conversation: ConversationListItem;
}) {
  const className = active
    ? "flex items-center gap-3 rounded-[18px] border border-[color:var(--border-brand)] bg-[linear-gradient(135deg,rgba(255,247,234,0.98),rgba(255,255,255,0.94))] px-4 py-3 shadow-[0_8px_18px_rgba(180,100,20,0.08)]"
    : "flex items-center gap-3 rounded-[18px] border border-transparent bg-transparent px-4 py-3 transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]";

  const content = (
    <>
      <AvatarChip name={conversation.title} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {conversation.title}
          </div>
          <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
            {formatTimestamp(
              conversation.lastMessage?.createdAt ?? conversation.updatedAt,
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="truncate text-sm text-[color:var(--text-secondary)]">
            {sanitizeDisplayedChatText(conversation.lastMessage?.text ?? "")}
          </div>
          {conversation.unreadCount > 0 ? (
            <div className="min-w-6 rounded-full bg-[#fa5151] px-2 py-0.5 text-center text-[11px] text-white shadow-[0_4px_12px_rgba(250,81,81,0.22)]">
              {conversation.unreadCount}
            </div>
          ) : null}
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
    >
      {content}
    </Link>
  );
}
