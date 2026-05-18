import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type {
  ParkingWarCarTier,
  ParkingWarLotSurface,
  ParkingWarRarity,
} from "./parking-war-types";

const t = translateRuntimeMessage;

/**
 * Stage 7 起：经济参数、NPC 列表、状态机全部在服务端
 * (api/src/modules/games/parking-war/)。客户端这里只剩纯展示数据
 * —— 调色板、显示名、SVG 喷漆色变量。
 */

export interface TierDisplay {
  name: string;
  emoji: string;
}

export const TIER_DISPLAY: Record<ParkingWarCarTier, TierDisplay> = {
  starter: { name: t(msg`代步车`), emoji: "🚗" },
  family: { name: t(msg`家用车`), emoji: "🚙" },
  business: { name: t(msg`商务车`), emoji: "🚐" },
  performance: { name: t(msg`性能车`), emoji: "🏎️" },
  luxury: { name: t(msg`豪华车`), emoji: "🚘" },
  super: { name: t(msg`超跑`), emoji: "🏁" },
};

export const TIER_ORDER: ParkingWarCarTier[] = [
  "starter",
  "family",
  "business",
  "performance",
  "luxury",
  "super",
];

export const RARITY_ORDER: ParkingWarRarity[] = [
  "common",
  "rare",
  "epic",
  "legend",
];

export const RARITY_DISPLAY: Record<
  ParkingWarRarity,
  { name: string; badgeClass: string; ringClass: string }
> = {
  common: {
    name: t(msg`普通`),
    badgeClass: "bg-zinc-200 text-zinc-700",
    ringClass: "ring-zinc-300",
  },
  rare: {
    name: t(msg`稀有`),
    badgeClass: "bg-blue-100 text-blue-700",
    ringClass: "ring-blue-300",
  },
  epic: {
    name: t(msg`史诗`),
    badgeClass: "bg-purple-100 text-purple-700",
    ringClass: "ring-purple-400",
  },
  legend: {
    name: t(msg`传说`),
    badgeClass: "bg-amber-100 text-amber-700",
    ringClass: "ring-amber-400",
  },
};

export const SURFACE_DISPLAY: Record<
  ParkingWarLotSurface,
  { name: string; bgClass: string; ringClass: string }
> = {
  concrete: {
    name: t(msg`水泥地`),
    bgClass: "bg-zinc-200",
    ringClass: "ring-zinc-400",
  },
  grass: {
    name: t(msg`草坪`),
    bgClass: "bg-emerald-200",
    ringClass: "ring-emerald-400",
  },
  asphalt: {
    name: t(msg`沥青`),
    bgClass: "bg-zinc-700 text-zinc-100",
    ringClass: "ring-zinc-700",
  },
  vip: {
    name: t(msg`VIP 镀金`),
    bgClass: "bg-gradient-to-br from-amber-200 to-yellow-400",
    ringClass: "ring-amber-500",
  },
};

/** 喷漆色 — 3 档玩家可在车库里切换；SVG 的 currentColor 直接吃这个。 */
export const PAINT_COLORS: Array<{ id: number; label: string; hex: string }> = [
  { id: 0, label: t(msg`原色`), hex: "#6b7280" }, // zinc-500
  { id: 1, label: t(msg`暗酒红`), hex: "#9f1239" }, // rose-800
  { id: 2, label: t(msg`湖蓝`), hex: "#0e7490" }, // cyan-700
];

export function formatYuan(cents: number): string {
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 10000) {
    return `¥${(yuan / 10000).toFixed(1)}万`;
  }
  return `¥${yuan.toFixed(2)}`;
}

/** "5 分钟前 / 1 小时前" 这种相对时间，用于事件流。 */
export function formatRelative(atMs: number, now: number): string {
  const diffSec = Math.floor((now - atMs) / 1000);
  if (diffSec < 60) return t(msg`刚刚`);
  if (diffSec < 3600) return t(msg`${Math.floor(diffSec / 60)} 分钟前`);
  if (diffSec < 86400) return t(msg`${Math.floor(diffSec / 3600)} 小时前`);
  return t(msg`${Math.floor(diffSec / 86400)} 天前`);
}
