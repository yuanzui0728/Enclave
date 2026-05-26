import { WorldOwnerService } from './world-owner.service';
import { TenantContextStore } from '../tenancy/tenant-context';
import type { UserEntity } from './user.entity';

// 这组测试盯死全改动里安全等级最高的一行：shared 模式下 getOwnerOrThrow 必须
// fail-closed，绝不回退到「第一个 world_owner 行」（那会把别人的数据当当前用户返回）。
// 以及 ensureSingleOwnerMigration（会删数据）在 shared 模式必须被硬门禁挡住。

type FakeUserRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function makeOwner(id: string, cloudPhone: string | null = null): UserEntity {
  return {
    id,
    cloudPhone,
    userType: 'world_owner',
    createdAt: new Date(),
  } as unknown as UserEntity;
}

function createService(repo: FakeUserRepo) {
  return new WorldOwnerService(repo as never, {} as never);
}

describe('WorldOwnerService tenant resolution', () => {
  const originalMode = process.env.MAIN_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.MAIN_MODE;
    } else {
      process.env.MAIN_MODE = originalMode;
    }
    jest.clearAllMocks();
  });

  it('LPP mode (no context): falls back to the single world_owner row', async () => {
    delete process.env.MAIN_MODE;
    const owner = makeOwner('lpp-owner');
    const repo: FakeUserRepo = {
      findOne: jest.fn().mockResolvedValue(owner),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = createService(repo);

    await expect(service.getOwnerOrThrow()).resolves.toBe(owner);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { userType: 'world_owner' },
      order: { createdAt: 'ASC' },
    });
  });

  it('shared mode + NO context: throws instead of leaking owner #1', async () => {
    process.env.MAIN_MODE = 'shared-world';
    const repo: FakeUserRepo = {
      // 即便库里有 owner 行，shared+无上下文也绝不能查/返回它。
      findOne: jest.fn().mockResolvedValue(makeOwner('owner-1')),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = createService(repo);

    await expect(service.getOwnerOrThrow()).rejects.toMatchObject({
      response: { code: 'TENANT_CONTEXT_MISSING' },
    });
    // 关键：没有按 userType 回退查询第一个 owner。
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('shared mode + context: returns the context owner by id', async () => {
    process.env.MAIN_MODE = 'shared-world';
    const ctxOwner = makeOwner('owner-B', '8613800000002');
    const repo: FakeUserRepo = {
      findOne: jest.fn().mockResolvedValue(ctxOwner),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = createService(repo);

    const result = await TenantContextStore.run(
      { ownerId: 'owner-B', phone: '8613800000002' },
      () => service.getOwnerOrThrow(),
    );

    expect(result).toBe(ctxOwner);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'owner-B' } });
  });

  it('shared mode + context owner missing: throws (no fallback)', async () => {
    process.env.MAIN_MODE = 'shared-world';
    const repo: FakeUserRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = createService(repo);

    await expect(
      TenantContextStore.run({ ownerId: 'ghost', phone: 'x' }, () =>
        service.getOwnerOrThrow(),
      ),
    ).rejects.toMatchObject({ response: { code: 'TENANT_OWNER_NOT_FOUND' } });
  });

  it('ensureSingleOwnerMigration is hard-blocked in shared mode', async () => {
    process.env.MAIN_MODE = 'shared-world';
    const repo: FakeUserRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = createService(repo);

    await expect(service.ensureSingleOwnerMigration()).rejects.toMatchObject({
      response: { code: 'SINGLE_OWNER_MIGRATION_FORBIDDEN_IN_SHARED_MODE' },
    });
    // 没有触碰任何行（没机会删数据）。
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('ensureOwnerForPhone: returns existing owner without creating', async () => {
    process.env.MAIN_MODE = 'shared-world';
    const existing = makeOwner('owner-A', '8613800000001');
    const repo: FakeUserRepo = {
      findOne: jest.fn().mockResolvedValue(existing),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = createService(repo);

    const result = await service.ensureOwnerForPhone('8613800000001');
    expect(result.owner).toBe(existing);
    expect(result.created).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('ensureOwnerForPhone: creates on first touch', async () => {
    process.env.MAIN_MODE = 'shared-world';
    const created = makeOwner('owner-new', '8613800000009');
    const repo: FakeUserRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(created),
    };
    const service = createService(repo);

    const result = await service.ensureOwnerForPhone('8613800000009');
    expect(result.created).toBe(true);
    expect(result.owner).toBe(created);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userType: 'world_owner', cloudPhone: '8613800000009' }),
    );
  });
});
