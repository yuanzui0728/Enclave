import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  addGroupMember,
  getFriends,
  getGroup,
  getGroupMembers,
  removeGroupMember,
} from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type GroupMemberPickerMode = "add" | "remove";

export function GroupMemberAddPage() {
  const { groupId } = useParams({ from: "/group/$groupId/members/add" });
  return <GroupMemberPickerPage groupId={groupId} mode="add" />;
}

export function GroupMemberRemovePage() {
  const { groupId } = useParams({ from: "/group/$groupId/members/remove" });
  return <GroupMemberPickerPage groupId={groupId} mode="remove" />;
}

function GroupMemberPickerPage({
  groupId,
  mode,
}: {
  groupId: string;
  mode: GroupMemberPickerMode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });
  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: mode === "add",
  });

  const memberIds = useMemo(
    () => new Set((membersQuery.data ?? []).map((item) => item.memberId)),
    [membersQuery.data],
  );

  const candidateItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (mode === "add") {
      return (friendsQuery.data ?? [])
        .filter((item) => item.friendship.status !== "removed")
        .filter((item) => !memberIds.has(item.character.id))
        .filter((item) => {
          if (!normalizedKeyword) {
            return true;
          }

          return [
            item.character.name,
            item.friendship.remarkName ?? "",
            item.character.relationship ?? "",
          ].some((value) => value.toLowerCase().includes(normalizedKeyword));
        })
        .map((item) => ({
          id: item.character.id,
          name: item.friendship.remarkName?.trim() || item.character.name,
          subtitle: item.character.relationship || "世界联系人",
          avatar: item.character.avatar,
        }));
    }

    return (membersQuery.data ?? [])
      .filter((item) => item.memberType === "character")
      .filter((item) => {
        if (!normalizedKeyword) {
          return true;
        }

        return (item.memberName ?? item.memberId)
          .toLowerCase()
          .includes(normalizedKeyword);
      })
      .map((item) => ({
        id: item.memberId,
        name: item.memberName ?? item.memberId,
        subtitle: item.role === "admin" ? "管理员" : "群成员",
        avatar: item.memberAvatar,
      }));
  }, [friendsQuery.data, keyword, memberIds, membersQuery.data, mode]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIds.length) {
        return;
      }

      if (mode === "add") {
        await Promise.all(
          selectedIds.map((memberId) =>
            addGroupMember(
              groupId,
              {
                memberId,
                memberType: "character",
              },
              baseUrl,
            ),
          ),
        );
        return;
      }

      await Promise.all(
        selectedIds.map((memberId) =>
          removeGroupMember(groupId, memberId, baseUrl),
        ),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({
        to: "/group/$groupId/details",
        params: { groupId },
      });
    },
  });

  const pageTitle = mode === "add" ? "添加成员" : "移除成员";
  const emptyStateTitle =
    mode === "add" ? "没有可添加的联系人" : "当前没有可移除的群成员";
  const emptyStateDescription =
    mode === "add"
      ? "通讯录里的联系人已经都在群里了。"
      : "这个群目前没有可移除的角色成员。";
  const loadingLabel =
    mode === "add" ? "正在读取联系人..." : "正在读取群成员...";

  return (
    <ChatDetailsShell
      title={pageTitle}
      subtitle={groupQuery.data?.name ?? "群聊信息"}
      onBack={() => {
        void navigate({
          to: "/group/$groupId/details",
          params: { groupId },
        });
      }}
    >
      {groupQuery.isLoading ||
      membersQuery.isLoading ||
      (mode === "add" && friendsQuery.isLoading) ? (
        <LoadingBlock label={loadingLabel} />
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={groupQuery.error.message} />
        </div>
      ) : null}
      {membersQuery.isError && membersQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={membersQuery.error.message} />
        </div>
      ) : null}
      {friendsQuery.isError && friendsQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={friendsQuery.error.message} />
        </div>
      ) : null}
      {submitMutation.isError && submitMutation.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={submitMutation.error.message} />
        </div>
      ) : null}

      <ChatDetailsSection title="搜索">
        <label className="flex items-center gap-2 px-4 py-3">
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={mode === "add" ? "搜索联系人" : "搜索群成员"}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
          />
        </label>
      </ChatDetailsSection>

      {!groupQuery.isLoading &&
      !membersQuery.isLoading &&
      !(mode === "add" && friendsQuery.isLoading) &&
      !candidateItems.length &&
      !submitMutation.isPending ? (
        <div className="px-3">
          <EmptyState
            title={emptyStateTitle}
            description={emptyStateDescription}
          />
        </div>
      ) : null}

      {candidateItems.length ? (
        <ChatDetailsSection
          title={`${mode === "add" ? "可添加成员" : "可移除成员"} · ${
            candidateItems.length
          }`}
        >
          <div className="divide-y divide-black/5">
            {candidateItems.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedIds((current) =>
                      checked
                        ? current.filter((value) => value !== item.id)
                        : [...current, item.id],
                    );
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <AvatarChip
                    name={item.name}
                    src={item.avatar}
                    size="wechat"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] text-[color:var(--text-primary)]">
                      {item.name}
                    </div>
                    <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
                      {item.subtitle}
                    </div>
                  </div>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                      checked
                        ? "border-[#07c160] bg-[#07c160] text-white"
                        : "border-black/10 bg-[#f5f5f5] text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </button>
              );
            })}
          </div>
        </ChatDetailsSection>
      ) : null}

      <div className="px-3">
        <Button
          type="button"
          variant={mode === "remove" ? "secondary" : "primary"}
          size="lg"
          disabled={!selectedIds.length || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
          className="w-full rounded-2xl"
        >
          {submitMutation.isPending
            ? mode === "add"
              ? "正在添加..."
              : "正在移除..."
            : mode === "add"
              ? `添加到群聊 (${selectedIds.length})`
              : `移除成员 (${selectedIds.length})`}
        </Button>
      </div>
    </ChatDetailsShell>
  );
}
