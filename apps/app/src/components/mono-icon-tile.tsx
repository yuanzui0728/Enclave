import type { LucideIcon } from "lucide-react";
import { cn } from "@yinjie/ui";

// 去彩虹统一约定：单色描线图标（Lucide）+ 单一品牌色软底容器，
// 替代「每个功能一个随机渐变色块」。世界·探索入口、各列表图标统一走这个。
type MonoIconTileSize = "sm" | "md" | "lg";
type MonoIconTileTone = "brand" | "neutral" | "accent";

type MonoIconTileProps = {
  icon: LucideIcon;
  size?: MonoIconTileSize;
  tone?: MonoIconTileTone;
  className?: string;
  strokeWidth?: number;
};

const SIZE_MAP: Record<MonoIconTileSize, { box: string; icon: number }> = {
  sm: { box: "h-9 w-9 rounded-[var(--radius-sm)]", icon: 18 },
  md: { box: "h-11 w-11 rounded-[14px]", icon: 20 },
  lg: { box: "h-12 w-12 rounded-[var(--radius-md)]", icon: 22 },
};

const TONE_MAP: Record<MonoIconTileTone, string> = {
  brand: "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
  neutral:
    "bg-[color:var(--surface-secondary)] text-[color:var(--text-secondary)]",
  accent:
    "bg-[color:var(--surface-tertiary)] text-[color:var(--brand-accent)]",
};

export function MonoIconTile({
  icon: Icon,
  size = "md",
  tone = "brand",
  className,
  strokeWidth = 1.75,
}: MonoIconTileProps) {
  const sizing = SIZE_MAP[size];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        sizing.box,
        TONE_MAP[tone],
        className,
      )}
    >
      <Icon size={sizing.icon} strokeWidth={strokeWidth} />
    </span>
  );
}
