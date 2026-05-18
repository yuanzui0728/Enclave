// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { CharacterPageEntity } from '../entities/character-page.entity';
import { CharacterRevisionEntity } from '../entities/character-revision.entity';
import { EditSubmissionEntity } from '../entities/edit-submission.entity';
import { UserWikiProfileEntity } from '../entities/user-wiki-profile.entity';
import { WikiEditService } from './wiki-edit.service';
import { WikiFieldProtectionService } from './wiki-field-protection.service';
import { WikiProtectionService } from './wiki-protection.service';
import { WikiRoleService } from './wiki-role.service';
import { WikiSystemUserService } from './wiki-system-user.service';
import { rankOf } from '../guards/wiki-role.guard';
import { diffFields, diffPaths, snapshotFromCharacter } from '../wiki.types';
import { CharacterEntity } from '../../characters/character.entity';

export type ReviewDecisionInput = {
  decision: 'approve' | 'reject' | 'request_changes';
  note?: string;
};

const REVIEW_NOTE_MAX_LENGTH = 1000;

@Injectable()
export class WikiReviewService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
    @InjectRepository(EditSubmissionEntity)
    private readonly submissionRepo: Repository<EditSubmissionEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(UserWikiProfileEntity)
    private readonly profileRepo: Repository<UserWikiProfileEntity>,
    private readonly edits: WikiEditService,
    private readonly roles: WikiRoleService,
    private readonly protection: WikiProtectionService,
    private readonly systemUsers: WikiSystemUserService,
    private readonly fieldProtection: WikiFieldProtectionService,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
  ) {}

  async listPending(limit?: number): Promise<
    Array<{
      submission: EditSubmissionEntity;
      revision: CharacterRevisionEntity;
    }>
  >;
  async listPending(input?: {
    limit?: number;
    operation?: string;
    riskLevel?: string;
    revisionKind?: string;
  }): Promise<
    Array<{
      submission: EditSubmissionEntity;
      revision: CharacterRevisionEntity;
    }>
  >;
  async listPending(
    input:
      | number
      | {
          limit?: number;
          operation?: string;
          riskLevel?: string;
          revisionKind?: string;
        } = {},
  ): Promise<
    Array<{
      submission: EditSubmissionEntity;
      revision: CharacterRevisionEntity;
    }>
  > {
    const opts = typeof input === 'number' ? { limit: input } : input;
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    // SQL JOIN 把 revisionKind / revision.status='pending' 一起进过滤器，避免
    // 之前 "take(200) → 内存 filter → slice(limit)" 会把分页之后的匹配项静默丢掉。
    const qb = this.submissionRepo
      .createQueryBuilder('s')
      .innerJoin(
        CharacterRevisionEntity,
        'r',
        'r.id = s.revisionId AND r.status = :status',
        { status: 'pending' },
      )
      .where('s.decision IS NULL')
      .orderBy('s.priority', 'DESC')
      .addOrderBy('s.createdAt', 'ASC')
      .take(limit);
    if (opts.operation) {
      qb.andWhere('s.operation = :operation', { operation: opts.operation });
    }
    if (opts.riskLevel) {
      qb.andWhere('s.riskLevel = :riskLevel', { riskLevel: opts.riskLevel });
    }
    if (opts.revisionKind) {
      qb.andWhere('r.revisionKind = :revisionKind', {
        revisionKind: opts.revisionKind,
      });
    }
    const submissions = await qb.getMany();
    if (submissions.length === 0) return [];
    const revisions = await this.revisionRepo.find({
      where: { id: In(submissions.map((s) => s.revisionId)) },
    });
    const revMap = new Map(revisions.map((r) => [r.id, r]));
    return submissions
      .map((s) => ({ submission: s, revision: revMap.get(s.revisionId)! }))
      .filter((entry) => entry.revision);
  }

  /**
   * 找出 submission.decision=null 但对应 revision.status 已非 pending 的孤儿条目
   * （历史脏数据 / 直接改 DB 造成）。审核台用它来曝出来手动清理。
   */
  async listOrphanSubmissions(limit = 100): Promise<EditSubmissionEntity[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    return this.submissionRepo
      .createQueryBuilder('s')
      .innerJoin(
        CharacterRevisionEntity,
        'r',
        'r.id = s.revisionId AND r.status != :pending',
        { pending: 'pending' },
      )
      .where('s.decision IS NULL')
      .orderBy('s.createdAt', 'ASC')
      .take(safeLimit)
      .getMany();
  }

  async decide(
    revisionId: string,
    reviewer: AuthenticatedUser,
    input: ReviewDecisionInput,
  ): Promise<{ status: string; pageId: string }> {
    if (!['approve', 'reject', 'request_changes'].includes(input.decision)) {
      throw new AppError('WIKI_REVIEW_INVALID_STATE', {
        params: { detail: '无效的审核结果' },
        legacyMessage: '无效的审核结果',
      });
    }
    // reviewerNote 落进 wiki_edit_submissions.reviewerNote，是 SQLite TEXT 没
    // DB 上限。不挡的话 reject 一次能塞 1MB+，pending-reviews 列表渲染卡。
    // 跟 wiki block.reason / role.reason / report.reason 同量级（200~2000）。
    if (
      typeof input.note === 'string' &&
      input.note.length > REVIEW_NOTE_MAX_LENGTH
    ) {
      throw new AppError('WIKI_REVIEW_INVALID_STATE', {
        params: { detail: `审核备注最长 ${REVIEW_NOTE_MAX_LENGTH} 字` },
        legacyMessage: `审核备注最长 ${REVIEW_NOTE_MAX_LENGTH} 字`,
      });
    }
    const revision = await this.revisionRepo.findOne({
      where: { id: revisionId },
    });
    if (!revision) throw new AppError('WIKI_REVIEW_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '版本不存在',
      });
    if (revision.status !== 'pending') {
      throw new AppError('WIKI_REVIEW_INVALID_STATE', {
        params: { detail: '该版本已被处理' },
        legacyMessage: '该版本已被处理',
      });
    }
    const submission = await this.submissionRepo.findOne({
      where: { revisionId },
    });
    if (!submission) throw new AppError('WIKI_REVIEW_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '待审记录不存在',
      });

    const isApprove = input.decision === 'approve';
    const finalStatus = isApprove ? 'approved' : 'rejected';
    const applyWithWikiRuntime =
      isApprove &&
      (Boolean(revision.recipeSnapshot) ||
        revision.revisionKind !== 'content' ||
        revision.operation !== 'edit');

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        CharacterRevisionEntity,
        { id: revisionId },
        {
          status: finalStatus,
          isPatrolled: isApprove,
          patrolledBy: isApprove ? reviewer.id : null,
          patrolledAt: isApprove ? new Date() : null,
        },
      );
      await manager.update(
        EditSubmissionEntity,
        { id: submission.id },
        {
          decision: input.decision,
          reviewerId: reviewer.id,
          decidedAt: new Date(),
          reviewerNote: input.note ?? null,
        },
      );

      if (isApprove && !applyWithWikiRuntime) {
        await manager.update(
          CharacterPageEntity,
          { characterId: revision.characterId },
          {
            currentRevisionId: revision.id,
            title: revision.contentSnapshot.name,
            lifecycleStatus: 'active',
          },
        );
        await this.edits.applySnapshotToCharacter(
          manager,
          revision.characterId,
          revision.contentSnapshot,
        );
      }

      if (isApprove) {
        const profile =
          (await manager.findOne(UserWikiProfileEntity, {
            where: { userId: revision.editorUserId },
          })) ??
          manager.create(UserWikiProfileEntity, {
            userId: revision.editorUserId,
            editCount: 0,
            approvedEditCount: 0,
            revertedCount: 0,
            patrolledCount: 0,
          });
        profile.approvedEditCount += 1;
        await manager.save(profile);
      }

      if (isApprove) {
        const reviewerProfile =
          (await manager.findOne(UserWikiProfileEntity, {
            where: { userId: reviewer.id },
          })) ??
          manager.create(UserWikiProfileEntity, {
            userId: reviewer.id,
            editCount: 0,
            approvedEditCount: 0,
            revertedCount: 0,
            patrolledCount: 0,
          });
        reviewerProfile.patrolledCount += 1;
        await manager.save(reviewerProfile);
      }
    });

    if (applyWithWikiRuntime) {
      try {
        await this.edits.applyApprovedRevision(revision, reviewer.id);
      } catch (error) {
        await this.rollbackRuntimeApproval(revision, submission.id, reviewer.id);
        throw error;
      }
    }

    if (isApprove) {
      void this.roles.checkPromotion(revision.editorUserId).catch(() => undefined);
    }
    return { status: finalStatus, pageId: revision.characterId };
  }

  private async rollbackRuntimeApproval(
    revision: CharacterRevisionEntity,
    submissionId: string,
    reviewerId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        CharacterRevisionEntity,
        { id: revision.id },
        {
          status: 'pending',
          isPatrolled: false,
          patrolledBy: null,
          patrolledAt: null,
        },
      );
      await manager.update(
        EditSubmissionEntity,
        { id: submissionId },
        {
          decision: null,
          reviewerId: null,
          decidedAt: null,
          reviewerNote: null,
        },
      );

      const authorProfile = await manager.findOne(UserWikiProfileEntity, {
        where: { userId: revision.editorUserId },
      });
      if (authorProfile) {
        authorProfile.approvedEditCount = Math.max(
          0,
          authorProfile.approvedEditCount - 1,
        );
        await manager.save(authorProfile);
      }

      const reviewerProfile = await manager.findOne(UserWikiProfileEntity, {
        where: { userId: reviewerId },
      });
      if (reviewerProfile) {
        reviewerProfile.patrolledCount = Math.max(
          0,
          reviewerProfile.patrolledCount - 1,
        );
        await manager.save(reviewerProfile);
      }
    });
  }

  async markPatrolled(
    revisionId: string,
    reviewer: AuthenticatedUser,
  ): Promise<{ revisionId: string; isPatrolled: true }> {
    const revision = await this.revisionRepo.findOne({
      where: { id: revisionId },
    });
    if (!revision) throw new AppError('WIKI_REVIEW_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '版本不存在',
      });
    if (revision.status !== 'approved') {
      throw new AppError('WIKI_REVIEW_INVALID_STATE', {
        params: { detail: '仅 approved 状态的版本可被巡查' },
        legacyMessage: '仅 approved 状态的版本可被巡查',
      });
    }
    if (revision.isPatrolled) {
      return { revisionId, isPatrolled: true };
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        CharacterRevisionEntity,
        { id: revisionId },
        {
          isPatrolled: true,
          patrolledBy: reviewer.id,
          patrolledAt: new Date(),
        },
      );
      const profile =
        (await manager.findOne(UserWikiProfileEntity, {
          where: { userId: reviewer.id },
        })) ??
        manager.create(UserWikiProfileEntity, {
          userId: reviewer.id,
          editCount: 0,
          approvedEditCount: 0,
          revertedCount: 0,
          patrolledCount: 0,
        });
      profile.patrolledCount += 1;
      await manager.save(profile);
    });
    return { revisionId, isPatrolled: true };
  }

  async revert(
    characterId: string,
    reviewer: AuthenticatedUser,
    input: { toRevisionId: string; reason: string },
  ): Promise<{ revisionId: string; version: number }> {
    if (!input.toRevisionId) {
      throw new AppError('WIKI_REVIEW_INVALID_STATE', {
        params: { detail: '缺少 toRevisionId' },
        legacyMessage: '缺少 toRevisionId',
      });
    }
    await this.assert3RR(characterId, reviewer);
    const target = await this.revisionRepo.findOne({
      where: { id: input.toRevisionId },
    });
    if (!target || target.characterId !== characterId) {
      throw new AppError('WIKI_REVIEW_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '目标版本不存在或不属于该词条',
      });
    }
    if (target.status !== 'approved') {
      throw new AppError('WIKI_REVIEW_INVALID_STATE', {
        params: { detail: '只能回滚到 approved 版本' },
        legacyMessage: '只能回滚到 approved 版本',
      });
    }
    if (target.revisionKind === 'lifecycle') {
      throw new AppError('WIKI_REVIEW_INVALID_STATE', {
        params: { detail: '生命周期版本请通过删除 / 恢复申请处理，不支持直接回滚' },
        legacyMessage: '生命周期版本请通过删除 / 恢复申请处理，不支持直接回滚',
      });
    }
    const page = await this.pageRepo.findOne({ where: { characterId } });
    if (!page) throw new AppError('WIKI_REVIEW_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '词条不存在',
      });
    if (page.currentRevisionId === target.id) {
      throw new AppError('WIKI_REVIEW_INVALID_STATE', {
        params: { detail: '目标版本已是当前版本' },
        legacyMessage: '目标版本已是当前版本',
      });
    }
    if (page.protectionLevel === 'full' && reviewer.role !== 'admin') {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '该页面被完全保护，仅管理员可回滚' },
        legacyMessage: '该页面被完全保护，仅管理员可回滚',
      });
    }

    // 字段级保护：revert 也是写字段，不能绕过保护策略——例如把
    // prompting.coreLogic 通过 "回滚到旧版" 复原回不合规的旧值。
    // 计算 revert 会改动的字段集合：与当前 stable revision 比 diff。
    const currentRev = page.currentRevisionId
      ? await this.revisionRepo.findOne({
          where: { id: page.currentRevisionId },
        })
      : null;
    if (currentRev) {
      if (target.recipeSnapshot && currentRev.recipeSnapshot) {
        const changedPaths = diffPaths(
          currentRev.recipeSnapshot,
          target.recipeSnapshot,
        );
        await this.fieldProtection.assertCanEditPaths(
          reviewer,
          characterId,
          changedPaths,
        );
      } else {
        // content 路径（无 recipeSnapshot）：用 diffFields 拿到改动的内容字段名
        // 当作 path 给 field-protection 做后缀匹配。
        const character = await this.characterRepo.findOne({
          where: { id: characterId },
        });
        const liveContent =
          currentRev.contentSnapshot ??
          (character
            ? snapshotFromCharacter(
                character as unknown as Record<string, unknown>,
              )
            : null);
        if (liveContent) {
          const changedFields = diffFields(liveContent, target.contentSnapshot);
          await this.fieldProtection.assertCanEditPaths(
            reviewer,
            characterId,
            changedFields,
          );
        }
      }
    }

    const newRev = await this.dataSource.transaction(async (manager) => {
      // version + superseded 列表都进 tx，确保不会和其它 revert / 自动通过的 edit
      // 出现 race。
      const lastVersionRow = await manager
        .getRepository(CharacterRevisionEntity)
        .createQueryBuilder('r')
        .where('r.characterId = :id', { id: characterId })
        .select('MAX(r.version)', 'max')
        .getRawOne<{ max: number | null }>();
      const nextVersion = (lastVersionRow?.max ?? 0) + 1;

      const supersededRevs = await manager.find(CharacterRevisionEntity, {
        where: {
          characterId,
          version: MoreThan(target.version),
          status: 'approved',
        },
      });

      const created = manager.create(CharacterRevisionEntity, {
        characterId,
        version: nextVersion,
        parentRevisionId: page.currentRevisionId ?? null,
        baseRevisionId: page.currentRevisionId ?? null,
        contentSnapshot: target.contentSnapshot,
        recipeSnapshot: target.recipeSnapshot ?? null,
        diffFromParent: { changed: ['__revert__'], revertTo: target.version },
        editorUserId: reviewer.id,
        editorRoleAtTime: reviewer.role,
        editSummary: `Revert to v${target.version}: ${input.reason ?? ''}`.slice(0, 500),
        status: 'approved',
        revisionKind: target.recipeSnapshot ? 'recipe' : 'content',
        operation: 'revert',
        riskLevel: target.recipeSnapshot ? 'high' : 'low',
        changeSource: 'revert',
        isMinor: false,
        isPatrolled: true,
        patrolledBy: reviewer.id,
        patrolledAt: new Date(),
      });
      const saved = await manager.save(created);

      await manager.update(
        CharacterPageEntity,
        { characterId },
        {
          currentRevisionId: saved.id,
          latestRevisionId: saved.id,
          title: target.contentSnapshot.name,
          lifecycleStatus: 'active',
        },
      );
      await manager.increment(
        CharacterPageEntity,
        { characterId },
        'editCount',
        1,
      );
      if (!target.recipeSnapshot) {
        await this.edits.applySnapshotToCharacter(
          manager,
          characterId,
          target.contentSnapshot,
        );
      }

      if (supersededRevs.length > 0) {
        await manager.update(
          CharacterRevisionEntity,
          { id: In(supersededRevs.map((r) => r.id)) },
          { status: 'reverted', revertedByRevisionId: saved.id },
        );
        const editorsAffected = Array.from(
          new Set(supersededRevs.map((r) => r.editorUserId)),
        );
        for (const userId of editorsAffected) {
          const profile =
            (await manager.findOne(UserWikiProfileEntity, {
              where: { userId },
            })) ??
            manager.create(UserWikiProfileEntity, {
              userId,
              editCount: 0,
              approvedEditCount: 0,
              revertedCount: 0,
              patrolledCount: 0,
            });
          profile.revertedCount += supersededRevs.filter(
            (r) => r.editorUserId === userId,
          ).length;
          await manager.save(profile);
        }
      }

      // reviewer 自己也算"做了一次写动作"——把 editCount/approvedEditCount 也补上，
      // 否则 reviewer 永远没有 approvedEditCount，自动晋升/降级算分母漂移。
      const reviewerProfile =
        (await manager.findOne(UserWikiProfileEntity, {
          where: { userId: reviewer.id },
        })) ??
        manager.create(UserWikiProfileEntity, {
          userId: reviewer.id,
          editCount: 0,
          approvedEditCount: 0,
          revertedCount: 0,
          patrolledCount: 0,
        });
      reviewerProfile.editCount += 1;
      reviewerProfile.approvedEditCount += 1;
      reviewerProfile.patrolledCount += 1;
      reviewerProfile.lastEditAt = new Date();
      await manager.save(reviewerProfile);

      return saved;
    });

    if (newRev.recipeSnapshot) {
      try {
        await this.edits.applyApprovedRevision(newRev, reviewer.id);
      } catch (err) {
        // recipe revert 的 blueprint publish 失败时，把 revert revision 标记成
        // pending（让审核员看见、可重试），把 page.currentRevisionId 还原到原版本，
        // 并把刚标为 reverted 的 supersededRevs 还原。否则 revert revision 显示已
        // 通过但 blueprint 还是旧的，跟 wiki 显示矛盾。
        await this.rollbackRecipeRevert(newRev, page, characterId).catch(
          () => undefined,
        );
        throw err;
      }
    }

    await this.maybeAutoLock(characterId);

    return { revisionId: newRev.id, version: newRev.version };
  }

  /**
   * recipe revert 第二阶段（blueprint publish）失败时调用：
   *   - revert revision → pending
   *   - page.currentRevisionId 还原到 revert 前
   *   - 之前标为 'reverted' 的 supersededRevs 还原成 'approved'
   *   - revert revision 的 supersededRevs 受影响作者 revertedCount 减回去
   *   - reviewer 的 editCount/approvedEditCount/patrolledCount 各 -1
   * 与 rollbackRuntimeApproval（针对 decide 的两阶段）平行。
   */
  private async rollbackRecipeRevert(
    newRev: CharacterRevisionEntity,
    pageBeforeRevert: CharacterPageEntity,
    characterId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const supersededRevs = await manager.find(CharacterRevisionEntity, {
        where: { revertedByRevisionId: newRev.id },
      });
      if (supersededRevs.length > 0) {
        await manager.update(
          CharacterRevisionEntity,
          { id: In(supersededRevs.map((r) => r.id)) },
          { status: 'approved', revertedByRevisionId: null },
        );
        const editorsAffected = Array.from(
          new Set(supersededRevs.map((r) => r.editorUserId)),
        );
        for (const userId of editorsAffected) {
          const profile = await manager.findOne(UserWikiProfileEntity, {
            where: { userId },
          });
          if (!profile) continue;
          const dec = supersededRevs.filter(
            (r) => r.editorUserId === userId,
          ).length;
          profile.revertedCount = Math.max(0, profile.revertedCount - dec);
          await manager.save(profile);
        }
      }

      await manager.update(
        CharacterRevisionEntity,
        { id: newRev.id },
        {
          status: 'pending',
          isPatrolled: false,
          patrolledBy: null,
          patrolledAt: null,
        },
      );
      await manager.update(
        CharacterPageEntity,
        { characterId },
        {
          currentRevisionId: pageBeforeRevert.currentRevisionId ?? null,
          latestRevisionId: pageBeforeRevert.latestRevisionId ?? null,
          title: pageBeforeRevert.title ?? null,
          lifecycleStatus: pageBeforeRevert.lifecycleStatus,
        },
      );

      const reviewerProfile = await manager.findOne(UserWikiProfileEntity, {
        where: { userId: newRev.editorUserId },
      });
      if (reviewerProfile) {
        reviewerProfile.editCount = Math.max(0, reviewerProfile.editCount - 1);
        reviewerProfile.approvedEditCount = Math.max(
          0,
          reviewerProfile.approvedEditCount - 1,
        );
        reviewerProfile.patrolledCount = Math.max(
          0,
          reviewerProfile.patrolledCount - 1,
        );
        await manager.save(reviewerProfile);
      }

      // editCount 多加了 1（revert 入事务里自增过），原子减回去。
      await manager.decrement(
        CharacterPageEntity,
        { characterId },
        'editCount',
        1,
      );
    });
  }

  /**
   * Wikipedia 3RR 风格规则：
   *   (A) 同一 patroller 在 24h 内对同一 character revert ≥ 3 次 → 拒绝。
   *   (B) 同一 patroller 在 24h 内全站 revert ≥ 20 次 → 拒绝。
   *       (B) 是为了防 patroller 跨角色滥用 revert 把目标作者的
   *       revertedCount/approvedEditCount 比率推到 0.3+，触发 sweepDegrade
   *       自动降级 + 7 天 global block。
   *   admin 例外。
   * 与 maybeAutoLock 配套防编辑战。
   */
  private async assert3RR(
    characterId: string,
    reviewer: AuthenticatedUser,
  ): Promise<void> {
    if (rankOf(reviewer.role) >= rankOf('admin')) return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sameCharacterCount = await this.revisionRepo.count({
      where: {
        characterId,
        operation: 'revert',
        editorUserId: reviewer.id,
        createdAt: MoreThan(cutoff),
      },
    });
    if (sameCharacterCount >= 3) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: {
          reason:
            '24 小时内已对该词条回退 3 次（3RR）。请改为讨论页协商或申请管理员介入',
        },
        legacyMessage:
          '24 小时内已对该词条回退 3 次（3RR）。请改为讨论页协商或申请管理员介入',
      });
    }
    const globalCount = await this.revisionRepo.count({
      where: {
        operation: 'revert',
        editorUserId: reviewer.id,
        createdAt: MoreThan(cutoff),
      },
    });
    if (globalCount >= 20) {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: {
          reason:
            '24 小时内全站回退已达 20 次上限，疑似滥用。请改为申请 admin 介入',
        },
        legacyMessage:
          '24 小时内全站回退已达 20 次上限，疑似滥用。请改为申请 admin 介入',
      });
    }
  }

  /**
   * 同一 character 在 24h 内被 revert ≥ 6 次（即第 6 次触发）→ 自动 semi 保护 24h。
   * 已是 semi/full 的页面不重复升级。
   */
  private async maybeAutoLock(characterId: string): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.revisionRepo.count({
      where: {
        characterId,
        operation: 'revert',
        createdAt: MoreThan(cutoff),
      },
    });
    if (count <= 5) return;
    const page = await this.pageRepo.findOne({ where: { characterId } });
    if (!page || page.protectionLevel !== 'none') return;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    try {
      await this.protection.setProtection(
        characterId,
        this.systemUsers.systemActor() as AuthenticatedUser,
        {
          level: 'semi',
          expiresAt: expiresAt.toISOString(),
          reason: 'auto_3rr_lock: 24h 内 revert 次数过多，自动半保护 24 小时',
        },
      );
    } catch {
      // best-effort; never block the revert response on lock failure
    }
  }
}
// i18n-ignore-end
