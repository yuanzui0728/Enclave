import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { getConversations, getFriends, getOrCreateConversation } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
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
      <AppHeader
        eyebrow="Messages"
        title="Recent conversations"
        description="Open an existing chat or start a new thread with someone you already know."
        actions={
          <Link to="/friend-requests">
            <Button variant="secondary" className="rounded-full">
              Friend requests
            </Button>
          </Link>
        }
      />

      {notice ? <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice> : null}

      {conversations.length > 0 && quickStart.length > 0 ? (
        <AppSection className="space-y-4">
          <div>
            <div className="text-sm font-medium text-white">Quick start</div>
            <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
              Jump back into a conversation with the people you recently connected with.
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {quickStart.map(({ character }) => (
              <button
                key={character.id}
                type="button"
                onClick={() => startChatMutation.mutate(character.id)}
                disabled={startChatMutation.isPending}
                className="rounded-[26px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.04))] p-3 text-left shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.095),rgba(255,255,255,0.06))] hover:shadow-[var(--shadow-card)] disabled:opacity-60"
              >
                <AvatarChip name={character.name} src={character.avatar} />
                <div className="mt-3 line-clamp-1 text-sm font-medium text-white">{character.name}</div>
                <div className="mt-1 line-clamp-1 text-[11px] text-[color:var(--text-muted)]">
                  {startChatMutation.variables === character.id && startChatMutation.isPending
                    ? "Starting..."
                    : character.relationship}
                </div>
              </button>
            ))}
          </div>
        </AppSection>
      ) : null}

      <AppSection className="space-y-4">
        <div className="text-sm font-medium text-white">Recent messages</div>

        {conversationsQuery.isLoading ? <LoadingBlock label="Loading conversations..." /> : null}
        {conversationsQuery.isError && conversationsQuery.error instanceof Error ? (
          <ErrorBlock message={conversationsQuery.error.message} />
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <ErrorBlock message={friendsQuery.error.message} />
        ) : null}
        {startChatMutation.isError && startChatMutation.error instanceof Error ? (
          <ErrorBlock message={startChatMutation.error.message} />
        ) : null}

        {!conversationsQuery.isLoading && conversations.length > 0
          ? conversations.map((conversation) => (
              <Link
                key={conversation.id}
                to="/chat/$conversationId"
                params={{ conversationId: conversation.id }}
                className="flex items-center gap-3 rounded-[26px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.035))] px-4 py-4 shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.05))] hover:shadow-[var(--shadow-card)]"
              >
                <AvatarChip name={conversation.title} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-medium text-white">{conversation.title}</div>
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
