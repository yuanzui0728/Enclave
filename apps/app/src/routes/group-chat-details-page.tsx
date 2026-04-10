import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  clearGroupMessages,
  getGroup,
  getGroupMembers,
  hideGroup,
  leaveGroup,
  setGroupPinned,
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
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupChatDetailsPage() {
  const { groupId } = useParams({ from: "/group/$groupId/details" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [notice, setNotice] = useState<string | null>(null);
  const [memberGridExpanded, setMemberGridExpanded] = useState(false);
  const [managementSheetOpen, setManagementSheetOpen] = useState(false);
  const [dangerSheetAction, setDangerSheetAction] = useState<
    "hide" | "clear" | "leave" | null
  >(null);
  const ownerQuery = useDefaultChatBackground();

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });

  useEffect(() => {
    setMemberGridExpanded(false);
    setManagementSheetOpen(false);
    setDangerSheetAction(null);
  }, [groupId]);

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
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
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
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({ to: "/tabs/chat" });
    },
  });

  const visibleMemberCount = memberGridExpanded
    ? undefined
    : COLLAPSED_MEMBER_PREVIEW_COUNT;
  const ownerMember = useMemo(
    () =>
      (membersQuery.data ?? []).find(
        (item) => item.role === "owner" && item.memberType === "user",
      ),
    [membersQuery.data],
  );
  const totalMemberCount = membersQuery.data?.length ?? 0;
  const ownerDisplayName = ownerMember?.memberName?.trim() || "我";

  const memberItems = useMemo(() => {
    const members = (membersQuery.data ?? []).slice(
      0,
      visibleMemberCount,
    );

    return [
      ...members.map((member) => ({
        key: member.id,
        label: member.memberName ?? member.memberId,
        src: member.memberAvatar,
      })),
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
  }, [groupId, membersQuery.data, navigate, visibleMemberCount]);

  const hasCollapsedMembers =
    totalMemberCount > COLLAPSED_MEMBER_PREVIEW_COUNT;
  const dangerSheetConfig =
    dangerSheetAction === "hide"
      ? {
          title: "隐藏聊天",
          description: "该群聊会先从消息列表中隐藏，收到新消息后会再次出现。",
          confirmLabel: "隐藏聊天",
          confirmDescription: "不删除聊天记录",
          confirmDanger: false,
          onConfirm: () => hideMutation.mutate(),
        }
      : dangerSheetAction === "clear"
        ? {
            title: "清空聊天记录",
            description: "仅清空当前群聊历史消息，群成员和群资料会继续保留。",
            confirmLabel: "清空聊天记录",
            confirmDescription: "此操作不可恢复",
            confirmDanger: true,
            onConfirm: () => clearMutation.mutate(),
          }
        : dangerSheetAction === "leave"
          ? {
              title: "删除并退出",
              description:
                "删除并退出后，该群聊会从当前世界中移除，后续需要重新建群才能继续使用。",
              confirmLabel: "删除并退出",
              confirmDescription: "该群聊会被移除",
              confirmDanger: true,
              onConfirm: () => leaveMutation.mutate(),
            }
          : null;

  const busy =
    pinMutation.isPending ||
    preferencesMutation.isPending ||
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
          <ChatDetailsSection title="群聊成员" variant="wechat">
            <ChatMemberGrid items={memberItems} variant="wechat" />
            {hasCollapsedMembers || memberGridExpanded ? (
              <button
                type="button"
                onClick={() => setMemberGridExpanded((current) => !current)}
                className="flex min-h-12 w-full items-center justify-center border-t border-black/5 px-4 text-[15px] text-[#576b95]"
              >
                {memberGridExpanded ? "收起群成员" : "查看更多群成员"}
              </button>
            ) : null}
          </ChatDetailsSection>

          <ChatDetailsSection title="群管理" variant="wechat">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="群主"
                value={ownerDisplayName}
                variant="wechat"
              />
              <ChatSettingRow
                label="全部群成员"
                value={`${totalMemberCount} 人`}
                variant="wechat"
                onClick={() => {
                  if (!hasCollapsedMembers) {
                    setNotice(`当前群聊共有 ${totalMemberCount} 位成员。`);
                    return;
                  }
                  setMemberGridExpanded(true);
                  setNotice(`已展开全部 ${totalMemberCount} 位群成员。`);
                }}
              />
              <ChatSettingRow
                label="群管理"
                value="成员与资料"
                variant="wechat"
                onClick={() => setManagementSheetOpen(true)}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="群聊资料" variant="wechat">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="群聊名称"
                value={groupQuery.data.name}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/edit/name",
                    params: { groupId },
                  });
                }}
              />
              <ChatSettingRow
                label="群公告"
                value={groupQuery.data.announcement?.trim() || "暂无"}
                variant="wechat"
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
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/qr",
                    params: { groupId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天记录" variant="wechat">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="查找聊天记录"
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/search",
                    params: { groupId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="消息设置" variant="wechat">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="消息免打扰"
                variant="wechat"
                checked={groupQuery.data.isMuted}
                onToggle={(checked) => {
                  preferencesMutation.mutate({ isMuted: checked });
                }}
              />
              {groupQuery.data.isMuted ? (
                <>
                  <ChatSettingRow
                    label="@我仍通知"
                    variant="wechat"
                    checked={groupQuery.data.notifyOnAtMe}
                    onToggle={(checked) => {
                      preferencesMutation.mutate({ notifyOnAtMe: checked });
                    }}
                  />
                  <ChatSettingRow
                    label="@所有人仍通知"
                    variant="wechat"
                    checked={groupQuery.data.notifyOnAtAll}
                    onToggle={(checked) => {
                      preferencesMutation.mutate({ notifyOnAtAll: checked });
                    }}
                  />
                  <ChatSettingRow
                    label="群公告仍通知"
                    variant="wechat"
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
                variant="wechat"
                checked={groupQuery.data.isPinned}
                onToggle={(checked) => pinMutation.mutate(checked)}
              />
              <ChatSettingRow
                label="保存到通讯录"
                variant="wechat"
                checked={groupQuery.data.savedToContacts}
                onToggle={(checked) => {
                  preferencesMutation.mutate({ savedToContacts: checked });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="群内资料" variant="wechat">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="我在本群的昵称"
                value={ownerMember?.memberName ?? "未设置"}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/edit/nickname",
                    params: { groupId },
                  });
                }}
              />
              <ChatSettingRow
                label="显示群成员昵称"
                variant="wechat"
                checked={groupQuery.data.showMemberNicknames}
                onToggle={(checked) => {
                  preferencesMutation.mutate({
                    showMemberNicknames: checked,
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天背景" variant="wechat">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="聊天背景"
                value={getChatBackgroundLabel(
                  ownerQuery.data?.defaultChatBackground,
                )}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/background",
                    params: { groupId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="危险操作" variant="wechat">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="隐藏聊天"
                disabled={busy}
                variant="wechat"
                onClick={() => setDangerSheetAction("hide")}
              />
              <ChatSettingRow
                label="清空聊天记录"
                danger
                disabled={busy}
                variant="wechat"
                onClick={() => setDangerSheetAction("clear")}
              />
              <ChatSettingRow
                label="删除并退出"
                danger
                disabled={busy}
                variant="wechat"
                onClick={() => setDangerSheetAction("leave")}
              />
            </div>
          </ChatDetailsSection>

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

          <MobileDetailsActionSheet
            open={managementSheetOpen}
            title="群管理"
            description={`${ownerDisplayName} 可快速管理成员、公告和群资料。`}
            onClose={() => setManagementSheetOpen(false)}
            actions={[
              {
                key: "expand-members",
                label: memberGridExpanded
                  ? "收起成员列表"
                  : hasCollapsedMembers
                    ? "查看全部群成员"
                    : "已显示全部群成员",
                description: memberGridExpanded
                  ? "回到紧凑预览状态"
                  : `当前共 ${totalMemberCount} 人`,
                disabled: !memberGridExpanded && !hasCollapsedMembers,
                onClick: () => {
                  setManagementSheetOpen(false);
                  if (!memberGridExpanded && !hasCollapsedMembers) {
                    return;
                  }
                  setMemberGridExpanded((current) => !current);
                },
              },
              {
                key: "add-member",
                label: "添加成员",
                description: "继续把联系人拉进当前群聊",
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/members/add",
                    params: { groupId },
                  });
                },
              },
              {
                key: "remove-member",
                label: "移除成员",
                description: "选择需要移出群聊的成员",
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/members/remove",
                    params: { groupId },
                  });
                },
              },
              {
                key: "announcement",
                label: "编辑群公告",
                description: "发布或修改群内置顶公告",
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/announcement",
                    params: { groupId },
                  });
                },
              },
              {
                key: "qr",
                label: "查看群二维码",
                description: "打开邀请卡与分享入口",
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/qr",
                    params: { groupId },
                  });
                },
              },
            ]}
          />

          <MobileDetailsActionSheet
            open={dangerSheetConfig !== null}
            title={dangerSheetConfig?.title ?? ""}
            description={dangerSheetConfig?.description}
            onClose={() => setDangerSheetAction(null)}
            actions={
              dangerSheetConfig
                ? [
                    {
                      key: "confirm",
                      label: dangerSheetConfig.confirmLabel,
                      description: dangerSheetConfig.confirmDescription,
                      danger: dangerSheetConfig.confirmDanger,
                      disabled: busy,
                      onClick: () => {
                        setDangerSheetAction(null);
                        dangerSheetConfig.onConfirm();
                      },
                    },
                  ]
                : []
            }
          />
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

const COLLAPSED_MEMBER_PREVIEW_COUNT = 13;
