import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
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
  setFriendStarred,
  setGroupPinned,
  updateFriendProfile,
  updateGroup,
  updateGroupOwnerProfile,
  updateGroupPreferences,
  type ConversationListItem,
  type FriendListItem,
  type GroupMember,
  type UpdateFriendProfileRequest,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { translateCharacterBio } from "../../../lib/character-i18n";
import { ChevronRight, Minus, Plus, Search, X } from "lucide-react";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { DesktopChatConfirmDialog } from "./desktop-chat-confirm-dialog";
import { DesktopMessageAvatarPopover } from "./desktop-message-avatar-popover";
import { DesktopChatTextEditDialog } from "./desktop-chat-text-edit-dialog";
import { buildMobileChatRouteHash } from "../../chat/mobile-chat-route-state";
import { buildMobileGroupRouteHash } from "../../chat/mobile-group-route-state";
import { buildDesktopChatFilesRouteHash } from "./desktop-chat-files-route-state";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
  type DesktopChatDetailsAction,
} from "./desktop-chat-route-state";
import { DesktopGroupMemberPicker } from "./desktop-group-member-picker";
import { DesktopGroupMemberRemovalPicker } from "./desktop-group-member-removal-picker";
import { getChatBackgroundLabel } from "../../chat/backgrounds/chat-background-helpers";
import { buildDesktopAddFriendRouteHash } from "../../contacts/add-friend-route-state";
import { buildCharacterDetailRouteHash } from "../../contacts/character-detail-route-state";
import { buildDesktopContactsRouteHash } from "../../contacts/contacts-route-state";
import { DesktopContactTextEditDialog } from "../../contacts/desktop-contact-text-edit-dialog";
import {
  DesktopContactProfileActionRow,
  DesktopContactProfileHeader,
  DesktopContactProfileRow,
  DesktopContactProfileSection,
  DesktopContactProfileToggleRow,
} from "../../contacts/desktop-contact-profile-blocks";
import { getFriendDisplayName } from "../../contacts/contact-utils";
import {
  useConversationBackground,
  useGroupBackground,
} from "../../chat/backgrounds/use-conversation-background";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { buildCreateGroupRouteHash } from "../../../lib/create-group-route-state";
import { formatTimestamp } from "../../../lib/format";
import { buildGroupInviteReturnSearch } from "../../../lib/group-invite-delivery";
import { buildYinjieId } from "../../../lib/yinjie-id";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { buildDesktopFriendMomentsRouteHash } from "../../moments/friend-moments-route-state";

type DesktopChatDetailsPanelProps = {
  conversation: ConversationListItem;
  actionRequest?: {
    kind: DesktopChatDetailsAction;
    token: number;
  } | null;
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
type EditableDirectProfileField = "remarkName" | "tags" | null;

const DESKTOP_GROUP_MEMBER_PREVIEW_COUNT = 10;
const DESKTOP_CHAT_DETAILS_REPORT_REASON = "desktop_chat_details_report";
const DESKTOP_CHAT_DETAILS_BLOCK_REASON = "desktop_chat_details_block";

export function DesktopChatDetailsPanel({
  conversation,
  actionRequest = null,
  onOpenHistory,
  onCreateGroup,
}: DesktopChatDetailsPanelProps) {
  if (isPersistedGroupConversation(conversation)) {
    return (
      <GroupChatDetailsPanel
        conversation={conversation}
        actionRequest={actionRequest}
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
  const t = translateRuntimeMessage;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const navigateToChatWorkspace = useCallback(
    (replace = false) => {
      void navigate({
        to: "/tabs/chat",
        search: {},
        hash: undefined,
        replace,
      });
    },
    [navigate],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<DirectDetailsConfirmAction | null>(null);
  const [avatarPopover, setAvatarPopover] =
    useState<DesktopAvatarPopoverState | null>(null);
  const [editingField, setEditingField] =
    useState<EditableDirectProfileField>(null);
  const [profileForm, setProfileForm] = useState({
    remarkName: "",
    tags: "",
  });
  const backgroundQuery = useConversationBackground(conversation.id);
  const targetCharacterId = conversation.participants[0] ?? "";

  useEffect(() => {
    setNotice(null);
    setConfirmAction(null);
    setAvatarPopover(null);
    setEditingField(null);
  }, [conversation.id]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 走查 R1：单聊「聊天信息」侧栏每次打开都重拉这 5 份 cache（详情按钮在
  // header 右侧，用户切会话 / 打开 details / 关掉再开都会重 mount），其中
  // app-character/app-friends/app-friend-requests/app-conversations/blocked
  // 五个上一个页面（contacts/character-detail/workspace 60s 轮询）大概率刚
  // 加载过。公网隧道 RTT ~600ms × 5 并发，明显的"开侧栏后空白几百毫秒"。
  // 对齐其他页面（contacts-page / chat-details-page / character-detail-page
  // 均为 15s）的 staleTime；blocked 与 contacts 走查同款给 30s。
  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, targetCharacterId],
    queryFn: () => getCharacter(targetCharacterId, baseUrl),
    enabled: Boolean(targetCharacterId),
    staleTime: 15_000,
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });
  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
    enabled: Boolean(targetCharacterId),
    staleTime: 15_000,
  });

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    staleTime: 15_000,
  });

  // 走查 R22：原 queryKey 用 "app-chat-details-blocked"，是给移动端 chat-details-page
  // 这条独立路由用的；desktop 这套 DesktopChatDetailsPanel 只在 desktop-chat-workspace
  // 的右侧侧栏里挂，workspace 自己（line 338-347）+ desktop-message-avatar-popover
  // 都用 "app-chat-blocked-characters" key。三者同屏 / 同 session 共存，但本面板
  // 用独立 key → workspace 已经把 blocked 列表拉过、cache 是热的，详情侧栏一打
  // 开还要在公网隧道（~600ms RTT）再发一次完全一样的 getBlockedCharacters。
  // 统一到 desktop 端的 "app-chat-blocked-characters" key 复用主缓存。
  const blockedQuery = useQuery({
    queryKey: ["app-chat-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(targetCharacterId),
    staleTime: 30_000,
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
  // 走查电脑端单聊 R6：原版每次 render 都现 .filter 一遍 conversations 找
  // "包含 targetCharacterId 的群聊"。DirectChatDetailsPanel 的高频 render 源
  // 很多——conversationsQuery / friendsQuery / friendRequestsQuery /
  // blockedQuery / characterQuery 各 15-30s 轮询，每一份回拉都让 panel 重渲；
  // 加上父 workspace 60s 轮询 + socket 推消息透传 conversation prop。每个
  // tick 都 O(N×M) 跑一次 isPersistedGroupConversation × participants.includes
  // —— 活跃用户 50+ 会话各 10-30 参与者，约 500-1500 次 includes 比较白用功。
  // 结果只用 .length / [0]，但 useMemo 把数组引用稳住也避免 commonGroups.length
  // 在 disabled / valueMuted 上反复触发 JSX 的等值比较。
  // 和姊妹 GroupChatDetailsPanel existingMemberIds (line 1684-1687) /
  // removableMembers (line 1689) 同款 useMemo 思路。
  const commonGroups = useMemo(
    () =>
      (conversationsQuery.data ?? []).filter(
        (item) =>
          isPersistedGroupConversation(item) &&
          item.participants.includes(targetCharacterId),
      ),
    [conversationsQuery.data, targetCharacterId],
  );
  const remarkName = friendship?.remarkName?.trim() ?? "";
  const displayName = remarkName || targetCharacter?.name || conversation.title;
  const signature =
    targetCharacter?.currentStatus?.trim() ||
    translateCharacterBio(t, targetCharacter?.bio) ||
    (isFriend
      ? t(msg`这个联系人还没有签名。`)
      : t(msg`这个角色还没有签名。`));
  const identifier = targetCharacterId
    ? buildYinjieId(targetCharacterId)
    : undefined;
  const relationshipSummary = isFriend
    ? remarkName
      ? t(msg`昵称：${targetCharacter?.name || conversation.title}`)
      : targetCharacter?.relationship || t(msg`联系人`)
    : targetCharacter?.relationship || t(msg`世界角色`);
  const backgroundLabel = getChatBackgroundLabel(
    backgroundQuery.data?.effectiveBackground ?? null,
  );
  const tagValue = friendship?.tags?.length
    ? friendship.tags.join("、")
    : t(msg`未设置`);

  useEffect(() => {
    setProfileForm({
      remarkName: friendship?.remarkName ?? "",
      tags: friendship?.tags?.join("，") ?? "",
    });
  }, [friendship?.remarkName, friendship?.tags]);

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) =>
      setConversationPinned(conversation.id, { pinned }, baseUrl),
    onSuccess: async (_, pinned) => {
      setNotice(pinned ? t(msg`聊天已置顶。`) : t(msg`聊天已取消置顶。`));
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });

  const muteMutation = useMutation({
    mutationFn: (muted: boolean) =>
      setConversationMuted(conversation.id, { muted }, baseUrl),
    onSuccess: async (_, muted) => {
      setNotice(muted ? t(msg`已开启消息免打扰。`) : t(msg`已关闭消息免打扰。`));
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });

  const setStarredMutation = useMutation({
    mutationFn: (starred: boolean) =>
      setFriendStarred(targetCharacterId, { starred }, baseUrl),
    onSuccess: async (_, starred) => {
      setNotice(starred ? t(msg`已设为星标朋友。`) : t(msg`已取消星标朋友。`));
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateFriendProfileRequest) => {
      if (!targetCharacterId || !friendship) {
        throw new Error("FRIEND_NOT_FOUND");
      }

      return updateFriendProfile(targetCharacterId, payload, baseUrl);
    },
    onSuccess: async () => {
      setNotice(t(msg`联系人资料已更新。`));
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
    // 错误反馈本身已经走面板顶部那张 updateProfileMutation.isError ErrorBlock，
    // 不要再走 setNotice：notice 上面是 InlineNotice tone="success"（绿色调，
    // 文案库里都是「已更新/已置顶」），把网络失败塞进去会出现"绿色成功条上
    // 写着‘FRIEND_NOT_FOUND’"的怪 UX。真正要修的只是 handleProfileSave
    // 那条 await mutateAsync 漏 catch（详见下方）。
  });

  const clearMutation = useMutation({
    mutationFn: () => clearConversationHistory(conversation.id, baseUrl),
    onSuccess: async () => {
      setNotice(t(msg`聊天记录已清空。`));
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
      navigateToChatWorkspace(true);
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
          reason: DESKTOP_CHAT_DETAILS_REPORT_REASON,
          details: `conversation:${conversation.id}`,
        },
        baseUrl,
      );
    },
    onSuccess: () => {
      setNotice(t(msg`已提交投诉。`));
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
          reason: DESKTOP_CHAT_DETAILS_BLOCK_REASON,
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      setNotice(t(msg`已加入黑名单。`));
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
      navigateToChatWorkspace(true);
    },
  });

  // 走查新一轮 R29：和姊妹移动端 chat-details-page R2（commit 2d6d33d57）同款
  // 修法——「星标朋友」/「置顶聊天」/「消息免打扰」3 个 toggle 行只挂了
  // `disabled={busy}`，busy = mutation.isPending 是 React state 要等 commit
  // 才进 DOM。同帧 <16ms 第二次 click 都看到 disabled=false → mutation.mutate
  // 飞 2 次，公网隧道 RTT 双倍消耗 + onSuccess 让 notice 文本闪两次。叠 sync
  // ref 锁兜同帧 double-tap，pending 翻 false 后 useEffect 复位。
  const starredSubmittingRef = useRef(false);
  const pinSubmittingRef = useRef(false);
  const muteSubmittingRef = useRef(false);
  useEffect(() => {
    if (!setStarredMutation.isPending) {
      starredSubmittingRef.current = false;
    }
  }, [setStarredMutation.isPending]);
  useEffect(() => {
    if (!pinMutation.isPending) {
      pinSubmittingRef.current = false;
    }
  }, [pinMutation.isPending]);
  useEffect(() => {
    if (!muteMutation.isPending) {
      muteSubmittingRef.current = false;
    }
  }, [muteMutation.isPending]);
  const handleToggleStarred = (next: boolean) => {
    if (starredSubmittingRef.current) {
      return;
    }
    starredSubmittingRef.current = true;
    setStarredMutation.mutate(next);
  };
  const handleTogglePin = (next: boolean) => {
    if (pinSubmittingRef.current) {
      return;
    }
    pinSubmittingRef.current = true;
    pinMutation.mutate(next);
  };
  const handleToggleMute = (next: boolean) => {
    if (muteSubmittingRef.current) {
      return;
    }
    muteSubmittingRef.current = true;
    muteMutation.mutate(next);
  };

  // 走查 R2：和姊妹 mobile chat-details-page R3（commit cdc13e28a）同款问题。
  // 单聊「聊天信息」侧栏内 8 处「点行进二级页」按钮全部走
  // `onClick={() => { void navigate({ to: ... }) }}` 形态、没挂同步 ref 守：
  // - 添加到通讯录 (handleAddToContacts, /tabs/contacts 或 /desktop/add-friend)
  // - 朋友圈 (handleOpenMoments, /desktop/friend-moments/$characterId)
  // - 共同群聊 (buildDesktopChatThreadPath)
  // - 更多资料 (/character/$characterId)
  // - 聊天文件 (/desktop/chat-files)
  // - 聊天背景 (/chat/$conversationId/background)
  // - 发起群聊 fallback (/group/new，onCreateGroup 缺省时走)
  //
  // DesktopContactProfileActionRow / DesktopContactProfileToggleRow 内 onClick
  // 没有任何 throttle，每个 tap 都直冲 navigate；同帧 <16ms 双击任一行都让
  // tanstack-router push 2 条相同 history 项 → 用户从二级页返回还要按 2 次返回
  // 才能回到 details，并且像 friend-moments / character-detail 这种二级页
  // mount 时拉网络数据的，第二次也会重复 RTT 一次（公网隧道 ~600ms）。
  //
  // 加一把共享 rowNavigateFiredRef + guardRowNavigation 包装器（和姊妹
  // backFiredRef / chat-details-page guardRowNavigation 同款写法），同 mount
  // 内首次 click 后所有后续 row click 直接 noop，raf 后释放兜底 navigate 没
  // 真正切走的边界（例如 disabled / dialog 拦截）。
  const rowNavigateFiredRef = useRef(false);
  const guardRowNavigation = useCallback(
    <Args extends unknown[]>(handler: (...args: Args) => void) => {
      return (...args: Args) => {
        if (rowNavigateFiredRef.current) return;
        rowNavigateFiredRef.current = true;
        handler(...args);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            rowNavigateFiredRef.current = false;
          });
        }
      };
    },
    [],
  );

  const handleAddToContacts = guardRowNavigation(() => {
    if (!targetCharacterId) {
      return;
    }

    if (hasPendingFriendRequest) {
      void navigate({
        to: "/tabs/contacts",
        hash: buildDesktopContactsRouteHash({
          pane: "new-friends",
          showWorldCharacters: false,
        }),
      });
      return;
    }

    void navigate({
      to: "/desktop/add-friend",
      hash: buildDesktopAddFriendRouteHash({
        keyword: targetCharacter?.name || conversation.title || "",
        characterId: targetCharacterId,
        openCompose: true,
      }),
    });
  });

  const handleOpenMoments = guardRowNavigation(() => {
    if (!isFriend || !targetCharacterId) {
      return;
    }

    void navigate({
      to: "/desktop/friend-moments/$characterId",
      params: { characterId: targetCharacterId },
      hash: buildDesktopFriendMomentsRouteHash({
        source: "chat-details",
        returnPath: "/tabs/chat",
        returnHash: buildDesktopChatRouteHash({
          conversationId: conversation.id,
          panel: "details",
        }),
      }),
    });
  });

  const currentEditDialog =
    editingField === "remarkName"
      ? {
          title: t(msg`设置备注`),
          description: t(msg`备注名会优先显示在聊天信息和通讯录里。`),
          placeholder: t(msg`给联系人设置备注名`),
          initialValue: profileForm.remarkName,
          onConfirm: async (value: string) => {
            const nextForm = { ...profileForm, remarkName: value };
            setProfileForm(nextForm);
            const saved = await handleProfileSave(nextForm);
            if (saved) {
              setEditingField(null);
            }
          },
        }
      : editingField === "tags"
        ? {
            title: t(msg`设置标签`),
            description: t(msg`用逗号分隔多个标签，例如：同事，插画，策展。`),
            placeholder: t(msg`输入联系人标签`),
            initialValue: profileForm.tags,
            onConfirm: async (value: string) => {
              const nextForm = { ...profileForm, tags: value };
              setProfileForm(nextForm);
              const saved = await handleProfileSave(nextForm);
              if (saved) {
                setEditingField(null);
              }
            },
          }
        : null;

  async function handleProfileSave(nextForm: {
    remarkName: string;
    tags: string;
  }) {
    // 旧版直接 await mutateAsync 不 catch：mutation 失败时 mutateAsync 会
    // reject 一路冒到 currentEditDialog.onConfirm → 父层的
    // `void currentEditDialog.onConfirm(value)` 漏接，落 window
    // unhandledrejection。这里改成 try/catch — 成功 / 失败由 mutation
    // 的 onSuccess / onError 各自负责写 notice，函数只负责告诉调用方该不
    // 该关弹层。
    try {
      await updateProfileMutation.mutateAsync({
        remarkName: nextForm.remarkName.trim() || null,
        tags: nextForm.tags
          .split(/[，,]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      return true;
    } catch {
      return false;
    }
  }

  const busy =
    setStarredMutation.isPending ||
    updateProfileMutation.isPending ||
    pinMutation.isPending ||
    muteMutation.isPending ||
    clearMutation.isPending ||
    hideMutation.isPending ||
    reportMutation.isPending ||
    blockMutation.isPending;
  const activeConfirm =
    confirmAction === "hide"
      ? {
          title: t(msg`删除聊天`),
          description:
            t(msg`删除后，这段聊天会从消息列表中移除；有新消息时会再次出现。`),
          confirmLabel: t(msg`删除聊天`),
          pendingLabel: t(msg`正在删除...`),
          onConfirm: () => {
            setConfirmAction(null);
            hideMutation.mutate();
          },
        }
      : confirmAction === "clear"
        ? {
            title: t(msg`清空聊天记录`),
            description: t(msg`确认清空这段聊天记录吗？此操作只影响当前会话视图。`),
            confirmLabel: t(msg`清空记录`),
            pendingLabel: t(msg`正在清空...`),
            danger: true,
            onConfirm: () => {
              setConfirmAction(null);
              clearMutation.mutate();
            },
          }
        : confirmAction === "report"
          ? {
              title: t(msg`提交投诉`),
              description:
                t(msg`确认提交投诉吗？系统会记录当前会话上下文用于后续处理。`),
              confirmLabel: t(msg`提交投诉`),
              pendingLabel: t(msg`正在提交...`),
              danger: true,
              onConfirm: () => {
                setConfirmAction(null);
                reportMutation.mutate();
              },
            }
          : confirmAction === "block"
            ? {
                title: t(msg`加入黑名单`),
                description:
                  t(msg`加入黑名单后，将不再接收该角色的互动。确认继续吗？`),
                confirmLabel: t(msg`加入黑名单`),
                pendingLabel: t(msg`正在加入...`),
                danger: true,
                onConfirm: () => {
                  setConfirmAction(null);
                  blockMutation.mutate();
                },
              }
            : null;

  return (
    <div className="space-y-2 bg-[#f5f5f5] px-3 pb-6 pt-3">
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
      {setStarredMutation.isError &&
      setStarredMutation.error instanceof Error ? (
        <ErrorBlock message={setStarredMutation.error.message} />
      ) : null}
      {updateProfileMutation.isError &&
      updateProfileMutation.error instanceof Error ? (
        <ErrorBlock message={updateProfileMutation.error.message} />
      ) : null}
      {/* 走查新一轮 R1：pin / mute / clear / hide / report / block 6 个 mutation
          都只挂了 onSuccess，错误路径完全静默 — server 返 4xx/5xx 时用户在 UI
          上看不到任何反馈，会反复点同一个按钮（toggle 行尤其坑：conversation.isPinned
          props 没翻，按钮视觉上没变化，用户以为没点中）。和姊妹 setStarred /
          updateProfile 同款，把 isError 接入 ErrorBlock 列表。 */}
      {pinMutation.isError && pinMutation.error instanceof Error ? (
        <ErrorBlock message={pinMutation.error.message} />
      ) : null}
      {muteMutation.isError && muteMutation.error instanceof Error ? (
        <ErrorBlock message={muteMutation.error.message} />
      ) : null}
      {clearMutation.isError && clearMutation.error instanceof Error ? (
        <ErrorBlock message={clearMutation.error.message} />
      ) : null}
      {hideMutation.isError && hideMutation.error instanceof Error ? (
        <ErrorBlock message={hideMutation.error.message} />
      ) : null}
      {reportMutation.isError && reportMutation.error instanceof Error ? (
        <ErrorBlock message={reportMutation.error.message} />
      ) : null}
      {blockMutation.isError && blockMutation.error instanceof Error ? (
        <ErrorBlock message={blockMutation.error.message} />
      ) : null}

      <DesktopContactProfileHeader
        avatar={targetCharacter?.avatar}
        name={targetCharacter?.name || conversation.title}
        displayName={displayName}
        subline={relationshipSummary}
        compact
        action={
          !isFriend ? (
            <Button
              type="button"
              variant="primary"
              onClick={handleAddToContacts}
              disabled={busy || !targetCharacterId}
              className="rounded-[10px] bg-[#07c160] px-4 text-white shadow-none hover:bg-[#06ad56]"
            >
              {hasPendingFriendRequest ? t(msg`待处理`) : t(msg`添加到通讯录`)}
            </Button>
          ) : undefined
        }
      />

      {characterQuery.isLoading ? (
        <DesktopContactProfileSection title={t(msg`资料`)}>
          <div className="px-6 py-4">
            <LoadingBlock label={t(msg`正在读取聊天信息...`)} />
          </div>
        </DesktopContactProfileSection>
      ) : (
        <>
          <DesktopContactProfileSection title={t(msg`基础资料`)}>
            {isFriend ? (
              <>
                <DesktopContactProfileActionRow
                  label={t(msg`备注`)}
                  value={remarkName || t(msg`未设置`)}
                  onClick={() => setEditingField("remarkName")}
                  valueMuted={!remarkName}
                />
                <DesktopContactProfileRow
                  label={t(msg`昵称`)}
                  value={targetCharacter?.name || conversation.title}
                />
                <DesktopContactProfileRow
                  label={t(msg`个性签名`)}
                  value={signature}
                  multiline
                  muted={
                    !targetCharacter?.currentStatus?.trim() &&
                    !targetCharacter?.bio?.trim()
                  }
                />
                <DesktopContactProfileRow
                  label={t(msg`隐界号`)}
                  value={identifier ?? t(msg`未设置`)}
                  muted={!identifier}
                />
                <DesktopContactProfileRow
                  label={t(msg`地区`)}
                  value={
                    friendship?.region?.trim() ||
                    targetCharacter?.region?.trim() ||
                    t(msg`未设置`)
                  }
                  muted={
                    !friendship?.region?.trim() &&
                    !targetCharacter?.region?.trim()
                  }
                />
                <DesktopContactProfileRow
                  label={t(msg`来源`)}
                  value={friendship?.source?.trim() || t(msg`未设置`)}
                  muted={!friendship?.source?.trim()}
                />
                <DesktopContactProfileActionRow
                  label={t(msg`标签`)}
                  value={tagValue}
                  onClick={() => setEditingField("tags")}
                  valueMuted={!friendship?.tags?.length}
                />
              </>
            ) : (
              <>
                <DesktopContactProfileRow
                  label={t(msg`昵称`)}
                  value={targetCharacter?.name || conversation.title}
                />
                <DesktopContactProfileRow
                  label={t(msg`身份`)}
                  value={targetCharacter?.relationship || t(msg`世界角色`)}
                />
                <DesktopContactProfileRow
                  label={t(msg`个性签名`)}
                  value={signature}
                  multiline
                  muted={
                    !targetCharacter?.currentStatus?.trim() &&
                    !targetCharacter?.bio?.trim()
                  }
                />
                <DesktopContactProfileRow
                  label={t(msg`隐界号`)}
                  value={identifier ?? t(msg`未设置`)}
                  muted={!identifier}
                />
              </>
            )}
          </DesktopContactProfileSection>

          <DesktopContactProfileSection title={t(msg`内容入口`)}>
            <DesktopContactProfileActionRow
              label={t(msg`朋友圈`)}
              value={t(msg`查看这位角色最近的朋友圈`)}
              onClick={handleOpenMoments}
            />
            <DesktopContactProfileActionRow
              label={t(msg`共同群聊`)}
              value={
                commonGroups.length
                  ? t(msg`${commonGroups.length} 个共同群聊`)
                  : t(msg`暂时没有共同群聊`)
              }
              onClick={guardRowNavigation(() => {
                if (!commonGroups[0]) {
                  return;
                }

                void navigate({
                  to: buildDesktopChatThreadPath({
                    conversationId: commonGroups[0].id,
                  }),
                });
              })}
              disabled={!commonGroups.length}
              valueMuted={!commonGroups.length}
            />
            <DesktopContactProfileActionRow
              label={t(msg`更多资料`)}
              value={
                isFriend
                  ? t(msg`查看角色档案与扩展介绍`)
                  : t(msg`查看角色资料`)
              }
              onClick={guardRowNavigation(() => {
                if (!targetCharacterId) {
                  return;
                }

                void navigate({
                  to: "/character/$characterId",
                  params: { characterId: targetCharacterId },
                  hash: buildCharacterDetailRouteHash({
                    returnPath: "/tabs/chat",
                    returnHash: buildDesktopChatRouteHash({
                      conversationId: conversation.id,
                      panel: "details",
                    }),
                  }),
                });
              })}
              disabled={!targetCharacterId}
            />
          </DesktopContactProfileSection>

          <DesktopContactProfileSection title={t(msg`聊天信息`)}>
            <DesktopContactProfileActionRow
              label={t(msg`查找记录`)}
              value={t(msg`搜索当前聊天`)}
              onClick={onOpenHistory}
            />
            <DesktopContactProfileActionRow
              label={t(msg`聊天文件`)}
              value={t(msg`查看本聊天附件`)}
              onClick={guardRowNavigation(() => {
                void navigate({
                  to: "/desktop/chat-files",
                  hash: buildDesktopChatFilesRouteHash(conversation.id),
                });
              })}
            />
            <DesktopContactProfileActionRow
              label={t(msg`聊天背景`)}
              value={backgroundLabel}
              onClick={guardRowNavigation(() => {
                void navigate({
                  to: "/chat/$conversationId/background",
                  params: { conversationId: conversation.id },
                  hash: buildMobileChatRouteHash({
                    returnPath: "/tabs/chat",
                    returnHash: buildDesktopChatRouteHash({
                      conversationId: conversation.id,
                      panel: "details",
                    }),
                  }),
                });
              })}
            />
            <DesktopContactProfileActionRow
              label={t(msg`发起群聊`)}
              value={t(msg`和对方创建新群`)}
              onClick={guardRowNavigation(() => {
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
                    returnPath: "/tabs/chat",
                    returnHash: buildDesktopChatRouteHash({
                      conversationId: conversation.id,
                      panel: "details",
                    }),
                  }),
                });
              })}
            />
          </DesktopContactProfileSection>

          {isFriend ? (
            <DesktopContactProfileSection title={t(msg`聊天设置`)}>
              <DesktopContactProfileToggleRow
                label={t(msg`星标朋友`)}
                checked={friendship?.isStarred ?? false}
                disabled={busy}
                onToggle={() =>
                  handleToggleStarred(!(friendship?.isStarred ?? false))
                }
              />
              <DesktopContactProfileToggleRow
                label={t(msg`置顶聊天`)}
                checked={conversation.isPinned}
                disabled={busy}
                onToggle={() => handleTogglePin(!conversation.isPinned)}
              />
              <DesktopContactProfileToggleRow
                label={t(msg`消息免打扰`)}
                checked={conversation.isMuted}
                disabled={busy}
                onToggle={() => handleToggleMute(!conversation.isMuted)}
              />
            </DesktopContactProfileSection>
          ) : null}

          <DesktopContactProfileSection
            title={isFriend ? t(msg`联系人管理`) : t(msg`聊天管理`)}
          >
            {isFriend ? (
              <DesktopContactProfileActionRow
                label={t(msg`加入黑名单`)}
                value={
                  isBlocked
                    ? t(msg`已加入黑名单`)
                    : t(msg`不再接收该角色互动`)
                }
                danger
                disabled={busy || isBlocked || !targetCharacterId}
                onClick={() => setConfirmAction("block")}
              />
            ) : null}
            {!isFriend ? (
              <DesktopContactProfileActionRow
                label={t(msg`添加到通讯录`)}
                value={
                  hasPendingFriendRequest
                    ? t(msg`待处理`)
                    : t(msg`发送好友申请`)
                }
                disabled={busy || !targetCharacterId}
                onClick={handleAddToContacts}
              />
            ) : null}
            <DesktopContactProfileActionRow
              label={t(msg`删除聊天`)}
              value={t(msg`从消息列表移除`)}
              disabled={busy}
              onClick={() => setConfirmAction("hide")}
            />
            <DesktopContactProfileActionRow
              label={t(msg`清空聊天记录`)}
              value={t(msg`删除当前聊天内容`)}
              danger
              disabled={busy}
              onClick={() => setConfirmAction("clear")}
            />
            <DesktopContactProfileActionRow
              label={t(msg`投诉`)}
              value={t(msg`提交聊天相关投诉`)}
              danger
              disabled={busy || !targetCharacterId}
              onClick={() => setConfirmAction("report")}
            />
          </DesktopContactProfileSection>
        </>
      )}

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
      {currentEditDialog ? (
        <DesktopContactTextEditDialog
          open
          title={currentEditDialog.title}
          description={currentEditDialog.description}
          placeholder={currentEditDialog.placeholder}
          initialValue={currentEditDialog.initialValue}
          pending={updateProfileMutation.isPending}
          // 走查新一轮 R26：updateProfileMutation 错误反馈在面板顶部那张
          // ErrorBlock 渲染，但 dialog 打开时 backdrop 把面板整片遮住，错误
          // 信息看不到。用户改备注 / 标签失败时只看到 dialog 没关、按钮回到
          // 「保存」状态，分不清是"刚才保存了一下没反应"还是"还没保存"。
          // DesktopContactTextEditDialog 内置 error 槽，把 mutation.error
          // 透传过去渲染在保存按钮上方。
          error={
            updateProfileMutation.isError &&
            updateProfileMutation.error instanceof Error
              ? updateProfileMutation.error.message
              : null
          }
          onClose={() => setEditingField(null)}
          onConfirm={(value: string) => {
            void currentEditDialog.onConfirm(value);
          }}
        />
      ) : null}
    </div>
  );
}

function GroupChatDetailsPanel({
  conversation,
  actionRequest,
  onOpenHistory,
}: DesktopChatDetailsPanelProps) {
  const t = translateRuntimeMessage;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const navigateToChatWorkspace = useCallback(
    (replace = false) => {
      void navigate({
        to: "/tabs/chat",
        search: {},
        hash: undefined,
        replace,
      });
    },
    [navigate],
  );
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

  // 走查电脑端群聊 R1：和姊妹 DirectChatDetailsPanel R2（commit 34f317955 —
  // 「聊天信息」侧栏 8 处行进二级页缺同帧双击 ref 守）/ 移动端 chat-details
  // R3（commit cdc13e28a）同款问题。本群聊「聊天信息」侧栏下方 3 处行进
  // 二级页 row 全部裸跑 `onClick={() => { void navigate({ to: ... }) }}`：
  //   - 群二维码 → /group/$groupId/qr （line 1868-1888）
  //   - 聊天文件 → /desktop/chat-files （line 1894-1903）
  //   - 聊天背景 → /group/$groupId/background （line 1973-1989）
  // DesktopWechatGroupRow 内 onClick 没有任何 throttle，每个 tap 都直冲
  // navigate；同帧 <16ms 双击任一行都让 tanstack-router push 2 条相同
  // history 项 → 用户从二级页返回还要按 2 次返回才能回到 details；并且
  // chat-files / group-qr / chat-background 几个二级页 mount 时各自拉网络
  // 数据（getGroupAttachments / getGroupBackground / getGroupQrcode），第二次
  // 也会重复 RTT 一次（公网隧道 ~600ms）。
  // 加一把共享 rowNavigateFiredRef + guardRowNavigation 包装器（和姊妹
  // DirectChatDetailsPanel 同款写法），同 mount 内首次 click 后所有后续 row
  // click 直接 noop，raf 后释放兜底"navigate 没真正切走"（disabled/dialog 拦截）
  // 的边界。
  const rowNavigateFiredRef = useRef(false);
  const guardRowNavigation = useCallback(
    <Args extends unknown[]>(handler: (...args: Args) => void) => {
      return (...args: Args) => {
        if (rowNavigateFiredRef.current) return;
        rowNavigateFiredRef.current = true;
        handler(...args);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            rowNavigateFiredRef.current = false;
          });
        }
      };
    },
    [],
  );

  const handleOpenGroupQr = guardRowNavigation(() => {
    void navigate({
      to: "/group/$groupId/qr",
      params: { groupId: conversation.id },
      search: buildGroupInviteReturnSearch({
        conversationPath: `/group/${conversation.id}`,
        conversationTitle: groupQuery.data?.name || conversation.title,
      }),
      hash: buildMobileGroupRouteHash({
        returnPath: "/tabs/chat",
        returnHash: buildDesktopChatRouteHash({
          conversationId: conversation.id,
          panel: "details",
        }),
      }),
    });
  });

  const handleOpenChatFiles = guardRowNavigation(() => {
    void navigate({
      to: "/desktop/chat-files",
      hash: buildDesktopChatFilesRouteHash(conversation.id),
    });
  });

  const handleOpenChatBackground = guardRowNavigation(() => {
    void navigate({
      to: "/group/$groupId/background",
      params: { groupId: conversation.id },
      hash: buildMobileGroupRouteHash({
        returnPath: "/tabs/chat",
        returnHash: buildDesktopChatRouteHash({
          conversationId: conversation.id,
          panel: "details",
        }),
      }),
    });
  });

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!actionRequest) {
      return;
    }

    if (
      actionRequest.kind === "member-add" ||
      actionRequest.kind === "member-remove"
    ) {
      setMemberBrowserOpen(false);
      setMemberBrowserAutoFocusSearch(false);
      setMemberPickerMode(actionRequest.kind === "member-add" ? "add" : "remove");
      setMemberPickerOpen(true);
      return;
    }

    if (actionRequest.kind === "member-search") {
      setMemberBrowserAutoFocusSearch(true);
      setMemberBrowserOpen(true);
      return;
    }

    if (actionRequest.kind === "announcement") {
      setEditorMode("announcement");
      return;
    }

    if (actionRequest.kind === "group-name") {
      setEditorMode("name");
      return;
    }

    if (actionRequest.kind === "group-nickname") {
      setEditorMode("nickname");
    }
  }, [actionRequest]);

  // 同上方 DirectChatDetailsPanel 走查 R1：群聊「聊天信息」侧栏 3 份 cache
  // 都缺 staleTime，开侧栏重 mount 3 路并发 RTT，对齐其他页面 15s。
  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, conversation.id],
    queryFn: () => getGroup(conversation.id, baseUrl),
    staleTime: 15_000,
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, conversation.id],
    queryFn: () => getGroupMembers(conversation.id, baseUrl),
    staleTime: 15_000,
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });

  const backgroundLabel = getChatBackgroundLabel(
    backgroundQuery.data?.effectiveBackground ?? null,
  );

  const updateGroupMutation = useMutation({
    mutationFn: (payload: { name?: string; announcement?: string | null }) =>
      updateGroup(conversation.id, payload, baseUrl),
    onSuccess: async (_, payload) => {
      setEditorMode(null);
      setNotice(
        payload.name ? t(msg`群聊名称已更新。`) : t(msg`群公告已更新。`),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-contact-groups", baseUrl],
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
      setNotice(pinned ? t(msg`群聊已置顶。`) : t(msg`群聊已取消置顶。`));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-contact-groups", baseUrl],
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
            ? t(msg`已开启群消息免打扰。`)
            : t(msg`已关闭群消息免打扰。`)
          : payload.savedToContacts !== undefined
            ? payload.savedToContacts
              ? t(msg`已保存到通讯录。`)
              : t(msg`已从通讯录移除。`)
            : payload.showMemberNicknames !== undefined
              ? payload.showMemberNicknames
                ? t(msg`已开启显示群成员昵称。`)
                : t(msg`已关闭显示群成员昵称。`)
              : payload.notifyOnAtMe !== undefined
                ? payload.notifyOnAtMe
                  ? t(msg`开启了 @我 通知。`)
                  : t(msg`关闭了 @我 通知。`)
                : payload.notifyOnAtAll !== undefined
                  ? payload.notifyOnAtAll
                    ? t(msg`开启了 @所有人 通知。`)
                    : t(msg`关闭了 @所有人 通知。`)
                  : payload.notifyOnAnnouncement !== undefined
                    ? payload.notifyOnAnnouncement
                      ? t(msg`开启了群公告通知。`)
                      : t(msg`关闭了群公告通知。`)
                    : t(msg`群聊设置已更新。`);

      setNotice(nextNotice);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, conversation.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-contact-groups", baseUrl],
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
      setNotice(t(msg`我在本群的昵称已更新。`));
      await queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, conversation.id],
      });
    },
  });

  const addMembersMutation = useMutation({
    // 走查桌面端群聊 R1：原版顺序 `for await addGroupMember` —— 公网隧道 ~600ms
    // RTT × N 个成员，选 5 个就要等 3 秒按钮一直 disabled。removeMembersMutation
    // 已经用 Promise.all 并发 DELETE，add 路径维持串行没有特殊理由（server
    // 端 addMember 对重复成员幂等返回 existing，相互之间无序）。对齐 remove
    // 路径，并发起 N 路 POST，5 个成员从 3s 降到 ~600ms。
    //
    // 新一轮走查 R2：和姊妹 chat-message-list R1 (commit 279cd8f41 — 多选收藏
    // Promise.all 失败一条全批 throw) 同款 partial-success 修法。原版 Promise.all
    // 一条 addGroupMember 抛错就整段 await throw（公网 timeout / cloud token 续期
    // 都可能），但前 K 条已经成功落库——server 端已加 K 个成员、frontend 显示
    // ErrorBlock 但 notice 没说成功了几个。用户重选同样 N 个再试 → 前 K 个 server
    // 端幂等返回 existing 不报错（add 是幂等的）→ 但用户其实不知道刚才已经成功
    // K 个。改成 Promise.allSettled：全失败时仍 throw 触发 ErrorBlock 兜底，
    // 部分成功时 onSuccess 给出"已添加 N 位；剩余 M 位添加失败：reason"，让用户
    // 基于真实状态决定要不要继续操作。
    mutationFn: async (memberIds: string[]) => {
      const results = await Promise.allSettled(
        memberIds.map((memberId) =>
          addGroupMember(
            conversation.id,
            {
              memberId,
              memberType: "character",
            },
            baseUrl,
          ),
        ),
      );
      const succeededIds: string[] = [];
      const failures: Array<{ memberId: string; error: unknown }> = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          succeededIds.push(memberIds[index]!);
        } else {
          failures.push({
            memberId: memberIds[index]!,
            error: result.reason,
          });
        }
      });
      if (succeededIds.length === 0 && failures.length > 0) {
        throw failures[0]!.error;
      }
      return { succeededIds, failures };
    },
    onSuccess: async (result) => {
      const { succeededIds, failures } = result;
      if (failures.length === 0) {
        setNotice(
          succeededIds.length === 1
            ? t(msg`已添加 1 位群成员。`)
            : t(msg`已添加 ${succeededIds.length} 位群成员。`),
        );
      } else {
        const firstError = failures[0]!.error;
        const errorMessage =
          firstError instanceof Error && firstError.message
            ? firstError.message
            : "";
        setNotice(
          errorMessage
            ? t(
                msg`已添加 ${succeededIds.length} 位；剩余 ${failures.length} 位添加失败：${errorMessage}`,
              )
            : t(
                msg`已添加 ${succeededIds.length} 位；剩余 ${failures.length} 位添加失败，请稍后再试。`,
              ),
        );
      }
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
      setNotice(t(msg`群聊记录已清空。`));
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
    // 新一轮走查 R2：和姊妹 chat-message-list R1 (commit 279cd8f41) / 上方
    // addMembersMutation 同款 partial-success 修法。原版 Promise.all 一条
    // removeGroupMember 抛错就整段 throw——remove 路径比 add 路径更敏感，
    // server 端对"已删除成员"硬抛 CHAT_GROUP_MEMBER_NOT_FOUND（add 是幂等
    // 返回 existing），但偏偏 picker 的同帧 double-click 由 picker R1 的
    // sync ref 拦掉了，所以这条 path 现在主要是公网 timeout 部分失败：选 5 个
    // 移除、中间 1 个超时 → 前 K 个其实已经从群里 DELETE 成功、UI 却只显示
    // "移除失败"红条 → 用户再选剩下重试，前 K 个 server 端返回 NOT_FOUND
    // 又"移除失败"。Promise.allSettled 部分成功时给出"已移除 N 位；剩余 M 位
    // 移除失败：reason"，全失败时仍 throw 触发 ErrorBlock。
    mutationFn: async (memberIds: string[]) => {
      const results = await Promise.allSettled(
        memberIds.map((memberId) =>
          removeGroupMember(conversation.id, memberId, baseUrl),
        ),
      );
      const succeededIds: string[] = [];
      const failures: Array<{ memberId: string; error: unknown }> = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          succeededIds.push(memberIds[index]!);
        } else {
          failures.push({
            memberId: memberIds[index]!,
            error: result.reason,
          });
        }
      });
      if (succeededIds.length === 0 && failures.length > 0) {
        throw failures[0]!.error;
      }
      return { succeededIds, failures };
    },
    onSuccess: async (result) => {
      const { succeededIds, failures } = result;
      if (failures.length === 0) {
        setNotice(
          succeededIds.length === 1
            ? t(msg`已移除 1 位群成员。`)
            : t(msg`已移除 ${succeededIds.length} 位群成员。`),
        );
      } else {
        const firstError = failures[0]!.error;
        const errorMessage =
          firstError instanceof Error && firstError.message
            ? firstError.message
            : "";
        setNotice(
          errorMessage
            ? t(
                msg`已移除 ${succeededIds.length} 位；剩余 ${failures.length} 位移除失败：${errorMessage}`,
              )
            : t(
                msg`已移除 ${succeededIds.length} 位；剩余 ${failures.length} 位移除失败，请稍后再试。`,
              ),
        );
      }
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
          queryKey: ["app-contact-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      navigateToChatWorkspace(true);
    },
  });

  // 新一轮走查 R1：和姊妹单聊 R29（commit 01dcc31c6）/ 移动端 R2（2d6d33d57）
  // 同款修法——「聊天信息」侧栏一共 7 个群聊 toggle 行（消息免打扰 / @我仍通知
  // / @所有人仍通知 / 群公告仍通知 / 置顶聊天 / 保存到通讯录 / 显示群成员昵称）
  // 都只挂了 `disabled={busy}`，busy = mutation.isPending 是 React state 要等
  // commit 才进 DOM。同帧 <16ms 第二次 click 都看到 disabled=false → mutation.
  // mutate 飞 2 次，公网隧道 RTT 双倍消耗 + onSuccess 让 notice 文本闪两次
  // （比如「已开启群消息免打扰」连刷两遍）。叠 sync ref 锁兜同帧 double-tap，
  // pending 翻 false 后 useEffect 复位。preferencesMutation 被 6 个 toggle 共用，
  // 共一把 ref 锁——同帧切两个不同偏好的极端 case 也被挡掉，但用户单击一个
  // toggle 后 RTT 内换另一个 toggle（人类反应时间 >100ms）走的是 disabled
  // 路径，正常通过。
  const pinSubmittingRef = useRef(false);
  const preferencesSubmittingRef = useRef(false);
  useEffect(() => {
    if (!pinMutation.isPending) {
      pinSubmittingRef.current = false;
    }
  }, [pinMutation.isPending]);
  useEffect(() => {
    if (!preferencesMutation.isPending) {
      preferencesSubmittingRef.current = false;
    }
  }, [preferencesMutation.isPending]);
  const handleTogglePin = (next: boolean) => {
    if (pinSubmittingRef.current) {
      return;
    }
    pinSubmittingRef.current = true;
    pinMutation.mutate(next);
  };
  const handleTogglePreferences = (
    payload: Parameters<typeof preferencesMutation.mutate>[0],
  ) => {
    if (preferencesSubmittingRef.current) {
      return;
    }
    preferencesSubmittingRef.current = true;
    preferencesMutation.mutate(payload);
  };

  const ownerMember = useMemo(
    () =>
      (membersQuery.data ?? []).find(
        (item) => item.role === "owner" && item.memberType === "user",
      ),
    [membersQuery.data],
  );
  const friendMap = useMemo<Map<string, FriendListItem>>(
    () =>
      new Map(
        (friendsQuery.data ?? []).map(
          (item) => [item.character.id, item] as const,
        ),
      ),
    [friendsQuery.data],
  );
  const resolveGroupMemberDisplayName = useCallback(
    (member: GroupMember) => {
      if (member.memberType !== "character") {
        return member.memberName?.trim() || member.memberId;
      }

      const friend = friendMap.get(member.memberId);
      if (friend) {
        return getFriendDisplayName(friend);
      }

      return member.memberName?.trim() || member.memberId;
    },
    [friendMap],
  );

  // 走查电脑端群聊 R2：原版下方 JSX 里 existingMemberIds={(membersQuery.data ?? []).map(...)}
  // 直接在 JSX 里 .map 出 array → 每次 GroupChatDetailsPanel re-render（typing
  // socket / messages 流 / conversations 60s 轮询透传 conversation prop 都会
  // 让父 workspace 重渲带本侧栏一起）都 new 一份 array。picker 内 existingMemberIdSet
  // useMemo 依赖这个 array 引用 → set 重建 → availableFriends useMemo 跟着失效
  //（filter × 70+ 好友 × toLowerCase + matchesFriendSearch 多路 haystack），
  // 弹层打开期间每个父 tick 都 O(N) 白扫一次。锁住引用让 picker 内 deferredSearchTerm
  // 真正起作用。removableMembers 已经 useMemo（line 1583），口径对齐。
  const existingMemberIds = useMemo(
    () => (membersQuery.data ?? []).map((item) => item.memberId),
    [membersQuery.data],
  );

  const removableMembers = useMemo(
    () =>
      (membersQuery.data ?? [])
        .filter((item) => item.memberType === "character")
        .map((item) => ({
          id: item.memberId,
          name: resolveGroupMemberDisplayName(item),
          subtitle:
            resolveGroupMemberDisplayName(item) !==
            (item.memberName?.trim() || item.memberId)
              ? t(
                  msg`昵称：${item.memberName?.trim() || item.memberId} · ${
                    item.role === "admin" ? t(msg`管理员`) : t(msg`群成员`)
                  }`,
                )
              : item.role === "admin"
                ? t(msg`管理员`)
                : t(msg`群成员`),
          avatar: item.memberAvatar,
        })),
    [membersQuery.data, resolveGroupMemberDisplayName, t],
  );
  const groupMembers = membersQuery.data ?? [];
  const ownerDisplayName = ownerMember?.memberName?.trim() || t(msg`我`);

  const group = groupQuery.data;
  // 走查桌面端群聊 R1：原版每次 render 重建 memberItems 数组 + 重建所有 onClick
  // 闭包 + 重建 add/remove 两个 action 对象 → DesktopWechatMemberGrid 子组件全部
  // 拿到新 props 引用全量重渲。GroupChatDetailsPanel 的高频 render 源很多
  // （typing socket / messages stream / conversations 60s 轮询都会让父 workspace
  // re-render 透传 conversation prop）。conversation.id / conversation.title /
  // group?.name / groupMembers 引用都稳定时（无变化时），整段直接复用旧引用。
  const groupNameOrTitle = group?.name || conversation.title;
  const memberItems = useMemo<DesktopMemberGridItem[]>(
    () => [
      ...groupMembers
        .slice(0, DESKTOP_GROUP_MEMBER_PREVIEW_COUNT)
        .map((member) => ({
          key: member.id,
          label: resolveGroupMemberDisplayName(member),
          src: member.memberAvatar,
          onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
            if (member.memberType === "character") {
              setAvatarPopover({
                anchorElement: event.currentTarget,
                kind: "character",
                characterId: member.memberId,
                fallbackName: resolveGroupMemberDisplayName(member),
                fallbackAvatar: member.memberAvatar,
                threadContext: {
                  id: conversation.id,
                  type: "group",
                  title: groupNameOrTitle,
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
        label: t(msg`添加`),
        kind: "add" as const,
        onClick: () => {
          setMemberPickerMode("add");
          setMemberPickerOpen(true);
        },
      },
      {
        key: "remove",
        label: t(msg`移除`),
        kind: "remove" as const,
        onClick: () => {
          setMemberPickerMode("remove");
          setMemberPickerOpen(true);
        },
      },
    ],
    [
      conversation.id,
      groupMembers,
      groupNameOrTitle,
      resolveGroupMemberDisplayName,
    ],
  );
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
          title: t(msg`修改群聊名称`),
          description: t(msg`新的名称会同步显示在聊天页和群成员列表里。`),
          placeholder: t(msg`请输入群聊名称`),
          // 走查电脑端群聊 R9：本文件 7 处兜底（line 1218 / 1736 / 1927 / 2079 /
          // 2087 / 2096 / 2134）都用 `group?.name || conversation.title`——`??`
          // 仅在 group.name 为 null/undefined 时落到 conversation.title，空串
          // group.name 不会兜回。server-side updateGroup / createGroup 已经
          // GROUP_REQUIRES_NAME 硬挡空串，但本行口径和"群聊详情侧栏 title
          // 行/侧栏标题/picker title"几处显式不一致——下游 DesktopChatTextEditDialog
          // 里 hasUserEditedRef 兜过 initialValue 漂移问题，但 confirmDisabled =
          // `normalizedDraft === normalizedInitialValue` 直接吃这个 initialValue，
          // 如果未来出现存量空 name 数据（旧库迁移 / 第三方客户端绕过验证），
          // 编辑器会把空串当 baseline，用户键入和会话列表显示一致的名称仍
          // 命中 disabled，"保存"按钮变灰。统一到 || 和其它入口口径一致。
          initialValue: group?.name || conversation.title,
          multiline: false,
          emptyAllowed: false,
          pending: updateGroupMutation.isPending,
          onConfirm: (value: string) =>
            updateGroupMutation.mutate({ name: value }),
        }
      : editorMode === "announcement"
        ? {
            title: t(msg`编辑群公告`),
            description: t(msg`支持换行。留空保存会清空当前群公告。`),
            placeholder: t(msg`输入群公告`),
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
              title: t(msg`修改我在本群的昵称`),
              description: t(
                msg`${ownerDisplayName}在这个群里的展示昵称会同步更新。`,
              ),
              placeholder: t(msg`请输入群昵称`),
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
          title: t(msg`清空聊天记录`),
          description: t(msg`仅清空当前群聊里的历史消息，群成员和群资料会继续保留。`),
          confirmLabel: t(msg`清空聊天记录`),
          pendingLabel: t(msg`正在清空...`),
          danger: true,
          onConfirm: () => {
            setConfirmAction(null);
            clearMutation.mutate();
          },
        }
      : confirmAction === "leave"
        ? {
            title: t(msg`退出群聊`),
            description:
              t(msg`退出后你将不再收到这个群的消息，当前会话也会从桌面端列表中移除。`),
            confirmLabel: t(msg`退出群聊`),
            pendingLabel: t(msg`正在退出...`),
            danger: true,
            onConfirm: () => {
              setConfirmAction(null);
              leaveMutation.mutate();
            },
          }
        : null;

  return (
    <div className="space-y-2.5 bg-[#ededed] px-0 pb-6 pt-3">
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
            <LoadingBlock label={t(msg`正在读取群成员...`)} />
          </div>
        ) : (
          <>
            <DesktopWechatMemberGrid items={memberItems} />
            <DesktopWechatGroupRow
              label={t(msg`全部群成员`)}
              value={t(msg`${groupMembers.length} 人`)}
              onClick={() => {
                setMemberBrowserAutoFocusSearch(false);
                setMemberBrowserOpen(true);
              }}
            />
          </>
        )}
      </DesktopWechatGroupSection>

      <DesktopWechatGroupSection title={t(msg`群聊资料`)}>
        <DesktopWechatGroupRow
          label={t(msg`群聊名称`)}
          value={groupQuery.data?.name || conversation.title}
          disabled={busy}
          onClick={() => setEditorMode("name")}
        />
        <DesktopWechatGroupRow
          label={t(msg`群公告`)}
          value={groupQuery.data?.announcement?.trim() || t(msg`暂无公告`)}
          multilineValue
          disabled={busy}
          onClick={() => setEditorMode("announcement")}
        />
        <DesktopWechatGroupRow
          label={t(msg`群二维码`)}
          value={t(msg`查看邀请卡`)}
          onClick={handleOpenGroupQr}
        />
        <DesktopWechatGroupRow
          label={t(msg`查找聊天记录`)}
          value={t(msg`搜索当前群消息`)}
          onClick={onOpenHistory}
        />
        <DesktopWechatGroupRow
          label={t(msg`聊天文件`)}
          value={t(msg`查看本群附件`)}
          onClick={handleOpenChatFiles}
        />
      </DesktopWechatGroupSection>

      <DesktopWechatGroupSection title={t(msg`聊天设置`)}>
        <DesktopWechatGroupRow
          label={t(msg`消息免打扰`)}
          checked={isMuted}
          disabled={busy || !group}
          onToggle={(checked) =>
            handleTogglePreferences({ isMuted: checked })
          }
        />
        {isMuted ? (
          <>
            <DesktopWechatGroupRow
              label={t(msg`@我仍通知`)}
              checked={group?.notifyOnAtMe ?? true}
              disabled={busy || !group}
              onToggle={(checked) =>
                handleTogglePreferences({ notifyOnAtMe: checked })
              }
            />
            <DesktopWechatGroupRow
              label={t(msg`@所有人仍通知`)}
              checked={group?.notifyOnAtAll ?? true}
              disabled={busy || !group}
              onToggle={(checked) =>
                handleTogglePreferences({ notifyOnAtAll: checked })
              }
            />
            <DesktopWechatGroupRow
              label={t(msg`群公告仍通知`)}
              checked={group?.notifyOnAnnouncement ?? true}
              disabled={busy || !group}
              onToggle={(checked) =>
                handleTogglePreferences({
                  notifyOnAnnouncement: checked,
                })
              }
            />
          </>
        ) : null}
        <DesktopWechatGroupRow
          label={t(msg`置顶聊天`)}
          checked={group?.isPinned ?? conversation.isPinned}
          disabled={busy || !group}
          onToggle={(checked) => handleTogglePin(checked)}
        />
        <DesktopWechatGroupRow
          label={t(msg`保存到通讯录`)}
          checked={group?.savedToContacts ?? false}
          disabled={busy || !group}
          onToggle={(checked) =>
            handleTogglePreferences({ savedToContacts: checked })
          }
        />
        <DesktopWechatGroupRow
          label={t(msg`我在本群的昵称`)}
          value={ownerMember?.memberName || t(msg`未设置`)}
          disabled={busy}
          onClick={() => setEditorMode("nickname")}
        />
        <DesktopWechatGroupRow
          label={t(msg`显示群成员昵称`)}
          checked={group?.showMemberNicknames ?? true}
          disabled={busy || !group}
          onToggle={(checked) =>
            handleTogglePreferences({ showMemberNicknames: checked })
          }
        />
        <DesktopWechatGroupRow
          label={t(msg`聊天背景`)}
          value={backgroundLabel}
          onClick={handleOpenChatBackground}
        />
      </DesktopWechatGroupSection>

      <div className="space-y-2 px-3 pt-1">
        <DesktopWechatDangerButton
          label={t(msg`清空聊天记录`)}
          disabled={busy}
          onClick={() => setConfirmAction("clear")}
        />
        <DesktopWechatDangerButton
          label={t(msg`退出群聊`)}
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
        groupName={groupQuery.data?.name || conversation.title}
        existingMemberIds={existingMemberIds}
        pending={addMembersMutation.isPending}
        onClose={() => setMemberPickerOpen(false)}
        onConfirm={(memberIds) => addMembersMutation.mutate(memberIds)}
      />
      <DesktopGroupMemberRemovalPicker
        open={memberPickerOpen && memberPickerMode === "remove"}
        groupName={groupQuery.data?.name || conversation.title}
        removableMembers={removableMembers}
        pending={removeMembersMutation.isPending}
        onClose={() => setMemberPickerOpen(false)}
        onConfirm={(memberIds) => removeMembersMutation.mutate(memberIds)}
      />
      <DesktopGroupMemberBrowserDialog
        open={memberBrowserOpen}
        autoFocusSearch={memberBrowserAutoFocusSearch}
        groupName={groupQuery.data?.name || conversation.title}
        members={groupMembers}
        resolveDisplayName={resolveGroupMemberDisplayName}
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
              fallbackName: member.memberName || member.memberId,
              fallbackAvatar: member.memberAvatar,
              threadContext: {
                id: conversation.id,
                type: "group",
                title: group?.name || conversation.title,
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
  resolveDisplayName,
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
  resolveDisplayName?: (member: GroupMember) => string;
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
  const t = translateRuntimeMessage;
  const titleId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const memberItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [searchTerm, setSearchTerm] = useState("");
  // 走查 R2：和姊妹 picker / removal-picker / create-group-dialog 同款问题。
  // filteredMembers 直接吃 searchTerm，每个 keystroke 都会同步对每位成员
  // 跑 4 路 toLowerCase 包含检查 + 三路 t(msg`群主/管理员/群成员`) 翻译查表
  // —— 30 人群一次 keystroke 至少 90 次 t() 调用。useDeferredValue 让 React
  // 优先把字打进输入框，过滤排到下个 idle 帧。同口径地把 roleLabel 的 3 条
  // 文案提到 useMemo 外的稳定常量上（searchTerm 变化不影响 roleLabels 引用）。
  const deferredSearchTerm = useDeferredValue(searchTerm);
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

  // 走查桌面端群聊 R1：成员浏览 dialog 之前 X / 点背板才能关，整个 app 其它
  // dialog（DesktopCreateGroupDialog / DesktopGroupMemberPicker 父侧栏 esc）
  // 都支持 Escape，独这个 dialog 漏掉。补 ESC 与现有 X 等价，pending 时禁用。
  // stopPropagation 避免冒泡触发外层 desktop-chat-workspace 的 dismissSidePanel
  // 把背后的"聊天信息"侧栏一起关掉。
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      // 走查电脑端群聊 R7（和 R5/R6 同款）：pending 时仍要消费 Esc，否则
      // workspace queueMicrotask 兜底跑 dismissSidePanel 把背后的"聊天信息"
      // 侧栏偷关掉，本 dialog 因为 pending 不真关，结果"按 Esc 没关 dialog
      // 倒把侧栏弄没了"。
      event.preventDefault();
      event.stopPropagation();
      if (pending) {
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  // 走查桌面端群聊 R1：原版 3 路 useMemo 各自跑一遍 members.filter，3 倍 O(N)
  // 比较。N 通常 5-30 但 dialog 一打开各种 dep 变化（searchTerm / activeFilter
  // / activeMemberId / members 父级 30s 轮询）会让父 useMemo 阵列连续重算。
  // 合并到一次 reduce 算清三类——同样的 O(N)，但 cache 友好；引用上由
  // useMemo 自动 dedupe（members ref 不变就返回旧对象，filterTabs 那行 inline
  // 也跟着不重建）。
  const roleCounts = useMemo(() => {
    let owner = 0;
    let admin = 0;
    let character = 0;
    for (const member of members) {
      if (member.role === "owner") owner += 1;
      if (member.role === "admin") admin += 1;
      if (member.memberType === "character") character += 1;
    }
    return { owner, admin, character };
  }, [members]);
  const ownerCount = roleCounts.owner;
  const adminCount = roleCounts.admin;
  const characterCount = roleCounts.character;
  const filterTabs: Array<{
    id: DesktopGroupMemberBrowserFilter;
    label: string;
    count: number;
  }> = [
    { id: "all", label: t(msg`全部`), count: members.length },
    { id: "owner", label: t(msg`群主`), count: ownerCount },
    { id: "admin", label: t(msg`管理员`), count: adminCount },
    { id: "character", label: t(msg`角色成员`), count: characterCount },
  ];

  const roleLabels = useMemo(
    () => ({
      owner: t(msg`群主`),
      admin: t(msg`管理员`),
      member: t(msg`群成员`),
    }),
    [t],
  );
  const filteredMembers = useMemo(() => {
    const keyword = deferredSearchTerm.trim().toLowerCase();
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

      const displayName = resolveDisplayName
        ? resolveDisplayName(member)
        : (member.memberName || member.memberId);
      const rawName = member.memberName || member.memberId;
      const roleLabel =
        member.role === "owner"
          ? roleLabels.owner
          : member.role === "admin"
            ? roleLabels.admin
            : roleLabels.member;

      return (
        displayName.toLowerCase().includes(keyword) ||
        rawName.toLowerCase().includes(keyword) ||
        roleLabel.toLowerCase().includes(keyword) ||
        member.memberId.toLowerCase().includes(keyword)
      );
    });
  }, [activeFilter, deferredSearchTerm, members, resolveDisplayName, roleLabels]);

  const activeFilterLabel =
    filterTabs.find((tab) => tab.id === activeFilter)?.label ?? t(msg`全部`);
  const emptyStateTitle = searchTerm.trim()
    ? t(msg`没有找到“${searchTerm.trim()}”`)
    : t(msg`当前没有匹配成员`);
  const emptyStateDescription = searchTerm.trim()
    ? t(
        msg`试试切换到其他筛选，或者搜索成员昵称、角色和 ID。当前范围：${activeFilterLabel}`,
      )
    : activeFilter === "all"
      ? t(msg`可以先添加成员，或者切换筛选查看特定角色。`)
      : t(msg`试试切换到其他筛选。当前范围：${activeFilterLabel}`);

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
    // 走查 R1：和姊妹 picker / removal-picker / confirm / text-edit / forward
    // 一批 dialog 同款 portal-shield 缺漏。「聊天信息」→「群成员 N 人」打开
    // 这个浏览 dialog，inline 渲染在 workspace 根 div 下，无 shield → workspace
    // onPointerDownCapture 在 rightPanelMode=details 时点 dialog 内任意非
    // sidePanel/header/thread 节点都会偷关侧栏；用户点 X / 关闭 / 选择成员
    // 后回不到原详情侧栏。Esc 路径 R1 已 stopPropagation。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]"
      data-yj-portal-shield="desktop-group-member-browser-dialog"
    >
      <button
        type="button"
        aria-label={t(msg`关闭群成员列表`)}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      {/* 走查 R1：和姊妹 a11y 修过的 dialog 系列同款缺漏——modal 但 panel 既
          没挂 role="dialog" + aria-modal 也没挂 aria-labelledby。盲人屏幕阅读
          器只听到「关闭群成员列表 按钮」+ 搜索框 + 成员行，听不到「群成员」
          title。补语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
          <div>
            <div
              id={titleId}
              className="text-[16px] font-medium text-[color:var(--text-primary)]"
            >
              {t(msg`群成员`)}
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {t(msg`${groupName} · ${members.length} 人`)}
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
            aria-label={t(msg`关闭`)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--text-dim)]">
            <span>{t(msg`全部 ${members.length} 人`)}</span>
            <span className="text-black/10">·</span>
            <span>{t(msg`角色成员 ${characterCount} 人`)}</span>
            <span className="text-black/10">·</span>
            <span>{t(msg`群主与管理员 ${ownerCount + adminCount} 人`)}</span>
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
                  placeholder={t(msg`搜索昵称、角色或成员 ID`)}
                  // 走查 R5：父 label 只含 Search 图标 + input，没文本子节点，
                  // SR 进来只听到「编辑栏 搜索昵称、角色或成员 ID 空」分裂行为。
                  // 和姊妹 chat-history R24 / 移动端 group-member-picker R3 同款。
                  aria-label={t(msg`搜索群成员`)}
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
                  {t(msg`↑ ↓ 选择，Enter 打开`)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border-faint)] pt-4">
            <div className="text-[11px] leading-5 text-[color:var(--text-dim)]">
              {t(msg`先看完整列表，再继续加人、减人或跳转资料。`)}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-white p-1">
              <Button
                type="button"
                variant="secondary"
                onClick={onRemoveMembers}
                disabled={pending || !canRemoveMembers}
                className="h-8 rounded-full border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[color:var(--surface-console)]"
              >
                {t(msg`移除成员`)}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onAddMembers}
                disabled={pending}
                className="h-8 rounded-full bg-[color:var(--brand-primary)] px-3 text-[12px] text-white hover:opacity-95"
              >
                {t(msg`添加成员`)}
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {filteredMembers.length ? (
            <div className="space-y-2">
              {filteredMembers.map((member) => {
                const displayName = resolveDisplayName
                  ? resolveDisplayName(member)
                  : (member.memberName || member.memberId);
                const rawName = member.memberName?.trim() || member.memberId;
                const roleLabel =
                  member.role === "owner"
                    ? t(msg`群主`)
                    : member.role === "admin"
                      ? t(msg`管理员`)
                      : t(msg`群成员`);
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
                      name={displayName}
                      src={member.memberAvatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {displayName}
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
                          {member.memberType === "user"
                            ? t(msg`世界主人`)
                            : t(msg`角色`)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--text-dim)]">
                        {displayName !== rawName ? (
                          <>
                            <span>{t(msg`昵称：${rawName}`)}</span>
                            <span className="text-black/10">·</span>
                          </>
                        ) : null}
                        <span>
                          {member.memberType === "user"
                            ? t(msg`Enter 或点击查看我的资料`)
                            : t(msg`Enter 或点击查看资料`)}
                        </span>
                        <span className="text-black/10">·</span>
                        <span>{t(msg`加入于 ${formatTimestamp(member.joinedAt)}`)}</span>
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
