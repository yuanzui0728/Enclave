// i18n-ignore-start: test fixtures — not user-facing UI.
import { OwnerOpenQuestionService } from './owner-open-question.service';

describe('OwnerOpenQuestionService (显式未解决疑问捕获)', () => {
  const NOW = Date.now();
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
  const DAY = 86_400_000;

  function make(opts: {
    storedBlob?: any;
    messages?: Array<{ senderType: string; text: string; createdAt: Date }>;
    llm?: { stillOpen?: any[]; nowAnswered?: any[] };
  }) {
    let savedRaw: string | null =
      opts.storedBlob != null ? JSON.stringify(opts.storedBlob) : null;
    const systemConfig = {
      getConfig: jest.fn(async () => savedRaw),
      setConfig: jest.fn(async (_k: string, v: string) => {
        savedRaw = v;
      }),
    } as any;
    const generateJsonObject = jest.fn(async () => ({
      stillOpen: opts.llm?.stillOpen ?? [],
      nowAnswered: opts.llm?.nowAnswered ?? [],
    }));
    const ai = { generateJsonObject } as any;
    const msgRepo = {
      find: jest.fn(async () => opts.messages ?? []),
    } as any;
    const worldOwnerService = {
      getOwnerOrThrow: jest.fn(async () => ({ id: 'owner-1', username: 'u' })),
    } as any;
    const rulesService = {} as any;
    const svc = new OwnerOpenQuestionService(
      msgRepo,
      ai,
      worldOwnerService,
      systemConfig,
      rulesService,
    );
    return { svc, systemConfig, generateJsonObject, getSaved: () => savedRaw };
  }

  it('listOpenQuestions 只返回 open 且 14 天内的，按最近优先', async () => {
    const { svc } = make({
      storedBlob: {
        items: [
          { id: '1', text: '旧已答', askedAt: iso(2 * DAY), status: 'answered' },
          { id: '2', text: '太久了', askedAt: iso(20 * DAY), status: 'open' },
          { id: '3', text: '近的疑问A', askedAt: iso(3 * DAY), status: 'open' },
          { id: '4', text: '近的疑问B', askedAt: iso(1 * DAY), status: 'open' },
        ],
      },
    });
    const out = await svc.listOpenQuestions();
    expect(out.map((o) => o.text)).toEqual(['近的疑问B', '近的疑问A']);
  });

  it('renderOpenQuestionsBlock 出块含相对时间，空则空串', async () => {
    const { svc } = make({
      storedBlob: {
        items: [{ id: '3', text: '房贷要不要refi', askedAt: iso(3 * DAY), status: 'open' }],
      },
    });
    const block = await svc.renderOpenQuestionsBlock();
    expect(block).toContain('<world_open_questions>');
    expect(block).toContain('房贷要不要refi');
    expect(block).toContain('3天前问过');

    const { svc: empty } = make({ storedBlob: { items: [] } });
    await expect(empty.renderOpenQuestionsBlock()).resolves.toBe('');
  });

  it('runForCurrentOwner 抽到新疑问 → 入库 open', async () => {
    const { svc, getSaved } = make({
      messages: [
        { senderType: 'user', text: '猫指甲多久剪一次?', createdAt: new Date(NOW - 1000) },
        { senderType: 'character', text: '嗯嗯', createdAt: new Date(NOW - 500) },
      ],
      llm: { stillOpen: [{ text: '猫指甲多久剪一次', domainTags: ['宠物'] }] },
    });
    await svc.runForCurrentOwner();
    const saved = JSON.parse(getSaved()!);
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ text: '猫指甲多久剪一次', status: 'open' });
    expect(saved.cursor).toBeTruthy();
  });

  it('runForCurrentOwner LLM 判定 nowAnswered → 之前的 open 翻 answered', async () => {
    const { svc, getSaved } = make({
      storedBlob: {
        items: [{ id: 'q1', text: '房贷要不要refi', askedAt: iso(2 * DAY), status: 'open' }],
      },
      messages: [
        { senderType: 'user', text: '那我去办了', createdAt: new Date(NOW - 1000) },
      ],
      llm: { stillOpen: [], nowAnswered: ['房贷要不要refi'] },
    });
    await svc.runForCurrentOwner();
    const saved = JSON.parse(getSaved()!);
    // answered 会被 prune 丢弃（只保留 open）
    expect(saved.items.find((i: any) => i.id === 'q1')).toBeUndefined();
  });

  it('已存在的同一疑问不重复入库（归一化去重）', async () => {
    const { svc, getSaved } = make({
      storedBlob: {
        items: [{ id: 'q1', text: '房贷要不要refi？', askedAt: iso(1 * DAY), status: 'open' }],
      },
      messages: [{ senderType: 'user', text: '房贷要不要 refi?', createdAt: new Date(NOW - 1000) }],
      llm: { stillOpen: [{ text: '房贷要不要refi' }] },
    });
    await svc.runForCurrentOwner();
    const saved = JSON.parse(getSaved()!);
    expect(saved.items).toHaveLength(1);
  });

  it('无新用户消息 → 不调 LLM', async () => {
    const { svc, generateJsonObject } = make({
      messages: [{ senderType: 'character', text: '在吗', createdAt: new Date(NOW - 1000) }],
    });
    await svc.runForCurrentOwner();
    expect(generateJsonObject).not.toHaveBeenCalled();
  });
});
// i18n-ignore-end
