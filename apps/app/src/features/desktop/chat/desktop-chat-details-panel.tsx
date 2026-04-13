import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
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
  getConversations,
  getFriendRequests,
  getFriends,
  getGroup,
  getGroupMembers,
  hideConversation,
  leaveGroup,
  removeGroupMember,
  setConversationMuted,
  setConversationPinned,
  setGroupPinned,
  updateGroup,
  updateGroupOwnerProfile,
  updateGroupPreferences,
  type ConversationListItem,
  type GroupMember,
} from "@yinjie/contracts";
import { ChevronRight, Minus, Plus, Search, X } from "lucide-react";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { DesktopChatConfirmDialog } from "./desktop-chat-confirm-dialog";
import { DesktopMessageAvatarPopover } from "./desktop-message-avatar-popover";
import { DesktopChatTextEditDialog } from "./desktop-chat-text-edit-dialog";
import { buildDesktopChatFilesRouteHash } from "./desktop-chat-files-route-state";
import { DesktopGroupMemberPicker } from "./desktop-group-member-picker";
import { DesktopGroupMemberRemovalPicker } from "./desktop-group-member-removal-picker";
import { getChatBackgroundLabel } from "../../chat/backgrounds/chat-background-helpers";
import { buildDesktopAddFriendRouteHash } from "../contacts/desktop-add-friend-route-state";
import {
  useConversationBackground,
  useGroupBackground,
} from "../../chat/backgrounds/use-conversation-background";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { buildCreateGroupRouteHash } from "../../../lib/create-group-route-state";
import { formatTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type DesktopChatDetailsPanelProps = {
  conversation: ConversationListItem;
  announcementRequest?: number | null;
  memberSearchRequest?: number | null;
  onOpenHistory: () => void;
  onCreateGroup?: (input: {
    conversationId: string;
    seedMemberIds: string[];
  }) => void;
};

type DesktopMemberGridItem = {
  key: string;
  label: string;
  src?: string | null;
  kind?: "member" | "add" | "remove";
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

type DesktopAvatarPopoverState =
  | {
      anchorElement: HTMLButtonElement;
      kind: "owner";
    }
  | {
      anchorElement: HTMLButtonElement;
      kind: "character";
      characterId: string;
      fallbackName: string;
      fallbackAvatar?: string | null;
      threadContext?: {
        id: string;
        type: "direct" | "group";
        title?: string;
      };
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

type GroupDetailsConfirmAction = "clear" | "leave";

type DesktopGroupMemberBrowserFilter = "all" | "owner" | "admin" | "character";

const DESKTOP_GROUP_MEMBER_PREVIEW_COUNT = 10;

export function DesktopChatDetailsPanel({
  conversation,
  announcementRequest = null,
  memberSearchRequest = null,
  onOpenHistory,
  onCreateGroup,
}: DesktopChatDetailsPanelProps) {
  if (isPersistedGroupConversation(conversation)) {
    return (
      <GroupChatDetailsPanel
        conversation={conversation}
        announcementRequest={announcementRequest}
        memberSearchRequest={memberSearchRequest}
        onOpenHistory={onOpenHistory}
      />
    );
  }

  return (
    <DirectChatDetailsPanel
      conversation={conversation}
      onOpenHistory={onOpenHistory}
      onCreateGroup={onCreateGroup}
    />
  );
}

function DirectChatDetailsPanel({
  conversation,
  onOpenHistory,
  onCreateGroup,
}: DesktopChatDetailsPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<DirectDetailsConfirmAction | null>(null);
  const [avatarPopover, setAvatarPopover] =
    useState<DesktopAvatarPopoverState | null>(null);
  const backgroundQuery = useConversationBackground(conversation.id);
  const targetCharacterId = conversation.participants[0] ?? "";

  useEffect(() => {
    setNotice(null);
    setConfirmAction(null);
    setAvatarPopover(null);
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
  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
    enabled: Boolean(targetCharacterId),
  });

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const blockedQuery = useQuery({
    queryKey: ["app-chat-details-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(targetCharacterId),
  });

  const targetCharacter = characterQuery.data;
  const friendship =
    (friendsQuery.data ?? []).find(
      (item) => item.character.id === targetCharacterId,
    )?.friendship ?? null;
  const isFriend = Boolean(friendship);
  const hasPendingFriendRequest = (friendRequestsQuery.data ?? []).some(
    (item) =>
      item.characterId === targetCharacterId && item.status === "pending",
  );
  const isBlocked = (blockedQuery.data ?? []).some(
    (item) => item.characterId === targetCharacterId,
  );
  const commonGroups = (conversationsQuery.data ?? []).filter(
    (item) =>
      isPersistedGroupConversation(item) &&
      item.participants.includes(targetCharacterId),
  );
  const remarkName = friendship?.remarkName?.trim() ?? "";
  const displayName = remarkName || targetCharacter?.name || conversation.title;
  const signature =
    targetCharacter?.currentStatus?.trim() ||
    targetCharacter?.bio?.trim() ||
    (isFriend ? "这个联系人还没有签名。" : "这个角色还没有签名。");
  const identifier = targetCharacterId
    ? `yinjie_${targetCharacterId.slice(0, 8)}`
    : undefined;
  const relationshipSummary = isFriend
    ? remarkName
      ? `昵称：${targetCharacter?.name ?? conversation.title}`
      : targetCharacter?.relationship || "联系人"
    : targetCharacter?.relationship || "世界角色";
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
  const handleAddToContacts = () => {
    if (!targetCharacterId) {
      return;
    }

    if (hasPendingFriendRequest) {
      void navigate({ to: "/friend-requests" });
      return;
    }

    void navigate({
      to: "/desktop/add-friend",
      hash: buildDesktopAddFriendRouteHash({
        keyword: targetCharacter?.name ?? conversation.title ?? "",
        characterId: targetCharacterId,
        openCompose: true,
      }),
    });
  };

  const busy =
    pinMutation.isPending ||
    muteMutation.isPending ||
    clearMutation.isPending ||
    hideMutation.isPending ||
    reportMutation.isPending ||
    blockMutation.isPending;
  const activeConfirm =
    confirmAction === "hide"
      ? {
          title: "删除聊天",
          description:
            "删除后，这段聊天会从消息列表中移除；有新消息时会再次出现。",
          confirmLabel: "删除聊天",
          pendingLabel: "正在删除...",
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
    <div className="space-y-2.5 bg-[#f5f5f5] px-3 py-3">
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {characterQuery.isError && characterQuery.error instanceof Error ? (
        <ErrorBlock message={characterQuery.error.message} />
      ) : null}
      {friendsQuery.isError && friendsQuery.error instanceof Error ? (
        <ErrorBlock message={friendsQuery.error.message} />
      ) : null}
      {friendRequestsQuery.isError &&
      friendRequestsQuery.error instanceof Error ? (
        <ErrorBlock message={friendRequestsQuery.error.message} />
      ) : null}
      {conversationsQuery.isError &&
      conversationsQuery.error instanceof Error ? (
        <ErrorBlock message={conversationsQuery.error.message} />
      ) : null}
      {blockedQuery.isError && blockedQuery.error instanceof Error ? (
        <ErrorBlock message={blockedQuery.error.message} />
      ) : null}

      <DesktopPanelSection>
        <div className="flex items-start gap-3 px-4 py-4">
          <button
            type="button"
            disabled={!targetCharacterId}
            onClick={(event) => {
              if (!targetCharacterId) {
                return;
              }

              setAvatarPopover({
                anchorElement: event.currentTarget,
                kind: "character",
                characterId: targetCharacterId,
                fallbackName: targetCharacter?.name ?? conversation.title,
                fallbackAvatar: targetCharacter?.avatar,
                threadContext: {
                  id: conversation.id,
                  type: "direct",
                  title: conversation.title,
                },
              });
            }}
            className="shrink-0 rounded-[14px] transition hover:opacity-90 disabled:cursor-default disabled:opacity-100"
            aria-label={`查看${displayName}资料卡`}
          >
            <AvatarChip
              name={targetCharacter?.name ?? conversation.title}
              src={targetCharacter?.avatar}
              size="wechat"
            />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                {displayName}
              </div>
              <span className="rounded-full bg-[rgba(0,0,0,0.05)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                {isFriend ? "联系人" : "世界角色"}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {relationshipSummary}
            </div>
            <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
              {signature}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-dim)]">
              {remarkName ? (
                <span className="rounded-full bg-[rgba(0,0,0,0.035)] px-2 py-0.5">
                  备注 {remarkName}
                </span>
              ) : null}
              {identifier ? (
                <span className="rounded-full bg-[rgba(0,0,0,0.035)] px-2 py-0.5">
                  隐界号 {identifier}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </DesktopPanelSection>

      <DesktopPanelSection>
        <DesktopPanelRow
          label="查找聊天记录"
          value="搜索当前聊天"
          icon={<Search size={15} />}
          onClick={onOpenHistory}
        />
        <DesktopPanelRow
          label="聊天文件"
          value="查看本聊天附件"
          onClick={() => {
            void navigate({
              to: "/desktop/chat-files",
              hash: buildDesktopChatFilesRouteHash(conversation.id),
            });
          }}
        />
        <DesktopPanelRow
          label="聊天背景"
          value={backgroundLabel}
          onClick={() => {
            void navigate({
              to: "/chat/$conversationId/background",
              params: { conversationId: conversation.id },
            });
          }}
        />
      </DesktopPanelSection>

      <DesktopPanelSection>
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
        {!isFriend ? (
          <DesktopPanelRow
            label="添加到通讯录"
            value={hasPendingFriendRequest ? "待处理" : "添加"}
            disabled={busy || !targetCharacterId}
            onClick={handleAddToContacts}
          />
        ) : null}
        <DesktopPanelRow
          label="发起群聊"
          value="和对方创建新群"
          onClick={() => {
            if (onCreateGroup) {
              onCreateGroup({
                conversationId: conversation.id,
                seedMemberIds: targetCharacterId ? [targetCharacterId] : [],
              });
              return;
            }

            void navigate({
              to: "/group/new",
              hash: buildCreateGroupRouteHash({
                source: "desktop-chat",
                conversationId: conversation.id,
                seedMemberIds: targetCharacterId ? [targetCharacterId] : [],
              }),
            });
          }}
        />
        <DesktopPanelRow
          label="查看资料"
          value={isFriend ? "联系人资料" : "角色资料"}
          onClick={() => {
            if (!targetCharacterId) {
              return;
            }

            void navigate({
              to: "/character/$characterId",
              params: { characterId: targetCharacterId },
            });
          }}
          disabled={!targetCharacterId}
        />
      </DesktopPanelSection>

      {characterQuery.isLoading ? (
        <DesktopPanelSection>
          <div className="px-4 py-4">
            <LoadingBlock label="正在读取聊天信息..." />
          </div>
        </DesktopPanelSection>
      ) : (
        <DesktopPanelSection title="更多信息">
          {isFriend ? (
            <>
              <DesktopPanelInfoRow
                label="备注"
                value={remarkName || "未设置"}
              />
              <DesktopPanelInfoRow
                label="昵称"
                value={targetCharacter?.name ?? conversation.title}
              />
              <DesktopPanelInfoRow
                label="地区"
                value={friendship?.region?.trim() || "未设置"}
              />
              <DesktopPanelInfoRow
                label="来源"
                value={friendship?.source?.trim() || "未设置"}
              />
              <DesktopPanelInfoRow
                label="标签"
                value={
                  friendship?.tags?.length
                    ? friendship.tags.join(" / ")
                    : "未设置"
                }
              />
            </>
          ) : (
            <DesktopPanelInfoRow
              label="身份"
              value={targetCharacter?.relationship || "世界角色"}
            />
          )}
          <DesktopPanelInfoRow
            label="共同群聊"
            value={
              commonGroups.length ? `${commonGroups.length} 个` : "暂无共同群聊"
            }
          />
          {commonGroups.slice(0, 2).map((group) => (
            <DesktopPanelRow
              key={group.id}
              label="群聊"
              value={group.title}
              onClick={() => {
                void navigate({
                  to: "/group/$groupId",
                  params: { groupId: group.id },
                });
              }}
            />
          ))}
          <DesktopPanelInfoRow label="个性签名" value={signature} multiline />
        </DesktopPanelSection>
      )}

      <DesktopPanelSection>
        <DesktopPanelRow
          label="加入黑名单"
          value={isBlocked ? "已加入" : "不再接收该角色互动"}
          danger
          disabled={busy || isBlocked || !targetCharacterId}
          onClick={() => setConfirmAction("block")}
        />
        <DesktopPanelRow
          label="删除聊天"
          value="从消息列表移除"
          disabled={busy}
          onClick={() => setConfirmAction("hide")}
        />
        <DesktopPanelRow
          label="清空聊天记录"
          value="删除当前聊天内容"
          danger
          disabled={busy}
          onClick={() => setConfirmAction("clear")}
        />
        <DesktopPanelRow
          label="投诉"
          value="提交聊天相关投诉"
          danger
          disabled={busy || !targetCharacterId}
          onClick={() => setConfirmAction("report")}
        />
      </DesktopPanelSection>

      {pinMutation.isError && pinMutation.error instanceof Error ? (
        <ErrorBlock message={pinMutation.error.message} />
      ) : null}
      {muteMutation.isError && muteMutation.error instanceof Error ? (
        <ErrorBlock message={muteMutation.error.message} />
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
      {avatarPopover ? (
        avatarPopover.kind === "owner" ? (
          <DesktopMessageAvatarPopover
            anchorElement={avatarPopover.anchorElement}
            kind="owner"
            onClose={() => setAvatarPopover(null)}
          />
        ) : (
          <DesktopMessageAvatarPopover
            anchorElement={avatarPopover.anchorElement}
            kind="character"
            characterId={avatarPopover.characterId}
            fallbackName={avatarPopover.fallbackName}
            fallbackAvatar={avatarPopover.fallbackAvatar}
            threadContext={avatarPopover.threadContext}
            onClose={() => setAvatarPopover(null)}
          />
        )
      ) : null}
    </div>
  );
}

function GroupChatDetailsPanel({
  conversation,
  announcementRequest,
  memberSearchRequest,
  onOpenHistory,
}: DesktopChatDetailsPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const backgroundQuery = useGroupBackground(conversation.id);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<GroupDetailsConfirmAction | null>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberPickerMode, setMemberPickerMode] = useState<"add" | "remove">(
    "add",
  );
  const [memberBrowserOpen, setMemberBrowserOpen] = useState(false);
  const [memberBrowserAutoFocusSearch, setMemberBrowserAutoFocusSearch] =
    useState(false);
  const [editorMode, setEditorMode] = useState<GroupDetailsEditorMode | null>(
    null,
  );
  const [avatarPopover, setAvatarPopover] =
    useState<DesktopAvatarPopoverState | null>(null);

  useEffect(() => {
    setNotice(null);
    setConfirmAction(null);
    setMemberPickerOpen(false);
    setMemberPickerMode("add");
    setMemberBrowserOpen(false);
    setMemberBrowserAutoFocusSearch(false);
    setEditorMode(null);
    setAvatarPopover(null);
  }, [conversation.id]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!memberSearchRequest) {
      return;
    }

    setMemberBrowserAutoFocusSearch(true);
    setMemberBrowserOpen(true);
  }, [memberSearchRequest]);

  useEffect(() => {
    if (!announcementRequest) {
      return;
    }

    setEditorMode("announcement");
  }, [announcementRequest]);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, conversation.id],
    queryFn: () => getGroup(conversation.id, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, conversation.id],
    queryFn: () => getGroupMembers(conversation.id, baseUrl),
  });

  const backgroundLabel = getChatBackgroundLabel(
    backgroundQuery.data?.effectiveBackground ?? null,
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
  const groupMembers = membersQuery.data ?? [];
  const ownerDisplayName = ownerMember?.memberName?.trim() || "我";

  const memberItems: DesktopMemberGridItem[] = [
    ...groupMembers
      .slice(0, DESKTOP_GROUP_MEMBER_PREVIEW_COUNT)
      .map((member) => ({
        key: member.id,
        label: member.memberName ?? member.memberId,
        src: member.memberAvatar,
        onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
          if (member.memberType === "character") {
            setAvatarPopover({
              anchorElement: event.currentTarget,
              kind: "character",
              characterId: member.memberId,
              fallbackName: member.memberName ?? member.memberId,
              fallbackAvatar: member.memberAvatar,
              threadContext: {
                id: conversation.id,
                type: "group",
                title: group?.name ?? conversation.title,
              },
            });
            return;
          }

          setAvatarPopover({
            anchorElement: event.currentTarget,
            kind: "owner",
          });
        },
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
    clearMutation.isPending ||
    leaveMutation.isPending;
  const activeEditor: GroupDetailsEditorConfig | null =
    editorMode === "name"
      ? {
          title: "修改群聊名称",
          description: "新的名称会同步显示在聊天页和群成员列表里。",
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
            title: "编辑群公告",
            description: "支持换行。留空保存会清空当前群公告。",
            placeholder: "输入群公告",
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
              description: `${ownerDisplayName}在这个群里的展示昵称会同步更新。`,
              placeholder: "请输入群昵称",
              initialValue: ownerMember?.memberName ?? "",
              multiline: false,
              emptyAllowed: false,
              pending: updateNicknameMutation.isPending,
              onConfirm: (value: string) =>
                updateNicknameMutation.mutate(value),
            }
          : null;
  const activeConfirm =
    confirmAction === "clear"
      ? {
          title: "清空聊天记录",
          description: "仅清空当前群聊里的历史消息，群成员和群资料会继续保留。",
          confirmLabel: "清空聊天记录",
          pendingLabel: "正在清空...",
          danger: true,
          onConfirm: () => {
            setConfirmAction(null);
            clearMutation.mutate();
          },
        }
      : confirmAction === "leave"
        ? {
            title: "退出群聊",
            description:
              "退出后你将不再收到这个群的消息，当前会话也会从桌面端列表中移除。",
            confirmLabel: "退出群聊",
            pendingLabel: "正在退出...",
            danger: true,
            onConfirm: () => {
              setConfirmAction(null);
              leaveMutation.mutate();
            },
          }
        : null;

  return (
    <div className="space-y-2.5 bg-[#ededed] px-0 py-3">
      {notice ? (
        <div className="px-3">
          <InlineNotice tone="success">{notice}</InlineNotice>
        </div>
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
      {addMembersMutation.isError &&
      addMembersMutation.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={addMembersMutation.error.message} />
        </div>
      ) : null}
      {removeMembersMutation.isError &&
      removeMembersMutation.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={removeMembersMutation.error.message} />
        </div>
      ) : null}

      <DesktopWechatGroupSection>
        {membersQuery.isLoading ? (
          <div className="px-4 py-5">
            <LoadingBlock label="正在读取群成员..." />
          </div>
        ) : (
          <>
            <DesktopWechatMemberGrid items={memberItems} />
            <DesktopWechatGroupRow
              label="全部群成员"
              value={`${groupMembers.length} 人`}
              onClick={() => {
                setMemberBrowserAutoFocusSearch(false);
                setMemberBrowserOpen(true);
              }}
            />
          </>
        )}
      </DesktopWechatGroupSection>

      <DesktopWechatGroupSection title="群聊资料">
        <DesktopWechatGroupRow
          label="群聊名称"
          value={groupQuery.data?.name ?? conversation.title}
          disabled={busy}
          onClick={() => setEditorMode("name")}
        />
        <DesktopWechatGroupRow
          label="群公告"
          value={groupQuery.data?.announcement?.trim() || "暂无公告"}
          multilineValue
          disabled={busy}
          onClick={() => setEditorMode("announcement")}
        />
        <DesktopWechatGroupRow
          label="群二维码"
          value="查看邀请卡"
          onClick={() => {
            void navigate({
              to: "/group/$groupId/qr",
              params: { groupId: conversation.id },
            });
          }}
        />
        <DesktopWechatGroupRow
          label="查找聊天记录"
          value="搜索当前群消息"
          onClick={onOpenHistory}
        />
        <DesktopWechatGroupRow
          label="聊天文件"
          value="查看本群附件"
          onClick={() => {
            void navigate({
              to: "/desktop/chat-files",
              hash: buildDesktopChatFilesRouteHash(conversation.id),
            });
          }}
        />
      </DesktopWechatGroupSection>

      <DesktopWechatGroupSection title="聊天设置">
        <DesktopWechatGroupRow
          label="消息免打扰"
          checked={isMuted}
          disabled={busy || !group}
          onToggle={(checked) =>
            preferencesMutation.mutate({ isMuted: checked })
          }
        />
        {isMuted ? (
          <>
            <DesktopWechatGroupRow
              label="@我仍通知"
              checked={group?.notifyOnAtMe ?? true}
              disabled={busy || !group}
              onToggle={(checked) =>
                preferencesMutation.mutate({ notifyOnAtMe: checked })
              }
            />
            <DesktopWechatGroupRow
              label="@所有人仍通知"
              checked={group?.notifyOnAtAll ?? true}
              disabled={busy || !group}
              onToggle={(checked) =>
                preferencesMutation.mutate({ notifyOnAtAll: checked })
              }
            />
            <DesktopWechatGroupRow
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
        <DesktopWechatGroupRow
          label="置顶聊天"
          checked={group?.isPinned ?? conversation.isPinned}
          disabled={busy || !group}
          onToggle={(checked) => pinMutation.mutate(checked)}
        />
        <DesktopWechatGroupRow
          label="保存到通讯录"
          checked={group?.savedToContacts ?? false}
          disabled={busy || !group}
          onToggle={(checked) =>
            preferencesMutation.mutate({ savedToContacts: checked })
          }
        />
        <DesktopWechatGroupRow
          label="我在本群的昵称"
          value={ownerMember?.memberName ?? "未设置"}
          disabled={busy}
          onClick={() => setEditorMode("nickname")}
        />
        <DesktopWechatGroupRow
          label="显示群成员昵称"
          checked={group?.showMemberNicknames ?? true}
          disabled={busy || !group}
          onToggle={(checked) =>
            preferencesMutation.mutate({ showMemberNicknames: checked })
          }
        />
        <DesktopWechatGroupRow
          label="聊天背景"
          value={backgroundLabel}
          onClick={() => {
            void navigate({
              to: "/group/$groupId/background",
              params: { groupId: conversation.id },
            });
          }}
        />
      </DesktopWechatGroupSection>

      <div className="space-y-2 px-3 pt-1">
        <DesktopWechatDangerButton
          label="清空聊天记录"
          disabled={busy}
          onClick={() => setConfirmAction("clear")}
        />
        <DesktopWechatDangerButton
          label="退出群聊"
          danger
          disabled={busy}
          onClick={() => setConfirmAction("leave")}
        />
      </div>

      {updateGroupMutation.isError &&
      updateGroupMutation.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={updateGroupMutation.error.message} />
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
      <DesktopGroupMemberBrowserDialog
        open={memberBrowserOpen}
        autoFocusSearch={memberBrowserAutoFocusSearch}
        groupName={groupQuery.data?.name ?? conversation.title}
        members={groupMembers}
        pending={busy}
        onClose={() => {
          setMemberBrowserOpen(false);
          setMemberBrowserAutoFocusSearch(false);
        }}
        onAddMembers={() => {
          setMemberBrowserOpen(false);
          setMemberBrowserAutoFocusSearch(false);
          setMemberPickerMode("add");
          setMemberPickerOpen(true);
        }}
        onRemoveMembers={() => {
          setMemberBrowserOpen(false);
          setMemberBrowserAutoFocusSearch(false);
          setMemberPickerMode("remove");
          setMemberPickerOpen(true);
        }}
        canRemoveMembers={removableMembers.length > 0}
        onViewMember={(member, anchorElement) => {
          setMemberBrowserOpen(false);
          setMemberBrowserAutoFocusSearch(false);
          if (!anchorElement) {
            return;
          }

          if (member.memberType === "character") {
            setAvatarPopover({
              anchorElement,
              kind: "character",
              characterId: member.memberId,
              fallbackName: member.memberName ?? member.memberId,
              fallbackAvatar: member.memberAvatar,
              threadContext: {
                id: conversation.id,
                type: "group",
                title: group?.name ?? conversation.title,
              },
            });
            return;
          }

          setAvatarPopover({
            anchorElement,
            kind: "owner",
          });
        }}
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
      {avatarPopover ? (
        avatarPopover.kind === "owner" ? (
          <DesktopMessageAvatarPopover
            anchorElement={avatarPopover.anchorElement}
            kind="owner"
            onClose={() => setAvatarPopover(null)}
          />
        ) : (
          <DesktopMessageAvatarPopover
            anchorElement={avatarPopover.anchorElement}
            kind="character"
            characterId={avatarPopover.characterId}
            fallbackName={avatarPopover.fallbackName}
            fallbackAvatar={avatarPopover.fallbackAvatar}
            threadContext={avatarPopover.threadContext}
            onClose={() => setAvatarPopover(null)}
          />
        )
      ) : null}
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
    <section className="overflow-hidden rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-white">
      {title ? (
        <div className="border-b border-[rgba(0,0,0,0.06)] px-4 py-2 text-[11px] tracking-[0.06em] text-[color:var(--text-dim)]">
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
        "flex min-h-11 w-full items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 text-left last:border-b-0",
        danger ? "text-[#d74b45]" : "text-[color:var(--text-primary)]",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-[rgba(0,0,0,0.025)]",
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
          <span className="max-w-[12rem] truncate text-[12px] text-[color:var(--text-muted)]">
            {value}
          </span>
        ) : null}
        {isSwitch ? (
          <span
            className={cn(
              "relative h-6 w-10 rounded-full transition-colors",
              checked ? "bg-[color:var(--brand-primary)]" : "bg-[#d8d8d8]",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                checked ? "left-[18px]" : "left-0.5",
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

function DesktopPanelInfoRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 text-left last:border-b-0">
      <span className="min-w-0 pt-0.5 text-[14px] text-[color:var(--text-primary)]">
        {label}
      </span>
      <span
        className={cn(
          "max-w-[12rem] text-right text-[12px] text-[color:var(--text-muted)]",
          multiline ? "whitespace-pre-wrap break-words leading-5" : "truncate",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DesktopWechatGroupSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      {title ? (
        <div className="px-4 text-[11px] text-[#8c8c8c]">{title}</div>
      ) : null}
      <div className="border-y border-[rgba(0,0,0,0.07)] bg-white">
        {children}
      </div>
    </section>
  );
}

function DesktopWechatGroupRow({
  label,
  value,
  disabled = false,
  danger = false,
  checked,
  multilineValue = false,
  onClick,
  onToggle,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  multilineValue?: boolean;
  onClick?: () => void;
  onToggle?: (checked: boolean) => void;
}) {
  const isSwitch = typeof checked === "boolean" && Boolean(onToggle);
  const interactive = isSwitch || Boolean(onClick);

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
        "flex min-h-[46px] w-full items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 text-left last:border-b-0",
        danger ? "text-[#e14c45]" : "text-[#111111]",
        disabled
          ? "cursor-not-allowed opacity-50"
          : interactive
            ? "hover:bg-[rgba(0,0,0,0.025)]"
            : undefined,
      )}
      role={isSwitch ? "switch" : undefined}
      aria-checked={isSwitch ? checked : undefined}
    >
      <span className="min-w-0 text-[14px]">{label}</span>
      <span className="flex shrink-0 items-center gap-2.5">
        {value ? (
          <span
            className={cn(
              "max-w-[10.5rem] text-right text-[12px] text-[#8c8c8c]",
              multilineValue
                ? "whitespace-pre-wrap break-words leading-4"
                : "truncate",
            )}
          >
            {value}
          </span>
        ) : null}
        {isSwitch ? (
          <span
            className={cn(
              "relative h-6 w-[42px] rounded-full transition-colors",
              checked ? "bg-[color:var(--brand-primary)]" : "bg-[#d9d9d9]",
            )}
          >
            <span
              className={cn(
                "absolute top-[1px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-transform",
                checked ? "translate-x-5" : "translate-x-[1px]",
              )}
            />
          </span>
        ) : interactive ? (
          <ChevronRight size={16} className="text-[#c7c7cc]" />
        ) : null}
      </span>
    </button>
  );
}

function DesktopWechatDangerButton({
  label,
  danger = false,
  disabled = false,
  onClick,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-[10px] border border-[rgba(0,0,0,0.06)] bg-white text-[14px] transition",
        danger ? "text-[#e14c45]" : "text-[#111111]",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-[rgba(0,0,0,0.02)]",
      )}
    >
      {label}
    </button>
  );
}

function DesktopWechatMemberGrid({
  items,
}: {
  items: DesktopMemberGridItem[];
}) {
  return (
    <div className="grid grid-cols-5 gap-x-3 gap-y-4 px-4 py-4">
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
                  "flex h-12 w-12 items-center justify-center rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[#f7f7f7] text-[#7a7a7a] transition-colors",
                  "hover:bg-[#f1f1f1]",
                )}
              >
                {item.kind === "remove" ? (
                  <Minus size={18} strokeWidth={2} />
                ) : (
                  <Plus size={18} strokeWidth={2} />
                )}
              </div>
            ) : (
              <AvatarChip name={item.label} src={item.src} size="wechat" />
            )}
            <span className="w-full truncate text-[11px] text-[#707070]">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DesktopGroupMemberBrowserDialog({
  open,
  autoFocusSearch = false,
  groupName,
  members,
  pending = false,
  onClose,
  onAddMembers,
  onRemoveMembers,
  canRemoveMembers = false,
  onViewMember,
}: {
  open: boolean;
  autoFocusSearch?: boolean;
  groupName: string;
  members: GroupMember[];
  pending?: boolean;
  onClose: () => void;
  onAddMembers: () => void;
  onRemoveMembers: () => void;
  canRemoveMembers?: boolean;
  onViewMember: (
    member: GroupMember,
    anchorElement: HTMLButtonElement | null,
  ) => void;
}) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const memberItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] =
    useState<DesktopGroupMemberBrowserFilter>("all");
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
    setActiveFilter("all");
    setActiveMemberId(null);
  }, [groupName, open]);

  useEffect(() => {
    if (!open || !autoFocusSearch) {
      return;
    }

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoFocusSearch, open]);

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === "owner").length,
    [members],
  );
  const adminCount = useMemo(
    () => members.filter((member) => member.role === "admin").length,
    [members],
  );
  const characterCount = useMemo(
    () => members.filter((member) => member.memberType === "character").length,
    [members],
  );
  const filterTabs: Array<{
    id: DesktopGroupMemberBrowserFilter;
    label: string;
    count: number;
  }> = [
    { id: "all", label: "全部", count: members.length },
    { id: "owner", label: "群主", count: ownerCount },
    { id: "admin", label: "管理员", count: adminCount },
    { id: "character", label: "角色成员", count: characterCount },
  ];

  const filteredMembers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return members.filter((member) => {
      if (activeFilter === "owner" && member.role !== "owner") {
        return false;
      }

      if (activeFilter === "admin" && member.role !== "admin") {
        return false;
      }

      if (activeFilter === "character" && member.memberType !== "character") {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const name = (member.memberName ?? member.memberId).toLowerCase();
      const roleLabel =
        member.role === "owner"
          ? "群主"
          : member.role === "admin"
            ? "管理员"
            : "群成员";

      return (
        name.includes(keyword) ||
        roleLabel.includes(keyword) ||
        member.memberId.toLowerCase().includes(keyword)
      );
    });
  }, [activeFilter, members, searchTerm]);

  const activeFilterLabel =
    filterTabs.find((tab) => tab.id === activeFilter)?.label ?? "全部";
  const emptyStateTitle = searchTerm.trim()
    ? `没有找到“${searchTerm.trim()}”`
    : "当前没有匹配成员";
  const emptyStateDescription = searchTerm.trim()
    ? `试试切换到其他筛选，或者搜索成员昵称、角色和 ID。当前范围：${activeFilterLabel}`
    : activeFilter === "all"
      ? "可以先添加成员，或者切换筛选查看特定角色。"
      : `试试切换到其他筛选。当前范围：${activeFilterLabel}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    const firstNavigableMember =
      filteredMembers.find(
        (member) =>
          member.memberType === "character" || member.memberType === "user",
      ) ?? null;

    setActiveMemberId((current) => {
      if (
        current &&
        filteredMembers.some(
          (member) =>
            member.id === current &&
            (member.memberType === "character" || member.memberType === "user"),
        )
      ) {
        return current;
      }

      return firstNavigableMember?.id ?? null;
    });
  }, [filteredMembers, open]);

  useEffect(() => {
    if (!activeMemberId) {
      return;
    }

    const target = memberItemRefs.current[activeMemberId];
    target?.scrollIntoView({ block: "nearest" });
  }, [activeMemberId]);

  const getNextNavigableMember = (direction: 1 | -1) => {
    const navigableMembers = filteredMembers.filter(
      (member) =>
        member.memberType === "character" || member.memberType === "user",
    );
    if (!navigableMembers.length) {
      return null;
    }

    const currentIndex = activeMemberId
      ? navigableMembers.findIndex((member) => member.id === activeMemberId)
      : -1;

    if (currentIndex < 0) {
      return direction > 0
        ? navigableMembers[0]
        : navigableMembers[navigableMembers.length - 1];
    }

    const nextIndex =
      (currentIndex + direction + navigableMembers.length) %
      navigableMembers.length;
    return navigableMembers[nextIndex] ?? null;
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextMember = getNextNavigableMember(
        event.key === "ArrowDown" ? 1 : -1,
      );
      if (nextMember) {
        setActiveMemberId(nextMember.id);
      }
      return;
    }

    if (event.key === "Enter" && activeMemberId) {
      const activeMember = filteredMembers.find(
        (member) =>
          member.id === activeMemberId &&
          (member.memberType === "character" || member.memberType === "user"),
      );
      if (activeMember) {
        event.preventDefault();
        onViewMember(
          activeMember,
          memberItemRefs.current[activeMember.id] ?? null,
        );
      }
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label="关闭群成员列表"
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div className="relative flex h-[min(760px,78vh)] w-full max-w-[760px] flex-col overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
          <div>
            <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
              群成员
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {groupName} · {members.length} 人
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!pending) {
                onClose();
              }
            }}
            disabled={pending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--text-dim)]">
            <span>全部 {members.length} 人</span>
            <span className="text-black/10">·</span>
            <span>角色成员 {characterCount} 人</span>
            <span className="text-black/10">·</span>
            <span>群主与管理员 {ownerCount + adminCount} 人</span>
          </div>

          <div className="mt-4 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4">
            <div className="flex flex-col gap-3">
              <label className="relative block">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="搜索昵称、角色或成员 ID"
                  className="h-10 w-full rounded-[10px] border border-[color:var(--border-faint)] bg-white pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)]"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {filterTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveFilter(tab.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition",
                        activeFilter === tab.id
                          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--text-primary)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
                          : "border-transparent bg-white text-[color:var(--text-secondary)] hover:border-[color:var(--border-faint)] hover:bg-white",
                      )}
                    >
                      {tab.label} {tab.count}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-[color:var(--text-dim)]">
                  ↑ ↓ 选择，Enter 打开
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border-faint)] pt-4">
            <div className="text-[11px] leading-5 text-[color:var(--text-dim)]">
              先看完整列表，再继续加人、减人或跳转资料。
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-white p-1">
              <Button
                type="button"
                variant="secondary"
                onClick={onRemoveMembers}
                disabled={pending || !canRemoveMembers}
                className="h-8 rounded-full border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[color:var(--surface-console)]"
              >
                移除成员
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onAddMembers}
                disabled={pending}
                className="h-8 rounded-full bg-[color:var(--brand-primary)] px-3 text-[12px] text-white hover:opacity-95"
              >
                添加成员
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {filteredMembers.length ? (
            <div className="space-y-2">
              {filteredMembers.map((member) => {
                const roleLabel =
                  member.role === "owner"
                    ? "群主"
                    : member.role === "admin"
                      ? "管理员"
                      : "群成员";
                const canViewProfile =
                  member.memberType === "character" ||
                  member.memberType === "user";

                return (
                  <button
                    key={member.id}
                    ref={(node) => {
                      memberItemRefs.current[member.id] = node;
                    }}
                    type="button"
                    onClick={(event) => {
                      if (canViewProfile) {
                        onViewMember(member, event.currentTarget);
                      }
                    }}
                    onMouseEnter={() => {
                      if (canViewProfile) {
                        setActiveMemberId(member.id);
                      }
                    }}
                    onFocus={() => {
                      if (canViewProfile) {
                        setActiveMemberId(member.id);
                      }
                    }}
                    disabled={pending || !canViewProfile}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[12px] border px-4 py-2.5 text-left transition",
                      canViewProfile && activeMemberId === member.id
                        ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[0_0_0_1px_rgba(7,193,96,0.06)]"
                        : canViewProfile
                          ? "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white"
                          : "border-[rgba(15,23,42,0.05)] bg-[rgba(247,250,250,0.72)]",
                      canViewProfile
                        ? "focus-visible:border-[rgba(7,193,96,0.14)] focus-visible:bg-[rgba(7,193,96,0.07)] focus-visible:outline-none"
                        : "border-[rgba(15,23,42,0.05)] bg-[rgba(247,250,250,0.72)]",
                      pending || !canViewProfile
                        ? "cursor-default"
                        : "shadow-none",
                    )}
                  >
                    <AvatarChip
                      name={member.memberName ?? member.memberId}
                      src={member.memberAvatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {member.memberName ?? member.memberId}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px]",
                            member.role === "owner"
                              ? "bg-[rgba(245,158,11,0.14)] text-[#b45309]"
                              : member.role === "admin"
                                ? "bg-[rgba(59,130,246,0.14)] text-[#2563eb]"
                                : "border border-[color:var(--border-faint)] bg-white text-[color:var(--text-muted)]",
                          )}
                        >
                          {roleLabel}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px]",
                            member.memberType === "user"
                              ? "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-muted)]"
                              : "bg-[rgba(47,122,63,0.10)] text-[#2f7a3f]",
                          )}
                        >
                          {member.memberType === "user" ? "世界主人" : "角色"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--text-dim)]">
                        <span>
                          {member.memberType === "user"
                            ? "Enter 或点击查看我的资料"
                            : "Enter 或点击查看资料"}
                        </span>
                        <span className="text-black/10">·</span>
                        <span>加入于 {formatTimestamp(member.joinedAt)}</span>
                        <span className="truncate">ID {member.memberId}</span>
                      </div>
                    </div>
                    {canViewProfile ? (
                      <ChevronRight
                        size={16}
                        className="text-[color:var(--text-dim)]"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6">
              <div className="flex max-w-[320px] flex-col items-center rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-white/84 px-6 py-8 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--surface-console)] text-[color:var(--text-dim)]">
                  <Search size={18} />
                </div>
                <div className="mt-4 text-sm font-medium text-[color:var(--text-primary)]">
                  {emptyStateTitle}
                </div>
                <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                  {emptyStateDescription}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
