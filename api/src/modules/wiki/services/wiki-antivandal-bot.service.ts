import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sleepForWorldJitter } from '../../../common/cron-jitter.util';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
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
        this.logger.error(
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
    // Rule 1: critical content fields cleared (bio/personality/name shrunk to <5 chars)
    const c = rev.contentSnapshot;
    if (
      (typeof c.name === 'string' && c.name.trim().length < 2) ||
      (typeof c.bio === 'string' && c.bio.trim().length < 5) ||
      (typeof c.personality === 'string' && c.personality.trim().length < 5)
    ) {
      // Look up parent to confirm we're shrinking from > 50 to < 5
      if (rev.parentRevisionId) {
        const parent = await this.revisionRepo.findOne({
          where: { id: rev.parentRevisionId },
        });
        if (parent) {
          const before = parent.contentSnapshot;
          if (
            (typeof before.bio === 'string' && before.bio.length > 50) ||
            (typeof before.personality === 'string' &&
              before.personality.length > 50) ||
            (typeof before.name === 'string' && before.name.length > 5)
          ) {
            return 'critical_field_cleared';
          }
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
        // Find the previous approved revision to revert to
        const previous = await this.revisionRepo.findOne({
          where: {
            characterId: rev.characterId,
            status: 'approved',
            version: rev.version - 1,
          },
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
