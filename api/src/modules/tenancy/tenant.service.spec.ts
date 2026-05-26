import { TenantService } from './tenant.service';
import { TenantContextStore } from './tenant-context';

type FakeWorldOwner = {
  ensureOwnerForPhone: jest.Mock;
  listTenantOwners: jest.Mock;
};

function createService(worldOwner: Partial<FakeWorldOwner>, moduleRef?: unknown) {
  return new TenantService(
    worldOwner as never,
    (moduleRef ?? { get: jest.fn() }) as never,
  );
}

describe('TenantService', () => {
  describe('runForAllTenants', () => {
    it('runs fn in each owner context frame', async () => {
      const owners = [
        { id: 'A', cloudPhone: 'pa' },
        { id: 'B', cloudPhone: 'pb' },
      ];
      const service = createService({
        listTenantOwners: jest.fn().mockResolvedValue(owners),
      });
      const seen: Array<{ ctxOwner?: string; argOwner: string }> = [];

      await service.runForAllTenants(async (ctx) => {
        seen.push({
          ctxOwner: TenantContextStore.get()?.ownerId,
          argOwner: ctx.ownerId,
        });
      });

      expect(seen).toEqual([
        { ctxOwner: 'A', argOwner: 'A' },
        { ctxOwner: 'B', argOwner: 'B' },
      ]);
    });

    it('isolates a failing owner without aborting the rest', async () => {
      const owners = [
        { id: 'A', cloudPhone: 'pa' },
        { id: 'B', cloudPhone: 'pb' },
        { id: 'C', cloudPhone: 'pc' },
      ];
      const service = createService({
        listTenantOwners: jest.fn().mockResolvedValue(owners),
      });
      const ran: string[] = [];

      await service.runForAllTenants(async (ctx) => {
        ran.push(ctx.ownerId);
        if (ctx.ownerId === 'B') throw new Error('boom');
      });

      // A 之后 B 抛错被吞，C 仍然跑到。
      expect(ran).toEqual(['A', 'B', 'C']);
    });

    it('leaves no context bound after completion', async () => {
      const service = createService({
        listTenantOwners: jest.fn().mockResolvedValue([{ id: 'A', cloudPhone: 'pa' }]),
      });
      await service.runForAllTenants(async () => {});
      expect(TenantContextStore.get()).toBeUndefined();
    });
  });

  describe('runAsTenant', () => {
    it('binds context and seeds default friendships for a newly-created owner', async () => {
      const ensureDefaultFriendships = jest.fn().mockResolvedValue(undefined);
      const moduleRef = { get: jest.fn().mockReturnValue({ ensureDefaultFriendships }) };
      const service = createService(
        {
          ensureOwnerForPhone: jest
            .fn()
            .mockResolvedValue({ owner: { id: 'new-1' }, created: true }),
        },
        moduleRef,
      );

      const ownerInside = await service.runAsTenant('p1', async () =>
        TenantContextStore.get()?.ownerId,
      );

      expect(ownerInside).toBe('new-1');
      expect(ensureDefaultFriendships).toHaveBeenCalledWith('new-1');
    });

    it('does not re-seed an existing owner', async () => {
      const ensureDefaultFriendships = jest.fn();
      const moduleRef = { get: jest.fn().mockReturnValue({ ensureDefaultFriendships }) };
      const service = createService(
        {
          ensureOwnerForPhone: jest
            .fn()
            .mockResolvedValue({ owner: { id: 'old-1' }, created: false }),
        },
        moduleRef,
      );

      await service.runAsTenant('p1', async () => undefined);
      expect(ensureDefaultFriendships).not.toHaveBeenCalled();
    });
  });
});
