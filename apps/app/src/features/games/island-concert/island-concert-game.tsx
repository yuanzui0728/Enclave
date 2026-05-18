import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  Image,
  Music,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import {
  INSTRUMENTS,
  POSTER_THRESHOLD,
  ROUND_DURATION_MS,
  SETLIST_SIZE,
  SONGS,
  STAGE_PROPS,
  STAGE_PROP_LIMIT,
  getInstrument,
  getSong,
  getStageProp,
} from "./island-concert-data";
import { useIslandConcertState } from "./use-island-concert-state";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type IslandConcertGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function IslandConcertGame({
  variant = "fullscreen",
  onExit,
}: IslandConcertGameProps) {
  const { state, actions } = useIslandConcertState();
  const [now, setNow] = useState(() => Date.now());

  const isIdle = state.status === "idle";
  const isPerforming = state.status === "performing";
  const isBetween = state.status === "between";
  const isEnded = state.status === "ended";

  // now 只服务 performing/between 的节拍窗口 / 间歇倒计时——idle/ended 完全用不到，
  // 停在选乐器或结算页就别再 80ms setNow 拽着 React 空转。
  useEffect(() => {
    if (!isPerforming && !isBetween) return;
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, [isPerforming, isBetween]);
  const containerCls =
    variant === "embedded"
      ? "rounded-[16px] bg-white"
      : "min-h-screen bg-[color:var(--bg-app)]";

  const currentSongId = state.setlist[state.currentSongIndex];
  const currentSong = currentSongId ? getSong(currentSongId) : null;
  const beatActiveLeftMs = isPerforming && currentSong
    ? Math.max(0, state.beatLitAtMs + currentSong.windowMs - now)
    : 0;

  return (
    <section className={cn("flex flex-col gap-3 p-3", containerCls)}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`岛屿演唱会`)}
          </span>
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] text-orange-800">
            {isIdle
              ? t(msg`编排中`)
              : isPerforming
                ? t(msg`演出中`)
                : isBetween
                  ? t(msg`间歇`)
                  : t(msg`已结束`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[12px] font-medium text-rose-700">
            <Image size={12} />
            ×{state.posters}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[12px] font-medium text-violet-800">
            <Sparkles size={12} />
            {state.ensemblePoints}
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

      {/* 演出舞台 */}
      <div className="rounded-[12px] border border-orange-200 bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 p-3">
        {isPerforming && currentSong ? (
          <PerformanceStage
            songTitle={currentSong.title}
            beatIndex={state.beatIndex}
            beatTotal={currentSong.beatCount}
            beatActive={!state.beatHandled && beatActiveLeftMs > 0}
            beatLeftPct={(beatActiveLeftMs / currentSong.windowMs) * 100}
            currentScore={state.currentSongScore}
            streak={state.currentSongStreak}
            onTap={actions.tap}
          />
        ) : (
          <div className="text-center">
            <div className="text-[12px] text-orange-900/80">
              {isBetween
                ? t(msg`下一首准备中…`)
                : isEnded
                  ? t(msg`今晚演出结束`)
                  : t(msg`选好乐器、道具与曲目后开演`)}
            </div>
            <div className="mt-2 flex items-center justify-center gap-2 text-[12px] text-orange-900/80">
              <Music size={13} />
              {getInstrument(state.instrumentId)?.name}
              {state.propIds.length > 0 ? (
                <>
                  <span>·</span>
                  {state.propIds.map((pid) => (
                    <span key={pid} className="rounded-full bg-white px-2 py-0.5">
                      {getStageProp(pid)?.emoji} {getStageProp(pid)?.name}
                    </span>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* 控制 */}
      {isIdle ? (
        <button
          type="button"
          onClick={actions.start}
          disabled={state.setlist.length !== SETLIST_SIZE}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium",
            state.setlist.length === SETLIST_SIZE
              ? "bg-orange-500 text-white hover:bg-orange-600"
              : "bg-[color:var(--bg-app)] text-[color:var(--text-secondary)]",
          )}
        >
          <Play size={14} />
          {state.setlist.length === SETLIST_SIZE
            ? t(msg`开演（编排 ${SETLIST_SIZE} 首已完成）`)
            : t(
                msg`再选 ${SETLIST_SIZE - state.setlist.length} 首曲目`,
              )}
        </button>
      ) : isEnded ? (
        <div className="rounded-[12px] border border-orange-200 bg-orange-50 p-3 text-center">
          <p className="text-[13px] font-medium text-orange-900">
            {t(msg`今晚演出结算`)}
          </p>
          <p className="mt-1 text-[12px] text-orange-900/80">
            {t(
              msg`总节奏分 ${state.totalScore} · 单曲达 ${POSTER_THRESHOLD} 分送海报，已收 ${state.posters} 张 · 合奏积分 +${state.ensemblePoints}`,
            )}
          </p>
          <ul className="mt-2 space-y-1">
            {state.songResults.map((result) => {
              const song = getSong(result.songId);
              return (
                <li
                  key={result.songId}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span className="text-orange-900">{song?.title}</span>
                  <span className="text-orange-900/80">
                    {result.score} ({result.perfects}P / {result.hits}H / {result.misses}M)
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex justify-center gap-2">
            <button
              type="button"
              onClick={actions.start}
              className="rounded-full bg-orange-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-orange-600"
            >
              {t(msg`再排一场`)}
            </button>
            <button
              type="button"
              onClick={actions.backIdle}
              className="rounded-full border border-[color:var(--border-faint)] px-4 py-1.5 text-[13px] text-[color:var(--text-secondary)]"
            >
              {t(msg`回到编排`)}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-[12px] bg-orange-50 px-3 py-1.5 text-center text-[12px] text-orange-900">
          {t(
            msg`第 ${state.currentSongIndex + 1} / ${state.setlist.length} 首 · 剩余 ${formatRemaining(state.remainingMs)}`,
          )}
        </div>
      )}

      {/* 编排面板（idle / ended 时可见） */}
      {(isIdle || isEnded) ? (
        <>
          <PickPanel
            title={t(msg`选乐器`)}
            items={INSTRUMENTS.map((i) => ({
              id: i.id,
              name: i.name,
              emoji: i.emoji,
              hint:
                i.scoreBonus > 0
                  ? t(msg`节奏 +${i.scoreBonus}`)
                  : i.blurb,
              active: i.id === state.instrumentId,
            }))}
            onToggle={(id) => actions.selectInstrument(id)}
            single
          />
          <PickPanel
            title={t(msg`舞台道具（最多 ${STAGE_PROP_LIMIT}）`)}
            items={STAGE_PROPS.map((p) => ({
              id: p.id,
              name: p.name,
              emoji: p.emoji,
              hint:
                p.posterBonus > 0
                  ? t(msg`海报 +${p.posterBonus}`)
                  : p.blurb,
              active: state.propIds.includes(p.id),
              disabled:
                !state.propIds.includes(p.id) &&
                state.propIds.length >= STAGE_PROP_LIMIT,
            }))}
            onToggle={(id) => actions.toggleProp(id)}
          />
          <PickPanel
            title={t(msg`编排曲目（${SETLIST_SIZE} 首）`)}
            items={SONGS.map((s) => ({
              id: s.id,
              name: s.title,
              emoji: "🎶",
              hint: t(msg`${s.beatCount} 拍 · ${(s.intervalMs / 1000).toFixed(2)}s/拍`),
              active: state.setlist.includes(s.id),
              disabled:
                !state.setlist.includes(s.id) &&
                state.setlist.length >= SETLIST_SIZE,
              orderIndex: state.setlist.indexOf(s.id),
            }))}
            onToggle={(id) => actions.toggleSong(id)}
          />
        </>
      ) : null}

      {/* 日志 */}
      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)]">
          <span>{t(msg`后台日志`)}</span>
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
              {t(msg`等待开演…`)}
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

function PerformanceStage({
  songTitle,
  beatIndex,
  beatTotal,
  beatActive,
  beatLeftPct,
  currentScore,
  streak,
  onTap,
}: {
  songTitle: string;
  beatIndex: number;
  beatTotal: number;
  beatActive: boolean;
  beatLeftPct: number;
  currentScore: number;
  streak: number;
  onTap: () => void;
}) {
  return (
    <div className="space-y-2 text-center">
      <div className="text-[13px] font-medium text-orange-900">{songTitle}</div>
      <div className="flex items-center justify-between text-[11px] text-orange-900/80">
        <span>
          {t(msg`节拍`)} {beatIndex + 1} / {beatTotal}
        </span>
        <span>
          {t(msg`节奏分 ${currentScore}`)} · {t(msg`连击 ${streak}`)}
        </span>
      </div>
      <button
        type="button"
        onClick={onTap}
        className={cn(
          "relative flex h-24 w-full items-center justify-center rounded-[16px] text-[16px] font-semibold transition-all",
          beatActive
            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200"
            : "bg-white text-[color:var(--text-secondary)]",
        )}
      >
        <Volume2 size={18} className="mr-2" />
        {beatActive ? t(msg`点！`) : t(msg`等节拍亮起再点`)}
        {beatActive ? (
          <span
            className="absolute bottom-2 left-1/2 h-1 w-3/5 -translate-x-1/2 overflow-hidden rounded-full bg-white/30"
          >
            <span
              className="block h-full rounded-full bg-white transition-all duration-75"
              style={{ width: `${beatLeftPct}%` }}
            />
          </span>
        ) : null}
      </button>
    </div>
  );
}

function PickPanel({
  title,
  items,
  onToggle,
  single,
}: {
  title: string;
  items: Array<{
    id: string;
    name: string;
    emoji: string;
    hint: string;
    active: boolean;
    disabled?: boolean;
    orderIndex?: number;
  }>;
  onToggle: (id: string) => void;
  single?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-3">
      <div className="mb-2 text-[13px] font-medium">{title}</div>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onToggle(item.id)}
              disabled={item.disabled}
              className={cn(
                "flex w-full items-center gap-2 rounded-[10px] border px-2 py-2 text-left text-[12px]",
                item.active
                  ? "border-orange-400 bg-orange-50"
                  : "border-[color:var(--border-faint)] bg-white",
                item.disabled && !item.active && "opacity-50",
              )}
            >
              <span className="text-[20px]">{item.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[color:var(--text-primary)]">
                  {item.name}
                  {item.orderIndex !== undefined && item.orderIndex >= 0 ? (
                    <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-800">
                      #{item.orderIndex + 1}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-[color:var(--text-secondary)]">
                  {item.hint}
                </div>
              </div>
              {single && item.active ? (
                <span className="text-[10px] text-orange-700">
                  {t(msg`已选`)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
// i18n-ignore-end
