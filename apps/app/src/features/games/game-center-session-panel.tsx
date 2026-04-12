import type { ReactNode } from "react";
import { Button, cn } from "@yinjie/ui";
import { Clock3, Flag, Play, Smartphone, Sparkles, X } from "lucide-react";
import { formatConversationTimestamp } from "../../lib/format";
import {
  getGameCenterToneStyle,
  type GameCenterGame,
} from "./game-center-data";

type GameCenterSessionPanelProps = {
  game: GameCenterGame;
  isActive: boolean;
  launchCount: number;
  lastOpenedAt?: string;
  compact?: boolean;
  onDismiss?: () => void;
  onCopyToMobile?: (gameId: string) => void;
  onLaunch: (gameId: string) => void;
};

export function GameCenterSessionPanel({
  game,
  isActive,
  launchCount,
  lastOpenedAt,
  compact = false,
  onDismiss,
  onCopyToMobile,
  onLaunch,
}: GameCenterSessionPanelProps) {
  const tone = getGameCenterToneStyle(game.tone);
  const metricAccentClass = compact
    ? "text-[#15803d]"
    : "text-[color:var(--brand-secondary)]";
  const rewardAccentClass = compact
    ? "text-[#15803d]"
    : "text-[color:var(--brand-primary)]";

  return (
    <section
      className={cn(
        "rounded-[30px] border p-5 shadow-[var(--shadow-soft)]",
        tone.mutedPanelClassName,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-medium",
                tone.badgeClassName,
              )}
            >
              {isActive ? "即玩中" : "详情页"}
            </div>
            <div className="text-[11px] text-[color:var(--text-muted)]">
              {isActive ? "已建立会话承接" : "点击开始后进入会话承接"}
            </div>
          </div>
          <div className="mt-3 text-lg font-semibold text-[color:var(--text-primary)]">
            {isActive ? `继续 ${game.name}` : game.name}
          </div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            {game.sessionObjective}
          </div>
        </div>
        {isActive && onDismiss ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="shrink-0 rounded-2xl border border-white/80 bg-white/72"
          >
            <X size={16} />
          </Button>
        ) : null}
      </div>

      <div className={cn("mt-4 grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-3")}>
        <SessionMetric
          icon={<Clock3 size={15} className={metricAccentClass} />}
          label="预计节奏"
          value={game.estimatedDuration}
        />
        <SessionMetric
          icon={<Sparkles size={15} className={rewardAccentClass} />}
          label="本局奖励"
          value={game.rewardLabel}
        />
        <SessionMetric
          icon={<Flag size={15} className={metricAccentClass} />}
          label="开局次数"
          value={`${launchCount} 次`}
          detail={
            lastOpenedAt
              ? `上次打开 ${formatConversationTimestamp(lastOpenedAt)}`
              : "还没有打开过"
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {game.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-white/82 px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={() => onLaunch(game.id)}
          className={
            compact ? "bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]" : undefined
          }
        >
          <Play size={16} />
          {isActive ? "继续游戏" : "开始游戏"}
        </Button>
        {onCopyToMobile ? (
          <Button
            variant="secondary"
            onClick={() => onCopyToMobile(game.id)}
            className={
              compact
                ? "border-black/5 bg-white shadow-none hover:border-[rgba(7,193,96,0.16)] hover:bg-white"
                : undefined
            }
          >
            <Smartphone size={16} />
            发到手机
          </Button>
        ) : null}
        <div className="flex items-center text-xs leading-6 text-[color:var(--text-muted)]">
          {isActive
            ? "当前先由游戏中心工作区承接会话，后续再接真实小游戏容器。"
            : "开始后会写入当前会话、最近玩过和开局次数。"}
        </div>
      </div>
    </section>
  );
}

function SessionMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-dim)]">
          {detail}
        </div>
      ) : null}
    </div>
  );
}
