import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { Plus, QrCode, Search, UserPlus, Users, WalletCards } from "lucide-react";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
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
  const [searchText, setSearchText] = useState("");
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    refetchInterval: 3_000,
  });

  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredConversations = useMemo(() => {
    if (!normalizedSearchText) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const title = conversation.title.toLowerCase();
      const lastMessageText = conversation.lastMessage?.text?.toLowerCase() ?? "";
      return title.includes(normalizedSearchText) || lastMessageText.includes(normalizedSearchText);
    });
  }, [conversations, normalizedSearchText]);

  const hasConversations = filteredConversations.length > 0;
  const hasSearchResult = normalizedSearchText.length > 0;

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
    <AppPage className="space-y-4 px-0">
      {isQuickMenuOpen ? (
        <button
          type="button"
          aria-label="关闭快捷菜单"
          onClick={() => setIsQuickMenuOpen(false)}
          className="fixed inset-0 z-30"
        />
      ) : null}

      <TabPageTopBar
        title="消息"
        subtitle={`共 ${conversations.length} 个会话`}
        className="z-40 space-y-4 overflow-visible px-4 pb-4 pt-3 text-[color:var(--text-primary)]"
        titleAlign="center"
        rightActions={
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsQuickMenuOpen((current) => !current)}
              className="h-9 w-9 rounded-full border border-black bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
              aria-label="打开快捷菜单"
            >
              <Plus size={16} strokeWidth={2.4} />
            </Button>

            {isQuickMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.45rem)] z-40 w-48 overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,246,236,0.94))] p-2 shadow-[var(--shadow-overlay)]">
                {quickActionItems.map((item) => {
                  const Icon = item.icon;

                  if (item.to) {
                    const to = item.to;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleNavigate(to)}
                        className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/82"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[rgba(255,138,61,0.12)] text-[color:var(--brand-primary)]">
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
                      onClick={() => handleUnavailableAction(item.unavailableNotice!)}
                      className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/82"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[rgba(255,138,61,0.12)] text-[color:var(--brand-primary)]">
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
        <label className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索联系人、消息或关键词"
            className="h-11 w-full rounded-[20px] border border-white/75 bg-white/90 pl-11 pr-4 text-sm text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] outline-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-[var(--shadow-focus)]"
          />
        </label>
      </TabPageTopBar>

      <div className="space-y-4 px-4 pb-5">
        {notice ? <InlineNotice tone="info">{notice}</InlineNotice> : null}
        {conversationsQuery.isLoading ? <LoadingBlock label="正在读取会话..." /> : null}
        {conversationsQuery.isError && conversationsQuery.error instanceof Error ? (
          <ErrorBlock message={conversationsQuery.error.message} />
        ) : null}

        {!conversationsQuery.isLoading && !conversationsQuery.isError ? (
          hasConversations ? (
            <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/88 shadow-[var(--shadow-section)]">
              {filteredConversations.map((conversation, index) => (
                <ConversationListItemLink
                  key={conversation.id}
                  conversation={conversation}
                  className={cn(
                    "block transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[rgba(255,138,61,0.05)]",
                    index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
                  )}
                />
              ))}
            </section>
          ) : (
            <EmptyState
              title={hasSearchResult ? "没有找到匹配的会话" : "还没有任何会话"}
              description={
                hasSearchResult
                  ? "换一个关键词试试，或者直接去通讯录发起新的对话。"
                  : "先去通讯录认识角色，或者从发现页触发第一次相遇。"
              }
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Link to="/tabs/contacts">
                    <Button variant="secondary">去通讯录看看</Button>
                  </Link>
                  <Link to="/tabs/discover">
                    <Button variant="primary">去发现页</Button>
                  </Link>
                </div>
              }
            />
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
  const content = (
    <div className="flex items-center gap-3 px-4 py-4">
      <AvatarChip name={conversation.title} size="wechat" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
              {conversation.title}
            </div>
            <div className="mt-1 truncate text-[13px] text-[color:var(--text-muted)]">
              {conversation.lastMessage?.text ?? "从这里开始第一句问候"}
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
                  "flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-gradient)] px-1.5 text-[11px] leading-none text-white shadow-[var(--shadow-soft)]",
                  conversation.unreadCount > 9 ? "min-w-6" : undefined,
                )}
              >
                {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
              </div>
            ) : (
              <div className="rounded-full bg-[rgba(74,222,128,0.12)] px-2 py-0.5 text-[10px] text-emerald-700">
                已读
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (conversation.type === "group") {
    return (
      <Link to="/group/$groupId" params={{ groupId: conversation.id }} className={className}>
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
