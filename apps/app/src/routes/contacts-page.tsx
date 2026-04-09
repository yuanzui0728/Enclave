import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, UserPlus, Users } from "lucide-react";
import { getFriends, getOrCreateConversation, listCharacters } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function ContactsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });

  const startChatMutation = useMutation({
    mutationFn: (characterId: string) => getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }
      navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    },
  });
  const pendingCharacterId = startChatMutation.isPending ? startChatMutation.variables : null;
  const visibleCharacters = charactersQuery.data ?? [];

  useEffect(() => {
    startChatMutation.reset();
  }, [baseUrl]);

  if (isDesktopLayout) {
    return (
      <AppPage className="space-y-5 px-6 py-6">
        <AppHeader
          eyebrow="通讯录"
          title="联系人和世界角色分屏展开"
          description="桌面端把已认识的人和待接触的角色并排展开，避免来回切页。"
        />

        <div className="grid min-h-0 gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <AppSection className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">我的联系人</div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">已建立关系的人优先停留在左侧工作区。</div>
              </div>
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
                  className="flex w-full items-center gap-3 rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[color:var(--surface-card-hover)] hover:shadow-[var(--shadow-card)] disabled:opacity-60"
                >
                  <AvatarChip name={character.name} src={character.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[color:var(--text-primary)]">{character.name}</div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {pendingCharacterId === character.id
                        ? "正在发起会话..."
                        : `${character.relationship} · 亲密度 ${friendship.intimacyLevel}`}
                    </div>
                  </div>
                  <div className={`h-2.5 w-2.5 rounded-full ${character.isOnline ? "bg-emerald-400" : "bg-gray-300"}`} />
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
          </AppSection>

          <AppSection className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">世界里的人</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">桌面端把待接近角色放到更宽的资料网格里，浏览时不用挤在单列。</div>
            </div>
            <InlineNotice tone="muted">这里展示尚未建立关系的角色档案。可以先浏览，再决定是否进入对话。</InlineNotice>
            {charactersQuery.isLoading ? <LoadingBlock label="正在读取角色档案..." /> : null}
            {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleCharacters.map((character) => (
                <Link
                  key={character.id}
                  to="/character/$characterId"
                  params={{ characterId: character.id }}
                  className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-5 shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[color:var(--surface-card-hover)] hover:shadow-[var(--shadow-card)]"
                >
                  <AvatarChip name={character.name} src={character.avatar} size="lg" />
                  <div className="mt-4 text-base font-medium text-[color:var(--text-primary)]">{character.name}</div>
                  <div className="mt-1 line-clamp-1 text-xs text-[color:var(--text-muted)]">{character.relationship}</div>
                  <div className="mt-3 line-clamp-3 text-sm leading-7 text-[color:var(--text-secondary)]">{character.bio}</div>
                </Link>
              ))}
            </div>
            {!charactersQuery.isLoading && !charactersQuery.isError && !visibleCharacters.length ? (
              <div className="mt-3">
                <EmptyState title="世界里还没有人" description="当前没有可浏览的角色档案，或你已经屏蔽了所有可见角色。" />
              </div>
            ) : null}
          </AppSection>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="space-y-4">
      <TabPageTopBar
        title="通讯录"
        titleAlign="center"
      />

      <div className="overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-soft)]">
        <Link
          to="/friend-requests"
          className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#69c35d,#44a83f)] text-white">
            <UserPlus size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">新的朋友</div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
        </Link>

        <Link
          to="/group/new"
          className="flex items-center gap-3 border-t border-[color:var(--border-faint)] px-4 py-3.5 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#66b2ff,#3c7cff)] text-white">
            <Users size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">群聊</div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
        </Link>
      </div>

      <div className="px-1 text-xs font-medium tracking-[0.12em] text-[color:var(--text-muted)]">联系人</div>

      <div className="overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-soft)]">
        {friendsQuery.isLoading ? <LoadingBlock className="px-4 py-5 text-left" label="正在读取联系人..." /> : null}
        {(friendsQuery.data ?? []).map(({ character, friendship }, index) => (
          <div key={character.id} className={cn(index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined)}>
            <button
              type="button"
              onClick={() => startChatMutation.mutate(character.id)}
              disabled={startChatMutation.isPending}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)] disabled:opacity-60"
            >
              <AvatarChip name={character.name} src={character.avatar} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[color:var(--text-primary)]">{character.name}</div>
                <div className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                  {pendingCharacterId === character.id
                    ? "正在发起会话..."
                    : `${character.relationship} · 亲密度 ${friendship.intimacyLevel}${character.isOnline ? " · 在线" : ""}`}
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
            </button>
          </div>
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
      </div>

      {friendsQuery.isError && friendsQuery.error instanceof Error ? <ErrorBlock message={friendsQuery.error.message} /> : null}
      {startChatMutation.isError && startChatMutation.error instanceof Error ? (
        <ErrorBlock message={startChatMutation.error.message} />
      ) : null}

      <div className="px-1 text-xs font-medium tracking-[0.12em] text-[color:var(--text-muted)]">世界角色</div>

      <div className="overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-soft)]">
        {charactersQuery.isLoading ? <LoadingBlock className="px-4 py-5 text-left" label="正在读取角色档案..." /> : null}
        {visibleCharacters.map((character, index) => (
          <div key={character.id} className={cn(index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined)}>
            <Link
              to="/character/$characterId"
              params={{ characterId: character.id }}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)]"
            >
              <AvatarChip name={character.name} src={character.avatar} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[color:var(--text-primary)]">{character.name}</div>
                <div className="mt-0.5 line-clamp-1 text-xs text-[color:var(--text-muted)]">{character.relationship}</div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
            </Link>
          </div>
        ))}
        {!charactersQuery.isLoading && !charactersQuery.isError && !visibleCharacters.length ? (
          <EmptyState title="世界里还没有人" description="当前没有可浏览的角色档案，或你已经屏蔽了所有可见角色。" />
        ) : null}
      </div>

      {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}
      <InlineNotice tone="muted">这里展示尚未建立关系的角色档案。可以先浏览，再决定是否进入对话。</InlineNotice>
    </AppPage>
  );
}
