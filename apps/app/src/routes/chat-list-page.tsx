import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { getConversations, getOrCreateConversation, getFriends } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { formatTimestamp } from "../lib/format";
import { useSessionStore } from "../store/session-store";

export function ChatListPage() {
  const navigate = useNavigate();
  const userId = useSessionStore((state) => state.userId);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", userId],
    queryFn: () => getConversations(userId!),
    enabled: Boolean(userId),
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends-quick-start", userId],
    queryFn: () => getFriends(userId!),
    enabled: Boolean(userId),
  });

  const startChatMutation = useMutation({
    mutationFn: async (characterId: string) => {
      if (!userId) {
        return;
      }
      return getOrCreateConversation({ userId, characterId });
    },
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }
      navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    },
  });

  const items = conversationsQuery.data ?? [];
  const quickStart = friendsQuery.data?.slice(0, 3) ?? [];
  const pendingCharacterId = startChatMutation.isPending ? startChatMutation.variables : null;

  return (
    <AppPage>
      <AppHeader
        eyebrow="消息入口"
        title="有人会在这里等你"
        description="聊天、主动消息、协作升级群聊，都会沿着同一条会话流继续发生。"
        actions={
          <Link to="/friend-requests">
            <Button variant="secondary" className="rounded-full">
              查看新的朋友
              <ChevronRight size={16} />
            </Button>
          </Link>
        }
      />

      {quickStart.length > 0 ? (
        <section>
          <div className="mb-3 text-sm font-medium text-white">快速开始</div>
          <div className="grid grid-cols-3 gap-3">
            {quickStart.map(({ character }) => (
              <button
                key={character.id}
                type="button"
                onClick={() => startChatMutation.mutate(character.id)}
                disabled={startChatMutation.isPending}
                className="rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] p-3 text-left transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-tertiary)] disabled:opacity-60"
              >
                <AvatarChip name={character.name} src={character.avatar} />
                <div className="mt-3 line-clamp-1 text-sm font-medium text-white">{character.name}</div>
                <div className="mt-1 line-clamp-1 text-[11px] text-[color:var(--text-muted)]">
                  {pendingCharacterId === character.id ? "正在发起会话..." : character.relationship}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        {conversationsQuery.isLoading ? (
          <LoadingBlock label="正在读取会话列表..." />
        ) : null}

        {!conversationsQuery.isLoading && !conversationsQuery.isError && items.length > 0 ? (
          items.map((conversation) => (
            <Link
              key={conversation.id}
              to="/chat/$conversationId"
              params={{ conversationId: conversation.id }}
              className="flex items-center gap-3 rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-4 transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-tertiary)]"
            >
              <AvatarChip name={conversation.title} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-white">{conversation.title}</div>
                  <div className="text-[11px] text-[color:var(--text-muted)]">
                    {formatTimestamp(conversation.lastMessage?.createdAt ?? conversation.updatedAt)}
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="truncate text-sm text-[color:var(--text-secondary)]">
                    {conversation.lastMessage?.text ?? "还没有消息"}
                  </div>
                  {conversation.unreadCount > 0 ? (
                    <div className="min-w-6 rounded-full bg-[color:var(--brand-primary)] px-2 py-0.5 text-center text-[11px] text-white">
                      {conversation.unreadCount}
                    </div>
                  ) : null}
                </div>
              </div>
            </Link>
          ))
        ) : !conversationsQuery.isLoading ? (
          <EmptyState
            title="还没有会话"
            description={
              conversationsQuery.error instanceof Error
                ? conversationsQuery.error.message
                : "先去通讯录认识一些人，或到发现页试试摇一摇。"
            }
            action={
              <Link
                to="/tabs/contacts"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white"
              >
                <MessagesSquare size={16} />
                去通讯录
              </Link>
            }
          />
        ) : null}
        {!conversationsQuery.isLoading && items.length > 0 ? (
          <InlineNotice tone="muted">
            当前会话按实时更新继续延展。直接聊天和升级后的协作群聊会共用同一条流。
          </InlineNotice>
        ) : null}
        {friendsQuery.isLoading ? <LoadingBlock className="px-4 py-3 text-left" label="正在准备快速开始列表..." /> : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <ErrorBlock message={`快速开始列表加载失败：${friendsQuery.error.message}`} />
        ) : null}
        {startChatMutation.isError && startChatMutation.error instanceof Error ? (
          <ErrorBlock message={startChatMutation.error.message} />
        ) : null}
      </section>
    </AppPage>
  );
}
