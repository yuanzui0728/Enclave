import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  getGroup,
  getGroupMembers,
  updateGroup,
  updateGroupOwnerProfile,
} from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type GroupChatEditMode = "name" | "nickname";

export function GroupChatNameEditPage() {
  const { groupId } = useParams({ from: "/group/$groupId/edit/name" });
  return <GroupChatEditPage groupId={groupId} mode="name" />;
}

export function GroupChatNicknameEditPage() {
  const { groupId } = useParams({ from: "/group/$groupId/edit/nickname" });
  return <GroupChatEditPage groupId={groupId} mode="nickname" />;
}

function GroupChatEditPage({
  groupId,
  mode,
}: {
  groupId: string;
  mode: GroupChatEditMode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
    enabled: mode === "nickname",
  });

  const ownerMember = useMemo(
    () =>
      (membersQuery.data ?? []).find(
        (item) => item.role === "owner" && item.memberType === "user",
      ),
    [membersQuery.data],
  );

  const initialValue =
    mode === "name"
      ? groupQuery.data?.name ?? ""
      : ownerMember?.memberName?.trim() ?? "";
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  const saveGroupNameMutation = useMutation({
    mutationFn: (name: string) => updateGroup(groupId, { name }, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-saved-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({ to: "/group/$groupId/details", params: { groupId } });
    },
  });

  const saveNicknameMutation = useMutation({
    mutationFn: (nickname: string) =>
      updateGroupOwnerProfile(groupId, { nickname }, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({ to: "/group/$groupId/details", params: { groupId } });
    },
  });

  const saveMutation =
    mode === "name" ? saveGroupNameMutation : saveNicknameMutation;
  const trimmedDraft = draft.trim();
  const submitDisabled =
    saveMutation.isPending ||
    !trimmedDraft ||
    trimmedDraft === initialValue.trim();

  return (
    <ChatDetailsShell
      title={mode === "name" ? "群聊名称" : "我在本群的昵称"}
      subtitle={groupQuery.data?.name ?? "群聊信息"}
      onBack={() => {
        void navigate({ to: "/group/$groupId/details", params: { groupId } });
      }}
    >
      {groupQuery.isLoading || (mode === "nickname" && membersQuery.isLoading) ? (
        <LoadingBlock label="正在读取群聊信息..." />
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
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={saveMutation.error.message} />
        </div>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <div className="px-3">
          <EmptyState
            title="群聊不存在"
            description="这个群聊暂时不可用，返回上一页再试一次。"
          />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatDetailsSection title={mode === "name" ? "修改群聊名称" : "修改群昵称"}>
            <div className="px-4 py-4">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  mode === "name" ? "请输入群聊名称" : "请输入我在本群的昵称"
                }
                className="h-12 w-full rounded-[12px] border border-black/8 bg-[#f7f7f7] px-3 text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
              <div className="mt-3 text-[12px] leading-5 text-[color:var(--text-muted)]">
                {mode === "name"
                  ? "群聊名称会同步显示在聊天顶部、消息列表和群信息页。"
                  : "这个昵称会显示在群成员资料里，也会影响群聊里的昵称展示。"}
              </div>
            </div>
          </ChatDetailsSection>

          <div className="px-3">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={submitDisabled}
              onClick={() => {
                if (mode === "name") {
                  saveGroupNameMutation.mutate(trimmedDraft);
                  return;
                }

                saveNicknameMutation.mutate(trimmedDraft);
              }}
              className="w-full rounded-2xl"
            >
              {saveMutation.isPending ? "正在保存..." : "保存"}
            </Button>
          </div>
        </>
      ) : null}
    </ChatDetailsShell>
  );
}
