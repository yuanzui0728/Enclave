const STORAGE_KEY = "tankWar:v1";

export type TankWarPersist = {
  highScoreP1: number;
  highScoreP2: number;
  maxUnlockedStage: number;
  muted: boolean;
};

const DEFAULT: TankWarPersist = {
  highScoreP1: 20000,
  highScoreP2: 0,
  maxUnlockedStage: 1,
  muted: false,
};

export function loadPersist(): TankWarPersist {
  if (typeof window === "undefined") return { ...DEFAULT };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<TankWarPersist>;
    return {
      highScoreP1: Math.max(0, Number(parsed.highScoreP1) || 0),
      highScoreP2: Math.max(0, Number(parsed.highScoreP2) || 0),
      maxUnlockedStage: Math.max(
        1,
        Math.min(35, Number(parsed.maxUnlockedStage) || 1),
      ),
      muted: Boolean(parsed.muted),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function savePersist(state: TankWarPersist): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}
