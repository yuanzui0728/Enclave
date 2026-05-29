// i18n-ignore-start: 测试，不出现在 UI。
// 覆盖「降低 LLM 失败率」改动的两块纯逻辑：
//   1) MinimaxKeyPoolService.alternateKey —— 429 退避重试时换另一把 key。
//   2) AiUsageLedgerService 聚合 —— 'retried'（被救回的中途 attempt）不计入失败率。
import { ConfigService } from '@nestjs/config';
import { MinimaxKeyPoolService } from '../minimax/minimax-key-pool.service';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import type { AiUsageLedgerEntity } from '../analytics/ai-usage-ledger.entity';

function makePool(keys: string[]): MinimaxKeyPoolService {
  const config = {
    get: (key: string) =>
      key === 'MINIMAX_API_KEYS' ? keys.join(',') : undefined,
  } as unknown as ConfigService;
  return new MinimaxKeyPoolService(config);
}

describe('MinimaxKeyPoolService.alternateKey', () => {
  it('两把 key：返回不等于当前 key 的另一把', () => {
    const pool = makePool(['aaaa1111', 'bbbb2222']);
    expect(pool.alternateKey('aaaa1111')?.key).toBe('bbbb2222');
    expect(pool.alternateKey('bbbb2222')?.key).toBe('aaaa1111');
  });

  it('单 key 池 → null（无可换）', () => {
    const pool = makePool(['only1key']);
    expect(pool.alternateKey('only1key')).toBeNull();
  });

  it('空池 → null', () => {
    const pool = makePool([]);
    expect(pool.alternateKey('whatever')).toBeNull();
  });

  it('多 key 池：环形轮到下一把不同 key', () => {
    const pool = makePool(['k1aaaa', 'k2bbbb', 'k3cccc']);
    const next = pool.alternateKey('k1aaaa');
    expect(next?.key).toBe('k2bbbb');
    expect(pool.alternateKey('k3cccc')?.key).toBe('k1aaaa');
  });

  it('excludeKey 不在池中 → 仍返回池里第一把可用 key', () => {
    const pool = makePool(['k1aaaa', 'k2bbbb']);
    expect(pool.alternateKey('not-in-pool')?.key).toBeDefined();
  });
});

function makeLedger(records: Partial<AiUsageLedgerEntity>[]): {
  service: AiUsageLedgerService;
} {
  const full = records.map((r, i) => ({
    id: `rec-${i}`,
    occurredAt: new Date(),
    status: 'success',
    surface: 'app',
    scene: 'reply',
    scopeType: 'character',
    currency: 'CNY',
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    ...r,
  })) as AiUsageLedgerEntity[];
  const repo = { find: async () => full } as any;
  const systemConfig = { getConfig: async () => null } as any;
  const service = new AiUsageLedgerService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    systemConfig,
  );
  return { service };
}

describe('AiUsageLedgerService 失败率聚合排除 retried', () => {
  it('getOverview：requestCount = success + failed，retried 不计入', async () => {
    const { service } = makeLedger([
      { status: 'success' },
      { status: 'success' },
      { status: 'failed' },
      { status: 'retried' },
      { status: 'retried' },
    ]);
    const overview = await service.getOverview({});
    expect(overview.successCount).toBe(2);
    expect(overview.failedCount).toBe(1);
    // 旧口径 requestCount=records.length=5、失败率=1/5；新口径排除 2 个 retried。
    expect(overview.requestCount).toBe(3);
    expect(overview.failedCount / overview.requestCount).toBeCloseTo(1 / 3);
  });

  it('getOverview：全 retried（被全部救回）→ requestCount=0、失败率分母为 0', async () => {
    const { service } = makeLedger([
      { status: 'retried' },
      { status: 'retried' },
    ]);
    const overview = await service.getOverview({});
    expect(overview.requestCount).toBe(0);
    expect(overview.failedCount).toBe(0);
  });

  it('getTrend：bucket requestCount/failedCount 排除 retried', async () => {
    const { service } = makeLedger([
      { status: 'success' },
      { status: 'failed' },
      { status: 'retried' },
    ]);
    const trend = await service.getTrend({});
    const totals = trend.reduce(
      (acc: { req: number; fail: number }, bucket: any) => ({
        req: acc.req + bucket.requestCount,
        fail: acc.fail + bucket.failedCount,
      }),
      { req: 0, fail: 0 },
    );
    expect(totals.req).toBe(2);
    expect(totals.fail).toBe(1);
  });
});
// i18n-ignore-end
