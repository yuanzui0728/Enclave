import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { getGroup, getGroupMembers, sendGroupMessage } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import {
  ArrowLeft,
  Camera,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  VideoOff,
  Volume2,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { GroupAvatarChip } from "../../components/group-avatar-chip";
import { InlineNoticeActionButton } from "../../components/inline-notice-action-button";
import { formatDetailedMessageTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useDesktopLayout } from "../shell/use-desktop-layout";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
} from "../desktop/chat/desktop-chat-route-state";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "./mobile-group-route-state";
import {
  buildGroupCallInviteMessage,
  buildGroupCallSummaryLines,
  formatGroupCallStatusLabel,
} from "./group-call-message";
import { parseMobileGroupCallRouteHash } from "./mobile-group-call-route-state";
import { buildChatCallReturnSearch } from "./chat-compose-shortcut-route";

type MobileGroupCallScreenProps = {
  mode: "voice" | "video";
};

export function MobileGroupCallScreen({ mode }: MobileGroupCallScreenProps) {
  const { groupId } = useParams({
    strict: false,
  }) as {
    groupId?: string;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const baseUrl = runtimeConfig.apiBaseUrl;
  const resolvedGroupId = groupId ?? "";
  const routeState = useMemo(() => parseMobileGroupCallRouteHash(hash), [hash]);
  const fallbackGroupRouteState = useMemo(
    () => parseMobileGroupRouteState(hash),
    [hash],
  );
  const effectiveSource = routeState?.source ?? "mobile";
  const sourceLabel = effectiveSource === "desktop" ? "桌面端" : "手机端";
  const desktopThreadPath = useMemo(
    () =>
      buildDesktopChatThreadPath({
        conversationId: resolvedGroupId,
      }),
    [resolvedGroupId],
  );
  const desktopDetailsHash = useMemo(
    () =>
      buildDesktopChatRouteHash({
        conversationId: resolvedGroupId,
        panel: "details",
      }),
    [resolvedGroupId],
  );
  const groupRouteHash = useMemo(
    () =>
      buildMobileGroupRouteHash({
        highlightedMessageId:
          routeState?.highlightedMessageId ??
          fallbackGroupRouteState.highlightedMessageId,
        returnPath:
          routeState?.returnPath ?? fallbackGroupRouteState.returnPath,
        returnHash:
          routeState?.returnHash ?? fallbackGroupRouteState.returnHash,
      }),
    [
      fallbackGroupRouteState.highlightedMessageId,
      fallbackGroupRouteState.returnHash,
      fallbackGroupRouteState.returnPath,
      routeState,
    ],
  );
  const resumeCounts = useMemo(() => {
    if (
      routeState === null ||
      routeState.activeCount === null ||
      routeState.totalCount === null
    ) {
      return null;
    }

    return {
      activeCount: routeState.activeCount,
      totalCount: routeState.totalCount,
    };
  }, [routeState]);
  const hasResumeCounts = resumeCounts !== null;
  const [muted, setMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(mode === "video");
  const [callTipsDismissed, setCallTipsDismissed] = useState(false);
  const [leavingScreen, setLeavingScreen] = useState(false);
  const [joinedMemberIds, setJoinedMemberIds] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [lastPublishedCounts, setLastPublishedCounts] = useState<{
    activeCount: number;
    totalCount: number;
  } | null>(null);
  const panelOpenedReportedRef = useRef(false);
  const initializedSessionKeyRef = useRef<string | null>(null);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, resolvedGroupId],
    queryFn: () => getGroup(resolvedGroupId, baseUrl),
    enabled: Boolean(resolvedGroupId),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, resolvedGroupId],
    queryFn: () => getGroupMembers(resolvedGroupId, baseUrl),
    enabled: Boolean(resolvedGroupId),
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const callSessionKey = useMemo(
    () =>
      JSON.stringify({
        activeCount: routeState?.activeCount ?? null,
        groupId: resolvedGroupId,
        mode,
        recordedAt:
          routeState?.recordedAt ?? routeState?.snapshotRecordedAt ?? null,
        source: routeState?.source ?? "mobile",
        totalCount: routeState?.totalCount ?? null,
      }),
    [
      mode,
      resolvedGroupId,
      routeState?.activeCount,
      routeState?.recordedAt,
      routeState?.snapshotRecordedAt,
      routeState?.source,
      routeState?.totalCount,
    ],
  );
  const activeMembers = useMemo(
    () => members.filter((member) => joinedMemberIds.includes(member.memberId)),
    [joinedMemberIds, members],
  );
  const visibleMembers = useMemo(() => members.slice(0, 10), [members]);
  const activeCount = activeMembers.length;
  const totalCount = members.length;
  const waitingCount = Math.max(totalCount - activeCount, 0);
  const groupName = groupQuery.data?.name ?? "群聊";
  const callTitle = mode === "voice" ? "群语音通话" : "群视频通话";
  const statusTitle = formatGroupCallStatusLabel(mode, "ongoing");
  const hasSyncedStatus =
    lastPublishedCounts?.activeCount === activeCount &&
    lastPublishedCounts?.totalCount === totalCount;
  const showWorkspacePrimer = !callTipsDismissed && !hasResumeCounts;
  const showResumeHint = hasResumeCounts && !callTipsDismissed;
  const workspaceSummaryLines = buildGroupCallSummaryLines({
    kind: mode,
    status: "ongoing",
    sourceLabel,
    counts: totalCount
      ? {
          activeCount,
          totalCount,
          waitingCount,
        }
      : null,
  });

  useEffect(() => {
    if (!resolvedGroupId || membersQuery.isLoading) {
      return;
    }

    if (initializedSessionKeyRef.current === callSessionKey) {
      return;
    }

    initializedSessionKeyRef.current = callSessionKey;
    setMuted(false);
    setSpeakerEnabled(true);
    setCameraEnabled(mode === "video");
    setLeavingScreen(false);
    setStartedAt(
      routeState?.recordedAt ??
        routeState?.snapshotRecordedAt ??
        new Date().toISOString(),
    );
    setCallTipsDismissed(hasResumeCounts);
    setLastPublishedCounts(resumeCounts);
    panelOpenedReportedRef.current = hasResumeCounts;
    setJoinedMemberIds(
      buildInitialJoinedMemberIds(members, routeState?.activeCount ?? null),
    );
  }, [
    callSessionKey,
    hasResumeCounts,
    members,
    membersQuery.isLoading,
    mode,
    resolvedGroupId,
    resumeCounts,
    routeState,
  ]);

  useEffect(() => {
    if (!members.length) {
      return;
    }

    const memberIds = new Set(members.map((member) => member.memberId));
    const mandatoryJoinedIds = members
      .filter(
        (member) => member.memberType === "user" || member.role === "owner",
      )
      .map((member) => member.memberId);

    setJoinedMemberIds((current) => {
      const next = current.filter((memberId) => memberIds.has(memberId));
      let changed = next.length !== current.length;

      for (const memberId of mandatoryJoinedIds) {
        if (next.includes(memberId)) {
          continue;
        }

        next.push(memberId);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [members]);

  const invalidateCallQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["app-group-messages", baseUrl, resolvedGroupId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      }),
    ]);
  }, [baseUrl, queryClient, resolvedGroupId]);

  const syncStatusMutation = useMutation({
    mutationFn: (counts: { activeCount: number; totalCount: number }) =>
      sendGroupMessage(
        resolvedGroupId,
        {
          text: buildGroupCallInviteMessage(
            mode,
            groupName,
            counts,
            "ongoing",
            undefined,
            effectiveSource,
          ),
        },
        baseUrl,
      ),
    onSuccess: async (_, counts) => {
      setLastPublishedCounts(counts);
      await invalidateCallQueries();
    },
  });

  const endStatusMutation = useMutation({
    mutationFn: (counts: {
      activeCount: number;
      totalCount: number;
      durationMs: number;
      startedAt: string;
    }) =>
      sendGroupMessage(
        resolvedGroupId,
        {
          text: buildGroupCallInviteMessage(
            mode,
            groupName,
            counts,
            "ended",
            undefined,
            effectiveSource,
            undefined,
            counts.durationMs,
            counts.startedAt,
          ),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setLastPublishedCounts(null);
      await invalidateCallQueries();
    },
  });

  const syncCurrentStatus = useCallback(async () => {
    if (!resolvedGroupId || !groupQuery.data || !totalCount) {
      return;
    }

    await syncStatusMutation.mutateAsync({
      activeCount,
      totalCount,
    });
  }, [
    activeCount,
    groupQuery.data,
    resolvedGroupId,
    syncStatusMutation,
    totalCount,
  ]);

  useEffect(() => {
    if (
      !resolvedGroupId ||
      !groupQuery.data ||
      membersQuery.isLoading ||
      isDesktopLayout ||
      panelOpenedReportedRef.current
    ) {
      return;
    }

    panelOpenedReportedRef.current = true;
    void syncCurrentStatus();
  }, [
    groupQuery.data,
    isDesktopLayout,
    membersQuery.isLoading,
    resolvedGroupId,
    syncCurrentStatus,
  ]);

  useEffect(() => {
    if (
      !panelOpenedReportedRef.current ||
      !resolvedGroupId ||
      !groupQuery.data ||
      !totalCount ||
      syncStatusMutation.isPending ||
      syncStatusMutation.isError ||
      hasSyncedStatus
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void syncCurrentStatus();
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeCount,
    groupQuery.data,
    hasSyncedStatus,
    resolvedGroupId,
    syncCurrentStatus,
    syncStatusMutation.isError,
    syncStatusMutation.isPending,
    totalCount,
  ]);

  const handleBack = () => {
    if (leavingScreen) {
      return;
    }

    setLeavingScreen(true);
    if (isDesktopLayout) {
      void navigate({
        to: desktopThreadPath,
        replace: true,
      });
      return;
    }

    void navigate({
      to: "/group/$groupId",
      params: { groupId: resolvedGroupId },
      ...(groupRouteHash ? { hash: groupRouteHash } : {}),
      replace: true,
    });
  };

  const handleRetryLoad = () => {
    void groupQuery.refetch();
    void membersQuery.refetch();
  };

  const renderBackToGroupAction = () => (
    <InlineNoticeActionButton
      label="返回群聊"
      className="border-current/28 bg-white/12 active:bg-white/16"
      onClick={handleBack}
    />
  );

  const handleEndCall = async () => {
    if (leavingScreen) {
      return;
    }

    setLeavingScreen(true);
    if (!resolvedGroupId || !groupQuery.data || !totalCount) {
      void navigate({
        to: "/group/$groupId",
        params: { groupId: resolvedGroupId },
        ...(groupRouteHash ? { hash: groupRouteHash } : {}),
        replace: true,
      });
      return;
    }

    const durationMs = Math.max(Date.now() - new Date(startedAt).getTime(), 0);
    try {
      await endStatusMutation.mutateAsync({
        activeCount,
        totalCount,
        durationMs,
        startedAt,
      });
      void navigate({
        to: "/group/$groupId",
        params: { groupId: resolvedGroupId },
        search:
          buildChatCallReturnSearch({
            kind: mode,
          }) || undefined,
        ...(groupRouteHash ? { hash: groupRouteHash } : {}),
        replace: true,
      });
    } catch {
      setLeavingScreen(false);
    }
  };

  const toggleJoinedState = (memberId: string) => {
    setCallTipsDismissed(true);
    if (syncStatusMutation.isError) {
      syncStatusMutation.reset();
    }
    setJoinedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((item) => item !== memberId)
        : [...current, memberId],
    );
  };

  const handleRetrySyncStatus = () => {
    if (leavingScreen) {
      return;
    }

    setCallTipsDismissed(true);
    syncStatusMutation.reset();
    void syncCurrentStatus();
  };

  const handleContinueAfterSyncError = () => {
    syncStatusMutation.reset();
  };

  const handleRetryEndCall = () => {
    if (leavingScreen) {
      return;
    }

    endStatusMutation.reset();
    void handleEndCall();
  };

  const handleContinueAfterEndError = () => {
    endStatusMutation.reset();
  };

  if (groupQuery.isLoading || membersQuery.isLoading) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <LoadingBlock label={`正在连接${callTitle}...`} />
        ) : (
          <MobileCallStatusCard
            badge="连接中"
            title={`正在连接${callTitle}`}
            description="稍等一下，正在同步群资料和成员状态。"
            tone="loading"
          />
        )}
      </AppPage>
    );
  }

  if (groupQuery.isError && groupQuery.error instanceof Error) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <ErrorBlock message={groupQuery.error.message} />
        ) : (
          <MobileCallStatusCard
            badge="群聊"
            title="群通话暂时不可用"
            description={groupQuery.error.message}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <MobileCallActionButton
                  onClick={handleRetryLoad}
                  className="min-w-[132px]"
                >
                  重试读取
                </MobileCallActionButton>
                <MobileCallActionButton
                  onClick={handleBack}
                  className="min-w-[132px]"
                >
                  返回群聊
                </MobileCallActionButton>
              </div>
            }
          />
        )}
      </AppPage>
    );
  }

  if (membersQuery.isError && membersQuery.error instanceof Error) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <ErrorBlock message={membersQuery.error.message} />
        ) : (
          <MobileCallStatusCard
            badge="成员"
            title="成员信息暂时不可用"
            description={membersQuery.error.message}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <MobileCallActionButton
                  onClick={handleRetryLoad}
                  className="min-w-[132px]"
                >
                  重试读取
                </MobileCallActionButton>
                <MobileCallActionButton
                  onClick={handleBack}
                  className="min-w-[132px]"
                >
                  返回群聊
                </MobileCallActionButton>
              </div>
            }
          />
        )}
      </AppPage>
    );
  }

  if (!groupQuery.data) {
    return (
      <AppPage
        className={cn(
          "min-h-full space-y-4 px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <>
            <ErrorBlock message="当前群聊不存在，暂时无法发起群通话。" />
            <Button
              variant="secondary"
              onClick={handleBack}
              className={cn(
                isDesktopLayout
                  ? "rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
                  : "rounded-full",
              )}
            >
              返回群聊
            </Button>
          </>
        ) : (
          <MobileCallStatusCard
            badge="群聊"
            title="当前不能发起群通话"
            description="这个群聊暂时不可用，可以先重试读取，或返回群聊后再试。"
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <MobileCallActionButton
                  onClick={handleRetryLoad}
                  className="min-w-[132px]"
                >
                  重试读取
                </MobileCallActionButton>
                <MobileCallActionButton
                  onClick={handleBack}
                  className="min-w-[132px]"
                >
                  返回群聊
                </MobileCallActionButton>
              </div>
            }
          />
        )}
      </AppPage>
    );
  }

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full bg-[#f3f3f3] px-0 py-0">
        <div className="flex min-h-full flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-black/6 bg-[#f7f7f7] px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/6 bg-white text-[color:var(--text-primary)] transition hover:bg-[#efefef]"
                aria-label="返回群聊"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                  {callTitle}
                </div>
                <div className="mt-1 text-[18px] font-medium text-[color:var(--text-primary)]">
                  {groupName}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  桌面端通话入口已收口到聊天工作区顶部工具栏。
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
            >
              返回群聊
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="w-full max-w-[760px] rounded-[18px] border border-black/6 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <div className="rounded-full bg-[rgba(15,23,42,0.05)] px-3 py-1 text-[11px] tracking-[0.12em] text-[color:var(--text-dim)] inline-flex">
                桌面通话工作区
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(7,193,96,0.10)] text-[#1f8f4f]">
                  {mode === "video" ? <Camera size={24} /> : <Mic size={24} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[20px] font-medium text-[color:var(--text-primary)]">
                    桌面端请从聊天页继续发起{mode === "video" ? "群视频" : "群语音"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    当前独立路由主要保留给手机端通话流程。桌面端已经改为在群聊消息页内打开通话工作台，这样成员调度、聊天记录和侧栏信息会保持在同一窗口里。
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                    当前群聊
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {groupName}
                  </div>
                </div>
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                    通话类型
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {mode === "video" ? "群视频通话" : "群语音通话"}
                  </div>
                </div>
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                    成员规模
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {totalCount} 位成员
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <InlineNotice tone="info">
                  回到群聊页后，继续使用顶部通话按钮即可进入桌面群通话控制台。
                </InlineNotice>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleBack}
                  className="rounded-[10px] bg-[#07c160] text-white hover:bg-[#06ad56]"
                >
                  <Users size={16} />
                  返回群聊继续
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigate({
                      to: "/tabs/chat",
                      ...(desktopDetailsHash
                        ? { hash: desktopDetailsHash }
                        : {}),
                    });
                  }}
                  className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
                >
                  查看群聊信息
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="flex min-h-[100dvh] flex-col space-y-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_32%),linear-gradient(180deg,#111827_0%,#0f172a_40%,#020617_100%)] px-0 py-0 text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[rgba(2,6,23,0.72)] px-3 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={leavingScreen}
            className={mobileCallIconButtonClass()}
            aria-label="返回群聊"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-medium">{callTitle}</div>
            <div className="mt-0.5 truncate text-[12px] text-white/60">
              {groupName}
            </div>
          </div>
          <MobileCallMetaChip tone="success">
            {effectiveSource === "desktop" ? "沿用桌面来源" : "手机端发起"}
          </MobileCallMetaChip>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-3.5">
        <section className="rounded-[28px] border border-white/8 bg-[rgba(15,23,42,0.76)] px-4 py-4.5 shadow-[0_24px_60px_rgba(2,6,23,0.34)]">
          <div className="flex items-center gap-4">
            <GroupAvatarChip
              name={groupName}
              members={members.map((member) => member.memberId)}
              size="wechat"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[22px] font-semibold tracking-[0.01em]">
                {groupName}
              </div>
              <div className="mt-1 text-sm text-white/64">{statusTitle}</div>
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2.5">
            <CallMetricCard
              label="当前在线"
              value={`${activeCount} 人`}
              detail="已加入本轮群通话"
            />
            <CallMetricCard
              label="等待加入"
              value={`${waitingCount} 人`}
              detail="可继续同步群状态"
            />
            <CallMetricCard
              label="发起时间"
              value={formatDetailedMessageTimestamp(startedAt)}
              detail="当前为移动群通话工作台"
            />
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2">
            <CallControlButton
              active={!muted}
              disabled={leavingScreen}
              label={muted ? "解除静音" : "静音麦克风"}
              icon={muted ? <Mic size={16} /> : <MicOff size={16} />}
              onClick={() => {
                setCallTipsDismissed(true);
                setMuted((current) => !current);
              }}
            />
            <CallControlButton
              active={speakerEnabled}
              disabled={leavingScreen}
              label={speakerEnabled ? "扬声器已开" : "开启扬声器"}
              icon={<Volume2 size={16} />}
              onClick={() => {
                setCallTipsDismissed(true);
                setSpeakerEnabled((current) => !current);
              }}
            />
            {mode === "video" ? (
              <CallControlButton
                active={cameraEnabled}
                disabled={leavingScreen}
                label={cameraEnabled ? "关闭摄像头" : "打开摄像头"}
                icon={
                  cameraEnabled ? <VideoOff size={16} /> : <Camera size={16} />
                }
                onClick={() => {
                  setCallTipsDismissed(true);
                  setCameraEnabled((current) => !current);
                }}
              />
            ) : null}
          </div>
        </section>

        <div className="mt-3.5 space-y-2.5">
          {showWorkspacePrimer ? (
            <MobileCallNotice tone="info">
              首次进入可先点下方成员席位切换“已加入/待加入”，再点“同步最新状态”把在线人数回写到群聊卡片。
            </MobileCallNotice>
          ) : null}
          {showResumeHint ? (
            <MobileCallNotice tone="info">
              当前沿用了上一端的群通话快照，可继续调整在线成员后再同步到群聊。
            </MobileCallNotice>
          ) : null}
          {workspaceSummaryLines.length ? (
            <MobileCallNotice tone="info">
              <div className="space-y-1">
                {workspaceSummaryLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </MobileCallNotice>
          ) : null}
          {mode === "video" ? (
            <MobileCallNotice tone="info">
              当前群视频页先承载移动工作台状态，本地摄像头开关只影响当前页面提示，不会上传真实画面。
            </MobileCallNotice>
          ) : null}
          {!hasSyncedStatus && !syncStatusMutation.isError ? (
            <MobileCallNotice tone="warning">
              {syncStatusMutation.isPending
                ? "正在把最新在线人数同步到群聊。"
                : "成员状态刚有变化，系统会自动刷新群通话卡片。"}
            </MobileCallNotice>
          ) : null}
          {syncStatusMutation.error instanceof Error ? (
            <MobileCallNotice
              tone="danger"
              className="flex items-center justify-between gap-3"
            >
              <span>{syncStatusMutation.error.message}</span>
              {renderBackToGroupAction()}
            </MobileCallNotice>
          ) : null}
          {syncStatusMutation.error instanceof Error ? (
            <MobileCallNotice tone="info">
              这次群状态没有回写成功。你可以继续调整成员席位，确认后再手动重试同步。
            </MobileCallNotice>
          ) : null}
          {syncStatusMutation.error instanceof Error ? (
            <div className="flex flex-wrap gap-2">
              <MobileCallActionButton
                onClick={handleRetrySyncStatus}
                disabled={leavingScreen}
              >
                <Users size={16} />
                重试同步状态
              </MobileCallActionButton>
              <MobileCallActionButton
                onClick={handleContinueAfterSyncError}
                disabled={leavingScreen}
              >
                <Mic size={16} />
                继续调整成员
              </MobileCallActionButton>
            </div>
          ) : null}
          {endStatusMutation.error instanceof Error ? (
            <MobileCallNotice
              tone="danger"
              className="flex items-center justify-between gap-3"
            >
              <span>{endStatusMutation.error.message}</span>
              {renderBackToGroupAction()}
            </MobileCallNotice>
          ) : null}
          {endStatusMutation.error instanceof Error ? (
            <MobileCallNotice tone="info">
              结束群通话失败了，但当前工作台还在。你可以重试结束，或者先继续保留这一轮状态。
            </MobileCallNotice>
          ) : null}
          {endStatusMutation.error instanceof Error ? (
            <div className="flex flex-wrap gap-2">
              <MobileCallActionButton
                onClick={handleRetryEndCall}
                disabled={leavingScreen}
              >
                <PhoneOff size={16} />
                重试结束通话
              </MobileCallActionButton>
              <MobileCallActionButton
                onClick={handleContinueAfterEndError}
                disabled={leavingScreen}
              >
                <Users size={16} />
                继续保留当前状态
              </MobileCallActionButton>
            </div>
          ) : null}
          {leavingScreen ? (
            <MobileCallNotice tone="info">
              正在结束当前群通话并返回群聊，请稍候。
            </MobileCallNotice>
          ) : null}
        </div>

        <section className="mt-3.5 min-h-0 flex-1 rounded-[28px] border border-white/8 bg-[rgba(15,23,42,0.76)] px-4 py-4 shadow-[0_24px_60px_rgba(2,6,23,0.34)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">成员席位</div>
              <div className="mt-1 text-[12px] leading-5 text-white/58">
                点击角色成员可切换为已加入或待加入，快速同步这一轮群通话状态。
              </div>
            </div>
            <MobileCallMetaChip>
              {activeCount}/{totalCount} 已加入
            </MobileCallMetaChip>
          </div>

          <div className="mt-3.5 grid gap-2.5">
            {visibleMembers.map((member) => {
              const joined = joinedMemberIds.includes(member.memberId);
              const roleLabel =
                member.role === "owner"
                  ? "群主"
                  : member.role === "admin"
                    ? "管理员"
                    : "群成员";

              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleJoinedState(member.memberId)}
                  disabled={leavingScreen || member.memberType === "user"}
                  className={cn(
                    "rounded-[18px] border px-3.5 py-2.5 text-left transition",
                    joined
                      ? "border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.10)]"
                      : "border-white/12 bg-white/6",
                    member.memberType === "user"
                      ? "cursor-default"
                      : "active:bg-white/12",
                    leavingScreen ? "opacity-60" : null,
                  )}
                >
                  <div className="flex items-center gap-3">
                    <AvatarChip
                      name={member.memberName ?? member.memberId}
                      src={member.memberAvatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-[13px] font-medium text-white">
                          {member.memberName ?? member.memberId}
                        </div>
                        <MobileCallMetaChip className="px-2 py-0.5 text-[10px] text-white/64">
                          {roleLabel}
                        </MobileCallMetaChip>
                      </div>
                      <div className="mt-0.5 text-[11px] leading-[18px] text-white/52">
                        {member.memberType === "user"
                          ? "世界主人始终保留在当前群通话工作台"
                          : joined
                            ? "当前已加入本轮群通话"
                            : "点击后可加入本轮群通话"}
                      </div>
                    </div>
                    <MobileCallMetaChip
                      tone={joined ? "success" : "default"}
                      className={cn(
                        "shrink-0 px-2.5 py-1 text-[10px] font-medium",
                        joined ? null : "text-white/58",
                      )}
                    >
                      {joined ? "已加入" : "待加入"}
                    </MobileCallMetaChip>
                  </div>
                </button>
              );
            })}
          </div>

          {members.length > visibleMembers.length ? (
            <div className="mt-3 text-center text-[12px] text-white/50">
              其余 {members.length - visibleMembers.length} 位成员先收口到聊天详情页管理。
            </div>
          ) : null}
        </section>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <MobileCallActionButton
            onClick={() => {
              setCallTipsDismissed(true);
              syncStatusMutation.reset();
              void syncCurrentStatus();
            }}
            disabled={syncStatusMutation.isPending || !totalCount || leavingScreen}
            className="h-12 w-full min-w-0"
          >
            <Users size={16} />
            {syncStatusMutation.isPending
              ? "同步中..."
              : hasSyncedStatus
                ? "已同步群状态"
                : "同步最新状态"}
          </MobileCallActionButton>
          <MobileCallActionButton
            tone="danger"
            onClick={() => {
              void handleEndCall();
            }}
            disabled={endStatusMutation.isPending || leavingScreen}
            className="h-12 w-full min-w-0"
          >
            <PhoneOff size={16} />
            {leavingScreen || endStatusMutation.isPending
              ? "结束中..."
              : "结束通话"}
          </MobileCallActionButton>
        </div>
      </div>
    </AppPage>
  );
}

function buildInitialJoinedMemberIds(
  members: Array<{
    memberId: string;
    memberType: string;
    role: string;
  }>,
  activeCount?: number | null,
) {
  const joinedMembers = members
    .filter(
      (member) => member.memberType === "user" || member.role === "owner",
    )
    .map((member) => member.memberId);
  const normalizedTargetCount =
    activeCount === null || activeCount === undefined
      ? Math.max(joinedMembers.length, Math.min(members.length, 3))
      : Math.max(joinedMembers.length, Math.min(activeCount, members.length));

  for (const member of members) {
    if (joinedMembers.includes(member.memberId)) {
      continue;
    }

    if (joinedMembers.length >= normalizedTargetCount) {
      break;
    }

    joinedMembers.push(member.memberId);
  }

  return Array.from(new Set(joinedMembers));
}

function MobileCallStatusCard({
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
        "mx-auto flex max-w-[26rem] flex-col items-center rounded-[28px] border px-5 py-6 text-center shadow-[0_24px_64px_rgba(2,6,23,0.28)]",
        tone === "danger"
          ? "border-[#f87171]/24 bg-[linear-gradient(180deg,rgba(127,29,29,0.34),rgba(69,10,10,0.3))] text-white"
          : "border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.88))] text-white",
      )}
    >
      <div
        className={cn(
          "inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.12em]",
          tone === "danger"
            ? "bg-[#ef4444]/14 text-[#fecaca]"
            : "bg-[#34d399]/12 text-[#bbf7d0]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/24" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/36 [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#86efac] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-3 text-[18px] font-medium leading-7">{title}</div>
      <p className="mt-2 max-w-[18rem] text-[13px] leading-6 text-white/68">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

function MobileCallNotice({
  tone = "info",
  className,
  ...props
}: ComponentProps<typeof InlineNotice>) {
  return (
    <InlineNotice
      tone={tone}
      className={cn(
        "rounded-[20px] px-4 py-3 text-[12px] leading-6 shadow-none",
        tone === "warning"
          ? "border-[#f59e0b]/24 bg-[#f59e0b]/10 text-[#fde68a]"
          : tone === "danger"
            ? "border-[#f87171]/24 bg-[#ef4444]/10 text-[#fecaca]"
            : tone === "success"
              ? "border-[#34d399]/24 bg-[#34d399]/10 text-[#d1fae5]"
              : "border-white/12 bg-white/8 text-white/74",
        className,
      )}
      {...props}
    />
  );
}

function MobileCallMetaChip({
  tone = "default",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "default" | "success" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px]",
        tone === "success"
          ? "border-[#34d399]/24 bg-[#34d399]/14 text-[#bbf7d0]"
          : "border-white/10 bg-white/8 text-white/72",
        className,
      )}
      {...props}
    />
  );
}

function MobileCallActionButton({
  tone = "default",
  className,
  ...props
}: ComponentProps<"button"> & { tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 min-w-[148px] items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition active:translate-y-[0.5px] disabled:opacity-45",
        tone === "danger"
          ? "border-[#fca5a5]/26 bg-[#ef4444]/14 text-[#fecaca] active:bg-[#ef4444]/20"
          : "border-white/12 bg-white/10 text-white active:bg-white/14",
        className,
      )}
      {...props}
    />
  );
}

function mobileCallIconButtonClass() {
  return "flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/8 text-white/82 transition active:bg-white/12 disabled:opacity-55";
}

function CallMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/12 bg-white/6 px-3 py-3">
      <div className="text-[11px] tracking-[0.12em] text-white/45">{label}</div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-white/54">{detail}</div>
    </div>
  );
}

function CallControlButton({
  active,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-4.5 text-[13px] font-medium transition active:translate-y-[0.5px] disabled:opacity-55",
        active
          ? "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.14)] text-[#bbf7d0]"
          : "border-white/10 bg-white/8 text-white/74 active:bg-white/12",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
