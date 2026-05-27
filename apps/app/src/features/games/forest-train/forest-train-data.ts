import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
const t = translateRuntimeMessage;

// 星野列车 — MVP：选线路出发，每站冒出一位乘客，5s 内点击拾取故事碎片。

export type StationKind = "passenger" | "scenic" | "transfer";

export type Passenger = {
  id: string;
  name: string;
  emoji: string;
  worldCharacterId?: string;
  fragmentTitle: string;
  fragment: string;
};

export type Station = {
  index: number;
  name: string;
  emoji: string;
  passengerId: string | null; // null = 风景站，没有乘客
};

export type Route = {
  id: string;
  name: string;
  blurb: string;
  stations: Station[];
  unlockTickets: number;
  isLimited?: boolean;
};

export const ROUND_DURATION_MS = 10 * 60 * 1000;
export const STATION_INTERVAL_MS = 30 * 1000;
export const PASSENGER_VISIBLE_MS = 5 * 1000;
export const LOG_LIMIT = 24;

export const PASSENGERS: Passenger[] = [
  {
    id: "p-suyu",
    name: t(msg`苏屿`),
    emoji: "🌸",
    worldCharacterId: "char-manual-su-yu",
    fragmentTitle: t(msg`花店窗后`),
    fragment: t(msg`她说昨晚把多余的花插进了空咖啡杯。`),
  },
  {
    id: "p-linmian",
    name: t(msg`林眠`),
    emoji: "😴",
    worldCharacterId: "char-manual-lin-mian",
    fragmentTitle: t(msg`午后小睡`),
    fragment: t(msg`她把午后的阳光卷成毛毯盖在身上。`),
  },
  {
    id: "p-zhouran",
    name: t(msg`周冉`),
    emoji: "💪",
    worldCharacterId: "char-manual-zhou-ran",
    fragmentTitle: t(msg`深夜训练`),
    fragment: t(msg`她说月亮亮的时候跑得比较稳。`),
  },
  {
    id: "p-linchen",
    name: t(msg`林沉`),
    emoji: "🌙",
    worldCharacterId: "char-manual-lin-chen",
    fragmentTitle: t(msg`零点信号`),
    fragment: t(msg`他凌晨四点收到了一封没人寄的信。`),
  },
  {
    id: "p-xuzhe",
    name: t(msg`徐喆`),
    emoji: "💼",
    worldCharacterId: "char-manual-xu-zhe",
    fragmentTitle: t(msg`合同便签`),
    fragment: t(msg`他在每张名片背后写一句不签合同的话。`),
  },
  {
    id: "p-yueyi",
    name: t(msg`月一`),
    emoji: "🌝",
    fragmentTitle: t(msg`月光台阶`),
    fragment: t(msg`她数完台阶就走到了海边。`),
  },
  {
    id: "p-shengfeng",
    name: t(msg`声风`),
    emoji: "🌬",
    fragmentTitle: t(msg`耳机里的浪`),
    fragment: t(msg`他录下海风，剪成给夜班司机的伴奏。`),
  },
];

export function getPassenger(id: string): Passenger | undefined {
  return PASSENGERS.find((p) => p.id === id);
}

function station(
  index: number,
  name: string,
  emoji: string,
  passengerId: string | null,
): Station {
  return { index, name, emoji, passengerId };
}

export const ROUTES: Route[] = [
  {
    id: "forest-meadow",
    name: t(msg`星野原线`),
    blurb: t(msg`默认线路，6 站慢车。`),
    unlockTickets: 0,
    stations: [
      station(0, t(msg`晨雾站`), "🌫", null),
      station(1, t(msg`花田站`), "🌷", "p-suyu"),
      station(2, t(msg`原野站`), "🌾", null),
      station(3, t(msg`午枕站`), "🛏", "p-linmian"),
      station(4, t(msg`星野站`), "✨", "p-yueyi"),
      station(5, t(msg`终点弧站`), "🏁", null),
    ],
  },
  {
    id: "seaside-branch",
    name: t(msg`海边支线`),
    blurb: t(msg`新增支线，需 2 张海边车票解锁。`),
    unlockTickets: 2,
    isLimited: true,
    stations: [
      station(0, t(msg`潮汐站`), "🌊", "p-shengfeng"),
      station(1, t(msg`灯塔站`), "🗼", "p-linchen"),
      station(2, t(msg`沙岸站`), "🏖", null),
      station(3, t(msg`岛屿站`), "🏝", "p-yueyi"),
      station(4, t(msg`暗潮站`), "🌑", "p-suyu"),
      station(5, t(msg`回港站`), "⚓", null),
    ],
  },
  {
    id: "city-loop",
    name: t(msg`城环夜线`),
    blurb: t(msg`攒满 4 张车票后开放。`),
    unlockTickets: 4,
    stations: [
      station(0, t(msg`霓虹站`), "🌃", "p-xuzhe"),
      station(1, t(msg`小巷站`), "🏮", null),
      station(2, t(msg`广场站`), "🛐", null),
      station(3, t(msg`高架站`), "🛣", "p-zhouran"),
      station(4, t(msg`零点站`), "🌌", "p-linchen"),
      station(5, t(msg`回程站`), "🚉", null),
    ],
  },
];

export function getRoute(id: string): Route | undefined {
  return ROUTES.find((r) => r.id === id);
}
// i18n-ignore-end
