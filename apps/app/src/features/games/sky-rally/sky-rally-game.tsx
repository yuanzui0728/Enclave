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
  ocean: "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
  violet: "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
  sunset: "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
  forest: "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
  gold: "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
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
      ? "rounded-[var(--radius-md)] bg-[color:var(--surface-card)]"
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
          <span className="text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`天空竞速`)}
          </span>
          {track ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[length:var(--text-eyebrow)] font-medium",
                TRACK_BADGE_TONE[track.badgeColor] ?? "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
              )}
            >
              {track.name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-[color:var(--brand-soft)] px-2 py-1 text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)]">
            <Star size={13} />
            ×{state.starShards}
          </span>
          {state.paintTokens > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-[color:var(--brand-soft)] px-2 py-1 text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)]">
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
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-brand)] bg-gradient-to-r from-[color:var(--brand-soft)] to-[color:var(--brand-soft)] p-3">
        <div className="flex items-center justify-between text-[length:var(--text-caption)] text-[color:var(--brand-primary)]">
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
        <div className="relative mt-2 h-7 overflow-hidden rounded-full bg-[color:var(--surface-card)]">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-100",
              isPenalty
                ? "bg-[color:var(--brand-soft)]"
                : isBoosting
                  ? "bg-[color:var(--brand-primary)]"
                  : "bg-[color:var(--brand-primary)]",
            )}
            style={{ width: `${(state.trackProgress / TRACK_LENGTH) * 100}%` }}
          />
          {/* 加速门刻度 */}
          {state.gates.map((gate) => {
            const left = (gate.perfectAtProgress / TRACK_LENGTH) * 100;
            const tone =
              gate.resolved === "perfect"
                ? "bg-[color:var(--brand-primary)]"
                : gate.resolved === "good"
                  ? "bg-[color:var(--brand-soft)]"
                  : gate.resolved === "missed"
                    ? "bg-[color:var(--brand-soft)]"
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
        <div className="mt-2 flex items-center justify-between text-[length:var(--text-eyebrow)] text-[color:var(--brand-primary)]/80">
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
          "flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] py-4 text-[length:var(--text-base)] font-semibold transition-colors",
          isRacing
            ? "bg-gradient-to-r from-[color:var(--brand-primary)] to-[color:var(--brand-primary)] text-[color:var(--text-on-brand)] shadow-lg shadow-sky-200 hover:from-[color:var(--brand-primary)] hover:to-[color:var(--brand-primary)]"
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
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[color:var(--brand-primary)] px-4 py-2 text-[length:var(--text-caption)] font-medium text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)]"
          >
            <Play size={14} />
            {isEnded ? t(msg`再跑一圈`) : t(msg`出发（2 分钟内冲线）`)}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={actions.abandon}
          className="rounded-full border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] py-1.5 text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)]"
        >
          {t(msg`弃赛`)}
        </button>
      )}

      {/* 赛道选择 */}
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
        <div className="mb-2 flex items-center justify-between text-[length:var(--text-caption)] font-medium">
          <span>{t(msg`选择赛道`)}</span>
          <span className="text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
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
                    "flex w-full items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)]"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)]",
                    !unlocked && "opacity-50",
                    isRacing && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-[length:var(--text-caption)] font-medium",
                      TRACK_BADGE_TONE[tr.badgeColor] ?? "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
                    )}
                  >
                    {tr.totalGates}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
                      {tr.name}
                      {tr.isLimited ? (
                        <span className="rounded-full bg-[color:var(--brand-soft)] px-1.5 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
                          {t(msg`限时`)}
                        </span>
                      ) : null}
                      {!unlocked ? (
                        <Lock size={11} className="text-[color:var(--text-tertiary)]" />
                      ) : null}
                    </div>
                    <div className="text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
                      {tr.blurb}
                    </div>
                  </div>
                  <div className="text-right text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
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
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-3 py-1.5 text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">
          <span>{t(msg`赛道日志`)}</span>
          <button
            type="button"
            onClick={actions.reset}
            className="flex items-center gap-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]"
            aria-label={t(msg`重置进度`)}
          >
            <RotateCcw size={11} />
            {t(msg`重置`)}
          </button>
        </div>
        <ul className="max-h-44 overflow-y-auto px-3 py-2">
          {state.log.length === 0 ? (
            <li className="py-1 text-[length:var(--text-caption)] text-[color:var(--text-tertiary)]">
              {t(msg`等待出发…`)}
            </li>
          ) : (
            state.log.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "py-1 text-[length:var(--text-caption)] leading-[1.5rem]",
                  entry.tone === "success" && "text-[color:var(--brand-primary)]",
                  entry.tone === "warn" && "text-[color:var(--brand-primary)]",
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
    <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] p-3 text-center">
      <p className="text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)]">{title}</p>
      <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--brand-primary)]/80">
        {t(
          msg`${track?.name ?? t(msg`赛道`)} · 圈速 ${lap} · 完美 ${state.hits.perfect} / 稳点 ${state.hits.good} / 失误 ${state.hits.missed}`,
        )}
      </p>
      {best !== undefined ? (
        <p className="mt-1 text-[length:var(--text-eyebrow)] text-[color:var(--brand-primary)]/70">
          {t(msg`最佳圈速 ${formatTime(best)}`)}
        </p>
      ) : null}
      <div className="mt-2 flex justify-center gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full bg-[color:var(--brand-primary)] px-4 py-1.5 text-[length:var(--text-caption)] font-medium text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)]"
        >
          {t(msg`再跑一圈`)}
        </button>
        <button
          type="button"
          onClick={onIdle}
          className="rounded-full border border-[color:var(--border-faint)] px-4 py-1.5 text-[length:var(--text-caption)] text-[color:var(--text-secondary)]"
        >
          {t(msg`回到选赛道`)}
        </button>
      </div>
    </div>
  );
}
// i18n-ignore-end
