import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { createGroup, getFriends } from "@yinjie/contracts";
import {
  AppHeader,
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function CreateGroupPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const friendsQuery = useQuery({
    queryKey: ["app-group-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createGroup(
        {
          name: name.trim() || "临时群聊",
          memberIds: selectedIds,
        },
        baseUrl,
      ),
    onSuccess: (group) => {
      void navigate({ to: "/group/$groupId", params: { groupId: group.id } });
    },
  });

  const resetCreateGroupState = useEffectEvent(() => {
    setName("");
    setSelectedIds([]);
    setSearchTerm("");
    createMutation.reset();
  });

  useEffect(() => {
    resetCreateGroupState();
  }, [baseUrl, resetCreateGroupState]);

  const friendItems = friendsQuery.data ?? [];
  const filteredFriends = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return friendItems;
    }

    return friendItems.filter(({ character }) => {
      return (
        character.name.toLowerCase().includes(keyword) ||
        (character.relationship ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [friendItems, searchTerm]);
  const selectedFriends = useMemo(
    () =>
      friendItems.filter(({ character }) => selectedIds.includes(character.id)),
    [friendItems, selectedIds],
  );

  const toggleSelection = (characterId: string) => {
    setSelectedIds((current) =>
      current.includes(characterId)
        ? current.filter((item) => item !== characterId)
        : [...current, characterId],
    );
  };

  if (isDesktopLayout) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f5f5f5]">
        <header className="flex items-center justify-between gap-4 border-b border-black/6 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => {
                void navigate({ to: "/tabs/chat" });
              }}
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full border border-black/6 bg-[#f7f7f7] text-[color:var(--text-primary)]"
            >
              <ArrowLeft size={18} />
            </Button>
            <div>
              <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
                发起群聊
              </div>
              <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                选择联系人并创建一个新的桌面群聊工作区。
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!selectedIds.length || createMutation.isPending}
            variant="primary"
            size="lg"
            className="rounded-2xl px-6"
          >
            {createMutation.isPending ? "正在创建..." : "创建群聊"}
          </Button>
        </header>

        <div className="min-h-0 flex-1 p-6">
          <div className="mx-auto flex h-full min-h-0 max-w-[1200px] overflow-hidden rounded-[28px] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.10)]">
            <section className="flex w-[400px] shrink-0 flex-col border-r border-black/6 bg-[#f7f7f7]">
              <div className="border-b border-black/6 px-5 py-5">
                <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                  选择成员
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  至少选择一位已经建立关系的人。
                </div>

                <label className="relative mt-4 block">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
                  />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="搜索联系人"
                    className="h-11 w-full rounded-2xl border border-black/8 bg-white pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-black/12"
                  />
                </label>

                <div className="mt-3 text-[12px] text-[color:var(--text-muted)]">
                  已选择 {selectedIds.length} 位成员
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                {friendsQuery.isLoading ? (
                  <LoadingBlock
                    className="px-2 py-4 text-left"
                    label="正在读取联系人..."
                  />
                ) : null}
                {friendsQuery.isError && friendsQuery.error instanceof Error ? (
                  <div className="px-2 py-2">
                    <ErrorBlock message={friendsQuery.error.message} />
                  </div>
                ) : null}

                {!friendsQuery.isLoading &&
                !friendsQuery.isError &&
                !friendItems.length ? (
                  <div className="px-2 py-8">
                    <EmptyState
                      title="还没有可拉进群的人"
                      description="先去通讯录里建立一些关系，再回来创建群聊。"
                    />
                  </div>
                ) : null}

                {!friendsQuery.isLoading &&
                !friendsQuery.isError &&
                friendItems.length > 0 &&
                !filteredFriends.length ? (
                  <div className="px-5 py-10 text-center text-sm text-[color:var(--text-muted)]">
                    没有匹配的联系人。
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  {filteredFriends.map(({ character }) => (
                    <FriendSelectionRow
                      key={character.id}
                      checked={selectedIds.includes(character.id)}
                      disabled={createMutation.isPending}
                      name={character.name}
                      relationship={character.relationship}
                      src={character.avatar}
                      variant="desktop"
                      onClick={() => toggleSelection(character.id)}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#fcfcfc,#f6f6f6)]">
              <div className="border-b border-black/6 px-6 py-5">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
                  群资料
                </div>
                <div className="mt-4 max-w-[420px]">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    群名称
                  </div>
                  <TextField
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="例如：周末咨询群"
                    className="mt-3 rounded-2xl border-black/8 bg-white"
                  />
                  <div className="mt-3 text-[12px] text-[color:var(--text-muted)]">
                    不填写时会使用“临时群聊”。
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                {selectedFriends.length ? (
                  <>
                    <div className="mb-4 text-[15px] font-medium text-[color:var(--text-primary)]">
                      已选成员
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedFriends.map(({ character }) => (
                        <div
                          key={character.id}
                          className="flex items-center gap-3 rounded-[22px] border border-black/6 bg-white px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
                        >
                          <AvatarChip
                            name={character.name}
                            src={character.avatar}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                              {character.name}
                            </div>
                            <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                              {character.relationship}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleSelection(character.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/6 text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)]"
                            aria-label={`移除 ${character.name}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center px-8">
                    <div className="max-w-[320px] text-center">
                      <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
                        右侧显示已选成员
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                        从左侧勾选联系人后，就能在这里确认群成员并完成创建。
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-black/6 px-6 py-4">
                <div className="text-[12px] text-[color:var(--text-muted)]">
                  已选择 {selectedIds.length} 位成员，创建后会直接进入新群聊。
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void navigate({ to: "/tabs/chat" });
                    }}
                    className="rounded-2xl"
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={() => createMutation.mutate()}
                    disabled={!selectedIds.length || createMutation.isPending}
                    variant="primary"
                    className="rounded-2xl px-6"
                  >
                    {createMutation.isPending ? "正在创建群聊..." : "确认创建"}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>

        {createMutation.isError && createMutation.error instanceof Error ? (
          <div className="px-6 pb-6">
            <ErrorBlock message={createMutation.error.message} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AppPage>
      <AppHeader
        eyebrow="群聊"
        title="创建群聊"
        description="把已经认识的人拉到同一个空间里，让对话从单聊扩展成协作。"
        actions={
          <Button
            onClick={() => navigate({ to: "/tabs/contacts" })}
            variant="ghost"
            size="icon"
            className="text-[color:var(--text-secondary)]"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <AppSection>
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          群名称
        </div>
        <TextField
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：周末咨询群"
          className="mt-3"
        />
        <div className="mt-3 text-xs text-[color:var(--text-muted)]">
          已选择 {selectedIds.length} 位成员，不填写名称时会默认使用“临时群聊”。
        </div>
      </AppSection>

      <AppSection className="space-y-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            选择成员
          </div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            至少选择一位已经建立关系的人，才能开始一个新的群聊。
          </div>
        </div>
        {friendsQuery.isLoading ? (
          <LoadingBlock className="text-left" label="正在读取联系人..." />
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <ErrorBlock message={friendsQuery.error.message} />
        ) : null}

        {!friendsQuery.isLoading &&
        !friendsQuery.isError &&
        !(friendsQuery.data?.length ?? 0) ? (
          <EmptyState
            title="还没有可拉进群的人"
            description="先去通讯录里建立一些关系，再回来创建群聊。"
          />
        ) : null}

        {(friendsQuery.data ?? []).map(({ character }) => (
          <FriendSelectionRow
            key={character.id}
            checked={selectedIds.includes(character.id)}
            disabled={createMutation.isPending}
            name={character.name}
            relationship={character.relationship}
            src={character.avatar}
            onClick={() => toggleSelection(character.id)}
          />
        ))}
      </AppSection>

      {createMutation.isError && createMutation.error instanceof Error ? (
        <ErrorBlock className="mt-4" message={createMutation.error.message} />
      ) : null}

      <Button
        onClick={() => createMutation.mutate()}
        disabled={!selectedIds.length || createMutation.isPending}
        variant="primary"
        size="lg"
        className="mt-5 w-full rounded-2xl"
      >
        {createMutation.isPending ? "正在创建群聊..." : "创建群聊"}
      </Button>
    </AppPage>
  );
}

function FriendSelectionRow({
  checked,
  disabled,
  name,
  relationship,
  src,
  variant = "mobile",
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  name: string;
  relationship?: string;
  src?: string | null;
  variant?: "mobile" | "desktop";
  onClick: () => void;
}) {
  const isDesktop = variant === "desktop";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 text-left transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] disabled:opacity-60",
        isDesktop
          ? checked
            ? "rounded-[18px] border border-[rgba(7,193,96,0.22)] bg-[rgba(7,193,96,0.08)] px-4 py-3 shadow-[0_8px_20px_rgba(7,193,96,0.08)]"
            : "rounded-[18px] border border-transparent bg-transparent px-4 py-3 hover:bg-white"
          : checked
            ? "rounded-[24px] border border-[color:var(--border-brand)] bg-[linear-gradient(135deg,rgba(249,115,22,0.16),rgba(251,191,36,0.08))] px-4 py-4 shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
            : "rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
      )}
    >
      <AvatarChip name={name} src={src} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {name}
        </div>
        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
          {relationship}
        </div>
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border transition-colors",
          isDesktop ? "h-6 w-6" : "h-5 w-5",
          checked
            ? "border-[#07c160] bg-[#07c160] text-white"
            : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-transparent",
        )}
      >
        <Check size={isDesktop ? 14 : 12} strokeWidth={2.8} />
      </div>
    </button>
  );
}
