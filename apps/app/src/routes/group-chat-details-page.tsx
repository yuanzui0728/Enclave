import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  clearGroupMessages,
  getGroup,
  getGroupMembers,
  hideGroup,
  leaveGroup,
  setGroupPinned,
  updateGroup,
  updateGroupOwnerProfile,
  updateGroupPreferences,
} from "@yinjie/contracts";
import { ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { useDefaultChatBackground } from "../features/chat/backgrounds/use-conversation-background";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { ChatMemberGrid } from "../features/chat-details/chat-member-grid";
import { ChatSettingRow } from "../features/chat-details/chat-setting-row";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupChatDetailsPage() {
  const { groupId } = useParams({ from: "/group/$groupId/details" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [notice, setNotice] = useState<string | null>(null);
  const ownerQuery = useDefaultChatBackground();

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });

  const updateNameMutation = useMutation({
    mutationFn: (name: string) => updateGroup(groupId, { name }, baseUrl),
    onSuccess: async () => {
      setNotice("群聊名称已更新。");
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
    },
  });

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) =>
      setGroupPinned(groupId, { pinned }, baseUrl),
    onSuccess: async (_, pinned) => {
      setNotice(pinned ? "群聊已置顶。" : "群聊已取消置顶。");
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
    },
  });

  const preferencesMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateGroupPreferences>[1]) =>
      updateGroupPreferences(groupId, payload, baseUrl),
    onSuccess: async (_, payload) => {
      const nextNotice =
        payload.isMuted !== undefined
          ? payload.isMuted
            ? "已开启群消息免打扰。"
            : "已关闭群消息免打扰。"
          : payload.savedToContacts !== undefined
            ? payload.savedToContacts
              ? "已保存到通讯录。"
              : "已从通讯录移除。"
            : payload.showMemberNicknames !== undefined
              ? payload.showMemberNicknames
                ? "已开启显示群成员昵称。"
                : "已关闭显示群成员昵称。"
              : payload.notifyOnAtMe !== undefined
                ? payload.notifyOnAtMe
                  ? "开启了 @我 通知。"
                  : "关闭了 @我 通知。"
                : payload.notifyOnAtAll !== undefined
                  ? payload.notifyOnAtAll
                    ? "开启了 @所有人 通知。"
                    : "关闭了 @所有人 通知。"
                  : payload.notifyOnAnnouncement !== undefined
                    ? payload.notifyOnAnnouncement
                      ? "开启了群公告通知。"
                      : "关闭了群公告通知。"
                    : "群聊设置已更新。";

      setNotice(nextNotice);
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
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-saved-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveGroup(groupId, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-saved-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({ to: "/tabs/chat" });
    },
  });

  const hideMutation = useMutation({
    mutationFn: () => hideGroup(groupId, baseUrl),
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
          void navigate({
            to: "/group/$groupId/members/add",
            params: { groupId },
          });
        },
      },
      {
        key: "remove",
        label: "移除",
        kind: "remove" as const,
        onClick: () => {
          void navigate({
            to: "/group/$groupId/members/remove",
            params: { groupId },
          });
        },
      },
    ];
  }, [groupId, membersQuery.data, navigate]);

  const busy =
    updateNameMutation.isPending ||
    pinMutation.isPending ||
    preferencesMutation.isPending ||
    updateNicknameMutation.isPending ||
    clearMutation.isPending ||
    leaveMutation.isPending ||
    hideMutation.isPending;

  return (
    <ChatDetailsShell
      title={groupQuery.data?.name ?? "群聊信息"}
      subtitle={
        membersQuery.data ? `${membersQuery.data.length} 人群聊` : "群聊信息"
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
          <EmptyState
            title="群聊不存在"
            description="这个群聊暂时不可用，返回消息列表再试一次。"
          />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatDetailsSection title="群聊成员">
            <ChatMemberGrid items={memberItems} />
          </ChatDetailsSection>

          <ChatDetailsSection title="群聊资料">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="群聊名称"
                value={groupQuery.data.name}
                onClick={() => {
                  const nextName = window.prompt(
                    "修改群聊名称",
                    groupQuery.data.name,
                  );
                  if (!nextName || nextName.trim() === groupQuery.data.name) {
                    return;
                  }
                  updateNameMutation.mutate(nextName.trim());
                }}
              />
              <ChatSettingRow
                label="群公告"
                value={groupQuery.data.announcement?.trim() || "暂无"}
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/announcement",
                    params: { groupId },
                  });
                }}
              />
              <ChatSettingRow
                label="群二维码"
                value="查看邀请卡"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/qr",
                    params: { groupId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天记录">
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
          </ChatDetailsSection>

          <ChatDetailsSection title="消息设置">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="消息免打扰"
                checked={groupQuery.data.isMuted}
                onToggle={(checked) => {
                  preferencesMutation.mutate({ isMuted: checked });
                }}
              />
              {groupQuery.data.isMuted ? (
                <>
                  <ChatSettingRow
                    label="@我仍通知"
                    checked={groupQuery.data.notifyOnAtMe}
                    onToggle={(checked) => {
                      preferencesMutation.mutate({ notifyOnAtMe: checked });
                    }}
                  />
                  <ChatSettingRow
                    label="@所有人仍通知"
                    checked={groupQuery.data.notifyOnAtAll}
                    onToggle={(checked) => {
                      preferencesMutation.mutate({ notifyOnAtAll: checked });
                    }}
                  />
                  <ChatSettingRow
                    label="群公告仍通知"
                    checked={groupQuery.data.notifyOnAnnouncement}
                    onToggle={(checked) => {
                      preferencesMutation.mutate({
                        notifyOnAnnouncement: checked,
                      });
                    }}
                  />
                </>
              ) : null}
              <ChatSettingRow
                label="置顶聊天"
                checked={groupQuery.data.isPinned}
                onToggle={(checked) => pinMutation.mutate(checked)}
              />
              <ChatSettingRow
                label="保存到通讯录"
                checked={groupQuery.data.savedToContacts}
                onToggle={(checked) => {
                  preferencesMutation.mutate({ savedToContacts: checked });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="群内资料">
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
                checked={groupQuery.data.showMemberNicknames}
                onToggle={(checked) => {
                  preferencesMutation.mutate({
                    showMemberNicknames: checked,
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天背景">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="聊天背景"
                value={getChatBackgroundLabel(
                  ownerQuery.data?.defaultChatBackground,
                )}
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/background",
                    params: { groupId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="危险操作">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="隐藏聊天"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "确认将该群聊从消息列表中隐藏吗？有新消息时会再次出现。",
                    )
                  ) {
                    return;
                  }
                  hideMutation.mutate();
                }}
              />
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
                  if (
                    !window.confirm(
                      "删除并退出后，该群聊会从当前世界中移除。确认继续吗？",
                    )
                  ) {
                    return;
                  }
                  leaveMutation.mutate();
                }}
              />
            </div>
          </ChatDetailsSection>

          {updateNameMutation.isError &&
          updateNameMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={updateNameMutation.error.message} />
            </div>
          ) : null}
          {pinMutation.isError && pinMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={pinMutation.error.message} />
            </div>
          ) : null}
          {preferencesMutation.isError &&
          preferencesMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={preferencesMutation.error.message} />
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
          {hideMutation.isError && hideMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={hideMutation.error.message} />
            </div>
          ) : null}
        </>
      ) : null}
    </ChatDetailsShell>
  );
}
