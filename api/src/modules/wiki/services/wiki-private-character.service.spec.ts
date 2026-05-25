import { BadRequestException, ConflictException } from '@nestjs/common';
import { WikiPrivateCharacterService } from './wiki-private-character.service';

// 关注三件事：
//   1) createStrict 重名 → ConflictException（不再走 upsert 静默覆盖）
//   2) createStrict 字段长度上限 → BadRequest
//   3) update 不允许把 name 改成另一行已用的名字（旧逻辑）
// 旧 create() 仍走 upsertByName，保留是为了不破坏内部调用，这里不重测。

type Row = ReturnType<WikiPrivateCharacterService['create']> extends Promise<
  infer T
>
  ? T
  : never;

function makeService(opts: {
  byOwnerName?: Row | null;
  byOwnerNameOnUpdate?: Row | null;
  recordById?: Row | null;
} = {}) {
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(async (q: { where: { id?: string; name?: string } }) => {
      if (q.where.id) return opts.recordById ?? null;
      if (q.where.name) return opts.byOwnerName ?? null;
      return null;
    }),
    create: jest.fn((init: Partial<Row>) => ({ ...init }) as Row),
    save: jest.fn(async (row: Row) => ({ ...row, id: row.id ?? 'new-uuid' }) as Row),
    delete: jest.fn(),
  } as unknown as ConstructorParameters<typeof WikiPrivateCharacterService>[0];
  return new WikiPrivateCharacterService(repo);
}

describe('WikiPrivateCharacterService.createStrict', () => {
  it('rejects duplicate name with Conflict (no silent overwrite)', async () => {
    const existing = {
      id: 'old-1',
      ownerUserId: 'u1',
      name: '苏然',
    } as Row;
    const svc = makeService({ byOwnerName: existing });
    await expect(
      svc.createStrict('u1', { name: '苏然' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates fresh record when name not taken', async () => {
    const svc = makeService({ byOwnerName: null });
    const out = await svc.createStrict('u1', { name: '新角色' });
    expect(out.id).toBe('new-uuid');
    expect(out.name).toBe('新角色');
    expect(out.ownerUserId).toBe('u1');
  });

  it('rejects oversized bio', async () => {
    const svc = makeService({ byOwnerName: null });
    await expect(
      svc.createStrict('u1', { name: '尺寸超限', bio: 'x'.repeat(5000) }),
    ).rejects.toThrow(/超长/);
  });

  it('rejects empty name', async () => {
    const svc = makeService({ byOwnerName: null });
    await expect(svc.createStrict('u1', { name: '   ' })).rejects.toThrow(
      /不能为空/,
    );
  });

  it('rejects zero-width-only name (visually empty)', async () => {
    const svc = makeService({ byOwnerName: null });
    // 走查 v2 发现：'​​' trim() 后非空但视觉为空，列表里出现幽灵行。
    await expect(svc.createStrict('u1', { name: '​​' })).rejects.toThrow(
      /不能为空/,
    );
  });

  it('trims and dedups expertDomains + trims string fields', async () => {
    const svc = makeService({ byOwnerName: null });
    const out = await svc.createStrict('u1', {
      name: '清洗测试',
      avatar: '  🦊  ',
      bio: '  hi  ',
      relationship: '  友人  ',
      expertDomains: ['  编程  ', '编程', '音乐 ', '', '  '],
    });
    expect(out.avatar).toBe('🦊');
    expect(out.bio).toBe('hi');
    expect(out.relationship).toBe('友人');
    expect(out.expertDomains).toEqual(['编程', '音乐']);
  });

  it('rejects control chars in single-line fields (name/relationship/region)', async () => {
    // 走查发现：wiki 私有角色写入路径只过 isVisuallyEmpty + 长度，漏了控制字符。
    // 世界 import-personal 早就拒带 \n 的 name，导致"wiki 存下带换行的 name →
    // 导出 JSON → app 端导入"被世界侧拒，round-trip 单向断裂。共享校验器补上后
    // 两条路径对齐。
    const svc = makeService({ byOwnerName: null });
    await expect(
      svc.createStrict('u1', { name: '行一\n行二' }),
    ).rejects.toThrow(/换行符或控制字符/);
    await expect(
      svc.createStrict('u1', { name: '正常名', relationship: '我的\t朋友' }),
    ).rejects.toThrow(/relationship/);
    await expect(
      svc.createStrict('u1', { name: '正常名', region: '上\n海' }),
    ).rejects.toThrow(/region/);
  });

  it('rejects unsafe avatar scheme (javascript:/data:/file:)', async () => {
    const svc = makeService({ byOwnerName: null });
    // 与前端 isSafeAvatarValue 严格对齐：curl 直传应被服务层 reject。
    await expect(
      svc.createStrict('u1', { name: '安全测试', avatar: 'javascript:alert(1)' }),
    ).rejects.toThrow(/avatar/);
    await expect(
      svc.createStrict('u1', {
        name: '安全测试 2',
        avatar: 'data:image/svg+xml;base64,xxx',
      }),
    ).rejects.toThrow(/avatar/);
  });

  it('rejects invalid socialOpenness / out-of-range social params', async () => {
    const svc = makeService({ byOwnerName: null });
    await expect(
      svc.createStrict('u1', { name: 'so 测试', socialOpenness: 'lolwat' }),
    ).rejects.toThrow(/socialOpenness/);
    await expect(
      svc.createStrict('u1', { name: 'pbc 测试', proactiveBrowseChance: 99 }),
    ).rejects.toThrow(/proactiveBrowseChance/);
    await expect(
      svc.createStrict('u1', { name: 'il 测试', intimacyLevel: -5 }),
    ).rejects.toThrow(/intimacyLevel/);
  });
});

describe('WikiPrivateCharacterService.update', () => {
  // 走查 2026-05-15 发现：update 只检查 trim，不检查 isVisuallyEmpty，
  // 导致 PUT 能把已有角色改名成 ZWS-only "幽灵名"，列表里出现一行空白卡片。
  // createStrict / upsertByName 都已 reject，这里把 update 拉齐。
  it('rejects renaming to zero-width-only name', async () => {
    const existing = {
      id: 'r1',
      ownerUserId: 'u1',
      name: '原名',
      bio: '',
      avatar: '',
    } as Row;
    const svc = makeService({ recordById: existing, byOwnerName: null });
    await expect(
      svc.update('u1', 'r1', { name: '​‌‍' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WikiPrivateCharacterService.parseImportBundle', () => {
  // 走查 2026-05-15 发现：typeof [] === 'object'，导致 array payload 漏过去后
  // 才在"没有 name 字段"那道反馈出来，用户看不懂自己错在哪。明确 reject 数组。
  it('rejects array payload with a clear "not a valid character JSON" message', () => {
    const svc = makeService();
    expect(() => svc.parseImportBundle([1, 2, 3])).toThrow(/合法的角色 JSON/);
  });

  it('accepts a minimal valid bundle', () => {
    const svc = makeService();
    const dto = svc.parseImportBundle({ name: '导入测试' });
    expect(dto.name).toBe('导入测试');
  });
});

describe('WikiPrivateCharacterService.listSummariesForOwner', () => {
  // 性能走查：/my-characters 列表卡只渲染 name/avatar/bio/relationship/
  // relationshipType/expertDomains/updatedAt，从不读 recipe/profile 等大 JSON 列。
  // 实测 5 个带「AI 一键生成」recipe 的角色，列表响应 ~58KB 里 recipe+profile 占
  // ~55KB（94%），卡片真正用到的只有 ~1.1KB。这里锁住 select 把 4 个重列排除掉。
  it('selects only lightweight columns, excluding recipe/profile/aiRelationships/triggerScenes', async () => {
    const find = jest.fn(async () => []);
    const repo = { find } as unknown as ConstructorParameters<
      typeof WikiPrivateCharacterService
    >[0];
    const svc = new WikiPrivateCharacterService(repo);
    await svc.listSummariesForOwner('u1');
    expect(find).toHaveBeenCalledTimes(1);
    const arg = find.mock.calls[0][0] as {
      where: Record<string, unknown>;
      order: Record<string, unknown>;
      select: Record<string, unknown>;
    };
    expect(arg.where).toEqual({ ownerUserId: 'u1' });
    expect(arg.order).toEqual({ updatedAt: 'DESC' });
    // 重列必须缺席（undefined，而非 true），不进 SQL 读取 / 序列化 / 传输。
    expect(arg.select.recipe).toBeUndefined();
    expect(arg.select.profile).toBeUndefined();
    expect(arg.select.aiRelationships).toBeUndefined();
    expect(arg.select.triggerScenes).toBeUndefined();
    // 卡片字段必须在。
    expect(arg.select.name).toBe(true);
    expect(arg.select.avatar).toBe(true);
    expect(arg.select.bio).toBe(true);
    expect(arg.select.relationship).toBe(true);
    expect(arg.select.expertDomains).toBe(true);
    expect(arg.select.updatedAt).toBe(true);
  });
});
