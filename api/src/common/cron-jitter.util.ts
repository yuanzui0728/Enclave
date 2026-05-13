import { createHash } from 'crypto';

let cachedSeedHashU32: number | null = null;

function getSeedHashU32(): number {
  if (cachedSeedHashU32 != null) {
    return cachedSeedHashU32;
  }
  const seed =
    process.env.CLOUD_WORLD_ID ||
    process.env.CLOUD_OWNER_PHONE ||
    `pid:${process.pid}`;
  const digest = createHash('sha1').update(seed).digest();
  cachedSeedHashU32 = digest.readUInt32BE(0) >>> 0;
  return cachedSeedHashU32;
}

// Stable per-world offset in [0, maxMs). 同一 world 每次进程重启都映射到相同 offset，
// 但 30 个 world 间在 0..maxMs 区间均匀分散，把整点 cron burst 抹平。
export function getWorldJitterMs(maxMs: number): number {
  if (maxMs <= 0) return 0;
  return getSeedHashU32() % maxMs;
}

export async function sleepForWorldJitter(maxMs: number): Promise<void> {
  const jitter = getWorldJitterMs(maxMs);
  if (jitter <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, jitter);
  });
}
