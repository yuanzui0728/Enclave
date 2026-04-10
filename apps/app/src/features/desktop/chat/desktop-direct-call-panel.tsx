import { useEffect, useState, type ReactNode } from "react";
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
import type { DesktopChatCallKind } from "./desktop-chat-header-actions";
import { formatDetailedMessageTimestamp } from "../../../lib/format";

type DesktopDirectCallPanelProps = {
  kind: DesktopChatCallKind;
  conversationTitle: string;
  inviteNoticePending?: boolean;
  onClose: () => void;
  onOpenMobileHandoff: () => void;
  onSendInviteNotice: (status: { remoteJoined: boolean }) => void;
};

export function DesktopDirectCallPanel({
  kind,
  conversationTitle,
  inviteNoticePending = false,
  onClose,
  onOpenMobileHandoff,
  onSendInviteNotice,
}: DesktopDirectCallPanelProps) {
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(kind === "video");
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    setMuted(false);
    setCameraEnabled(kind === "video");
    setSpeakerEnabled(true);
    setRemoteJoined(false);
    setStartedAt(new Date().toISOString());
  }, [conversationTitle, kind]);

  const callKindLabel = kind === "voice" ? "语音通话" : "视频通话";

  return (
    <section className="flex h-full min-h-0 gap-5 rounded-[30px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,252,0.96))] p-5 shadow-[var(--shadow-card)]">
      <div className="flex min-w-0 flex-[1.06] flex-col rounded-[26px] border border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(244,248,255,0.92),rgba(255,255,255,0.94))] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(59,130,246,0.12)] px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-[#2563eb]">
              {kind === "voice" ? <Mic size={13} /> : <Video size={13} />}
              桌面{callKindLabel}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <AvatarChip name={conversationTitle} size="xl" />
              <div className="min-w-0">
                <div className="truncate text-[22px] font-semibold text-[color:var(--text-primary)]">
                  {conversationTitle}
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  单聊通话已切到桌面工作台，可先管理设备状态，再决定是否接力到手机。
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
            label="当前状态"
            value={remoteJoined ? "已接通" : "等待接听"}
            detail={remoteJoined ? "对方已加入桌面通话" : "可先通知对方加入"}
          />
          <CallMetricCard
            label="发起时间"
            value={formatDetailedMessageTimestamp(startedAt)}
            detail="桌面通话工作台已就绪"
          />
          <CallMetricCard
            label="后续动作"
            value="手机接力"
            detail="需要时可无缝切到手机继续"
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
                icon={
                  cameraEnabled ? <VideoOff size={16} /> : <Video size={16} />
                }
                onClick={() => setCameraEnabled((current) => !current)}
              />
            ) : null}
          </div>

          <div className="mt-4">
            <InlineNotice tone="info">
              桌面端先承接当前单聊的通话工作台；如果你要继续真实设备通话，可直接接力到手机。
            </InlineNotice>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => onSendInviteNotice({ remoteJoined })}
            disabled={inviteNoticePending}
            className="rounded-full"
          >
            <UserPlus size={16} />
            {inviteNoticePending ? "通知中..." : "通知对方"}
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
            onClick={onClose}
            className="rounded-full text-[#d74b45]"
          >
            <PhoneOff size={16} />
            结束通话
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-[0.94] flex-col rounded-[26px] border border-[rgba(15,23,42,0.06)] bg-white/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              通话席位
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              对方席位默认待接听，可手动切成已接通，模拟桌面通话确认状态。
            </div>
          </div>
          <div
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium",
              remoteJoined
                ? "bg-[rgba(47,122,63,0.10)] text-[#2f7a3f]"
                : "bg-[rgba(59,130,246,0.10)] text-[#2563eb]",
            )}
          >
            {remoteJoined ? "双方已接通" : "等待对方加入"}
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-3">
          <SeatCard
            name="我"
            subtitle="世界主人始终保留在桌面通话工作台"
            joined
            roleLabel="当前设备"
          />
          <SeatCard
            name={conversationTitle}
            subtitle={
              remoteJoined ? "当前已加入单聊通话" : "点击后切换为已加入"
            }
            joined={remoteJoined}
            roleLabel="对方"
            onClick={() => setRemoteJoined((current) => !current)}
          />
        </div>
      </div>
    </section>
  );
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
      <div className="mt-2 text-[18px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
        {detail}
      </div>
    </div>
  );
}

function CallControlButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition",
        active
          ? "border-[rgba(37,99,235,0.18)] bg-[rgba(59,130,246,0.08)] text-[#2563eb]"
          : "border-black/8 bg-white text-[color:var(--text-secondary)] hover:bg-[#f7f7f7]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SeatCard({
  name,
  subtitle,
  joined,
  roleLabel,
  onClick,
}: {
  name: string;
  subtitle: string;
  joined: boolean;
  roleLabel: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-[22px] border px-4 py-4 text-left transition",
        joined
          ? "border-[rgba(47,122,63,0.18)] bg-[rgba(244,252,247,0.92)]"
          : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.92)]",
        onClick
          ? "hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--shadow-soft)]"
          : "cursor-default",
      )}
    >
      <div className="flex items-center gap-3">
        <AvatarChip name={name} size="wechat" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {name}
            </div>
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
              {roleLabel}
            </span>
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {subtitle}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium",
            joined
              ? "bg-[rgba(47,122,63,0.10)] text-[#2f7a3f]"
              : "bg-[rgba(59,130,246,0.10)] text-[#2563eb]",
          )}
        >
          {joined ? "已接通" : "待接听"}
        </span>
        {onClick ? (
          <span className="text-[11px] text-[color:var(--text-muted)]">
            点击切换状态
          </span>
        ) : null}
      </div>
    </button>
  );
}
