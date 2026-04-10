import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  addGroupMember,
  blockCharacter,
  clearConversationHistory,
  clearGroupMessages,
  createModerationReport,
  getBlockedCharacters,
  getCharacter,
  getFriends,
  getGroup,
  getGroupMembers,
  hideConversation,
  hideGroup,
  leaveGroup,
  removeGroupMember,
  sendFriendRequest,
  setConversationMuted,
  setConversationPinned,
  setGroupPinned,
  updateGroup,
  updateGroupOwnerProfile,
  updateGroupPreferences,
  type ConversationListItem,
} from "@yinjie/contracts";
import { ChevronRight, Search } from "lucide-react";
import { ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import { DesktopChatConfirmDialog } from "./desktop-chat-confirm-dialog";
import { DesktopChatTextEditDialog } from "./desktop-chat-text-edit-dialog";
import { buildDesktopChatFilesRouteHash } from "./desktop-chat-files-route-state";
import { DesktopGroupMemberPicker } from "./desktop-group-member-picker";
import { DesktopGroupMemberRemovalPicker } from "./desktop-group-member-removal-picker";
import { getChatBackgroundLabel } from "../../chat/backgrounds/chat-background-helpers";
import {
  useConversationBackground,
  useDefaultChatBackground,
} from "../../chat/backgrounds/use-conversation-background";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";

type DesktopChatDetailsPanelProps = {
  conversation: ConversationListItem;
  onOpenHistory: () => void;
};

type DesktopMemberGridItem = {
  key: string;
  label: string;
  src?: string | null;
  kind?: "member" | "add" | "remove";
  onClick?: () => void;
};

type GroupDetailsEditorMode = "name" | "announcement" | "nickname";

type GroupDetailsEditorConfig = {
  title: string;
  description: string;
  placeholder: string;
  initialValue: string;
  multiline: boolean;
  emptyAllowed: boolean;
  pending: boolean;
  onConfirm: (value: string) => void;
};

type DirectDetailsConfirmAction = "hide" | "clear" | "report" | "block";

type GroupDetailsConfirmAction = "hide" | "clear" | "leave";

export function DesktopChatDetailsPanel({
  conversation,
  onOpenHistory,
}: DesktopChatDetailsPanelProps) {
  if (isPersistedGroupConversation(conversation)) {
    return (
      <GroupChatDetailsPanel
        conversation={conversation}
        onOpenHistory={onOpenHistory}
      />
    );
  }

  return (
    <DirectChatDetailsPanel
      conversation={conversation}
      onOpenHistory={onOpenHistory}
    />
  );
}

function DirectChatDetailsPanel({
  conversation,
  onOpenHistory,
}: DesktopChatDetailsPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username) ?? "我";
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<DirectDetailsConfirmAction | null>(null);
  const backgroundQuery = useConversationBackground(conversation.id);
  const targetCharacterId = conversation.participants[0] ?? "";

  useEffect(() => {
    setNotice(null);
    setConfirmAction(null);
  }, [conversation.id]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, targetCharacterId],
    queryFn: () => getCharacter(targetCharacterId, baseUrl),
    enabled: Boolean(targetCharacterId),
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const blockedQuery = useQuery({
    queryKey: ["app-chat-details-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(targetCharacterId),
  });

  const targetCharacter = characterQuery.data;
  const isFriend = (friendsQuery.data ?? []).some(
    (item) => item.character.id === targetCharacterId,
  );
  const isBlocked = (blockedQuery.data ?? []).some(
    (item) => item.characterId === targetCharacterId,
  );
  const backgroundLabel = getChatBackgroundLabel(
    backgroundQuery.data?.effectiveBackground ?? null,
  );

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) =>
      setConversationPinned(conversation.id, { pinned }, baseUrl),
    onSuccess: async (_, pinned) => {
      setNotice(pinned ? "聊天已置顶。" : "聊天已取消置顶。");
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });

  const muteMutation = useMutation({
    mutationFn: (muted: boolean) =>
      setConversationMuted(conversation.id, { muted }, baseUrl),
    onSuccess: async (_, muted) => {
      setNotice(muted ? "已开启消息免打扰。" : "已关闭消息免打扰。");
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });

  const saveToContactsMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return sendFriendRequest(
        {
          characterId: targetCharacterId,
          greeting: `${ownerName} 想把你加到通讯录里。`,
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      setNotice("已发起添加到通讯录请求。");
      await queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearConversationHistory(conversation.id, baseUrl),
    onSuccess: async () => {
      setNotice("聊天记录已清空。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-messages", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const hideMutation = useMutation({
    mutationFn: () => hideConversation(conversation.id, baseUrl),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      void navigate({ to: "/tabs/chat" });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return createModerationReport(
        {
          targetType: "character",
          targetId: targetCharacterId,
          reason: "桌面聊天信息面板举报",
          details: `来自会话 ${conversation.id}`,
        },
        baseUrl,
      );
    },
    onSuccess: () => {
      setNotice("已提交投诉。");
    },
  });

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return blockCharacter(
        {
          characterId: targetCharacterId,
          reason: "来自桌面聊天信息面板加入黑名单",
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      setNotice("已加入黑名单。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-chat-details-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-chat-blocked-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({ to: "/tabs/chat" });
    },
  });

  const memberItems: DesktopMemberGridItem[] = [
    {
      key: "owner",
      label: ownerName,
      src: ownerAvatar,
    },
    {
      key: targetCharacterId || conversation.title,
      label: targetCharacter?.name ?? conversation.title,
      src: targetCharacter?.avatar,
    },
    {
      key: "add",
      label: "发起群聊",
      kind: "add",
      onClick: () => {
        void navigate({ to: "/group/new" });
      },
    },
  ];
  const busy =
    pinMutation.isPending ||
    muteMutation.isPending ||
    saveToContactsMutation.isPending ||
    clearMutation.isPending ||
    hideMutation.isPending ||
    reportMutation.isPending ||
    blockMutation.isPending;
  const activeConfirm =
    confirmAction === "hide"
      ? {
          title: "隐藏聊天",
          description:
            "确认将这段聊天从消息列表中隐藏吗？有新消息时会再次出现。",
          confirmLabel: "隐藏聊天",
          pendingLabel: "正在隐藏...",
          onConfirm: () => {
            setConfirmAction(null);
            hideMutation.mutate();
          },
        }
      : confirmAction === "clear"
        ? {
            title: "清空聊天记录",
            description: "确认清空这段聊天记录吗？此操作只影响当前会话视图。",
            confirmLabel: "清空记录",
            pendingLabel: "正在清空...",
            danger: true,
            onConfirm: () => {
              setConfirmAction(null);
              clearMutation.mutate();
            },
          }
        : confirmAction === "report"
          ? {
              title: "提交投诉",
              description:
                "确认提交投诉吗？系统会记录当前会话上下文用于后续处理。",
              confirmLabel: "提交投诉",
              pendingLabel: "正在提交...",
              danger: true,
              onConfirm: () => {
                setConfirmAction(null);
                reportMutation.mutate();
              },
            }
          : confirmAction === "block"
            ? {
                title: "加入黑名单",
                description:
                  "加入黑名单后，将不再接收该角色的互动。确认继续吗？",
                confirmLabel: "加入黑名单",
                pendingLabel: "正在加入...",
                danger: true,
                onConfirm: () => {
                  setConfirmAction(null);
                  blockMutation.mutate();
                },
              }
            : null;

  return (
    <div className="space-y-3 p-3">
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {characterQuery.isError && characterQuery.error instanceof Error ? (
        <ErrorBlock message={characterQuery.error.message} />
      ) : null}
      {friendsQuery.isError && friendsQuery.error instanceof Error ? (
        <ErrorBlock message={friendsQuery.error.message} />
      ) : null}
      {blockedQuery.isError && blockedQuery.error instanceof Error ? (
        <ErrorBlock message={blockedQuery.error.message} />
      ) : null}

      <DesktopPanelSection>
        <div className="flex items-center gap-3 px-4 py-4">
          <AvatarChip
            name={targetCharacter?.name ?? conversation.title}
            src={targetCharacter?.avatar}
            size="wechat"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
              {targetCharacter?.name ?? conversation.title}
            </div>
            <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
              {targetCharacter?.relationship ?? "联系人"}
            </div>
          </div>
        </div>
      </DesktopPanelSection>

      <DesktopPanelSection title="聊天成员">
        <DesktopMemberGrid items={memberItems} />
      </DesktopPanelSection>

      <DesktopPanelSection title="常用">
        <DesktopPanelRow
          label="查找聊天记录"
          icon={<Search size={15} />}
          onClick={onOpenHistory}
        />
        <DesktopPanelRow
          label="聊天文件"
          onClick={() => {
            void navigate({
              to: "/desktop/chat-files",
              hash: buildDesktopChatFilesRouteHash(conversation.id),
            });
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection title="设置">
        <DesktopPanelRow
          label="消息免打扰"
          checked={conversation.isMuted}
          disabled={busy}
          onToggle={(checked) => muteMutation.mutate(checked)}
        />
        <DesktopPanelRow
          label="置顶聊天"
          checked={conversation.isPinned}
          disabled={busy}
          onToggle={(checked) => pinMutation.mutate(checked)}
        />
        <DesktopPanelRow
          label="添加到通讯录"
          value={isFriend ? "已添加" : "添加"}
          disabled={busy || isFriend || !targetCharacterId}
          onClick={() => saveToContactsMutation.mutate()}
        />
        <DesktopPanelRow
          label="设置当前聊天背景"
          value={backgroundLabel}
          onClick={() => {
            void navigate({
              to: "/chat/$conversationId/background",
              params: { conversationId: conversation.id },
            });
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection title="更多">
        <DesktopPanelRow
          label="隐藏聊天"
          disabled={busy}
          onClick={() => setConfirmAction("hide")}
        />
        <DesktopPanelRow
          label="清空聊天记录"
          danger
          disabled={busy}
          onClick={() => setConfirmAction("clear")}
        />
        <DesktopPanelRow
          label="投诉"
          danger
          disabled={busy || !targetCharacterId}
          onClick={() => setConfirmAction("report")}
        />
        <DesktopPanelRow
          label="加入黑名单"
          value={isBlocked ? "已加入" : undefined}
          disabled={busy || isBlocked || !targetCharacterId}
          danger
          onClick={() => setConfirmAction("block")}
        />
      </DesktopPanelSection>

      {pinMutation.isError && pinMutation.error instanceof Error ? (
        <ErrorBlock message={pinMutation.error.message} />
      ) : null}
      {muteMutation.isError && muteMutation.error instanceof Error ? (
        <ErrorBlock message={muteMutation.error.message} />
      ) : null}
      {saveToContactsMutation.isError &&
      saveToContactsMutation.error instanceof Error ? (
        <ErrorBlock message={saveToContactsMutation.error.message} />
      ) : null}
      {hideMutation.isError && hideMutation.error instanceof Error ? (
        <ErrorBlock message={hideMutation.error.message} />
      ) : null}
      {clearMutation.isError && clearMutation.error instanceof Error ? (
        <ErrorBlock message={clearMutation.error.message} />
      ) : null}
      {reportMutation.isError && reportMutation.error instanceof Error ? (
        <ErrorBlock message={reportMutation.error.message} />
      ) : null}
      {blockMutation.isError && blockMutation.error instanceof Error ? (
        <ErrorBlock message={blockMutation.error.message} />
      ) : null}
      <DesktopChatConfirmDialog
        open={Boolean(activeConfirm)}
        title={activeConfirm?.title ?? ""}
        description={activeConfirm?.description ?? ""}
        confirmLabel={activeConfirm?.confirmLabel}
        pendingLabel={activeConfirm?.pendingLabel}
        danger={activeConfirm?.danger}
        pending={busy}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => activeConfirm?.onConfirm()}
      />
    </div>
  );
}

function GroupChatDetailsPanel({
  conversation,
  onOpenHistory,
}: DesktopChatDetailsPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerQuery = useDefaultChatBackground();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<GroupDetailsConfirmAction | null>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberPickerMode, setMemberPickerMode] = useState<"add" | "remove">(
    "add",
  );
  const [editorMode, setEditorMode] = useState<GroupDetailsEditorMode | null>(
    null,
  );

  useEffect(() => {
    setNotice(null);
    setConfirmAction(null);
    setMemberPickerOpen(false);
    setMemberPickerMode("add");
    setEditorMode(null);
  }, [conversation.id]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, conversation.id],
    queryFn: () => getGroup(conversation.id, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, conversation.id],
    queryFn: () => getGroupMembers(conversation.id, baseUrl),
  });

  const backgroundLabel = getChatBackgroundLabel(
    ownerQuery.data?.defaultChatBackground ?? null,
  );

  const updateGroupMutation = useMutation({
    mutationFn: (payload: { name?: string; announcement?: string | null }) =>
      updateGroup(conversation.id, payload, baseUrl),
    onSuccess: async (_, payload) => {
      setEditorMode(null);
      setNotice(payload.name ? "群聊名称已更新。" : "群公告已更新。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
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
      setGroupPinned(conversation.id, { pinned }, baseUrl),
    onSuccess: async (_, pinned) => {
      setNotice(pinned ? "群聊已置顶。" : "群聊已取消置顶。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
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
      updateGroupPreferences(conversation.id, payload, baseUrl),
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
          queryKey: ["app-group", baseUrl, conversation.id],
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
      updateGroupOwnerProfile(conversation.id, { nickname }, baseUrl),
    onSuccess: async () => {
      setEditorMode(null);
      setNotice("我在本群的昵称已更新。");
      await queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, conversation.id],
      });
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      for (const memberId of memberIds) {
        await addGroupMember(
          conversation.id,
          {
            memberId,
            memberType: "character",
          },
          baseUrl,
        );
      }
    },
    onSuccess: async (_, memberIds) => {
      setNotice(
        memberIds.length === 1
          ? "已添加 1 位群成员。"
          : `已添加 ${memberIds.length} 位群成员。`,
      );
      setMemberPickerOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearGroupMessages(conversation.id, baseUrl),
    onSuccess: async () => {
      setNotice("群聊记录已清空。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const removeMembersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      await Promise.all(
        memberIds.map((memberId) =>
          removeGroupMember(conversation.id, memberId, baseUrl),
        ),
      );
    },
    onSuccess: async (_, memberIds) => {
      setNotice(
        memberIds.length === 1
          ? "已移除 1 位群成员。"
          : `已移除 ${memberIds.length} 位群成员。`,
      );
      setMemberPickerOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const hideMutation = useMutation({
    mutationFn: () => hideGroup(conversation.id, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({ to: "/tabs/chat" });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveGroup(conversation.id, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, conversation.id],
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

  const removableMembers = useMemo(
    () =>
      (membersQuery.data ?? [])
        .filter((item) => item.memberType === "character")
        .map((item) => ({
          id: item.memberId,
          name: item.memberName ?? item.memberId,
          subtitle: item.role === "admin" ? "管理员" : "群成员",
          avatar: item.memberAvatar,
        })),
    [membersQuery.data],
  );

  const memberItems: DesktopMemberGridItem[] = [
    ...(membersQuery.data ?? []).slice(0, 8).map((member) => ({
      key: member.id,
      label: member.memberName ?? member.memberId,
      src: member.memberAvatar,
    })),
    {
      key: "add",
      label: "添加",
      kind: "add" as const,
      onClick: () => {
        setMemberPickerMode("add");
        setMemberPickerOpen(true);
      },
    },
    {
      key: "remove",
      label: "移除",
      kind: "remove" as const,
      onClick: () => {
        setMemberPickerMode("remove");
        setMemberPickerOpen(true);
      },
    },
  ];
  const group = groupQuery.data;
  const isMuted = group?.isMuted ?? conversation.isMuted;
  const busy =
    updateGroupMutation.isPending ||
    pinMutation.isPending ||
    preferencesMutation.isPending ||
    updateNicknameMutation.isPending ||
    addMembersMutation.isPending ||
    removeMembersMutation.isPending ||
    hideMutation.isPending ||
    clearMutation.isPending ||
    leaveMutation.isPending;
  const activeEditor: GroupDetailsEditorConfig | null =
    editorMode === "name"
      ? {
          title: "修改群聊名称",
          description: "桌面端直接编辑群聊名称，替代浏览器原生提示框。",
          placeholder: "请输入群聊名称",
          initialValue: group?.name ?? conversation.title,
          multiline: false,
          emptyAllowed: false,
          pending: updateGroupMutation.isPending,
          onConfirm: (value: string) =>
            updateGroupMutation.mutate({ name: value }),
        }
      : editorMode === "announcement"
        ? {
            title: "修改群公告",
            description: "支持换行；留空后保存会清空当前群公告。",
            placeholder: "输入群公告内容",
            initialValue: group?.announcement ?? "",
            multiline: true,
            emptyAllowed: true,
            pending: updateGroupMutation.isPending,
            onConfirm: (value: string) =>
              updateGroupMutation.mutate({
                announcement: value || null,
              }),
          }
        : editorMode === "nickname"
          ? {
              title: "修改我在本群的昵称",
              description: "这个昵称会显示在群成员资料里。",
              placeholder: "请输入群昵称",
              initialValue: ownerMember?.memberName ?? "",
              multiline: false,
              emptyAllowed: false,
              pending: updateNicknameMutation.isPending,
              onConfirm: (value: string) => updateNicknameMutation.mutate(value),
            }
          : null;
  const activeConfirm =
    confirmAction === "hide"
      ? {
          title: "隐藏聊天",
          description:
            "确认将该群聊从消息列表中隐藏吗？有新消息时会再次出现。",
          confirmLabel: "隐藏聊天",
          pendingLabel: "正在隐藏...",
          onConfirm: () => {
            setConfirmAction(null);
            hideMutation.mutate();
          },
        }
      : confirmAction === "clear"
        ? {
            title: "清空聊天记录",
            description:
              "确认清空这个群聊的聊天记录吗？此操作只影响当前群会话视图。",
            confirmLabel: "清空记录",
            pendingLabel: "正在清空...",
            danger: true,
            onConfirm: () => {
              setConfirmAction(null);
              clearMutation.mutate();
            },
          }
        : confirmAction === "leave"
          ? {
              title: "删除并退出",
              description:
                "删除并退出后，该群聊会从当前世界中移除。确认继续吗？",
              confirmLabel: "删除并退出",
              pendingLabel: "正在退出...",
              danger: true,
              onConfirm: () => {
                setConfirmAction(null);
                leaveMutation.mutate();
              },
            }
          : null;

  return (
    <div className="space-y-3 p-3">
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <ErrorBlock message={groupQuery.error.message} />
      ) : null}
      {membersQuery.isError && membersQuery.error instanceof Error ? (
        <ErrorBlock message={membersQuery.error.message} />
      ) : null}
      {addMembersMutation.isError &&
      addMembersMutation.error instanceof Error ? (
        <ErrorBlock message={addMembersMutation.error.message} />
      ) : null}
      {removeMembersMutation.isError &&
      removeMembersMutation.error instanceof Error ? (
        <ErrorBlock message={removeMembersMutation.error.message} />
      ) : null}

      <DesktopPanelSection>
        <div className="flex items-center gap-3 px-4 py-4">
          <GroupAvatarChip
            name={groupQuery.data?.name ?? conversation.title}
            members={conversation.participants}
            size="wechat"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
              {groupQuery.data?.name ?? conversation.title}
            </div>
            <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
              {(membersQuery.data ?? []).length} 人群聊
            </div>
          </div>
        </div>
      </DesktopPanelSection>

      <DesktopPanelSection title="群成员">
        {membersQuery.isLoading ? (
          <div className="px-4 py-4">
            <LoadingBlock label="正在读取群成员..." />
          </div>
        ) : (
          <DesktopMemberGrid items={memberItems} />
        )}
      </DesktopPanelSection>

      <DesktopPanelSection title="群资料">
        <DesktopPanelRow
          label="群聊名称"
          value={groupQuery.data?.name ?? conversation.title}
          disabled={busy}
          onClick={() => setEditorMode("name")}
        />
        <DesktopPanelRow
          label="群公告"
          value={groupQuery.data?.announcement?.trim() || "未设置"}
          disabled={busy}
          onClick={() => setEditorMode("announcement")}
        />
        <DesktopPanelRow
          label="群二维码"
          value="查看邀请卡"
          onClick={() => {
            void navigate({
              to: "/group/$groupId/qr",
              params: { groupId: conversation.id },
            });
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection title="常用">
        <DesktopPanelRow
          label="查找聊天记录"
          icon={<Search size={15} />}
          onClick={onOpenHistory}
        />
        <DesktopPanelRow
          label="聊天文件"
          onClick={() => {
            void navigate({
              to: "/desktop/chat-files",
              hash: buildDesktopChatFilesRouteHash(conversation.id),
            });
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection title="设置">
        <DesktopPanelRow
          label="消息免打扰"
          checked={isMuted}
          disabled={busy || !group}
          onToggle={(checked) => preferencesMutation.mutate({ isMuted: checked })}
        />
        {isMuted ? (
          <>
            <DesktopPanelRow
              label="@我仍通知"
              checked={group?.notifyOnAtMe ?? true}
              disabled={busy || !group}
              onToggle={(checked) =>
                preferencesMutation.mutate({ notifyOnAtMe: checked })
              }
            />
            <DesktopPanelRow
              label="@所有人仍通知"
              checked={group?.notifyOnAtAll ?? true}
              disabled={busy || !group}
              onToggle={(checked) =>
                preferencesMutation.mutate({ notifyOnAtAll: checked })
              }
            />
            <DesktopPanelRow
              label="群公告仍通知"
              checked={group?.notifyOnAnnouncement ?? true}
              disabled={busy || !group}
              onToggle={(checked) =>
                preferencesMutation.mutate({
                  notifyOnAnnouncement: checked,
                })
              }
            />
          </>
        ) : null}
        <DesktopPanelRow
          label="置顶聊天"
          checked={group?.isPinned ?? conversation.isPinned}
          disabled={busy || !group}
          onToggle={(checked) => pinMutation.mutate(checked)}
        />
        <DesktopPanelRow
          label="保存到通讯录"
          checked={group?.savedToContacts ?? false}
          disabled={busy || !group}
          onToggle={(checked) =>
            preferencesMutation.mutate({ savedToContacts: checked })
          }
        />
        <DesktopPanelRow
          label="我在本群的昵称"
          value={ownerMember?.memberName ?? "未设置"}
          disabled={busy}
          onClick={() => setEditorMode("nickname")}
        />
        <DesktopPanelRow
          label="显示群成员昵称"
          checked={group?.showMemberNicknames ?? true}
          disabled={busy || !group}
          onToggle={(checked) =>
            preferencesMutation.mutate({ showMemberNicknames: checked })
          }
        />
        <DesktopPanelRow
          label="聊天背景"
          value={backgroundLabel}
          onClick={() => {
            void navigate({
              to: "/group/$groupId/background",
              params: { groupId: conversation.id },
            });
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection title="更多">
        <DesktopPanelRow
          label="隐藏聊天"
          disabled={busy}
          onClick={() => setConfirmAction("hide")}
        />
        <DesktopPanelRow
          label="清空聊天记录"
          danger
          disabled={busy}
          onClick={() => setConfirmAction("clear")}
        />
        <DesktopPanelRow
          label="删除并退出"
          danger
          disabled={busy}
          onClick={() => setConfirmAction("leave")}
        />
      </DesktopPanelSection>

      {updateGroupMutation.isError &&
      updateGroupMutation.error instanceof Error ? (
        <ErrorBlock message={updateGroupMutation.error.message} />
      ) : null}
      {pinMutation.isError && pinMutation.error instanceof Error ? (
        <ErrorBlock message={pinMutation.error.message} />
      ) : null}
      {preferencesMutation.isError &&
      preferencesMutation.error instanceof Error ? (
        <ErrorBlock message={preferencesMutation.error.message} />
      ) : null}
      {updateNicknameMutation.isError &&
      updateNicknameMutation.error instanceof Error ? (
        <ErrorBlock message={updateNicknameMutation.error.message} />
      ) : null}
      {hideMutation.isError && hideMutation.error instanceof Error ? (
        <ErrorBlock message={hideMutation.error.message} />
      ) : null}
      {clearMutation.isError && clearMutation.error instanceof Error ? (
        <ErrorBlock message={clearMutation.error.message} />
      ) : null}
      {leaveMutation.isError && leaveMutation.error instanceof Error ? (
        <ErrorBlock message={leaveMutation.error.message} />
      ) : null}

      <DesktopGroupMemberPicker
        open={memberPickerOpen && memberPickerMode === "add"}
        groupName={groupQuery.data?.name ?? conversation.title}
        existingMemberIds={(membersQuery.data ?? []).map(
          (item) => item.memberId,
        )}
        pending={addMembersMutation.isPending}
        onClose={() => setMemberPickerOpen(false)}
        onConfirm={(memberIds) => addMembersMutation.mutate(memberIds)}
      />
      <DesktopGroupMemberRemovalPicker
        open={memberPickerOpen && memberPickerMode === "remove"}
        groupName={groupQuery.data?.name ?? conversation.title}
        removableMembers={removableMembers}
        pending={removeMembersMutation.isPending}
        onClose={() => setMemberPickerOpen(false)}
        onConfirm={(memberIds) => removeMembersMutation.mutate(memberIds)}
      />
      <DesktopChatTextEditDialog
        open={Boolean(activeEditor)}
        title={activeEditor?.title ?? ""}
        description={activeEditor?.description}
        placeholder={activeEditor?.placeholder}
        initialValue={activeEditor?.initialValue ?? ""}
        multiline={activeEditor?.multiline}
        emptyAllowed={activeEditor?.emptyAllowed}
        pending={activeEditor?.pending}
        onClose={() => setEditorMode(null)}
        onConfirm={(value) => activeEditor?.onConfirm(value)}
      />
      <DesktopChatConfirmDialog
        open={Boolean(activeConfirm)}
        title={activeConfirm?.title ?? ""}
        description={activeConfirm?.description ?? ""}
        confirmLabel={activeConfirm?.confirmLabel}
        pendingLabel={activeConfirm?.pendingLabel}
        danger={activeConfirm?.danger}
        pending={busy}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => activeConfirm?.onConfirm()}
      />
    </div>
  );
}

function DesktopPanelSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-black/6 bg-white">
      {title ? (
        <div className="border-b border-black/6 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
          {title}
        </div>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

function DesktopPanelRow({
  label,
  value,
  danger = false,
  disabled = false,
  checked,
  icon,
  onClick,
  onToggle,
}: {
  label: string;
  value?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  onToggle?: (checked: boolean) => void;
}) {
  const isSwitch = typeof checked === "boolean" && Boolean(onToggle);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) {
          return;
        }

        if (isSwitch) {
          onToggle?.(!checked);
          return;
        }

        onClick?.();
      }}
      className={cn(
        "flex min-h-12 w-full items-center justify-between gap-3 border-b border-black/6 px-4 py-3 text-left last:border-b-0",
        danger ? "text-[#d74b45]" : "text-[color:var(--text-primary)]",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-[#fafafa]",
      )}
      role={isSwitch ? "switch" : undefined}
      aria-checked={isSwitch ? checked : undefined}
    >
      <span className="flex min-w-0 items-center gap-2 text-[14px]">
        {icon ? (
          <span className="text-[color:var(--text-muted)]">{icon}</span>
        ) : null}
        <span>{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {value ? (
          <span className="max-w-[10rem] truncate text-[12px] text-[color:var(--text-muted)]">
            {value}
          </span>
        ) : null}
        {isSwitch ? (
          <span
            className={cn(
              "relative h-7 w-11 rounded-full transition-colors",
              checked ? "bg-[#07c160]" : "bg-[#d8d8d8]",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                checked ? "left-4" : "left-0.5",
              )}
            />
          </span>
        ) : (
          <ChevronRight size={16} className="text-[color:var(--text-dim)]" />
        )}
      </span>
    </button>
  );
}

function DesktopMemberGrid({ items }: { items: DesktopMemberGridItem[] }) {
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-4 px-4 py-4">
      {items.map((item) => {
        const isAction = item.kind === "add" || item.kind === "remove";
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
          >
            {isAction ? (
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-[14px] border text-2xl transition-colors",
                  item.kind === "remove"
                    ? "border-[rgba(220,38,38,0.14)] bg-[rgba(254,242,242,0.88)] text-red-500"
                    : "border-black/8 bg-[#f6f6f6] text-[color:var(--text-secondary)]",
                )}
              >
                {item.kind === "remove" ? "−" : "+"}
              </div>
            ) : (
              <AvatarChip name={item.label} src={item.src} size="wechat" />
            )}
            <span className="w-full truncate text-[11px] text-[color:var(--text-secondary)]">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
