import { useMemo } from "react";
import type { FarmCropId, FarmPlotStage } from "@yinjie/contracts";

type Archetype = "root" | "leafy" | "fruit" | "tree" | "flower";

interface ArchetypeMapping {
  archetype: Archetype;
  primary: string; // 主色，多用于成熟果实
  secondary: string; // 叶片或茎
  accent?: string; // 高光/果心
}

// 32 个 crop 的 archetype + 配色，code-generated SVG 全靠这张表驱动。
const CROP_VISUAL: Record<FarmCropId, ArchetypeMapping> = {
  cabbage: { archetype: "root", primary: "#86efac", secondary: "#15803d" },
  potato: { archetype: "root", primary: "#fde68a", secondary: "#92400e" },
  carrot: { archetype: "root", primary: "#fb923c", secondary: "#166534" },
  radish: { archetype: "root", primary: "#fda4af", secondary: "#15803d" },
  lettuce: { archetype: "root", primary: "#bbf7d0", secondary: "#166534" },
  spinach: { archetype: "root", primary: "#22c55e", secondary: "#14532d" },
  onion: { archetype: "root", primary: "#fef3c7", secondary: "#a16207", accent: "#f59e0b" },
  peanut: { archetype: "root", primary: "#fbbf24", secondary: "#92400e" },
  soybean: { archetype: "root", primary: "#fde68a", secondary: "#166534" },
  sugarcane: { archetype: "root", primary: "#a3e635", secondary: "#365314" },
  wheat: { archetype: "leafy", primary: "#fcd34d", secondary: "#a16207" },
  corn: { archetype: "leafy", primary: "#fde047", secondary: "#15803d", accent: "#fbbf24" },
  rice: { archetype: "leafy", primary: "#fef9c3", secondary: "#65a30d" },
  mint: { archetype: "leafy", primary: "#5eead4", secondary: "#0f766e" },
  tomato: { archetype: "fruit", primary: "#ef4444", secondary: "#15803d" },
  strawberry: { archetype: "fruit", primary: "#f87171", secondary: "#15803d", accent: "#fef9c3" },
  cucumber: { archetype: "fruit", primary: "#84cc16", secondary: "#3f6212" },
  eggplant: { archetype: "fruit", primary: "#a855f7", secondary: "#15803d" },
  pumpkin: { archetype: "fruit", primary: "#f97316", secondary: "#15803d", accent: "#fb923c" },
  watermelon: { archetype: "fruit", primary: "#22c55e", secondary: "#14532d", accent: "#ef4444" },
  lavender: { archetype: "fruit", primary: "#c084fc", secondary: "#365314" },
  goji: { archetype: "fruit", primary: "#dc2626", secondary: "#365314" },
  dragon_fruit: { archetype: "fruit", primary: "#ec4899", secondary: "#15803d", accent: "#fef3c7" },
  sunflower: { archetype: "flower", primary: "#fbbf24", secondary: "#15803d", accent: "#92400e" },
  ginseng: { archetype: "flower", primary: "#fef3c7", secondary: "#a16207" },
  snow_lotus: { archetype: "flower", primary: "#e0f2fe", secondary: "#94a3b8", accent: "#fef9c3" },
  plum_blossom: { archetype: "flower", primary: "#fda4af", secondary: "#451a03", accent: "#fef9c3" },
  osmanthus: { archetype: "flower", primary: "#fde047", secondary: "#a16207" },
  apple_tree: { archetype: "tree", primary: "#dc2626", secondary: "#15803d", accent: "#7c2d12" },
  peach_tree: { archetype: "tree", primary: "#fda4af", secondary: "#15803d", accent: "#7c2d12" },
  grape_vine: { archetype: "tree", primary: "#a855f7", secondary: "#15803d", accent: "#7c2d12" },
  orange_tree: { archetype: "tree", primary: "#fb923c", secondary: "#15803d", accent: "#7c2d12" },
  cherry_tree: { archetype: "tree", primary: "#dc2626", secondary: "#15803d", accent: "#7c2d12" },
};

export interface CropStageSvgProps {
  cropId: FarmCropId;
  stage: FarmPlotStage;
  size?: number;
  className?: string;
}

export function CropStageSvg({
  cropId,
  stage,
  size = 48,
  className,
}: CropStageSvgProps) {
  const visual = useMemo(() => CROP_VISUAL[cropId], [cropId]);
  if (!visual || stage === "empty") return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={cropId}
    >
      {renderArchetype(visual, stage)}
    </svg>
  );
}

function renderArchetype(v: ArchetypeMapping, stage: FarmPlotStage) {
  // 通用：先画一小堆土（每个 archetype 都顶在土上）
  const soil = (
    <ellipse cx="32" cy="58" rx="20" ry="4" fill="#92400e" opacity="0.6" />
  );
  if (stage === "seed") {
    return (
      <>
        {soil}
        <circle cx="32" cy="56" r="3" fill={v.secondary} />
      </>
    );
  }
  if (stage === "sprout") {
    return (
      <>
        {soil}
        <path
          d="M32 56 Q28 50 30 44 M32 56 Q36 50 34 44"
          stroke={v.secondary}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }
  if (stage === "growing") {
    return (
      <>
        {soil}
        {growingSvg(v)}
      </>
    );
  }
  if (stage === "rotten") {
    return (
      <>
        {soil}
        <path
          d="M28 50 L32 56 L36 50 L34 44 L30 44 Z"
          fill="#78716c"
          opacity="0.7"
        />
        <text x="32" y="42" fontSize="10" textAnchor="middle" fill="#57534e">
          🥀
        </text>
      </>
    );
  }
  // ripe
  return (
    <>
      {soil}
      {ripeSvg(v)}
    </>
  );
}

function growingSvg(v: ArchetypeMapping) {
  switch (v.archetype) {
    case "tree":
      return (
        <>
          <rect x="30" y="36" width="4" height="22" fill={v.accent ?? "#7c2d12"} />
          <circle cx="32" cy="32" r="12" fill={v.secondary} opacity="0.85" />
        </>
      );
    case "flower":
      return (
        <>
          <path
            d="M32 56 L32 36"
            stroke={v.secondary}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="32" cy="32" r="6" fill={v.secondary} opacity="0.7" />
        </>
      );
    case "leafy":
      return (
        <>
          <path d="M32 56 L32 30" stroke={v.secondary} strokeWidth="2" />
          <path
            d="M32 46 Q24 42 22 36 M32 46 Q40 42 42 36 M32 38 Q26 32 24 26 M32 38 Q38 32 40 26"
            stroke={v.secondary}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case "fruit":
      return (
        <>
          <path d="M32 56 L32 36" stroke={v.secondary} strokeWidth="2" />
          <ellipse cx="26" cy="40" rx="4" ry="6" fill={v.secondary} opacity="0.7" />
          <ellipse cx="38" cy="40" rx="4" ry="6" fill={v.secondary} opacity="0.7" />
        </>
      );
    case "root":
    default:
      return (
        <>
          <path
            d="M32 56 Q26 48 28 38 M32 56 Q38 48 36 38 M32 56 L32 36"
            stroke={v.secondary}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
  }
}

function ripeSvg(v: ArchetypeMapping) {
  switch (v.archetype) {
    case "tree":
      return (
        <>
          <rect x="30" y="38" width="4" height="20" fill={v.accent ?? "#7c2d12"} />
          <circle cx="32" cy="30" r="16" fill={v.secondary} />
          {/* 三颗果点缀 */}
          <circle cx="26" cy="28" r="3" fill={v.primary} />
          <circle cx="36" cy="26" r="3" fill={v.primary} />
          <circle cx="32" cy="36" r="3" fill={v.primary} />
        </>
      );
    case "flower":
      return (
        <>
          <path d="M32 58 L32 36" stroke={v.secondary} strokeWidth="3" />
          {/* 五瓣花 */}
          <g transform="translate(32 28)">
            {[0, 72, 144, 216, 288].map((deg) => (
              <ellipse
                key={deg}
                cx="0"
                cy="-7"
                rx="4"
                ry="7"
                fill={v.primary}
                transform={`rotate(${deg})`}
              />
            ))}
            <circle cx="0" cy="0" r="4" fill={v.accent ?? v.secondary} />
          </g>
        </>
      );
    case "leafy":
      return (
        <>
          <path d="M32 58 L32 22" stroke={v.secondary} strokeWidth="2" />
          <ellipse cx="32" cy="22" rx="10" ry="14" fill={v.primary} />
          {v.accent && <ellipse cx="32" cy="22" rx="6" ry="9" fill={v.accent} opacity="0.6" />}
        </>
      );
    case "fruit":
      return (
        <>
          <path d="M32 58 L32 36" stroke={v.secondary} strokeWidth="2" />
          <circle cx="24" cy="36" r="7" fill={v.primary} />
          <circle cx="40" cy="34" r="8" fill={v.primary} />
          <circle cx="32" cy="46" r="7" fill={v.primary} />
          {v.accent && (
            <>
              <circle cx="24" cy="34" r="1.5" fill={v.accent} />
              <circle cx="40" cy="32" r="1.5" fill={v.accent} />
            </>
          )}
        </>
      );
    case "root":
    default:
      return (
        <>
          {/* 上方一束叶 */}
          <path
            d="M32 30 Q28 22 30 14 M32 30 Q36 22 34 14"
            stroke={v.secondary}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {/* 中下方根块 */}
          <ellipse cx="32" cy="42" rx="10" ry="14" fill={v.primary} />
          {v.accent && (
            <ellipse cx="32" cy="42" rx="6" ry="8" fill={v.accent} opacity="0.45" />
          )}
        </>
      );
  }
}
