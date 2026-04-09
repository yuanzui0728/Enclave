import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  clearGroupMessages,
  getGroup,
  getGroupMembers,
  leaveGroup,
  setGroupPinned,
  updateGroup,
  updateGroupOwnerProfile,
} from "@yinjie/contracts";
import { ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { useDefaultChatBackground } from "../features/chat/backgrounds/use-conversation-background";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatMemberGrid } from "../features/chat-details/chat-member-grid";
import {
  readGroupChatDetailPreferences,
  writeGroupChatDetailPreferences,
} from "../features/chat-details/chat-detail-preferences";
import { ChatSettingRow } from "../features/chat-details/chat-setting-row";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupChatDetailsPage() {
  const { groupId } = useParams({ from: "/group/$groupId/details" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [notice, setNotice] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(() =>
    readGroupChatDetailPreferences(groupId),
  );
  const ownerQuery = useDefaultChatBackground();

  useEffect(() => {
    setPreferences(readGroupChatDetailPreferences(groupId));
    setNotice(null);
  }, [groupId]);

  useEffect(() => {
    writeGroupChatDetailPreferences(groupId, preferences);
  }, [groupId, preferences]);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });

  const updateGroupMutation = useMutation({
    mutationFn: (payload: { name?: string; announcement?: string | null }) =>
      updateGroup(groupId, payload, baseUrl),
    onSuccess: async (_, payload) => {
      setNotice(payload.name ? "群聊名称已更新。" : "群公告已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-group", baseUrl, groupId] });
    },
  });

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) => setGroupPinned(groupId, { pinned }, baseUrl),
    onSuccess: async (_, pinned) => {
      setNotice(pinned ? "群聊已置顶。" : "群聊已取消置顶。");
      await queryClient.invalidateQueries({ queryKey: ["app-group", baseUrl, groupId] });
    },
  });

  const updateNicknameMutation = useMutation({
    mutationFn: (nickname: string) =>
      updateGroupOwnerProfile(groupId, { nickname }, baseUrl),
    onSuccess: async () => {
      setNotice("我在本群的昵称已更新。");
      await queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, groupId],
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearGroupMessages(groupId, baseUrl),
    onSuccess: async () => {
      setNotice("群聊记录已清空。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-group", baseUrl, groupId] }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
      ]);
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveGroup(groupId, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-group", baseUrl, groupId] }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
      ]);
      void navigate({ to: "/tabs/chat" });
    },
  });

  const ownerMember = useMemo(
    () =>
      (membersQuery.data ?? []).find(
        (item) => item.role === "owner" && item.memberType === "user",
      ),
    [membersQuery.data],
  );
  const busy =
    updateGroupMutation.isPending ||
    pinMutation.isPending ||
    updateNicknameMutation.isPending ||
    clearMutation.isPending ||
    leaveMutation.isPending;

  const memberItems = useMemo(() => {
    const members = (membersQuery.data ?? []).slice(0, 10).map((member) => ({
      key: member.id,
      label: member.memberName ?? member.memberId,
      src: member.memberAvatar,
    }));

    return [
      ...members,
      {
        key: "add",
        label: "添加",
        kind: "add" as const,
        onClick: () => {
          setNotice("群成员添加能力需要后端补接口，当前先保留微信式入口。");
        },
      },
      {
        key: "remove",
        label: "移除",
        kind: "remove" as const,
        onClick: () => {
          setNotice("群成员移除能力需要后端补接口，当前先保留微信式入口。");
        },
      },
    ];
  }, [membersQuery.data]);

  return (
    <ChatDetailsShell
      title={groupQuery.data?.name ?? "群聊信息"}
      subtitle={
        membersQuery.data
          ? `${membersQuery.data.length} 人群聊`
          : "群聊信息"
      }
      onBack={() => {
        void navigate({ to: "/group/$groupId", params: { groupId } });
      }}
    >
      {groupQuery.isLoading || membersQuery.isLoading ? (
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
      {notice ? (
        <div className="px-3">
          <InlineNotice tone="info">{notice}</InlineNotice>
        </div>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <div className="px-3">
          <EmptyState title="群聊不存在" description="这个群聊暂时不可用，返回消息列表再试一次。" />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatMemberGrid items={memberItems} />

          <section className="border-y border-black/5 bg-white">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="群聊名称"
                value={groupQuery.data.name}
                onClick={() => {
                  const nextName = window.prompt("修改群聊名称", groupQuery.data.name);
                  if (!nextName || nextName.trim() === groupQuery.data.name) {
                    return;
                  }
                  updateGroupMutation.mutate({ name: nextName.trim() });
                }}
              />
              <ChatSettingRow
                label="群公告"
                value={groupQuery.data.announcement?.trim() || "暂无"}
                onClick={() => {
                  const nextAnnouncement = window.prompt(
                    "编辑群公告",
                    groupQuery.data.announcement ?? "",
                  );
                  if (nextAnnouncement === null) {
                    return;
                  }
                  updateGroupMutation.mutate({
                    announcement: nextAnnouncement.trim() || null,
                  });
                }}
              />
            </div>
          </section>

          <section className="border-y border-black/5 bg-white">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="查找聊天记录"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/search",
                    params: { groupId },
                  });
                }}
              />
            </div>
          </section>

          <section className="border-y border-black/5 bg-white">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="消息免打扰"
                checked={preferences.muted}
                onToggle={(checked) => {
                  setPreferences((current) => ({ ...current, muted: checked }));
                  setNotice(checked ? "已开启群消息免打扰。" : "已关闭群消息免打扰。");
                }}
              />
              <ChatSettingRow
                label="置顶聊天"
                checked={groupQuery.data.isPinned}
                onToggle={(checked) => pinMutation.mutate(checked)}
              />
              <ChatSettingRow
                label="保存到通讯录"
                value="暂不支持"
                onClick={() => {
                  setNotice("群聊保存到通讯录能力当前未接入，先保留微信式入口。");
                }}
              />
            </div>
          </section>

          <section className="border-y border-black/5 bg-white">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="我在本群的昵称"
                value={ownerMember?.memberName ?? "未设置"}
                onClick={() => {
                  const nextNickname = window.prompt(
                    "修改我在本群的昵称",
                    ownerMember?.memberName ?? "",
                  );
                  if (
                    !nextNickname ||
                    nextNickname.trim() === (ownerMember?.memberName ?? "")
                  ) {
                    return;
                  }
                  updateNicknameMutation.mutate(nextNickname.trim());
                }}
              />
              <ChatSettingRow
                label="显示群成员昵称"
                checked={preferences.showMemberNicknames}
                onToggle={(checked) => {
                  setPreferences((current) => ({
                    ...current,
                    showMemberNicknames: checked,
                  }));
                  setNotice(checked ? "已开启显示群成员昵称。" : "已关闭显示群成员昵称。");
                }}
              />
            </div>
          </section>

          <section className="border-y border-black/5 bg-white">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="聊天背景"
                value={`默认：${getChatBackgroundLabel(
                  ownerQuery.data?.defaultChatBackground,
                )}`}
                onClick={() => {
                  setNotice(
                    "群聊当前会跟随默认背景图。可先到任意单聊的“聊天背景”页设置默认背景。",
                  );
                }}
              />
            </div>
          </section>

          <section className="border-y border-black/5 bg-white">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="清空聊天记录"
                danger
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("确认清空这个群聊的聊天记录吗？")) {
                    return;
                  }
                  clearMutation.mutate();
                }}
              />
              <ChatSettingRow
                label="删除并退出"
                danger
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("删除并退出后，该群聊会从当前世界中移除。确认继续吗？")) {
                    return;
                  }
                  leaveMutation.mutate();
                }}
              />
            </div>
          </section>

          {updateGroupMutation.isError && updateGroupMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={updateGroupMutation.error.message} />
            </div>
          ) : null}
          {pinMutation.isError && pinMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={pinMutation.error.message} />
            </div>
          ) : null}
          {updateNicknameMutation.isError &&
          updateNicknameMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={updateNicknameMutation.error.message} />
            </div>
          ) : null}
          {clearMutation.isError && clearMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={clearMutation.error.message} />
            </div>
          ) : null}
          {leaveMutation.isError && leaveMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={leaveMutation.error.message} />
            </div>
          ) : null}
        </>
      ) : null}
    </ChatDetailsShell>
  );
}
