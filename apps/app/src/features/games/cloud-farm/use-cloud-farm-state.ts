import { useCallback, useEffect, useReducer, useRef } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  CROPS,
  LOG_LIMIT,
  MAX_WATERINGS,
  NEIGHBOR_HELP_COOLDOWN_MS,
  NEIGHBOR_HELP_REWARD,
  PLOT_COUNT,
  WATER_SPEEDUP_MS,
  WITHER_AFTER_RIPE_MS,
  buildWeeklyOrders,
  getCrop,
  type CropKind,
  type WeeklyOrder,
} from "./cloud-farm-data";

const t = translateRuntimeMessage;

const STORAGE_KEY = "yinjie.cloud-farm.v1";

export type PlotStage = "empty" | "growing" | "ripe" | "withered";

export type Plot = {
  id: number;
  stage: PlotStage;
  crop: CropKind | null;
  plantedAtMs: number;
  ripenAtMs: number; // growing 阶段：成熟时刻
  ripeAtMs: number; // ripe 阶段：到达 ripe 的时刻
  waterCount: number;
};

export type CloudFarmLogTone = "info" | "success" | "warn";

export type CloudFarmLog = {
  id: string;
  atMs: number;
  text: string;
  tone: CloudFarmLogTone;
};

export type CloudFarmState = {
  schemaVersion: 1;
  plots: Plot[];
  coin: number;
  experience: number;
  level: number;
  weeklyOrders: WeeklyOrder[];
  weeklyEpochKey: string;
  totalHarvested: number;
  totalNeighborHelps: number;
  neighborCooldownUntilMs: number;
  log: CloudFarmLog[];
  lastTickAtMs: number;
};

type Action =
  | { type: "tick"; nowMs: number }
  | { type: "plant"; plotId: number; crop: CropKind; nowMs: number }
  | { type: "water"; plotId: number; nowMs: number }
  | { type: "harvest"; plotId: number; nowMs: number }
  | { type: "clean"; plotId: number; nowMs: number }
  | { type: "help-neighbor"; nowMs: number }
  | { type: "reset"; nowMs: number };

let counter = 0;

function nextId(prefix: string, nowMs: number) {
  counter += 1;
  return `${prefix}-${nowMs.toString(36)}-${counter.toString(36)}`;
}

function pushLog(
  state: CloudFarmState,
  text: string,
  tone: CloudFarmLogTone,
  nowMs: number,
) {
  state.log.unshift({ id: nextId("log", nowMs), atMs: nowMs, text, tone });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

function emptyPlot(id: number): Plot {
  return {
    id,
    stage: "empty",
    crop: null,
    plantedAtMs: 0,
    ripenAtMs: 0,
    ripeAtMs: 0,
    waterCount: 0,
  };
}

function weekKey(nowMs: number) {
  const d = new Date(nowMs);
  const start = new Date(d.getFullYear(), 0, 1).getTime();
  const week = Math.floor((nowMs - start) / (7 * 24 * 60 * 60 * 1000));
  return `${d.getFullYear()}-w${week}`;
}

function createInitialState(nowMs: number): CloudFarmState {
  return {
    schemaVersion: 1,
    plots: Array.from({ length: PLOT_COUNT }, (_, i) => emptyPlot(i)),
    coin: 200,
    experience: 0,
    level: 1,
    weeklyOrders: buildWeeklyOrders(),
    weeklyEpochKey: weekKey(nowMs),
    totalHarvested: 0,
    totalNeighborHelps: 0,
    neighborCooldownUntilMs: 0,
    log: [],
    lastTickAtMs: nowMs,
  };
}

function ensureWeekly(state: CloudFarmState, nowMs: number) {
  const cur = weekKey(nowMs);
  if (cur !== state.weeklyEpochKey) {
    state.weeklyEpochKey = cur;
    state.weeklyOrders = buildWeeklyOrders();
  }
}

function bumpWeekly(
  state: CloudFarmState,
  kind: WeeklyOrder["kind"],
  nowMs: number,
  amount = 1,
) {
  for (const order of state.weeklyOrders) {
    if (order.completed) continue;
    if (order.kind !== "any" && order.kind !== kind) continue;
    order.done = Math.min(order.target, order.done + amount);
    if (order.done >= order.target) {
      order.completed = true;
      state.coin += order.reward;
      pushLog(
        state,
        t(msg`周任务完成：${order.label}（+${order.reward} 花圃币）`),
        "success",
        nowMs,
      );
    }
  }
}

function levelUpIfNeeded(state: CloudFarmState, nowMs: number) {
  const needed = state.level * 30;
  if (state.experience >= needed) {
    state.experience -= needed;
    state.level += 1;
    pushLog(
      state,
      t(msg`农场升到 ${state.level} 级。`),
      "success",
      nowMs,
    );
  }
}

function reducer(state: CloudFarmState, action: Action): CloudFarmState {
  if (action.type === "reset") return createInitialState(action.nowMs);
  const next: CloudFarmState = JSON.parse(JSON.stringify(state));
  ensureWeekly(next, action.nowMs);
  switch (action.type) {
    case "tick": {
      for (const plot of next.plots) {
        if (plot.stage === "growing" && action.nowMs >= plot.ripenAtMs) {
          plot.stage = "ripe";
          plot.ripeAtMs = action.nowMs;
          const c = getCrop(plot.crop!);
          pushLog(
            next,
            t(msg`第 ${plot.id + 1} 块地的 ${c.name} 熟了。`),
            "info",
            action.nowMs,
          );
        } else if (
          plot.stage === "ripe" &&
          action.nowMs - plot.ripeAtMs > WITHER_AFTER_RIPE_MS
        ) {
          plot.stage = "withered";
          pushLog(
            next,
            t(msg`第 ${plot.id + 1} 块地没及时收，作物枯萎了。`),
            "warn",
            action.nowMs,
          );
        }
      }
      next.lastTickAtMs = action.nowMs;
      return next;
    }
    case "plant": {
      const plot = next.plots.find((p) => p.id === action.plotId);
      if (!plot) return next;
      if (plot.stage !== "empty") return next;
      const crop = getCrop(action.crop);
      if (next.coin < crop.seedCost) {
        pushLog(
          next,
          t(msg`花圃币不够买 ${crop.name} 种子（${crop.seedCost} 币）`),
          "warn",
          action.nowMs,
        );
        return next;
      }
      next.coin -= crop.seedCost;
      plot.stage = "growing";
      plot.crop = action.crop;
      plot.plantedAtMs = action.nowMs;
      plot.ripenAtMs = action.nowMs + crop.baseGrowMs;
      plot.ripeAtMs = 0;
      plot.waterCount = 0;
      pushLog(
        next,
        t(msg`第 ${plot.id + 1} 块地种下 ${crop.name}。`),
        "info",
        action.nowMs,
      );
      return next;
    }
    case "water": {
      const plot = next.plots.find((p) => p.id === action.plotId);
      if (!plot) return next;
      if (plot.stage !== "growing") return next;
      if (plot.waterCount >= MAX_WATERINGS) {
        pushLog(
          next,
          t(msg`第 ${plot.id + 1} 块地已经浇够了。`),
          "info",
          action.nowMs,
        );
        return next;
      }
      plot.waterCount += 1;
      plot.ripenAtMs = Math.max(action.nowMs, plot.ripenAtMs - WATER_SPEEDUP_MS);
      pushLog(
        next,
        t(msg`第 ${plot.id + 1} 块地浇了水（提早 ${WATER_SPEEDUP_MS / 1000}s）。`),
        "info",
        action.nowMs,
      );
      return next;
    }
    case "harvest": {
      const plot = next.plots.find((p) => p.id === action.plotId);
      if (!plot || plot.stage !== "ripe" || !plot.crop) return next;
      const crop = getCrop(plot.crop);
      next.coin += crop.sellPrice;
      next.experience += crop.experience;
      next.totalHarvested += 1;
      bumpWeekly(next, plot.crop, action.nowMs);
      bumpWeekly(next, "any", action.nowMs);
      pushLog(
        next,
        t(
          msg`第 ${plot.id + 1} 块地收 ${crop.name}：+${crop.sellPrice} 花圃币 / +${crop.experience} 经验`,
        ),
        "success",
        action.nowMs,
      );
      // 重置为 empty
      plot.stage = "empty";
      plot.crop = null;
      plot.plantedAtMs = 0;
      plot.ripenAtMs = 0;
      plot.ripeAtMs = 0;
      plot.waterCount = 0;
      levelUpIfNeeded(next, action.nowMs);
      return next;
    }
    case "clean": {
      const plot = next.plots.find((p) => p.id === action.plotId);
      if (!plot || plot.stage !== "withered") return next;
      plot.stage = "empty";
      plot.crop = null;
      plot.plantedAtMs = 0;
      plot.ripenAtMs = 0;
      plot.ripeAtMs = 0;
      plot.waterCount = 0;
      pushLog(
        next,
        t(msg`清理了第 ${plot.id + 1} 块地的枯萎作物。`),
        "info",
        action.nowMs,
      );
      return next;
    }
    case "help-neighbor": {
      if (action.nowMs < next.neighborCooldownUntilMs) {
        const left = Math.ceil(
          (next.neighborCooldownUntilMs - action.nowMs) / 1000,
        );
        pushLog(
          next,
          t(msg`互访冷却中，再等 ${left}s。`),
          "info",
          action.nowMs,
        );
        return next;
      }
      next.totalNeighborHelps += 1;
      next.coin += NEIGHBOR_HELP_REWARD;
      next.neighborCooldownUntilMs = action.nowMs + NEIGHBOR_HELP_COOLDOWN_MS;
      bumpWeekly(next, "neighbor", action.nowMs);
      pushLog(
        next,
        t(msg`帮邻居浇了一次水（+${NEIGHBOR_HELP_REWARD} 花圃币）。`),
        "success",
        action.nowMs,
      );
      return next;
    }
  }
  return next;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadState(): CloudFarmState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudFarmState;
    if (parsed.schemaVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: CloudFarmState) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function init(): CloudFarmState {
  const now = Date.now();
  const stored = loadState();
  if (!stored) return createInitialState(now);
  // 离线时间内继续生长（推进 stage）
  ensureWeekly(stored, now);
  for (const plot of stored.plots) {
    if (plot.stage === "growing" && now >= plot.ripenAtMs) {
      plot.stage = "ripe";
      plot.ripeAtMs = plot.ripenAtMs;
    }
    if (plot.stage === "ripe" && now - plot.ripeAtMs > WITHER_AFTER_RIPE_MS) {
      plot.stage = "withered";
    }
  }
  stored.lastTickAtMs = now;
  return stored;
}

export function useCloudFarmState() {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => saveState(state), 500);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [state]);

  // 卸载时刷新最新 state；直接闭包 state + deps [] 会把 disk 回滚到 mount 时的初始 state。
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    return () => saveState(stateRef.current);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      dispatch({ type: "tick", nowMs: Date.now() });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const plant = useCallback(
    (plotId: number, crop: CropKind) =>
      dispatch({ type: "plant", plotId, crop, nowMs: Date.now() }),
    [],
  );
  const water = useCallback(
    (plotId: number) => dispatch({ type: "water", plotId, nowMs: Date.now() }),
    [],
  );
  const harvest = useCallback(
    (plotId: number) => dispatch({ type: "harvest", plotId, nowMs: Date.now() }),
    [],
  );
  const clean = useCallback(
    (plotId: number) => dispatch({ type: "clean", plotId, nowMs: Date.now() }),
    [],
  );
  const helpNeighbor = useCallback(
    () => dispatch({ type: "help-neighbor", nowMs: Date.now() }),
    [],
  );
  const reset = useCallback(() => {
    const storage = getStorage();
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    dispatch({ type: "reset", nowMs: Date.now() });
  }, []);

  return {
    state,
    actions: { plant, water, harvest, clean, helpNeighbor, reset },
  };
}
// i18n-ignore-end
