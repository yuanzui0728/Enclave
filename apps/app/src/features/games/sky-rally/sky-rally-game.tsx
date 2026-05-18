import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  Award,
  Lock,
  PaintBucket,
  Play,
  RotateCcw,
  Star,
  Timer,
  X,
  Zap,
} from "lucide-react";
import {
  ROUND_DURATION_MS,
  TRACK_LENGTH,
  TRACKS,
  getTrack,
} from "./sky-rally-data";
import { useSkyRallyState } from "./use-sky-rally-state";
import type { SkyRallyState } from "./sky-rally-types";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type SkyRallyGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

const TRACK_BADGE_TONE: Record<string, string> = {
  ocean: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
  sunset: "bg-orange-100 text-orange-800",
  forest: "bg-emerald-100 text-emerald-800",
  gold: "bg-amber-100 text-amber-800",
};

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${total}s`;
}

export function SkyRallyGame({ variant = "fullscreen", onExit }: SkyRallyGameProps) {
  const { state, actions } = useSkyRallyState();
  const [now, setNow] = useState(() => Date.now());
  const isRacing = state.status === "racing";

  // now 用来算门倒计时 / 跑道光位，只有 racing 才显示——idle/ended 不要再每 80ms
  // setNow 把整个组件重渲一遍。
  useEffect(() => {
    if (!isRacing) return;
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, [isRacing]);

  const isEnded = state.status === "ended";
  const track = getTrack(state.currentTrackId);
  const containerCls =
    variant === "embedded"
      ? "rounded-[16px] bg-white"
      : "min-h-screen bg-[color:var(--bg-app)]";

  const upcomingGate = state.gates[state.upcomingGateIndex];
  const remainingMs = isRacing
    ? Math.max(0, ROUND_DURATION_MS - state.raceTimeMs)
    : ROUND_DURATION_MS;
  const isBoosting = isRacing && now < state.speedBoostUntilMs;
  const isPenalty = isRacing && now < state.speedPenaltyUntilMs;

  return (
    <section className={cn("flex flex-col gap-3 p-3", containerCls)}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`天空竞速`)}
          </span>
          {track ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                TRACK_BADGE_TONE[track.badgeColor] ?? "bg-sky-100 text-sky-800",
              )}
            >
              {track.name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-800">
            <Star size={13} />
            ×{state.starShards}
          </span>
          {state.paintTokens > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[12px] font-medium text-violet-800">
              <PaintBucket size={13} />
              ×{state.paintTokens}
            </span>
          ) : null}
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

      {/* 赛道可视化 */}
      <div className="rounded-[12px] border border-sky-200 bg-gradient-to-r from-sky-50 to-violet-50 p-3">
        <div className="flex items-center justify-between text-[12px] text-sky-900">
          <span className="flex items-center gap-1">
            <Timer size={12} />
            {isRacing
              ? formatTime(state.raceTimeMs)
              : isEnded
                ? formatTime(state.raceTimeMs)
                : t(msg`待出发`)}
          </span>
          <span>
            {Math.round(state.trackProgress)}% / {formatRemaining(remainingMs)}
          </span>
        </div>
        <div className="relative mt-2 h-7 overflow-hidden rounded-full bg-white">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-100",
              isPenalty
                ? "bg-rose-300"
                : isBoosting
                  ? "bg-violet-400"
                  : "bg-sky-400",
            )}
            style={{ width: `${(state.trackProgress / TRACK_LENGTH) * 100}%` }}
          />
          {/* 加速门刻度 */}
          {state.gates.map((gate) => {
            const left = (gate.perfectAtProgress / TRACK_LENGTH) * 100;
            const tone =
              gate.resolved === "perfect"
                ? "bg-emerald-500"
                : gate.resolved === "good"
                  ? "bg-emerald-300"
                  : gate.resolved === "missed"
                    ? "bg-rose-300"
                    : "bg-slate-400";
            return (
              <span
                key={gate.index}
                className={cn(
                  "absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full",
                  tone,
                )}
                style={{ left: `calc(${left}% - 1px)` }}
              />
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-sky-900/80">
          <span>
            {t(msg`完美 ${state.hits.perfect} · 稳点 ${state.hits.good} · 失误 ${state.hits.missed}`)}
          </span>
          <span>
            {isBoosting ? t(msg`× 加速中`) : isPenalty ? t(msg`× 减速`) : t(msg`巡航`)}
          </span>
        </div>
      </div>

      {/* boost 按钮 */}
      <button
        type="button"
        onClick={actions.tapBoost}
        disabled={!isRacing}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-[14px] py-4 text-[15px] font-semibold transition-colors",
          isRacing
            ? "bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg shadow-sky-200 hover:from-sky-600 hover:to-violet-600"
            : "bg-[color:var(--bg-app)] text-[color:var(--text-secondary)]",
        )}
      >
        <Zap size={18} />
        {isRacing
          ? upcomingGate
            ? t(msg`点中第 ${upcomingGate.index + 1} 道加速门`)
            : t(msg`已无加速门`)
          : t(msg`等待出发`)}
      </button>

      {/* 控制 */}
      {!isRacing ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={actions.start}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-sky-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-sky-600"
          >
            <Play size={14} />
            {isEnded ? t(msg`再跑一圈`) : t(msg`出发（2 分钟内冲线）`)}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={actions.abandon}
          className="rounded-full border border-rose-200 bg-rose-50 py-1.5 text-[12px] font-medium text-rose-700"
        >
          {t(msg`弃赛`)}
        </button>
      )}

      {/* 赛道选择 */}
      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-[13px] font-medium">
          <span>{t(msg`选择赛道`)}</span>
          <span className="text-[11px] text-[color:var(--text-secondary)]">
            {t(msg`星章 ${state.starShards}`)}
          </span>
        </div>
        <ul className="space-y-2">
          {TRACKS.map((tr) => {
            const unlocked =
              tr.unlockShards === 0 ||
              state.starShards >= tr.unlockShards ||
              tr.id in state.bestLapByTrack;
            const active = tr.id === state.currentTrackId;
            const best = state.bestLapByTrack[tr.id];
            return (
              <li key={tr.id}>
                <button
                  type="button"
                  onClick={() => actions.selectTrack(tr.id)}
                  disabled={!unlocked || isRacing}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-sky-400 bg-sky-50"
                      : "border-[color:var(--border-faint)] bg-white",
                    !unlocked && "opacity-50",
                    isRacing && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium",
                      TRACK_BADGE_TONE[tr.badgeColor] ?? "bg-sky-100 text-sky-800",
                    )}
                  >
                    {tr.totalGates}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--text-primary)]">
                      {tr.name}
                      {tr.isLimited ? (
                        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
                          {t(msg`限时`)}
                        </span>
                      ) : null}
                      {!unlocked ? (
                        <Lock size={11} className="text-[color:var(--text-tertiary)]" />
                      ) : null}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-secondary)]">
                      {tr.blurb}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-[color:var(--text-secondary)]">
                    {best ? (
                      <span className="flex items-center gap-1">
                        <Award size={11} />
                        {(best / 1000).toFixed(1)}s
                      </span>
                    ) : !unlocked ? (
                      t(msg`需要 ${tr.unlockShards} 星章`)
                    ) : (
                      t(msg`未挑战`)
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 结算面板 */}
      {isEnded ? (
        <SummaryCard state={state} onRestart={actions.start} onIdle={actions.backIdle} />
      ) : null}

      {/* 日志 */}
      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)]">
          <span>{t(msg`赛道日志`)}</span>
          <button
            type="button"
            onClick={actions.reset}
            className="flex items-center gap-1 text-[11px] text-[color:var(--text-secondary)]"
            aria-label={t(msg`重置进度`)}
          >
            <RotateCcw size={11} />
            {t(msg`重置`)}
          </button>
        </div>
        <ul className="max-h-44 overflow-y-auto px-3 py-2">
          {state.log.length === 0 ? (
            <li className="py-1 text-[12px] text-[color:var(--text-tertiary)]">
              {t(msg`等待出发…`)}
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

function SummaryCard({
  state,
  onRestart,
  onIdle,
}: {
  state: SkyRallyState;
  onRestart: () => void;
  onIdle: () => void;
}) {
  const track = getTrack(state.currentTrackId);
  const lap = formatTime(state.raceTimeMs);
  const best = track ? state.bestLapByTrack[track.id] : undefined;
  const title =
    state.outcome === "finished"
      ? t(msg`完赛`)
      : state.outcome === "timeout"
        ? t(msg`时间到`)
        : t(msg`弃赛`);
  return (
    <div className="rounded-[12px] border border-sky-200 bg-sky-50 p-3 text-center">
      <p className="text-[13px] font-medium text-sky-900">{title}</p>
      <p className="mt-1 text-[12px] text-sky-900/80">
        {t(
          msg`${track?.name ?? t(msg`赛道`)} · 圈速 ${lap} · 完美 ${state.hits.perfect} / 稳点 ${state.hits.good} / 失误 ${state.hits.missed}`,
        )}
      </p>
      {best !== undefined ? (
        <p className="mt-1 text-[11px] text-sky-900/70">
          {t(msg`最佳圈速 ${formatTime(best)}`)}
        </p>
      ) : null}
      <div className="mt-2 flex justify-center gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full bg-sky-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-sky-600"
        >
          {t(msg`再跑一圈`)}
        </button>
        <button
          type="button"
          onClick={onIdle}
          className="rounded-full border border-[color:var(--border-faint)] px-4 py-1.5 text-[13px] text-[color:var(--text-secondary)]"
        >
          {t(msg`回到选赛道`)}
        </button>
      </div>
    </div>
  );
}
// i18n-ignore-end
