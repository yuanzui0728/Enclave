import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { getFriends, getOrCreateConversation, listCharacters } from "@yinjie/contracts";
import { AppHeader, AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useSessionStore } from "../store/session-store";

export function ContactsPage() {
  const navigate = useNavigate();
  const userId = useSessionStore((state) => state.userId);

  const friendsQuery = useQuery({
    queryKey: ["app-friends", userId],
    queryFn: () => getFriends(userId!),
    enabled: Boolean(userId),
  });

  const charactersQuery = useQuery({
    queryKey: ["app-characters", userId],
    queryFn: () => listCharacters(),
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
  const pendingCharacterId = startChatMutation.isPending ? startChatMutation.variables : null;

  return (
    <AppPage>
      <AppHeader
        eyebrow="通讯录"
        title="你认识的人，会越来越多"
        description="角色不是模板卡片，而是会随着世界时间继续活动的人。"
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-white">我的联系人</div>
          <div className="flex items-center gap-3">
            <Link to="/group/new" className="text-xs text-[color:var(--brand-secondary)]">
              创建群聊
            </Link>
            <Link to="/friend-requests" className="text-xs text-[color:var(--brand-secondary)]">
              新的朋友
            </Link>
          </div>
        </div>
        <div className="space-y-3">
          {friendsQuery.isLoading ? <LoadingBlock label="正在读取联系人..." /> : null}
          {(friendsQuery.data ?? []).map(({ character, friendship }) => (
            <button
              key={character.id}
              type="button"
              onClick={() => startChatMutation.mutate(character.id)}
              disabled={startChatMutation.isPending}
              className="flex w-full items-center gap-3 rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-4 text-left transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-tertiary)] disabled:opacity-60"
            >
              <AvatarChip name={character.name} src={character.avatar} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">{character.name}</div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {pendingCharacterId === character.id
                    ? "正在发起会话..."
                    : `${character.relationship} · 亲密度 ${friendship.intimacyLevel}`}
                </div>
              </div>
              <div className={`h-2.5 w-2.5 rounded-full ${character.isOnline ? "bg-emerald-400" : "bg-slate-600"}`} />
            </button>
          ))}
          {!friendsQuery.isLoading && !friendsQuery.isError && !friendsQuery.data?.length ? (
            <EmptyState
              title="通讯录还是空的"
              description="先去发现页摇一摇，或处理新的好友申请。"
              action={
                <Link to="/friend-requests">
                  <Button variant="secondary">查看新的朋友</Button>
                </Link>
              }
            />
          ) : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? <ErrorBlock message={friendsQuery.error.message} /> : null}
          {startChatMutation.isError && startChatMutation.error instanceof Error ? (
            <ErrorBlock message={startChatMutation.error.message} />
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-3 text-sm font-medium text-white">世界里的人</div>
        <InlineNotice className="mb-3" tone="muted">
          这里展示尚未建立关系的角色档案。可以先浏览，再决定是否进入对话。
        </InlineNotice>
        {charactersQuery.isLoading ? <LoadingBlock label="正在读取角色档案..." /> : null}
        {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}
        <div className="grid grid-cols-2 gap-3">
          {(charactersQuery.data ?? []).map((character) => (
            <Link
              key={character.id}
              to="/character/$characterId"
              params={{ characterId: character.id }}
              className="rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] p-4 transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-tertiary)]"
            >
              <AvatarChip name={character.name} src={character.avatar} size="lg" />
              <div className="mt-4 text-sm font-medium text-white">{character.name}</div>
              <div className="mt-1 line-clamp-1 text-xs text-[color:var(--text-muted)]">{character.relationship}</div>
              <div className="mt-3 line-clamp-2 text-xs leading-6 text-[color:var(--text-secondary)]">{character.bio}</div>
            </Link>
          ))}
        </div>
        {!charactersQuery.isLoading && !charactersQuery.isError && !(charactersQuery.data?.length ?? 0) ? (
          <div className="mt-3">
            <EmptyState title="世界里还没有人" description="当前还没有可浏览的角色档案。" />
          </div>
        ) : null}
      </section>
    </AppPage>
  );
}
