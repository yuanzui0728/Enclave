import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  getConversations,
  getOfficialAccountMessageEntries,
} from "@yinjie/contracts";
import {
  Plus,
  QrCode,
  Search,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";

import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { OfficialServiceConversationCard } from "../components/official-service-conversation-card";
import { SubscriptionInboxCard } from "../components/subscription-inbox-card";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatConversationTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type QuickActionItem = {
  key: string;
  label: string;
  icon: typeof Users;
  to?: "/group/new" | "/friend-requests";
  unavailableNotice?: string;
};

const quickActionItems: QuickActionItem[] = [
  {
    key: "create-group",
    label: "发起群聊",
    icon: Users,
    to: "/group/new",
  },
  {
    key: "add-friend",
    label: "添加朋友",
    icon: UserPlus,
    to: "/friend-requests",
  },
  {
    key: "scan",
    label: "扫一扫",
    icon: QrCode,
    unavailableNotice: "扫一扫功能暂未接入。",
  },
  {
    key: "pay",
    label: "收付款",
    icon: WalletCards,
    unavailableNotice: "收付款功能暂未接入。",
  },
];

export function ChatListPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopChatWorkspace />;
  }

  return <MobileChatListPage />;
}

function MobileChatListPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    refetchInterval: 3_000,
  });
  const messageEntriesQuery = useQuery({
    queryKey: ["app-official-message-entries", baseUrl],
    queryFn: () => getOfficialAccountMessageEntries(baseUrl),
    refetchInterval: 3_000,
  });

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const subscriptionInboxSummary = messageEntriesQuery.data?.subscriptionInbox;
  const serviceConversations =
    messageEntriesQuery.data?.serviceConversations ?? [];
  const showSubscriptionInboxItem = Boolean(subscriptionInboxSummary);

  const hasConversations =
    conversations.length > 0 ||
    serviceConversations.length > 0 ||
    showSubscriptionInboxItem;

  function handleUnavailableAction(message: string) {
    setIsQuickMenuOpen(false);
    setNotice(message);
  }

  function handleNavigate(to: "/group/new" | "/friend-requests") {
    setIsQuickMenuOpen(false);
    setNotice(null);
    void navigate({ to });
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      {isQuickMenuOpen ? (
        <button
          type="button"
          aria-label="关闭快捷菜单"
          onClick={() => setIsQuickMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/5"
        />
      ) : null}

      <TabPageTopBar
        title="消息"
        className="z-40 space-y-3 overflow-visible border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,248,239,0.94))] px-4 pb-3 pt-3 text-[color:var(--text-primary)] shadow-none"
        titleAlign="center"
        titleClassName="text-[17px] font-medium tracking-normal"
        rightActions={
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsQuickMenuOpen((current) => !current)}
              className="h-9 w-9 rounded-full border border-black/5 bg-white/70 text-[color:var(--text-primary)] shadow-none hover:bg-white"
              aria-label="打开快捷菜单"
            >
              <Plus size={16} strokeWidth={2.4} />
            </Button>

            {isQuickMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.45rem)] z-40 w-44 overflow-hidden rounded-[14px] bg-[rgba(44,44,44,0.96)] p-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.22)]">
                {quickActionItems.map((item) => {
                  const Icon = item.icon;

                  if (item.to) {
                    const to = item.to;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleNavigate(to)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/10"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-white">
                          <Icon size={16} />
                        </div>
                        <span>{item.label}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        handleUnavailableAction(item.unavailableNotice!)
                      }
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
        }
      >
        <button
          type="button"
          onClick={() => {
            void navigate({ to: "/tabs/search" });
          }}
          className="relative block w-full text-left"
          aria-label="打开搜一搜"
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <div className="h-9 w-full rounded-[10px] border border-transparent bg-[rgba(255,249,238,0.85)] pl-10 pr-4 text-sm leading-9 text-[color:var(--text-dim)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]">
            搜索
          </div>
        </button>
      </TabPageTopBar>

      <div className="pb-6">
        {notice ? (
          <div className="px-3 pt-3">
            <InlineNotice tone="info">{notice}</InlineNotice>
          </div>
        ) : null}
        {conversationsQuery.isLoading ? (
          <div className="px-3 pt-3">
            <LoadingBlock label="正在读取会话..." />
          </div>
        ) : null}
        {conversationsQuery.isError &&
        conversationsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={conversationsQuery.error.message} />
          </div>
        ) : null}
        {messageEntriesQuery.isError &&
        messageEntriesQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={messageEntriesQuery.error.message} />
          </div>
        ) : null}

        {!conversationsQuery.isLoading && !conversationsQuery.isError ? (
          hasConversations ? (
            <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
              {showSubscriptionInboxItem && subscriptionInboxSummary ? (
                <SubscriptionInboxCard
                  summary={subscriptionInboxSummary}
                  onClick={() => {
                    void navigate({ to: "/chat/subscription-inbox" });
                  }}
                />
              ) : null}

              {serviceConversations.map((conversation) => (
                <OfficialServiceConversationCard
                  key={conversation.accountId}
                  conversation={conversation}
                  onClick={() => {
                    void navigate({
                      to: "/official-accounts/service/$accountId",
                      params: { accountId: conversation.accountId },
                    });
                  }}
                />
              ))}

              {conversations.map((conversation, index) => (
                <ConversationListItemLink
                  key={conversation.id}
                  conversation={conversation}
                  className={cn(
                    "block transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[rgba(255,138,61,0.05)]",
                    index > 0 ||
                      showSubscriptionInboxItem ||
                      serviceConversations.length > 0
                      ? "border-t border-[color:var(--border-faint)]"
                      : undefined,
                  )}
                />
              ))}
            </section>
          ) : (
            <div className="px-3 pt-8">
              <EmptyState
                title="消息列表还是空的"
                description="等角色和服务号开始发消息后，这里会出现会话。"
              />
            </div>
          )
        ) : null}
      </div>
    </AppPage>
  );
}

function ConversationListItemLink({
  conversation,
  className,
}: {
  conversation: Awaited<ReturnType<typeof getConversations>>[number];
  className?: string;
}) {
  const isPinned = conversation.isPinned;
  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        isPinned
          ? "bg-[rgba(255,246,228,0.72)]"
          : "bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <AvatarChip name={conversation.title} size="wechat" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-normal text-[color:var(--text-primary)]">
              {conversation.title}
            </div>
            <div className="mt-1 truncate text-[13px] text-[color:var(--text-muted)]">
              {formatConversationPreview(conversation)}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="text-[11px] text-[color:var(--text-dim)]">
              {formatConversationTimestamp(
                conversation.lastMessage?.createdAt ?? conversation.updatedAt,
              )}
            </div>
            {conversation.unreadCount > 0 ? (
              <div
                className={cn(
                  "flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#fa5151] px-1.5 text-[11px] leading-none text-white shadow-[0_4px_12px_rgba(250,81,81,0.22)]",
                  conversation.unreadCount > 9 ? "min-w-6" : undefined,
                )}
              >
                {conversation.unreadCount > 99
                  ? "99+"
                  : conversation.unreadCount}
              </div>
            ) : isPinned ? (
              <div className="text-[10px] text-[color:var(--text-dim)]">
                置顶
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (conversation.type === "group") {
    return (
      <Link
        to="/group/$groupId"
        params={{ groupId: conversation.id }}
        search={{}}
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
      search={{}}
      className={className}
    >
      {content}
    </Link>
  );
}

function formatConversationPreview(
  conversation: Awaited<ReturnType<typeof getConversations>>[number],
) {
  const lastMessage = conversation.lastMessage;
  if (!lastMessage) {
    return "从这里开始第一句问候";
  }

  if (lastMessage.type === "image") {
    return "[图片]";
  }

  if (lastMessage.type === "file") {
    return "[文件]";
  }

  if (lastMessage.type === "contact_card") {
    return "[名片]";
  }

  if (lastMessage.type === "location_card") {
    return "[位置]";
  }

  if (lastMessage.type === "sticker") {
    return lastMessage.attachment?.kind === "sticker" &&
      lastMessage.attachment.label
      ? `[表情] ${lastMessage.attachment.label}`
      : "[表情]";
  }

  return lastMessage.text || "从这里开始第一句问候";
}
