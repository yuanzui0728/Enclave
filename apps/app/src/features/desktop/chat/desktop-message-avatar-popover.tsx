import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  getBlockedCharacters,
  getCharacter,
  getConversations,
  getFriendRequests,
  getFriends,
  getGroupMembers,
  getOrCreateConversation,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { translateCharacterBio } from "../../../lib/character-i18n";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { formatTimestamp } from "../../../lib/format";
import { buildYinjieId } from "../../../lib/yinjie-id";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import { buildDesktopAddFriendRouteHash } from "../../contacts/add-friend-route-state";
import { buildCharacterDetailRouteHash } from "../../contacts/character-detail-route-state";
import { buildDesktopFriendMomentsRouteHash } from "../../moments/friend-moments-route-state";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
} from "./desktop-chat-route-state";

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
      navigationContext?: {
        hideMomentsAction?: boolean;
        momentsReturnHash?: string;
        momentsReturnPath?: string;
        profileReturnHash?: string;
        profileReturnPath?: string;
      };
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
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  // 走查电脑端朋友圈 R1：popover 跨页复用 ——「我的朋友圈」/「朋友圈」按钮在
  // 当前页就是目标页时（/profile/moments 自己点自己头像 popover）应当藏起来，
  // 避免「navigate 到当前 path 等于无操作」的体感"我点了但什么也没发生"。
  const currentPathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const queryClient = useQueryClient();
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
      : ownerName?.trim() || t(msg`世界主人`);
  const fallbackAvatar =
    props.kind === "character" ? props.fallbackAvatar : ownerAvatar;
  const navigationContext =
    props.kind === "character" ? props.navigationContext : undefined;
  const threadContext =
    props.kind === "character" ? props.threadContext : undefined;
  const defaultReturnHash = threadContext
    ? buildDesktopChatRouteHash({
        conversationId: threadContext.id,
      })
    : undefined;
  const profileReturnPath = navigationContext?.profileReturnPath ?? "/tabs/chat";
  const profileReturnHash = navigationContext?.profileReturnHash ?? defaultReturnHash;
  const momentsReturnPath = navigationContext?.momentsReturnPath ?? "/tabs/chat";
  const momentsReturnHash = navigationContext?.momentsReturnHash ?? defaultReturnHash;
  const hideMomentsAction = Boolean(navigationContext?.hideMomentsAction);

  // 走查 R1：桌面 avatar popover 在「单聊消息列表点对方头像 / 群里点任一
  // 头像」时挂载，6 份 cache 全部没 staleTime——上层 workspace / details
  // panel 大概率刚拉过这些数据。公网 RTT ~600ms × 6 并发即"点头像后头像
  // 卡片空白几百毫秒"。对齐 desktop-chat-details-panel.tsx 同款 15s/30s。
  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId, baseUrl),
    enabled: !isOwner && Boolean(characterId),
    staleTime: 15_000,
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: !isOwner,
    staleTime: 15_000,
  });
  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
    enabled: !isOwner && Boolean(characterId),
    staleTime: 15_000,
  });
  const blockedQuery = useQuery({
    // 与 desktop-chat-workspace 的拉黑列表共用同一份 cache，否则桌面端
    // 每次点开头像 popover 都会再发一次相同的 getBlockedCharacters 请求。
    queryKey: ["app-chat-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: !isOwner && Boolean(characterId),
    staleTime: 30_000,
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: !isOwner,
    staleTime: 15_000,
  });
  const groupMembersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, threadContext?.id],
    queryFn: () => getGroupMembers(threadContext?.id ?? "", baseUrl),
    enabled:
      !isOwner &&
      threadContext?.type === "group" &&
      Boolean(threadContext.id),
    staleTime: 15_000,
  });

  const startChatMutation = useMutation({
    mutationFn: () => {
      if (!characterId) {
        throw new Error(t(msg`当前角色信息不可用。`));
      }

      return getOrCreateConversation({ characterId }, baseUrl);
    },
    onSuccess: async (conversation) => {
      // 新会话刚由后端创建，conversations cache 里还没有它。直接 navigate
      // 过去时 workspace 的 selectedConversationExists 判定为 false，会立刻
      // navigateToChatWorkspace replace 把用户踢回 /tabs/chat 根路由。
      // 等一次 invalidate 后再跳，新 conversation 已落进 cache。
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      onClose();
      void navigate({
        to: buildDesktopChatThreadPath({
          conversationId: conversation.id,
        }),
      });
    },
  });

  // 走查桌面端群聊 R3：和 desktop-create-group-dialog R3 / desktop-group-member-picker
  // R1 / desktop-chat-confirm-dialog R4 同款问题——「发消息」按钮只靠
  // `disabled={startChatMutation.isPending || ...}`，isPending 是 useMutation
  // React state，要等 commit 才进 DOM。在群里点角色头像 → popover → 同帧
  // 双击「发消息」会同时通过 disabled=false → startChatMutation.mutate() 飞
  // 两次。getOrCreateConversation 服务端虽幂等（按 characterId 查再创建），
  // 第二次仍打公网 RTT ~600ms；两路 onSuccess 同时跑两份 invalidateQueries +
  // 两次 navigate，第二次 navigate 在 close 之后跑容易在 react-router 中卡到
  // 已被 unmount 的 popover state 上（onClose 已经把 popover 拆掉）。
  const startChatSubmittingRef = useRef(false);
  useEffect(() => {
    if (!startChatMutation.isPending) {
      startChatSubmittingRef.current = false;
    }
  }, [startChatMutation.isPending]);
  const handleStartChat = () => {
    if (startChatMutation.isPending || startChatSubmittingRef.current) {
      return;
    }
    startChatSubmittingRef.current = true;
    startChatMutation.mutate();
  };

  // 走查 R4：popover 底部按钮区（查看资料 / 打开设置 / 朋友圈 / 我的朋友圈 /
  // 添加好友）都是 `() => { onClose(); void navigate(...) }` 形态。onClose
  // 走 React state 要等 commit 才把 popover 拆掉，同帧 <16ms 双击同一个按钮
  // 都进入 → push 2 条完全相同的二级页 history 项 + 二级页 mount 时拉的
  // network/cache 跑两次（character-detail / friend-moments 这种公网隧道
  // ~600ms RTT 重复值得避免）。和姊妹 handleStartChat sync ref 同款思路，
  // 但这条同时覆盖多条 navigate 出口，用 raf 复位的 row-navigation guard。
  const popoverNavigateFiredRef = useRef(false);
  const guardPopoverNavigation = useCallback(
    <Args extends unknown[]>(handler: (...args: Args) => void) => {
      return (...args: Args) => {
        if (popoverNavigateFiredRef.current) return;
        popoverNavigateFiredRef.current = true;
        handler(...args);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            popoverNavigateFiredRef.current = false;
          });
        }
      };
    },
    [],
  );

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
    ? ownerName?.trim() || t(msg`世界主人`)
    : friendship?.remarkName?.trim() || character?.name?.trim() || fallbackName;
  const signature = isOwner
    ? ownerSignature.trim() || t(msg`在现实之外，进入另一片世界。`)
    : character?.currentStatus?.trim() ||
      translateCharacterBio(t, character?.bio) ||
      (isFriend ? t(msg`这个联系人还没有签名。`) : t(msg`这个角色还没有签名。`));
  const relationshipSummary = isOwner
    ? t(msg`当前世界实例的唯一主人`)
    : groupMember
      ? resolveGroupRoleLabel(groupMember.role, t)
      : character?.relationship?.trim() || (isFriend ? t(msg`联系人`) : t(msg`世界角色`));
  const identifier = isOwner ? "world_owner" : buildYinjieId(characterId);
  const subtitle = isOwner
    ? t(msg`世界主人`)
    : groupMember && character?.relationship?.trim()
      ? `${character.relationship} · ${relationshipSummary}`
      : relationshipSummary;
  const secondaryLabel = isOwner
    ? t(msg`我的资料`)
    : isBlocked
      ? t(msg`已加入黑名单`)
      : hasPendingFriendRequest
        ? t(msg`好友申请待处理`)
        : isFriend
          ? t(msg`联系人`)
          : t(msg`世界角色`);
  const metaRows: Array<{ label: string; value: string }> = isOwner
    ? [
        {
          label: t(msg`身份`),
          value: t(msg`世界主人`),
        },
        {
          label: t(msg`入口`),
          value: t(msg`桌面设置页`),
        },
        {
          label: t(msg`启用时间`),
          value: formatTimestamp(ownerCreatedAt),
        },
      ]
    : [
        {
          label: t(msg`隐界号`),
          value: identifier,
        },
        friendship?.region?.trim() || character?.region?.trim()
          ? {
              label: t(msg`地区`),
              value:
                friendship?.region?.trim() ||
                character?.region?.trim() ||
                "",
            }
          : null,
        friendship?.source?.trim()
          ? {
              label: t(msg`来源`),
              value: friendship.source.trim(),
            }
          : null,
        groupMember
          ? {
              label: t(msg`群身份`),
              value: relationshipSummary,
            }
          : null,
        commonGroupCount > 0
          ? {
              label: t(msg`共同群聊`),
              value: t(msg`${commonGroupCount} 个`),
            }
          : null,
        {
          label: t(msg`最近互动`),
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
    character?.region,
    friendship?.source,
    groupMember?.id,
    hasPendingFriendRequest,
    isBlocked,
    isFriend,
    secondaryLabel,
    subtitle,
  ]);

  // R12：和 R11 一票 dialog 同款 perf 修法。chat-message-list 父帧每次
  // typing tick / socket / message cache 变化都重渲，inline arrow
  // `onClose={() => setDesktopAvatarPopover(null)}` 引用换 → 本 effect 在
  // anchorElement 不变的情况下也跟着拆装 4 个 listener（document pointerdown
  // / document keydown / window resize / window scroll）一次。activeConversation
  // 在长聊里 typing 触发频率几秒一次，这条 listener thrash 是肉眼可见的卡顿。
  // ref 镜像 onClose，deps 收紧到 [anchorElement]。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!anchorElement) {
      onCloseRef.current();
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

      onCloseRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // popover 是浮在最上层的；Esc 应该只关掉 popover，不要继续冒泡到
      // workspace 的 dismissSidePanel(window keydown)，避免一下 Esc 同时把
      // 聊天信息/查找记录侧栏也关掉。
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    const handleViewportChange = () => {
      if (!document.body.contains(anchorElement)) {
        onCloseRef.current();
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
  }, [anchorElement]);

  if (!anchorElement || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={cardRef}
      style={style}
      // 走查新一轮 R1：popover 通过 createPortal 渲染到 document.body，
      // 不在 desktop-chat-workspace 的 threadSectionRef DOM 子树里。
      // workspace 的 onPointerDownCapture 和 document pointerdown(capture)
      // 兜底逻辑都靠 ref.contains(target) 判断「点击是否落在 thread 区」，
      // portal 出来的 popover DOM 不在那条链上 → 用户点 popover 卡片任意
      // 空白处（不是按钮 / 非可关闭区域）的瞬间 workspace 就把背后的
      // 「聊天信息」侧栏 dismiss 掉。给 popover 卡片打 data-yj-portal-shield
      // 标记，workspace 那边 closest() 一查就跳过 dismiss。
      data-yj-portal-shield="avatar-popover"
      // 走查 R5：popover 行为 modal-like（Esc 关 / backdrop pointerdown 关），
      // 但没挂 role + aria-label，盲人屏幕阅读器只听到一堆 button label 和
      // 资料行 text，无从知道这是个浮起的「{displayName} 资料卡片」。和姊妹
      // R2~R3 修过的 dialog 系列同款补语义：role="dialog" + aria-modal +
      // aria-label 直接挂当前角色名 + 类型；不用 aria-labelledby（卡片内的
      // 标题节点本身是 truncate 的，外部传过来的 displayName 字段更完整）。
      role="dialog"
      aria-modal="true"
      aria-label={
        isOwner
          ? t(msg`${displayName} 的资料卡片`)
          : t(msg`${displayName} 的角色资料卡片`)
      }
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
            name={isOwner ? ownerName || t(msg`世界主人`) : character?.name || fallbackName}
            src={isOwner ? ownerAvatar : character?.avatar || fallbackAvatar}
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
        {/* R46：和姊妹 R45 详情侧栏同款 —— 头像 popover 里 6 个 query + 1 个
            startChatMutation ErrorBlock 全部裸 <div>，没 role / aria-live。
            avatar popover 是用户在消息列表点头像后弹出来的——里面的 friend /
            block / conversation cache 失败、点「发消息」→ getOrCreate 失败时，
            盲人 SR 完全感知不到。startChatMutation 尤其坑：按钮短暂 pending
            后恢复 enabled，无任何反馈，用户会反复点。挂 role="alert"。 */}
        {!isOwner && characterQuery.isError && characterQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={characterQuery.error.message} />
        ) : null}
        {!isOwner && friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={friendsQuery.error.message} />
        ) : null}
        {!isOwner &&
        friendRequestsQuery.isError &&
        friendRequestsQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={friendRequestsQuery.error.message} />
        ) : null}
        {!isOwner && blockedQuery.isError && blockedQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={blockedQuery.error.message} />
        ) : null}
        {!isOwner &&
        conversationsQuery.isError &&
        conversationsQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={conversationsQuery.error.message} />
        ) : null}
        {!isOwner &&
        groupMembersQuery.isError &&
        groupMembersQuery.error instanceof Error ? (
          <ErrorBlock role="alert" message={groupMembersQuery.error.message} />
        ) : null}
        {/* 点「发消息」→ getOrCreateConversation 失败时，原来 mutation 没
            onError、JSX 里也没渲染 startChatMutation.error，按钮短暂 pending
            后又恢复 enabled，用户完全不知道刚才那一下失败了，会反复点。
            把这条 error 也挂到现有 ErrorBlock 列表里。 */}
        {!isOwner &&
        startChatMutation.isError &&
        startChatMutation.error instanceof Error ? (
          <ErrorBlock role="alert" message={startChatMutation.error.message} />
        ) : null}

        {!isOwner && !characterQuery.isError && characterQuery.isLoading ? (
          <div className="rounded-[14px] bg-[rgba(247,247,247,0.9)] px-3 py-2 text-[12px] text-[color:var(--text-muted)]">
            {t(msg`正在读取资料...`)}
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
            onClick={guardPopoverNavigation(() => {
              onClose();
              if (isOwner) {
                void navigate({ to: "/desktop/settings" });
                return;
              }

              void navigate({
                to: "/character/$characterId",
                params: { characterId },
                hash: buildCharacterDetailRouteHash({
                  returnPath: profileReturnPath,
                  returnHash: profileReturnHash,
                }),
              });
            })}
          >
            {isOwner ? t(msg`打开设置`) : t(msg`查看资料`)}
          </Button>
        {isOwner || !isFriend || hideMomentsAction ? null : (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            disabled={!characterId}
            onClick={guardPopoverNavigation(() => {
              onClose();
              void navigate({
                to: "/desktop/friend-moments/$characterId",
                params: { characterId },
                hash: buildDesktopFriendMomentsRouteHash({
                  source: "avatar-popover",
                  returnPath: momentsReturnPath,
                  returnHash: momentsReturnHash,
                }),
              });
            })}
          >
            {t(msg`朋友圈`)}
          </Button>
        )}
        {isOwner && !hideMomentsAction && currentPathname !== "/profile/moments" ? (
          // 走查电脑端朋友圈 R1：之前 owner-kind popover 只挂「打开设置」一个动作，
          // /tabs/moments 上点自己头像 → popover 弹出来 → 想去「我的朋友圈」却没
          // 入口（aria-label 上 fallback 写的是「查看 yz 的朋友圈」更显得空头承诺）。
          // 移动端 moments-page onAuthorTap 对 own moment 直接 navigate /profile/moments，
          // 桌面这里靠 popover 是因为 desktop owner 还想接「打开设置」，但 owner kind
          // 同时也应当像 character kind 一样给「朋友圈」入口才对得起 aria-label。
          // 已经在 /profile/moments 时把按钮藏起来——/profile/moments 也会接 like 行
          // owner liker，popover 弹自己头像，留个按钮跳回自己等于 no-op，体感"点了
          // 没反应"。和 character kind hideMomentsAction 同思路（只是这里靠 path
          // 自检比起靠 callsite 透传更稳）。
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={guardPopoverNavigation(() => {
              onClose();
              void navigate({ to: "/profile/moments" });
            })}
          >
            {t(msg`我的朋友圈`)}
          </Button>
        ) : null}
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
            onClick={guardPopoverNavigation(() => {
              if (!isFriend) {
                onClose();
                void navigate({
                  to: "/desktop/add-friend",
                  hash: buildDesktopAddFriendRouteHash({
                    keyword: character?.name || fallbackName,
                    characterId,
                    openCompose: true,
                  }),
                });
                return;
              }

              handleStartChat();
            })}
          >
            {isBlocked
              ? t(msg`已拉黑`)
              : !isFriend
                ? hasPendingFriendRequest
                  ? t(msg`申请中`)
                  : t(msg`添加到通讯录`)
                : startChatMutation.isPending
                  ? t(msg`打开中...`)
                  : t(msg`发消息`)}
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function resolveGroupRoleLabel(
  role: "owner" | "admin" | "member",
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  if (role === "owner") {
    return t(msg`群主`);
  }

  if (role === "admin") {
    return t(msg`管理员`);
  }

  return t(msg`群成员`);
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
