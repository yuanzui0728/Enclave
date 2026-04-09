import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { Search } from "lucide-react";
import { AppPage, AppSection, Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function ChatListPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopChatWorkspace />;
  }

  return <MobileChatListPage />;
}

function MobileChatListPage() {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const [searchText, setSearchText] = useState("");

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

  return (
    <AppPage>
      <TabPageTopBar
        title="消息"
        className="space-y-3"
        rightActions={
          <Link to="/friend-requests">
            <Button variant="ghost" size="sm" className="rounded-full text-[color:var(--text-secondary)]">
              新的朋友
            </Button>
          </Link>
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
            className="h-10 w-full rounded-2xl border border-white/8 bg-white/10 pl-11 pr-4 text-sm text-white outline-none transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-white/45 focus:border-white/16 focus:bg-white/14"
          />
        </label>
      </TabPageTopBar>

      <AppSection className="space-y-4">
        {hasConversations ? <div className="text-sm font-medium text-[color:var(--text-primary)]">最近消息</div> : null}

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
      </AppSection>
    </AppPage>
  );
}
