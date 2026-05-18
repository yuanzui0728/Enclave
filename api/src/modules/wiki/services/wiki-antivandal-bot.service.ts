import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sleepForWorldJitter } from '../../../common/cron-jitter.util';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { CharacterRevisionEntity } from '../entities/character-revision.entity';
import { CharacterPageEntity } from '../entities/character-page.entity';
import { AbuseFilterHitEntity } from '../entities/abuse-filter-hit.entity';
import { WikiReviewService } from './wiki-review.service';
import { WikiSystemUserService } from './wiki-system-user.service';

const SAFETY_LIMIT_PER_RUN = 5;
const SCAN_WINDOW_SEC = 5 * 60; // 5 minutes
const SAME_USER_WINDOW_SEC = 30 * 60; // 30 minutes
const SAME_USER_MAX_EDITS = 3;

@Injectable()
export class WikiAntivandalBotService {
  private readonly logger = new Logger(WikiAntivandalBotService.name);

  constructor(
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(AbuseFilterHitEntity)
    private readonly hitRepo: Repository<AbuseFilterHitEntity>,
    private readonly review: WikiReviewService,
    private readonly systemUsers: WikiSystemUserService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    await sleepForWorldJitter(60_000);
    try {
      await this.runSweep();
    } catch (err) {
      this.logger.error(`antivandal bot sweep failed: ${(err as Error).message}`);
    }
  }

  /**
   * Public entry for tests / admin hand-trigger.
   * Returns the number of revert/reject actions taken.
   */
  async runSweep(): Promise<number> {
    const cutoff = new Date(Date.now() - SCAN_WINDOW_SEC * 1000);
    const recents = await this.revisionRepo.find({
      where: {
        isPatrolled: false,
        createdAt: MoreThan(cutoff),
      },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    let actions = 0;
    for (const rev of recents) {
      if (actions >= SAFETY_LIMIT_PER_RUN) {
        // 安全上限只是"本次扫够了，下次再来"，不是 incident。用 warn 别把
        // 巡查 cron 的正常上限通报当成 ERROR 灌满 err.log。
        this.logger.warn(
          `antivandal bot reached safety limit (${SAFETY_LIMIT_PER_RUN}); halting sweep`,
        );
        break;
      }
      // Don't touch system bot's own actions
      if (rev.editorUserId === this.systemUsers.systemActor().id) continue;

      const reason = await this.evaluate(rev);
      if (!reason) continue;

      const acted = await this.takeAction(rev, reason);
      if (acted) actions += 1;
    }
    if (actions > 0) {
      this.logger.warn(`antivandal bot took ${actions} actions this sweep`);
    }
    return actions;
  }

  private async evaluate(
    rev: CharacterRevisionEntity,
  ): Promise<string | null> {
    // soft_delete / restore 是生命周期修订，contentSnapshot 故意被压成
    // {name:'', bio:reason, expertDomains:[], ...} 作为标记，并不是 content
    // vandalism。早先 evaluate 不看 operation 一律按 content rule 跑，
    // 导致合法 soft_delete 被 critical_field_cleared 命中后 bot revert 到上
    // 一个 approved，把已经"应删除"的 page 又翻回 active；rapid_repeated_edits
    // 同理也会把生命周期改动当成"高频内容编辑"撤回。这两个操作本身已经走
    // wiki review 的 high-risk patroller 通道，不需要 antivandal 复审。
    if (rev.operation === 'soft_delete' || rev.operation === 'restore') {
      return null;
    }
    // Rule 1: critical content fields cleared (bio/personality/name shrunk to <5 chars)
    // 必须"同字段对比"——之前用 OR 跨字段，结果 personality 一直为空的角色，
    // 只要 parent.bio>50 或 parent.name>5（绝大多数 wiki 词条都是），随便编辑
    // 别的字段都会触发 critical_field_cleared 把合法 edit revert 掉。
    const c = rev.contentSnapshot;
    if (rev.parentRevisionId) {
      const parent = await this.revisionRepo.findOne({
        where: { id: rev.parentRevisionId },
      });
      if (parent) {
        const before = parent.contentSnapshot;
        const shrunkName =
          typeof c.name === 'string' &&
          c.name.trim().length < 2 &&
          typeof before.name === 'string' &&
          before.name.length > 5;
        const shrunkBio =
          typeof c.bio === 'string' &&
          c.bio.trim().length < 5 &&
          typeof before.bio === 'string' &&
          before.bio.length > 50;
        const shrunkPersonality =
          typeof c.personality === 'string' &&
          c.personality.trim().length < 5 &&
          typeof before.personality === 'string' &&
          before.personality.length > 50;
        if (shrunkName || shrunkBio || shrunkPersonality) {
          return 'critical_field_cleared';
        }
      }
    }

    // Rule 2: same user submitted ≥ 3 revisions on same character in last 30 min
    const userCutoff = new Date(Date.now() - SAME_USER_WINDOW_SEC * 1000);
    const userCount = await this.revisionRepo.count({
      where: {
        editorUserId: rev.editorUserId,
        characterId: rev.characterId,
        createdAt: MoreThan(userCutoff),
      },
    });
    if (userCount >= SAME_USER_MAX_EDITS) {
      return `rapid_repeated_edits_${userCount}_in_30min`;
    }

    return null;
  }

  private async takeAction(
    rev: CharacterRevisionEntity,
    reason: string,
  ): Promise<boolean> {
    const actor = this.systemUsers.systemActor() as never;
    try {
      if (rev.status === 'pending') {
        await this.review.decide(rev.id, actor, {
          decision: 'reject',
          note: `antivandal_bot:${reason}`,
        });
        await this.recordHit(rev, reason, 'block');
        return true;
      }
      if (rev.status === 'approved') {
        // 找上一条 approved revision：以前用 version-1，但 version 序列可能因
        // rejected/superseded/reverted 状态而存在断号——一旦 v-1 不是 approved
        // 就 skip，破坏者那条恶意 revision 留在线上不会被回退。
        // 改成 "version < rev.version AND status='approved' 取最大 version"。
        const previous = await this.revisionRepo.findOne({
          where: {
            characterId: rev.characterId,
            status: 'approved',
            version: LessThan(rev.version),
          },
          order: { version: 'DESC' },
        });
        if (!previous) {
          this.logger.warn(
            `antivandal: no parent to revert to for rev ${rev.id}; skipping`,
          );
          return false;
        }
        await this.review.revert(rev.characterId, actor, {
          toRevisionId: previous.id,
          reason: `antivandal_bot:${reason}`,
        });
        await this.recordHit(rev, reason, 'block');
        return true;
      }
    } catch (err) {
      this.logger.warn(
        `antivandal action failed for rev ${rev.id}: ${(err as Error).message}`,
      );
    }
    return false;
  }

  private async recordHit(
    rev: CharacterRevisionEntity,
    reason: string,
    actionTaken: 'block' | 'tag_high_risk' | 'warn' | 'log',
  ): Promise<void> {
    try {
      await this.hitRepo.save(
        this.hitRepo.create({
          filterId: 'antivandal_bot',
          userId: rev.editorUserId,
          characterId: rev.characterId,
          revisionId: rev.id,
          matchedText: reason,
          actionTaken,
          operation: rev.operation,
        }),
      );
    } catch {
      // best-effort
    }
  }
}
