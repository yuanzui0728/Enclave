import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm';
import { TenantOwnershipSubscriber } from './tenant-ownership.subscriber';
import { TenantContextStore } from './tenant-context';
import { TenantRepository } from './tenant-scoped.repository';
import { registerTenantScopedEntity } from './tenant-scoped.decorator';

// 用真实 better-sqlite3 内存库 + TypeORM 验证多租户隔离的核心安全属性：写盖章、
// 跨租户写/读 fail-closed、scoped 查询只回本租户行。这是「用户之间互不可见」的可执行
// 规约，也是读改写的验证基线。用一个最小测试实体（避开真实实体的非空列噪音），
// 验证的是 TenantRepository + TenantOwnershipSubscriber 这套通用机制本身。
@Entity('tenant_iso_rows')
class IsoRow {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

  @Column({ type: 'text' })
  content: string;
}

describe('tenant isolation (real sqlite + TypeORM subscriber)', () => {
  const originalMode = process.env.MAIN_MODE;
  let ds: DataSource;
  const A = 'owner-A';
  const B = 'owner-B';

  beforeAll(async () => {
    process.env.MAIN_MODE = 'shared-world';
    registerTenantScopedEntity(IsoRow);

    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [IsoRow],
      synchronize: true,
      subscribers: [TenantOwnershipSubscriber],
    });
    await ds.initialize();

    // 无租户上下文播种（subscriber 在 ctx 为空时放行），显式写两个 owner 的数据。
    const repo = ds.getRepository(IsoRow);
    await repo.save([
      repo.create({ id: 'm-a1', ownerId: A, content: 'A-secret-1' }),
      repo.create({ id: 'm-a2', ownerId: A, content: 'A-secret-2' }),
      repo.create({ id: 'm-b1', ownerId: B, content: 'B-secret-1' }),
    ]);
  });

  afterAll(async () => {
    await ds?.destroy();
    if (originalMode === undefined) delete process.env.MAIN_MODE;
    else process.env.MAIN_MODE = originalMode;
  });

  it('scoped find returns only the current tenant rows', async () => {
    const rows = await TenantContextStore.run({ ownerId: A, phone: 'pa' }, () =>
      new TenantRepository(ds.getRepository(IsoRow)).find(),
    );
    expect(rows.map((r) => r.id).sort()).toEqual(['m-a1', 'm-a2']);
    expect(rows.every((r) => r.ownerId === A)).toBe(true);
  });

  it('afterLoad guard THROWS when an unscoped query loads another owner row', async () => {
    await expect(
      TenantContextStore.run({ ownerId: A, phone: 'pa' }, () =>
        // 裸 repo（不注入 ownerId）→ 会把 B 的行也读出来 → afterLoad 拦截。
        ds.getRepository(IsoRow).find(),
      ),
    ).rejects.toThrow(/TENANT_READ_LEAK/);
  });

  it('scoped findOne cannot fetch another owner row by id', async () => {
    const row = await TenantContextStore.run({ ownerId: A, phone: 'pa' }, () =>
      new TenantRepository(ds.getRepository(IsoRow)).findOne({
        where: { id: 'm-b1' },
      }),
    );
    expect(row).toBeNull();
  });

  it('scoped save stamps the current tenant ownerId', async () => {
    const saved = await TenantContextStore.run({ ownerId: A, phone: 'pa' }, () =>
      new TenantRepository(ds.getRepository(IsoRow)).save({
        id: 'm-a3',
        content: 'A-3',
      }),
    );
    expect((saved as { ownerId?: string }).ownerId).toBe(A);
  });

  it('beforeInsert guard blocks writing a row owned by another tenant', async () => {
    await expect(
      TenantContextStore.run({ ownerId: A, phone: 'pa' }, () =>
        ds.getRepository(IsoRow).save(
          ds.getRepository(IsoRow).create({
            id: 'm-evil',
            ownerId: B, // 伪造成 B 的行 → 必须被拦
            content: 'evil',
          }),
        ),
      ),
    ).rejects.toThrow(/TENANT_WRITE_OWNER_MISMATCH/);
  });

  it('owner B sees only its own row, never A secrets', async () => {
    const rows = await TenantContextStore.run({ ownerId: B, phone: 'pb' }, () =>
      new TenantRepository(ds.getRepository(IsoRow)).find(),
    );
    expect(rows.map((r) => r.id)).toEqual(['m-b1']);
    expect(JSON.stringify(rows)).not.toContain('A-secret');
  });
});
