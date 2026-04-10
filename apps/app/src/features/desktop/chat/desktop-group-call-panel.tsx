import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GroupMember } from "@yinjie/contracts";
import {
  Mic,
  MicOff,
  PhoneOff,
  Smartphone,
  UserPlus,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import type { DesktopChatCallKind } from "./desktop-chat-header-actions";
import { formatDetailedMessageTimestamp } from "../../../lib/format";

type DesktopGroupCallPanelProps = {
  kind: DesktopChatCallKind;
  groupId: string;
  groupName: string;
  members: GroupMember[];
  inviteNoticePending?: boolean;
  endNoticePending?: boolean;
  onClose: () => void;
  onOpenMobileHandoff: () => void;
  onSendInviteNotice: (counts: {
    activeCount: number;
    totalCount: number;
  }) => void;
  onEndCall: (counts: {
    activeCount: number;
    totalCount: number;
  }) => void;
};

export function DesktopGroupCallPanel({
  kind,
  groupId,
  groupName,
  members,
  inviteNoticePending = false,
  endNoticePending = false,
  onClose,
  onOpenMobileHandoff,
  onSendInviteNotice,
  onEndCall,
}: DesktopGroupCallPanelProps) {
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(kind === "video");
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [joinedMemberIds, setJoinedMemberIds] = useState<string[]>(() =>
    buildInitialJoinedMemberIds(members),
  );

  useEffect(() => {
    setMuted(false);
    setCameraEnabled(kind === "video");
    setSpeakerEnabled(true);
    setStartedAt(new Date().toISOString());
    setJoinedMemberIds(buildInitialJoinedMemberIds(members));
  }, [groupId, kind, members]);

  const activeMembers = useMemo(
    () => members.filter((member) => joinedMemberIds.includes(member.memberId)),
    [joinedMemberIds, members],
  );
  const visibleMembers = useMemo(() => members.slice(0, 8), [members]);
  const callKindLabel = kind === "voice" ? "群语音" : "群视频";
  const activeCount = activeMembers.length;
  const waitingCount = Math.max(members.length - activeCount, 0);

  function toggleJoinedState(member: GroupMember) {
    if (member.memberType === "user") {
      return;
    }

    setJoinedMemberIds((current) =>
      current.includes(member.memberId)
        ? current.filter((item) => item !== member.memberId)
        : [...current, member.memberId],
    );
  }

  return (
    <section className="flex h-full min-h-0 gap-5 rounded-[30px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,252,0.96))] p-5 shadow-[var(--shadow-card)]">
      <div className="flex min-w-0 flex-[1.08] flex-col rounded-[26px] border border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(255,248,240,0.92),rgba(255,255,255,0.92))] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(249,115,22,0.12)] px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-[#c2410c]">
              {kind === "voice" ? <Mic size={13} /> : <Video size={13} />}
              {callKindLabel}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <GroupAvatarChip
                name={groupName}
                members={members.map((member) => member.memberId)}
                size="wechat"
              />
              <div className="min-w-0">
                <div className="truncate text-[22px] font-semibold text-[color:var(--text-primary)]">
                  {groupName}
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  已在桌面端发起 {callKindLabel}，当前可直接管理成员状态和设备控制。
                </div>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="shrink-0 rounded-full"
          >
            返回聊天
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <CallMetricCard
            label="当前在线"
            value={`${activeCount} 人`}
            detail="已加入当前桌面通话工作台"
          />
          <CallMetricCard
            label="等待加入"
            value={`${waitingCount} 人`}
            detail="可继续邀请未入会成员"
          />
          <CallMetricCard
            label="发起时间"
            value={formatDetailedMessageTimestamp(startedAt)}
            detail="群通话控制台已就绪"
          />
        </div>

        <div className="mt-5 rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/88 p-4">
          <div className="flex flex-wrap gap-3">
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
            {kind === "video" ? (
              <CallControlButton
                active={cameraEnabled}
                label={cameraEnabled ? "关闭摄像头" : "打开摄像头"}
                icon={cameraEnabled ? <VideoOff size={16} /> : <Video size={16} />}
                onClick={() => setCameraEnabled((current) => !current)}
              />
            ) : null}
          </div>

          <div className="mt-4">
            <InlineNotice tone="info">
              桌面端先承接群通话工作台和成员调度，必要时仍可一键接力到手机继续。
            </InlineNotice>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() =>
              onSendInviteNotice({
                activeCount,
                totalCount: members.length,
              })
            }
            disabled={inviteNoticePending}
            className="rounded-full"
          >
            <UserPlus size={16} />
            {inviteNoticePending ? "通知中..." : "通知群成员"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onOpenMobileHandoff}
            className="rounded-full"
          >
            <Smartphone size={16} />
            到手机继续
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onEndCall({
                activeCount,
                totalCount: members.length,
              })
            }
            disabled={endNoticePending}
            className="rounded-full text-[#d74b45]"
          >
            <PhoneOff size={16} />
            {endNoticePending ? "结束中..." : "结束通话"}
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-[0.92] flex-col rounded-[26px] border border-[rgba(15,23,42,0.06)] bg-white/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              成员席位
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              点击角色成员可切换为已加入或待加入，快速模拟群通话调度。
            </div>
          </div>
          <div className="rounded-full bg-[rgba(47,122,63,0.10)] px-3 py-1 text-[11px] font-medium text-[#2f7a3f]">
            {activeCount}/{members.length} 已加入
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2">
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
                onClick={() => toggleJoinedState(member)}
                disabled={member.memberType === "user"}
                className={cn(
                  "rounded-[22px] border px-4 py-4 text-left transition",
                  joined
                    ? "border-[rgba(47,122,63,0.18)] bg-[rgba(244,252,247,0.92)]"
                    : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.92)]",
                  member.memberType === "user"
                    ? "cursor-default"
                    : "hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--shadow-soft)]",
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
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {member.memberName ?? member.memberId}
                      </div>
                      <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
                        {roleLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {member.memberType === "user"
                        ? "世界主人始终保留在通话控制台"
                        : joined
                          ? "当前已加入群通话"
                          : "点击后可切换为已加入"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-medium",
                      joined
                        ? "bg-[rgba(47,122,63,0.12)] text-[#2f7a3f]"
                        : "bg-[rgba(245,158,11,0.12)] text-[#b45309]",
                    )}
                  >
                    {joined ? "已加入" : "待加入"}
                  </span>
                  {member.memberType === "character" ? (
                    <span className="text-[11px] text-[color:var(--text-dim)]">
                      {joined ? "点击设为待加入" : "点击邀请加入"}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function buildInitialJoinedMemberIds(members: GroupMember[]) {
  const joinedMembers = members
    .filter(
      (member, index) =>
        member.memberType === "user" ||
        member.role === "owner" ||
        index < 3,
    )
    .map((member) => member.memberId);

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
    <div className="rounded-[20px] border border-[rgba(15,23,42,0.06)] bg-white/88 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-base font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
        {detail}
      </div>
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
        "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm transition",
        active
          ? "border-[rgba(47,122,63,0.18)] bg-[rgba(244,252,247,0.94)] text-[#2f7a3f]"
          : "border-[rgba(15,23,42,0.08)] bg-white text-[color:var(--text-secondary)] hover:bg-[#fafafa]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
