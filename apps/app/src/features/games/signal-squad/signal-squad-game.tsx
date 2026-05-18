import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  Activity,
  Award,
  ChevronRight,
  Heart,
  Play,
  RotateCcw,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  ROUND_DURATION_MS,
  SELECTED_SQUAD_SIZE,
  SKILL_EMOJI,
  SKILL_LABEL,
  SQUADMATE_POOL,
  SYNC_SKILL_COOLDOWN_MS,
  TOWER_VICTORY,
  getSquadmate,
} from "./signal-squad-data";
import { useSignalSquadState } from "./use-signal-squad-state";
import type { SignalEvent, SignalSquadState } from "./signal-squad-types";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type SignalSquadGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatCooldown(state: SignalSquadState, nowMs: number) {
  const left = Math.max(0, state.syncSkillReadyAtMs - nowMs);
  if (left <= 0) return t(msg`就绪`);
  return t(msg`${Math.ceil(left / 1000)} 秒`);
}

function activeEvent(state: SignalSquadState): SignalEvent | null {
  if (!state.activeEventId) return null;
  return state.events.find((evt) => evt.id === state.activeEventId) ?? null;
}

export function SignalSquadGame({ variant = "fullscreen", onExit }: SignalSquadGameProps) {
  const { state, actions } = useSignalSquadState();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const event = activeEvent(state);
  const isRunning = state.status === "running";

  // 让倒计时 / 冷却显示流畅地刷新——只有 running 才需要这条 200ms 时钟，
  // idle / victory / defeat / timeout 都不展示任何 now-相关 UI，省下空转重渲。
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const isEnded =
    state.status === "victory" ||
    state.status === "defeat" ||
    state.status === "timeout";
  const towerPct = Math.min(100, Math.round((state.tower / TOWER_VICTORY) * 100));
  const eventCountdown = event
    ? Math.max(0, event.expiresAtMs - now)
    : 0;
  const eventTotal = event ? event.expiresAtMs - event.spawnedAtMs : 1;
  const syncReady = isRunning && now >= state.syncSkillReadyAtMs;

  const containerCls =
    variant === "embedded"
      ? "rounded-[16px] bg-white"
      : "min-h-screen bg-[color:var(--bg-app)]";

  return (
    <section className={cn("flex flex-col gap-3 p-3", containerCls)}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`信号小队`)}
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {t(msg`3 分钟一局`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChooserOpen((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-[color:var(--border-faint)] px-2.5 py-1 text-[12px] text-[color:var(--text-secondary)]"
          >
            <Users size={13} />
            {t(msg`阵容`)}
          </button>
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

      <div className="rounded-[14px] bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-3">
        <div className="flex items-end justify-between text-[12px] text-emerald-900/80">
          <span>{t(msg`信号塔压制`)}</span>
          <span>
            {towerPct}% / {formatRemaining(state.remainingMs)}
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-200"
            style={{ width: `${towerPct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-900/70">
          <span>
            {t(msg`徽章 ${state.badgePoints} · 团队积分 ${state.teamScore}`)}
          </span>
          <span>
            {t(msg`协同压制 ×${state.syncSkillUses}`)}
          </span>
        </div>
      </div>

      {/* 队员卡片 */}
      <div className="grid grid-cols-3 gap-2">
        {state.squad.map((mate) => {
          const def = getSquadmate(mate.id);
          if (!def) return null;
          const matched = event?.matchedBy.includes(mate.id);
          const busy = mate.busyUntilMs > now;
          const dead = mate.hp <= 0;
          return (
            <button
              type="button"
              key={mate.id}
              disabled={!isRunning || busy || dead}
              onClick={() => actions.respond(mate.id)}
              className={cn(
                "flex flex-col items-center rounded-[12px] border bg-white p-2 text-[12px] transition-all",
                matched
                  ? "border-emerald-500 ring-2 ring-emerald-200"
                  : "border-[color:var(--border-faint)]",
                dead && "opacity-50",
                busy && "opacity-70",
              )}
            >
              <div className="text-[28px] leading-none">{def.emoji}</div>
              <div className="mt-1 font-medium text-[color:var(--text-primary)]">
                {def.name}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[color:var(--text-secondary)]">
                <span>{SKILL_EMOJI[def.skill]}</span>
                <span>{SKILL_LABEL[def.skill]}</span>
              </div>
              <div className="mt-1.5 flex w-full items-center gap-1">
                <Heart size={10} className="text-rose-500" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rose-100">
                  <div
                    className="h-full bg-rose-400"
                    style={{ width: `${(mate.hp / def.maxHp) * 100}%` }}
                  />
                </div>
              </div>
              <div className="mt-1 flex w-full items-center gap-1">
                <Activity size={10} className="text-sky-500" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sky-100">
                  <div
                    className="h-full bg-sky-400"
                    style={{ width: `${(mate.morale / def.maxMorale) * 100}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 当前事件 / 开始按钮 */}
      {isRunning && event ? (
        <EventCard event={event} totalMs={eventTotal} remainingMs={eventCountdown} />
      ) : null}

      {!isRunning ? (
        <div className="rounded-[12px] border border-dashed border-[color:var(--border-faint)] bg-white px-3 py-6 text-center">
          {state.status === "idle" ? (
            <>
              <p className="text-[13px] text-[color:var(--text-secondary)]">
                {t(msg`本局目标：完成两次协同压制并稳住终点信号塔。`)}
              </p>
              <button
                type="button"
                onClick={actions.start}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-600"
              >
                <Play size={14} />
                {t(msg`开始本局`)}
              </button>
            </>
          ) : (
            <SummaryCard state={state} onRestart={actions.start} onIdle={actions.exitRound} />
          )}
        </div>
      ) : null}

      {/* 协同压制技能 */}
      {isRunning ? (
        <button
          type="button"
          onClick={actions.useSync}
          disabled={!syncReady}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
            syncReady
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-[color:var(--bg-app)] text-[color:var(--text-secondary)]",
          )}
        >
          <Zap size={14} />
          {syncReady
            ? t(msg`释放协同压制（+${18}% 信号塔）`)
            : t(msg`协同压制冷却中：${formatCooldown(state, now)}`)}
        </button>
      ) : null}

      {/* 阵容选择 */}
      {chooserOpen ? (
        <SquadChooser
          selected={state.selectedSquadIds}
          onSelect={(ids) => {
            actions.selectSquad(ids);
            setChooserOpen(false);
          }}
          onClose={() => setChooserOpen(false)}
          disabled={isRunning}
        />
      ) : null}

      {/* 日志 */}
      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)]">
          <span>{t(msg`本局信号日志`)}</span>
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
              {t(msg`等待小队就位…`)}
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

function EventCard({
  event,
  totalMs,
  remainingMs,
}: {
  event: SignalEvent;
  totalMs: number;
  remainingMs: number;
}) {
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const title =
    event.kind === "enemy"
      ? t(msg`敌方信号入侵`)
      : event.kind === "sync"
        ? t(msg`协同窗口已开启`)
        : t(msg`补给信号到货`);
  const hint =
    event.kind === "enemy"
      ? t(msg`点击 ${SKILL_LABEL[event.needSkill ?? "scout"]} 队员压制`)
      : event.kind === "sync"
        ? t(msg`连点两位队员锁定（已点 ${event.matchedBy.length}/2）`)
        : t(msg`点击任意队员领取补给`);
  const tone =
    event.kind === "enemy"
      ? "border-amber-200 bg-amber-50"
      : event.kind === "sync"
        ? "border-emerald-200 bg-emerald-50"
        : "border-sky-200 bg-sky-50";
  return (
    <div className={cn("rounded-[12px] border p-3", tone)}>
      <div className="flex items-center justify-between text-[13px] font-medium">
        <span>{title}</span>
        <span className="text-[11px] text-[color:var(--text-secondary)]">
          {Math.ceil(remainingMs / 1000)}s
        </span>
      </div>
      <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">{hint}</div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-current opacity-60 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  state,
  onRestart,
  onIdle,
}: {
  state: SignalSquadState;
  onRestart: () => void;
  onIdle: () => void;
}) {
  const tower = Math.round(state.tower);
  const titleByStatus: Record<string, string> = {
    victory: t(msg`信号塔已稳`),
    timeout: t(msg`时间到`),
    defeat: t(msg`小队失守`),
    idle: t(msg`等待开始`),
  };
  return (
    <div className="space-y-2">
      <p className="text-[14px] font-medium text-[color:var(--text-primary)]">
        {titleByStatus[state.status] ?? t(msg`本局结束`)}
      </p>
      <p className="text-[12px] text-[color:var(--text-secondary)]">
        {t(
          msg`本局完成度 ${tower}% · 响应 ${state.resolvedCount} / 错过 ${state.missedCount} · 协同压制 ×${state.syncSkillUses}`,
        )}
      </p>
      <p className="flex items-center justify-center gap-2 text-[12px] text-emerald-700">
        <Award size={13} />
        {t(msg`赛季徽章 ${state.badgePoints} · 团队积分 ${state.teamScore}`)}
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full bg-emerald-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-600"
        >
          {t(msg`再来一局`)}
        </button>
        <button
          type="button"
          onClick={onIdle}
          className="rounded-full border border-[color:var(--border-faint)] px-4 py-1.5 text-[13px] text-[color:var(--text-secondary)]"
        >
          {t(msg`返回选阵`)}
        </button>
      </div>
    </div>
  );
}

function SquadChooser({
  selected,
  onSelect,
  onClose,
  disabled,
}: {
  selected: string[];
  onSelect: (ids: string[]) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<string[]>(selected);

  function toggle(id: string) {
    setDraft((current) => {
      if (current.includes(id)) {
        return current.filter((entry) => entry !== id);
      }
      if (current.length >= SELECTED_SQUAD_SIZE) {
        return [...current.slice(1), id];
      }
      return [...current, id];
    });
  }

  return (
    <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between text-[13px] font-medium">
        <span>{t(msg`选择 3 位队员`)}</span>
        {disabled ? (
          <span className="text-[11px] text-[color:var(--text-tertiary)]">
            {t(msg`本局结束后再调整`)}
          </span>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {SQUADMATE_POOL.map((mate) => {
          const active = draft.includes(mate.id);
          return (
            <li key={mate.id}>
              <button
                type="button"
                onClick={() => toggle(mate.id)}
                disabled={disabled}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[10px] border px-2 py-2 text-left text-[12px]",
                  active
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-[color:var(--border-faint)] bg-white",
                  disabled && "opacity-60",
                )}
              >
                <span className="text-[20px]">{mate.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-[color:var(--text-primary)]">
                      {mate.name}
                    </span>
                    <span className="text-[10px] text-[color:var(--text-secondary)]">
                      {SKILL_EMOJI[mate.skill]} {SKILL_LABEL[mate.skill]}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-[color:var(--text-secondary)]">
                    {mate.blurb}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[color:var(--border-faint)] px-3 py-1 text-[12px] text-[color:var(--text-secondary)]"
        >
          {t(msg`取消`)}
        </button>
        <button
          type="button"
          disabled={disabled || draft.length !== SELECTED_SQUAD_SIZE}
          onClick={() => onSelect(draft)}
          className={cn(
            "flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium",
            !disabled && draft.length === SELECTED_SQUAD_SIZE
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-[color:var(--bg-app)] text-[color:var(--text-secondary)]",
          )}
        >
          {t(msg`确定阵容`)}
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
// i18n-ignore-end
