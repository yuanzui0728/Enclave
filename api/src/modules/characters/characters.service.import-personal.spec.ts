import { CharactersService } from './characters.service';
import type { CharacterEntity } from './character.entity';

// 关注 importPersonalCharacter 在「修复 #1 / #4」后的边界：
//   1) existing.sourceType !== 'private_import' → CONFLICT（拒绝覆盖内置/admin/preset）
//   2) existing.deletionPolicy === 'protected' → CONFLICT
//   3) profile 未给 + recipe 给 → 调 blueprint service 派生 profile，不静默丢
//   4) profile 已给 + recipe 也给 → 用 profile（profile 优先），不调 blueprint
//   5) 字段长度上限触发 → BadRequest

type Char = Partial<CharacterEntity> & { id: string; name: string };

function makeService(opts: {
  existing?: Char | null;
  ownerId?: string;
  buildProfileSpy?: jest.Mock;
} = {}) {
  const repo = {
    findOne: jest.fn(async () => opts.existing ?? null),
    save: jest.fn(async (row: Char) => row),
    create: jest.fn((init: Char) => init),
  };
  const friendshipRepo = {
    findOne: jest.fn(async () => null),
    save: jest.fn(async (x: unknown) => x),
    create: jest.fn((init: unknown) => init),
  };
  const worldOwnerService = {
    getOwnerOrThrow: jest.fn(async () => ({ id: opts.ownerId ?? 'owner-1' })),
  };
  const dataSource = { transaction: jest.fn() };
  const realWorldRuntimeProfile = {};
  const buildProfileSpy =
    opts.buildProfileSpy ?? jest.fn(() => ({ derived: true }));
  const blueprintService = {
    buildProfileFromRecipe: buildProfileSpy,
  };

  // CharactersService 的构造签名：(repo, friendshipRepo, worldOwnerService,
  // dataSource, realWorldRuntimeProfile, blueprintService)
  const svc = new CharactersService(
    repo as never,
    friendshipRepo as never,
    worldOwnerService as never,
    dataSource as never,
    realWorldRuntimeProfile as never,
    blueprintService as never,
  );
  return { svc, repo, buildProfileSpy };
}

describe('CharactersService.importPersonalCharacter', () => {
  it('rejects when existing same-name character is not private_import', async () => {
    const { svc } = makeService({
      existing: {
        id: 'preset-celeb-001',
        name: '苏然',
        sourceType: 'preset_catalog',
        deletionPolicy: 'archive_allowed',
      } as Char,
    });
    await expect(
      svc.importPersonalCharacter({ name: '苏然' }),
    ).rejects.toThrow(/已存在同名角色/);
  });

  it('rejects when existing is protected', async () => {
    const { svc } = makeService({
      existing: {
        id: 'self-id',
        name: '我',
        sourceType: 'default_seed',
        deletionPolicy: 'protected',
      } as Char,
    });
    await expect(
      svc.importPersonalCharacter({ name: '我' }),
    ).rejects.toThrow(/受保护/);
  });

  it('ignores user-supplied deletionPolicy and isTemplate (footgun guards)', async () => {
    // 走查 R1：手工 bundle 加 "deletionPolicy":"protected" 会让下次 re-import 永远 409；
    // "isTemplate":true 让角色在 friend list / 通讯录 / 角色目录全消失。
    // import-personal 直接丢弃这俩字段，让 entity 的默认值 (archive_allowed / false) 生效。
    const { svc, repo } = makeService({ existing: null });
    const out = await svc.importPersonalCharacter({
      name: '小狗',
      deletionPolicy: 'protected',
      isTemplate: true,
    });
    expect(out.character.deletionPolicy).toBe('archive_allowed');
    expect(out.character.isTemplate).toBe(false);
    // 当然，重新 import 同名应该能覆盖
    const created = (repo.create as jest.Mock).mock.calls[0][0] as Char;
    expect(created.deletionPolicy).toBe('archive_allowed');
    expect(created.isTemplate).toBe(false);
  });

  it('rejects bad onlineMode / activityMode enum values', async () => {
    // 走查 R1：socialOpenness 走 enum 白名单，但 onlineMode / activityMode 历史上接
    // 任意字符串。下游 === 'manual' 检查会让脏值都掉到 auto 分支，功能上不崩，但 DB
    // 里堆 "ALWAYS_ONLINE_OMG" 这种垃圾枚举。和 socialOpenness 同样走白名单。
    const { svc } = makeService({ existing: null });
    await expect(
      svc.importPersonalCharacter({ name: '小白', onlineMode: 'ALWAYS_ON' }),
    ).rejects.toThrow(/onlineMode/);
    await expect(
      svc.importPersonalCharacter({ name: '小黑', activityMode: 'YOLO' }),
    ).rejects.toThrow(/activityMode/);
    // auto / manual 都 OK
    await expect(
      svc.importPersonalCharacter({ name: '小灰', onlineMode: 'manual' }),
    ).resolves.toBeDefined();
  });

  it('rejects bad currentActivity enum value', async () => {
    // 走查：currentActivity 是 working/eating/resting/commuting/free/sleeping 状态机枚举
    // （UI chip + scene-matching ACTIVITY_AFFINITY 弱信号键）。历史上只查控制字符不查枚举值，
    // 手搓 bundle 写任意字符串都能落库。和 onlineMode / activityMode 同款走白名单。
    const { svc } = makeService({ existing: null });
    await expect(
      svc.importPersonalCharacter({ name: '小紫', currentActivity: 'PARTYING' }),
    ).rejects.toThrow(/currentActivity/);
    // 合法值放过
    await expect(
      svc.importPersonalCharacter({ name: '小青', currentActivity: 'free' }),
    ).resolves.toBeDefined();
    // 空串视作「清空」，不应被枚举校验拦下
    await expect(
      svc.importPersonalCharacter({ name: '小橙', currentActivity: '' }),
    ).resolves.toBeDefined();
  });

  it('rejects aiRelationships above the size cap', async () => {
    // 走查 R1：aiRelationships 是独立列、不进 profile JSON cap，500+ relation
    // 都能落库；social-graph tick 会按这个数组迭代，超量值是显著 CPU 放大器。
    const { svc } = makeService({ existing: null });
    const tooMany = Array.from({ length: 60 }, (_, i) => ({
      characterId: `private-fake-${i}`,
      relationshipType: 'friend',
      strength: 0.5,
    }));
    await expect(
      svc.importPersonalCharacter({ name: '小红', aiRelationships: tooMany }),
    ).rejects.toThrow(/aiRelationships/);
    // 50 个正好等于上限，应该通过
    const exact = tooMany.slice(0, 50);
    await expect(
      svc.importPersonalCharacter({ name: '小绿', aiRelationships: exact }),
    ).resolves.toBeDefined();
  });

  it('rejects intimacyLevel float (silent SQLite truncation guard)', async () => {
    // 新会话 R1 走查：character.entity 的 intimacyLevel 列被 TypeORM 推成
    // INTEGER，bundle 写 1.5 在 SQLite 上 INSERT 后回读得到 1 —— 用户填的
    // 小数精度无声损失。明确拒，给一个 BadRequest 让用户纠正。
    const { svc } = makeService({ existing: null });
    await expect(
      svc.importPersonalCharacter({ name: '小数', intimacyLevel: 1.5 }),
    ).rejects.toThrow(/整数/);
    // 整数仍 OK
    await expect(
      svc.importPersonalCharacter({ name: '整数', intimacyLevel: 25 }),
    ).resolves.toBeDefined();
    // 范围越界优先级仍走"必须在 0 - 100 之间"
    await expect(
      svc.importPersonalCharacter({ name: '越界', intimacyLevel: 150 }),
    ).rejects.toThrow(/0 - 100/);
  });

  it('rejects currentActivity / triggerScenes items containing control characters', async () => {
    // 第 4 次走查 R2：currentActivity 是状态 chip（"working"/"sleeping" 等），
    // triggerScenes 是 scene id 列表（"coffee_shop"/"gym"），都是单行 UI 文本。
    // 和 relationship / expertDomains items 同档拒控制字符。
    const { svc } = makeService({ existing: null });
    await expect(
      svc.importPersonalCharacter({
        name: '小白',
        currentActivity: 'sleeping\nworking',
      }),
    ).rejects.toThrow(/currentActivity/);
    await expect(
      svc.importPersonalCharacter({
        name: '小白',
        triggerScenes: ['coffee_shop', 'gym\nlibrary'],
      }),
    ).rejects.toThrow(/triggerScenes/);
    // triggerScenes 空字符串元素也要 filter
    const out = await svc.importPersonalCharacter({
      name: '小蓝',
      triggerScenes: ['coffee_shop', '', '  ', 'gym'],
    });
    expect(out.character.triggerScenes).toEqual(['coffee_shop', 'gym']);
  });

  it('rejects relationship / relationshipType containing control characters', async () => {
    // 第 3 次走查 R1：name 已卡，但 relationship / relationshipType 这俩单行
    // UI 文本字段没卡，"我的\n朋友" 落库后通讯录单行 chip 渲染撑高、AI prompt
    // 拼接被多行注入。和 name 同档拒。
    const { svc } = makeService({ existing: null });
    await expect(
      svc.importPersonalCharacter({
        name: '小白',
        relationship: '我的\n朋友',
      }),
    ).rejects.toThrow(/relationship/);
    await expect(
      svc.importPersonalCharacter({
        name: '小白',
        relationshipType: 'bff\tclose',
      }),
    ).rejects.toThrow(/relationshipType/);
  });

  it('filters empty expertDomains items and rejects control chars in them', async () => {
    // 第 3 次走查 R1：filter 之前只过 typeof string，不过 trim 长度，导致
    // ["valid","","alsovalid"] 落库后通讯录渲染一个零宽 tag pill。
    // 同时元素本身也不能带控制字符（chip 渲染撑高）。
    const { svc } = makeService({ existing: null });
    const out = await svc.importPersonalCharacter({
      name: '小白',
      expertDomains: ['valid', '', 'alsovalid', '   '],
    });
    expect(out.character.expertDomains).toEqual(['valid', 'alsovalid']);
    await expect(
      svc.importPersonalCharacter({
        name: '小绿',
        expertDomains: ['ok', 'bad\nval'],
      }),
    ).rejects.toThrow(/expertDomains/);
  });

  it('dedups and self-ref-strips aiRelationships', async () => {
    // 第 3 次走查 R1：
    //   - 同一 characterId 写多条不同 strength 都能落库 → Map 按 last-wins dedup
    //   - aiRelationships 包含 saved.id 形成 self-loop → 后置 filter 剥掉
    const captured: Char[] = [];
    const { svc } = makeService({ existing: null });
    // 让 repo.save 模拟 echo saved 对象、记录调用以便断言 self-ref 被剥
    (svc as unknown as { repo: { save: jest.Mock } }).repo.save = jest.fn(
      async (row: Char) => {
        captured.push({ ...row });
        return row;
      },
    );
    const out = await svc.importPersonalCharacter({
      name: '小白',
      aiRelationships: [
        { characterId: 'private-X', relationshipType: 'friend', strength: 0.3 },
        { characterId: 'private-X', relationshipType: 'close', strength: 0.9 },
        { characterId: 'private-Y', relationshipType: 'friend', strength: 0.5 },
      ],
    });
    // 落库的最终 aiRelationships 中：X 只剩 1 条（last-wins），Y 1 条
    expect(out.character.aiRelationships).toEqual([
      { characterId: 'private-X', relationshipType: 'close', strength: 0.9 },
      { characterId: 'private-Y', relationshipType: 'friend', strength: 0.5 },
    ]);
  });

  it('always overwrites profile.characterId with the entity id', async () => {
    // 第 3 次走查 R1：之前只在 profile.characterId 为空时回填，注释说"允许用户
    // 在 wiki 端 finalize"，但 wiki UI 不暴露该字段，唯一能写它的就是手工
    // bundle。写一个不匹配 entity.id 的值会让 chat orchestrator resolveRuntimeProvider
    // 失配，character_override 路由静默掉。强制让 profile.characterId ≡ saved.id。
    const { svc } = makeService({ existing: null });
    const out = await svc.importPersonalCharacter({
      name: '小白',
      profile: {
        characterId: 'private-COMPLETELY-FAKE',
        name: 'X',
        relationship: 'r',
        basePrompt: 'b',
      } as never,
    });
    expect(out.character.profile.characterId).toBe(out.character.id);
  });

  it('rejects names containing control characters (\\n, \\t, \\r)', async () => {
    // 走查 R1：原来 name 没卡控制字符，"line1\nline2" 被允许写入，落库后
    // 通讯录单行 title 渲染会撑高列表项，AI prompt 也会被多行指令注入。
    const { svc } = makeService({ existing: null });
    for (const bad of ['line1\nline2', 'tab\there', 'cr\rdone', '\x01start']) {
      await expect(svc.importPersonalCharacter({ name: bad })).rejects.toThrow(
        /换行符或控制字符/,
      );
    }
  });

  it('overwrites when existing is private_import', async () => {
    const { svc, repo } = makeService({
      existing: {
        id: 'private-old',
        name: '苏然',
        sourceType: 'private_import',
        deletionPolicy: 'archive_allowed',
        bio: 'old bio',
      } as Char,
    });
    const out = await svc.importPersonalCharacter({
      name: '苏然',
      bio: 'new bio',
    });
    expect(out.overwrote).toBe(true);
    expect(out.character.bio).toBe('new bio');
    expect(repo.save).toHaveBeenCalled();
  });

  it('derives profile from recipe when profile is missing', async () => {
    // 第 5 次走查 R2：import 路径用 hasMeaningfulProfile 守门，sentinel
    // object 必须带至少一个 canonical 字段（name / basePrompt / coreLogic /
    // systemPrompt / scenePrompts.chat）才会被保留，否则会 fall through 到
    // baseline。spec 用 name+derived 双标记：既保留语义又能验证派生路径。
    const buildProfileSpy = jest.fn(
      () => ({ name: '新角色', derived: true } as never),
    );
    const { svc, buildProfileSpy: spy } = makeService({
      existing: null,
      buildProfileSpy,
    });
    const recipe = {
      identity: {
        name: '新角色',
        relationship: '朋友',
        relationshipType: 'friend',
      },
      // 真 recipe 还有更多字段，但这里只为验证 buildProfileFromRecipe 被调用
    } as never;
    const out = await svc.importPersonalCharacter({
      name: '新角色',
      recipe,
    });
    expect(spy).toHaveBeenCalledWith(recipe, '新角色');
    // saved character 的 profile 应来自派生（characterId 由 import 在 save
    // 之后回填，2026-05-16 修复，对应 saved.id）
    const savedProfile = (out.character as Char).profile as Record<string, unknown>;
    expect(savedProfile).toMatchObject({ derived: true });
    expect(savedProfile.characterId).toBe(out.character.id);
  });

  it('prefers explicit profile over recipe (does not derive)', async () => {
    const buildProfileSpy = jest.fn(
      () => ({ name: '新角色', derived: true } as never),
    );
    const { svc } = makeService({ existing: null, buildProfileSpy });
    const out = await svc.importPersonalCharacter({
      name: '新角色',
      recipe: { foo: 'bar' } as never,
      // explicit profile 同样要带 canonical 字段才会被 hasMeaningfulProfile
      // 认作"用户给了能跑的人设"——空对象的 case 由后续单独的 spec 覆盖。
      profile: { name: '新角色', explicit: true } as never,
    });
    expect(buildProfileSpy).not.toHaveBeenCalled();
    const savedProfile = (out.character as Char).profile as Record<string, unknown>;
    expect(savedProfile).toMatchObject({ explicit: true });
    // characterId 也会被 import 路径补成 entity.id（非 undefined）
    expect(savedProfile.characterId).toBe(out.character.id);
  });

  it('rejects oversized bio at the validation gate', async () => {
    const { svc } = makeService({ existing: null });
    await expect(
      svc.importPersonalCharacter({
        name: '苏然',
        bio: 'x'.repeat(3000),
      }),
    ).rejects.toThrow(/超长/);
  });

  // 2026-05-16 修复：wiki 早期版本写入路径只填 name/bio，recipe/profile 都是
  // 空；之前导入这种 bundle 时新角色落库 profile={}，chat 路径 system_prompt
  // 渲染出 "你是 undefined" 直接黑掉。现在 import 路径要兜底合成最小可用 profile。
  it('synthesizes baseline profile when bundle has neither profile nor recipe', async () => {
    const buildProfileSpy = jest.fn(() => ({ shouldNotBeCalled: true } as never));
    const { svc, buildProfileSpy: spy } = makeService({
      existing: null,
      buildProfileSpy,
    });
    const out = await svc.importPersonalCharacter({
      name: '小白',
      relationship: '同事',
      bio: '北京的产品经理',
      personality: '理性',
      expertDomains: ['产品', '心理学'],
    });
    expect(spy).not.toHaveBeenCalled();
    const profile = (out.character as Char).profile as Record<string, unknown>;
    expect(profile).toBeTruthy();
    expect(profile.name).toBe('小白');
    expect(profile.relationship).toBe('同事');
    expect(profile.expertDomains).toEqual(['产品', '心理学']);
    expect(profile.basePrompt).toContain('小白');
    expect(profile.basePrompt).toContain('同事');
    expect(profile.basePrompt).toContain('理性');
    expect(profile.basePrompt).toContain('北京的产品经理');
    expect((profile.traits as Record<string, unknown>).emotionalTone).toBe('自然真实');
  });

  // 第 5 次走查 R2：bundle 显式带 profile:{}（手工 bundle 误传 / 老版 wiki 半残
  // 导出）原条件 input.profile !== undefined 会把空对象当 truthy 透传，跳过
  // baseline + 同名 re-import 时还把 existing 的 meaningful profile 抹平。
  it('synthesizes baseline when profile is explicit empty object', async () => {
    const { svc } = makeService({ existing: null });
    const out = await svc.importPersonalCharacter({
      name: '小空',
      relationship: '老同学',
      bio: '画家',
      profile: {} as never,
    });
    const profile = (out.character as Char).profile as Record<string, unknown>;
    expect(profile.name).toBe('小空');
    expect(profile.basePrompt).toContain('小空');
    expect(profile.basePrompt).toContain('老同学');
    expect((profile.traits as Record<string, unknown>).emotionalTone).toBe(
      '自然真实',
    );
  });

  it('keeps existing meaningful profile when re-import sends profile:{}', async () => {
    const { svc } = makeService({
      existing: {
        id: 'char-existing',
        name: '小留',
        sourceType: 'private_import',
        deletionPolicy: 'archive_allowed',
        profile: {
          characterId: 'char-existing',
          name: '小留',
          relationship: '挚友',
          coreLogic: '资深 mentor',
          memory: {
            coreMemory: '对方爱看老电影',
            recentSummary: '上周聊了《老炮儿》',
            forgettingCurve: 0,
          },
          traits: {
            speechPatterns: [],
            catchphrases: [],
            topicsOfInterest: [],
            emotionalTone: 'warm',
            responseLength: 'medium',
            emojiUsage: 'occasional',
          },
        },
      } as Char,
    });
    const out = await svc.importPersonalCharacter({
      name: '小留',
      bio: 'updated bio',
      profile: {} as never,
    });
    const profile = (out.character as Char).profile as Record<string, unknown>;
    // 关键：existing 的 coreLogic / memory 不能被空 profile 洗掉
    expect(profile.coreLogic).toBe('资深 mentor');
    expect((profile.memory as Record<string, unknown>).coreMemory).toBe(
      '对方爱看老电影',
    );
    expect(out.character.bio).toBe('updated bio');
  });

  // 2026-05-16 修复：tryDeriveProfileFromRecipe 抛出（典型场景：wiki strip 过
  // recipe.tone）时不应让 import 整体 500，而是回落到合成 baseline。
  it('falls back to baseline when recipe derivation throws', async () => {
    const buildProfileSpy = jest.fn(() => {
      throw new Error('Cannot read properties of undefined (reading "coreDirective")');
    });
    const { svc } = makeService({ existing: null, buildProfileSpy });
    const out = await svc.importPersonalCharacter({
      name: '小蓝',
      relationship: '邻居',
      recipe: { identity: { name: '小蓝' } } as never,
    });
    const profile = (out.character as Char).profile as Record<string, unknown>;
    // 合成 baseline 至少要补 name/relationship/traits 三件套，下游 prompt-builder
    // 拿到不会再渲染 "你是 undefined"。
    expect(profile.name).toBe('小蓝');
    expect(profile.relationship).toBe('邻居');
    expect(profile.traits).toBeTruthy();
  });

  // 2026-05-16 修复：同名 re-import 时，bundle 没带 profile/recipe 不能用
  // baseline 把现存 profile 整盘覆盖（会丢 chat memory compression 累积的
  // memory.recentSummary + 用户填的 coreLogic）。
  it('preserves existing meaningful profile on bare re-import', async () => {
    const existingProfile = {
      characterId: 'private-old',
      name: '苏然',
      relationship: '朋友',
      coreLogic: '用户填的 coreLogic',
      memory: { coreMemory: '记得用户喜欢冷笑话', recentSummary: '昨天聊了天气', forgettingCurve: 70 },
      traits: { speechPatterns: [], catchphrases: [], topicsOfInterest: [], emotionalTone: '冷静', responseLength: 'medium', emojiUsage: 'occasional' },
    };
    const { svc, repo } = makeService({
      existing: {
        id: 'private-old',
        name: '苏然',
        sourceType: 'private_import',
        deletionPolicy: 'archive_allowed',
        profile: existingProfile,
      } as Char,
    });
    const out = await svc.importPersonalCharacter({
      name: '苏然',
      bio: '更新一下 bio',
    });
    expect(out.overwrote).toBe(true);
    const profile = (out.character as Char).profile as Record<string, unknown>;
    // memory 和 coreLogic 保留
    expect(profile.coreLogic).toBe('用户填的 coreLogic');
    expect((profile.memory as Record<string, unknown>).coreMemory).toBe('记得用户喜欢冷笑话');
    expect((profile.memory as Record<string, unknown>).recentSummary).toBe('昨天聊了天气');
    // bio 字段已经更新
    expect((out.character as Char).bio).toBe('更新一下 bio');
    expect(repo.save).toHaveBeenCalled();
  });

  // 2026-05-16 修复：re-import 带新 profile 时，旧 memory 子树应 merge 回新 profile，
  // 不能因为用户改了 personality 就把 AI 记忆全冲掉。
  it('merges existing memory into newly imported profile', async () => {
    const existingProfile = {
      characterId: 'private-old',
      name: '苏然',
      memory: { coreMemory: '老的核心记忆', recentSummary: '老的近期记忆', forgettingCurve: 70 },
      traits: { speechPatterns: [], catchphrases: [], topicsOfInterest: [], emotionalTone: '', responseLength: 'medium', emojiUsage: 'occasional' },
    };
    const { svc } = makeService({
      existing: {
        id: 'private-old',
        name: '苏然',
        sourceType: 'private_import',
        deletionPolicy: 'archive_allowed',
        profile: existingProfile,
      } as Char,
    });
    const out = await svc.importPersonalCharacter({
      name: '苏然',
      profile: {
        characterId: 'private-old',
        name: '苏然',
        coreLogic: '新的 coreLogic',
        traits: { speechPatterns: [], catchphrases: [], topicsOfInterest: [], emotionalTone: '活泼', responseLength: 'medium', emojiUsage: 'occasional' },
      } as never,
    });
    const profile = (out.character as Char).profile as Record<string, unknown>;
    expect(profile.coreLogic).toBe('新的 coreLogic');
    expect((profile.memory as Record<string, unknown>)?.coreMemory).toBe('老的核心记忆');
    expect((profile.memory as Record<string, unknown>)?.recentSummary).toBe('老的近期记忆');
  });

  // 第 4 次走查 R1：之前的"new profile 没 memory 就保留 existing" 条件
  // `!patch.profile.memory` 在 recipe 派生路径下永远 false（applyRecipeToCharacter
  // 总会写一个 memory={recentSummary:'', coreMemory:'', forgettingCurve:N, ...Prompt}
  // 子对象，wiki strip 后运行时字段是空串）。结果：用户聊一段累出 recentSummary，
  // 重新导入 wiki bundle（即便只改 bio）就把 chat memory 冲没。
  // 修复后：运行时字段（recentSummary/coreMemory）patch 为空时保留 existing，
  // 配置字段（forgettingCurve/recentSummaryPrompt/coreMemoryPrompt）正常用 patch。
  it('preserves runtime memory when re-imported profile has empty memory fields', async () => {
    const existingProfile = {
      characterId: 'private-old',
      name: '苏然',
      memory: {
        coreMemory: '用户每周三晚 8 点聊天',
        recentSummary: '她记得用户喜欢冷笑话',
        forgettingCurve: 70,
      },
    };
    const { svc } = makeService({
      existing: {
        id: 'private-old',
        name: '苏然',
        sourceType: 'private_import',
        deletionPolicy: 'archive_allowed',
        profile: existingProfile,
      } as Char,
    });
    const out = await svc.importPersonalCharacter({
      name: '苏然',
      // 模拟 recipe 派生出来的 profile：memory 子对象存在但运行时字段是空
      // string，配置字段被 wiki UI 改过。
      profile: {
        characterId: 'private-old',
        name: '苏然',
        memory: {
          recentSummary: '',
          coreMemory: '',
          forgettingCurve: 85, // 用户调过
          recentSummaryPrompt: '新的提示词',
        },
      } as never,
    });
    const memory = (out.character as Char).profile?.memory as Record<
      string,
      unknown
    >;
    // 运行时字段：保留 existing（patch 是空串，不覆盖）
    expect(memory.coreMemory).toBe('用户每周三晚 8 点聊天');
    expect(memory.recentSummary).toBe('她记得用户喜欢冷笑话');
    // 配置字段：用 patch
    expect(memory.forgettingCurve).toBe(85);
    expect(memory.recentSummaryPrompt).toBe('新的提示词');
  });

  // 新会话 R1：avatar 不能是 // 开头的 scheme-relative URL（浏览器按当前协议
  // 解析成 https://evil/x → 跟踪像素 / 隐私探针 / 内网 SSRF）。
  // 新会话2 R1 扩展：还要堵 /\、\/、\\ 三个 backslash 变体（WHATWG URL parser
  // 全部归一化成 //）。
  it('rejects scheme-relative avatar URL variants', async () => {
    const { svc } = makeService({ existing: null });
    for (const bad of [
      '//evil.example/x.png',
      '/\\evil.example/x.png',
      '\\/evil.example/x.png',
      '\\\\evil.example/x.png',
    ]) {
      await expect(
        svc.importPersonalCharacter({
          name: 'NRRejSchemeRel_' + Buffer.from(bad).toString('hex').slice(0, 6),
          avatar: bad,
        }),
      ).rejects.toThrow(/avatar/);
    }
  });

  // 新会话 R1：bio / personality 接受 NULL byte / DEL / BIDI override 等不可见
  // 控制字节会污染 AI prompt + tokenizer，入口 strip 掉，正常文本保留。
  it('strips invisible control chars from bio / personality but keeps \\t\\n\\r', async () => {
    const { svc } = makeService({ existing: null });
    const out = await svc.importPersonalCharacter({
      name: 'NRStripCtl',
      bio: 'normal\x00hidden\nline2\tcol',
      personality: 'real\x7Fdel-bidi‮-mark',
    });
    // NULL / DEL / RLO 都被 strip；\n \t 保留
    expect(out.character.bio).toBe('normalhidden\nline2\tcol');
    expect(out.character.personality).toBe('realdel-bidi-mark');
  });

  // 新会话3 R1：profile / recipe 内层字符串（basePrompt / coreLogic /
  // memory.recentSummary / traits 数组）也直接进 AI prompt，必须递归 strip。
  it('strips invisible control chars deep in profile object', async () => {
    const { svc } = makeService({ existing: null });
    const out = await svc.importPersonalCharacter({
      name: 'NRStripDeep',
      profile: {
        name: 'NRStripDeep',
        basePrompt: 'be\x00fore',
        coreLogic: 'core\x7Flogic',
        memory: {
          recentSummary: 'rec\x00ent',
          coreMemory: 'co‮re',
        },
        traits: {
          speechPatterns: ['ab\x00cd', 'ef‮gh'],
          catchphrases: [],
          topicsOfInterest: [],
          emotionalTone: 'warm',
          responseLength: 'medium',
          emojiUsage: 'occasional',
        },
      } as never,
    });
    const prof = out.character.profile as Record<string, unknown>;
    expect(prof.basePrompt).toBe('before');
    expect(prof.coreLogic).toBe('corelogic');
    expect((prof.memory as Record<string, unknown>).recentSummary).toBe('recent');
    expect((prof.memory as Record<string, unknown>).coreMemory).toBe('core');
    expect((prof.traits as Record<string, unknown>).speechPatterns).toEqual([
      'abcd',
      'efgh',
    ]);
    // 正常字段不受影响（保留 \n \t + emoji）
    expect((prof.traits as Record<string, unknown>).emotionalTone).toBe('warm');
  });
});
