import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { ChevronRight, Plus, QrCode, Search, UserPlus, Users, WalletCards } from "lucide-react";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
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
  const pinnedActions = quickActionItems.slice(0, 2);
  const extraActions = quickActionItems.slice(2);

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
    <AppPage className="bg-[#ededed] px-0">
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
        className="space-y-3 border-b border-black/5 bg-[#ededed] px-4 pb-3 pt-2 text-[#111111]"
        titleAlign="center"
        rightActions={
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsQuickMenuOpen((current) => !current)}
              className="h-8 w-8 rounded-full border-none bg-transparent text-[#1f1f1f] shadow-none hover:bg-black/5"
              aria-label="打开快捷菜单"
            >
              <Plus size={16} />
            </Button>

            {isQuickMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.45rem)] z-40 w-44 overflow-hidden rounded-2xl border border-black/6 bg-[#2f3133] p-1.5 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
                {quickActionItems.map((item) => {
                  const Icon = item.icon;

                  if (item.to) {
                    const to = item.to;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleNavigate(to)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/92 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/8"
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
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/92 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-white/8"
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
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8e8e93]"
          />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索"
            className="h-9 w-full rounded-xl border border-black/5 bg-white pl-11 pr-4 text-center text-sm text-[#111111] outline-none transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-center placeholder:text-[#8e8e93] focus:border-black/10 focus:bg-white"
          />
        </label>
      </TabPageTopBar>

      {shouldShowListArea ? (
        <div className="space-y-3 pb-4">
          {notice ? <InlineNotice tone="info" className="mx-4">{notice}</InlineNotice> : null}

          <section className="bg-white">
            {pinnedActions.map((item) => {
              const Icon = item.icon;
              const content = (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#07c160] text-white">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1 text-[15px] text-[#111111]">{item.label}</div>
                  <ChevronRight size={16} className="text-[#c7c7cc]" />
                </div>
              );

              if (item.to) {
                const to = item.to;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleNavigate(to)}
                    className="block w-full border-b border-[#f2f2f2] text-left last:border-b-0"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleUnavailableAction(item.unavailableNotice!)}
                  className="block w-full border-b border-[#f2f2f2] text-left last:border-b-0"
                >
                  {content}
                </button>
              );
            })}
          </section>

          {extraActions.length ? (
            <div className="flex gap-2 overflow-x-auto px-4 pb-1">
              {extraActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleUnavailableAction(item.unavailableNotice!)}
                    className="flex min-w-[104px] shrink-0 flex-col items-start gap-2 rounded-2xl bg-white px-4 py-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f5f5] text-[#3a3a3c]">
                      <Icon size={18} />
                    </div>
                    <div className="text-sm text-[#111111]">{item.label}</div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {conversationsQuery.isLoading ? <LoadingBlock label="正在读取会话..." /> : null}
          {conversationsQuery.isError && conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}

          {!conversationsQuery.isLoading && hasConversations ? (
            <section className="bg-white">
              {filteredConversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  to="/chat/$conversationId"
                  params={{ conversationId: conversation.id }}
                  className="block bg-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[#f8f8f8]"
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <AvatarChip name={conversation.title} size="wechat" />
                    <div className="min-w-0 flex-1 border-b border-[#f2f2f2] pb-0.5 last:border-b-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[16px] font-normal text-[#111111]">{conversation.title}</div>
                          <div className="mt-1 truncate text-[13px] text-[#8e8e93]">
                            {conversation.lastMessage?.text ?? "暂无消息"}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div className="text-[11px] text-[#b2b2b2]">
                            {formatConversationTimestamp(conversation.lastMessage?.createdAt ?? conversation.updatedAt)}
                          </div>
                          {conversation.unreadCount > 0 ? (
                            <div
                              className={cn(
                                "flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#fa5151] px-1.5 text-[11px] leading-none text-white",
                                conversation.unreadCount > 9 ? "min-w-6" : undefined,
                              )}
                            >
                              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                            </div>
                          ) : (
                            <div className="h-5" aria-hidden="true" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </AppPage>
  );
}
