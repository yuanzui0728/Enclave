import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getBlockedCharacters,
  getCharacter,
  getConversations,
  getFriendRequests,
  getFriends,
  getGroupMembers,
  getOrCreateConversation,
} from "@yinjie/contracts";
import { Button, ErrorBlock } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { formatTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import { buildDesktopAddFriendRouteHash } from "../contacts/desktop-add-friend-route-state";
import { buildDesktopMomentsRouteHash } from "../moments/desktop-moments-route-state";

type DesktopMessageAvatarPopoverProps =
  | {
      anchorElement: HTMLElement | null;
      kind: "owner";
      onClose: () => void;
    }
  | {
      anchorElement: HTMLElement | null;
      kind: "character";
      characterId: string;
      fallbackName: string;
      fallbackAvatar?: string | null;
      threadContext?: {
        id: string;
        type: "direct" | "group";
        title?: string;
      };
      onClose: () => void;
    };

const CARD_WIDTH = 320;
const VIEWPORT_PADDING = 16;
const CARD_GAP = 12;

export function DesktopMessageAvatarPopover(props: DesktopMessageAvatarPopoverProps) {
  const { anchorElement, onClose } = props;
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerSignature = useWorldOwnerStore((state) => state.signature);
  const ownerCreatedAt = useWorldOwnerStore((state) => state.createdAt);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({
    opacity: 0,
    pointerEvents: "none",
    position: "fixed",
  });
  const isOwner = props.kind === "owner";
  const characterId = props.kind === "character" ? props.characterId : "";
  const fallbackName =
    props.kind === "character"
      ? props.fallbackName
      : ownerName?.trim() || "世界主人";
  const fallbackAvatar =
    props.kind === "character" ? props.fallbackAvatar : ownerAvatar;
  const threadContext =
    props.kind === "character" ? props.threadContext : undefined;

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId, baseUrl),
    enabled: !isOwner && Boolean(characterId),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: !isOwner,
  });
  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
    enabled: !isOwner && Boolean(characterId),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-chat-avatar-card-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: !isOwner && Boolean(characterId),
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: !isOwner,
  });
  const groupMembersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, threadContext?.id],
    queryFn: () => getGroupMembers(threadContext?.id ?? "", baseUrl),
    enabled:
      !isOwner &&
      threadContext?.type === "group" &&
      Boolean(threadContext.id),
  });

  const startChatMutation = useMutation({
    mutationFn: () => {
      if (!characterId) {
        throw new Error("当前角色信息不可用。");
      }

      return getOrCreateConversation({ characterId }, baseUrl);
    },
    onSuccess: (conversation) => {
      onClose();
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: conversation.id },
      });
    },
  });

  const character = isOwner ? null : characterQuery.data;
  const friendship =
    (friendsQuery.data ?? []).find((item) => item.character.id === characterId)
      ?.friendship ?? null;
  const isFriend = !isOwner && Boolean(friendship);
  const hasPendingFriendRequest = (friendRequestsQuery.data ?? []).some(
    (item) => item.characterId === characterId && item.status === "pending",
  );
  const isBlocked = !isOwner && (blockedQuery.data ?? []).some(
    (item) => item.characterId === characterId,
  );
  const groupMember =
    (groupMembersQuery.data ?? []).find(
      (item) => item.memberType === "character" && item.memberId === characterId,
    ) ?? null;
  const commonGroupCount = useMemo(() => {
    if (isOwner) {
      return 0;
    }

    return (conversationsQuery.data ?? []).filter(
      (item) =>
        isPersistedGroupConversation(item) && item.participants.includes(characterId),
    ).length;
  }, [characterId, conversationsQuery.data, isOwner]);
  const displayName = isOwner
    ? ownerName?.trim() || "世界主人"
    : friendship?.remarkName?.trim() || character?.name?.trim() || fallbackName;
  const signature = isOwner
    ? ownerSignature.trim() || "在现实之外，进入另一片世界。"
    : character?.currentStatus?.trim() ||
      character?.bio?.trim() ||
      (isFriend ? "这个联系人还没有签名。" : "这个角色还没有签名。");
  const relationshipSummary = isOwner
    ? "当前世界实例的唯一主人"
    : groupMember
      ? resolveGroupRoleLabel(groupMember.role)
      : character?.relationship?.trim() || (isFriend ? "联系人" : "世界角色");
  const identifier = isOwner
    ? "world_owner"
    : `yinjie_${characterId.slice(0, 8)}`;
  const subtitle = isOwner
    ? "世界主人"
    : groupMember && character?.relationship?.trim()
      ? `${character.relationship} · ${relationshipSummary}`
      : relationshipSummary;
  const secondaryLabel = isOwner
    ? "我的资料"
    : isBlocked
      ? "已加入黑名单"
      : hasPendingFriendRequest
        ? "好友申请待处理"
        : isFriend
          ? "联系人"
          : "世界角色";
  const metaRows: Array<{ label: string; value: string }> = isOwner
    ? [
        {
          label: "身份",
          value: "世界主人",
        },
        {
          label: "入口",
          value: "桌面设置页",
        },
        {
          label: "启用时间",
          value: formatTimestamp(ownerCreatedAt),
        },
      ]
    : [
        {
          label: "隐界号",
          value: identifier,
        },
        friendship?.region?.trim()
          ? {
              label: "地区",
              value: friendship.region.trim(),
            }
          : null,
        friendship?.source?.trim()
          ? {
              label: "来源",
              value: friendship.source.trim(),
            }
          : null,
        groupMember
          ? {
              label: "群身份",
              value: relationshipSummary,
            }
          : null,
        commonGroupCount > 0
          ? {
              label: "共同群聊",
              value: `${commonGroupCount} 个`,
            }
          : null,
        {
          label: "最近互动",
          value: formatTimestamp(
            friendship?.lastInteractedAt ?? character?.lastActiveAt ?? null,
          ),
        },
      ].filter(Boolean) as Array<{ label: string; value: string }>;

  useLayoutEffect(() => {
    updatePosition({
      anchorElement,
      cardElement: cardRef.current,
      setStyle,
    });
  }, [
    anchorElement,
    character?.bio,
    character?.currentStatus,
    character?.lastActiveAt,
    commonGroupCount,
    displayName,
    friendship?.lastInteractedAt,
    friendship?.region,
    friendship?.source,
    groupMember?.id,
    hasPendingFriendRequest,
    isBlocked,
    isFriend,
    secondaryLabel,
    subtitle,
  ]);

  useEffect(() => {
    if (!anchorElement) {
      onClose();
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (cardRef.current?.contains(target) || anchorElement.contains(target))
      ) {
        return;
      }

      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const handleViewportChange = () => {
      if (!document.body.contains(anchorElement)) {
        onClose();
        return;
      }

      updatePosition({
        anchorElement,
        cardElement: cardRef.current,
        setStyle,
      });
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [anchorElement, onClose]);

  if (!anchorElement || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={cardRef}
      style={style}
      className="w-[320px] rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.98)] shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl"
    >
      <div
        className={
          isOwner
            ? "bg-[linear-gradient(180deg,rgba(7,193,96,0.12),rgba(255,255,255,0.96))]"
            : undefined
        }
      >
        <div className="flex items-start gap-3 px-4 py-4">
          <AvatarChip
            name={isOwner ? ownerName ?? "世界主人" : character?.name ?? fallbackName}
            src={isOwner ? ownerAvatar : character?.avatar ?? fallbackAvatar}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-[18px] font-medium text-[color:var(--text-primary)]">
                {displayName}
              </div>
              <span
                className={
                  isOwner
                    ? "rounded-full bg-[rgba(7,193,96,0.12)] px-2 py-0.5 text-[10px] text-[#15803d]"
                    : "rounded-full bg-[rgba(0,0,0,0.045)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
                }
              >
                {secondaryLabel}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
              {subtitle}
            </div>
            <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">
              {signature}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-4 h-px bg-[rgba(0,0,0,0.06)]" />

      <div className="space-y-2 px-4 py-3">
        {!isOwner && characterQuery.isError && characterQuery.error instanceof Error ? (
          <ErrorBlock message={characterQuery.error.message} />
        ) : null}
        {!isOwner && friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <ErrorBlock message={friendsQuery.error.message} />
        ) : null}
        {!isOwner &&
        friendRequestsQuery.isError &&
        friendRequestsQuery.error instanceof Error ? (
          <ErrorBlock message={friendRequestsQuery.error.message} />
        ) : null}
        {!isOwner && blockedQuery.isError && blockedQuery.error instanceof Error ? (
          <ErrorBlock message={blockedQuery.error.message} />
        ) : null}
        {!isOwner &&
        conversationsQuery.isError &&
        conversationsQuery.error instanceof Error ? (
          <ErrorBlock message={conversationsQuery.error.message} />
        ) : null}
        {!isOwner &&
        groupMembersQuery.isError &&
        groupMembersQuery.error instanceof Error ? (
          <ErrorBlock message={groupMembersQuery.error.message} />
        ) : null}

        {!isOwner && !characterQuery.isError && characterQuery.isLoading ? (
          <div className="rounded-[14px] bg-[rgba(247,247,247,0.9)] px-3 py-2 text-[12px] text-[color:var(--text-muted)]">
            正在读取资料...
          </div>
        ) : null}

        {metaRows.map((item) => (
          <div
            key={item.label}
            className="flex items-start gap-3 text-[12px] leading-5"
          >
            <div className="w-14 shrink-0 text-[color:var(--text-dim)]">
              {item.label}
            </div>
            <div className="min-w-0 flex-1 break-words text-[color:var(--text-primary)]">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-4 pt-1">
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => {
            onClose();
            if (isOwner) {
              void navigate({ to: "/desktop/settings" });
              return;
            }

            void navigate({
              to: "/character/$characterId",
              params: { characterId },
            });
          }}
        >
          {isOwner ? "打开设置" : "查看资料"}
        </Button>
        {isOwner || !isFriend ? null : (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            disabled={!characterId}
            onClick={() => {
              onClose();
              void navigate({
                to: "/tabs/moments",
                hash: buildDesktopMomentsRouteHash({
                  authorId: characterId,
                }),
              });
            }}
          >
            朋友圈
          </Button>
        )}
        {isOwner ? null : (
          <Button
            variant="primary"
            size="sm"
            className="rounded-full"
            disabled={
              startChatMutation.isPending ||
              (!isFriend && hasPendingFriendRequest) ||
              isBlocked
            }
            onClick={() => {
              if (!isFriend) {
                onClose();
                void navigate({
                  to: "/desktop/add-friend",
                  hash: buildDesktopAddFriendRouteHash({
                    keyword: character?.name ?? fallbackName,
                    characterId,
                    openCompose: true,
                  }),
                });
                return;
              }

              startChatMutation.mutate();
            }}
          >
            {isBlocked
              ? "已拉黑"
              : !isFriend
                ? hasPendingFriendRequest
                  ? "申请中"
                  : "添加到通讯录"
                : startChatMutation.isPending
                  ? "打开中..."
                  : "发消息"}
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function resolveGroupRoleLabel(role: "owner" | "admin" | "member") {
  if (role === "owner") {
    return "群主";
  }

  if (role === "admin") {
    return "管理员";
  }

  return "群成员";
}

function updatePosition({
  anchorElement,
  cardElement,
  setStyle,
}: {
  anchorElement: HTMLElement | null;
  cardElement: HTMLDivElement | null;
  setStyle: (value: CSSProperties) => void;
}) {
  if (!anchorElement || typeof window === "undefined") {
    return;
  }

  const rect = anchorElement.getBoundingClientRect();
  const cardHeight = cardElement?.offsetHeight ?? 260;
  const preferLeft =
    rect.right + CARD_GAP + CARD_WIDTH >
    window.innerWidth - VIEWPORT_PADDING;
  const left = clamp(
    preferLeft
      ? rect.left - CARD_GAP - CARD_WIDTH
      : rect.right + CARD_GAP,
    VIEWPORT_PADDING,
    window.innerWidth - CARD_WIDTH - VIEWPORT_PADDING,
  );
  const top = clamp(
    rect.top - 8,
    VIEWPORT_PADDING,
    window.innerHeight - cardHeight - VIEWPORT_PADDING,
  );

  setStyle({
    left,
    opacity: 1,
    pointerEvents: "auto",
    position: "fixed",
    top,
    zIndex: 80,
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
