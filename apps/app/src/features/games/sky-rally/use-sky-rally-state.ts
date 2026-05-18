import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  abandonRace,
  backToIdle,
  cloneState,
  createInitialState,
  selectTrack,
  startRace,
  tapBoost,
  tick,
} from "./sky-rally-engine";
import {
  loadSkyRallyState,
  resetSkyRallyState,
  saveSkyRallyState,
} from "./sky-rally-storage";
import type { SkyRallyState } from "./sky-rally-types";

type Action =
  | { type: "tick"; nowMs: number }
  | { type: "select-track"; trackId: string; nowMs: number }
  | { type: "start"; nowMs: number }
  | { type: "tap-boost"; nowMs: number }
  | { type: "abandon"; nowMs: number }
  | { type: "back-idle" }
  | { type: "reset"; nowMs: number };

function reducer(state: SkyRallyState, action: Action): SkyRallyState {
  if (action.type === "reset") return createInitialState(action.nowMs);
  const next = cloneState(state);
  switch (action.type) {
    case "tick":
      return tick(next, action.nowMs);
    case "select-track":
      return selectTrack(next, action.trackId, action.nowMs);
    case "start":
      return startRace(next, action.nowMs);
    case "tap-boost":
      return tapBoost(next, action.nowMs);
    case "abandon":
      return abandonRace(next, action.nowMs);
    case "back-idle":
      return backToIdle(next);
  }
  return next;
}

function init(): SkyRallyState {
  const now = Date.now();
  const stored = loadSkyRallyState();
  if (!stored) return createInitialState(now);
  if (stored.status === "racing") {
    // 重新进入：放弃上一局，但保留星章 / 喷漆 / 最佳圈速
    return {
      ...stored,
      status: "idle",
      startedAtMs: null,
      endedAtMs: null,
      outcome: null,
      trackProgress: 0,
      upcomingGateIndex: 0,
      lastTickAtMs: now,
    };
  }
  return { ...stored, lastTickAtMs: now };
}

export function useSkyRallyState() {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => saveSkyRallyState(state), 500);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [state]);

  // 卸载时刷新最新 state；直接闭包 state + deps [] 会把 disk 回滚到 mount 时的初始 state。
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    return () => {
      saveSkyRallyState(stateRef.current);
    };
  }, []);

  // 60ms tick = ~16Hz；reducer 在 idle 也会 JSON.parse(JSON.stringify(state)) 深拷贝
  // 一份新 state 并触发 React re-render，每秒空跑 16 次。用户停在选赛道 / 结算页
  // 不操作的时候这就是纯电量浪费。idle/ended 状态直接不 dispatch；status 由 ref 跟踪。
  useEffect(() => {
    const id = window.setInterval(() => {
      if (stateRef.current.status !== "racing") return;
      dispatch({ type: "tick", nowMs: Date.now() });
    }, 60);
    return () => window.clearInterval(id);
  }, []);

  const selectTrackAction = useCallback(
    (trackId: string) =>
      dispatch({ type: "select-track", trackId, nowMs: Date.now() }),
    [],
  );
  const start = useCallback(
    () => dispatch({ type: "start", nowMs: Date.now() }),
    [],
  );
  const tapBoostAction = useCallback(
    () => dispatch({ type: "tap-boost", nowMs: Date.now() }),
    [],
  );
  const abandon = useCallback(
    () => dispatch({ type: "abandon", nowMs: Date.now() }),
    [],
  );
  const backIdle = useCallback(() => dispatch({ type: "back-idle" }), []);
  const reset = useCallback(() => {
    resetSkyRallyState();
    dispatch({ type: "reset", nowMs: Date.now() });
  }, []);

  return {
    state,
    actions: {
      selectTrack: selectTrackAction,
      start,
      tapBoost: tapBoostAction,
      abandon,
      backIdle,
      reset,
    },
  };
}
