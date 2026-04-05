import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { createGroup, getFriends } from "@yinjie/contracts";
import { AppPage, AppSection, Button, ErrorBlock, LoadingBlock, TextField } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useSessionStore } from "../store/session-store";

export function CreateGroupPage() {
  const navigate = useNavigate();
  const userId = useSessionStore((state) => state.userId);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const friendsQuery = useQuery({
    queryKey: ["app-group-friends", userId],
    queryFn: () => getFriends(userId!),
    enabled: Boolean(userId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createGroup({
        name: name.trim() || "临时群聊",
        creatorId: userId!,
        creatorType: "user",
        memberIds: selectedIds,
      }),
    onSuccess: (group) => {
      navigate({ to: "/group/$groupId", params: { groupId: group.id } });
    },
  });
  const canCreate = selectedIds.length > 0 && Boolean(userId);

  return (
    <AppPage>
      <div className="flex items-center gap-3">
        <Button
          onClick={() => navigate({ to: "/tabs/contacts" })}
          variant="ghost"
          size="icon"
          className="text-[color:var(--text-secondary)]"
        >
          <ArrowLeft size={18} />
        </Button>
        <div>
          <div className="text-lg font-semibold text-white">创建群聊</div>
          <div className="text-xs text-[color:var(--text-muted)]">把已经认识的人拉到同一个空间里</div>
        </div>
      </div>

      <AppSection className="mt-5">
        <div className="text-sm font-medium text-white">群名称</div>
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

      <div className="mt-5 space-y-3">
        {friendsQuery.isLoading ? <LoadingBlock className="text-left" label="正在读取你已经认识的人..." /> : null}

        {friendsQuery.isError && friendsQuery.error instanceof Error ? <ErrorBlock message={friendsQuery.error.message} /> : null}

        {!friendsQuery.isLoading && !friendsQuery.isError && !(friendsQuery.data?.length ?? 0) ? (
          <EmptyState
            title="还没有可拉进群的人"
            description="先去通讯录里建立一些关系，再回来创建群聊。"
          />
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
              className={`flex w-full items-center gap-3 rounded-[24px] border px-4 py-4 text-left ${
                checked
                  ? "border-[color:var(--brand-primary)] bg-[rgba(249,115,22,0.12)]"
                  : "border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)]"
              } disabled:opacity-60`}
            >
              <AvatarChip name={character.name} src={character.avatar} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">{character.name}</div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">{character.relationship}</div>
              </div>
              <div
                className={`h-5 w-5 rounded-full border ${
                  checked ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]" : "border-white/20"
                }`}
              />
            </button>
          );
        })}
      </div>

      {createMutation.isError && createMutation.error instanceof Error ? <ErrorBlock className="mt-4" message={createMutation.error.message} /> : null}

      <Button
        onClick={() => createMutation.mutate()}
        disabled={!canCreate || createMutation.isPending}
        variant="primary"
        size="lg"
        className="mt-5 w-full rounded-2xl"
      >
        {createMutation.isPending ? "正在创建群聊..." : "创建群聊"}
      </Button>
    </AppPage>
  );
}
