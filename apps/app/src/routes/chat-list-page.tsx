import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { getConversations, getFriends, getOrCreateConversation } from "@yinjie/contracts";
import { AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type NoticeState = {
  tone: "success" | "danger";
  message: string;
};

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
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends-quick-start", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const startChatMutation = useMutation({
    mutationFn: (characterId: string) => getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    },
    onError: (error) => {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "Unable to start this conversation right now.",
      });
    },
  });

  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const hasConversations = conversations.length > 0;

  const quickStart = useMemo(
    () => (friendsQuery.data ?? []).slice(0, 3),
    [friendsQuery.data],
  );

  useEffect(() => {
    setNotice(null);
    startChatMutation.reset();
  }, [baseUrl]);

  return (
    <AppPage>
      <TabPageTopBar
        title="消息"
        rightActions={
          <Link to="/friend-requests">
            <Button variant="ghost" size="sm" className="rounded-full text-[color:var(--text-secondary)]">
              新的朋友
            </Button>
          </Link>
        }
      />

      {notice ? <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice> : null}

      {quickStart.length > 0 ? (
        <AppSection className="space-y-4">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">快捷开始</div>
            <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
              从最近建立联系的人里直接开始，不用先切到通讯录。
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {quickStart.map(({ character }) => (
              <button
                key={character.id}
                type="button"
                onClick={() => startChatMutation.mutate(character.id)}
                disabled={startChatMutation.isPending}
                className="rounded-[26px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3 text-left shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[color:var(--surface-card-hover)] hover:shadow-[var(--shadow-card)] disabled:opacity-60"
              >
                <AvatarChip name={character.name} src={character.avatar} />
                <div className="mt-3 line-clamp-1 text-sm font-medium text-[color:var(--text-primary)]">{character.name}</div>
                <div className="mt-1 line-clamp-1 text-[11px] text-[color:var(--text-muted)]">
                  {startChatMutation.variables === character.id && startChatMutation.isPending
                    ? "进入中..."
                    : character.relationship}
                </div>
              </button>
            ))}
          </div>
        </AppSection>
      ) : null}

      <AppSection className="space-y-4">
        {hasConversations ? <div className="text-sm font-medium text-[color:var(--text-primary)]">最近消息</div> : null}

        {conversationsQuery.isLoading ? <LoadingBlock label="正在读取会话..." /> : null}
        {conversationsQuery.isError && conversationsQuery.error instanceof Error ? (
          <ErrorBlock message={conversationsQuery.error.message} />
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <ErrorBlock message={friendsQuery.error.message} />
        ) : null}
        {startChatMutation.isError && startChatMutation.error instanceof Error ? (
          <ErrorBlock message={startChatMutation.error.message} />
        ) : null}

        {!conversationsQuery.isLoading && hasConversations
          ? conversations.map((conversation) => (
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

        {!conversationsQuery.isLoading && !conversationsQuery.isError && !hasConversations ? (
          <EmptyState
            title="消息页还没有新的对话"
            description="等角色先来敲门，或者从下面的快捷开始里主动打开一个会话。"
            action={
              <Link to="/friend-requests">
                <Button variant="secondary">查看新的朋友</Button>
              </Link>
            }
          />
        ) : null}
      </AppSection>
    </AppPage>
  );
}
