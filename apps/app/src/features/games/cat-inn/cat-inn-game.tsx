import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import { Heart, Play, RotateCcw, Sparkles, Ticket, X } from "lucide-react";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  FURNITURE,
  GUESTS_PER_ROUND,
  ROOMS,
  SLOTS_PER_ROOM,
  type FurnitureKind,
  type RoomKind,
  getFurnitureSpec,
  getGuestSpec,
  getRoomSpec,
} from "./cat-inn-data";
import { useCatInnState } from "./use-cat-inn-state";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type CatInnGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CatInnGame({ variant = "fullscreen", onExit }: CatInnGameProps) {
  const { state, actions } = useCatInnState();
  const [picker, setPicker] = useState<{ room: RoomKind; slot: number } | null>(null);
  // 注意：以前这里还有一条 1Hz setTick 强制重渲，目的是更新 "剩余时间"——
  // 但 use-cat-inn-state 的 1Hz state tick 本来就会推进 remainingMs 触发重渲，
  // 这条 setTick 是纯空转，已删除。

  const isRunning = state.status === "running";
  const isEnded = state.status === "ended";
  const containerCls =
    variant === "embedded"
      ? "rounded-[16px] bg-white"
      : "min-h-screen bg-[color:var(--bg-app)]";

  const currentGuest =
    isRunning && state.upcomingGuestIds[0]
      ? getGuestSpec(state.upcomingGuestIds[0]) ?? null
      : null;

  return (
    <section className={cn("flex flex-col gap-3 p-3", containerCls)}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`猫咖旅馆`)}
          </span>
          {isRunning ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
              {t(msg`第 ${state.servedOutcomes.length + 1} / ${GUESTS_PER_ROUND} 位`)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[12px] font-medium text-rose-700">
            <Heart size={12} />
            {state.affection}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-800">
            <Ticket size={12} />
            ×{state.springTickets}
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

      {/* 当前客人 */}
      {currentGuest ? (
        <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-3">
            <span className="text-[28px] leading-none">{currentGuest.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-amber-900">
                {currentGuest.name}
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] text-amber-800">
                  {t(msg`想去 ${getRoomSpec(currentGuest.preferredRoom).name}`)}
                </span>
              </div>
              <div className="mt-1 text-[12px] leading-[1.5rem] text-amber-900/80">
                {currentGuest.quote}
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-amber-900/80">
                {t(msg`偏爱`)}
                {currentGuest.prefersFurniture.map((kind) => {
                  const f = getFurnitureSpec(kind);
                  return (
                    <span
                      key={kind}
                      className="rounded-full bg-white px-1.5 py-0.5"
                    >
                      {f.emoji} {f.name}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={actions.skip}
              className="rounded-full border border-[color:var(--border-faint)] px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)]"
            >
              {t(msg`婉拒`)}
            </button>
            <button
              type="button"
              onClick={actions.welcome}
              className="flex items-center gap-1 rounded-full bg-amber-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-amber-600"
            >
              <Sparkles size={13} />
              {t(msg`迎客入住`)}
            </button>
          </div>
        </div>
      ) : null}

      {/* 房间布置 */}
      <div className="space-y-2">
        {ROOMS.map((roomSpec) => {
          const room = state.rooms.find((r) => r.kind === roomSpec.kind);
          const isPreferred = currentGuest?.preferredRoom === roomSpec.kind;
          if (!room) return null;
          return (
            <div
              key={roomSpec.kind}
              className={cn(
                "rounded-[12px] border bg-white p-3 transition-colors",
                isPreferred
                  ? "border-amber-300 ring-2 ring-amber-100"
                  : "border-[color:var(--border-faint)]",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[20px]">{roomSpec.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                    {roomSpec.name}
                  </div>
                  <div className="text-[11px] text-[color:var(--text-secondary)]">
                    {roomSpec.blurb}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: SLOTS_PER_ROOM }).map((_, slotIndex) => {
                  const placed = room.slots[slotIndex];
                  const placedSpec = placed ? getFurnitureSpec(placed) : null;
                  const isPicker =
                    picker?.room === roomSpec.kind && picker.slot === slotIndex;
                  return (
                    <div key={slotIndex} className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setPicker(
                            isPicker
                              ? null
                              : { room: roomSpec.kind, slot: slotIndex },
                          )
                        }
                        className={cn(
                          "flex w-full items-center gap-2 rounded-[10px] border px-2 py-2 text-left text-[12px] transition-colors",
                          placedSpec
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-dashed border-[color:var(--border-faint)] bg-white",
                          isPicker && "ring-2 ring-amber-200",
                        )}
                      >
                        {placedSpec ? (
                          <>
                            <span className="text-[18px]">{placedSpec.emoji}</span>
                            <span className="text-[color:var(--text-primary)]">
                              {placedSpec.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-[color:var(--text-tertiary)]">
                            {t(msg`空位 · 点这里布置`)}
                          </span>
                        )}
                      </button>
                      {isPicker ? (
                        <div className="absolute z-10 mt-1 w-[260px] rounded-[10px] border border-[color:var(--border-faint)] bg-white p-2 shadow-lg">
                          <div className="mb-1 text-[11px] text-[color:var(--text-secondary)]">
                            {t(msg`选一件家具放进 ${roomSpec.name}`)}
                          </div>
                          <ul className="grid grid-cols-2 gap-1">
                            {FURNITURE.map((f) => {
                              const active = f.kind === placed;
                              return (
                                <li key={f.kind}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      actions.place(
                                        roomSpec.kind,
                                        slotIndex,
                                        active ? null : f.kind,
                                      );
                                      setPicker(null);
                                    }}
                                    className={cn(
                                      "flex w-full items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[12px]",
                                      active
                                        ? "bg-amber-50 text-amber-900"
                                        : "hover:bg-[color:var(--bg-app)]",
                                    )}
                                  >
                                    <span>{f.emoji}</span>
                                    <span className="min-w-0 flex-1 truncate text-left">
                                      {f.name}
                                    </span>
                                    {f.affinity === roomSpec.kind ? (
                                      <span className="text-[10px] text-emerald-600">
                                        {t(msg`匹配`)}
                                      </span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                          <button
                            type="button"
                            onClick={() => {
                              actions.place(roomSpec.kind, slotIndex, null);
                              setPicker(null);
                            }}
                            className="mt-1 w-full rounded-[8px] border border-dashed border-[color:var(--border-faint)] py-1 text-[11px] text-[color:var(--text-secondary)]"
                          >
                            {t(msg`清空这一格`)}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 控制 */}
      {!isRunning ? (
        <button
          type="button"
          onClick={actions.start}
          className="flex items-center justify-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-amber-600"
        >
          <Play size={14} />
          {isEnded ? t(msg`再开一晚`) : t(msg`今晚营业（${GUESTS_PER_ROUND} 位客人）`)}
        </button>
      ) : (
        <div className="rounded-[12px] bg-amber-50 px-3 py-1.5 text-center text-[12px] text-amber-900">
          {t(msg`剩余时间 ${formatRemaining(state.remainingMs)}`)}
        </div>
      )}

      {/* 结算 */}
      {isEnded && state.servedOutcomes.length > 0 ? (
        <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-[13px] font-medium text-amber-900">
            {t(msg`今晚结算`)}
          </p>
          <p className="mt-1 text-[12px] text-amber-900/80">
            {t(
              msg`满意 ${state.servedOutcomes.filter((o) => o.outcome === "happy").length} / 一般 ${state.servedOutcomes.filter((o) => o.outcome === "ok").length} / 离开 ${state.servedOutcomes.filter((o) => o.outcome === "left").length}`,
            )}
          </p>
          <div className="mt-2 flex justify-center gap-2">
            <button
              type="button"
              onClick={actions.start}
              className="rounded-full bg-amber-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-amber-600"
            >
              {t(msg`再开一晚`)}
            </button>
            <button
              type="button"
              onClick={actions.backIdle}
              className="rounded-full border border-[color:var(--border-faint)] px-4 py-1.5 text-[13px] text-[color:var(--text-secondary)]"
            >
              {t(msg`先打烊`)}
            </button>
          </div>
        </div>
      ) : null}

      {/* 日志 */}
      <div className="rounded-[12px] border border-[color:var(--border-faint)] bg-white">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)]">
          <span>{t(msg`旅馆日志`)}</span>
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
// i18n-ignore-end
