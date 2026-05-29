import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  Coins,
  Droplet,
  RotateCcw,
  Sprout,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  CROPS,
  CROP_ORDER,
  MAX_WATERINGS,
  NEIGHBOR_HELP_REWARD,
  WITHER_AFTER_RIPE_MS,
  type CropKind,
  getCrop,
} from "./cloud-farm-data";
import { useCloudFarmState } from "./use-cloud-farm-state";
import type { Plot } from "./use-cloud-farm-state";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type CloudFarmGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

function formatRemaining(ms: number) {
  if (ms <= 0) return t(msg`成熟`);
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function CloudFarmGame({
  variant = "fullscreen",
  onExit,
}: CloudFarmGameProps) {
  const { state, actions } = useCloudFarmState();
  const [picker, setPicker] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const containerCls =
    variant === "embedded"
      ? "rounded-[var(--radius-md)] bg-white"
      : "min-h-screen bg-[color:var(--bg-app)]";
  const completedOrders = state.weeklyOrders.filter((o) => o.completed).length;

  return (
    <section className={cn("flex flex-col gap-3 p-3", containerCls)}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`云上农场`)}
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[length:var(--text-eyebrow)] text-emerald-800">
            Lv.{state.level}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[length:var(--text-caption)] font-medium text-amber-800">
            <Coins size={12} />
            {state.coin}
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

      {/* 经验进度 */}
      <div className="rounded-[var(--radius-sm)] bg-emerald-50 px-3 py-2 text-[length:var(--text-caption)] text-emerald-900">
        <div className="flex items-center justify-between">
          <span>{t(msg`经验 ${state.experience} / ${state.level * 30}`)}</span>
          <span>
            {t(msg`累计收 ${state.totalHarvested} 株 · 互访 ${state.totalNeighborHelps} 次`)}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-emerald-400"
            style={{
              width: `${Math.min(100, (state.experience / (state.level * 30)) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* 田地网格 */}
      <div className="grid grid-cols-5 gap-2">
        {state.plots.map((plot) => (
          <div key={plot.id} className="relative">
            <PlotCard
              plot={plot}
              now={now}
              onClick={() => {
                if (plot.stage === "empty") {
                  setPicker(picker === plot.id ? null : plot.id);
                } else if (plot.stage === "ripe") {
                  actions.harvest(plot.id);
                } else if (plot.stage === "withered") {
                  actions.clean(plot.id);
                } else if (plot.stage === "growing") {
                  actions.water(plot.id);
                }
              }}
            />
            {picker === plot.id ? (
              <div className="absolute z-10 mt-1 w-[200px] rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-white p-2 shadow-lg">
                <div className="mb-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
                  {t(msg`种什么`)}
                </div>
                <ul className="space-y-1">
                  {CROP_ORDER.map((kind) => {
                    const crop = getCrop(kind);
                    const canAfford = state.coin >= crop.seedCost;
                    return (
                      <li key={kind}>
                        <button
                          type="button"
                          disabled={!canAfford}
                          onClick={() => {
                            actions.plant(plot.id, kind);
                            setPicker(null);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-[8px] px-2 py-1.5 text-[length:var(--text-caption)]",
                            canAfford
                              ? "hover:bg-emerald-50"
                              : "cursor-not-allowed opacity-50",
                          )}
                        >
                          <span className="flex items-center gap-1">
                            <span>{crop.emoji}</span>
                            <span className="text-[color:var(--text-primary)]">
                              {crop.name}
                            </span>
                          </span>
                          <span className="text-[10px] text-[color:var(--text-secondary)]">
                            -{crop.seedCost} · +{crop.sellPrice} · {Math.round(crop.baseGrowMs / 1000)}s
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => setPicker(null)}
                  className="mt-1 w-full rounded-[8px] border border-dashed py-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]"
                >
                  {t(msg`取消`)}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* 互访 / 一键 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={actions.helpNeighbor}
          disabled={now < state.neighborCooldownUntilMs}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[length:var(--text-caption)] font-medium",
            now >= state.neighborCooldownUntilMs
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-[color:var(--bg-app)] text-[color:var(--text-secondary)]",
          )}
        >
          <UserPlus size={14} />
          {now < state.neighborCooldownUntilMs
            ? t(
                msg`互访冷却 ${Math.ceil((state.neighborCooldownUntilMs - now) / 1000)}s`,
              )
            : t(msg`帮邻居浇水（+${NEIGHBOR_HELP_REWARD} 币）`)}
        </button>
        <button
          type="button"
          onClick={() => {
            for (const plot of state.plots) {
              if (plot.stage === "ripe") actions.harvest(plot.id);
            }
          }}
          className="rounded-full border border-[color:var(--border-faint)] px-3 py-2 text-[length:var(--text-caption)] text-[color:var(--text-secondary)]"
        >
          {t(msg`一键收菜`)}
        </button>
      </div>

      {/* 周任务 */}
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-[length:var(--text-caption)] font-medium">
          <span>{t(msg`本周联营订单`)}</span>
          <span className="text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
            {completedOrders} / {state.weeklyOrders.length}
          </span>
        </div>
        <ul className="space-y-2">
          {state.weeklyOrders.map((order) => {
            const pct = Math.min(
              100,
              Math.round((order.done / order.target) * 100),
            );
            return (
              <li key={order.id}>
                <div className="flex items-center justify-between text-[length:var(--text-caption)]">
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
                  <span className="ml-2 shrink-0 text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
                    {order.done}/{order.target} · +{order.reward}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-app)]">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 日志 */}
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-white">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-3 py-1.5 text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">
          <span>{t(msg`农场日志`)}</span>
          <button
            type="button"
            onClick={actions.reset}
            className="flex items-center gap-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]"
          >
            <RotateCcw size={11} />
            {t(msg`重置`)}
          </button>
        </div>
        <ul className="max-h-44 overflow-y-auto px-3 py-2">
          {state.log.length === 0 ? (
            <li className="py-1 text-[length:var(--text-caption)] text-[color:var(--text-tertiary)]">
              {t(msg`点空地开始种植…`)}
            </li>
          ) : (
            state.log.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "py-1 text-[length:var(--text-caption)] leading-[1.5rem]",
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

function PlotCard({
  plot,
  now,
  onClick,
}: {
  plot: Plot;
  now: number;
  onClick: () => void;
}) {
  const crop = plot.crop ? getCrop(plot.crop) : null;
  const stage = plot.stage;
  const remainingMs =
    stage === "growing" ? Math.max(0, plot.ripenAtMs - now) : 0;
  const witherInMs =
    stage === "ripe" ? Math.max(0, WITHER_AFTER_RIPE_MS - (now - plot.ripeAtMs)) : 0;
  const emoji =
    stage === "empty"
      ? "·"
      : stage === "growing"
        ? remainingMs > 30 * 1000
          ? crop?.seedlingEmoji
          : crop?.growingEmoji
        : stage === "ripe"
          ? crop?.ripeEmoji
          : crop?.witheredEmoji;
  const stageLabel =
    stage === "empty"
      ? t(msg`空地`)
      : stage === "growing"
        ? formatRemaining(remainingMs)
        : stage === "ripe"
          ? t(msg`可收 ${formatRemaining(witherInMs)}`)
          : t(msg`枯萎`);
  const tone =
    stage === "empty"
      ? "border-dashed border-[color:var(--border-faint)] bg-white"
      : stage === "growing"
        ? "border-emerald-200 bg-emerald-50"
        : stage === "ripe"
          ? "border-amber-300 bg-amber-50 ring-2 ring-amber-200"
          : "border-rose-200 bg-rose-50";
  const actionIcon =
    stage === "empty" ? (
      <Sprout size={11} className="text-emerald-600" />
    ) : stage === "growing" ? (
      <Droplet size={11} className="text-sky-500" />
    ) : stage === "ripe" ? (
      <Coins size={11} className="text-amber-700" />
    ) : (
      <Trash2 size={11} className="text-rose-500" />
    );
  const actionLabel =
    stage === "empty"
      ? t(msg`种`)
      : stage === "growing"
        ? plot.waterCount >= MAX_WATERINGS
          ? t(msg`已浇`)
          : t(msg`浇水 (${plot.waterCount}/${MAX_WATERINGS})`)
        : stage === "ripe"
          ? t(msg`收`)
          : t(msg`清理`);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[100px] flex-col items-center justify-between rounded-[var(--radius-sm)] border p-2 text-[10px] transition-colors",
        tone,
      )}
    >
      <div className="text-[24px] leading-none">{emoji}</div>
      <div className="text-center text-[10px] text-[color:var(--text-secondary)]">
        {stageLabel}
      </div>
      <div className="flex items-center gap-1 text-[10px]">
        {actionIcon}
        <span className="text-[color:var(--text-primary)]">{actionLabel}</span>
      </div>
    </button>
  );
}
// i18n-ignore-end
