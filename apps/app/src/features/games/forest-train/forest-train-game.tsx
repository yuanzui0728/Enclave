import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  BookOpen,
  Lock,
  Play,
  RotateCcw,
  Ticket,
  Train,
  X,
} from "lucide-react";
import {
  PASSENGER_VISIBLE_MS,
  ROUTES,
  ROUND_DURATION_MS,
  STATION_INTERVAL_MS,
  getPassenger,
  getRoute,
} from "./forest-train-data";
import { useForestTrainState } from "./use-forest-train-state";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type ForestTrainGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ForestTrainGame({
  variant = "fullscreen",
  onExit,
}: ForestTrainGameProps) {
  const { state, actions } = useForestTrainState();
  const [now, setNow] = useState(() => Date.now());

  const isRunning = state.status === "running";
  const isEnded = state.status === "ended";

  // now 用来比 passengerVisibleUntilMs / 跑站可见窗——只有 running 才需要这个时钟，
  // idle/ended 不再每 250ms 强重渲。
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [isRunning]);
  const containerCls =
    variant === "embedded"
      ? "rounded-[16px] bg-white"
      : "min-h-screen bg-[color:var(--bg-app)]";

  const route = getRoute(state.currentRouteId);
  const station = route?.stations[state.stationIndex];
  const passenger =
    station?.passengerId && state.passengerVisibleUntilMs > now
      ? getPassenger(station.passengerId)
      : null;
  const passengerLeftMs = Math.max(
    0,
    state.passengerVisibleUntilMs - now,
  );
  const passengerPct = (passengerLeftMs / PASSENGER_VISIBLE_MS) * 100;
  const collectedHere = route
    ? state.collectedByRoute[route.id] ?? []
    : [];
  const passengerStations = route?.stations.filter((s) => s.passengerId) ?? [];

  return (
    <section className={cn("flex flex-col gap-3 p-3", containerCls)}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`星野列车`)}
          </span>
          {route ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
              {route.name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[12px] font-medium text-emerald-800">
            <BookOpen size={12} />
            {state.totalFragments}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[12px] font-medium text-rose-700">
            <Ticket size={12} />
            ×{state.ticketCount}
          </span>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-secondary)] hover:bg-black/[0.04]"
              aria-label={t(msg`退出游戏`)}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      </header>

      {/* 列车视图 */}
      <div className="rounded-[12px] border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-3">
        <div className="flex items-center justify-between text-[12px] text-emerald-900">
          <span className="flex items-center gap-1">
            <Train size={13} />
            {isRunning && station
              ? t(msg`停靠 ${station.name}`)
              : isEnded
                ? t(msg`已收车`)
                : t(msg`准备出发`)}
          </span>
          <span>
            {isRunning ? formatRemaining(state.remainingMs) : "--:--"}
          </span>
        </div>
        {/* 站台进度 */}
        <div className="mt-2 flex items-center gap-1">
          {(route?.stations ?? []).map((s, idx) => {
            const passed = idx < state.stationIndex;
            const here = idx === state.stationIndex && isRunning;
            return (
              <div
                key={s.index}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 text-[10px]",
                  here
                    ? "text-emerald-700"
                    : passed
                      ? "text-[color:var(--text-secondary)]"
                      : "text-[color:var(--text-tertiary)]",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
                    here
                      ? "bg-emerald-500 text-white"
                      : passed
                        ? "bg-emerald-200 text-emerald-700"
                        : "bg-white border border-[color:var(--border-faint)]",
                  )}
                >
                  {s.emoji}
                </span>
                <span className="max-w-[60px] truncate text-center">
                  {s.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 当前乘客 */}
      {passenger ? (
        <div className="rounded-[12px] border border-emerald-200 bg-white p-3">
          <div className="flex items-start gap-3">
            <span className="text-[28px]">{passenger.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                {passenger.name} · {passenger.fragmentTitle}
              </div>
              <div className="mt-1 text-[12px] leading-[1.5rem] text-[color:var(--text-secondary)]">
                {passenger.fragment}
              </div>
            </div>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[color:var(--bg-app)]">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${passengerPct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={actions.skip}
              className="rounded-full border border-[color:var(--border-faint)] px-3 py-1 text-[12px] text-[color:var(--text-secondary)]"
            >
              {t(msg`不停`)}
            </button>
            <button
              type="button"
              onClick={actions.collect}
              className="rounded-full bg-emerald-500 px-4 py-1 text-[12px] font-medium text-white hover:bg-emerald-600"
            >
              {t(msg`拾取碎片`)}
            </button>
          </div>
        </div>
      ) : null}

      {/* 控制 */}
      {!isRunning ? (
        <button
          type="button"
          onClick={actions.start}
          className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-emerald-600"
        >
          <Play size={14} />
          {isEnded ? t(msg`再发一班`) : t(msg`列车出发`)}
        </button>
      ) : null}

      {/* 路线选择 */}
      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-[13px] font-medium">
          <span>{t(msg`选择线路`)}</span>
          <span className="text-[11px] text-[color:var(--text-secondary)]">
            {t(msg`本线收集 ${collectedHere.length} / ${passengerStations.length}`)}
          </span>
        </div>
        <ul className="space-y-2">
          {ROUTES.map((r) => {
            const unlocked =
              r.unlockTickets === 0 ||
              state.ticketCount >= r.unlockTickets ||
              Object.prototype.hasOwnProperty.call(state.collectedByRoute, r.id);
            const active = r.id === state.currentRouteId;
            const collected = state.collectedByRoute[r.id] ?? [];
            const passengerCount = r.stations.filter((s) => s.passengerId).length;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => actions.selectRoute(r.id)}
                  disabled={!unlocked || isRunning}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-[10px] border px-3 py-2 text-left",
                    active
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-[color:var(--border-faint)] bg-white",
                    !unlocked && "opacity-50",
                    isRunning && "opacity-60",
                  )}
                >
                  <Train size={14} className="mt-0.5 text-emerald-700" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--text-primary)]">
                      {r.name}
                      {r.isLimited ? (
                        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
                          {t(msg`支线`)}
                        </span>
                      ) : null}
                      {!unlocked ? (
                        <Lock size={11} className="text-[color:var(--text-tertiary)]" />
                      ) : null}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-secondary)]">
                      {r.blurb}
                    </div>
                    <div className="mt-1 text-[11px] text-[color:var(--text-secondary)]">
                      {unlocked
                        ? t(
                            msg`收集 ${collected.length} / ${passengerCount} 位故事`,
                          )
                        : t(msg`需要 ${r.unlockTickets} 张车票`)}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 故事手账 */}
      {state.totalFragments > 0 ? (
        <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-3">
          <div className="mb-2 text-[13px] font-medium text-[color:var(--text-primary)]">
            {t(msg`故事手账`)}
          </div>
          <ul className="space-y-1.5">
            {Object.entries(state.collectedByRoute).flatMap(([routeId, ids]) =>
              ids.map((pid) => {
                const p = getPassenger(pid);
                if (!p) return null;
                return (
                  <li
                    key={`${routeId}-${pid}`}
                    className="flex items-start gap-2 text-[12px]"
                  >
                    <span className="text-[16px]">{p.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[color:var(--text-primary)]">
                        {p.name} · {p.fragmentTitle}
                      </div>
                      <div className="text-[11px] text-[color:var(--text-secondary)]">
                        {p.fragment}
                      </div>
                    </div>
                  </li>
                );
              }),
            )}
          </ul>
        </div>
      ) : null}

      {/* 结算 */}
      {isEnded ? (
        <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="text-[13px] font-medium text-emerald-900">
            {t(msg`本班结束`)}
          </p>
          <p className="mt-1 text-[12px] text-emerald-900/80">
            {t(
              msg`累计故事碎片 ${state.totalFragments} · 海边车票 ${state.ticketCount}`,
            )}
          </p>
          <div className="mt-2 flex justify-center gap-2">
            <button
              type="button"
              onClick={actions.start}
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-600"
            >
              {t(msg`再发一班`)}
            </button>
            <button
              type="button"
              onClick={actions.backIdle}
              className="rounded-full border border-[color:var(--border-faint)] px-4 py-1.5 text-[13px] text-[color:var(--text-secondary)]"
            >
              {t(msg`回到月台`)}
            </button>
          </div>
        </div>
      ) : null}

      {/* 日志 */}
      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)]">
          <span>{t(msg`列车日志`)}</span>
          <button
            type="button"
            onClick={actions.reset}
            className="flex items-center gap-1 text-[11px] text-[color:var(--text-secondary)]"
          >
            <RotateCcw size={11} />
            {t(msg`重置`)}
          </button>
        </div>
        <ul className="max-h-44 overflow-y-auto px-3 py-2">
          {state.log.length === 0 ? (
            <li className="py-1 text-[12px] text-[color:var(--text-tertiary)]">
              {t(msg`等待发车…`)}
            </li>
          ) : (
            state.log.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "py-1 text-[12px] leading-[1.5rem]",
                  entry.tone === "success" && "text-emerald-700",
                  entry.tone === "warn" && "text-amber-700",
                  entry.tone === "info" && "text-[color:var(--text-secondary)]",
                )}
              >
                {entry.text}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
// i18n-ignore-end
