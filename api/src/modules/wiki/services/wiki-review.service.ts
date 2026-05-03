import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { CharacterPageEntity } from '../entities/character-page.entity';
import { CharacterRevisionEntity } from '../entities/character-revision.entity';
import { EditSubmissionEntity } from '../entities/edit-submission.entity';
import { UserWikiProfileEntity } from '../entities/user-wiki-profile.entity';
import { WikiEditService } from './wiki-edit.service';

export type ReviewDecisionInput = {
  decision: 'approve' | 'reject' | 'request_changes';
  note?: string;
};

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
  ) {}

  async listPending(limit = 50): Promise<
    Array<{
      submission: EditSubmissionEntity;
      revision: CharacterRevisionEntity;
    }>
  > {
    const submissions = await this.submissionRepo.find({
      where: { decision: IsNull() },
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    const revIds = submissions.map((s) => s.revisionId);
    if (revIds.length === 0) return [];
    const revisions = await this.revisionRepo
      .createQueryBuilder('r')
      .where('r.id IN (:...ids)', { ids: revIds })
      .getMany();
    const revMap = new Map(revisions.map((r) => [r.id, r]));
    return submissions
      .map((s) => ({ submission: s, revision: revMap.get(s.revisionId)! }))
      .filter((entry) => entry.revision);
  }

  async decide(
    revisionId: string,
    reviewer: AuthenticatedUser,
    input: ReviewDecisionInput,
  ): Promise<{ status: string; pageId: string }> {
    if (!['approve', 'reject', 'request_changes'].includes(input.decision)) {
      throw new BadRequestException('无效的审核结果');
    }
    const revision = await this.revisionRepo.findOne({
      where: { id: revisionId },
    });
    if (!revision) throw new NotFoundException('版本不存在');
    if (revision.status !== 'pending') {
      throw new BadRequestException('该版本已被处理');
    }
    const submission = await this.submissionRepo.findOne({
      where: { revisionId },
    });
    if (!submission) throw new NotFoundException('待审记录不存在');

    const isApprove = input.decision === 'approve';
    const finalStatus = isApprove ? 'approved' : 'rejected';

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

      if (isApprove) {
        await manager.update(
          CharacterPageEntity,
          { characterId: revision.characterId },
          { currentRevisionId: revision.id },
        );
        await this.edits.applySnapshotToCharacter(
          manager,
          revision.characterId,
          revision.contentSnapshot,
        );
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
    });

    return { status: finalStatus, pageId: revision.characterId };
  }

  async markPatrolled(
    revisionId: string,
    reviewer: AuthenticatedUser,
  ): Promise<{ revisionId: string; isPatrolled: true }> {
    const revision = await this.revisionRepo.findOne({
      where: { id: revisionId },
    });
    if (!revision) throw new NotFoundException('版本不存在');
    if (revision.status !== 'approved') {
      throw new BadRequestException('仅 approved 状态的版本可被巡查');
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
      throw new BadRequestException('缺少 toRevisionId');
    }
    const target = await this.revisionRepo.findOne({
      where: { id: input.toRevisionId },
    });
    if (!target || target.characterId !== characterId) {
      throw new NotFoundException('目标版本不存在或不属于该词条');
    }
    if (target.status !== 'approved') {
      throw new BadRequestException('只能回滚到 approved 版本');
    }
    const page = await this.pageRepo.findOne({ where: { characterId } });
    if (!page) throw new NotFoundException('词条不存在');
    if (page.currentRevisionId === target.id) {
      throw new BadRequestException('目标版本已是当前版本');
    }
    if (page.protectionLevel === 'full' && reviewer.role !== 'admin') {
      throw new ForbiddenException('该页面被完全保护，仅管理员可回滚');
    }

    const lastVersion = await this.revisionRepo
      .createQueryBuilder('r')
      .where('r.characterId = :id', { id: characterId })
      .select('MAX(r.version)', 'max')
      .getRawOne<{ max: number | null }>();
    const nextVersion = (lastVersion?.max ?? 0) + 1;

    const supersededRevs = await this.revisionRepo.find({
      where: {
        characterId,
        version: MoreThan(target.version),
        status: 'approved',
      },
    });

    const newRev = await this.dataSource.transaction(async (manager) => {
      const created = manager.create(CharacterRevisionEntity, {
        characterId,
        version: nextVersion,
        parentRevisionId: page.currentRevisionId ?? null,
        baseRevisionId: page.currentRevisionId ?? null,
        contentSnapshot: target.contentSnapshot,
        diffFromParent: { changed: ['__revert__'], revertTo: target.version },
        editorUserId: reviewer.id,
        editorRoleAtTime: reviewer.role,
        editSummary: `Revert to v${target.version}: ${input.reason ?? ''}`.slice(0, 500),
        status: 'approved',
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
          editCount: page.editCount + 1,
        },
      );
      await this.edits.applySnapshotToCharacter(
        manager,
        characterId,
        target.contentSnapshot,
      );

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

      return saved;
    });

    return { revisionId: newRev.id, version: newRev.version };
  }
}
