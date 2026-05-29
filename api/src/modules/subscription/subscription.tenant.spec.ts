import { SubscriptionService } from './subscription.service';
import {
  CloudSubscriptionClient,
  type CloudSubscriptionLookup,
  type CloudSubscriptionLookupOutcome,
} from './cloud-subscription.client';
import { TenantContextStore } from '../tenancy/tenant-context';

function lookup(partial: Partial<CloudSubscriptionLookup>): CloudSubscriptionLookup {
  return {
    status: 'active',
    expiresAt: null,
    planCode: null,
    isTrial: false,
    hardBlockEnabled: false,
    copy: {} as never,
    plans: [],
    ...partial,
  };
}

describe('SubscriptionService per-phone isolation (shared mode)', () => {
  it('caches and blocks per phone — one user expiry must not block another', async () => {
    const outcomes: Record<string, CloudSubscriptionLookupOutcome> = {
      'phone-A': { kind: 'ok', value: lookup({ status: 'expired', hardBlockEnabled: true }) },
      'phone-B': { kind: 'ok', value: lookup({ status: 'active', hardBlockEnabled: true }) },
    };
    let currentPhone = 'phone-A';
    const cloudClient = {
      resolveOwnerPhone: () => currentPhone,
      lookup: jest.fn(
        async (p: string): Promise<CloudSubscriptionLookupOutcome> =>
          outcomes[p] ?? { kind: 'transient' },
      ),
    } as unknown as CloudSubscriptionClient;

    const service = new SubscriptionService(cloudClient);

    // A 到期 → assertCanUseAi 抛
    currentPhone = 'phone-A';
    await expect(service.assertCanUseAi('text')).rejects.toBeDefined();

    // B active → 放行（不被 A 的状态污染）
    currentPhone = 'phone-B';
    await expect(service.assertCanUseAi('text')).resolves.toBeUndefined();

    // 再回到 A，仍然被拦（各自缓存）
    currentPhone = 'phone-A';
    await expect(service.assertCanUseAi('text')).rejects.toBeDefined();

    // 各 phone 只 lookup 一次（命中各自缓存）
    expect((cloudClient.lookup as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual([
      'phone-A',
      'phone-B',
    ]);
  });

  it('treats unmanaged (cloud-api 400 / 非托管) phone as pass, never hard-block', async () => {
    // 非法 phone（如 email 前缀串号）被 cloud-api 400 → client 返 unmanaged。
    // 绝不能误当"会员到期"硬拦 AI；应放行且只查一次（TTL 缓存）。
    const cloudClient = {
      resolveOwnerPhone: () => 'wgj123456789101112',
      lookup: jest.fn(
        async (): Promise<CloudSubscriptionLookupOutcome> => ({ kind: 'unmanaged' }),
      ),
    } as unknown as CloudSubscriptionClient;

    const service = new SubscriptionService(cloudClient);

    await expect(service.assertCanUseAi('text')).resolves.toBeUndefined();
    expect(await service.isAiHardBlockedForCurrentOwner()).toBe(false);
    // 命中缓存：unmanaged 也走正常 TTL，不应每次重打 cloud-api
    expect((cloudClient.lookup as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('transient failure with no cache fails closed (hard-block)', async () => {
    const cloudClient = {
      resolveOwnerPhone: () => 'phone-X',
      lookup: jest.fn(
        async (): Promise<CloudSubscriptionLookupOutcome> => ({ kind: 'transient' }),
      ),
    } as unknown as CloudSubscriptionClient;

    const service = new SubscriptionService(cloudClient);
    await expect(service.assertCanUseAi('text')).rejects.toBeDefined();
  });
});

describe('CloudSubscriptionClient.resolveOwnerPhone mode-awareness', () => {
  const originalMode = process.env.MAIN_MODE;
  afterEach(() => {
    if (originalMode === undefined) delete process.env.MAIN_MODE;
    else process.env.MAIN_MODE = originalMode;
  });

  it('shared mode reads phone from tenant context, not env', () => {
    process.env.MAIN_MODE = 'shared-world';
    const config = { get: jest.fn().mockReturnValue('env-phone') };
    const client = new CloudSubscriptionClient(config as never);
    const resolved = TenantContextStore.run(
      { ownerId: 'o', phone: 'ctx-phone' },
      () => client.resolveOwnerPhone(),
    );
    expect(resolved).toBe('ctx-phone');
    // 无上下文 → null（不回退 env），fail-closed
    expect(client.resolveOwnerPhone()).toBeNull();
  });

  it('LPP mode reads CLOUD_OWNER_PHONE env', () => {
    delete process.env.MAIN_MODE;
    const config = { get: jest.fn().mockReturnValue('env-phone') };
    const client = new CloudSubscriptionClient(config as never);
    expect(client.resolveOwnerPhone()).toBe('env-phone');
  });
});
