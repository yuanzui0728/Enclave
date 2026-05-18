import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  cloneState,
  createInitialState,
  exitToIdle,
  respondToEvent,
  selectSquad,
  startRound,
  tick,
  applySyncSkill,
} from "./signal-squad-engine";
import {
  loadSignalSquadState,
  resetSignalSquadState,
  saveSignalSquadState,
} from "./signal-squad-storage";
import type { SignalSquadState } from "./signal-squad-types";

type Action =
  | { type: "tick"; nowMs: number }
  | { type: "start"; nowMs: number }
  | { type: "select-squad"; ids: string[] }
  | { type: "respond"; squadmateId: string; nowMs: number }
  | { type: "use-sync"; nowMs: number }
  | { type: "exit"; nowMs: number }
  | { type: "reset"; nowMs: number };

function reducer(state: SignalSquadState, action: Action): SignalSquadState {
  if (action.type === "reset") {
    return createInitialState(action.nowMs);
  }
  const next = cloneState(state);
  switch (action.type) {
    case "tick":
      return tick(next, action.nowMs);
    case "start":
      return startRound(next, action.nowMs);
    case "select-squad":
      return selectSquad(next, action.ids);
    case "respond":
      return respondToEvent(next, action.squadmateId, action.nowMs);
    case "use-sync":
      return applySyncSkill(next, action.nowMs);
    case "exit":
      return exitToIdle(next, action.nowMs);
  }
  return next;
}

function init(): SignalSquadState {
  const now = Date.now();
  const stored = loadSignalSquadState();
  if (!stored) return createInitialState(now);
  // 进入页面时不沿用上局进行中的状态，回到 idle 但保留赛季积分 / 徽章 / 选中阵容
  if (stored.status === "running") {
    return {
      ...stored,
      status: "idle",
      activeEventId: null,
      events: [],
      startedAtMs: null,
      endedAtMs: null,
      lastTickAtMs: now,
    };
  }
  return { ...stored, lastTickAtMs: now };
}

export function useSignalSquadState() {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => saveSignalSquadState(state), 500);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [state]);

  // 卸载时把最新 state 刷盘。原来直接闭包了 `state`，但 deps 是 []，
  // 闭包永远停在 mount 时的初始 state；切换 / 退出游戏会把 disk 回滚到
  // 进入页面那一刻的 state，丢失本轮所有进度。用 ref 把最新 state 暴露给
  // cleanup。
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    return () => {
      saveSignalSquadState(stateRef.current);
    };
  }, []);

  // idle / victory / defeat / timeout 时 reducer 仍会 cloneState 深拷贝 + re-render，
  // 但实际没有事件推进；停在阵容选择 / 结算页就是纯空转。只 running 才 tick。
  useEffect(() => {
    const id = window.setInterval(() => {
      if (stateRef.current.status !== "running") return;
      dispatch({ type: "tick", nowMs: Date.now() });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const start = useCallback(
    () => dispatch({ type: "start", nowMs: Date.now() }),
    [],
  );
  const selectSquadAction = useCallback(
    (ids: string[]) => dispatch({ type: "select-squad", ids }),
    [],
  );
  const respond = useCallback(
    (squadmateId: string) =>
      dispatch({ type: "respond", squadmateId, nowMs: Date.now() }),
    [],
  );
  const useSync = useCallback(
    () => dispatch({ type: "use-sync", nowMs: Date.now() }),
    [],
  );
  const exitRound = useCallback(
    () => dispatch({ type: "exit", nowMs: Date.now() }),
    [],
  );
  const reset = useCallback(() => {
    resetSignalSquadState();
    dispatch({ type: "reset", nowMs: Date.now() });
  }, []);

  return {
    state,
    actions: {
      start,
      selectSquad: selectSquadAction,
      respond,
      useSync,
      exitRound,
      reset,
    },
  };
}
