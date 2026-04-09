import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookUser, Search, Tag, UserPlus, Users } from "lucide-react";
import { getFriends, getOrCreateConversation, listCharacters } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type ShortcutRoute = "/group/new" | "/friend-requests";

type MobileShortcutItem = {
  key: string;
  label: string;
  icon: typeof Users;
  iconClassName: string;
  to?: ShortcutRoute;
  unavailableNotice?: string;
  onClick?: () => void;
};

export function ContactsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

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

  const friendContacts = useMemo(() => {
    return [...(friendsQuery.data ?? [])].sort((left, right) =>
      left.character.name.localeCompare(right.character.name, "zh-CN"),
    );
  }, [friendsQuery.data]);

  const discoverableCharacters = useMemo(() => {
    const friendIds = new Set(friendContacts.map(({ character }) => character.id));
    return [...(charactersQuery.data ?? [])]
      .filter((character) => !friendIds.has(character.id))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [charactersQuery.data, friendContacts]);

  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    if (!normalizedSearchText) {
      return friendContacts;
    }

    return friendContacts.filter(({ character }) => matchesCharacterSearch(character, normalizedSearchText));
  }, [friendContacts, normalizedSearchText]);

  const filteredCharacters = useMemo(() => {
    if (!normalizedSearchText) {
      return discoverableCharacters;
    }

    return discoverableCharacters.filter((character) => matchesCharacterSearch(character, normalizedSearchText));
  }, [discoverableCharacters, normalizedSearchText]);

  const characterCount = discoverableCharacters.length;

  const resetStartChatMutation = useEffectEvent(() => {
    startChatMutation.reset();
  });

  useEffect(() => {
    resetStartChatMutation();
  }, [baseUrl, resetStartChatMutation]);

  function handleShortcutNavigate(to: ShortcutRoute) {
    setNotice(null);
    void navigate({ to });
  }

  function handleUnavailableAction(message: string) {
    setNotice(message);
  }

  function jumpToWorldCharacters() {
    setNotice(null);
    if (typeof document === "undefined") {
      return;
    }

    document.getElementById("contact-world-characters")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const mobileShortcutItems: MobileShortcutItem[] = [
    {
      key: "new-friends",
      label: "新的朋友",
      icon: UserPlus,
      iconClassName: "bg-[linear-gradient(135deg,rgba(251,191,36,0.96),rgba(249,115,22,0.94))]",
      to: "/friend-requests",
    },
    {
      key: "group-chat",
      label: "群聊",
      icon: Users,
      iconClassName: "bg-[linear-gradient(135deg,rgba(52,211,153,0.94),rgba(16,185,129,0.92))]",
      to: "/group/new",
    },
    {
      key: "tags",
      label: "标签",
      icon: Tag,
      iconClassName: "bg-[linear-gradient(135deg,rgba(251,146,60,0.94),rgba(249,115,22,0.9))]",
      unavailableNotice: "标签功能暂未开放。",
    },
    {
      key: "world-characters",
      label: "世界角色",
      icon: BookUser,
      iconClassName: "bg-[linear-gradient(135deg,rgba(16,185,129,0.88),rgba(251,146,60,0.88))]",
      onClick: jumpToWorldCharacters,
    },
  ];

  if (isDesktopLayout) {
    return (
      <AppPage className="space-y-5 px-6 py-6">
        <AppHeader
          eyebrow="通讯录"
          title="把已经建立的关系和下一段相遇都放在眼前"
          description="左边是已经连上的联系人，右边是还可以继续认识的角色。桌面端保持双栏结构，方便边看边发起对话。"
        />

        <div className="grid min-h-0 gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <AppSection className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">我的联系人</div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  已经建立关系的人会优先停留在这里，可以直接继续对话。
                </div>
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

              {friendContacts.map(({ character, friendship }) => (
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
                  <div className={cn("h-2.5 w-2.5 rounded-full", character.isOnline ? "bg-emerald-400" : "bg-gray-300")} />
                </button>
              ))}

              {!friendsQuery.isLoading && !friendsQuery.isError && !friendContacts.length ? (
                <EmptyState
                  title="通讯录还是空的"
                  description="先去发现页认识角色，或者处理新的朋友申请。"
                  action={
                    <Link to="/friend-requests">
                      <Button variant="secondary">查看新的朋友</Button>
                    </Link>
                  }
                />
              ) : null}

              {friendsQuery.isError && friendsQuery.error instanceof Error ? (
                <ErrorBlock message={friendsQuery.error.message} />
              ) : null}
              {startChatMutation.isError && startChatMutation.error instanceof Error ? (
                <ErrorBlock message={startChatMutation.error.message} />
              ) : null}
            </div>
          </AppSection>

          <AppSection className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">世界角色</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                这里展示还没有建立关系的角色档案，可以先浏览，再决定是否继续认识。
              </div>
            </div>

            {charactersQuery.isLoading ? <LoadingBlock label="正在读取角色档案..." /> : null}
            {charactersQuery.isError && charactersQuery.error instanceof Error ? (
              <ErrorBlock message={charactersQuery.error.message} />
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              {discoverableCharacters.map((character) => (
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

            {!charactersQuery.isLoading && !charactersQuery.isError && !discoverableCharacters.length ? (
              <div className="mt-3">
                <EmptyState title="暂时没有新的角色" description="当前没有可浏览的世界角色，或者你已经认识了所有可见角色。" />
              </div>
            ) : null}
          </AppSection>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="space-y-0 bg-[linear-gradient(180deg,rgba(255,253,247,0.96),rgba(255,248,238,0.98))] px-0 py-0">
      <TabPageTopBar
        title="通讯录"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,249,240,0.96))] px-4 py-3 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
      />

      <div className="pb-6">
        <div className="px-3 pt-3">
          <label className="flex items-center gap-2 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-[var(--shadow-soft)]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索"
              className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>

        {notice ? (
          <div className="px-3 pt-3">
            <InlineNotice tone="info">{notice}</InlineNotice>
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={friendsQuery.error.message} />
          </div>
        ) : null}
        {charactersQuery.isError && charactersQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={charactersQuery.error.message} />
          </div>
        ) : null}
        {startChatMutation.isError && startChatMutation.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={startChatMutation.error.message} />
          </div>
        ) : null}

        <section className="mt-3 overflow-hidden rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-section)]">
          {mobileShortcutItems.map((item, index) => {
            const Icon = item.icon;
            const handleClick = item.to
              ? () => handleShortcutNavigate(item.to!)
              : item.onClick
                ? item.onClick
                : () => handleUnavailableAction(item.unavailableNotice ?? "该功能暂未开放。");

            return (
              <button
                key={item.key}
                type="button"
                onClick={handleClick}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]",
                  index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
                )}
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white", item.iconClassName)}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1 text-[16px] text-[color:var(--text-primary)]">{item.label}</div>
              </button>
            );
          })}
        </section>

        <MobileSectionHeader label="联系人" />

        <section className="overflow-hidden rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-section)]">
          {friendsQuery.isLoading ? <LoadingBlock className="px-4 py-5 text-left" label="正在读取联系人..." /> : null}

          {!friendsQuery.isLoading && !friendsQuery.isError && filteredFriends.length
            ? filteredFriends.map(({ character, friendship }, index) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => startChatMutation.mutate(character.id)}
                  disabled={startChatMutation.isPending}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)] disabled:opacity-60",
                    index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
                  )}
                >
                  <AvatarChip name={character.name} src={character.avatar} size="wechat" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] text-[color:var(--text-primary)]">{character.name}</div>
                    <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                      {pendingCharacterId === character.id
                        ? "正在发起会话..."
                        : character.currentStatus?.trim() || `${character.relationship} · 亲密度 ${friendship.intimacyLevel}`}
                    </div>
                  </div>
                  {character.isOnline ? <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--brand-accent)]" /> : null}
                </button>
              ))
            : null}

          {!friendsQuery.isLoading && !friendsQuery.isError && !filteredFriends.length ? (
            <div className="px-4 py-10 text-center">
              <div className="text-sm text-[color:var(--text-muted)]">
                {normalizedSearchText ? "没有找到匹配的联系人" : "通讯录还是空的"}
              </div>
              {!normalizedSearchText ? (
                <div className="mt-4">
                  <Link to="/friend-requests">
                    <Button variant="secondary">去看新的朋友</Button>
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <MobileSectionHeader label={`世界角色 · ${characterCount}`} />

        <section id="contact-world-characters" className="overflow-hidden rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-section)]">
          {charactersQuery.isLoading ? <LoadingBlock className="px-4 py-5 text-left" label="正在读取世界角色..." /> : null}

          {!charactersQuery.isLoading && !charactersQuery.isError && filteredCharacters.length
            ? filteredCharacters.map((character, index) => (
                <Link
                  key={character.id}
                  to="/character/$characterId"
                  params={{ characterId: character.id }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]",
                    index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
                  )}
                >
                  <AvatarChip name={character.name} src={character.avatar} size="wechat" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] text-[color:var(--text-primary)]">{character.name}</div>
                    <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                      {character.relationship || character.bio || "查看角色档案"}
                    </div>
                  </div>
                </Link>
              ))
            : null}

          {!charactersQuery.isLoading && !charactersQuery.isError && !filteredCharacters.length ? (
            <div className="px-4 py-10 text-center text-sm text-[color:var(--text-muted)]">
              {normalizedSearchText ? "没有找到匹配的世界角色" : "暂时没有新的世界角色"}
            </div>
          ) : null}
        </section>
      </div>
    </AppPage>
  );
}

function MobileSectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-2.5 text-xs font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
      {label}
    </div>
  );
}

function matchesCharacterSearch(
  character: {
    name: string;
    relationship?: string | null;
    bio?: string | null;
    currentStatus?: string | null;
  },
  normalizedSearchText: string,
) {
  const haystacks = [
    character.name,
    character.relationship ?? "",
    character.bio ?? "",
    character.currentStatus ?? "",
  ];

  return haystacks.some((value) => value.toLowerCase().includes(normalizedSearchText));
}
