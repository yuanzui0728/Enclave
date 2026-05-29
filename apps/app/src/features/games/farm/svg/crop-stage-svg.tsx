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
  cabbage: { archetype: "root", primary: "#a790e5", secondary: "#351c79" },
  potato: { archetype: "root", primary: "#b29fe8", secondary: "#391e82" },
  carrot: { archetype: "root", primary: "#7f5ed9", secondary: "#2c1764" },
  radish: { archetype: "root", primary: "#c3b4ed", secondary: "#351c79" },
  lettuce: { archetype: "root", primary: "#cec1f1", secondary: "#2c1764" },
  spinach: { archetype: "root", primary: "#522cbb", secondary: "#251453" },
  onion: { archetype: "root", primary: "#dad1f4", secondary: "#3c2088", accent: "#5b31cf" },
  peanut: { archetype: "root", primary: "#6f4ad5", secondary: "#391e82" },
  soybean: { archetype: "root", primary: "#b29fe8", secondary: "#2c1764" },
  sugarcane: { archetype: "root", primary: "#6d47d4", secondary: "#251453" },
  wheat: { archetype: "leafy", primary: "#8a6cdd", secondary: "#3c2088" },
  corn: { archetype: "leafy", primary: "#8768dc", secondary: "#351c79", accent: "#6f4ad5" },
  rice: { archetype: "leafy", primary: "#d8cef3", secondary: "#3f218f" },
  mint: { archetype: "leafy", primary: "#8a6cdc", secondary: "#2f196c" },
  tomato: { archetype: "fruit", primary: "#7c5bd8", secondary: "#351c79" },
  strawberry: { archetype: "fruit", primary: "#9f86e3", secondary: "#351c79", accent: "#d8cef3" },
  cucumber: { archetype: "fruit", primary: "#502bb7", secondary: "#29165e" },
  eggplant: { archetype: "fruit", primary: "#8c6fdd", secondary: "#351c79" },
  pumpkin: { archetype: "fruit", primary: "#653dd2", secondary: "#351c79", accent: "#7f5ed9" },
  watermelon: { archetype: "fruit", primary: "#522cbb", secondary: "#251453", accent: "#7c5bd8" },
  lavender: { archetype: "fruit", primary: "#ae99e7", secondary: "#251453" },
  goji: { archetype: "fruit", primary: "#5d33cf", secondary: "#251453" },
  dragon_fruit: { archetype: "fruit", primary: "#7d5bd9", secondary: "#351c79", accent: "#dad1f4" },
  sunflower: { archetype: "flower", primary: "#6f4ad5", secondary: "#351c79", accent: "#391e82" },
  ginseng: { archetype: "flower", primary: "#dad1f4", secondary: "#3c2088" },
  snow_lotus: { archetype: "flower", primary: "#eae5f9", secondary: "#9e94b8", accent: "#d8cef3" },
  plum_blossom: { archetype: "flower", primary: "#c3b4ed", secondary: "#1a0e3a", accent: "#d8cef3" },
  osmanthus: { archetype: "flower", primary: "#8768dc", secondary: "#3c2088" },
  apple_tree: { archetype: "tree", primary: "#5d33cf", secondary: "#351c79", accent: "#321b73" },
  peach_tree: { archetype: "tree", primary: "#c3b4ed", secondary: "#351c79", accent: "#321b73" },
  grape_vine: { archetype: "tree", primary: "#8c6fdd", secondary: "#351c79", accent: "#321b73" },
  orange_tree: { archetype: "tree", primary: "#7f5ed9", secondary: "#351c79", accent: "#321b73" },
  cherry_tree: { archetype: "tree", primary: "#5d33cf", secondary: "#351c79", accent: "#321b73" },
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
    <ellipse cx="32" cy="58" rx="20" ry="4" fill="#391e82" opacity="0.6" />
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
          fill="#6f6c78"
          opacity="0.7"
        />
        <text x="32" y="42" fontSize="10" textAnchor="middle" fill="#504e57">
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
          <rect x="30" y="36" width="4" height="22" fill={v.accent ?? "#321b73"} />
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
          <rect x="30" y="38" width="4" height="20" fill={v.accent ?? "#321b73"} />
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
