import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
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
}
