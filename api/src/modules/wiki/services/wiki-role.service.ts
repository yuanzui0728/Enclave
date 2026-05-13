// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { sleepForWorldJitter } from '../../../common/cron-jitter.util';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../auth/user.entity';
import type { AuthenticatedUser } from '../../auth/jwt-auth.guard';
import { UserWikiProfileEntity } from '../entities/user-wiki-profile.entity';
import { WikiBlockEntity } from '../entities/wiki-block.entity';
import { WikiProtectionService } from './wiki-protection.service';

const ROLES = ['newcomer', 'autoconfirmed', 'patroller', 'admin'] as const;
type WikiRole = (typeof ROLES)[number];

@Injectable()
export class WikiRoleService {
  private readonly logger = new Logger(WikiRoleService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserWikiProfileEntity)
    private readonly profileRepo: Repository<UserWikiProfileEntity>,
    @InjectRepository(WikiBlockEntity)
    private readonly blockRepo: Repository<WikiBlockEntity>,
    private readonly config: ConfigService,
    private readonly protection: WikiProtectionService,
  ) {}

  private degradeRevertRatio(): number {
    return Number(
      this.config.get<string>('WIKI_DEGRADE_REVERT_RATIO') ?? 0.3,
    );
  }

  private degradeMinEdits(): number {
    return Number(this.config.get<string>('WIKI_DEGRADE_MIN_EDITS') ?? 10);
  }

  private daysThreshold(): number {
    return Number(this.config.get<string>('WIKI_AUTOCONFIRM_DAYS') ?? 4);
  }

  private editsThreshold(): number {
    return Number(this.config.get<string>('WIKI_AUTOCONFIRM_EDITS') ?? 10);
  }

  private revertRatioCeiling(): number {
    return Number(this.config.get<string>('WIKI_AUTOCONFIRM_MAX_REVERT_RATIO') ?? 0.2);
  }

  /** Returns true if the user was promoted. Safe to call after every edit submission. */
  async checkPromotion(userId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.role !== 'newcomer' || user.userType !== 'wiki_member') {
      return false;
    }
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return false;
    const ageDays =
      (Date.now() - new Date(user.createdAt).getTime()) / 86_400_000;
    if (ageDays < this.daysThreshold()) return false;
    if (profile.approvedEditCount < this.editsThreshold()) return false;
    const ratio =
      profile.revertedCount / Math.max(profile.approvedEditCount, 1);
    if (ratio >= this.revertRatioCeiling()) return false;

    user.role = 'autoconfirmed';
    user.roleGrantedAt = new Date();
    user.roleGrantedBy = 'auto_promotion';
    await this.userRepo.save(user);
    profile.autoconfirmedAt = new Date();
    await this.profileRepo.save(profile);
    this.logger.log(
      `auto-promoted ${user.username} → autoconfirmed (edits=${profile.approvedEditCount}, reverts=${profile.revertedCount})`,
    );
    return true;
  }

  async setRole(
    targetUserId: string,
    actor: AuthenticatedUser,
    input: { role: WikiRole; reason?: string },
  ): Promise<UserEntity> {
    if (!ROLES.includes(input.role)) {
      throw new AppError('WIKI_VALIDATION_FAILED', {
        params: { detail: 'role 必须是 newcomer / autoconfirmed / patroller / admin' },
        legacyMessage: 'role 必须是 newcomer / autoconfirmed / patroller / admin',
      });
    }
    const user = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!user) throw new AppError('WIKI_PAGE_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '用户不存在',
      });
    if (user.userType !== 'wiki_member' && input.role !== 'admin') {
      throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '该用户非 wiki 成员，仅可保留为 admin 角色' },
        legacyMessage: '该用户非 wiki 成员，仅可保留为 admin 角色',
      });
    }
    if (user.role === 'admin' && input.role !== 'admin') {
      const adminCount = await this.userRepo.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new AppError('WIKI_FORBIDDEN', {
        status: HttpStatus.FORBIDDEN,
        params: { reason: '至少需要保留一名 wiki admin' },
        legacyMessage: '至少需要保留一名 wiki admin',
      });
      }
    }
    user.role = input.role;
    user.roleGrantedAt = new Date();
    user.roleGrantedBy = `admin:${actor.username}${
      input.reason ? `:${input.reason}` : ''
    }`;
    await this.userRepo.save(user);
    this.logger.log(
      `manual role change: ${user.username} → ${input.role} by ${actor.username}`,
    );
    return user;
  }

  async listUsers(): Promise<
    Array<{
      id: string;
      username: string;
      role: string;
      userType: string;
      createdAt: Date;
      roleGrantedAt?: Date | null;
      profile?: UserWikiProfileEntity | null;
    }>
  > {
    const users = await this.userRepo.find({
      order: { createdAt: 'DESC' },
    });
    const profiles = await this.profileRepo.find();
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      userType: u.userType,
      createdAt: u.createdAt,
      roleGrantedAt: u.roleGrantedAt ?? null,
      profile: profileMap.get(u.id) ?? null,
    }));
  }

  /** Daily sweep: promote any newcomers that crossed the threshold and clean expired protections. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async dailySweep(): Promise<void> {
    await sleepForWorldJitter(600_000);
    const newcomers = await this.userRepo.find({
      where: { role: 'newcomer', userType: 'wiki_member' },
    });
    let promoted = 0;
    for (const u of newcomers) {
      if (await this.checkPromotion(u.id)) promoted += 1;
    }
    const degraded = await this.sweepDegrade();
    const expiredProtections = await this.protection.sweepExpired();
    if (promoted || expiredProtections || degraded) {
      this.logger.log(
        `daily sweep: promoted=${promoted}, degraded=${degraded}, expired_protections=${expiredProtections}`,
      );
    }
  }

  /**
   * 自动降级：autoconfirmed 用户被回滚率高于阈值（默认 30%）且 editCount > 10
   * → 降回 newcomer + 写一条 7 天 global block 作为软隔离。
   * 返回降级人数。
   */
  async sweepDegrade(): Promise<number> {
    const ratio = this.degradeRevertRatio();
    const minEdits = this.degradeMinEdits();
    const autoconfirmed = await this.userRepo.find({
      where: { role: 'autoconfirmed', userType: 'wiki_member' },
    });
    let degraded = 0;
    for (const user of autoconfirmed) {
      const profile = await this.profileRepo.findOne({
        where: { userId: user.id },
      });
      if (!profile) continue;
      if (profile.editCount <= minEdits) continue;
      const userRatio =
        profile.revertedCount / Math.max(profile.approvedEditCount, 1);
      if (userRatio < ratio) continue;
      user.role = 'newcomer';
      user.roleGrantedAt = new Date();
      user.roleGrantedBy = 'auto_degrade';
      await this.userRepo.save(user);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.blockRepo.save(
        this.blockRepo.create({
          userId: user.id,
          scope: 'global',
          targetCharacterId: null,
          reason: `auto_degrade_high_revert_ratio: ${(userRatio * 100).toFixed(0)}%`,
          createdBy: 'system_auto_degrade',
          expiresAt,
        }),
      );
      this.logger.warn(
        `auto-degraded ${user.username}: ratio=${userRatio.toFixed(2)} > ${ratio}, edits=${profile.editCount}`,
      );
      degraded += 1;
    }
    return degraded;
  }
}
// i18n-ignore-end
