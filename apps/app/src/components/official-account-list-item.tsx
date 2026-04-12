import type { OfficialAccountSummary } from "@yinjie/contracts";
import { BadgeCheck, ChevronRight, Radio } from "lucide-react";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "./avatar-chip";

export function OfficialAccountListItem({
  account,
  active = false,
  compact = false,
  dense = false,
  onClick,
}: {
  account: OfficialAccountSummary;
  active?: boolean;
  compact?: boolean;
  dense?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 text-left transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        compact
          ? "rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-3 shadow-[var(--shadow-section)] hover:bg-[color:var(--surface-console)]"
          : "border-b border-[color:var(--border-faint)] bg-white px-4 py-3.5 hover:bg-[color:var(--surface-console)]",
        active
          ? compact
            ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)]"
            : "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.05)]"
          : undefined,
      )}
    >
      <AvatarChip name={account.name} src={account.avatar} size="wechat" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
            {account.name}
          </div>
          {account.isVerified ? (
            <BadgeCheck size={14} className="shrink-0 text-[#2f7cf6]" />
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
          <Radio size={12} className="shrink-0" />
          <span>{account.accountType === "service" ? "服务号" : "订阅号"}</span>
          {account.isFollowing ? (
            <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-1.5 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
              已关注
            </span>
          ) : null}
        </div>
        {dense ? null : (
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
            {account.description}
          </div>
        )}
      </div>

      <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
    </button>
  );
}
