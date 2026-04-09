import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { Plus, QrCode, Search, UserPlus, Users, WalletCards } from "lucide-react";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
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
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const [searchText, setSearchText] = useState("");
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
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
  const shouldShowListArea =
    !!notice || conversationsQuery.isLoading || (conversationsQuery.isError && conversationsQuery.error instanceof Error) || hasConversations;

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
    <AppPage>
      {isQuickMenuOpen ? (
        <button
          type="button"
          aria-label="关闭快捷菜单"
          onClick={() => setIsQuickMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/24"
        />
      ) : null}

      <TabPageTopBar
        title="消息"
        className="space-y-3"
        titleAlign="center"
        rightActions={
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsQuickMenuOpen((current) => !current)}
              className="rounded-full text-white/78"
              aria-label="打开快捷菜单"
            >
              <Plus size={18} />
            </Button>

            {isQuickMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.6rem)] z-40 w-44 overflow-hidden rounded-[22px] border border-white/10 bg-[#1f2429]/96 p-1.5 shadow-[0_18px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                {quickActionItems.map((item) => {
                  const Icon = item.icon;

                  if (item.to) {
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleNavigate(item.to!)}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-white/92 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/8"
                      >
                        <Icon size={17} className="shrink-0 text-white/72" />
                        <span>{item.label}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleUnavailableAction(item.unavailableNotice!)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-white/92 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/8"
                    >
                      <Icon size={17} className="shrink-0 text-white/72" />
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
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/45"
          />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索"
            className="h-10 w-full rounded-2xl border border-white/8 bg-white/10 pl-11 pr-4 text-center text-sm text-white outline-none transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-center placeholder:text-white/45 focus:border-white/16 focus:bg-white/14"
          />
        </label>
      </TabPageTopBar>

      {shouldShowListArea ? (
        <div className="space-y-4">
          {notice ? <InlineNotice tone="info">{notice}</InlineNotice> : null}
          {hasConversations ? <div className="px-1 text-sm font-medium text-[color:var(--text-primary)]">最近消息</div> : null}

          {conversationsQuery.isLoading ? <LoadingBlock label="正在读取会话..." /> : null}
          {conversationsQuery.isError && conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}

          {!conversationsQuery.isLoading && hasConversations
            ? filteredConversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  to="/chat/$conversationId"
                  params={{ conversationId: conversation.id }}
                  className="flex items-center gap-3 rounded-[26px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[color:var(--surface-card-hover)] hover:shadow-[var(--shadow-card)]"
                >
                  <AvatarChip name={conversation.title} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">{conversation.title}</div>
                      <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
                        {formatTimestamp(conversation.lastMessage?.createdAt ?? conversation.updatedAt)}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="truncate text-sm text-[color:var(--text-secondary)]">
                        {conversation.lastMessage?.text ?? ""}
                      </div>
                      {conversation.unreadCount > 0 ? (
                        <div className="min-w-6 rounded-full bg-[linear-gradient(135deg,rgba(249,115,22,0.98),rgba(251,191,36,0.92))] px-2 py-0.5 text-center text-[11px] text-white shadow-[var(--shadow-soft)]">
                          {conversation.unreadCount}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))
            : null}
        </div>
      ) : null}
    </AppPage>
  );
}
