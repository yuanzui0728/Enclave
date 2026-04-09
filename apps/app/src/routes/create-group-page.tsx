import { useEffect, useEffectEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { createGroup, getFriends } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, LoadingBlock, TextField } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function CreateGroupPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    createMutation.reset();
  });

  useEffect(() => {
    resetCreateGroupState();
  }, [baseUrl, resetCreateGroupState]);

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
        <div className="text-sm font-medium text-[color:var(--text-primary)]">群名称</div>
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
          <div className="text-sm font-medium text-[color:var(--text-primary)]">选择成员</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            至少选择一位已经建立关系的人，才能开始一个新的群聊。
          </div>
        </div>
        {friendsQuery.isLoading ? <LoadingBlock className="text-left" label="正在读取联系人..." /> : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <ErrorBlock message={friendsQuery.error.message} />
        ) : null}

        {!friendsQuery.isLoading && !friendsQuery.isError && !(friendsQuery.data?.length ?? 0) ? (
          <EmptyState title="还没有可拉进群的人" description="先去通讯录里建立一些关系，再回来创建群聊。" />
        ) : null}

        {(friendsQuery.data ?? []).map(({ character }) => {
          const checked = selectedIds.includes(character.id);
          return (
            <button
              key={character.id}
              type="button"
              disabled={createMutation.isPending}
              onClick={() =>
                setSelectedIds((current) =>
                  checked ? current.filter((item) => item !== character.id) : [...current, character.id],
                )
              }
              className={`flex w-full items-center gap-3 rounded-[24px] border px-4 py-4 text-left shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] ${
                checked
                  ? "border-[color:var(--border-brand)] bg-[linear-gradient(135deg,rgba(249,115,22,0.16),rgba(251,191,36,0.08))]"
                  : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)]"
              } disabled:opacity-60`}
            >
              <AvatarChip name={character.name} src={character.avatar} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">{character.name}</div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">{character.relationship}</div>
              </div>
              <div
                className={`h-5 w-5 rounded-full border ${
                  checked
                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
                    : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"
                }`}
              />
            </button>
          );
        })}
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
