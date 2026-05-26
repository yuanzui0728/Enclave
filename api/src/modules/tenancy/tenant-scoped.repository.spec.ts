import { TenantRepository } from './tenant-scoped.repository';
import { TenantContextStore } from './tenant-context';
import type { Repository } from 'typeorm';

type Row = { id: string; ownerId?: string | null; name?: string };

function fakeRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    findBy: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    create: jest.fn().mockImplementation((x) => x),
    save: jest.fn().mockImplementation((x) => Promise.resolve(x)),
  } as unknown as Repository<Row> & Record<string, jest.Mock>;
}

describe('TenantRepository mode-awareness', () => {
  const originalMode = process.env.MAIN_MODE;
  afterEach(() => {
    if (originalMode === undefined) delete process.env.MAIN_MODE;
    else process.env.MAIN_MODE = originalMode;
    jest.clearAllMocks();
  });

  describe('LPP / passthrough mode', () => {
    beforeEach(() => {
      delete process.env.MAIN_MODE;
    });

    it('find passes options straight through (no ownerId injected)', async () => {
      const repo = fakeRepo();
      await new TenantRepository<Row>(repo).find({ where: { name: 'x' } });
      expect(repo.find).toHaveBeenCalledWith({ where: { name: 'x' } });
    });

    it('save passes entity through without stamping ownerId', async () => {
      const repo = fakeRepo();
      await new TenantRepository<Row>(repo).save({ id: '1', name: 'x' });
      expect(repo.save).toHaveBeenCalledWith({ id: '1', name: 'x' });
    });

    it('works with NO tenant context (does not throw)', async () => {
      const repo = fakeRepo();
      await expect(
        new TenantRepository<Row>(repo).findOneBy({ id: '1' }),
      ).resolves.toBeNull();
      expect(repo.findOneBy).toHaveBeenCalledWith({ id: '1' });
    });
  });

  describe('shared mode', () => {
    beforeEach(() => {
      process.env.MAIN_MODE = 'shared-world';
    });

    it('find merges ownerId into where', async () => {
      const repo = fakeRepo();
      await TenantContextStore.run({ ownerId: 'A', phone: 'p' }, () =>
        new TenantRepository<Row>(repo).find({ where: { name: 'x' } }),
      );
      expect(repo.find).toHaveBeenCalledWith({ where: { name: 'x', ownerId: 'A' } });
    });

    it('find with no where injects ownerId-only filter', async () => {
      const repo = fakeRepo();
      await TenantContextStore.run({ ownerId: 'A', phone: 'p' }, () =>
        new TenantRepository<Row>(repo).find(),
      );
      expect(repo.find).toHaveBeenCalledWith({ where: { ownerId: 'A' } });
    });

    it('array where (OR) gets ownerId on each clause', async () => {
      const repo = fakeRepo();
      await TenantContextStore.run({ ownerId: 'A', phone: 'p' }, () =>
        new TenantRepository<Row>(repo).findBy([{ name: 'x' }, { name: 'y' }]),
      );
      expect(repo.findBy).toHaveBeenCalledWith([
        { name: 'x', ownerId: 'A' },
        { name: 'y', ownerId: 'A' },
      ]);
    });

    it('save stamps current tenant ownerId', async () => {
      const repo = fakeRepo();
      await TenantContextStore.run({ ownerId: 'A', phone: 'p' }, () =>
        new TenantRepository<Row>(repo).save({ id: '1', name: 'x' }),
      );
      expect(repo.save).toHaveBeenCalledWith({ id: '1', name: 'x', ownerId: 'A' });
    });

    it('throws fail-closed when no context in shared mode', async () => {
      const repo = fakeRepo();
      // 缺上下文时 getOrThrow 在构造查询参数时同步抛出；调用方 await 时表现为 reject。
      await expect(
        (async () => new TenantRepository<Row>(repo).find())(),
      ).rejects.toThrow(/TENANT_CONTEXT_MISSING/);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });
});
