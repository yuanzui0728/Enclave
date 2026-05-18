import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { Copy, Download, Link2, Share2 } from "lucide-react";
import {
  getConversations,
  getGroup,
  getGroupMembers,
  sendGroupMessage,
  type ConversationListItem,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "../features/chat/mobile-group-route-state";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
  buildDesktopChatThreadPathFromConversationPath,
} from "../features/desktop/chat/desktop-chat-route-state";
import {
  getConversationThreadLabel,
  getConversationThreadPath,
  isPersistedGroupConversation,
} from "../lib/conversation-route";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { buildPublicShareUrl } from "../lib/share-url";
import {
  createGroupInviteDeliveryBatchId,
  hydrateGroupInviteDeliveryFromNative,
  isGroupInviteStorageKey,
  readGroupInviteDeliveryRecord,
  readGroupInviteDeliveryTargets,
  readGroupInviteReopenRecords,
  writeGroupInviteReopenRecord,
  writeGroupInviteDeliveryRecord,
  type GroupInviteDeliveryRecord,
  type GroupInviteDeliveryTarget,
  type GroupInviteReopenRecord,
} from "../lib/group-invite-delivery";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatConversationTimestamp, parseTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { revealSavedFile } from "../runtime/reveal-saved-file";
import { saveGeneratedFile } from "../runtime/save-generated-file";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { writeClipboardText } from "../runtime/native-clipboard";
import {
  isMobileWebShareSurface,
  isNativeMobileShareSurface,
} from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { emitChatMessage, joinConversationRoom } from "../lib/socket";
import { translateRuntimeMessage, useAppLocale } from "@yinjie/i18n";

const t = translateRuntimeMessage;

type PendingReturnReasonCode =
  | "wait_for_reopen"
  | "stale_and_active"
  | "stale"
  | "active_group_reach"
  | "active_direct_reach"
  | "group_reach_priority"
  | "direct_targeted_resend";

type PendingReturnActionStatusCode =
  | "not_recommended"
  | "best_now"
  | "prioritize"
  | "can_wait";

type PendingReturnReason = {
  code: PendingReturnReasonCode;
  label: string;
  tone: string;
};

type PendingReturnActionStatus = {
  code: PendingReturnActionStatusCode;
  label: string;
  tone: string;
};

type ConversationActionContext = "source" | "related" | "recent";

export function GroupQrPage() {
  const { groupId } = useParams({ from: "/group/$groupId/qr" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale } = useAppLocale();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopGroupInvite = runtimeConfig.appPlatform === "desktop";
  const baseUrl = runtimeConfig.apiBaseUrl;
  const isDesktopLayout = useDesktopLayout();
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const mobileWebCopyFallback = isMobileWebShareSurface({
    isDesktopLayout,
  });
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const [notice, setNotice] = useState<{
    message: string;
    tone: "success" | "danger";
    actionLabel?: string;
    onAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
  } | null>(null);
  const [deliveredConversation, setDeliveredConversation] =
    useState<GroupInviteDeliveryRecord | null>(() =>
      readGroupInviteDeliveryRecord(groupId),
    );
  const [deliveryTargets, setDeliveryTargets] = useState<
    GroupInviteDeliveryTarget[]
  >(() => readGroupInviteDeliveryTargets(groupId));
  const [deliveryBatch] = useState(() => ({
    id: createGroupInviteDeliveryBatchId(),
    startedAt: new Date().toISOString(),
  }));
  const [reopenRecords, setReopenRecords] = useState<GroupInviteReopenRecord[]>(
    () => readGroupInviteReopenRecords(groupId),
  );
  const [groupInviteStoreReady, setGroupInviteStoreReady] = useState(
    !nativeDesktopGroupInvite,
  );
  const routeState = parseMobileGroupRouteState(hash);
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileGroupRouteHash({
        highlightedMessageId: routeState.highlightedMessageId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [routeState.highlightedMessageId, safeReturnHash, safeReturnPath],
  );
  const detailsRouteHash = isDesktopLayout
    ? normalizedHash || undefined
    : currentRouteHash || undefined;
  const inviteRouteHash = isDesktopLayout
    ? normalizedHash || undefined
    : currentRouteHash || undefined;
  const desktopDetailsFallbackHash = useMemo(
    () =>
      buildDesktopChatRouteHash({
        conversationId: groupId,
        panel: "details",
      }),
    [groupId],
  );

  // 走查 R2：三条 query 都没 staleTime（默认 0），每次进群二维码页都会
  // 重新 GET /groups/$id + /members + /conversations。其中 conversations
  // 影响最大——投递列表挂在它上面，用户每次回这页都触发整张会话列表 refetch
  // （活跃用户 50+ 会话），公网隧道 RTT 600ms+ 看到列表闪烁。group-contacts-page
  // 同 key 已用 staleTime: 15_000 + refetchOnWindowFocus: true，这里对齐：
  // 1) 群/成员 query 加 15s staleTime 防止短时回访重拉；
  // 2) conversations 加 staleTime + refetchOnWindowFocus 让从后台切前台时
  //    能看到新加的会话出现在投递列表里。
  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
    staleTime: 15_000,
  });
  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
    staleTime: 15_000,
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const defaultGroupName = t(msg`隐界群聊`);
  const defaultGroupInviteLabel = t(msg`群聊邀请`);
  const fallbackGroupLabel = t(msg`群聊`);
  const fallbackCurrentGroupLabel = t(msg`当前群聊`);
  const groupDisplayName = groupQuery.data?.name ?? defaultGroupName;

  useEffect(() => {
    if (
      groupQuery.isLoading ||
      !isMissingGroupError(groupQuery.error, groupId)
    ) {
      return;
    }

    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    groupId,
    groupQuery.error,
    groupQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
  ]);

  const inviteLink = useMemo(() => {
    return buildPublicShareUrl(`/group/${groupId}`);
  }, [groupId]);
  const inviteCode = `YJ-GROUP-${groupId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  const inviteText = useMemo(() => {
    return [
      t(msg`邀请你加入「${groupDisplayName}」`),
      t(msg`群链接：${inviteLink}`),
      t(msg`邀请码：${inviteCode}`),
    ].join("\n");
  }, [groupDisplayName, inviteCode, inviteLink, locale]);
  // 走查新一轮 R1：originally subtitle="${members?.length ?? 0} 人群聊"——
  // membersQuery.data 还在飞那几百 ms 内 SVG 邀请卡先生成一份"0 人群聊"，
  // 等 count 到达再 rebuild 一次。用户点群二维码进来就能肉眼看见副标从
  // "0 人群聊" 闪到真实 "N 人群聊"，截图分享出去也可能截到 0 那一帧。和
  // group-chat-thread-panel 桌面 header 同款修法：loading 时退回中性
  // "群邀请卡" 副标，等真值再换。deps 用 `memberCount`（number | undefined）
  // 代替 `membersQuery.data?.length` (number)，避免 undefined 落进 ??0 的
  // 那条路径漏判断。
  const memberCount = membersQuery.data?.length;
  // 走查移动端群聊 R1：和姊妹路径 mobile-group-call-screen.tsx「新 R1」(line 239-242)
  // 同款修法——下方 JSX 里 `members={membersQuery.data?.map(item=>item.memberId) ?? []}`
  // 每次 render 都 new 一个 array → GroupAvatarChip 拿到新 prop 引用、重新算
  // hashSeed × 4 + 重新挂 4 个 <img>。本页 notice / deliveredConversation /
  // deliveryTargets / reopenRecords / groupInviteStoreReady 五条 state 任意改变
  // 都触发整页 re-render，公网隧道 RTT 下 sendToConversation / scheduleConversationsInvalidate
  // 等动作连点几次能轻松跑出 10+ 次重渲染——每次都把 4 张邀请卡 thumbnail 丢
  // 弃重挂。memberIds 锁住引用，群成员列表稳定时 GroupAvatarChip 完全跳过重
  // 渲染。
  const memberIdsForAvatar = useMemo(
    () => membersQuery.data?.map((item) => item.memberId) ?? [],
    [membersQuery.data],
  );
  const qrSvgMarkup = useMemo(
    () =>
      buildInviteMatrixSvg({
        code: inviteCode,
        footerLabel: t(msg`群邀请卡`),
        label: groupQuery.data?.name ?? defaultGroupInviteLabel,
        subtitle:
          memberCount !== undefined
            ? t(msg`${memberCount} 人群聊`)
            : t(msg`群邀请卡`),
      }),
    [
      defaultGroupInviteLabel,
      groupQuery.data?.name,
      inviteCode,
      locale,
      memberCount,
    ],
  );
  const mobileLink = useMemo(
    () => resolveMobileHandoffLink(`/group/${groupId}`),
    [groupId],
  );
  const recentConversations = useMemo(
    () =>
      [...(conversationsQuery.data ?? [])]
        .filter((item) => item.id !== groupId)
        .sort(
          (left, right) =>
            (parseTimestamp(right.lastActivityAt) ?? 0) -
            (parseTimestamp(left.lastActivityAt) ?? 0),
        )
        .slice(0, 5),
    [conversationsQuery.data, groupId],
  );
  const conversationPathMap = useMemo(
    () =>
      new Map(
        (conversationsQuery.data ?? []).map((conversation) => [
          buildConversationPath(conversation),
          conversation,
        ]),
      ),
    [conversationsQuery.data],
  );
  const conversationDesktopPathMap = useMemo(
    () =>
      new Map(
        (conversationsQuery.data ?? []).map((conversation) => [
          buildConversationPath(conversation),
          buildDesktopChatThreadPath({
            conversationId: conversation.id,
          }),
        ]),
      ),
    [conversationsQuery.data],
  );
  const inviteMessage = useMemo(
    () =>
      [
        t(msg`【群邀请】`),
        t(msg`邀请你加入「${groupDisplayName}」`),
        t(msg`群链接：${inviteLink}`),
        t(msg`邀请码：${inviteCode}`),
      ].join(" "),
    [groupDisplayName, inviteCode, inviteLink, locale],
  );
  const currentReturnSource = useMemo(() => {
    const params = new URLSearchParams(search);
    const conversationPath = params.get("from")?.trim();
    const conversationTitle = params.get("title")?.trim();

    if (!conversationPath || !conversationTitle) {
      return null;
    }

    return {
      conversationPath,
      conversationTitle,
    };
  }, [search]);
  const currentReturnSourceConversation = useMemo(() => {
    if (!currentReturnSource) {
      return null;
    }

    return (
      conversationPathMap.get(currentReturnSource.conversationPath) ?? null
    );
  }, [conversationPathMap, currentReturnSource]);
  const prioritizedRecentConversations = useMemo(() => {
    if (!currentReturnSourceConversation) {
      return recentConversations;
    }

    return recentConversations.filter(
      (conversation) => conversation.id !== currentReturnSourceConversation.id,
    );
  }, [currentReturnSourceConversation, recentConversations]);
  const validDeliveryTargets = useMemo(
    () =>
      deliveryTargets.filter((record) =>
        conversationPathMap.has(record.conversationPath),
      ),
    [conversationPathMap, deliveryTargets],
  );
  const validReopenRecords = useMemo(
    () =>
      reopenRecords.filter((record) =>
        conversationPathMap.has(record.conversationPath),
      ),
    [conversationPathMap, reopenRecords],
  );
  const activeDeliveredConversation =
    deliveredConversation &&
    conversationPathMap.has(deliveredConversation.conversationPath)
      ? deliveredConversation
      : null;
  const buildConversationOpenPath = (conversation: ConversationListItem) =>
    isDesktopLayout
      ? buildDesktopChatThreadPath({
          conversationId: conversation.id,
        })
      : buildConversationPath(conversation);
  const resolveConversationOpenPath = (conversationPath: string) =>
    isDesktopLayout
      ? (conversationDesktopPathMap.get(conversationPath) ??
        buildDesktopChatThreadPathFromConversationPath(conversationPath) ??
        conversationPath)
      : conversationPath;
  const reopenedPaths = useMemo(
    () => new Set(validReopenRecords.map((record) => record.conversationPath)),
    [validReopenRecords],
  );
  const relatedReturnConversations = useMemo(() => {
    if (!currentReturnSourceConversation) {
      return [] as ConversationListItem[];
    }

    const sourceIsGroup = isPersistedGroupConversation(
      currentReturnSourceConversation,
    );

    return [...(conversationsQuery.data ?? [])]
      .filter(
        (conversation) =>
          conversation.id !== groupId &&
          conversation.id !== currentReturnSourceConversation.id,
      )
      .filter(
        (conversation) =>
          isPersistedGroupConversation(conversation) === sourceIsGroup,
      )
      .sort((left, right) => {
        const leftReopenWeight = reopenedPaths.has(buildConversationPath(left))
          ? 1
          : 0;
        const rightReopenWeight = reopenedPaths.has(
          buildConversationPath(right),
        )
          ? 1
          : 0;

        if (leftReopenWeight !== rightReopenWeight) {
          return rightReopenWeight - leftReopenWeight;
        }

        return (
          (parseTimestamp(right.lastActivityAt) ?? 0) -
          (parseTimestamp(left.lastActivityAt) ?? 0)
        );
      })
      .slice(0, 3);
  }, [
    conversationsQuery.data,
    currentReturnSourceConversation,
    groupId,
    reopenedPaths,
  ]);
  const deliveredTargetByPath = useMemo(
    () =>
      validDeliveryTargets.reduce<Record<string, GroupInviteDeliveryTarget>>(
        (result, record) => {
          result[record.conversationPath] = record;
          return result;
        },
        {},
      ),
    [validDeliveryTargets],
  );
  const deliveryTargetBatches = useMemo(
    () =>
      validDeliveryTargets.reduce<
        Array<{
          batchId: string;
          batchStartedAt: string;
          items: GroupInviteDeliveryTarget[];
          reopenedCount: number;
          status: "closed" | "reopened" | "pending";
        }>
      >((result, record) => {
        const targetBatch = result.find(
          (item) => item.batchId === record.batchId,
        );
        const hasReopened = validReopenRecords.some(
          (reopenRecord) =>
            reopenRecord.conversationPath === record.conversationPath,
        );
        if (targetBatch) {
          targetBatch.items.push(record);
          targetBatch.reopenedCount += hasReopened ? 1 : 0;
          targetBatch.status =
            targetBatch.reopenedCount >= targetBatch.items.length
              ? "closed"
              : targetBatch.reopenedCount > 0
                ? "reopened"
                : "pending";
          return result;
        }

        result.push({
          batchId: record.batchId,
          batchStartedAt: record.batchStartedAt,
          items: [record],
          reopenedCount: hasReopened ? 1 : 0,
          status: hasReopened ? "closed" : "pending",
        });
        return result;
      }, []),
    [validDeliveryTargets, validReopenRecords],
  );
  const deliveryBatchRankById = useMemo(
    () =>
      deliveryTargetBatches.reduce<Record<string, number>>(
        (result, batch, index) => {
          result[batch.batchId] = index;
          return result;
        },
        {},
      ),
    [deliveryTargetBatches],
  );
  const pendingCurrentBatchConversations = useMemo(() => {
    const currentBatch = deliveryTargetBatches[0];
    if (!currentBatch) {
      return [] as Array<{
        conversation: ConversationListItem;
        target: GroupInviteDeliveryTarget;
      }>;
    }

    return currentBatch.items
      .filter((target) => !reopenedPaths.has(target.conversationPath))
      .map((target) => {
        const conversation = conversationPathMap.get(target.conversationPath);
        if (!conversation) {
          return null;
        }

        return {
          conversation,
          target,
        };
      })
      .filter(
        (
          item,
        ): item is {
          conversation: ConversationListItem;
          target: GroupInviteDeliveryTarget;
        } => Boolean(item),
      )
      .sort((left, right) => {
        const leftCoolingDown = isPendingReturnCoolingDown(
          left.target.deliveredAt,
        )
          ? 1
          : 0;
        const rightCoolingDown = isPendingReturnCoolingDown(
          right.target.deliveredAt,
        )
          ? 1
          : 0;

        if (leftCoolingDown !== rightCoolingDown) {
          return leftCoolingDown - rightCoolingDown;
        }

        const activityDelta =
          (parseTimestamp(right.conversation.lastActivityAt) ?? 0) -
          (parseTimestamp(left.conversation.lastActivityAt) ?? 0);

        if (activityDelta !== 0) {
          return activityDelta;
        }

        const deliveredDelta =
          (parseTimestamp(left.target.deliveredAt) ?? 0) -
          (parseTimestamp(right.target.deliveredAt) ?? 0);

        if (deliveredDelta !== 0) {
          return deliveredDelta;
        }

        return left.conversation.title.localeCompare(right.conversation.title);
      });
  }, [conversationPathMap, deliveryTargetBatches, reopenedPaths]);
  const topPendingReturnConversation =
    pendingCurrentBatchConversations[0] ?? null;
  const fallbackPendingReturnConversation =
    pendingCurrentBatchConversations[1] ?? null;
  const deferredPendingReturnConversation =
    pendingCurrentBatchConversations.find(
      (item) =>
        isPendingReturnCoolingDown(item.target.deliveredAt) &&
        item.conversation.id !==
          topPendingReturnConversation?.conversation.id &&
        item.conversation.id !==
          fallbackPendingReturnConversation?.conversation.id,
    ) ?? null;
  const pendingReturnOverview = useMemo(() => {
    const coolingDownCount = pendingCurrentBatchConversations.filter((item) =>
      isPendingReturnCoolingDown(item.target.deliveredAt),
    ).length;

    return {
      total: pendingCurrentBatchConversations.length,
      coolingDownCount,
      readyCount: pendingCurrentBatchConversations.length - coolingDownCount,
    };
  }, [pendingCurrentBatchConversations]);
  const pendingReturnExpectedOutcome = useMemo(() => {
    if (!topPendingReturnConversation) {
      return null;
    }

    const topIsCoolingDown = isPendingReturnCoolingDown(
      topPendingReturnConversation.target.deliveredAt,
    );
    const nextReadyCount = topIsCoolingDown
      ? pendingReturnOverview.readyCount
      : Math.max(pendingReturnOverview.readyCount - 1, 0);
    const nextCoolingDownCount = topIsCoolingDown
      ? pendingReturnOverview.coolingDownCount
      : Math.min(
          pendingReturnOverview.coolingDownCount + 1,
          pendingReturnOverview.total,
        );

    return {
      nextReadyCount,
      nextCoolingDownCount,
      summary: topIsCoolingDown
        ? t(msg`当前主推荐本身就在冷却中，结构不会立刻变化，先等它恢复优先位。`)
        : t(
            msg`处理完 ${topPendingReturnConversation.conversation.title} 后，这轮可立即补发会话会先减少一条，刚处理的目标会进入短暂冷却等待回流。`,
          ),
    };
  }, [locale, pendingReturnOverview, topPendingReturnConversation]);
  const fallbackPendingReturnExpectedOutcome = useMemo(() => {
    if (!fallbackPendingReturnConversation) {
      return null;
    }

    const fallbackIsCoolingDown = isPendingReturnCoolingDown(
      fallbackPendingReturnConversation.target.deliveredAt,
    );
    const nextReadyCount = fallbackIsCoolingDown
      ? pendingReturnOverview.readyCount
      : Math.max(pendingReturnOverview.readyCount - 1, 0);
    const nextCoolingDownCount = fallbackIsCoolingDown
      ? pendingReturnOverview.coolingDownCount
      : Math.min(
          pendingReturnOverview.coolingDownCount + 1,
          pendingReturnOverview.total,
        );

    return {
      nextReadyCount,
      nextCoolingDownCount,
      summary: fallbackIsCoolingDown
        ? t(msg`如果改做备选，这轮结构也不会立刻变化，因为它当前还在冷却里。`)
        : t(
            msg`如果先改做 ${fallbackPendingReturnConversation.conversation.title}，可立即补发会话同样会减少一条，但主推荐仍会保留在前面等待处理。`,
          ),
    };
  }, [fallbackPendingReturnConversation, locale, pendingReturnOverview]);

  useEffect(() => {
    if (nativeDesktopGroupInvite) {
      setGroupInviteStoreReady(false);
    }

    let cancelled = false;

    const syncGroupInviteState = async () => {
      await hydrateGroupInviteDeliveryFromNative();
      if (cancelled) {
        return;
      }

      setDeliveredConversation(readGroupInviteDeliveryRecord(groupId));
      setDeliveryTargets(readGroupInviteDeliveryTargets(groupId));
      setReopenRecords(readGroupInviteReopenRecords(groupId));
      setGroupInviteStoreReady(true);
    };

    void syncGroupInviteState();

    if (typeof window === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    const handleFocus = () => {
      void syncGroupInviteState();
    };
    // 走查 新 R1：原版 storage handler 直接复用 handleFocus，OTHER tab 任何
    // localStorage 写入都会触发 hydrate→读 3 个 storage key→setState×4，包括
    // 主题切换、last viewed page、草稿等完全无关的写入。用 isGroupInviteStorageKey
    // gate 一下，只在群邀请投递/记录/复登的 3 个 key 上才真同步；老 Safari 的
    // localStorage.clear() 场景 key=null helper 也按全量同步对待。
    const handleStorage = (event: StorageEvent) => {
      if (!isGroupInviteStorageKey(event.key)) {
        return;
      }
      void syncGroupInviteState();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, [groupId, nativeDesktopGroupInvite]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!groupInviteStoreReady) {
      return;
    }

    const params = new URLSearchParams(search);
    const fromPath = params.get("from")?.trim();
    const fromTitle = params.get("title")?.trim();

    if (!fromPath || !fromTitle) {
      return;
    }

    setReopenRecords(
      writeGroupInviteReopenRecord(groupId, {
        conversationPath: fromPath,
        conversationTitle: fromTitle,
      }),
    );
  }, [groupId, groupInviteStoreReady, search]);

  useEffect(() => {
    if (
      !currentReturnSource ||
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      currentReturnSourceConversation
    ) {
      return;
    }

    void navigate({
      to: "/group/$groupId/qr",
      params: { groupId },
      replace: true,
    });
  }, [
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    currentReturnSource,
    currentReturnSourceConversation,
    groupId,
    navigate,
  ]);

  const handleNoticeBackAction = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({
      to: "/group/$groupId/details",
      params: { groupId },
      ...(detailsRouteHash ? { hash: detailsRouteHash } : {}),
    });
  };

  const getMobileDangerBackAction = () =>
    !isDesktopLayout
      ? {
          secondaryActionLabel: safeReturnPath
            ? t(msg`返回上一页`)
            : t(msg`返回群聊信息`),
          onSecondaryAction: handleNoticeBackAction,
        }
      : {};

  function showNotice(message: string, tone: "success" | "danger" = "success") {
    setNotice({
      message,
      tone,
      ...(tone === "danger" ? getMobileDangerBackAction() : {}),
    });
  }

  const navigateToRouteStateReturn = () => {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  };

  const handleStatusBackAction = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    if (!isDesktopLayout) {
      void navigate({
        to: "/group/$groupId/details",
        params: { groupId },
        ...(detailsRouteHash ? { hash: detailsRouteHash } : {}),
      });
      return;
    }
  };

  function showRetryNotice(
    message: string,
    actionLabel: string,
    onAction: () => void,
  ) {
    setNotice({
      message,
      tone: "danger",
      actionLabel,
      onAction,
      ...getMobileDangerBackAction(),
    });
  }

  async function copyText(
    value: string,
    successMessage: string,
    retryOptions?: {
      actionLabel: string;
      onAction: () => void;
      unavailableMessage?: string;
    },
  ) {
    // 走查 Round 6：原版 if (!navigator.clipboard) → 返回"当前环境暂不支持
    // 复制"。但 writeClipboardText 内部有 3 层兜底（原生 iOS UIPasteboard /
    // Android shell 桥 → Clipboard API → execCommand），iOS WKWebView 里
    // navigator.clipboard 通常 undefined，但原生桥能写。原版的 gate 把这条
    // 路径堵死。删掉 gate，统一由 writeClipboardText 返回的 boolean 决定
    // 后续 toast，并且仍保留 retryOptions.unavailableMessage 用于真的没桥
    // 也没 API 的极端兜底（execCommand 失败）。
    if (await writeClipboardText(value)) {
      showNotice(successMessage);
      return;
    }

    if (retryOptions?.unavailableMessage) {
      showRetryNotice(
        retryOptions.unavailableMessage,
        retryOptions.actionLabel,
        retryOptions.onAction,
      );
      return;
    }

    if (retryOptions) {
      showRetryNotice(
        t(msg`复制失败，请稍后重试。`),
        retryOptions.actionLabel,
        retryOptions.onAction,
      );
      return;
    }

    showNotice(t(msg`复制失败，请稍后重试。`), "danger");
  }

  async function downloadInviteCard() {
    const result = await saveGeneratedFile({
      contents: qrSvgMarkup,
      fileName: `${groupQuery.data?.name ?? "group"}-invite-card.svg`,
      mimeType: "image/svg+xml;charset=utf-8",
      dialogTitle: t(msg`保存群邀请卡`),
      kindLabel: t(msg`群邀请卡`),
    });

    if (result.status === "cancelled") {
      return;
    }

    const canRevealSavedFile =
      result.status === "saved" && Boolean(result.savedPath?.trim());
    const savedPath = canRevealSavedFile ? result.savedPath!.trim() : null;

    setNotice({
      message: result.message,
      tone: result.status === "failed" ? "danger" : "success",
      actionLabel: canRevealSavedFile
        ? t(msg`打开位置`)
        : !isDesktopLayout && result.status === "failed"
          ? t(msg`重试保存邀请卡`)
          : undefined,
      onAction: savedPath
        ? () => {
            void revealSavedFile(savedPath).then((revealed) => {
              showNotice(
                revealed
                  ? t(msg`已打开邀请卡所在位置。`)
                  : t(msg`打开所在位置失败，请稍后再试。`),
                revealed ? "success" : "danger",
              );
            });
          }
        : !isDesktopLayout && result.status === "failed"
          ? () => {
              void downloadInviteCard();
            }
          : undefined,
      ...(!isDesktopLayout && result.status === "failed" && !canRevealSavedFile
        ? getMobileDangerBackAction()
        : {}),
    });
  }

  async function sendToMobile() {
    // 走查 Round 6 同 copyText：去掉 navigator.clipboard 前置 gate，让
    // writeClipboardText 自己走原生 iOS UIPasteboard / Android shell 桥 →
    // Clipboard API → execCommand 兜底；只在三层兜底都失败时才弹 retry。
    if (!(await writeClipboardText(mobileLink))) {
      showRetryNotice(
        t(msg`复制到手机失败，请稍后重试。`),
        t(msg`重试复制到手机`),
        () => {
          void sendToMobile();
        },
      );
      return;
    }
    try {
      pushMobileHandoffRecord({
        category: "group_invite",
        label: t(msg`${groupQuery.data?.name ?? fallbackGroupLabel} 邀请`),
        description: t(
          msg`把 ${groupQuery.data?.name ?? fallbackCurrentGroupLabel} 的邀请入口发到手机继续查看和转发。`,
        ),
        path: `/group/${groupId}`,
      });
      showNotice(t(msg`群邀请入口已复制到手机。`));
    } catch {
      showRetryNotice(
        t(msg`复制到手机失败，请稍后重试。`),
        t(msg`重试复制到手机`),
        () => {
          void sendToMobile();
        },
      );
    }
  }

  async function shareInvite() {
    const shared = await shareWithNativeShell({
      title: t(msg`${groupDisplayName} 邀请`),
      text: inviteText,
      url: inviteLink,
    });

    if (shared) {
      showNotice(t(msg`已打开系统分享面板。`));
      return;
    }

    // 走查 Round 4：原版回退直接调 navigator.clipboard.writeText，但 iOS
     // WKWebView 经常因为 user-gesture/permission 写不进，结果"已复制群邀请
     // 文案"弹了但剪贴板是空的。换成 writeClipboardText —— 内部先走 iOS/Android
     // shell 原生 UIPasteboard 桥，再 Clipboard API，再 execCommand 兜底。
     // 同 copyText / sendToMobile 路径已经走这个 helper。
    if (!(await writeClipboardText(inviteText))) {
      showRetryNotice(
        t(msg`系统分享暂时不可用，请稍后重试。`),
        t(msg`重试分享`),
        () => {
          void shareInvite();
        },
      );
      return;
    }
    showNotice(t(msg`系统分享暂时不可用，已复制群邀请文案。`));
  }

  async function shareInviteLink() {
    if (!nativeMobileShareSupported) {
      await copyText(inviteLink, t(msg`群链接已复制。`), {
        actionLabel: t(msg`重试复制`),
        onAction: () => {
          void shareInviteLink();
        },
        unavailableMessage: t(msg`当前环境暂不支持复制群链接。`),
      });
      return;
    }

    const shared = await shareWithNativeShell({
      title: t(msg`${groupDisplayName} 群链接`),
      text: `${groupDisplayName}\n${inviteLink}`,
      url: inviteLink,
    });

    if (shared) {
      showNotice(t(msg`已打开系统分享面板。`));
      return;
    }

    await copyText(inviteLink, t(msg`系统分享暂时不可用，已复制群链接。`), {
      actionLabel: t(msg`重试分享`),
      onAction: () => {
        void shareInviteLink();
      },
      unavailableMessage: t(msg`当前设备暂时无法打开系统分享，请稍后重试。`),
    });
  }

  async function shareInviteTextOnly() {
    if (!nativeMobileShareSupported) {
      await copyText(inviteText, t(msg`群邀请文案已复制。`), {
        actionLabel: t(msg`重试复制`),
        onAction: () => {
          void shareInviteTextOnly();
        },
        unavailableMessage: t(msg`当前环境暂不支持复制群邀请文案。`),
      });
      return;
    }

    const shared = await shareWithNativeShell({
      title: t(msg`${groupDisplayName} 邀请文案`),
      text: inviteText,
      url: inviteLink,
    });

    if (shared) {
      showNotice(t(msg`已打开系统分享面板。`));
      return;
    }

    await copyText(inviteText, t(msg`系统分享暂时不可用，已复制群邀请文案。`), {
      actionLabel: t(msg`重试分享`),
      onAction: () => {
        void shareInviteTextOnly();
      },
      unavailableMessage: t(msg`当前设备暂时无法打开系统分享，请稍后重试。`),
    });
  }

  // 同步防双击锁——下面 9 处「投递到会话」按钮全都用 `void sendToConversation(conv)`
  // 触发，函数体里要 await sendGroupMessage / emitChatMessage（实际公网隧道约
  // 600ms RTT）；按钮自身没有 disabled 状态，用户在第一次 click 还没回来之前
  // 再戳一次同一行会再飞一份相同的群邀请文本到同一个会话——朋友收到 2 条
  // 一模一样的"xxx 邀请你加入群聊"，体验很差。按 conversationId 维度上锁，
  // finally 解锁；不同会话间不互相阻塞，用户可以连点不同行批量投。
  const sendingConversationsRef = useRef<Set<string>>(new Set());
  // 走查移动端群聊 R3：本页有 5+ 处「回到会话」按钮（currentReturnSourceConversation
  // / activeDeliveredConversation / deliveryTarget batches / reopenRecord /
  // relatedReturnConversations）都 `onClick={() => { void navigate({to:
  // buildConversationOpenPath(conv)}) }}` 形态，没挂 disabled / 没同步 ref 守。
  // 同帧 <16ms 双击同一行 push 2 条相同 history 项——用户从目标会话退回群邀请
  // 页要按 2 次返回；移动端 yuanzui 群邀请走查最易踩到的浅层 bug。
  // 用一个共享 ref 守住所有「回到会话」前进按钮（不同会话也不冲突，因为页面
  // 跳出后会 unmount/remount 自动复位 ref），raf 后释放兜底 navigate 没真正
  // 切走。
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
  // 走查 R1：直聊分支 emitChatMessage 后 setTimeout 500ms 再 invalidate
  // conversations（给 socket 服务端写入完成留窗口）。原版每次邀请都 schedule
  // 一份独立 setTimeout，N 个会话连发就堆 N 个定时器，全在 ~500ms 内 fire →
  // N 次 invalidate；react-query 对同一 queryKey 的并发 refetch dedup 但
  // 已结束的会重新发——上传完成后排队再发 1-N 次 GET /conversations。更糟
  // 的是 unmount 后定时器没清，仍然 fire 一次 invalidate 给其它已挂载页（多
  // 一次公网 ~600ms RTT 的无用拉刷）。改成共享单 timer，新邀请重置 deadline；
  // unmount 时清掉。
  const pendingConversationsInvalidateTimerRef = useRef<number | null>(null);
  const scheduleConversationsInvalidate = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (pendingConversationsInvalidateTimerRef.current !== null) {
      window.clearTimeout(pendingConversationsInvalidateTimerRef.current);
    }
    pendingConversationsInvalidateTimerRef.current = window.setTimeout(() => {
      pendingConversationsInvalidateTimerRef.current = null;
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    }, 500);
  }, [baseUrl, queryClient]);
  useEffect(() => {
    return () => {
      if (typeof window === "undefined") {
        return;
      }
      if (pendingConversationsInvalidateTimerRef.current !== null) {
        window.clearTimeout(pendingConversationsInvalidateTimerRef.current);
        pendingConversationsInvalidateTimerRef.current = null;
      }
    };
  }, []);
  async function sendToConversation(conversation: ConversationListItem) {
    if (sendingConversationsRef.current.has(conversation.id)) {
      return;
    }
    sendingConversationsRef.current.add(conversation.id);
    try {
      await doSendToConversation(conversation);
    } catch (error) {
      // 走查 R1：群投递分支里 await sendGroupMessage 抛错（公网隧道超时 /
      // cloud token 失效重连 / 服务端 5xx）会一路冒到 caller 的 `void
      // sendToConversation(...)`——void 不接 rejection，落到 window.
      // unhandledrejection 污染 telemetry；用户也不会看到任何提示，按钮上
      // 没有任何反馈，第二下又被同步锁拦住，看着像"卡住了"。catch 这里就地
      // 翻成 danger notice，同时让上层 finally 正常解锁释放重试入口。
      const message =
        error instanceof Error && error.message
          ? error.message
          : t(msg`发送群邀请失败，请稍后重试。`);
      showNotice(
        t(msg`未能把群邀请发到 ${conversation.title}：${message}`),
        "danger",
      );
    } finally {
      sendingConversationsRef.current.delete(conversation.id);
    }
  }

  async function doSendToConversation(conversation: ConversationListItem) {
    const conversationPath = isPersistedGroupConversation(conversation)
      ? `/group/${conversation.id}`
      : `/chat/${conversation.id}`;

    if (isPersistedGroupConversation(conversation)) {
      await sendGroupMessage(
        conversation.id,
        {
          text: inviteMessage,
        },
        baseUrl,
      );
      setDeliveredConversation(
        writeGroupInviteDeliveryRecord(groupId, {
          conversationId: conversation.id,
          conversationPath,
          conversationTitle: conversation.title,
          groupName: groupQuery.data?.name,
          inviteRouteHash,
          batchId: deliveryBatch.id,
          batchStartedAt: deliveryBatch.startedAt,
        }),
      );
      setDeliveryTargets(readGroupInviteDeliveryTargets(groupId));
      showNotice(t(msg`已把群邀请发到 ${conversation.title}。`));
      // 本会话 R1：和直聊分支 (line ~1101) 对齐 fire-and-forget。原本 await
      // 让 sendingConversationsRef per-conversation 锁多撑 ~600ms 公网隧道
      // RTT；这条 invalidate 是为「其它页面」拉刷 conversations，本页不
      // 直接消费，await 没必要。
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      return;
    }

    const characterId = conversation.participants[0];
    if (!characterId) {
      showNotice(
        t(msg`这条单聊暂时没有可用的角色目标，无法发送群邀请。`),
        "danger",
      );
      return;
    }

    joinConversationRoom({ conversationId: conversation.id });
    emitChatMessage({
      conversationId: conversation.id,
      characterId,
      text: inviteMessage,
    });
    scheduleConversationsInvalidate();
    setDeliveredConversation(
      writeGroupInviteDeliveryRecord(groupId, {
        conversationId: conversation.id,
        conversationPath,
        conversationTitle: conversation.title,
        groupName: groupQuery.data?.name,
        inviteRouteHash,
        batchId: deliveryBatch.id,
        batchStartedAt: deliveryBatch.startedAt,
      }),
    );
    setDeliveryTargets(readGroupInviteDeliveryTargets(groupId));
    showNotice(t(msg`已把群邀请发到 ${conversation.title}。`));
  }

  const content = (
    <>
      {groupQuery.isLoading || membersQuery.isLoading ? (
        isDesktopLayout ? (
          <LoadingBlock label={t(msg`正在生成群邀请卡...`)} />
        ) : (
          <MobileGroupInviteStatusCard
            badge={t(msg`读取中`)}
            title={t(msg`正在生成群邀请卡`)}
            description={t(msg`稍等一下，正在同步群资料和成员信息。`)}
            tone="loading"
          />
        )
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        isDesktopLayout ? (
          <ErrorBlock message={groupQuery.error.message} />
        ) : (
          <MobileGroupInviteStatusCard
            badge={t(msg`群聊`)}
            title={t(msg`群邀请页暂时不可用`)}
            description={groupQuery.error.message}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void groupQuery.refetch();
                  }}
                  className="rounded-full"
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleStatusBackAction}
                  className="rounded-full"
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回群聊信息`)}
                </Button>
              </div>
            }
          />
        )
      ) : null}
      {membersQuery.isError && membersQuery.error instanceof Error ? (
        isDesktopLayout ? (
          <ErrorBlock message={membersQuery.error.message} />
        ) : (
          <MobileGroupInviteStatusCard
            badge={t(msg`成员`)}
            title={t(msg`群成员信息暂时不可用`)}
            description={membersQuery.error.message}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void membersQuery.refetch();
                  }}
                  className="rounded-full"
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleStatusBackAction}
                  className="rounded-full"
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回群聊信息`)}
                </Button>
              </div>
            }
          />
        )
      ) : null}
      {notice ? (
        <InlineNotice
          className={cn(
            "flex items-center justify-between gap-3",
            !isDesktopLayout &&
              "rounded-[14px] px-3 py-2 text-[11px] leading-[1.45] shadow-none",
          )}
          tone={notice.tone}
        >
          <span>{notice.message}</span>
          {notice.actionLabel && notice.onAction ? (
            <div className="flex items-center gap-2">
              <InlineNoticeActionButton
                label={notice.actionLabel}
                onClick={notice.onAction}
              />
              {notice.secondaryActionLabel && notice.onSecondaryAction ? (
                <InlineNoticeActionButton
                  label={notice.secondaryActionLabel}
                  onClick={notice.onSecondaryAction}
                />
              ) : null}
            </div>
          ) : notice.secondaryActionLabel && notice.onSecondaryAction ? (
            <InlineNoticeActionButton
              label={notice.secondaryActionLabel}
              onClick={notice.onSecondaryAction}
            />
          ) : null}
        </InlineNotice>
      ) : null}

      {groupQuery.data ? (
        <section
          className={
            isDesktopLayout
              ? "space-y-5 rounded-[28px] border border-black/5 bg-white p-5 shadow-[var(--shadow-section)]"
              : "-mx-3 space-y-4 border-y border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-4 py-4"
          }
        >
          <div
            className={`flex items-start ${isDesktopLayout ? "gap-4" : "gap-3"}`}
          >
            <GroupAvatarChip
              name={groupQuery.data.name}
              members={memberIdsForAvatar}
              size="wechat"
            />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold text-[color:var(--text-primary)]">
                {groupQuery.data.name}
              </div>
              {/* 走查新一轮 R1：原本 `${members?.length ?? 0} 人群聊`——和
                  上方 qrSvgMarkup 同款 loading flicker：membersQuery 飞行中
                  群邀请卡顶部副标先闪一帧"0 人群聊"再跳到真实数字。loading
                  时压根不渲这行副标，等数到达。 */}
              {memberCount !== undefined ? (
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  {t(msg`${memberCount} 人群聊`)}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                {t(
                  msg`最近活跃 ${formatConversationTimestamp(groupQuery.data.lastActivityAt)}`,
                )}
              </div>
            </div>
          </div>

          {currentReturnSourceConversation ? (
            <section
              className={
                isDesktopLayout
                  ? "flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-4 py-4"
                  : "space-y-3 rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-4"
              }
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs font-medium ${isDesktopLayout ? "tracking-[0.16em] text-[color:var(--brand-primary)]" : "tracking-[0.12em] text-[color:var(--brand-primary)]"}`}
                >
                  {t(msg`当前回流来源`)}
                </div>
                <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                  {t(msg`来自 ${currentReturnSourceConversation.title}`)}
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                  {t(
                    msg`这次是从聊天线程直接回到群邀请页，可继续转发或回到原会话。`,
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={guardRowNavigation(() => {
                    void navigate({
                      to: buildConversationOpenPath(
                        currentReturnSourceConversation,
                      ),
                    });
                  })}
                  className="shrink-0 rounded-full"
                >
                  {t(msg`回到会话`)}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void sendToConversation(currentReturnSourceConversation);
                  }}
                  className="shrink-0 rounded-full"
                >
                  {t(msg`再发回这个会话`)}
                </Button>
              </div>
            </section>
          ) : null}

          <div
            className={
              isDesktopLayout
                ? "overflow-hidden rounded-[24px] border border-[rgba(7,193,96,0.12)] bg-[linear-gradient(180deg,rgba(248,250,249,0.98),rgba(255,255,255,0.98))] p-5 shadow-none"
                : "overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-5 shadow-none"
            }
          >
            <div
              className="mx-auto w-full max-w-[420px]"
              dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
            />
          </div>

          <div
            className={
              isDesktopLayout
                ? "grid gap-3 sm:grid-cols-4"
                : "grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--border-subtle)]"
            }
          >
            <ActionCard
              compact={!isDesktopLayout}
              icon={
                nativeMobileShareSupported ? (
                  <Share2 size={16} />
                ) : (
                  <Link2 size={16} />
                )
              }
              title={
                nativeMobileShareSupported
                  ? t(msg`分享群链接`)
                  : t(msg`复制群链接`)
              }
              description={
                nativeMobileShareSupported
                  ? t(msg`直接通过系统分享发送群入口链接。`)
                  : mobileWebCopyFallback
                    ? t(msg`复制当前群聊入口链接，稍后可直接粘贴发送。`)
                    : t(msg`把当前群聊入口发给别的设备继续打开。`)
              }
              onClick={() => {
                void shareInviteLink();
              }}
            />
            <ActionCard
              compact={!isDesktopLayout}
              icon={<Share2 size={16} />}
              title={
                nativeMobileShareSupported
                  ? t(msg`分享邀请文案`)
                  : t(msg`复制邀请文案`)
              }
              description={
                nativeMobileShareSupported
                  ? t(msg`直接通过系统分享发送完整邀请文案。`)
                  : mobileWebCopyFallback
                    ? t(msg`复制带群链接和邀请码的完整邀请文案。`)
                    : t(msg`带上群链接和邀请码，一次性发给对方。`)
              }
              onClick={() => {
                void shareInviteTextOnly();
              }}
            />
            {!mobileWebCopyFallback ? (
              <ActionCard
                compact={!isDesktopLayout}
                icon={
                  nativeMobileShareSupported ? (
                    <Share2 size={16} />
                  ) : (
                    <Copy size={16} />
                  )
                }
                title={
                  nativeMobileShareSupported
                    ? t(msg`系统分享`)
                    : t(msg`发到手机`)
                }
                description={
                  nativeMobileShareSupported
                    ? t(msg`直接通过系统分享面板发给联系人或其他应用。`)
                    : t(msg`把当前群邀请入口复制到手机，并进入接力历史。`)
                }
                onClick={() => {
                  if (nativeMobileShareSupported) {
                    void shareInvite();
                    return;
                  }

                  void sendToMobile();
                }}
              />
            ) : null}
            <ActionCard
              compact={!isDesktopLayout}
              icon={<Download size={16} />}
              title={t(msg`保存邀请卡`)}
              description={t(msg`保存当前邀请卡 SVG，后续可继续转发。`)}
              onClick={downloadInviteCard}
            />
          </div>

          <div
            className={
              isDesktopLayout
                ? "rounded-[20px] border border-dashed border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.72)] px-4 py-4 text-sm leading-7 text-[color:var(--text-secondary)]"
                : "rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] px-4 py-3 text-xs leading-6 text-[color:var(--text-secondary)]"
            }
          >
            {t(
              msg`当前邀请卡会承载群聊链接和邀请码。 在同一世界实例内打开链接，可直接回到这个群聊。`,
            )}
          </div>

          {activeDeliveredConversation ? (
            <section
              className={
                isDesktopLayout
                  ? "flex items-center justify-between gap-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.72)] px-4 py-4"
                  : "flex items-center justify-between gap-3 rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3"
              }
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {t(
                    msg`最近投递到 ${activeDeliveredConversation.conversationTitle}`,
                  )}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {formatConversationTimestamp(
                    activeDeliveredConversation.deliveredAt,
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={guardRowNavigation(() => {
                  void navigate({
                    to: resolveConversationOpenPath(
                      activeDeliveredConversation.conversationPath,
                    ),
                  });
                })}
                className="shrink-0 rounded-full"
              >
                {t(msg`回到会话`)}
              </Button>
            </section>
          ) : null}

          {validDeliveryTargets.length ? (
            <section className="space-y-3 rounded-[22px] border border-black/5 bg-white px-4 py-4">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {t(msg`最近已发邀请会话`)}
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                  {t(
                    msg`这些会话已经收到过这张群邀请，并按发送批次归组，方便判断这一轮已经扩散到哪里。`,
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {deliveryTargetBatches.map((batch, index) => (
                  <section
                    key={batch.batchId}
                    className="space-y-2 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white/86 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-xs font-medium tracking-[0.14em] text-[color:var(--brand-primary)]">
                          {index === 0
                            ? t(msg`最新发送批次`)
                            : t(msg`更早批次 ${index + 1}`)}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                            batch.status === "closed"
                              ? "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
                              : batch.status === "reopened"
                                ? "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
                                : "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-muted)]"
                          }`}
                        >
                          {batch.status === "closed"
                            ? t(msg`本轮已闭环`)
                            : batch.status === "reopened"
                              ? t(msg`已有回流`)
                              : t(msg`等待回流`)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {t(
                          msg`${batch.items.length} 条会话 · 开始于 ${formatConversationTimestamp(batch.batchStartedAt)}`,
                        )}
                        {batch.reopenedCount
                          ? t(msg` · 已回流 ${batch.reopenedCount} 条`)
                          : ""}
                      </div>
                    </div>
                    {batch.items.map((record) => (
                      <div
                        key={`${record.conversationPath}:${record.deliveredAt}`}
                        className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                            {record.conversationTitle}
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                            {t(
                              msg`发送于 ${formatConversationTimestamp(record.deliveredAt)}`,
                            )}
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={guardRowNavigation(() => {
                            void navigate({
                              to: resolveConversationOpenPath(
                                record.conversationPath,
                              ),
                            });
                          })}
                          className="shrink-0 rounded-full"
                        >
                          {t(msg`回到会话`)}
                        </Button>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </section>
          ) : null}

          {validReopenRecords.length ? (
            <section
              className={
                isDesktopLayout
                  ? "space-y-3 rounded-[22px] border border-black/5 bg-white px-4 py-4"
                  : "overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
              }
            >
              <div className={isDesktopLayout ? undefined : "px-4 py-4"}>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {t(msg`最近从这些会话回到邀请页`)}
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                  {t(
                    msg`从聊天线程点了“回到群邀请”后，会把最近回流入口记在这里，方便再次回到消息流。`,
                  )}
                </div>
              </div>

              <div
                className={
                  isDesktopLayout
                    ? "space-y-2"
                    : "divide-y divide-[color:var(--border-subtle)] border-t border-[color:var(--border-subtle)]"
                }
              >
                {validReopenRecords.map((record) => (
                  <div
                    key={`${record.conversationPath}:${record.reopenedAt}`}
                    className={
                      isDesktopLayout
                        ? "flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3"
                        : "flex items-center justify-between gap-3 bg-white px-4 py-3"
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {record.conversationTitle}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {t(
                          msg`回流于 ${formatConversationTimestamp(record.reopenedAt)}`,
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={guardRowNavigation(() => {
                        void navigate({
                          to: resolveConversationOpenPath(
                            record.conversationPath,
                          ),
                        });
                      })}
                      className="shrink-0 rounded-full"
                    >
                      {t(msg`回到会话`)}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section
            className={
              isDesktopLayout
                ? "space-y-3 rounded-[22px] border border-black/5 bg-white px-4 py-4"
                : "overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
            }
          >
            <div className={isDesktopLayout ? undefined : "px-4 py-4"}>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {t(msg`发到最近会话`)}
              </div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                {t(msg`直接把当前群邀请投递到最近会话，回到消息流里继续转发。`)}
              </div>
            </div>

            {conversationsQuery.isLoading ? (
              isDesktopLayout ? (
                <LoadingBlock label={t(msg`正在读取最近会话...`)} />
              ) : (
                <div className="px-4 pb-4">
                  <MobileGroupInviteStatusCard
                    badge={t(msg`会话`)}
                    title={t(msg`正在读取最近会话`)}
                    description={t(
                      msg`稍等一下，正在整理最近可投递的聊天入口。`,
                    )}
                    tone="loading"
                  />
                </div>
              )
            ) : null}
            {conversationsQuery.isError &&
            conversationsQuery.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={conversationsQuery.error.message} />
              ) : (
                <div className="px-4 pb-4">
                  <MobileGroupInviteStatusCard
                    badge={t(msg`会话`)}
                    title={t(msg`最近会话暂时不可用`)}
                    description={conversationsQuery.error.message}
                    tone="danger"
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            void conversationsQuery.refetch();
                          }}
                          className="rounded-full"
                        >
                          {t(msg`重试读取`)}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleStatusBackAction}
                          className="rounded-full"
                        >
                          {safeReturnPath
                            ? t(msg`返回上一页`)
                            : t(msg`返回群聊信息`)}
                        </Button>
                      </div>
                    }
                  />
                </div>
              )
            ) : null}
            {pendingCurrentBatchConversations.length ? (
              <div className="space-y-2">
                <div className="text-xs font-medium tracking-[0.14em] text-[color:var(--brand-primary)]">
                  {t(msg`本轮待回流会话`)}
                </div>
                <div className="text-xs leading-6 text-[color:var(--text-secondary)]">
                  {t(
                    msg`这一轮已经发出但还没有从聊天线程回到邀请页的目标，会先避开刚补发过的会话；冷却结束后会自动回到优先位，再按最近活跃和发送先后优先补发。`,
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-[14px] border border-[rgba(15,23,42,0.08)] bg-white/72 px-3 py-3">
                    <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                      {t(msg`本轮待处理`)}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-[color:var(--text-primary)]">
                      {pendingReturnOverview.total}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                      {t(msg`当前仍在等待回流的会话数`)}
                    </div>
                  </div>
                  <div className="rounded-[14px] border border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.07)] px-3 py-3">
                    <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--brand-primary)]">
                      {t(msg`可立即补发`)}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-[color:var(--text-primary)]">
                      {pendingReturnOverview.readyCount}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                      {t(msg`不在冷却中，可直接继续补发`)}
                    </div>
                  </div>
                  <div className="rounded-[14px] border border-[rgba(15,23,42,0.08)] bg-[rgba(15,23,42,0.04)] px-3 py-3">
                    <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                      {t(msg`冷却暂缓`)}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-[color:var(--text-primary)]">
                      {pendingReturnOverview.coolingDownCount}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                      {t(msg`刚补发过，先等一轮回流`)}
                    </div>
                  </div>
                </div>
                <div className="rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-white/72 px-4 py-3">
                  <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                    {t(msg`处理顺序`)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {topPendingReturnConversation ? (
                      <span className="rounded-full bg-[rgba(7,193,96,0.07)] px-2.5 py-1 font-medium text-[color:var(--brand-primary)]">
                        {t(
                          msg`1. 先补 ${topPendingReturnConversation.conversation.title}`,
                        )}
                      </span>
                    ) : null}
                    {fallbackPendingReturnConversation ? (
                      <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2.5 py-1 font-medium text-[color:var(--text-secondary)]">
                        {t(
                          msg`2. 再看 ${fallbackPendingReturnConversation.conversation.title}`,
                        )}
                      </span>
                    ) : null}
                    {deferredPendingReturnConversation ? (
                      <span className="rounded-full bg-[rgba(15,23,42,0.04)] px-2.5 py-1 font-medium text-[color:var(--text-muted)]">
                        {t(
                          msg`3. 冷却后处理 ${deferredPendingReturnConversation.conversation.title}`,
                        )}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                    {topPendingReturnConversation
                      ? fallbackPendingReturnConversation &&
                        deferredPendingReturnConversation
                        ? t(
                            msg`先走主推荐，不走第一条就切备选，冷却目标等恢复后再补。`,
                          )
                        : fallbackPendingReturnConversation
                          ? t(msg`先走主推荐，不走第一条就切备选。`)
                          : deferredPendingReturnConversation
                            ? t(msg`先走主推荐，冷却目标等恢复后再补。`)
                            : t(msg`先走主推荐。`)
                      : t(msg`当前没有可执行顺序。`)}
                  </div>
                </div>
                {pendingReturnExpectedOutcome ? (
                  <div className="rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.72)] px-4 py-3">
                    <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                      {t(msg`预计处理后`)}
                    </div>
                    <div className="mt-2 grid gap-2 lg:grid-cols-2">
                      <div className="rounded-[12px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-3">
                        <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--brand-primary)]">
                          {t(msg`先处理主推荐`)}
                        </div>
                        <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
                          {topPendingReturnConversation?.conversation.title}
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-[12px] bg-[rgba(7,193,96,0.07)] px-3 py-3">
                            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--brand-primary)]">
                              {t(msg`可立即补发`)}
                            </div>
                            <div className="mt-1 text-base font-semibold text-[color:var(--text-primary)]">
                              {pendingReturnExpectedOutcome.nextReadyCount}
                            </div>
                          </div>
                          <div className="rounded-[12px] bg-[rgba(15,23,42,0.04)] px-3 py-3">
                            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                              {t(msg`冷却暂缓`)}
                            </div>
                            <div className="mt-1 text-base font-semibold text-[color:var(--text-primary)]">
                              {
                                pendingReturnExpectedOutcome.nextCoolingDownCount
                              }
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                          {pendingReturnExpectedOutcome.summary}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-white/72 px-3 py-3">
                        <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                          {t(msg`改做次优先备选`)}
                        </div>
                        <div className="mt-1 text-sm font-medium text-[color:var(--text-primary)]">
                          {fallbackPendingReturnConversation?.conversation
                            .title ?? t(msg`暂无备选`)}
                        </div>
                        {fallbackPendingReturnExpectedOutcome ? (
                          <>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <div className="rounded-[12px] bg-[rgba(7,193,96,0.07)] px-3 py-3">
                                <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--brand-primary)]">
                                  {t(msg`可立即补发`)}
                                </div>
                                <div className="mt-1 text-base font-semibold text-[color:var(--text-primary)]">
                                  {
                                    fallbackPendingReturnExpectedOutcome.nextReadyCount
                                  }
                                </div>
                              </div>
                              <div className="rounded-[12px] bg-[rgba(15,23,42,0.04)] px-3 py-3">
                                <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                                  {t(msg`冷却暂缓`)}
                                </div>
                                <div className="mt-1 text-base font-semibold text-[color:var(--text-primary)]">
                                  {
                                    fallbackPendingReturnExpectedOutcome.nextCoolingDownCount
                                  }
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                              {fallbackPendingReturnExpectedOutcome.summary}
                            </div>
                          </>
                        ) : (
                          <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                            {t(msg`当前没有次优先备选。`)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                      {resolvePendingReturnOutcomeConclusion(
                        topPendingReturnConversation,
                        fallbackPendingReturnConversation,
                        fallbackPendingReturnExpectedOutcome,
                        pendingReturnExpectedOutcome,
                      )}
                    </div>
                  </div>
                ) : null}
                {topPendingReturnConversation ? (
                  <div className="rounded-[18px] border border-[rgba(7,193,96,0.14)] bg-[linear-gradient(180deg,rgba(248,250,249,0.98),rgba(255,255,255,0.96))] px-4 py-4 shadow-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium tracking-[0.14em] text-[color:var(--brand-primary)]">
                          {t(msg`当前最值得优先补发`)}
                        </div>
                        <div className="mt-2 truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {topPendingReturnConversation.conversation.title}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {resolvePendingReturnCardMetaSummary(
                            topPendingReturnConversation.conversation,
                            topPendingReturnConversation.target.deliveredAt,
                          )}
                        </div>
                        <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                          {resolvePendingReturnRecommendationSummary(
                            topPendingReturnConversation.conversation,
                            topPendingReturnConversation.target.deliveredAt,
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="mb-2 flex justify-end">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              resolvePendingReturnActionStatus(
                                topPendingReturnConversation.conversation,
                                topPendingReturnConversation.target.deliveredAt,
                              ).tone
                            }`}
                          >
                            {
                              resolvePendingReturnActionStatus(
                                topPendingReturnConversation.conversation,
                                topPendingReturnConversation.target.deliveredAt,
                              ).label
                            }
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void sendToConversation(
                              topPendingReturnConversation.conversation,
                            );
                          }}
                          className="rounded-full bg-[rgba(7,193,96,0.07)] px-3 py-1.5 text-xs font-medium text-[color:var(--brand-primary)] transition hover:bg-[rgba(7,193,96,0.12)]"
                        >
                          {isPendingReturnCoolingDown(
                            topPendingReturnConversation.target.deliveredAt,
                          )
                            ? t(msg`稍后补发`)
                            : t(msg`现在补发`)}
                        </button>
                        <div className="mt-2 max-w-[12rem] text-[11px] leading-5 text-[color:var(--text-secondary)]">
                          {resolvePendingReturnActionHint(
                            topPendingReturnConversation.conversation,
                            topPendingReturnConversation.target.deliveredAt,
                          )}
                        </div>
                        <div className="mt-1 max-w-[12rem] text-[11px] leading-5 text-[color:var(--text-muted)]">
                          {resolvePendingReturnActionRiskHint(
                            topPendingReturnConversation.conversation,
                            topPendingReturnConversation.target.deliveredAt,
                          )}
                        </div>
                      </div>
                    </div>
                    {fallbackPendingReturnConversation ? (
                      <div className="mt-3 rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-white/72 px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                              {t(msg`次优先备选`)}
                            </div>
                            <div className="mt-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                  resolvePendingReturnActionStatus(
                                    fallbackPendingReturnConversation.conversation,
                                    fallbackPendingReturnConversation.target
                                      .deliveredAt,
                                  ).tone
                                }`}
                              >
                                {
                                  resolvePendingReturnActionStatus(
                                    fallbackPendingReturnConversation.conversation,
                                    fallbackPendingReturnConversation.target
                                      .deliveredAt,
                                  ).label
                                }
                              </span>
                            </div>
                            <div className="mt-1 truncate text-sm font-medium text-[color:var(--text-primary)]">
                              {
                                fallbackPendingReturnConversation.conversation
                                  .title
                              }
                            </div>
                            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                              {resolvePendingReturnCardMetaSummary(
                                fallbackPendingReturnConversation.conversation,
                                fallbackPendingReturnConversation.target
                                  .deliveredAt,
                              )}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                              {resolvePendingReturnFallbackReason(
                                topPendingReturnConversation.conversation,
                                topPendingReturnConversation.target.deliveredAt,
                                fallbackPendingReturnConversation.conversation,
                                fallbackPendingReturnConversation.target
                                  .deliveredAt,
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void sendToConversation(
                                fallbackPendingReturnConversation.conversation,
                              );
                            }}
                            className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                          >
                            {t(msg`切到备选`)}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {deferredPendingReturnConversation ? (
                      <div className="mt-3 rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-[rgba(15,23,42,0.04)] px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                              {t(msg`暂缓处理`)}
                            </div>
                            <div className="mt-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                  resolvePendingReturnActionStatus(
                                    deferredPendingReturnConversation.conversation,
                                    deferredPendingReturnConversation.target
                                      .deliveredAt,
                                  ).tone
                                }`}
                              >
                                {
                                  resolvePendingReturnActionStatus(
                                    deferredPendingReturnConversation.conversation,
                                    deferredPendingReturnConversation.target
                                      .deliveredAt,
                                  ).label
                                }
                              </span>
                            </div>
                            <div className="mt-1 truncate text-sm font-medium text-[color:var(--text-primary)]">
                              {
                                deferredPendingReturnConversation.conversation
                                  .title
                              }
                            </div>
                            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                              {resolvePendingReturnCardMetaSummary(
                                deferredPendingReturnConversation.conversation,
                                deferredPendingReturnConversation.target
                                  .deliveredAt,
                              )}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                              {t(
                                msg`这条刚补发过，等冷却结束后会自动回到优先位。`,
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void sendToConversation(
                                deferredPendingReturnConversation.conversation,
                              );
                            }}
                            className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-muted)] transition hover:border-[rgba(15,23,42,0.14)] hover:text-[color:var(--text-primary)]"
                          >
                            {t(msg`暂缓处理`)}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {pendingCurrentBatchConversations.map(
                  ({ conversation, target }) => (
                    <button
                      key={`${conversation.id}:${target.deliveredAt}`}
                      type="button"
                      onClick={() => {
                        void sendToConversation(conversation);
                      }}
                      className={
                        isDesktopLayout
                          ? "flex w-full items-center justify-between gap-3 rounded-[18px] border border-black/5 bg-white px-4 py-3 text-left shadow-none transition hover:bg-[color:var(--surface-console)]"
                          : "flex w-full items-center justify-between gap-3 rounded-[16px] border border-[color:var(--border-subtle)] bg-white px-4 py-3 text-left shadow-none transition active:bg-[color:var(--surface-card-hover)]"
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className={`rounded-full px-2.5 py-1 font-medium ${
                              resolvePendingReturnActionStatus(
                                conversation,
                                target.deliveredAt,
                              ).tone
                            }`}
                          >
                            {
                              resolvePendingReturnActionStatus(
                                conversation,
                                target.deliveredAt,
                              ).label
                            }
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 font-medium ${
                              resolvePendingReturnPrimaryReason(
                                conversation,
                                target.deliveredAt,
                              ).tone
                            }`}
                          >
                            {
                              resolvePendingReturnPrimaryReason(
                                conversation,
                                target.deliveredAt,
                              ).label
                            }
                          </span>
                        </div>
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {conversation.title}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {resolvePendingReturnMetaSummary(
                            conversation,
                            target,
                            deliveryBatchRankById,
                          )}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                          {resolvePendingReturnRecommendationSummary(
                            conversation,
                            target.deliveredAt,
                          )}
                        </div>
                        {isPendingReturnCoolingDown(target.deliveredAt) ? (
                          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                            {t(
                              msg`冷却剩余 ${formatPendingReturnCooldownRemaining(target.deliveredAt)}，结束后会自动回到优先位。`,
                            )}
                          </div>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.07)] px-3 py-1 text-xs text-[color:var(--brand-primary)]">
                        {resolvePendingReturnActionLabel(
                          conversation,
                          target.deliveredAt,
                        )}
                      </span>
                    </button>
                  ),
                )}
              </div>
            ) : null}
            {!conversationsQuery.isLoading && !recentConversations.length ? (
              <div
                className={
                  isDesktopLayout
                    ? "rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/72 px-4 py-4 text-sm text-[color:var(--text-secondary)]"
                    : "border-t border-dashed border-[color:var(--border-subtle)] px-4 py-4 text-sm text-[color:var(--text-secondary)]"
                }
              >
                {t(msg`还没有可投递的最近会话。`)}
              </div>
            ) : null}
            {currentReturnSourceConversation ? (
              <div
                className={
                  isDesktopLayout
                    ? undefined
                    : "border-t border-[color:var(--border-subtle)]"
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    void sendToConversation(currentReturnSourceConversation);
                  }}
                  className={
                    isDesktopLayout
                      ? "flex w-full items-center justify-between gap-3 rounded-[18px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-4 py-3 text-left shadow-none transition hover:bg-white"
                      : "flex w-full items-center justify-between gap-3 bg-[rgba(7,193,96,0.07)] px-4 py-3 text-left shadow-none transition active:bg-white"
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium tracking-[0.14em] text-[color:var(--brand-primary)]">
                      {t(msg`优先回发给来源会话`)}
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-[color:var(--text-primary)]">
                      {currentReturnSourceConversation.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`rounded-full px-2.5 py-1 font-medium ${
                          resolveConversationActionStatus(
                            currentReturnSourceConversation,
                            deliveredTargetByPath[
                              buildConversationPath(
                                currentReturnSourceConversation,
                              )
                            ],
                            "prioritize",
                          ).tone
                        }`}
                      >
                        {
                          resolveConversationActionStatus(
                            currentReturnSourceConversation,
                            deliveredTargetByPath[
                              buildConversationPath(
                                currentReturnSourceConversation,
                              )
                            ],
                            "prioritize",
                          ).label
                        }
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {resolveConversationActionDescription(
                        currentReturnSourceConversation,
                        deliveredTargetByPath[
                          buildConversationPath(currentReturnSourceConversation)
                        ],
                        "source",
                      )}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {resolveConversationMetaSummary(
                        currentReturnSourceConversation,
                        deliveredTargetByPath[
                          buildConversationPath(currentReturnSourceConversation)
                        ],
                        deliveryBatchRankById,
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.07)] px-3 py-1 text-xs text-[color:var(--brand-primary)]">
                    {resolveConversationActionLabel(
                      currentReturnSourceConversation,
                      deliveredTargetByPath[
                        buildConversationPath(currentReturnSourceConversation)
                      ],
                      "prioritize",
                    )}
                  </span>
                </button>
              </div>
            ) : null}
            {relatedReturnConversations.length ? (
              <div
                className={
                  isDesktopLayout
                    ? "space-y-2"
                    : "border-t border-[color:var(--border-subtle)]"
                }
              >
                <div className={isDesktopLayout ? undefined : "px-4 py-3"}>
                  <div className="text-xs font-medium tracking-[0.14em] text-[color:var(--brand-primary)]">
                    {t(msg`来源会话附近相关会话`)}
                  </div>
                </div>
                <div
                  className={
                    isDesktopLayout
                      ? "space-y-2"
                      : "divide-y divide-[color:var(--border-subtle)]"
                  }
                >
                  {relatedReturnConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => {
                        void sendToConversation(conversation);
                      }}
                      className={
                        isDesktopLayout
                          ? "flex w-full items-center justify-between gap-3 rounded-[18px] border border-black/5 bg-white px-4 py-3 text-left shadow-none transition hover:bg-[color:var(--surface-console)]"
                          : "flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left shadow-none transition active:bg-[color:var(--surface-card-hover)]"
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className={`rounded-full px-2.5 py-1 font-medium ${
                              resolveConversationActionStatus(
                                conversation,
                                deliveredTargetByPath[
                                  buildConversationPath(conversation)
                                ],
                                "prioritize",
                              ).tone
                            }`}
                          >
                            {
                              resolveConversationActionStatus(
                                conversation,
                                deliveredTargetByPath[
                                  buildConversationPath(conversation)
                                ],
                                "prioritize",
                              ).label
                            }
                          </span>
                        </div>
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {conversation.title}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {resolveConversationActionDescription(
                            conversation,
                            deliveredTargetByPath[
                              buildConversationPath(conversation)
                            ],
                            "related",
                          )}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {resolveConversationMetaSummary(
                            conversation,
                            deliveredTargetByPath[
                              buildConversationPath(conversation)
                            ],
                            deliveryBatchRankById,
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.07)] px-3 py-1 text-xs text-[color:var(--brand-primary)]">
                        {resolveConversationActionLabel(
                          conversation,
                          deliveredTargetByPath[
                            buildConversationPath(conversation)
                          ],
                          "prioritize",
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {prioritizedRecentConversations.length ? (
              <div
                className={
                  isDesktopLayout
                    ? "space-y-2"
                    : "divide-y divide-[color:var(--border-subtle)] border-t border-[color:var(--border-subtle)]"
                }
              >
                {prioritizedRecentConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      void sendToConversation(conversation);
                    }}
                    className={
                      isDesktopLayout
                        ? "flex w-full items-center justify-between gap-3 rounded-[18px] border border-black/5 bg-white px-4 py-3 text-left shadow-none transition hover:bg-[color:var(--surface-console)]"
                        : "flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left shadow-none transition active:bg-[color:var(--surface-card-hover)]"
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`rounded-full px-2.5 py-1 font-medium ${
                            resolveConversationActionStatus(
                              conversation,
                              deliveredTargetByPath[
                                buildConversationPath(conversation)
                              ],
                              "best_now",
                            ).tone
                          }`}
                        >
                          {
                            resolveConversationActionStatus(
                              conversation,
                              deliveredTargetByPath[
                                buildConversationPath(conversation)
                              ],
                              "best_now",
                            ).label
                          }
                        </span>
                      </div>
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {conversation.title}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {resolveConversationActionDescription(
                          conversation,
                          deliveredTargetByPath[
                            buildConversationPath(conversation)
                          ],
                          "recent",
                        )}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {resolveConversationMetaSummary(
                          conversation,
                          deliveredTargetByPath[
                            buildConversationPath(conversation)
                          ],
                          deliveryBatchRankById,
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.07)] px-3 py-1 text-xs text-[color:var(--brand-primary)]">
                      {resolveConversationActionLabel(
                        conversation,
                        deliveredTargetByPath[
                          buildConversationPath(conversation)
                        ],
                        "best_now",
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </section>
      ) : null}
    </>
  );

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full bg-[linear-gradient(180deg,#f6f8f7,#eef6f1)] px-5 py-5">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          <div className="flex items-center justify-between rounded-[28px] border border-black/5 bg-white/88 px-5 py-4 shadow-[var(--shadow-section)] backdrop-blur">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--brand-primary)]">
                {t(msg`群邀请`)}
              </div>
              <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                {t(msg`群二维码`)}
              </div>
              {currentReturnSourceConversation ? (
                <div className="mt-2 text-xs text-[color:var(--text-secondary)]">
                  {t(msg`当前来自 ${currentReturnSourceConversation.title}`)}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {currentReturnSourceConversation ? (
                <Button
                  variant="ghost"
                  onClick={guardRowNavigation(() => {
                    void navigate({
                      to: buildConversationOpenPath(
                        currentReturnSourceConversation,
                      ),
                    });
                  })}
                  className="rounded-full"
                >
                  {t(msg`回到来源会话`)}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => {
                  void navigate({
                    to: safeReturnPath ?? "/tabs/chat",
                    ...((
                      safeReturnPath
                        ? safeReturnHash
                        : desktopDetailsFallbackHash
                    )
                      ? {
                          hash:
                            (safeReturnPath
                              ? safeReturnHash
                              : desktopDetailsFallbackHash) || undefined,
                        }
                      : {}),
                  });
                }}
              >
                {t(msg`返回群聊信息`)}
              </Button>
            </div>
          </div>
          {content}
        </div>
      </AppPage>
    );
  }

  return (
    <ChatDetailsShell
      title={t(msg`群二维码`)}
      subtitle={groupQuery.data?.name ?? t(msg`群聊邀请`)}
      onBack={() => {
        // 走查 R1：原版直接 navigate push 新 history 项，用户 [details → qr →
        // 点返回] 后浏览器后退会落回 qr 死循环。和 background 页同口径用
        // navigateBackOrFallback。
        navigateBackOrFallback(
          () => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
              ...(detailsRouteHash ? { hash: detailsRouteHash } : {}),
            });
          },
          `/group/${groupId}/details`,
        );
      }}
    >
      <div className="space-y-3 px-3">{content}</div>
    </ChatDetailsShell>
  );
}

function MobileGroupInviteStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[18rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}

function ActionCard({
  compact = false,
  description,
  icon,
  onClick,
  title,
}: {
  compact?: boolean;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        compact
          ? "bg-white px-4 py-4 text-left shadow-none transition hover:bg-[color:var(--surface-card-hover)]"
          : "rounded-[22px] border border-black/5 bg-white px-4 py-4 text-left shadow-none transition hover:bg-[color:var(--surface-console)]"
      }
    >
      <div
        className={`flex items-center justify-center bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)] ${
          compact ? "h-8 w-8 rounded-[12px]" : "h-9 w-9 rounded-full"
        }`}
      >
        {icon}
      </div>
      <div
        className={`font-medium text-[color:var(--text-primary)] ${
          compact ? "mt-2 text-[13px]" : "mt-3 text-sm"
        }`}
      >
        {title}
      </div>
      <div
        className={`text-[color:var(--text-secondary)] ${
          compact ? "mt-1 text-[11px] leading-5" : "mt-1 text-xs leading-6"
        }`}
      >
        {description}
      </div>
    </button>
  );
}

function buildConversationPath(conversation: ConversationListItem) {
  return getConversationThreadPath(conversation);
}

function resolveDeliveredBatchLabel(
  record: GroupInviteDeliveryTarget | undefined,
  batchRankById: Record<string, number>,
) {
  if (!record) {
    return t(msg`新会话`);
  }

  const rank = batchRankById[record.batchId];
  if (rank === 0) {
    return t(msg`本轮批次`);
  }

  if (typeof rank === "number") {
    return t(msg`更早批次 ${rank + 1}`);
  }

  return t(msg`更早批次`);
}

function resolvePendingReturnMetaSummary(
  conversation: ConversationListItem,
  target: GroupInviteDeliveryTarget,
  deliveryBatchRankById: Record<string, number>,
) {
  return [
    getConversationThreadLabel(conversation),
    resolveDeliveredBatchLabel(target, deliveryBatchRankById),
    t(msg`待回流 ${formatPendingReturnDuration(target.deliveredAt)}`),
    t(msg`上次发送于 ${formatConversationTimestamp(target.deliveredAt)}`),
    t(
      msg`最近活跃 ${formatConversationTimestamp(conversation.lastActivityAt)}`,
    ),
  ].join(" · ");
}

function resolvePendingReturnCardMetaSummary(
  conversation: ConversationListItem,
  deliveredAt: string,
) {
  return [
    resolvePendingReturnPrimaryReason(conversation, deliveredAt).label,
    isPendingReturnCoolingDown(deliveredAt)
      ? t(msg`冷却剩余 ${formatPendingReturnCooldownRemaining(deliveredAt)}`)
      : t(msg`待回流 ${formatPendingReturnDuration(deliveredAt)}`),
    t(
      msg`最近活跃 ${formatConversationTimestamp(conversation.lastActivityAt)}`,
    ),
  ].join(" · ");
}

function formatPendingReturnDuration(deliveredAt: string) {
  const elapsedMinutes = resolvePendingReturnElapsedMinutes(deliveredAt);
  if (elapsedMinutes === null) {
    return t(msg`一段时间`);
  }

  if (elapsedMinutes < 1) {
    return t(msg`不到 1 分钟`);
  }

  if (elapsedMinutes < 60) {
    return t(msg`${elapsedMinutes} 分钟`);
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const remainderMinutes = elapsedMinutes % 60;

  if (!remainderMinutes) {
    return t(msg`${elapsedHours} 小时`);
  }

  return t(msg`${elapsedHours} 小时 ${remainderMinutes} 分钟`);
}

function resolvePendingReturnPrimaryReason(
  conversation: ConversationListItem,
  deliveredAt: string,
): PendingReturnReason {
  const elapsedMinutes = resolvePendingReturnElapsedMinutes(deliveredAt);
  const recentActivityMinutes = resolveConversationRecentActivityMinutes(
    conversation.lastActivityAt,
  );
  const isGroupConversation = isPersistedGroupConversation(conversation);

  if (isPendingReturnCoolingDown(deliveredAt)) {
    return {
      code: "wait_for_reopen",
      label: t(msg`先等回流`),
      tone: "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-muted)]",
    };
  }

  if (
    elapsedMinutes !== null &&
    elapsedMinutes >= 60 &&
    recentActivityMinutes !== null &&
    recentActivityMinutes <= 6 * 60
  ) {
    return {
      code: "stale_and_active",
      label: t(msg`超时且活跃`),
      tone: "bg-[rgba(220,38,38,0.12)] text-[#b91c1c]",
    };
  }

  if (elapsedMinutes !== null && elapsedMinutes >= 60) {
    return {
      code: "stale",
      label: t(msg`长时间未回流`),
      tone: "bg-[rgba(220,38,38,0.12)] text-[#b91c1c]",
    };
  }

  if (recentActivityMinutes !== null && recentActivityMinutes <= 6 * 60) {
    return {
      code: isGroupConversation ? "active_group_reach" : "active_direct_reach",
      label: isGroupConversation ? t(msg`活跃群聊扩散`) : t(msg`活跃单聊触达`),
      tone: "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]",
    };
  }

  return {
    code: isGroupConversation
      ? "group_reach_priority"
      : "direct_targeted_resend",
    label: isGroupConversation ? t(msg`群聊扩散优先`) : t(msg`单聊定向补发`),
    tone: "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-muted)]",
  };
}

function resolvePendingReturnRecommendationSummary(
  conversation: ConversationListItem,
  deliveredAt: string,
) {
  const primaryReason = resolvePendingReturnPrimaryReason(
    conversation,
    deliveredAt,
  );

  switch (primaryReason.code) {
    case "wait_for_reopen":
      return t(msg`刚补发过，先等回流。`);
    case "stale_and_active":
      return t(msg`拖得久且还活跃，先追这条。`);
    case "stale":
      return t(msg`长时间未回流，先补这条。`);
    case "active_group_reach":
      return t(msg`群聊还活跃，可以继续扩散。`);
    case "active_direct_reach":
      return t(msg`单聊还活跃，可以趁热补发。`);
    case "group_reach_priority":
      return t(msg`群聊触达更广，可以放扩散位。`);
    default:
      return t(msg`这条更适合做定向补发。`);
  }
}

function resolvePendingReturnFallbackReason(
  topConversation: ConversationListItem,
  topDeliveredAt: string,
  fallbackConversation: ConversationListItem,
  fallbackDeliveredAt: string,
) {
  if (isPendingReturnCoolingDown(fallbackDeliveredAt)) {
    return t(msg`这条备选刚补发过，还在冷却，所以暂时排在主推荐后面。`);
  }

  const topActivityMinutes = resolveConversationRecentActivityMinutes(
    topConversation.lastActivityAt,
  );
  const fallbackActivityMinutes = resolveConversationRecentActivityMinutes(
    fallbackConversation.lastActivityAt,
  );
  if (
    topActivityMinutes !== null &&
    fallbackActivityMinutes !== null &&
    topActivityMinutes < fallbackActivityMinutes
  ) {
    return t(msg`主推荐对应的会话更新近，还在更活跃的窗口里，所以优先级更高。`);
  }

  const topElapsedMinutes = resolvePendingReturnElapsedMinutes(topDeliveredAt);
  const fallbackElapsedMinutes =
    resolvePendingReturnElapsedMinutes(fallbackDeliveredAt);
  if (
    topElapsedMinutes !== null &&
    fallbackElapsedMinutes !== null &&
    topElapsedMinutes > fallbackElapsedMinutes
  ) {
    return t(msg`主推荐已经等待回流更久，当前更值得先补这一轮。`);
  }

  if (
    isPersistedGroupConversation(topConversation) &&
    !isPersistedGroupConversation(fallbackConversation)
  ) {
    return t(msg`主推荐是群聊扩散位，当前触达面更大，所以先放在第一位。`);
  }

  return t(msg`这条也值得补发，但综合活跃度和回流时长后仍排在主推荐后面。`);
}

function resolvePendingReturnOutcomeConclusion(
  topPendingReturnConversation: {
    conversation: ConversationListItem;
    target: GroupInviteDeliveryTarget;
  } | null,
  fallbackPendingReturnConversation: {
    conversation: ConversationListItem;
    target: GroupInviteDeliveryTarget;
  } | null,
  fallbackPendingReturnExpectedOutcome: {
    nextReadyCount: number;
    nextCoolingDownCount: number;
    summary: string;
  } | null,
  pendingReturnExpectedOutcome: {
    nextReadyCount: number;
    nextCoolingDownCount: number;
    summary: string;
  } | null,
) {
  if (!pendingReturnExpectedOutcome) {
    return t(msg`当前没有可预测结果。`);
  }

  if (!topPendingReturnConversation) {
    return pendingReturnExpectedOutcome.summary;
  }

  if (
    !fallbackPendingReturnConversation ||
    !fallbackPendingReturnExpectedOutcome
  ) {
    return t(
      msg`先处理 ${topPendingReturnConversation.conversation.title} 就行。`,
    );
  }

  if (
    isPendingReturnCoolingDown(
      fallbackPendingReturnConversation.target.deliveredAt,
    )
  ) {
    return t(
      msg`先走主推荐更合适，${fallbackPendingReturnConversation.conversation.title} 还在冷却里。`,
    );
  }

  return t(
    msg`先走主推荐更合适，先补 ${topPendingReturnConversation.conversation.title} 会先拿掉前排阻塞。`,
  );
}

function resolvePendingReturnActionHint(
  conversation: ConversationListItem,
  deliveredAt: string,
) {
  if (isPendingReturnCoolingDown(deliveredAt)) {
    return t(msg`还在冷却，先等回流再看 ${conversation.title}。`);
  }

  const primaryReason = resolvePendingReturnPrimaryReason(
    conversation,
    deliveredAt,
  );

  switch (primaryReason.code) {
    case "stale_and_active":
      return t(msg`拖得久又还活跃，现在补最值。`);
    case "stale":
      return t(msg`等待已经偏长，现在补更顺。`);
    case "active_group_reach":
    case "active_direct_reach":
      return t(msg`还在活跃窗口里，适合现在补。`);
    default:
      return t(msg`按当前排序先做这条。`);
  }
}

function resolvePendingReturnActionRiskHint(
  conversation: ConversationListItem,
  deliveredAt: string,
) {
  if (isPendingReturnCoolingDown(deliveredAt)) {
    return t(msg`现在追也不会立刻改善结构。`);
  }

  const primaryReason = resolvePendingReturnPrimaryReason(
    conversation,
    deliveredAt,
  );

  switch (primaryReason.code) {
    case "stale_and_active":
      return t(msg`再拖下去，最好的回流口会变钝。`);
    case "stale":
      return t(msg`再后放，这条只会继续积压。`);
    case "active_group_reach":
    case "active_direct_reach":
      return t(msg`错过活跃窗口，再补会更难接回流。`);
    default:
      return t(msg`先不动 ${conversation.title}，主路径还会堵在前面。`);
  }
}

function resolvePendingReturnActionStatus(
  conversation: ConversationListItem,
  deliveredAt: string,
): PendingReturnActionStatus {
  if (isPendingReturnCoolingDown(deliveredAt)) {
    return buildPendingReturnActionStatus("not_recommended");
  }

  const primaryReason = resolvePendingReturnPrimaryReason(
    conversation,
    deliveredAt,
  );

  switch (primaryReason.code) {
    case "stale_and_active":
    case "stale":
      return buildPendingReturnActionStatus("best_now");
    case "active_group_reach":
    case "active_direct_reach":
      return buildPendingReturnActionStatus("prioritize");
    default:
      return buildPendingReturnActionStatus("can_wait");
  }
}

function resolvePendingReturnActionLabel(
  conversation: ConversationListItem,
  deliveredAt: string,
) {
  const status = resolvePendingReturnActionStatus(conversation, deliveredAt);
  return resolvePendingReturnActionLabelByCode(status.code);
}

function buildPendingReturnActionStatus(
  code: PendingReturnActionStatusCode,
): PendingReturnActionStatus {
  switch (code) {
    case "not_recommended":
      return {
        code,
        label: t(msg`暂不建议`),
        tone: "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-muted)]",
      };
    case "best_now":
      return {
        code,
        label: t(msg`现在补最值`),
        tone: "bg-[rgba(220,38,38,0.12)] text-[#b91c1c]",
      };
    case "prioritize":
      return {
        code,
        label: t(msg`优先处理`),
        tone: "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]",
      };
    default:
      return {
        code,
        label: t(msg`可以稍放`),
        tone: "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]",
      };
  }
}

function resolvePendingReturnActionLabelByCode(
  code: PendingReturnActionStatusCode,
) {
  switch (code) {
    case "best_now":
      return t(msg`现在就补`);
    case "prioritize":
      return t(msg`优先处理`);
    case "can_wait":
      return t(msg`稍后再补`);
    default:
      return t(msg`暂不建议`);
  }
}

function resolveConversationActionStatus(
  conversation: ConversationListItem,
  deliveredTarget: GroupInviteDeliveryTarget | undefined,
  fallbackStatus: PendingReturnActionStatusCode,
): PendingReturnActionStatus {
  if (!deliveredTarget) {
    return buildPendingReturnActionStatus(fallbackStatus);
  }

  return resolvePendingReturnActionStatus(
    conversation,
    deliveredTarget.deliveredAt,
  );
}

function resolveConversationActionLabel(
  conversation: ConversationListItem,
  deliveredTarget: GroupInviteDeliveryTarget | undefined,
  fallbackStatus: PendingReturnActionStatusCode,
) {
  if (!deliveredTarget) {
    return resolvePendingReturnActionLabelByCode(fallbackStatus);
  }

  return resolvePendingReturnActionLabel(
    conversation,
    deliveredTarget.deliveredAt,
  );
}

function resolveConversationActionDescription(
  conversation: ConversationListItem,
  deliveredTarget: GroupInviteDeliveryTarget | undefined,
  context: ConversationActionContext,
) {
  const recentActivityLabel = formatConversationTimestamp(
    conversation.lastActivityAt,
  );
  const conversationKind = isPersistedGroupConversation(conversation)
    ? context === "related"
      ? t(msg`同类群聊`)
      : t(msg`群聊`)
    : context === "related"
      ? t(msg`同类单聊`)
      : t(msg`单聊`);

  if (!deliveredTarget) {
    if (context === "source") {
      return t(msg`这条就是刚回流的来源会话，可以直接接着补。`);
    }

    return t(
      msg`${conversationKind} · 最近活跃 ${recentActivityLabel} · 还没发过这一轮邀请。`,
    );
  }

  const actionStatus = resolveConversationActionStatus(
    conversation,
    deliveredTarget,
    "prioritize",
  );

  if (actionStatus.code === "not_recommended") {
    return t(
      msg`${conversationKind} · 最近活跃 ${recentActivityLabel} · 刚补发过，先等一轮回流。`,
    );
  }

  if (actionStatus.code === "can_wait") {
    return t(
      msg`${conversationKind} · 最近活跃 ${recentActivityLabel} · 已经触达过，可放后手。`,
    );
  }

  return t(
    msg`${conversationKind} · 最近活跃 ${recentActivityLabel} · 这一轮可以继续跟进。`,
  );
}

function resolveConversationMetaSummary(
  conversation: ConversationListItem,
  deliveredTarget: GroupInviteDeliveryTarget | undefined,
  deliveryBatchRankById: Record<string, number>,
) {
  const parts = [
    resolveDeliveredBatchLabel(deliveredTarget, deliveryBatchRankById),
  ];

  if (deliveredTarget) {
    parts.push(
      t(
        msg`上次发送于 ${formatConversationTimestamp(deliveredTarget.deliveredAt)}`,
      ),
    );
  }

  parts.push(
    t(
      msg`最近活跃 ${formatConversationTimestamp(conversation.lastActivityAt)}`,
    ),
  );
  return parts.join(" · ");
}

function isPendingReturnCoolingDown(deliveredAt: string) {
  const elapsedMinutes = resolvePendingReturnElapsedMinutes(deliveredAt);
  return elapsedMinutes !== null && elapsedMinutes < 5;
}

function formatPendingReturnCooldownRemaining(deliveredAt: string) {
  const elapsedMinutes = resolvePendingReturnElapsedMinutes(deliveredAt);
  if (elapsedMinutes === null) {
    return t(msg`一段时间`);
  }

  const remainingMinutes = Math.max(5 - elapsedMinutes, 0);
  if (remainingMinutes < 1) {
    return t(msg`不到 1 分钟`);
  }

  return t(msg`${remainingMinutes} 分钟`);
}

function resolvePendingReturnElapsedMinutes(deliveredAt: string) {
  const deliveredAtMs = parseTimestamp(deliveredAt);
  if (!deliveredAtMs) {
    return null;
  }

  return Math.max(Math.floor((Date.now() - deliveredAtMs) / 1000 / 60), 0);
}

function resolveConversationRecentActivityMinutes(lastActivityAt: string) {
  const lastActivityMs = parseTimestamp(lastActivityAt);
  if (!lastActivityMs) {
    return null;
  }

  return Math.max(Math.floor((Date.now() - lastActivityMs) / 1000 / 60), 0);
}

function buildInviteMatrixSvg({
  code,
  footerLabel,
  label,
  subtitle,
}: {
  code: string;
  footerLabel: string;
  label: string;
  subtitle: string;
}) {
  const cells = 25;
  const cellSize = 8;
  const matrixSize = cells * cellSize;
  const width = 360;
  const height = 440;
  const offsetX = (width - matrixSize) / 2;
  const offsetY = 64;
  const seed = hashCode(`${code}:${label}:${subtitle}`);
  const rects: string[] = [];

  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      if (isFinderCell(row, col, cells)) {
        continue;
      }

      const value = bitFromSeed(seed, row, col);
      if (!value) {
        continue;
      }

      rects.push(
        `<rect x="${offsetX + col * cellSize}" y="${offsetY + row * cellSize}" width="${cellSize}" height="${cellSize}" rx="2" fill="#111827" />`,
      );
    }
  }

  const finder = createFinderBlocks(offsetX, offsetY, cellSize, cells);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" rx="28" fill="#fffdf8"/>
  <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="22" fill="#ffffff" stroke="#f2e8dc"/>
  <text x="${width / 2}" y="42" text-anchor="middle" font-size="20" font-family="sans-serif" fill="#111827" font-weight="700">${escapeXml(
    label,
  )}</text>
  <text x="${width / 2}" y="60" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#6b7280">${escapeXml(
    subtitle,
  )}</text>
  <rect x="${offsetX - 12}" y="${offsetY - 12}" width="${matrixSize + 24}" height="${matrixSize + 24}" rx="18" fill="#fff8ee" stroke="#f1e5d2"/>
  ${finder}
  ${rects.join("")}
  <text x="${width / 2}" y="${offsetY + matrixSize + 44}" text-anchor="middle" font-size="12" font-family="monospace" fill="#374151">${escapeXml(
    code,
  )}</text>
  <text x="${width / 2}" y="${offsetY + matrixSize + 66}" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#9ca3af">${escapeXml(
    footerLabel,
  )}</text>
</svg>`.trim();
}

function createFinderBlocks(
  offsetX: number,
  offsetY: number,
  cellSize: number,
  cells: number,
) {
  return [
    createFinder(offsetX, offsetY, cellSize, 0, 0),
    createFinder(offsetX, offsetY, cellSize, cells - 7, 0),
    createFinder(offsetX, offsetY, cellSize, 0, cells - 7),
  ].join("");
}

function createFinder(
  offsetX: number,
  offsetY: number,
  cellSize: number,
  col: number,
  row: number,
) {
  const x = offsetX + col * cellSize;
  const y = offsetY + row * cellSize;
  const outer = cellSize * 7;
  const inner = cellSize * 5;
  const core = cellSize * 3;

  return `
    <rect x="${x}" y="${y}" width="${outer}" height="${outer}" rx="8" fill="#111827"/>
    <rect x="${x + cellSize}" y="${y + cellSize}" width="${inner}" height="${inner}" rx="6" fill="#fffdf8"/>
    <rect x="${x + cellSize * 2}" y="${y + cellSize * 2}" width="${core}" height="${core}" rx="4" fill="#111827"/>
  `;
}

function isFinderCell(row: number, col: number, cells: number) {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= cells - 7;
  const inBottomLeft = row >= cells - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

function bitFromSeed(seed: number, row: number, col: number) {
  const mixed =
    ((seed ^ (row * 374761393)) + col * 668265263 + row * col * 31) >>> 0;
  return ((mixed ^ (mixed >>> 13) ^ (mixed >>> 21)) & 1) === 1;
}

function hashCode(input: string) {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function escapeXml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
