import { useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FarmPlayerStateView } from "@yinjie/contracts";
import { useFarmEvents } from "../use-farm-state";
import { useFarmAdjustedNow } from "../farm-clock-context";

const t = translateRuntimeMessage;

interface NotificationBannerProps {
  state: FarmPlayerStateView;
}

interface BannerItem {
  id: string;
  emoji: string;
  text: string;
  tone: "info" | "warn" | "danger";
}

export function FarmNotificationBanner({ state }: NotificationBannerProps) {
  // EventLogPanel 默认 limit=20，banner 之前用 30 是另一个 queryKey，
  // farm 首页打开会把 /events 跑两次 — 改成共享一个缓存条目。
  // banner 只看最近 30 分钟里的 steal / steal_blocked，20 条事件够用。
  const eventsQuery = useFarmEvents({ limit: 20 });
  const nowMs = useFarmAdjustedNow();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const banners = useMemo<BannerItem[]>(() => {
    const items: BannerItem[] = [];

    // 1. 多少块田已经成熟（可收）
    const ripeCount = state.plots.filter(
      (p) => p.cropId && p.maturedAt != null && nowMs >= p.maturedAt,
    ).length;
    if (ripeCount >= 3) {
      items.push({
        id: "ripe-batch",
        emoji: "🌾",
        text: t(msg`有 ${ripeCount} 块田熟了，去收菜！`),
        tone: "info",
      });
    } else if (ripeCount > 0) {
      items.push({
        id: "ripe-one",
        emoji: "🌾",
        text: t(msg`有 ${ripeCount} 块田熟了，记得回来收。`),
        tone: "info",
      });
    }

    // 2. 害虫 / 杂草 / 烂菜告警
    const bugPlots = state.plots.filter((p) => p.cropId && p.bugs > 0).length;
    if (bugPlots > 0) {
      items.push({
        id: "bugs",
        emoji: "🐛",
        text: t(msg`${bugPlots} 块田长虫了，喷点农药`),
        tone: "warn",
      });
    }
    const weedPlots = state.plots.filter((p) => p.cropId && p.weeds > 0).length;
    if (weedPlots > 0) {
      items.push({
        id: "weeds",
        emoji: "🌿",
        text: t(msg`${weedPlots} 块田长草了`),
        tone: "warn",
      });
    }
    const rottenPlots = state.plots.filter((p) => p.stage === "rotten").length;
    if (rottenPlots > 0) {
      items.push({
        id: "rotten",
        emoji: "🥀",
        text: t(msg`${rottenPlots} 块田作物腐烂，记得铲掉重种`),
        tone: "danger",
      });
    }

    // 3. 狗能量低
    if (state.dog && state.dog.level > 0 && state.dog.energy < 30) {
      items.push({
        id: "dog-hungry",
        emoji: "🦴",
        text: t(msg`狗能量只剩 ${Math.round(state.dog.energy)}，喂它吃点东西`),
        tone: "warn",
      });
    }

    // 4. 近半小时内有人偷了你的菜
    const halfHourAgo = nowMs - 30 * 60 * 1000;
    const recentSteals = (eventsQuery.data ?? []).filter(
      (e) =>
        e.kind === "steal" &&
        e.targetType === "owner" &&
        new Date(e.createdAt).getTime() >= halfHourAgo,
    );
    if (recentSteals.length > 0) {
      items.push({
        id: `stolen-${recentSteals[0]!.id}`,
        emoji: "🚨",
        text: t(msg`刚才被 ${recentSteals[0]!.actorName} 顺走了菜`),
        tone: "danger",
      });
    }
    const recentBlocked = (eventsQuery.data ?? []).filter(
      (e) => e.kind === "steal_blocked" && new Date(e.createdAt).getTime() >= halfHourAgo,
    );
    if (recentBlocked.length > 0) {
      items.push({
        id: `blocked-${recentBlocked[0]!.id}`,
        emoji: "🐕",
        text: t(msg`狗刚拦住一个想偷菜的`),
        tone: "info",
      });
    }

    return items.filter((b) => !dismissed.has(b.id));
  }, [state, nowMs, eventsQuery.data, dismissed]);

  if (banners.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3">
      {banners.slice(0, 3).map((b) => (
        <div
          key={b.id}
          className={[
            "flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs shadow-sm backdrop-blur-md",
            b.tone === "danger"
              ? "border-rose-200 bg-rose-50/85 text-rose-700"
              : b.tone === "warn"
                ? "border-amber-200 bg-amber-50/85 text-amber-700"
                : "border-emerald-200 bg-emerald-50/85 text-emerald-700",
          ].join(" ")}
        >
          <span className="text-lg">{b.emoji}</span>
          <span className="flex-1">{b.text}</span>
          <button
            type="button"
            onClick={() => setDismissed((s) => new Set([...s, b.id]))}
            className="rounded-full px-1.5 text-stone-500 hover:bg-white/60"
            title={t(msg`忽略`)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
