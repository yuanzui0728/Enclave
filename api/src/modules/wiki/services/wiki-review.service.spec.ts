import { AppError } from '../../../common/app-error.exception';
import { WikiReviewService } from './wiki-review.service';

// Build a service instance with stubbed deps so we can drive private 3RR
// assertion via the public `revert` entry. We stop early once the 3RR
// branch decides — we don't need to fully simulate the rest of the flow.
function makeReviewService(opts: {
  revertCountIn24h?: number;
} = {}) {
  const dataSource = {
    transaction: jest.fn(),
  };
  const revisionRepo = {
    count: jest.fn().mockResolvedValue(opts.revertCountIn24h ?? 0),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 1 }),
    })),
  };
  const submissionRepo = { findOne: jest.fn() };
  const pageRepo = { findOne: jest.fn() };
  const profileRepo = {};
  const edits = {
    applyApprovedRevision: jest.fn(),
    applySnapshotToCharacter: jest.fn(),
  };
  const roles = { checkPromotion: jest.fn() };
  const protection = { setProtection: jest.fn() };
  const systemUsers = {
    systemActor: () => ({
      id: 'user_wiki_antivandal_bot',
      role: 'admin',
      username: '__system__',
      userType: 'system',
    }),
  };
  const fieldProtection = {
    assertCanEditPaths: jest.fn().mockResolvedValue(undefined),
  };
  const characterRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'char_x',
      name: '',
      avatar: '',
      bio: '',
      relationship: '',
      relationshipType: '',
      expertDomains: [],
    }),
  };
  const svc = new WikiReviewService(
    dataSource as never,
    revisionRepo as never,
    submissionRepo as never,
    pageRepo as never,
    profileRepo as never,
    edits as never,
    roles as never,
    protection as never,
    systemUsers as never,
    fieldProtection as never,
    characterRepo as never,
  );
  return { svc, revisionRepo, pageRepo, protection, fieldProtection };
}

// 取被抛 AppError 的 code，若不是 AppError 返回 'none'。
async function expectThrownCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AppError) {
      const body = err.getResponse() as { code?: string };
      return body?.code ?? 'unknown';
    }
    return 'non-app-error';
  }
  return 'none';
}

describe('WikiReviewService.revert 3RR detection', () => {
  it('rejects when patroller has already reverted 3 times in 24h', async () => {
    const { svc } = makeReviewService({ revertCountIn24h: 3 });
    const code = await expectThrownCode(
      svc.revert(
        'char_x',
        { id: 'u_pat', role: 'patroller', username: 'p' } as never,
        { toRevisionId: 'rev_a', reason: 'test' },
      ),
    );
    expect(code).toBe('WIKI_FORBIDDEN');
  });

  it('admin is exempt from 3RR', async () => {
    const { svc, revisionRepo } = makeReviewService({ revertCountIn24h: 99 });
    revisionRepo.findOne.mockResolvedValue(null); // bail out at next step (404)
    const code = await expectThrownCode(
      svc.revert(
        'char_x',
        { id: 'u_admin', role: 'admin', username: 'a' } as never,
        { toRevisionId: 'rev_a', reason: 'test' },
      ),
    );
    // admin 走过 3RR，应在下一步 "目标版本不存在" 报 NOT_FOUND，而不是 FORBIDDEN
    expect(code).toBe('WIKI_REVIEW_NOT_FOUND');
  });

  it('counts only revert operations in last 24h', async () => {
    const { svc, revisionRepo } = makeReviewService({ revertCountIn24h: 2 });
    revisionRepo.findOne.mockResolvedValue(null); // proceed past 3RR, bail at target lookup
    const code = await expectThrownCode(
      svc.revert(
        'char_x',
        { id: 'u_pat', role: 'patroller', username: 'p' } as never,
        { toRevisionId: 'rev_a', reason: 'test' },
      ),
    );
    expect(code).toBe('WIKI_REVIEW_NOT_FOUND');
    expect(revisionRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          characterId: 'char_x',
          operation: 'revert',
          editorUserId: 'u_pat',
        }),
      }),
    );
  });
});
