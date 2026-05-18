import { useCallback, useEffect, useReducer, useRef } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  INSTRUMENTS,
  LOG_LIMIT,
  POSTER_THRESHOLD,
  ROUND_DURATION_MS,
  SETLIST_SIZE,
  SONGS,
  STAGE_PROP_LIMIT,
  STAGE_PROPS,
  STREAK_BONUS_AT,
  getInstrument,
  getSong,
  getStageProp,
} from "./island-concert-data";

const t = translateRuntimeMessage;

const STORAGE_KEY = "yinjie.island-concert.v1";

export type IslandConcertLogTone = "info" | "success" | "warn";

export type IslandConcertLog = {
  id: string;
  atMs: number;
  text: string;
  tone: IslandConcertLogTone;
};

export type IslandConcertStatus =
  | "idle" // 选乐器、放道具、编曲目
  | "performing" // 演出中
  | "between" // 一首结束，等下一首
  | "ended";

export type SongResult = {
  songId: string;
  hits: number;
  misses: number;
  perfects: number;
  score: number;
};

export type IslandConcertState = {
  schemaVersion: 1;
  status: IslandConcertStatus;
  instrumentId: string;
  propIds: string[]; // 0-2
  setlist: string[]; // 0-3 song ids
  currentSongIndex: number; // 0-based
  songStartedAtMs: number;
  beatIndex: number; // 当前正在播放的节拍 idx
  beatLitAtMs: number; // 当前节拍亮起时间
  beatHandled: boolean; // 当前节拍是否已被点击
  songResults: SongResult[];
  currentSongHits: number;
  currentSongMisses: number;
  currentSongPerfects: number;
  currentSongScore: number;
  currentSongStreak: number;
  totalScore: number;
  posters: number;
  ensemblePoints: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
  remainingMs: number;
  log: IslandConcertLog[];
  lastTickAtMs: number;
};

type Action =
  | { type: "tick"; nowMs: number }
  | { type: "select-instrument"; instrumentId: string }
  | { type: "toggle-prop"; propId: string }
  | { type: "toggle-song"; songId: string }
  | { type: "start"; nowMs: number }
  | { type: "tap"; nowMs: number }
  | { type: "back-idle" }
  | { type: "reset"; nowMs: number };

let counter = 0;

function nextId(prefix: string, nowMs: number) {
  counter += 1;
  return `${prefix}-${nowMs.toString(36)}-${counter.toString(36)}`;
}

function pushLog(
  state: IslandConcertState,
  text: string,
  tone: IslandConcertLogTone,
  nowMs: number,
) {
  state.log.unshift({ id: nextId("log", nowMs), atMs: nowMs, text, tone });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

function createInitialState(_nowMs: number): IslandConcertState {
  return {
    schemaVersion: 1,
    status: "idle",
    instrumentId: INSTRUMENTS[0].id,
    propIds: [],
    setlist: [],
    currentSongIndex: 0,
    songStartedAtMs: 0,
    beatIndex: -1,
    beatLitAtMs: 0,
    beatHandled: true,
    songResults: [],
    currentSongHits: 0,
    currentSongMisses: 0,
    currentSongPerfects: 0,
    currentSongScore: 0,
    currentSongStreak: 0,
    totalScore: 0,
    posters: 0,
    ensemblePoints: 0,
    startedAtMs: null,
    endedAtMs: null,
    remainingMs: ROUND_DURATION_MS,
    log: [],
    lastTickAtMs: _nowMs,
  };
}

function startSong(state: IslandConcertState, songIndex: number, nowMs: number) {
  state.currentSongIndex = songIndex;
  state.songStartedAtMs = nowMs;
  state.beatIndex = -1;
  state.beatLitAtMs = 0;
  state.beatHandled = true;
  state.currentSongHits = 0;
  state.currentSongMisses = 0;
  state.currentSongPerfects = 0;
  state.currentSongScore = 0;
  state.currentSongStreak = 0;
  state.status = "performing";
  const songId = state.setlist[songIndex];
  const song = getSong(songId);
  pushLog(
    state,
    t(msg`第 ${songIndex + 1} 首：${song?.title ?? songId}`),
    "info",
    nowMs,
  );
}

function finishCurrentSong(state: IslandConcertState, nowMs: number) {
  const songId = state.setlist[state.currentSongIndex];
  const song = getSong(songId);
  const result: SongResult = {
    songId,
    hits: state.currentSongHits,
    misses: state.currentSongMisses,
    perfects: state.currentSongPerfects,
    score: state.currentSongScore,
  };
  state.songResults.push(result);
  state.totalScore += result.score;
  if (result.score >= POSTER_THRESHOLD) {
    state.posters += 1;
  }
  state.ensemblePoints += result.hits + result.perfects * 2;
  pushLog(
    state,
    t(
      msg`${song?.title ?? t(msg`本曲`)} 结束：节奏分 ${result.score} (完美 ${result.perfects} / 命中 ${result.hits} / 错过 ${result.misses})`,
    ),
    result.score >= POSTER_THRESHOLD ? "success" : "info",
    nowMs,
  );

  if (state.currentSongIndex + 1 >= state.setlist.length) {
    state.status = "ended";
    state.endedAtMs = nowMs;
    // 道具加成 → 海报
    let bonusPosters = 0;
    for (const pid of state.propIds) {
      const p = getStageProp(pid);
      if (p) bonusPosters += p.posterBonus;
    }
    state.posters += bonusPosters;
    pushLog(
      state,
      t(
        msg`今晚演出结束：总分 ${state.totalScore} · 海报 +${state.songResults.filter((r) => r.score >= POSTER_THRESHOLD).length + bonusPosters}`,
      ),
      "success",
      nowMs,
    );
  } else {
    state.status = "between";
  }
}

function reducer(state: IslandConcertState, action: Action): IslandConcertState {
  if (action.type === "reset") return createInitialState(action.nowMs);
  const next: IslandConcertState = JSON.parse(JSON.stringify(state));
  switch (action.type) {
    case "select-instrument": {
      if (next.status !== "idle") return next;
      if (!getInstrument(action.instrumentId)) return next;
      next.instrumentId = action.instrumentId;
      return next;
    }
    case "toggle-prop": {
      if (next.status !== "idle") return next;
      if (!getStageProp(action.propId)) return next;
      const idx = next.propIds.indexOf(action.propId);
      if (idx >= 0) {
        next.propIds.splice(idx, 1);
      } else if (next.propIds.length < STAGE_PROP_LIMIT) {
        next.propIds.push(action.propId);
      }
      return next;
    }
    case "toggle-song": {
      if (next.status !== "idle") return next;
      if (!getSong(action.songId)) return next;
      const idx = next.setlist.indexOf(action.songId);
      if (idx >= 0) {
        next.setlist.splice(idx, 1);
      } else if (next.setlist.length < SETLIST_SIZE) {
        next.setlist.push(action.songId);
      }
      return next;
    }
    case "start": {
      if (next.status === "performing") return next;
      if (next.setlist.length !== SETLIST_SIZE) {
        pushLog(
          next,
          t(msg`请先编排 ${SETLIST_SIZE} 首曲目。`),
          "warn",
          action.nowMs,
        );
        return next;
      }
      next.startedAtMs = action.nowMs;
      next.endedAtMs = null;
      next.songResults = [];
      next.totalScore = 0;
      next.remainingMs = ROUND_DURATION_MS;
      next.lastTickAtMs = action.nowMs;
      pushLog(
        next,
        t(msg`海风夜灯亮起，演出开始。`),
        "info",
        action.nowMs,
      );
      startSong(next, 0, action.nowMs);
      return next;
    }
    case "tick": {
      if (next.status !== "performing" && next.status !== "between") {
        next.lastTickAtMs = action.nowMs;
        return next;
      }
      const elapsedTotal = action.nowMs - (next.startedAtMs ?? action.nowMs);
      next.remainingMs = Math.max(0, ROUND_DURATION_MS - elapsedTotal);

      if (next.status === "between") {
        // 间歇 1 秒后开下一首
        if (action.nowMs - (next.endedAtMs ?? 0) >= 1500) {
          // 进入下一首
          next.endedAtMs = null;
          startSong(next, next.currentSongIndex + 1, action.nowMs);
        }
        next.lastTickAtMs = action.nowMs;
        return next;
      }

      const songId = next.setlist[next.currentSongIndex];
      const song = getSong(songId);
      if (!song) return next;
      const songElapsed = action.nowMs - next.songStartedAtMs;
      const expectedBeat = Math.floor(songElapsed / song.intervalMs);
      const targetBeat = Math.min(expectedBeat, song.beatCount - 1);

      // 节拍推进：每跨过一个未点击的旧拍计 miss
      while (next.beatIndex < targetBeat) {
        if (next.beatIndex >= 0 && !next.beatHandled) {
          next.currentSongMisses += 1;
          next.currentSongStreak = 0;
        }
        next.beatIndex += 1;
        next.beatLitAtMs = next.songStartedAtMs + next.beatIndex * song.intervalMs;
        next.beatHandled = false;
      }

      // 演出结束：当前拍是最后一拍，且节拍窗口已过
      const endOfSongMs =
        next.songStartedAtMs + (song.beatCount - 1) * song.intervalMs + song.windowMs;
      if (action.nowMs >= endOfSongMs) {
        if (next.beatIndex === song.beatCount - 1 && !next.beatHandled) {
          next.currentSongMisses += 1;
        }
        next.endedAtMs = action.nowMs;
        finishCurrentSong(next, action.nowMs);
      }

      if (next.remainingMs <= 0 && next.status === "performing") {
        next.endedAtMs = action.nowMs;
        // 强制结束
        next.status = "ended";
        pushLog(next, t(msg`时间到，今晚到此为止。`), "info", action.nowMs);
      }
      next.lastTickAtMs = action.nowMs;
      return next;
    }
    case "tap": {
      if (next.status !== "performing") return next;
      const songId = next.setlist[next.currentSongIndex];
      const song = getSong(songId);
      if (!song) return next;
      if (next.beatIndex < 0 || next.beatHandled) {
        // 抢拍：扣分但不算 miss（避免太严苛）
        return next;
      }
      const dt = action.nowMs - next.beatLitAtMs;
      const halfWindow = song.windowMs / 2;
      if (dt < 0 || dt > song.windowMs) {
        // 超窗：算 miss
        next.currentSongMisses += 1;
        next.currentSongStreak = 0;
        next.beatHandled = true;
        return next;
      }
      const instrument = getInstrument(next.instrumentId);
      const bonus = instrument?.scoreBonus ?? 0;
      const isPerfect = Math.abs(dt - halfWindow) < song.windowMs * 0.18;
      if (isPerfect) {
        next.currentSongPerfects += 1;
        next.currentSongScore += 4 + bonus;
      } else {
        next.currentSongHits += 1;
        next.currentSongScore += 2 + bonus;
      }
      next.currentSongStreak += 1;
      if (next.currentSongStreak === STREAK_BONUS_AT) {
        next.currentSongScore += 3;
        pushLog(
          next,
          t(msg`${STREAK_BONUS_AT} 连击！+3 节奏分。`),
          "success",
          action.nowMs,
        );
      }
      next.beatHandled = true;
      return next;
    }
    case "back-idle": {
      next.status = "idle";
      next.startedAtMs = null;
      next.endedAtMs = null;
      next.beatIndex = -1;
      next.beatLitAtMs = 0;
      next.beatHandled = true;
      next.songResults = [];
      next.totalScore = 0;
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

function loadState(): IslandConcertState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IslandConcertState;
    if (parsed.schemaVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: IslandConcertState) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function init(): IslandConcertState {
  const now = Date.now();
  const stored = loadState();
  if (!stored) return createInitialState(now);
  // 进行中的演出回到 idle，但保留乐器 / 道具 / 曲目 / 海报 / 合奏积分
  if (stored.status === "performing" || stored.status === "between") {
    return {
      ...stored,
      status: "idle",
      currentSongIndex: 0,
      songStartedAtMs: 0,
      beatIndex: -1,
      beatLitAtMs: 0,
      beatHandled: true,
      songResults: [],
      currentSongHits: 0,
      currentSongMisses: 0,
      currentSongPerfects: 0,
      currentSongScore: 0,
      currentSongStreak: 0,
      totalScore: 0,
      startedAtMs: null,
      endedAtMs: null,
      remainingMs: ROUND_DURATION_MS,
      lastTickAtMs: now,
    };
  }
  return { ...stored, lastTickAtMs: now };
}

export function useIslandConcertState() {
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

  // 80ms tick = ~12.5Hz；reducer 在 idle 也 JSON.parse(JSON.stringify(state))
  // 深拷贝 + re-render，停在选乐器 / 结算页就是纯空转。只在 performing/between
  // 才需要 tick。
  useEffect(() => {
    const id = window.setInterval(() => {
      const status = stateRef.current.status;
      if (status !== "performing" && status !== "between") return;
      dispatch({ type: "tick", nowMs: Date.now() });
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  const selectInstrument = useCallback(
    (instrumentId: string) =>
      dispatch({ type: "select-instrument", instrumentId }),
    [],
  );
  const toggleProp = useCallback(
    (propId: string) => dispatch({ type: "toggle-prop", propId }),
    [],
  );
  const toggleSong = useCallback(
    (songId: string) => dispatch({ type: "toggle-song", songId }),
    [],
  );
  const start = useCallback(
    () => dispatch({ type: "start", nowMs: Date.now() }),
    [],
  );
  const tap = useCallback(
    () => dispatch({ type: "tap", nowMs: Date.now() }),
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
    actions: {
      selectInstrument,
      toggleProp,
      toggleSong,
      start,
      tap,
      backIdle,
      reset,
    },
  };
}
// i18n-ignore-end
