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
  leaveGroup,
  sendFriendRequest,
  setConversationPinned,
  setGroupPinned,
  updateGroup,
  updateGroupOwnerProfile,
  type ConversationListItem,
} from "@yinjie/contracts";
import { ChevronRight, Search } from "lucide-react";
import { ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import { DesktopGroupMemberPicker } from "./desktop-group-member-picker";
import { getChatBackgroundLabel } from "../../chat/backgrounds/chat-background-helpers";
import {
  useConversationBackground,
  useDefaultChatBackground,
} from "../../chat/backgrounds/use-conversation-background";
import {
  readDirectChatDetailPreferences,
  readGroupChatDetailPreferences,
  writeDirectChatDetailPreferences,
  writeGroupChatDetailPreferences,
} from "../../chat-details/chat-detail-preferences";
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
  const [preferences, setPreferences] = useState(() =>
    readDirectChatDetailPreferences(conversation.id),
  );
  const backgroundQuery = useConversationBackground(conversation.id);
  const targetCharacterId = conversation.participants[0] ?? "";

  useEffect(() => {
    setPreferences(readDirectChatDetailPreferences(conversation.id));
    setNotice(null);
  }, [conversation.id]);

  useEffect(() => {
    writeDirectChatDetailPreferences(conversation.id, preferences);
  }, [conversation.id, preferences]);

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
            void navigate({ to: "/desktop/chat-files" });
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection title="设置">
        <DesktopPanelRow
          label="消息免打扰"
          checked={preferences.muted}
          onToggle={(checked) => {
            setPreferences((current) => ({ ...current, muted: checked }));
          }}
        />
        <DesktopPanelRow
          label="置顶聊天"
          checked={conversation.isPinned}
          onToggle={(checked) => pinMutation.mutate(checked)}
        />
        <DesktopPanelRow
          label="添加到通讯录"
          value={isFriend ? "已添加" : "添加"}
          disabled={isFriend}
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
          label="清空聊天记录"
          danger
          onClick={() => clearMutation.mutate()}
        />
        <DesktopPanelRow
          label="投诉"
          danger
          onClick={() => reportMutation.mutate()}
        />
        <DesktopPanelRow
          label="加入黑名单"
          value={isBlocked ? "已加入" : undefined}
          disabled={isBlocked}
          danger
          onClick={() => blockMutation.mutate()}
        />
      </DesktopPanelSection>
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
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [preferences, setPreferences] = useState(() =>
    readGroupChatDetailPreferences(conversation.id),
  );

  useEffect(() => {
    setPreferences(readGroupChatDetailPreferences(conversation.id));
    setNotice(null);
    setMemberPickerOpen(false);
  }, [conversation.id]);

  useEffect(() => {
    writeGroupChatDetailPreferences(conversation.id, preferences);
  }, [conversation.id, preferences]);

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
      setNotice(payload.name ? "群聊名称已更新。" : "群公告已更新。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
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
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const updateNicknameMutation = useMutation({
    mutationFn: (nickname: string) =>
      updateGroupOwnerProfile(conversation.id, { nickname }, baseUrl),
    onSuccess: async () => {
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
        setMemberPickerOpen(true);
      },
    },
    {
      key: "remove",
      label: "移除",
      kind: "remove" as const,
      onClick: () => {
        setNotice("移除群成员入口已保留，后端补接口后接通。");
      },
    },
  ];

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
          onClick={() => {
            const nextName = window.prompt(
              "修改群聊名称",
              groupQuery.data?.name ?? conversation.title,
            );
            if (!nextName || nextName.trim() === groupQuery.data?.name) {
              return;
            }
            updateGroupMutation.mutate({ name: nextName.trim() });
          }}
        />
        <DesktopPanelRow
          label="群公告"
          value={groupQuery.data?.announcement?.trim() || "未设置"}
          onClick={() => {
            const nextAnnouncement = window.prompt(
              "修改群公告",
              groupQuery.data?.announcement ?? "",
            );
            if (nextAnnouncement === null) {
              return;
            }
            updateGroupMutation.mutate({
              announcement: nextAnnouncement.trim() || null,
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
            void navigate({ to: "/desktop/chat-files" });
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection title="设置">
        <DesktopPanelRow
          label="消息免打扰"
          checked={preferences.muted}
          onToggle={(checked) => {
            setPreferences((current) => ({ ...current, muted: checked }));
          }}
        />
        <DesktopPanelRow
          label="置顶聊天"
          checked={groupQuery.data?.isPinned ?? conversation.isPinned}
          onToggle={(checked) => pinMutation.mutate(checked)}
        />
        <DesktopPanelRow
          label="我在本群的昵称"
          value={ownerMember?.memberName ?? "未设置"}
          onClick={() => {
            const nextNickname = window.prompt(
              "修改我在本群的昵称",
              ownerMember?.memberName ?? "",
            );
            if (
              !nextNickname ||
              nextNickname.trim() === ownerMember?.memberName
            ) {
              return;
            }
            updateNicknameMutation.mutate(nextNickname.trim());
          }}
        />
        <DesktopPanelRow
          label="显示群成员昵称"
          checked={preferences.showMemberNicknames}
          onToggle={(checked) => {
            setPreferences((current) => ({
              ...current,
              showMemberNicknames: checked,
            }));
          }}
        />
        <DesktopPanelRow
          label="聊天背景"
          value={backgroundLabel}
          onClick={() => {
            setNotice("群聊当前复用默认聊天背景，独立群背景入口后续补齐。");
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection title="更多">
        <DesktopPanelRow
          label="清空聊天记录"
          danger
          onClick={() => clearMutation.mutate()}
        />
        <DesktopPanelRow
          label="退出群聊"
          danger
          onClick={() => leaveMutation.mutate()}
        />
      </DesktopPanelSection>

      <DesktopGroupMemberPicker
        open={memberPickerOpen}
        groupName={groupQuery.data?.name ?? conversation.title}
        existingMemberIds={(membersQuery.data ?? []).map(
          (item) => item.memberId,
        )}
        pending={addMembersMutation.isPending}
        onClose={() => setMemberPickerOpen(false)}
        onConfirm={(memberIds) => addMembersMutation.mutate(memberIds)}
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
