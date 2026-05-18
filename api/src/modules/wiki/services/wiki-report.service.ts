// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { ModerationReportEntity } from '../../moderation/moderation-report.entity';
import { CharacterPageEntity } from '../entities/character-page.entity';
import { CharacterRevisionEntity } from '../entities/character-revision.entity';
import { WikiTalkPostEntity } from '../entities/wiki-talk-post.entity';

const WIKI_TARGET_TYPES = new Set([
  'wiki_revision',
  'wiki_talk_post',
  'wiki_page',
]);

const WIKI_STATUSES = new Set(['open', 'resolved', 'dismissed']);

@Injectable()
export class WikiReportService {
  constructor(
    @InjectRepository(ModerationReportEntity)
    private readonly reportRepo: Repository<ModerationReportEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
    @InjectRepository(WikiTalkPostEntity)
    private readonly talkPostRepo: Repository<WikiTalkPostEntity>,
  ) {}

  async create(
    reporter: AuthenticatedUser,
    input: {
      targetType: string;
      targetId: string;
      reason: string;
      details?: string;
    },
  ): Promise<ModerationReportEntity> {
    // typeof 守：optional chaining 挡 null/undefined 但拦不住对象，
     // 客户端传 {"reason":{"a":1}} → .trim() 抛 TypeError → 500。
    const targetType =
      typeof input.targetType === 'string' ? input.targetType.trim() : '';
    const targetId =
      typeof input.targetId === 'string' ? input.targetId.trim() : '';
    const reason =
      typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!targetType || !WIKI_TARGET_TYPES.has(targetType)) {
      throw new AppError('WIKI_REPORT_INVALID_STATE', {
        params: {
          detail: 'targetType 必须是 wiki_revision / wiki_talk_post / wiki_page',
        },
        legacyMessage:
          'targetType 必须是 wiki_revision / wiki_talk_post / wiki_page',
      });
    }
    if (!targetId) throw new AppError('WIKI_REPORT_INVALID_STATE', {
        params: { detail: '缺少 targetId' },
        legacyMessage: '缺少 targetId',
      });
    if (!reason) throw new AppError('WIKI_REPORT_INVALID_STATE', {
        params: { detail: '举报原因必填' },
        legacyMessage: '举报原因必填',
      });
    // 不挡长度的话用户可以提交 1MB+ 的 reason / details 撑爆 admin 列表渲染。
    // 200 字 reason + 2000 字 details 跟其它 wiki 实例（封禁理由 200 / 角色 bio 几百）量级一致。
    if (reason.length > 200) {
      throw new AppError('WIKI_REPORT_INVALID_STATE', {
        params: { detail: '举报原因最长 200 字' },
        legacyMessage: '举报原因最长 200 字',
      });
    }
    const trimmedDetails =
      typeof input.details === 'string' ? input.details.trim() : '';
    if (trimmedDetails.length > 2000) {
      throw new AppError('WIKI_REPORT_INVALID_STATE', {
        params: { detail: '补充说明最长 2000 字' },
        legacyMessage: '补充说明最长 2000 字',
      });
    }
    // 目标必须真存在再允许举报；否则任何字符串都能塞进 moderation 队列，
    // patroller 看到一堆指向不存在 id 的 open report（2026-05-16 R2 走查）。
    await this.assertTargetExists(targetType, targetId);
    return this.reportRepo.save(
      this.reportRepo.create({
        ownerId: reporter.id,
        targetType,
        targetId,
        reason,
        details: trimmedDetails || null,
        status: 'open',
      }),
    );
  }

  async list(filter: { status?: string }): Promise<ModerationReportEntity[]> {
    const qb = this.reportRepo
      .createQueryBuilder('r')
      .where('r.targetType IN (:...types)', {
        types: Array.from(WIKI_TARGET_TYPES),
      })
      .orderBy('r.createdAt', 'DESC')
      .take(200);
    if (filter.status) {
      if (!WIKI_STATUSES.has(filter.status)) {
        throw new AppError('WIKI_REPORT_INVALID_STATE', {
        params: { detail: 'status 无效' },
        legacyMessage: 'status 无效',
      });
      }
      qb.andWhere('r.status = :status', { status: filter.status });
    }
    return qb.getMany();
  }

  private async assertTargetExists(
    targetType: string,
    targetId: string,
  ): Promise<void> {
    let exists = false;
    if (targetType === 'wiki_page') {
      const page = await this.pageRepo.findOne({
        where: { characterId: targetId },
      });
      exists = Boolean(page);
    } else if (targetType === 'wiki_revision') {
      const rev = await this.revisionRepo.findOne({ where: { id: targetId } });
      exists = Boolean(rev);
    } else if (targetType === 'wiki_talk_post') {
      const post = await this.talkPostRepo.findOne({
        where: { id: targetId },
      });
      exists = Boolean(post);
    }
    if (!exists) {
      throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: `被举报对象不存在：${targetType} ${targetId}`,
      });
    }
  }

  async setStatus(id: string, status: string): Promise<ModerationReportEntity> {
    if (!WIKI_STATUSES.has(status)) {
      throw new AppError('WIKI_REPORT_INVALID_STATE', {
        params: { detail: 'status 必须是 open / resolved / dismissed' },
        legacyMessage: 'status 必须是 open / resolved / dismissed',
      });
    }
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new AppError('WIKI_REPORT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '举报不存在',
      });
    if (!WIKI_TARGET_TYPES.has(report.targetType)) {
      throw new AppError('WIKI_REPORT_INVALID_STATE', {
        params: { detail: '该举报不属于 wiki' },
        legacyMessage: '该举报不属于 wiki',
      });
    }
    report.status = status;
    return this.reportRepo.save(report);
  }
}
// i18n-ignore-end
