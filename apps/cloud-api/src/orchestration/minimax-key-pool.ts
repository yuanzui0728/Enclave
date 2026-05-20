// i18n-ignore-start: internal config — not user-facing UI.
import { createHash } from "node:crypto";

// MiniMax token plan key 池：按 worldId 稳定 hash 分配。
// 同一 world 永远命中同一 key（重启 cloud-api 不变），加 key 时只有少数 world 的 mod 余数变化。
// 池为空时返回 null，spawn 端不注入，child 自己读 api/.env 的单 key 兜底。
//
// 历史：2026-05-17 期间因为第一把 key 周限告紧，临时引入过 PRIMARY_KEY_WORLDS
// 白名单 + "pool>=2 时一律走 idx=1" 的强制改流。本轮（2026-05-17）已经把全部
// world 回退到按 hash 随机平均分配（含未来新 world），不再做白名单/强制改流。

// 2026-05-20 单点 pin：yuanzui 测试号（wiki 后台账户 91173587559732）每天吃
// 掉 key#1 全部用量 ~55%，单人把 8-world 池压得比 11-world 池还重。把它钉到
// pool[1]（key#2）做负载再平衡。pool size 变化时按 min(idx, pool.length-1) 兜底。
const WORLD_KEY_PIN_INDEX: Record<string, number> = {
  "bc77b484-1064-4b13-9eb4-7edd9ddc87ac": 1, // yuanzui0728@gmail.com / 91173587559732
};

export type MinimaxKeyAllocation = {
  key: string;
  index: number; // 1-based，便于日志
  total: number;
  fingerprint: string; // 末 4 位
};

export function parseMinimaxKeyPool(
  rawKeys: string | undefined,
  rawSingleKey: string | undefined,
): string[] {
  const fromCsv = (rawKeys ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (fromCsv.length > 0) return fromCsv;
  const single = (rawSingleKey ?? "").trim();
  return single ? [single] : [];
}

export function pickMinimaxKey(
  worldId: string,
  pool: string[],
): MinimaxKeyAllocation | null {
  if (pool.length === 0) return null;
  const pinned = WORLD_KEY_PIN_INDEX[worldId];
  let idx: number;
  if (pinned !== undefined) {
    idx = Math.min(pinned, pool.length - 1);
  } else {
    const digest = createHash("sha1").update(worldId).digest();
    const h = digest.readUInt32BE(0);
    idx = h % pool.length;
  }
  const key = pool[idx];
  return { key, index: idx + 1, total: pool.length, fingerprint: key.slice(-4) };
}
// i18n-ignore-end
