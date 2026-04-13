import {
  CheckCircle2,
  MessageCircleMore,
  ShieldBan,
  UserPlus,
} from "lucide-react";
import type { Character, FriendListItem, FriendRequest } from "@yinjie/contracts";
import { Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";

export type DesktopAddFriendRelationshipState =
  | "available"
  | "blocked"
  | "friend"
  | "pending";

type DesktopAddFriendResultCardProps = {
  character: Character;
  identifier: string;
  matchReason: string;
  status: DesktopAddFriendRelationshipState;
  friendship?: FriendListItem["friendship"] | null;
  pendingRequest?: FriendRequest | null;
  actionPending?: boolean;
  onOpenProfile: () => void;
  onPrimaryAction: () => void;
};

export function DesktopAddFriendResultCard({
  character,
  identifier,
  matchReason,
  status,
  friendship,
  pendingRequest,
  actionPending = false,
  onOpenProfile,
  onPrimaryAction,
}: DesktopAddFriendResultCardProps) {
  const displayName = friendship?.remarkName?.trim() || character.name;
  const signature =
    character.currentStatus?.trim() ||
    character.bio?.trim() ||
    "这个角色还没有签名。";
  const relationshipSummary =
    friendship?.remarkName?.trim() || character.relationship?.trim() || "世界角色";
  const expertDomains = character.expertDomains.slice(0, 4);
  const statusMeta =
    status === "friend"
      ? {
          badge: "已在通讯录中",
          badgeClassName:
            "border-[rgba(22,163,74,0.14)] bg-[rgba(22,163,74,0.08)] text-[#15803d]",
          helperText: "你们已经是朋友，可以直接开始聊天。",
          icon: MessageCircleMore,
          primaryLabel: actionPending ? "打开中..." : "发消息",
          primaryDisabled: actionPending,
        }
      : status === "pending"
        ? {
            badge: "等待验证",
            badgeClassName:
              "border-[rgba(202,138,4,0.16)] bg-[rgba(250,204,21,0.10)] text-[#a16207]",
            helperText: pendingRequest?.createdAt
              ? "好友申请已发送，等待对方处理。"
              : "当前申请还在等待对方通过。",
            icon: CheckCircle2,
            primaryLabel: "已发送",
            primaryDisabled: true,
          }
        : status === "blocked"
          ? {
              badge: "黑名单中",
              badgeClassName:
                "border-[rgba(239,68,68,0.16)] bg-[rgba(254,226,226,0.82)] text-[#b91c1c]",
              helperText: "当前角色已在黑名单中，移出黑名单后才能重新添加。",
              icon: ShieldBan,
              primaryLabel: "已拉黑",
              primaryDisabled: true,
            }
          : {
              badge: "可添加到通讯录",
              badgeClassName:
                "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.08)] text-[#15803d]",
              helperText: "发送验证申请后，对方通过即可成为朋友。",
              icon: UserPlus,
              primaryLabel: actionPending ? "发送中..." : "添加到通讯录",
              primaryDisabled: actionPending,
            };
  const PrimaryIcon = statusMeta.icon;

  return (
    <section className="overflow-hidden rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white shadow-none">
      <div className="border-b border-[rgba(15,23,42,0.06)] px-8 py-8">
        <div className="flex items-start gap-5">
          <AvatarChip name={character.name} src={character.avatar} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <h2 className="truncate text-[30px] font-medium tracking-[-0.02em] text-[color:var(--text-primary)]">
                {displayName}
              </h2>
              <div className="text-[13px] text-[color:var(--text-muted)]">
                {identifier}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[color:var(--text-muted)]">
              <span>{relationshipSummary}</span>
              <span>·</span>
              <span>{matchReason}</span>
            </div>

            <p className="mt-4 max-w-[720px] text-[14px] leading-7 text-[color:var(--text-secondary)]">
              {signature}
            </p>

            <div
              className={cn(
                "mt-4 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium",
                statusMeta.badgeClassName,
              )}
            >
              {statusMeta.badge}
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[rgba(15,23,42,0.06)]">
        <DesktopAddFriendDetailRow label="昵称" value={character.name} />
        <DesktopAddFriendDetailRow label="隐界号" value={identifier} />
        <DesktopAddFriendDetailRow
          label="关系"
          value={character.relationship?.trim() || "世界角色"}
        />
        <DesktopAddFriendDetailRow
          label="当前活动"
          value={character.currentActivity?.trim() || "暂无活动"}
        />
        <DesktopAddFriendDetailRow
          label="擅长领域"
          value={expertDomains.length ? expertDomains.join(" / ") : "未设置"}
        />
        {friendship ? (
          <>
            <DesktopAddFriendDetailRow
              label="备注"
              value={friendship.remarkName?.trim() || "未设置"}
            />
            <DesktopAddFriendDetailRow
              label="来源"
              value={friendship.source?.trim() || "未设置"}
            />
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-[rgba(15,23,42,0.06)] bg-[#fbfbfb] px-8 py-4">
        <div className="max-w-[420px] text-[13px] leading-6 text-[color:var(--text-muted)]">
          {statusMeta.helperText}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={onOpenProfile}
            className="rounded-[8px] border-[rgba(15,23,42,0.10)] bg-white px-5 shadow-none hover:bg-[color:var(--surface-console)]"
          >
            查看资料
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={statusMeta.primaryDisabled}
            onClick={onPrimaryAction}
            className={cn(
              "rounded-[8px] px-5 shadow-none",
              status === "pending"
                ? "bg-[#d1d5db] text-white hover:bg-[#d1d5db]"
                : undefined,
              status === "blocked"
                ? "bg-[#fca5a5] text-white hover:bg-[#fca5a5]"
                : undefined,
            )}
          >
            <PrimaryIcon size={17} />
            {statusMeta.primaryLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

function DesktopAddFriendDetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-2 px-8 py-4 md:grid-cols-[96px_minmax(0,1fr)] md:items-center">
      <div className="text-[13px] text-[color:var(--text-muted)]">{label}</div>
      <div className="text-[14px] leading-6 text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
