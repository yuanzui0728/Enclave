import { CheckCircle2, MessageCircleMore, ShieldBan, UserPlus } from "lucide-react";
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
          badge: "已在通讯录",
          badgeClassName:
            "border-[rgba(22,163,74,0.16)] bg-[rgba(22,163,74,0.08)] text-[#15803d]",
          helperText: "你们已经是朋友，可以直接打开聊天。",
          icon: MessageCircleMore,
          primaryLabel: actionPending ? "打开中..." : "发消息",
          primaryDisabled: actionPending,
        }
      : status === "pending"
        ? {
            badge: "等待通过",
            badgeClassName:
              "border-[rgba(202,138,4,0.18)] bg-[rgba(250,204,21,0.10)] text-[#a16207]",
            helperText: `好友申请已发送${pendingRequest?.createdAt ? "，等待对方处理" : ""}。`,
            icon: CheckCircle2,
            primaryLabel: "已发送",
            primaryDisabled: true,
          }
        : status === "blocked"
          ? {
              badge: "黑名单中",
              badgeClassName:
                "border-[rgba(239,68,68,0.18)] bg-[rgba(254,226,226,0.82)] text-[#b91c1c]",
              helperText: "当前角色已在黑名单中，移出黑名单后才能重新添加。",
              icon: ShieldBan,
              primaryLabel: "已拉黑",
              primaryDisabled: true,
            }
          : {
              badge: "可添加",
              badgeClassName:
                "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.08)] text-[#15803d]",
              helperText: "发送验证申请后，对方通过即可成为朋友。",
              icon: UserPlus,
              primaryLabel: actionPending ? "发送中..." : "添加到通讯录",
              primaryDisabled: actionPending,
            };
  const PrimaryIcon = statusMeta.icon;

  return (
    <section className="overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.94)] shadow-[var(--shadow-section)]">
      <div className="border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(248,250,250,0.98),rgba(255,255,255,0.82))] px-7 py-7">
        <div className="flex items-start gap-5">
          <AvatarChip name={character.name} src={character.avatar} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[28px] font-medium tracking-[-0.02em] text-[color:var(--text-primary)]">
                {friendship?.remarkName?.trim() || character.name}
              </h2>
              <div
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  statusMeta.badgeClassName,
                )}
              >
                {statusMeta.badge}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--text-muted)]">
              <span>{relationshipSummary}</span>
              <span className="text-[color:var(--text-dim)]">·</span>
              <span>{identifier}</span>
              <span className="text-[color:var(--text-dim)]">·</span>
              <span>{matchReason}</span>
            </div>
            <div className="mt-4 max-w-[720px] text-[15px] leading-8 text-[color:var(--text-secondary)]">
              {signature}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {expertDomains.length ? (
                expertDomains.map((domain) => (
                  <span
                    key={domain}
                    className="rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.88)] px-3 py-1 text-[12px] text-[color:var(--text-secondary)]"
                  >
                    {domain}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.88)] px-3 py-1 text-[12px] text-[color:var(--text-muted)]">
                  暂无标签
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-0 border-b border-[color:var(--border-faint)] bg-white lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="px-7 py-6">
          <div className="text-xs font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
            资料摘要
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <InfoField label="昵称" value={character.name} />
            <InfoField label="隐界号" value={identifier} />
            <InfoField
              label="角色关系"
              value={character.relationship?.trim() || "未设置"}
            />
            <InfoField
              label="当前状态"
              value={character.currentActivity?.trim() || "暂无活动"}
            />
          </div>
          <div className="mt-5 rounded-[18px] bg-[rgba(245,247,247,0.92)] px-4 py-3 text-[13px] leading-7 text-[color:var(--text-secondary)]">
            {statusMeta.helperText}
          </div>
        </div>

        <div className="border-t border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.82)] px-7 py-6 lg:border-l lg:border-t-0">
          <div className="text-xs font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
            操作
          </div>
          <div className="mt-4 space-y-3">
            <Button
              variant="primary"
              size="lg"
              disabled={statusMeta.primaryDisabled}
              onClick={onPrimaryAction}
              className={cn(
                "w-full rounded-[14px] text-sm shadow-none",
                status === "pending"
                  ? "bg-[linear-gradient(180deg,#d1d5db,#c4c9d2)] text-white"
                  : undefined,
                status === "blocked"
                  ? "bg-[linear-gradient(180deg,#fca5a5,#ef4444)] text-white"
                  : undefined,
              )}
            >
              <PrimaryIcon size={17} />
              {statusMeta.primaryLabel}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={onOpenProfile}
              className="w-full rounded-[14px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              查看资料
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[rgba(249,250,251,0.88)] px-4 py-3">
      <div className="text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-[15px] text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
