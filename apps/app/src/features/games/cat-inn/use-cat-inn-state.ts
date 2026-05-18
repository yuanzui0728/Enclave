import { useCallback, useEffect, useReducer, useRef } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  FURNITURE,
  GUEST_POOL,
  GUESTS_PER_ROUND,
  LOG_LIMIT,
  ROOMS,
  ROUND_DURATION_MS,
  SLOTS_PER_ROOM,
  type FurnitureKind,
  type GuestSpec,
  type RoomKind,
  getFurnitureSpec,
  getGuestSpec,
  getRoomSpec,
} from "./cat-inn-data";

const t = translateRuntimeMessage;

const STORAGE_KEY = "yinjie.cat-inn.v1";

export type CatInnLogTone = "info" | "success" | "warn";

export type CatInnLog = {
  id: string;
  atMs: number;
  text: string;
  tone: CatInnLogTone;
};

export type RoomState = {
  kind: RoomKind;
  slots: (FurnitureKind | null)[];
};

export type GuestOutcome = "happy" | "ok" | "left";

export type CatInnState = {
  schemaVersion: 1;
  status: "idle" | "running" | "ended";
  rooms: RoomState[];
  upcomingGuestIds: string[];
  servedOutcomes: { guestId: string; outcome: GuestOutcome }[];
  remainingMs: number;
  startedAtMs: number | null;
  springTickets: number;
  affection: number;
  log: CatInnLog[];
  lastTickAtMs: number;
};

type Action =
  | { type: "tick"; nowMs: number }
  | { type: "start"; nowMs: number }
  | { type: "place"; roomKind: RoomKind; slotIndex: number; kind: FurnitureKind | null; nowMs: number }
  | { type: "welcome"; nowMs: number }
  | { type: "skip"; nowMs: number }
  | { type: "back-idle" }
  | { type: "reset"; nowMs: number };

let counter = 0;

function nextId(prefix: string, nowMs: number) {
  counter += 1;
  return `${prefix}-${nowMs.toString(36)}-${counter.toString(36)}`;
}

function freshRooms(): RoomState[] {
  return ROOMS.map((room) => ({
    kind: room.kind,
    slots: Array.from({ length: SLOTS_PER_ROOM }, () => null),
  }));
}

function pickGuests(nowMs: number): string[] {
  // 简单洗牌：基于 nowMs seed
  let seed = nowMs | 1;
  const pool = [...GUEST_POOL];
  const picked: string[] = [];
  while (picked.length < GUESTS_PER_ROUND && pool.length > 0) {
    seed = (seed * 1664525 + 1013904223) | 0;
    const idx = Math.abs(seed) % pool.length;
    const [chosen] = pool.splice(idx, 1);
    picked.push(chosen.id);
  }
  return picked;
}

function pushLog(state: CatInnState, text: string, tone: CatInnLogTone, nowMs: number) {
  state.log.unshift({ id: nextId("log", nowMs), atMs: nowMs, text, tone });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

function createInitialState(nowMs: number): CatInnState {
  return {
    schemaVersion: 1,
    status: "idle",
    rooms: freshRooms(),
    upcomingGuestIds: [],
    servedOutcomes: [],
    remainingMs: ROUND_DURATION_MS,
    startedAtMs: null,
    springTickets: 0,
    affection: 0,
    log: [],
    lastTickAtMs: nowMs,
  };
}

function evalGuest(state: CatInnState, guest: GuestSpec): GuestOutcome {
  const room = state.rooms.find((r) => r.kind === guest.preferredRoom);
  if (!room) return "left";
  const presentFurniture = room.slots.filter(
    (s): s is FurnitureKind => s !== null,
  );
  const matchCount = guest.prefersFurniture.filter((kind) =>
    presentFurniture.includes(kind),
  ).length;
  if (matchCount >= 2) return "happy";
  if (matchCount === 1) return "ok";
  return "left";
}

function reducer(state: CatInnState, action: Action): CatInnState {
  if (action.type === "reset") return createInitialState(action.nowMs);
  const next: CatInnState = JSON.parse(JSON.stringify(state));
  switch (action.type) {
    case "tick": {
      if (next.status !== "running") {
        next.lastTickAtMs = action.nowMs;
        return next;
      }
      const elapsed = action.nowMs - (next.startedAtMs ?? action.nowMs);
      next.remainingMs = Math.max(0, ROUND_DURATION_MS - elapsed);
      if (next.remainingMs <= 0) {
        next.status = "ended";
        pushLog(next, t(msg`时间到，今晚就到这里。`), "info", action.nowMs);
      }
      next.lastTickAtMs = action.nowMs;
      return next;
    }
    case "start": {
      next.status = "running";
      next.upcomingGuestIds = pickGuests(action.nowMs);
      next.servedOutcomes = [];
      next.remainingMs = ROUND_DURATION_MS;
      next.startedAtMs = action.nowMs;
      next.lastTickAtMs = action.nowMs;
      pushLog(next, t(msg`今晚旅馆开张，等客人上门。`), "info", action.nowMs);
      return next;
    }
    case "place": {
      const room = next.rooms.find((r) => r.kind === action.roomKind);
      if (!room) return next;
      // 同一件家具同房间不重复放
      if (action.kind !== null) {
        const dup = room.slots.indexOf(action.kind);
        if (dup !== -1 && dup !== action.slotIndex) {
          room.slots[dup] = null;
        }
      }
      room.slots[action.slotIndex] = action.kind;
      return next;
    }
    case "welcome": {
      if (next.status !== "running") return next;
      const currentId = next.upcomingGuestIds[0];
      if (!currentId) return next;
      const guest = getGuestSpec(currentId);
      if (!guest) return next;
      const outcome = evalGuest(next, guest);
      next.servedOutcomes.push({ guestId: currentId, outcome });
      next.upcomingGuestIds = next.upcomingGuestIds.slice(1);
      if (outcome === "happy") {
        next.springTickets += 1;
        next.affection += 6;
        pushLog(
          next,
          t(msg`${guest.name} 非常满意：+1 春季家具票 / +6 好感。`),
          "success",
          action.nowMs,
        );
      } else if (outcome === "ok") {
        next.affection += 3;
        pushLog(
          next,
          t(msg`${guest.name} 还算满意：+3 好感。`),
          "info",
          action.nowMs,
        );
      } else {
        pushLog(
          next,
          t(msg`${guest.name} 没找到想要的角落，离开了。`),
          "warn",
          action.nowMs,
        );
      }
      if (next.upcomingGuestIds.length === 0) {
        next.status = "ended";
        const happy = next.servedOutcomes.filter((o) => o.outcome === "happy").length;
        const ok = next.servedOutcomes.filter((o) => o.outcome === "ok").length;
        const left = next.servedOutcomes.filter((o) => o.outcome === "left").length;
        pushLog(
          next,
          t(
            msg`今晚结束：满意 ${happy} / 一般 ${ok} / 离开 ${left}。`,
          ),
          "success",
          action.nowMs,
        );
      }
      return next;
    }
    case "skip": {
      if (next.status !== "running") return next;
      const currentId = next.upcomingGuestIds[0];
      if (!currentId) return next;
      const guest = getGuestSpec(currentId);
      next.servedOutcomes.push({ guestId: currentId, outcome: "left" });
      next.upcomingGuestIds = next.upcomingGuestIds.slice(1);
      pushLog(
        next,
        t(msg`婉拒了 ${guest?.name ?? t(msg`这位客人`)}，下次再来。`),
        "info",
        action.nowMs,
      );
      if (next.upcomingGuestIds.length === 0) {
        next.status = "ended";
      }
      return next;
    }
    case "back-idle": {
      next.status = "idle";
      next.upcomingGuestIds = [];
      next.servedOutcomes = [];
      next.startedAtMs = null;
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

function loadState(): CatInnState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatInnState;
    if (parsed.schemaVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: CatInnState) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function init(): CatInnState {
  const now = Date.now();
  const stored = loadState();
  if (!stored) return createInitialState(now);
  if (stored.status === "running") {
    return {
      ...stored,
      status: "idle",
      upcomingGuestIds: [],
      servedOutcomes: [],
      startedAtMs: null,
      remainingMs: ROUND_DURATION_MS,
      lastTickAtMs: now,
    };
  }
  return { ...stored, lastTickAtMs: now };
}

export function useCatInnState() {
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
  // 只 running 才需要 1Hz 推进 remainingMs。
  useEffect(() => {
    const id = window.setInterval(() => {
      if (stateRef.current.status !== "running") return;
      dispatch({ type: "tick", nowMs: Date.now() });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const start = useCallback(
    () => dispatch({ type: "start", nowMs: Date.now() }),
    [],
  );
  const place = useCallback(
    (roomKind: RoomKind, slotIndex: number, kind: FurnitureKind | null) =>
      dispatch({ type: "place", roomKind, slotIndex, kind, nowMs: Date.now() }),
    [],
  );
  const welcome = useCallback(
    () => dispatch({ type: "welcome", nowMs: Date.now() }),
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
    actions: { start, place, welcome, skip, backIdle, reset },
  };
}
