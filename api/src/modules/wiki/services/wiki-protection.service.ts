// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Not, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { CharacterPageEntity } from '../entities/character-page.entity';
import { WikiProtectionLogEntity } from '../entities/wiki-protection-log.entity';
import { WikiPageService } from './wiki-page.service';

const VALID_LEVELS = new Set(['none', 'semi', 'full']);
const VALID_REVIEW_POLICIES = new Set(['open', 'pending_changes']);
const PROTECTION_REASON_MAX_LENGTH = 200;

@Injectable()
export class WikiProtectionService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(WikiProtectionLogEntity)
    private readonly logRepo: Repository<WikiProtectionLogEntity>,
    private readonly pages: WikiPageService,
  ) {}

  async setProtection(
    characterId: string,
    actor: AuthenticatedUser,
    input: {
      level: string;
      reviewPolicy?: string;
      expiresAt?: string | null;
      reason?: string | null;
    },
  ): Promise<CharacterPageEntity> {
    if (!VALID_LEVELS.has(input.level)) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: 'level 必须是 none / semi / full' },
        legacyMessage: 'level 必须是 none / semi / full',
      });
    }
    if (
      input.reviewPolicy !== undefined &&
      !VALID_REVIEW_POLICIES.has(input.reviewPolicy)
    ) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: 'reviewPolicy 必须是 open / pending_changes' },
        legacyMessage: 'reviewPolicy 必须是 open / pending_changes',
      });
    }
    // protectionReason 落进 character_pages.protectionReason 与
    // wiki_protection_logs.reason 两处，无 DB 上限。跟 block.reason / role.reason
    // 同样取 200 字上限，避免列表/卡片渲染时被 1MB 字符串撑出滚动条。
    if (
      typeof input.reason === 'string' &&
      input.reason.length > PROTECTION_REASON_MAX_LENGTH
    ) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: `reason 不能超过 ${PROTECTION_REASON_MAX_LENGTH} 个字符` },
        legacyMessage: `reason 不能超过 ${PROTECTION_REASON_MAX_LENGTH} 个字符`,
      });
    }
    const page = await this.pages.getOrInitPage(characterId);
    const oldLevel = page.protectionLevel;
    const newLevel = input.level;
    const nextReviewPolicy = input.reviewPolicy ?? page.reviewPolicy;
    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      const parsed = new Date(input.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        // 不挡的话 setProtection 静默把 expiresAt 落成 null（永久保护），
        // admin 看返回的 protectionExpiresAt: null 才发现自己的日期格式被丢了。
        // 跟 wiki-block.service 同样的 expiresAt 校验。
        throw new AppError('WIKI_VALIDATION_FAILED', {
          params: { detail: 'expiresAt 不是有效时间' },
          legacyMessage: 'expiresAt 不是有效时间',
        });
      }
      expiresAt = parsed;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        CharacterPageEntity,
        { characterId },
        {
          protectionLevel: newLevel,
          reviewPolicy: nextReviewPolicy,
          protectionExpiresAt: newLevel === 'none' ? null : expiresAt,
          protectionReason: newLevel === 'none' ? null : input.reason ?? null,
        },
      );
      await manager.save(
        manager.create(WikiProtectionLogEntity, {
          characterId,
          oldLevel,
          newLevel,
          changedBy: actor.id,
          reason: input.reason ?? null,
          expiresAt,
        }),
      );
    });

    return (await this.pageRepo.findOne({ where: { characterId } }))!;
  }

  async listLogs(characterId: string, limit = 50): Promise<WikiProtectionLogEntity[]> {
    return this.logRepo.find({
      where: { characterId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /** Cron-callable: any non-'none' page whose expiresAt has passed gets reset to 'none'. */
  async sweepExpired(): Promise<number> {
    const now = new Date();
    const expired = await this.pageRepo.find({
      where: {
        protectionLevel: Not('none'),
        protectionExpiresAt: LessThan(now),
      },
    });
    if (expired.length === 0) return 0;
    await this.dataSource.transaction(async (manager) => {
      for (const page of expired) {
        await manager.update(
          CharacterPageEntity,
          { characterId: page.characterId },
          {
            protectionLevel: 'none',
            protectionExpiresAt: null,
            protectionReason: null,
          },
        );
        await manager.save(
          manager.create(WikiProtectionLogEntity, {
            characterId: page.characterId,
            oldLevel: page.protectionLevel,
            newLevel: 'none',
            changedBy: 'system_cron_expiry',
            reason: '保护期到期自动解除',
            expiresAt: null,
          }),
        );
      }
    });
    return expired.length;
  }
}
// i18n-ignore-end
