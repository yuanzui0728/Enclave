// i18n-ignore-start: internal config — log strings only.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { TenantContextStore } from '../tenancy/tenant-context';

export type MinimaxKeySelection = {
  key: string;
  fingerprint: string; // 末 4 位，配额按 key 分桶 / 日志用
  index: number; // 0-based
  total: number;
};

// 当前 fingerprint 解析不到 key（池为空）时的哨兵，配额行 keyFingerprint 落它。
export const MINIMAX_SINGLE_KEY_FINGERPRINT = '__single__';

// 重度租户手动 pin：把某 ownerId 钉到指定 key index 做负载再平衡。
// key 是 **shared-world 的 ownerId**（不是旧 worldId）。初始留空——sha1 hash
// 已能把多租户摊到两把 key；监控到某把 key 偏重再补 pin。pool 长度变化时
// 按 min(idx, len-1) 兜底。
// 历史参考：旧 per-world 把 yuanzui(worldId bc77b484…) 钉到 pool[1]（key#2）。
const OWNER_KEY_PIN_INDEX: Record<string, number> = {};

// MiniMax token-plan 多 key 池的「按租户黏性」选择器。
// 取代旧 cloud-api per-world spawn 时按 worldId 分 key 的机制——shared-world 单进程
// 持有整池，改为按当前 TenantContext.ownerId 稳定 hash 选一把。
//   - 同一 ownerId 的全部 MiniMax 调用（文本/TTS/VLM/媒体）恒命中同一把
//     → per-key 配额/熔断口径一致，两把 plan 按租户分布均衡消耗。
//   - 单 key 池 / 无租户上下文 → 确定性回落，行为与改造前等价。
@Injectable()
export class MinimaxKeyPoolService {
  private readonly logger = new Logger(MinimaxKeyPoolService.name);
  private readonly pool: readonly string[];
  private warnedMissingContext = false;

  constructor(config: ConfigService) {
    const rawKeys = config.get<string>('MINIMAX_API_KEYS');
    const rawSingle = config.get<string>('MINIMAX_API_KEY');
    const fromCsv = (rawKeys ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const single = (rawSingle ?? '').trim();
    this.pool = fromCsv.length > 0 ? fromCsv : single ? [single] : [];
    if (this.pool.length > 1) {
      const fps = this.pool.map((k) => k.slice(-4)).join(',');
      this.logger.log(
        `MinimaxKeyPool: ${this.pool.length} keys, per-tenant sticky hash [${fps}]`,
      );
    }
  }

  isConfigured(): boolean {
    return this.pool.length > 0;
  }

  size(): number {
    return this.pool.length;
  }

  // 按当前租户 ownerId 稳定选 key。单 key 池永远返回那一把；空池返回 null。
  currentKey(): MinimaxKeySelection | null {
    if (this.pool.length === 0) return null;
    if (this.pool.length === 1) {
      return this.selectionAt(0);
    }
    const ownerId = TenantContextStore.get()?.ownerId;
    if (!ownerId) {
      // 无租户上下文：确定性回落到 pool[0]（**不** round-robin，保证同一逻辑
      // 操作的 reserve/commit/release 取到同一把 fingerprint）。shared-world 下
      // 一切调用都应在 runForOwner 帧内，命中这里视作待修 bug，告警一次。
      if (!this.warnedMissingContext) {
        this.warnedMissingContext = true;
        this.logger.warn(
          'currentKey() without TenantContext — falling back to pool[0]',
        );
      }
      return this.selectionAt(0);
    }
    const pinned = OWNER_KEY_PIN_INDEX[ownerId];
    const idx =
      pinned !== undefined
        ? Math.min(pinned, this.pool.length - 1)
        : createHash('sha1').update(ownerId).digest().readUInt32BE(0) %
          this.pool.length;
    return this.selectionAt(idx);
  }

  // 当前租户的 key fingerprint（配额按 key 分桶用）。空池 → 哨兵常量。
  currentFingerprint(): string {
    return this.currentKey()?.fingerprint ?? MINIMAX_SINGLE_KEY_FINGERPRINT;
  }

  // 换一把 key：返回池中**不等于 excludeKey** 的另一把，供 429（token-plan 限流，
  // 2062）退避重试时切到不同的 per-key 并发桶——sticky hash 把重度租户恒钉在同一把
  // key 上，撞限流时同 key 干等往往还是被限，换另一把（另一个 plan）更可能立刻过。
  // 池 ≤1 或找不到不同的 key → null（无可换，调用方退回同 key 重试）。
  // 仅用于聊天补全的 HTTP 调用层临时换 key，不改 currentFingerprint 的配额分桶口径
  // （文本补全不走 reserve/commit 配额账，无错配）。
  alternateKey(excludeKey: string | null | undefined): MinimaxKeySelection | null {
    if (this.pool.length <= 1) return null;
    const startIdx = excludeKey
      ? this.pool.findIndex((k) => k === excludeKey)
      : -1;
    // 从 excludeKey 的下一位起环形找第一把不同的 key（多 key 池里也能轮换）。
    for (let step = 1; step <= this.pool.length; step += 1) {
      const idx = (((startIdx >= 0 ? startIdx : 0) + step) % this.pool.length);
      if (this.pool[idx] !== excludeKey) {
        return this.selectionAt(idx);
      }
    }
    return null;
  }

  private selectionAt(idx: number): MinimaxKeySelection {
    const key = this.pool[idx];
    return { key, fingerprint: key.slice(-4), index: idx, total: this.pool.length };
  }
}
// i18n-ignore-end
