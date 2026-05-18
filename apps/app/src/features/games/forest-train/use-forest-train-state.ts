import { useCallback, useEffect, useReducer, useRef } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  LOG_LIMIT,
  PASSENGER_VISIBLE_MS,
  ROUND_DURATION_MS,
  ROUTES,
  STATION_INTERVAL_MS,
  getPassenger,
  getRoute,
} from "./forest-train-data";

const t = translateRuntimeMessage;

const STORAGE_KEY = "yinjie.forest-train.v1";

export type ForestTrainLogTone = "info" | "success" | "warn";

export type ForestTrainLog = {
  id: string;
  atMs: number;
  text: string;
  tone: ForestTrainLogTone;
};

export type ForestTrainStatus = "idle" | "running" | "ended";

export type ForestTrainState = {
  schemaVersion: 1;
  status: ForestTrainStatus;
  currentRouteId: string;
  stationIndex: number; // 当前正在停靠的站
  nextStationDueAtMs: number; // 列车到下一站的时刻
  passengerVisibleUntilMs: number; // 当前乘客卡过期时间（0 = 无）
  collectedByRoute: Record<string, string[]>; // routeId → 已收集 passengerIds
  totalFragments: number;
  ticketCount: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
  remainingMs: number;
  log: ForestTrainLog[];
  lastTickAtMs: number;
};

type Action =
  | { type: "tick"; nowMs: number }
  | { type: "select-route"; routeId: string; nowMs: number }
  | { type: "start"; nowMs: number }
  | { type: "collect"; nowMs: number }
  | { type: "skip"; nowMs: number }
  | { type: "back-idle" }
  | { type: "reset"; nowMs: number };

let counter = 0;

function nextId(prefix: string, nowMs: number) {
  counter += 1;
  return `${prefix}-${nowMs.toString(36)}-${counter.toString(36)}`;
}

function pushLog(
  state: ForestTrainState,
  text: string,
  tone: ForestTrainLogTone,
  nowMs: number,
) {
  state.log.unshift({ id: nextId("log", nowMs), atMs: nowMs, text, tone });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

function createInitialState(nowMs: number): ForestTrainState {
  return {
    schemaVersion: 1,
    status: "idle",
    currentRouteId: ROUTES[0].id,
    stationIndex: 0,
    nextStationDueAtMs: 0,
    passengerVisibleUntilMs: 0,
    collectedByRoute: {},
    totalFragments: 0,
    ticketCount: 0,
    startedAtMs: null,
    endedAtMs: null,
    remainingMs: ROUND_DURATION_MS,
    log: [],
    lastTickAtMs: nowMs,
  };
}

function isCollected(state: ForestTrainState, passengerId: string): boolean {
  const list = state.collectedByRoute[state.currentRouteId];
  return Boolean(list?.includes(passengerId));
}

function reducer(state: ForestTrainState, action: Action): ForestTrainState {
  if (action.type === "reset") return createInitialState(action.nowMs);
  const next: ForestTrainState = JSON.parse(JSON.stringify(state));
  switch (action.type) {
    case "select-route": {
      if (next.status === "running") return next;
      const route = getRoute(action.routeId);
      if (!route) return next;
      if (route.unlockTickets > 0 && next.ticketCount < route.unlockTickets) {
        pushLog(
          next,
          t(msg`需要 ${route.unlockTickets} 张车票才能开往 ${route.name}。`),
          "warn",
          action.nowMs,
        );
        return next;
      }
      next.currentRouteId = action.routeId;
      return next;
    }
    case "start": {
      const route = getRoute(next.currentRouteId);
      if (!route) return next;
      next.status = "running";
      next.startedAtMs = action.nowMs;
      next.endedAtMs = null;
      next.remainingMs = ROUND_DURATION_MS;
      next.stationIndex = 0;
      next.nextStationDueAtMs = action.nowMs + STATION_INTERVAL_MS;
      // 立即在 0 站点冒一位乘客
      const station = route.stations[0];
      if (station.passengerId && !isCollected(next, station.passengerId)) {
        next.passengerVisibleUntilMs = action.nowMs + PASSENGER_VISIBLE_MS;
        pushLog(
          next,
          t(msg`列车到 ${station.name}，有人在月台等着。`),
          "info",
          action.nowMs,
        );
      } else {
        next.passengerVisibleUntilMs = 0;
        pushLog(
          next,
          t(msg`列车驶离始发站 ${station.name}。`),
          "info",
          action.nowMs,
        );
      }
      next.lastTickAtMs = action.nowMs;
      return next;
    }
    case "tick": {
      if (next.status !== "running") {
        next.lastTickAtMs = action.nowMs;
        return next;
      }
      const elapsed = action.nowMs - (next.startedAtMs ?? action.nowMs);
      next.remainingMs = Math.max(0, ROUND_DURATION_MS - elapsed);

      // 乘客卡过期
      if (
        next.passengerVisibleUntilMs > 0 &&
        action.nowMs >= next.passengerVisibleUntilMs
      ) {
        const route = getRoute(next.currentRouteId);
        const station = route?.stations[next.stationIndex];
        if (station?.passengerId) {
          const p = getPassenger(station.passengerId);
          pushLog(
            next,
            t(msg`${p?.name ?? t(msg`一位乘客`)} 走远了，没赶上拾取。`),
            "warn",
            action.nowMs,
          );
        }
        next.passengerVisibleUntilMs = 0;
      }

      // 到下一站
      if (action.nowMs >= next.nextStationDueAtMs) {
        const route = getRoute(next.currentRouteId);
        if (!route) return next;
        next.stationIndex += 1;
        if (next.stationIndex >= route.stations.length) {
          // 跑完整条线
          next.status = "ended";
          next.endedAtMs = action.nowMs;
          // 收满全线乘客时奖励海边车票
          const passengerStations = route.stations.filter(
            (s) => s.passengerId !== null,
          );
          const collected = next.collectedByRoute[route.id] ?? [];
          if (collected.length >= passengerStations.length) {
            next.ticketCount += 1;
            pushLog(
              next,
              t(
                msg`跑完 ${route.name} 并收齐乘客故事，+1 海边车票。`,
              ),
              "success",
              action.nowMs,
            );
          } else {
            pushLog(
              next,
              t(
                msg`跑完 ${route.name}，本次收集 ${collected.length} 位故事。`,
              ),
              "info",
              action.nowMs,
            );
          }
          next.lastTickAtMs = action.nowMs;
          return next;
        }
        const station = route.stations[next.stationIndex];
        next.nextStationDueAtMs = action.nowMs + STATION_INTERVAL_MS;
        if (
          station.passengerId &&
          !isCollected(next, station.passengerId)
        ) {
          next.passengerVisibleUntilMs = action.nowMs + PASSENGER_VISIBLE_MS;
          pushLog(
            next,
            t(msg`列车进 ${station.name}，月台上有人。`),
            "info",
            action.nowMs,
          );
        } else {
          next.passengerVisibleUntilMs = 0;
          pushLog(
            next,
            station.passengerId
              ? t(msg`${station.name} 又过了一遍，故事已收。`)
              : t(msg`列车经过 ${station.name}（风景站）。`),
            "info",
            action.nowMs,
          );
        }
      }

      // 时间兜底
      if (next.remainingMs <= 0) {
        next.status = "ended";
        next.endedAtMs = action.nowMs;
        pushLog(next, t(msg`时间到，列车收车回库。`), "info", action.nowMs);
      }

      next.lastTickAtMs = action.nowMs;
      return next;
    }
    case "collect": {
      if (next.status !== "running") return next;
      if (next.passengerVisibleUntilMs <= 0) return next;
      if (action.nowMs >= next.passengerVisibleUntilMs) return next;
      const route = getRoute(next.currentRouteId);
      if (!route) return next;
      const station = route.stations[next.stationIndex];
      if (!station?.passengerId) return next;
      if (isCollected(next, station.passengerId)) return next;
      const list = next.collectedByRoute[route.id] ?? [];
      next.collectedByRoute[route.id] = [...list, station.passengerId];
      next.totalFragments += 1;
      next.passengerVisibleUntilMs = 0;
      const p = getPassenger(station.passengerId);
      pushLog(
        next,
        t(msg`拾取 ${p?.name ?? ""}：${p?.fragmentTitle ?? ""}`),
        "success",
        action.nowMs,
      );
      return next;
    }
    case "skip": {
      if (next.status !== "running") return next;
      if (next.passengerVisibleUntilMs > 0) {
        next.passengerVisibleUntilMs = 0;
        pushLog(
          next,
          t(msg`列车不停，乘客继续等下一班。`),
          "info",
          action.nowMs,
        );
      }
      // 跳到下一站时刻
      next.nextStationDueAtMs = action.nowMs;
      return next;
    }
    case "back-idle": {
      next.status = "idle";
      next.startedAtMs = null;
      next.endedAtMs = null;
      next.stationIndex = 0;
      next.passengerVisibleUntilMs = 0;
      next.remainingMs = ROUND_DURATION_MS;
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

function loadState(): ForestTrainState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ForestTrainState;
    if (parsed.schemaVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: ForestTrainState) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function init(): ForestTrainState {
  const now = Date.now();
  const stored = loadState();
  if (!stored) return createInitialState(now);
  if (stored.status === "running") {
    return {
      ...stored,
      status: "idle",
      stationIndex: 0,
      passengerVisibleUntilMs: 0,
      startedAtMs: null,
      endedAtMs: null,
      remainingMs: ROUND_DURATION_MS,
      lastTickAtMs: now,
    };
  }
  return { ...stored, lastTickAtMs: now };
}

export function useForestTrainState() {
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

  // tick reducer 在 idle/ended 也会 cloneState + setState 触发重渲。
  // 只 running 才需要 500ms 推进站台。
  useEffect(() => {
    const id = window.setInterval(() => {
      if (stateRef.current.status !== "running") return;
      dispatch({ type: "tick", nowMs: Date.now() });
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const selectRoute = useCallback(
    (routeId: string) =>
      dispatch({ type: "select-route", routeId, nowMs: Date.now() }),
    [],
  );
  const start = useCallback(
    () => dispatch({ type: "start", nowMs: Date.now() }),
    [],
  );
  const collect = useCallback(
    () => dispatch({ type: "collect", nowMs: Date.now() }),
    [],
  );
  const skip = useCallback(
    () => dispatch({ type: "skip", nowMs: Date.now() }),
    [],
  );
  const backIdle = useCallback(() => dispatch({ type: "back-idle" }), []);
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
    actions: { selectRoute, start, collect, skip, backIdle, reset },
  };
}
// i18n-ignore-end
