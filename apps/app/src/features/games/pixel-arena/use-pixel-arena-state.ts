import { useCallback, useEffect, useReducer, useRef } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  FIGHTERS,
  LOG_LIMIT,
  ROUND_COUNT,
  STREAK_TOKEN_MILESTONE,
  type Fighter,
  type Move,
  type RoundOutcome,
  getFighter,
  pickNpcMove,
  resolveMoves,
} from "./pixel-arena-data";

const t = translateRuntimeMessage;

const STORAGE_KEY = "yinjie.pixel-arena.v1";

export type PixelArenaLogTone = "info" | "success" | "warn";

export type PixelArenaLog = {
  id: string;
  atMs: number;
  text: string;
  tone: PixelArenaLogTone;
};

export type PixelArenaStatus = "idle" | "fighting" | "ended";

export type PixelArenaRoundRecord = {
  round: number;
  playerMove: Move;
  npcMove: Move;
  outcome: RoundOutcome;
};

export type PixelArenaState = {
  schemaVersion: 1;
  status: PixelArenaStatus;
  playerFighterId: string;
  npcFighterId: string;
  playerHp: number;
  npcHp: number;
  round: number; // 1-based
  history: PixelArenaRoundRecord[];
  lastPlayerMove: Move | null;
  winStreak: number; // 当前连胜
  bestStreak: number;
  totalWins: number;
  totalLosses: number;
  skinTokens: number;
  badge: number;
  log: PixelArenaLog[];
  rngSeed: number;
};

type Action =
  | { type: "select-player"; fighterId: string }
  | { type: "start"; nowMs: number }
  | { type: "play"; move: Move; nowMs: number }
  | { type: "back-idle" }
  | { type: "reset"; nowMs: number };

let counter = 0;

function nextId(prefix: string, nowMs: number) {
  counter += 1;
  return `${prefix}-${nowMs.toString(36)}-${counter.toString(36)}`;
}

function rng(seed: number) {
  let value = seed | 0;
  return () => {
    value = (value * 1664525 + 1013904223) | 0;
    return ((value >>> 0) % 1_000_000) / 1_000_000;
  };
}

function pushLog(
  state: PixelArenaState,
  text: string,
  tone: PixelArenaLogTone,
  nowMs: number,
) {
  state.log.unshift({ id: nextId("log", nowMs), atMs: nowMs, text, tone });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

function pickRandomNpc(playerId: string, seed: number): string {
  const candidates = FIGHTERS.filter((f) => f.id !== playerId);
  const idx = Math.abs(seed) % candidates.length;
  return candidates[idx].id;
}

function moveLabel(move: Move): string {
  switch (move) {
    case "attack":
      return t(msg`攻`);
    case "defend":
      return t(msg`防`);
    case "special":
      return t(msg`杀`);
  }
}

function createInitialState(nowMs: number): PixelArenaState {
  const playerId = FIGHTERS[0].id;
  return {
    schemaVersion: 1,
    status: "idle",
    playerFighterId: playerId,
    npcFighterId: pickRandomNpc(playerId, nowMs),
    playerHp: getFighter(playerId)?.hp ?? 70,
    npcHp: 70,
    round: 0,
    history: [],
    lastPlayerMove: null,
    winStreak: 0,
    bestStreak: 0,
    totalWins: 0,
    totalLosses: 0,
    skinTokens: 0,
    badge: 0,
    log: [],
    rngSeed: nowMs | 1,
  };
}

function reducer(state: PixelArenaState, action: Action): PixelArenaState {
  if (action.type === "reset") return createInitialState(action.nowMs);
  const next: PixelArenaState = JSON.parse(JSON.stringify(state));
  switch (action.type) {
    case "select-player": {
      if (next.status === "fighting") return next;
      if (!getFighter(action.fighterId)) return next;
      next.playerFighterId = action.fighterId;
      next.npcFighterId = pickRandomNpc(action.fighterId, next.rngSeed);
      next.playerHp = getFighter(action.fighterId)?.hp ?? 70;
      next.npcHp = getFighter(next.npcFighterId)?.hp ?? 70;
      return next;
    }
    case "start": {
      const player = getFighter(next.playerFighterId);
      if (!player) return next;
      // 重新挑一个 NPC
      next.npcFighterId = pickRandomNpc(next.playerFighterId, action.nowMs);
      const npc = getFighter(next.npcFighterId);
      if (!npc) return next;
      next.status = "fighting";
      next.round = 1;
      next.history = [];
      next.lastPlayerMove = null;
      next.playerHp = player.hp;
      next.npcHp = npc.hp;
      next.rngSeed = action.nowMs | 1;
      pushLog(
        next,
        t(msg`${player.name} vs ${npc.name}，第一回合开始。`),
        "info",
        action.nowMs,
      );
      return next;
    }
    case "play": {
      if (next.status !== "fighting") return next;
      const player = getFighter(next.playerFighterId);
      const npc = getFighter(next.npcFighterId);
      if (!player || !npc) return next;
      const random = rng(next.rngSeed);
      next.rngSeed = (next.rngSeed * 1103515245 + 12345) | 0;
      const npcMove = pickNpcMove(npc, random, next.lastPlayerMove);
      const outcome = resolveMoves(player, action.move, npc, npcMove);
      next.playerHp = Math.max(0, next.playerHp - outcome.playerDamage);
      next.npcHp = Math.max(0, next.npcHp - outcome.npcDamage);
      next.history.push({
        round: next.round,
        playerMove: action.move,
        npcMove,
        outcome,
      });
      pushLog(
        next,
        t(
          msg`第 ${next.round} 回合 · 你出${moveLabel(action.move)} / 对方出${moveLabel(npcMove)} · ${
            outcome.summary === "p_hits"
              ? t(msg`你打中`)
              : outcome.summary === "n_hits"
                ? t(msg`被打中`)
                : outcome.summary === "trade"
                  ? t(msg`互伤`)
                  : outcome.summary === "block"
                    ? t(msg`被防住`)
                    : t(msg`僵持`)
          }`,
        ),
        outcome.summary === "p_hits"
          ? "success"
          : outcome.summary === "n_hits"
            ? "warn"
            : "info",
        action.nowMs,
      );
      next.lastPlayerMove = action.move;
      // 判输赢：HP 归零或回合数到顶
      const playerDown = next.playerHp <= 0;
      const npcDown = next.npcHp <= 0;
      const reachedRoundCap = next.round >= ROUND_COUNT;
      if (playerDown || npcDown || reachedRoundCap) {
        finishMatch(next, action.nowMs);
      } else {
        next.round += 1;
      }
      return next;
    }
    case "back-idle": {
      next.status = "idle";
      next.round = 0;
      next.history = [];
      next.lastPlayerMove = null;
      const player = getFighter(next.playerFighterId);
      const npc = getFighter(next.npcFighterId);
      next.playerHp = player?.hp ?? 70;
      next.npcHp = npc?.hp ?? 70;
      return next;
    }
  }
  return next;
}

function finishMatch(state: PixelArenaState, nowMs: number) {
  state.status = "ended";
  const playerWin =
    state.npcHp <= 0 ||
    (state.playerHp > 0 && state.playerHp >= state.npcHp);
  const player = getFighter(state.playerFighterId);
  const npc = getFighter(state.npcFighterId);
  if (playerWin && state.npcHp < state.playerHp) {
    state.totalWins += 1;
    state.winStreak += 1;
    if (state.winStreak > state.bestStreak) state.bestStreak = state.winStreak;
    state.badge += state.winStreak >= STREAK_TOKEN_MILESTONE ? 2 : 1;
    if (state.winStreak === STREAK_TOKEN_MILESTONE) {
      state.skinTokens += 1;
      pushLog(
        state,
        t(msg`三连胜达成！+1 双人皮肤券。`),
        "success",
        nowMs,
      );
    }
    pushLog(
      state,
      t(msg`${player?.name ?? t(msg`玩家`)} 胜 ${npc?.name ?? t(msg`对手`)}。`),
      "success",
      nowMs,
    );
  } else if (!playerWin || state.playerHp <= 0) {
    state.totalLosses += 1;
    state.winStreak = 0;
    pushLog(
      state,
      t(msg`${npc?.name ?? t(msg`对手`)} 赢了，连胜清零。`),
      "warn",
      nowMs,
    );
  } else {
    pushLog(state, t(msg`5 回合战平。`), "info", nowMs);
  }
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadState(): PixelArenaState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PixelArenaState;
    if (parsed.schemaVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: PixelArenaState) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function init(): PixelArenaState {
  const now = Date.now();
  const stored = loadState();
  if (!stored) return createInitialState(now);
  if (stored.status === "fighting") {
    // 进行中局直接放弃，但保留连胜 / 胜场 / 皮肤券
    return {
      ...stored,
      status: "idle",
      round: 0,
      history: [],
      lastPlayerMove: null,
      playerHp: getFighter(stored.playerFighterId)?.hp ?? 70,
      npcHp: getFighter(stored.npcFighterId)?.hp ?? 70,
    };
  }
  return stored;
}

export function usePixelArenaState() {
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

  const selectPlayer = useCallback(
    (fighterId: string) => dispatch({ type: "select-player", fighterId }),
    [],
  );
  const start = useCallback(
    () => dispatch({ type: "start", nowMs: Date.now() }),
    [],
  );
  const play = useCallback(
    (move: Move) => dispatch({ type: "play", move, nowMs: Date.now() }),
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
    actions: { selectPlayer, start, play, backIdle, reset },
  };
}
// i18n-ignore-end
