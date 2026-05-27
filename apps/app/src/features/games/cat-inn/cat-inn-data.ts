import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;

// 猫咖旅馆 — MVP：3 间房 × 2 个家具位 / 6 种家具 / 每局 5 位客人轮流入住

export type FurnitureKind =
  | "candle"
  | "rug"
  | "cat-tower"
  | "tea-set"
  | "lamp"
  | "cushion";

export type RoomKind = "lobby" | "cat-bed" | "tea";

export type FurnitureSpec = {
  kind: FurnitureKind;
  name: string;
  emoji: string;
  affinity: RoomKind;
};

export type RoomSpec = {
  kind: RoomKind;
  name: string;
  emoji: string;
  blurb: string;
};

export type GuestSpec = {
  id: string;
  name: string;
  emoji: string;
  worldCharacterId?: string;
  preferredRoom: RoomKind;
  prefersFurniture: FurnitureKind[];
  quote: string;
};

export const ROUND_DURATION_MS = 6 * 60 * 1000;
export const GUESTS_PER_ROUND = 5;
export const SLOTS_PER_ROOM = 2;
export const LOG_LIMIT = 24;

export const ROOMS: RoomSpec[] = [
  {
    kind: "lobby",
    name: t(msg`一楼休息区`),
    emoji: "🛋",
    blurb: t(msg`沙发与暖光，是来客先到的地方。`),
  },
  {
    kind: "cat-bed",
    name: t(msg`猫窝阁楼`),
    emoji: "🐱",
    blurb: t(msg`小阁楼，给爱躲起来的人和猫。`),
  },
  {
    kind: "tea",
    name: t(msg`茶吧角`),
    emoji: "🍵",
    blurb: t(msg`一壶热茶配窗外夜色。`),
  },
];

export const FURNITURE: FurnitureSpec[] = [
  {
    kind: "rug",
    name: t(msg`绒毛地毯`),
    emoji: "🧶",
    affinity: "lobby",
  },
  {
    kind: "lamp",
    name: t(msg`暖黄落地灯`),
    emoji: "🪔",
    affinity: "lobby",
  },
  {
    kind: "cat-tower",
    name: t(msg`高高猫爬架`),
    emoji: "🪜",
    affinity: "cat-bed",
  },
  {
    kind: "cushion",
    name: t(msg`猫窝软垫`),
    emoji: "🛏",
    affinity: "cat-bed",
  },
  {
    kind: "tea-set",
    name: t(msg`茶具一套`),
    emoji: "🫖",
    affinity: "tea",
  },
  {
    kind: "candle",
    name: t(msg`香薰蜡烛`),
    emoji: "🕯",
    affinity: "tea",
  },
];

// 客人取自隐界角色池里偏向"治愈 / 文艺 / 安静"的人选；
// worldCharacterId 占位，UI 里只用 emoji + name 渲染。
export const GUEST_POOL: GuestSpec[] = [
  {
    id: "guest-suyu",
    name: t(msg`苏屿`),
    emoji: "🌸",
    worldCharacterId: "char-manual-su-yu",
    preferredRoom: "tea",
    prefersFurniture: ["tea-set", "candle"],
    quote: t(msg`想找个能闻到蜡烛的茶角坐一会儿。`),
  },
  {
    id: "guest-linmian",
    name: t(msg`林眠`),
    emoji: "😴",
    worldCharacterId: "char-manual-lin-mian",
    preferredRoom: "cat-bed",
    prefersFurniture: ["cushion", "cat-tower"],
    quote: t(msg`太困了，能睡到一只猫旁边吗。`),
  },
  {
    id: "guest-linchen",
    name: t(msg`林沉`),
    emoji: "🌙",
    worldCharacterId: "char-manual-lin-chen",
    preferredRoom: "tea",
    prefersFurniture: ["candle", "cushion"],
    quote: t(msg`深夜的茶要有香气和软椅子。`),
  },
  {
    id: "guest-zhouran",
    name: t(msg`周冉`),
    emoji: "💪",
    worldCharacterId: "char-manual-zhou-ran",
    preferredRoom: "lobby",
    prefersFurniture: ["lamp", "cat-tower"],
    quote: t(msg`训练完，就想看猫爬上爬下。`),
  },
  {
    id: "guest-xuzhe",
    name: t(msg`徐喆`),
    emoji: "💼",
    worldCharacterId: "char-manual-xu-zhe",
    preferredRoom: "lobby",
    prefersFurniture: ["rug", "tea-set"],
    quote: t(msg`签合同前，先来杯茶。`),
  },
  {
    id: "guest-yueyi",
    name: t(msg`月一`),
    emoji: "🌝",
    preferredRoom: "cat-bed",
    prefersFurniture: ["cat-tower", "candle"],
    quote: t(msg`月光下的猫窝最安心。`),
  },
];

export function getFurnitureSpec(kind: FurnitureKind): FurnitureSpec {
  return FURNITURE.find((f) => f.kind === kind)!;
}

export function getRoomSpec(kind: RoomKind): RoomSpec {
  return ROOMS.find((r) => r.kind === kind)!;
}

export function getGuestSpec(id: string): GuestSpec | undefined {
  return GUEST_POOL.find((g) => g.id === id);
}
