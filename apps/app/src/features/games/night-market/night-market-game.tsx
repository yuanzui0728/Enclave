import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  ChevronUp,
  Clock,
  Coins,
  Play,
  RotateCcw,
  Ticket,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  HOUR_END,
  MAX_LEVEL,
  STALL_KIND_LABEL,
  STALL_KIND_ORDER,
  attractAtLevel,
  getStallSpec,
  incomePerCustomerAtLevel,
  upgradeCost,
} from "./night-market-data";
import { useNightMarketState } from "./use-night-market-state";
import type { NightMarketState, Stall, StallKind } from "./night-market-types";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type NightMarketGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatHour(hour: number) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const display = h >= 24 ? h - 24 : h;
  return `${display.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function NightMarketGame({
  variant = "fullscreen",
  onExit,
}: NightMarketGameProps) {
  const { state, actions } = useNightMarketState();
  const [now, setNow] = useState(() => Date.now());

  const isRunning = state.status === "running";
  const isEnded = state.status === "ended";

  // now 服务客流 / 升级冷却倒计时——只有 running 才需要，idle/ended 别再 400ms 重渲。
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(id);
  }, [isRunning]);
  const containerCls =
    variant === "embedded"
      ? "rounded-[16px] bg-white"
      : "min-h-screen bg-[color:var(--bg-app)]";

  const totalPending = state.stalls.reduce(
    (acc, stall) => acc + stall.pendingIncome,
    0,
  );
  const completedOrders = state.weeklyOrders.filter((o) => o.completed).length;

  return (
    <section className={cn("flex flex-col gap-3 p-3", containerCls)}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`夜市合伙人`)}
          </span>
          {state.isWeekendBoost ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              {t(msg`周末双倍`)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-800">
            <Coins size={13} />
            {state.coupon}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[12px] font-medium text-rose-700">
            <Ticket size={13} />
            ×{state.permitTickets}
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

      {/* 时段 / 倒计时 */}
      <div className="flex items-center justify-between rounded-[12px] bg-gradient-to-r from-amber-50 to-rose-50 px-3 py-2 text-[12px] text-amber-900">
        <span className="flex items-center gap-1">
          <Clock size={13} />
          {t(msg`营业时段`)} {formatHour(state.hour)}
          {state.hour >= HOUR_END - 1
            ? ` · ${t(msg`收摊冲刺`)}`
            : ""}
        </span>
        {isRunning ? (
          <span>{formatRemaining(state.remainingMs)}</span>
        ) : (
          <span>{t(msg`未开张`)}</span>
        )}
      </div>

      {/* 摊位卡片 */}
      <div className="grid grid-cols-2 gap-2">
        {state.stalls.map((stall) => (
          <StallCard
            key={stall.id}
            stall={stall}
            running={isRunning}
            coupon={state.coupon}
            onCollect={() => actions.collect(stall.kind)}
            onUpgrade={() => actions.upgrade(stall.kind)}
          />
        ))}
      </div>

      {/* 控制条 */}
      <div className="flex flex-wrap items-center gap-2">
        {!isRunning ? (
          <button
            type="button"
            onClick={actions.start}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-amber-600"
          >
            <Play size={14} />
            {isEnded ? t(msg`再开一轮`) : t(msg`开张营业（8 分钟）`)}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={actions.collectAll}
              disabled={totalPending === 0}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
                totalPending > 0
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-[color:var(--bg-app)] text-[color:var(--text-secondary)]",
              )}
            >
              <Coins size={14} />
              {t(msg`一键收银（+${totalPending}）`)}
            </button>
            <button
              type="button"
              onClick={actions.endEarly}
              className="rounded-full border border-[color:var(--border-faint)] px-3 py-2 text-[12px] text-[color:var(--text-secondary)]"
            >
              {t(msg`提前收摊`)}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={actions.visitFriend}
          className="flex items-center gap-1 rounded-full border border-[color:var(--border-faint)] px-3 py-2 text-[12px] text-[color:var(--text-secondary)]"
        >
          <UserPlus size={13} />
          {t(msg`互访好友`)}
        </button>
        {state.permitTickets > 0 ? (
          <button
            type="button"
            onClick={actions.usePermit}
            className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700"
          >
            <Ticket size={13} />
            {t(msg`用许可升级`)}
          </button>
        ) : null}
      </div>

      {/* 周任务 */}
      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <span className="font-medium text-[color:var(--text-primary)]">
            {t(msg`本周任务`)}
          </span>
          <span className="text-[11px] text-[color:var(--text-secondary)]">
            {t(msg`完成 ${completedOrders} / ${state.weeklyOrders.length}`)}
          </span>
        </div>
        <ul className="space-y-2">
          {state.weeklyOrders.map((order) => {
            const pct = Math.min(
              100,
              Math.round((order.doneCount / order.targetCount) * 100),
            );
            return (
              <li key={order.id}>
                <div className="flex items-center justify-between text-[12px]">
                  <span
                    className={cn(
                      "truncate",
                      order.completed
                        ? "text-emerald-700 line-through"
                        : "text-[color:var(--text-primary)]",
                    )}
                  >
                    {order.label}
                  </span>
                  <span className="ml-2 shrink-0 text-[11px] text-[color:var(--text-secondary)]">
                    {order.doneCount}/{order.targetCount}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-app)]">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
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
          <span>{t(msg`营业日志`)}</span>
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
              {t(msg`等待开张…`)}
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

function StallCard({
  stall,
  running,
  coupon,
  onCollect,
  onUpgrade,
}: {
  stall: Stall;
  running: boolean;
  coupon: number;
  onCollect: () => void;
  onUpgrade: () => void;
}) {
  const spec = getStallSpec(stall.kind);
  const upgradeable = stall.level < MAX_LEVEL;
  const cost = upgradeable ? upgradeCost(spec, stall.level) : 0;
  const canUpgrade = upgradeable && coupon >= cost;
  const attractCap = attractAtLevel(spec, stall.level);
  const perCustomer = incomePerCustomerAtLevel(spec, stall.level);
  const hasPending = stall.pendingCustomers > 0;

  return (
    <div
      className={cn(
        "flex flex-col rounded-[12px] border bg-white p-2.5 transition-colors",
        hasPending
          ? "border-amber-300 ring-2 ring-amber-100"
          : "border-[color:var(--border-faint)]",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[28px]">{spec.emoji}</span>
          <div>
            <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
              {spec.name}
            </div>
            <div className="text-[11px] text-[color:var(--text-secondary)]">
              {STALL_KIND_LABEL[stall.kind]} · Lv.{stall.level}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-[color:var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <Users size={11} />
          {t(msg`吸客 ≤${attractCap}`)}
        </span>
        <span className="flex items-center gap-1">
          <Coins size={11} />
          {t(msg`单客 +${perCustomer}`)}
        </span>
      </div>
      <button
        type="button"
        onClick={onCollect}
        disabled={!running || !hasPending}
        className={cn(
          "mt-2 rounded-full px-2 py-1.5 text-[12px] font-medium transition-colors",
          hasPending
            ? "bg-amber-500 text-white hover:bg-amber-600"
            : "bg-[color:var(--bg-app)] text-[color:var(--text-secondary)]",
        )}
      >
        {hasPending
          ? t(msg`收银 ${stall.pendingCustomers} 位 (+${stall.pendingIncome})`)
          : t(msg`等顾客上门`)}
      </button>
      <button
        type="button"
        onClick={onUpgrade}
        disabled={!upgradeable || !canUpgrade}
        className={cn(
          "mt-1.5 flex items-center justify-center gap-1 rounded-full border px-2 py-1 text-[11px]",
          canUpgrade
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)]",
        )}
      >
        <ChevronUp size={11} />
        {!upgradeable
          ? t(msg`已满级`)
          : t(msg`升级 ${cost} 券`)}
      </button>
    </div>
  );
}

function SummaryCard({
  state,
  onRestart,
  onIdle,
}: {
  state: NightMarketState;
  onRestart: () => void;
  onIdle: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-center">
      <p className="text-[13px] font-medium text-amber-900">
        {t(msg`今夜营业结算`)}
      </p>
      <p className="mt-1 text-[12px] text-amber-900/80">
        {t(
          msg`${state.totalCustomersThisRound} 位顾客 · +${state.totalIncomeThisRound} 夜市券 · 当前许可 ${state.permitTickets} 张`,
        )}
      </p>
      <div className="mt-2 flex justify-center gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full bg-amber-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-amber-600"
        >
          {t(msg`再开一轮`)}
        </button>
        <button
          type="button"
          onClick={onIdle}
          className="rounded-full border border-[color:var(--border-faint)] px-4 py-1.5 text-[13px] text-[color:var(--text-secondary)]"
        >
          {t(msg`先打烊`)}
        </button>
      </div>
    </div>
  );
}
// i18n-ignore-end
