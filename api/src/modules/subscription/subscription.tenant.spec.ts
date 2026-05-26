import { SubscriptionService } from './subscription.service';
import { CloudSubscriptionClient, type CloudSubscriptionLookup } from './cloud-subscription.client';
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
    const statuses: Record<string, CloudSubscriptionLookup> = {
      'phone-A': lookup({ status: 'expired', hardBlockEnabled: true }),
      'phone-B': lookup({ status: 'active', hardBlockEnabled: true }),
    };
    let currentPhone = 'phone-A';
    const cloudClient = {
      resolveOwnerPhone: () => currentPhone,
      lookup: jest.fn(async (p: string) => statuses[p] ?? null),
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
