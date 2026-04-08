import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { getFriends, getOrCreateConversation, listCharacters } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function ContactsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";

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
                <div className="text-sm font-medium text-white">我的联系人</div>
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
                  className="flex w-full items-center gap-3 rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.05))] hover:shadow-[var(--shadow-card)] disabled:opacity-60"
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
          </AppSection>

          <AppSection className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">世界里的人</div>
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
                  className="rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] p-5 shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.055))] hover:shadow-[var(--shadow-card)]"
                >
                  <AvatarChip name={character.name} src={character.avatar} size="lg" />
                  <div className="mt-4 text-base font-medium text-white">{character.name}</div>
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
    <AppPage>
      <AppHeader
        eyebrow="通讯录"
        title="你认识的人，会越来越多"
        description="角色不是模板卡片，而是会随着世界时间继续活动的人。"
      />

      <AppSection className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">我的联系人</div>
            <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">已经认识的人会先聚在这里，你可以直接继续对话或拉进群聊。</div>
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
              className="flex w-full items-center gap-3 rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-4 py-4 text-left shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.05))] hover:shadow-[var(--shadow-card)] disabled:opacity-60"
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
      </AppSection>

      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-white">世界里的人</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">尚未建立关系的角色会留在这一层，适合先浏览，再决定是否接近。</div>
        </div>
        <InlineNotice tone="muted">
          这里展示尚未建立关系的角色档案。可以先浏览，再决定是否进入对话。
        </InlineNotice>
        {charactersQuery.isLoading ? <LoadingBlock label="正在读取角色档案..." /> : null}
        {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}
        <div className="grid grid-cols-2 gap-3">
          {visibleCharacters.map((character) => (
            <Link
              key={character.id}
              to="/character/$characterId"
              params={{ characterId: character.id }}
              className="rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] p-4 shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.055))] hover:shadow-[var(--shadow-card)]"
            >
              <AvatarChip name={character.name} src={character.avatar} size="lg" />
              <div className="mt-4 text-sm font-medium text-white">{character.name}</div>
              <div className="mt-1 line-clamp-1 text-xs text-[color:var(--text-muted)]">{character.relationship}</div>
              <div className="mt-3 line-clamp-2 text-xs leading-6 text-[color:var(--text-secondary)]">{character.bio}</div>
            </Link>
          ))}
        </div>
        {!charactersQuery.isLoading && !charactersQuery.isError && !visibleCharacters.length ? (
          <div className="mt-3">
            <EmptyState title="世界里还没有人" description="当前没有可浏览的角色档案，或你已经屏蔽了所有可见角色。" />
          </div>
        ) : null}
      </AppSection>
    </AppPage>
  );
}
