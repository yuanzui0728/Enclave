import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  ENEMY_OK_TOWER,
  ENEMY_PENALTY_HP,
  ENEMY_PENALTY_MORALE,
  EVENT_DURATION_MS,
  EVENT_SPAWN_MAX_MS,
  EVENT_SPAWN_MIN_MS,
  LOG_LIMIT,
  MISSED_TOWER_PENALTY,
  ROUND_DURATION_MS,
  SQUADMATE_BUSY_MS,
  SQUADMATE_POOL,
  SUPPLY_HP_RESTORE,
  SUPPLY_MORALE_RESTORE,
  SUPPLY_OK_TOWER,
  SYNC_OK_TOWER,
  SYNC_SKILL_COOLDOWN_MS,
  SYNC_SKILL_TOWER_GAIN,
  TOWER_NATURAL_GAIN_PER_SEC,
  TOWER_VICTORY,
  getSquadmate,
} from "./signal-squad-data";
import type {
  SignalEvent,
  SignalEventKind,
  SignalLogEntry,
  SignalLogTone,
  SignalSquadState,
  Skill,
  SquadmateState,
} from "./signal-squad-types";

const t = translateRuntimeMessage;

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function cloneState(state: SignalSquadState): SignalSquadState {
  return JSON.parse(JSON.stringify(state)) as SignalSquadState;
}

function emptySquadmateState(id: string): SquadmateState {
  const def = getSquadmate(id);
  return {
    id,
    hp: def?.maxHp ?? 100,
    morale: def?.maxMorale ?? 100,
    busyUntilMs: 0,
    resolves: 0,
  };
}

export function createInitialState(nowMs: number): SignalSquadState {
  // 默认选出 3 位（一个 scout + 一个 sniper + 一个 medic）
  const scout = SQUADMATE_POOL.find((m) => m.skill === "scout")!;
  const sniper = SQUADMATE_POOL.find((m) => m.skill === "sniper")!;
  const medic = SQUADMATE_POOL.find((m) => m.skill === "medic")!;
  const defaultIds = [scout.id, sniper.id, medic.id];
  return {
    schemaVersion: 1,
    status: "idle",
    squad: defaultIds.map((id) => emptySquadmateState(id)),
    selectedSquadIds: defaultIds,
    tower: 0,
    events: [],
    activeEventId: null,
    startedAtMs: null,
    endedAtMs: null,
    remainingMs: ROUND_DURATION_MS,
    syncSkillReadyAtMs: 0,
    syncSkillUses: 0,
    resolvedCount: 0,
    missedCount: 0,
    badgePoints: 0,
    teamScore: 0,
    log: [],
    lastTickAtMs: nowMs,
    rngSeed: (nowMs ^ 0x9e3779b9) | 1,
  };
}

function pushLog(
  state: SignalSquadState,
  text: string,
  tone: SignalLogTone,
  nowMs: number,
) {
  state.log.unshift({
    id: nextId("log", nowMs),
    atMs: nowMs,
    text,
    tone,
  });
  if (state.log.length > LOG_LIMIT) {
    state.log.length = LOG_LIMIT;
  }
}

function pickEventKind(roll: number): SignalEventKind {
  if (roll < 0.5) return "enemy";
  if (roll < 0.8) return "sync";
  return "supply";
}

function pickEnemySkill(roll: number): Skill {
  if (roll < 0.34) return "scout";
  if (roll < 0.67) return "sniper";
  return "medic";
}

function spawnEvent(state: SignalSquadState, nowMs: number) {
  const random = rng(state.rngSeed);
  state.rngSeed = (state.rngSeed * 1103515245 + 12345) | 0;
  const kind = pickEventKind(random());
  const id = nextId("evt", nowMs);
  let needSkill: Skill | null = null;
  let rewardTower = 0;
  if (kind === "enemy") {
    needSkill = pickEnemySkill(random());
    rewardTower = ENEMY_OK_TOWER;
  } else if (kind === "sync") {
    rewardTower = SYNC_OK_TOWER;
  } else {
    rewardTower = SUPPLY_OK_TOWER;
  }
  const event: SignalEvent = {
    id,
    kind,
    needSkill,
    spawnedAtMs: nowMs,
    expiresAtMs: nowMs + EVENT_DURATION_MS,
    matchedBy: [],
    resolved: null,
    rewardTower,
    penaltyTower: kind === "enemy" ? MISSED_TOWER_PENALTY : 0,
  };
  state.events.push(event);
  state.activeEventId = id;

  if (kind === "enemy") {
    const skillName =
      needSkill === "scout"
        ? t(msg`斥候`)
        : needSkill === "sniper"
          ? t(msg`狙击`)
          : t(msg`医疗`);
    pushLog(state, t(msg`敌方信号扑过来了，需要 ${skillName} 队员压制。`), "warn", nowMs);
  } else if (kind === "sync") {
    pushLog(state, t(msg`协同窗口打开，连点两位队员锁定。`), "info", nowMs);
  } else {
    pushLog(state, t(msg`补给信号到货，任意队员都可领取。`), "info", nowMs);
  }
}

function expireEvent(state: SignalSquadState, event: SignalEvent, nowMs: number) {
  if (event.resolved) return;
  event.resolved = "missed";
  state.missedCount += 1;
  state.tower = clamp(state.tower - event.penaltyTower, 0, TOWER_VICTORY);
  if (state.activeEventId === event.id) {
    state.activeEventId = null;
  }
  if (event.kind === "enemy") {
    // 错过敌方信号：所有队员士气下降一点
    for (const mate of state.squad) {
      mate.morale = clamp(mate.morale - 4, 0, 9999);
    }
    pushLog(state, t(msg`错过敌方信号，士气受挫。`), "warn", nowMs);
  } else if (event.kind === "sync") {
    pushLog(state, t(msg`协同窗口关闭，没能连点两位队员。`), "info", nowMs);
  } else {
    pushLog(state, t(msg`补给落空，等下一次。`), "info", nowMs);
  }
}

function planNextSpawnMs(state: SignalSquadState, nowMs: number) {
  const random = rng(state.rngSeed ^ 0x12345);
  state.rngSeed = (state.rngSeed * 22695477 + 1) | 0;
  return nowMs + EVENT_SPAWN_MIN_MS + random() * (EVENT_SPAWN_MAX_MS - EVENT_SPAWN_MIN_MS);
}

let nextSpawnAtMs = 0;

export function startRound(state: SignalSquadState, nowMs: number): SignalSquadState {
  state.status = "running";
  state.tower = 0;
  state.startedAtMs = nowMs;
  state.endedAtMs = null;
  state.remainingMs = ROUND_DURATION_MS;
  state.events = [];
  state.activeEventId = null;
  state.syncSkillReadyAtMs = nowMs;
  state.syncSkillUses = 0;
  state.resolvedCount = 0;
  state.missedCount = 0;
  state.lastTickAtMs = nowMs;
  // 复位每位队员
  state.squad = state.selectedSquadIds.map((id) => emptySquadmateState(id));
  pushLog(state, t(msg`小队就位，开始压制信号塔。`), "info", nowMs);
  nextSpawnAtMs = nowMs + 1500;
  return state;
}

export function selectSquad(
  state: SignalSquadState,
  ids: string[],
): SignalSquadState {
  const validIds = ids
    .map((id) => SQUADMATE_POOL.find((mate) => mate.id === id)?.id)
    .filter((id): id is string => Boolean(id));
  // 去重并保留顺序
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const id of validIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    dedup.push(id);
  }
  if (dedup.length !== 3) return state;
  state.selectedSquadIds = dedup;
  state.squad = dedup.map((id) => emptySquadmateState(id));
  return state;
}

export function tick(state: SignalSquadState, nowMs: number): SignalSquadState {
  if (state.status !== "running") {
    state.lastTickAtMs = nowMs;
    return state;
  }
  const elapsed = nowMs - (state.startedAtMs ?? nowMs);
  state.remainingMs = Math.max(0, ROUND_DURATION_MS - elapsed);

  // 自然推进
  const dt = Math.max(0, (nowMs - state.lastTickAtMs) / 1000);
  const aliveCount = state.squad.filter((mate) => mate.hp > 0).length;
  if (aliveCount > 0) {
    state.tower = clamp(
      state.tower + TOWER_NATURAL_GAIN_PER_SEC * dt * (aliveCount / 3),
      0,
      TOWER_VICTORY,
    );
  }

  // 处理过期事件
  for (const event of state.events) {
    if (event.resolved === null && nowMs >= event.expiresAtMs) {
      expireEvent(state, event, nowMs);
    }
  }

  // 生成下一个事件
  if (!state.activeEventId && nowMs >= nextSpawnAtMs) {
    spawnEvent(state, nowMs);
    nextSpawnAtMs = planNextSpawnMs(state, nowMs);
  }

  // 胜负判定
  if (state.tower >= TOWER_VICTORY) {
    finishRound(state, "victory", nowMs);
  } else if (aliveCount === 0) {
    finishRound(state, "defeat", nowMs);
  } else if (state.remainingMs <= 0) {
    finishRound(state, "timeout", nowMs);
  }

  state.lastTickAtMs = nowMs;
  return state;
}

function finishRound(
  state: SignalSquadState,
  outcome: "victory" | "defeat" | "timeout",
  nowMs: number,
) {
  state.status = outcome;
  state.endedAtMs = nowMs;
  state.activeEventId = null;
  // 结算徽章 + 团队积分
  const towerScore = Math.round(state.tower);
  const resolveBonus = state.resolvedCount * 4;
  const syncBonus = state.syncSkillUses >= 2 ? 12 : state.syncSkillUses * 4;
  const missPenalty = state.missedCount * 2;
  const baseScore = towerScore + resolveBonus + syncBonus - missPenalty;
  const teamGain = Math.max(0, baseScore);
  let badgeGain = 0;
  if (outcome === "victory") badgeGain = 3;
  else if (outcome === "timeout" && towerScore >= 80) badgeGain = 2;
  else if (towerScore >= 60) badgeGain = 1;
  if (state.syncSkillUses >= 2) badgeGain += 1;
  state.teamScore += teamGain;
  state.badgePoints += badgeGain;
  if (outcome === "victory") {
    pushLog(
      state,
      t(msg`信号塔已稳，本局 +${teamGain} 团队积分 / +${badgeGain} 赛季徽章。`),
      "success",
      nowMs,
    );
  } else if (outcome === "timeout") {
    pushLog(
      state,
      t(msg`时间到。本局压制完成度 ${towerScore}%，+${teamGain} 团队积分。`),
      "info",
      nowMs,
    );
  } else {
    pushLog(state, t(msg`小队失守，等下一局再来。`), "warn", nowMs);
  }
}

export function respondToEvent(
  state: SignalSquadState,
  squadmateId: string,
  nowMs: number,
): SignalSquadState {
  if (state.status !== "running" || !state.activeEventId) return state;
  const event = state.events.find((evt) => evt.id === state.activeEventId);
  if (!event || event.resolved) return state;
  const mate = state.squad.find((m) => m.id === squadmateId);
  if (!mate || mate.hp <= 0) return state;
  if (mate.busyUntilMs > nowMs) return state;
  const def = getSquadmate(squadmateId);
  if (!def) return state;

  mate.busyUntilMs = nowMs + SQUADMATE_BUSY_MS;

  if (event.kind === "enemy") {
    if (event.needSkill === def.skill) {
      event.resolved = "ok";
      state.activeEventId = null;
      state.resolvedCount += 1;
      mate.resolves += 1;
      state.tower = clamp(state.tower + event.rewardTower, 0, TOWER_VICTORY);
      pushLog(
        state,
        t(msg`${def.name} 一发就压住了敌方信号源。`),
        "success",
        nowMs,
      );
    } else {
      // 不匹配：扣 hp / 士气，事件仍在
      mate.hp = clamp(mate.hp - ENEMY_PENALTY_HP, 0, def.maxHp);
      mate.morale = clamp(mate.morale - ENEMY_PENALTY_MORALE, 0, def.maxMorale);
      pushLog(
        state,
        t(msg`${def.name} 不是这事件的人选，反被打了一下。`),
        "warn",
        nowMs,
      );
    }
  } else if (event.kind === "sync") {
    if (!event.matchedBy.includes(squadmateId)) {
      event.matchedBy.push(squadmateId);
    }
    if (event.matchedBy.length >= 2) {
      event.resolved = "ok";
      state.activeEventId = null;
      state.resolvedCount += 1;
      for (const mid of event.matchedBy) {
        const m = state.squad.find((entry) => entry.id === mid);
        if (m) m.resolves += 1;
      }
      state.tower = clamp(state.tower + event.rewardTower, 0, TOWER_VICTORY);
      pushLog(state, t(msg`双人协同压制完成，士气回涨。`), "success", nowMs);
      for (const mid of event.matchedBy) {
        const m = state.squad.find((entry) => entry.id === mid);
        const d = getSquadmate(mid);
        if (m && d) m.morale = clamp(m.morale + 8, 0, d.maxMorale);
      }
    } else {
      pushLog(
        state,
        t(msg`${def.name} 已就位，再点一位队员锁定。`),
        "info",
        nowMs,
      );
    }
  } else {
    // supply
    event.resolved = "ok";
    state.activeEventId = null;
    state.resolvedCount += 1;
    mate.resolves += 1;
    mate.hp = clamp(mate.hp + SUPPLY_HP_RESTORE, 0, def.maxHp);
    mate.morale = clamp(mate.morale + SUPPLY_MORALE_RESTORE, 0, def.maxMorale);
    state.tower = clamp(state.tower + event.rewardTower, 0, TOWER_VICTORY);
    pushLog(state, t(msg`${def.name} 把补给搬上来了。`), "success", nowMs);
  }
  return state;
}

// 名字曾叫 useSyncSkill —— 它是个 *纯* reducer-style 函数（activate sync skill
// 这个动作），不是 React Hook，但 react-hooks/rules-of-hooks 把它的名字 prefix
// 误判成 hook，并对调用方 reducer 报 "called in function 'reducer'"。改名跟周
// 围 applyXxx / respondToXxx 同款，规避误报、和别的纯函数保持语义一致。
export function applySyncSkill(
  state: SignalSquadState,
  nowMs: number,
): SignalSquadState {
  if (state.status !== "running") return state;
  if (nowMs < state.syncSkillReadyAtMs) return state;
  state.syncSkillReadyAtMs = nowMs + SYNC_SKILL_COOLDOWN_MS;
  state.syncSkillUses += 1;
  state.tower = clamp(state.tower + SYNC_SKILL_TOWER_GAIN, 0, TOWER_VICTORY);
  // 全员士气回升
  for (const mate of state.squad) {
    const def = getSquadmate(mate.id);
    if (!def) continue;
    mate.morale = clamp(mate.morale + 6, 0, def.maxMorale);
  }
  pushLog(state, t(msg`协同压制释放，全队推塔。`), "success", nowMs);
  return state;
}

export function exitToIdle(
  state: SignalSquadState,
  nowMs: number,
): SignalSquadState {
  state.status = "idle";
  state.activeEventId = null;
  state.events = [];
  state.startedAtMs = null;
  state.endedAtMs = null;
  state.remainingMs = ROUND_DURATION_MS;
  state.lastTickAtMs = nowMs;
  state.squad = state.selectedSquadIds.map((id) => emptySquadmateState(id));
  return state;
}
