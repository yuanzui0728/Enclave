// mulberry32 — small fast seeded RNG
export function createRng(seed: number): { next: () => number; setSeed: (n: number) => void } {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    setSeed(n: number) {
      s = n >>> 0;
    },
  };
}

export function rngInt(rng: { next: () => number }, lo: number, hi: number): number {
  return lo + Math.floor(rng.next() * (hi - lo + 1));
}

export function rngPick<T>(rng: { next: () => number }, arr: T[]): T {
  return arr[Math.floor(rng.next() * arr.length)] as T;
}
