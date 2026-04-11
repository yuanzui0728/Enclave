import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { formatDetailedMessageTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useDesktopLayout } from "../shell/use-desktop-layout";
import { buildGroupCallInviteMessage } from "./group-call-message";
import { parseMobileGroupCallRouteHash } from "./mobile-group-call-route-state";

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
  const effectiveSource = routeState?.source ?? "mobile";
  const sourceLabel = effectiveSource === "desktop" ? "桌面端" : "手机端";
  const hasResumeCounts =
    routeState !== null &&
    routeState.activeCount !== null &&
    routeState.totalCount !== null;
  const resumeCounts =
    routeState !== null &&
    routeState.activeCount !== null &&
    routeState.totalCount !== null
    ? {
        activeCount: routeState.activeCount,
        totalCount: routeState.totalCount,
      }
    : null;
  const [muted, setMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(mode === "video");
  const [joinedMemberIds, setJoinedMemberIds] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [lastPublishedCounts, setLastPublishedCounts] = useState<{
    activeCount: number;
    totalCount: number;
  } | null>(null);
  const panelOpenedReportedRef = useRef(false);

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

  const members = membersQuery.data ?? [];
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
  const statusTitle = mode === "voice" ? "语音进行中" : "画面进行中";
  const hasSyncedStatus =
    lastPublishedCounts?.activeCount === activeCount &&
    lastPublishedCounts?.totalCount === totalCount;

  useEffect(() => {
    setMuted(false);
    setSpeakerEnabled(true);
    setCameraEnabled(mode === "video");
    setStartedAt(
      routeState?.recordedAt ??
        routeState?.snapshotRecordedAt ??
        new Date().toISOString(),
    );
    setLastPublishedCounts(resumeCounts);
    panelOpenedReportedRef.current = hasResumeCounts;
    setJoinedMemberIds(
      buildInitialJoinedMemberIds(members, routeState?.activeCount ?? null),
    );
  }, [groupId, hasResumeCounts, members, mode, resumeCounts, routeState]);

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
    mutationFn: (counts: { activeCount: number; totalCount: number }) =>
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
    syncStatusMutation.isPending,
    totalCount,
  ]);

  const handleBack = () => {
    void navigate({
      to: "/group/$groupId",
      params: { groupId: resolvedGroupId },
    });
  };

  const handleEndCall = async () => {
    if (!resolvedGroupId || !groupQuery.data || !totalCount) {
      handleBack();
      return;
    }

    await endStatusMutation.mutateAsync({
      activeCount,
      totalCount,
    });
    handleBack();
  };

  const toggleJoinedState = (memberId: string) => {
    setJoinedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((item) => item !== memberId)
        : [...current, memberId],
    );
  };

  if (groupQuery.isLoading || membersQuery.isLoading) {
    return (
      <AppPage className="min-h-full bg-[#111827] px-4 py-6 text-white">
        <LoadingBlock label={`正在连接${callTitle}...`} />
      </AppPage>
    );
  }

  if (groupQuery.isError && groupQuery.error instanceof Error) {
    return (
      <AppPage className="min-h-full bg-[#111827] px-4 py-6 text-white">
        <ErrorBlock message={groupQuery.error.message} />
      </AppPage>
    );
  }

  if (membersQuery.isError && membersQuery.error instanceof Error) {
    return (
      <AppPage className="min-h-full bg-[#111827] px-4 py-6 text-white">
        <ErrorBlock message={membersQuery.error.message} />
      </AppPage>
    );
  }

  if (!groupQuery.data) {
    return (
      <AppPage className="min-h-full space-y-4 bg-[#111827] px-4 py-6 text-white">
        <ErrorBlock message="当前群聊不存在，暂时无法发起群通话。" />
        <Button variant="secondary" onClick={handleBack} className="rounded-full">
          返回群聊
        </Button>
      </AppPage>
    );
  }

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full space-y-4 bg-[#111827] px-4 py-6 text-white">
        <InlineNotice tone="info">
          当前页面只面向 Web 手机版，桌面端请回到群聊页顶部发起对应群通话。
        </InlineNotice>
        <Button variant="secondary" onClick={handleBack} className="rounded-full">
          返回群聊
        </Button>
      </AppPage>
    );
  }

  return (
    <AppPage className="min-h-full space-y-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_32%),linear-gradient(180deg,#111827_0%,#0f172a_40%,#020617_100%)] px-0 py-0 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(2,6,23,0.72)] px-3 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition active:bg-white/16"
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
          <div className="rounded-full border border-[#34d399]/22 bg-[#34d399]/10 px-3 py-1 text-[11px] text-[#bbf7d0]">
            {effectiveSource === "desktop" ? "沿用桌面来源" : "手机端发起"}
        </div>
      </div>
      </header>

      <div className="flex min-h-[calc(100dvh-65px)] flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-4">
        <section className="rounded-[28px] border border-white/10 bg-[rgba(15,23,42,0.76)] px-4 py-5 shadow-[0_24px_60px_rgba(2,6,23,0.34)]">
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

          <div className="mt-4 grid grid-cols-3 gap-3">
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

          <div className="mt-4 flex flex-wrap gap-2.5">
            <CallControlButton
              active={!muted}
              label={muted ? "解除静音" : "静音麦克风"}
              icon={muted ? <Mic size={16} /> : <MicOff size={16} />}
              onClick={() => setMuted((current) => !current)}
            />
            <CallControlButton
              active={speakerEnabled}
              label={speakerEnabled ? "扬声器已开" : "开启扬声器"}
              icon={<Volume2 size={16} />}
              onClick={() => setSpeakerEnabled((current) => !current)}
            />
            {mode === "video" ? (
              <CallControlButton
                active={cameraEnabled}
                label={cameraEnabled ? "关闭摄像头" : "打开摄像头"}
                icon={
                  cameraEnabled ? <VideoOff size={16} /> : <Camera size={16} />
                }
                onClick={() => setCameraEnabled((current) => !current)}
              />
            ) : null}
          </div>
        </section>

        <div className="mt-4 space-y-3">
          <InlineNotice tone="info">
            当前会沿用 {sourceLabel}
            的群通话来源语义，并把在线人数快照继续同步回群聊消息卡片。
          </InlineNotice>
          {!hasSyncedStatus ? (
            <InlineNotice tone="warning">
              {syncStatusMutation.isPending
                ? "正在把最新在线人数同步到群聊。"
                : "成员状态刚有变化，系统会自动刷新群通话卡片。"}
            </InlineNotice>
          ) : null}
          {syncStatusMutation.error instanceof Error ? (
            <ErrorBlock message={syncStatusMutation.error.message} />
          ) : null}
          {endStatusMutation.error instanceof Error ? (
            <ErrorBlock message={endStatusMutation.error.message} />
          ) : null}
        </div>

        <section className="mt-4 min-h-0 flex-1 rounded-[28px] border border-white/10 bg-[rgba(15,23,42,0.76)] px-4 py-4 shadow-[0_24px_60px_rgba(2,6,23,0.34)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">成员席位</div>
              <div className="mt-1 text-[12px] leading-5 text-white/56">
                点击角色成员可切换为已加入或待加入，快速同步这一轮群通话状态。
              </div>
            </div>
            <div className="rounded-full bg-white/8 px-3 py-1 text-[11px] text-white/72">
              {activeCount}/{totalCount} 已加入
            </div>
          </div>

          <div className="mt-4 grid gap-3">
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
                  disabled={member.memberType === "user"}
                  onClick={() => toggleJoinedState(member.memberId)}
                  className={cn(
                    "rounded-[20px] border px-4 py-3 text-left transition",
                    joined
                      ? "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.10)]"
                      : "border-white/10 bg-white/4",
                    member.memberType === "user"
                      ? "cursor-default"
                      : "active:bg-white/10",
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
                        <div className="truncate text-sm font-medium text-white">
                          {member.memberName ?? member.memberId}
                        </div>
                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/64">
                          {roleLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] text-white/50">
                        {member.memberType === "user"
                          ? "世界主人始终保留在当前群通话工作台"
                          : joined
                            ? "当前已加入本轮群通话"
                            : "点击后可加入本轮群通话"}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium",
                        joined
                          ? "bg-[rgba(34,197,94,0.18)] text-[#bbf7d0]"
                          : "bg-white/8 text-white/58",
                      )}
                    >
                      {joined ? "已加入" : "待加入"}
                    </span>
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

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void syncCurrentStatus();
            }}
            disabled={syncStatusMutation.isPending || !totalCount}
            className="h-12 rounded-full border-white/10 bg-white/8 text-white shadow-none hover:bg-white/12"
          >
            <Users size={16} />
            {syncStatusMutation.isPending
              ? "同步中..."
              : hasSyncedStatus
                ? "已同步群状态"
                : "同步最新状态"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void handleEndCall();
            }}
            disabled={endStatusMutation.isPending}
            className="h-12 rounded-full border-[#fca5a5]/26 bg-[#ef4444]/14 text-[#fecaca] shadow-none hover:bg-[#ef4444]/20"
          >
            <PhoneOff size={16} />
            {endStatusMutation.isPending ? "结束中..." : "结束通话"}
          </Button>
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
    <div className="rounded-[20px] border border-white/10 bg-white/4 px-3 py-3">
      <div className="text-[11px] tracking-[0.12em] text-white/45">{label}</div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-white/48">{detail}</div>
    </div>
  );
}

function CallControlButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition",
        active
          ? "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.12)] text-[#bbf7d0]"
          : "border-white/10 bg-white/4 text-white/72",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
