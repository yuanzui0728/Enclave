import type { ReactNode } from "react";
import { Button, cn } from "@yinjie/ui";
import { Clock3, Copy, Flag, Play, Share2, Smartphone, Sparkles, X } from "lucide-react";
import { formatConversationTimestamp } from "../../lib/format";
import {
  isMobileWebShareSurface,
  isNativeMobileShareSurface,
} from "../../runtime/mobile-share-surface";
import { useDesktopLayout } from "../shell/use-desktop-layout";
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
  copyActionIcon?: ReactNode;
  copyActionLabel?: string;
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
  copyActionIcon,
  copyActionLabel,
  onLaunch,
}: GameCenterSessionPanelProps) {
  const tone = getGameCenterToneStyle(game.tone);
  const isDesktopLayout = useDesktopLayout();
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const mobileWebCopyFallback = isMobileWebShareSurface({
    isDesktopLayout,
  });
  const metricAccentClass = compact
    ? "text-[#15803d]"
    : "text-[color:var(--brand-secondary)]";
  const rewardAccentClass = compact
    ? "text-[#15803d]"
    : "text-[color:var(--brand-primary)]";
  const resolvedCopyActionIcon =
    copyActionIcon ??
    (nativeMobileShareSupported ? (
      <Share2 size={16} />
    ) : mobileWebCopyFallback ? (
      <Copy size={16} />
    ) : (
      <Smartphone size={16} />
    ));
  const resolvedCopyActionLabel = copyActionLabel
    ? copyActionLabel
    : nativeMobileShareSupported
      ? "系统分享"
      : mobileWebCopyFallback
        ? "复制入口"
        : "发到手机";

  return (
    <section
      className={cn(
        compact
          ? "rounded-[30px] border p-5 shadow-[var(--shadow-soft)]"
          : "rounded-[24px] border p-5 shadow-[var(--shadow-card)]",
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
            className={cn(
              "shrink-0 border",
              compact
                ? "rounded-2xl border-white/80 bg-white/72"
                : "rounded-[14px] border-[color:var(--border-faint)] bg-white/86 text-[color:var(--text-secondary)] shadow-none hover:bg-white hover:text-[color:var(--text-primary)]",
            )}
          >
            <X size={16} />
          </Button>
        ) : null}
      </div>

      <div className={cn("mt-4 grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-3")}>
        <SessionMetric
          compact={compact}
          icon={<Clock3 size={15} className={metricAccentClass} />}
          label="预计节奏"
          value={game.estimatedDuration}
        />
        <SessionMetric
          compact={compact}
          icon={<Sparkles size={15} className={rewardAccentClass} />}
          label="本局奖励"
          value={game.rewardLabel}
        />
        <SessionMetric
          compact={compact}
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
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]",
              compact
                ? "bg-white/82"
                : "border border-white/72 bg-white/88",
            )}
          >
            {tag}
          </span>
        ))}
      </div>

      <div
        className={cn(
          "mt-5 flex flex-wrap gap-3",
          compact ? "" : "border-t border-white/74 pt-4",
        )}
      >
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
            {resolvedCopyActionIcon}
            {resolvedCopyActionLabel}
          </Button>
        ) : null}
        <div
          className={cn(
            "text-xs leading-6 text-[color:var(--text-muted)]",
            compact ? "flex items-center" : "w-full",
          )}
        >
          {isActive
            ? "当前先由游戏中心工作区承接会话，后续再接真实小游戏容器。"
            : "开始后会写入当前会话、最近玩过和开局次数。"}
        </div>
      </div>
    </section>
  );
}

function SessionMetric({
  compact = false,
  icon,
  label,
  value,
  detail,
}: {
  compact?: boolean;
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border px-4 py-4",
        compact
          ? "border-white/80 bg-white/82"
          : "border-white/72 bg-white/88 shadow-[0_8px_18px_rgba(15,23,42,0.04)]",
      )}
    >
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
