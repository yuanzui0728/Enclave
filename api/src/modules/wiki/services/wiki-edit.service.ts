import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CharacterEntity } from '../../characters/character.entity';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { CharacterPageEntity } from '../entities/character-page.entity';
import {
  CharacterRevisionEntity,
  type WikiContentSnapshot,
} from '../entities/character-revision.entity';
import { EditSubmissionEntity } from '../entities/edit-submission.entity';
import { UserWikiProfileEntity } from '../entities/user-wiki-profile.entity';
import { rankOf } from '../guards/wiki-role.guard';
import { WikiPageService } from './wiki-page.service';
import {
  WIKI_CONTENT_FIELDS,
  diffFields,
  pickWikiContent,
  snapshotFromCharacter,
} from '../wiki.types';

export type SubmitEditInput = {
  contentSnapshot: Record<string, unknown>;
  baseRevisionId?: string | null;
  editSummary?: string;
  isMinor?: boolean;
};

export type SubmitEditResult = {
  revisionId: string;
  status: string;
  isPatrolled: boolean;
  appliedToCharacter: boolean;
};

@Injectable()
export class WikiEditService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
    @InjectRepository(EditSubmissionEntity)
    private readonly submissionRepo: Repository<EditSubmissionEntity>,
    @InjectRepository(UserWikiProfileEntity)
    private readonly profileRepo: Repository<UserWikiProfileEntity>,
    private readonly pages: WikiPageService,
  ) {}

  async submit(
    characterId: string,
    user: AuthenticatedUser,
    input: SubmitEditInput,
  ): Promise<SubmitEditResult> {
    const page = await this.pages.getOrInitPage(characterId);
    if (page.isDeleted) {
      throw new ForbiddenException('该词条已被删除，无法编辑');
    }
    this.assertProtection(page.protectionLevel, user.role);

    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) throw new BadRequestException('角色不存在');

    const before: WikiContentSnapshot = page.currentRevisionId
      ? (await this.revisionRepo.findOne({
          where: { id: page.currentRevisionId },
        }))!.contentSnapshot
      : snapshotFromCharacter(character as unknown as Record<string, unknown>);

    const after = pickWikiContent(input.contentSnapshot ?? {});
    const changed = diffFields(before, after);
    if (changed.length === 0) {
      throw new BadRequestException('未检测到变更');
    }

    if (
      input.baseRevisionId &&
      page.currentRevisionId &&
      input.baseRevisionId !== page.currentRevisionId
    ) {
      const baseRev = await this.revisionRepo.findOne({
        where: { id: input.baseRevisionId },
      });
      if (!baseRev) {
        throw new BadRequestException('基线版本无效');
      }
      const concurrentChanged = diffFields(baseRev.contentSnapshot, before);
      const overlap = changed.filter((f) => concurrentChanged.includes(f));
      if (overlap.length > 0) {
        throw new ConflictException({
          message: '存在编辑冲突，请基于最新版本重新提交',
          conflictingFields: overlap,
          currentRevisionId: page.currentRevisionId,
          currentSnapshot: before,
        });
      }
    }

    const autoApprove = rankOf(user.role) >= rankOf('autoconfirmed');
    const lastVersion = await this.revisionRepo
      .createQueryBuilder('r')
      .where('r.characterId = :id', { id: characterId })
      .select('MAX(r.version)', 'max')
      .getRawOne<{ max: number | null }>();
    const nextVersion = (lastVersion?.max ?? 0) + 1;

    const result = await this.dataSource.transaction(async (manager) => {
      const revision = manager.create(CharacterRevisionEntity, {
        characterId,
        version: nextVersion,
        parentRevisionId: page.currentRevisionId ?? null,
        baseRevisionId: input.baseRevisionId ?? page.currentRevisionId ?? null,
        contentSnapshot: after,
        diffFromParent: { changed },
        editorUserId: user.id,
        editorRoleAtTime: user.role,
        editSummary: (input.editSummary ?? '').slice(0, 500),
        status: autoApprove ? 'approved' : 'pending',
        changeSource: 'edit',
        isMinor: Boolean(input.isMinor),
        isPatrolled: false,
      });
      const savedRev = await manager.save(revision);

      if (!autoApprove) {
        const submission = manager.create(EditSubmissionEntity, {
          revisionId: savedRev.id,
          characterId,
          submitterId: user.id,
          decision: null,
          priority: 0,
        });
        await manager.save(submission);
      } else {
        await manager.update(
          CharacterPageEntity,
          { characterId },
          {
            currentRevisionId: savedRev.id,
            editCount: page.editCount + 1,
          },
        );
        await this.applySnapshotToCharacter(manager, characterId, after);
      }

      const profile =
        (await manager.findOne(UserWikiProfileEntity, {
          where: { userId: user.id },
        })) ??
        manager.create(UserWikiProfileEntity, {
          userId: user.id,
          editCount: 0,
          approvedEditCount: 0,
          revertedCount: 0,
          patrolledCount: 0,
        });
      profile.editCount += 1;
      profile.lastEditAt = new Date();
      if (autoApprove) profile.approvedEditCount += 1;
      await manager.save(profile);

      if (!autoApprove) {
        await manager.update(
          CharacterPageEntity,
          { characterId },
          { editCount: page.editCount + 1 },
        );
      }

      return savedRev;
    });

    return {
      revisionId: result.id,
      status: result.status,
      isPatrolled: result.isPatrolled,
      appliedToCharacter: autoApprove,
    };
  }

  async applySnapshotToCharacter(
    manager: EntityManager,
    characterId: string,
    snapshot: WikiContentSnapshot,
  ): Promise<void> {
    const patch: Partial<CharacterEntity> = {};
    for (const key of WIKI_CONTENT_FIELDS) {
      const value = snapshot[key];
      if (value !== undefined) {
        (patch as Record<string, unknown>)[key] = value;
      }
    }
    await manager.update(CharacterEntity, { id: characterId }, patch);
  }

  private assertProtection(level: string, role: string): void {
    if (level === 'full' && rankOf(role) < rankOf('admin')) {
      throw new ForbiddenException('此页面被完全保护，仅管理员可编辑');
    }
    if (level === 'semi' && rankOf(role) < rankOf('autoconfirmed')) {
      throw new ForbiddenException('此页面被半保护，仅自动确认用户及以上可编辑');
    }
  }
}
