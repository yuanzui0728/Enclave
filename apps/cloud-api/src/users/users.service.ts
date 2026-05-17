import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  assertPasswordStrength,
  hashPassword,
} from "../auth/password-policy";
import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  CloudUserDetail,
  CloudUserListResponse,
  CloudUserStatus,
  CloudUserSummary,
  SubscriptionStatus,
} from "@yinjie/contracts";
import { Between, Brackets, In, Repository } from "typeorm";
import { EmailAuthService } from "../auth/email-auth.service";
import {
  GoogleAuthService,
  type GoogleVerifiedProfile,
} from "../auth/google-auth.service";
import { PhoneAuthService } from "../auth/phone-auth.service";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { InviteCodeEntity } from "../entities/invite-code.entity";
import { InviteRedemptionEntity } from "../entities/invite-redemption.entity";
import { UserSubscriptionEntity } from "../entities/user-subscription.entity";
import { InviteService } from "../invite/invite.service";
import { SubscriptionService } from "../subscription/subscription.service";

export type EnsureUserContext = {
  inviteCode?: string | null;
  ip?: string | null;
  deviceFingerprint?: string | null;
  // 注册时一并设置的初始登录密码。仅在 isNewUser=true 时落盘；
  // 老用户即便传了也会被忽略，避免静默覆盖。
  setPasswordOnRegister?: string | null;
};

// e2e / smoke / playwright / Twilio 测试号会把"用户"tab 灌得到处是脏数据，运营
// 看不清真实账号。固定的几个判别条件够准：
//   - phone 以 "+" 开头：生产手机注册走 hash-like 14 位 id（91xxxx…），不会带 +。
//     E.164 格式（+86…、+15005550001）目前只来自自动化测试。
//   - email 命中 smoke- 前缀 / @example.com / 我们 smoke 脚本固定的 a.com/b.com/c.com
//     这几个 RFC2606 保留 + 内部约定的"垃圾域名"。
const TEST_ACCOUNT_EMAIL_PATTERNS = [
  "smoke%",
  "%@example.com",
  "%@a.com",
  "%@b.com",
  "%@c.com",
] as const;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
    @InjectRepository(InviteCodeEntity)
    private readonly inviteCodeRepo: Repository<InviteCodeEntity>,
    @InjectRepository(UserSubscriptionEntity)
    private readonly subscriptionRepo: Repository<UserSubscriptionEntity>,
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(InviteRedemptionEntity)
    private readonly redemptionRepo: Repository<InviteRedemptionEntity>,
    private readonly subscription: SubscriptionService,
    private readonly invite: InviteService,
    private readonly phoneAuth: PhoneAuthService,
    private readonly emailAuth: EmailAuthService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  onModuleInit() {
    this.phoneAuth.registerPostVerifyHook(async (phone, extras) => {
      try {
        await this.ensureUser(phone, {
          inviteCode: extras.inviteCode ?? null,
          ip: extras.ip ?? null,
          deviceFingerprint: extras.deviceFingerprint ?? null,
          setPasswordOnRegister: extras.setPasswordOnRegister ?? null,
        });
      } catch (error) {
        this.logger.warn(
          `ensureUser hook failed for phone=${phone}: ${(error as Error).message}`,
        );
      }
    });

    this.emailAuth.registerPostVerifyHook(async (email, synthPhone, extras) => {
      try {
        await this.ensureUserByEmail(email, synthPhone, {
          inviteCode: extras.inviteCode ?? null,
          ip: extras.ip ?? null,
          deviceFingerprint: extras.deviceFingerprint ?? null,
          setPasswordOnRegister: extras.setPasswordOnRegister ?? null,
        });
      } catch (error) {
        this.logger.warn(
          `ensureUserByEmail hook failed for email=${email}: ${(error as Error).message}`,
        );
      }
    });

    this.googleAuth.registerPostVerifyHook(async (profile, synthPhone, extras) => {
      return this.ensureUserByGoogle(profile, synthPhone, {
        inviteCode: extras.inviteCode ?? null,
        ip: extras.ip ?? null,
        deviceFingerprint: extras.deviceFingerprint ?? null,
      });
    });
  }

  async ensureUser(phone: string, context: EnsureUserContext = {}) {
    const now = new Date();
    let user = await this.userRepo.findOne({ where: { phone } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = this.userRepo.create({
        phone,
        firstLoginAt: now,
        lastLoginAt: now,
        registrationIp: context.ip ?? null,
        lastLoginIp: context.ip ?? null,
        registrationDeviceFingerprint: context.deviceFingerprint ?? null,
      });
      user = await this.userRepo.save(user);
    } else {
      user.lastLoginAt = now;
      if (context.ip) user.lastLoginIp = context.ip;
      if (!user.registrationIp && context.ip) user.registrationIp = context.ip;
      if (!user.registrationDeviceFingerprint && context.deviceFingerprint) {
        user.registrationDeviceFingerprint = context.deviceFingerprint;
      }
      user = await this.userRepo.save(user);
    }

    if (isNewUser && context.setPasswordOnRegister) {
      try {
        const valid = assertPasswordStrength(context.setPasswordOnRegister, [
          user.phone,
        ]);
        user.passwordHash = await hashPassword(valid);
        user.passwordUpdatedAt = now;
        user = await this.userRepo.save(user);
      } catch (error) {
        this.logger.warn(
          `setPasswordOnRegister failed for user=${user.id}: ${(error as Error).message}`,
        );
      }
    }

    const code = await this.invite.ensureCodeForUser(user.id);
    if (!user.inviteCodeId || user.inviteCodeId !== code.id) {
      user.inviteCodeId = code.id;
      user = await this.userRepo.save(user);
    }

    if (isNewUser) {
      try {
        await this.subscription.grantTrialIfNeeded(user.id, "phone-auth:trial");
      } catch (error) {
        this.logger.warn(
          `Trial grant failed for user=${user.id}: ${(error as Error).message}`,
        );
      }
    }

    if (isNewUser && context.inviteCode) {
      try {
        const inviteCode = await this.invite.findCodeByCodeString(context.inviteCode);
        if (inviteCode && inviteCode.ownerUserId !== user.id) {
          user.invitedByCodeId = inviteCode.id;
          await this.userRepo.save(user);
          await this.invite.assessAndRecordRedemption({
            inviterUserId: inviteCode.ownerUserId,
            code: inviteCode,
            inviteeUserId: user.id,
            context: {
              inviteePhone: user.phone ?? "",
              inviteeIp: context.ip ?? null,
              inviteeDeviceFingerprint: context.deviceFingerprint ?? null,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Invite redemption failed for user=${user.id}: ${(error as Error).message}`,
        );
      }
    }

    return user;
  }

  async ensureUserByEmail(
    email: string,
    synthPhone: string,
    context: EnsureUserContext = {},
  ) {
    const now = new Date();
    let user = await this.userRepo.findOne({ where: { email } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = this.userRepo.create({
        phone: synthPhone,
        email,
        emailVerifiedAt: now,
        firstLoginAt: now,
        lastLoginAt: now,
        registrationIp: context.ip ?? null,
        lastLoginIp: context.ip ?? null,
        registrationDeviceFingerprint: context.deviceFingerprint ?? null,
      });
      user = await this.userRepo.save(user);
    } else {
      user.lastLoginAt = now;
      if (context.ip) user.lastLoginIp = context.ip;
      if (!user.phone) user.phone = synthPhone;
      if (!user.emailVerifiedAt) user.emailVerifiedAt = now;
      if (!user.registrationIp && context.ip) user.registrationIp = context.ip;
      if (!user.registrationDeviceFingerprint && context.deviceFingerprint) {
        user.registrationDeviceFingerprint = context.deviceFingerprint;
      }
      user = await this.userRepo.save(user);
    }

    if (isNewUser && context.setPasswordOnRegister) {
      try {
        const valid = assertPasswordStrength(context.setPasswordOnRegister, [
          user.email,
          user.phone,
        ]);
        user.passwordHash = await hashPassword(valid);
        user.passwordUpdatedAt = now;
        user = await this.userRepo.save(user);
      } catch (error) {
        this.logger.warn(
          `setPasswordOnRegister failed for user=${user.id}: ${(error as Error).message}`,
        );
      }
    }

    const code = await this.invite.ensureCodeForUser(user.id);
    if (!user.inviteCodeId || user.inviteCodeId !== code.id) {
      user.inviteCodeId = code.id;
      user = await this.userRepo.save(user);
    }

    if (isNewUser) {
      try {
        await this.subscription.grantTrialIfNeeded(user.id, "email-auth:trial");
      } catch (error) {
        this.logger.warn(
          `Trial grant failed for user=${user.id}: ${(error as Error).message}`,
        );
      }
    }

    if (isNewUser && context.inviteCode) {
      try {
        const inviteCode = await this.invite.findCodeByCodeString(
          context.inviteCode,
        );
        if (inviteCode && inviteCode.ownerUserId !== user.id) {
          user.invitedByCodeId = inviteCode.id;
          await this.userRepo.save(user);
          await this.invite.assessAndRecordRedemption({
            inviterUserId: inviteCode.ownerUserId,
            code: inviteCode,
            inviteeUserId: user.id,
            context: {
              inviteePhone: user.phone ?? "",
              inviteeIp: context.ip ?? null,
              inviteeDeviceFingerprint: context.deviceFingerprint ?? null,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Invite redemption failed for user=${user.id}: ${(error as Error).message}`,
        );
      }
    }

    return user;
  }

  async ensureUserByGoogle(
    profile: GoogleVerifiedProfile,
    synthPhone: string,
    context: EnsureUserContext = {},
  ) {
    const user = await this.ensureUserByEmail(profile.email, synthPhone, context);
    if (profile.displayName && !user.displayName) {
      user.displayName = profile.displayName;
      await this.userRepo.save(user);
    }
    try {
      await this.googleAuth.upsertIdentity(user.id, profile);
    } catch (error) {
      this.logger.warn(
        `upsertGoogleIdentity failed for user=${user.id}: ${(error as Error).message}`,
      );
    }
    return user;
  }

  async getUserById(id: string) {
    return this.userRepo.findOne({ where: { id } });
  }

  async getUserByPhone(phone: string) {
    return this.userRepo.findOne({ where: { phone } });
  }

  async listUsersAdmin(query: {
    query?: string;
    subscriptionStatus?: SubscriptionStatus;
    status?: CloudUserStatus;
    inviterPhone?: string;
    registeredFrom?: string;
    registeredTo?: string;
    page?: number;
    pageSize?: number;
    includeTestAccounts?: boolean;
  }): Promise<CloudUserListResponse> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);

    const builder = this.userRepo.createQueryBuilder("user");
    if (!query.includeTestAccounts) {
      // 默认隐藏 smoke / e2e / Twilio 测试号，让"用户"tab 干净。运营临时排查
      // 需要看测试账号时 UI 上勾选 includeTestAccounts=true 即可放回来。
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("user.phone IS NULL OR user.phone NOT LIKE '+%'");
          TEST_ACCOUNT_EMAIL_PATTERNS.forEach((pattern, idx) => {
            qb.andWhere(
              `(user.email IS NULL OR user.email NOT LIKE :testEmailPattern${idx})`,
              { [`testEmailPattern${idx}`]: pattern },
            );
          });
        }),
      );
    }
    if (query.query) {
      builder.andWhere("user.phone LIKE :phoneLike", {
        phoneLike: `%${query.query.trim()}%`,
      });
    }
    if (query.status) {
      builder.andWhere("user.status = :status", { status: query.status });
    }
    if (query.registeredFrom) {
      builder.andWhere("user.createdAt >= :from", { from: new Date(query.registeredFrom) });
    }
    if (query.registeredTo) {
      builder.andWhere("user.createdAt <= :to", { to: new Date(query.registeredTo) });
    }
    if (query.inviterPhone) {
      const inviter = await this.userRepo.findOne({
        where: { phone: query.inviterPhone.trim() },
      });
      if (!inviter) {
        return { items: [], total: 0, page, pageSize, totalPages: 1 };
      }
      const inviterCode = await this.inviteCodeRepo.findOne({
        where: { ownerUserId: inviter.id },
      });
      if (!inviterCode) {
        return { items: [], total: 0, page, pageSize, totalPages: 1 };
      }
      builder.andWhere("user.invitedByCodeId = :inviterCodeId", {
        inviterCodeId: inviterCode.id,
      });
    }

    const total = await builder.getCount();
    const records = await builder
      .orderBy("user.createdAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    let items = await Promise.all(
      records.map((user) => this.serializeUserSummary(user)),
    );

    if (query.subscriptionStatus) {
      items = items.filter((item) => item.subscriptionStatus === query.subscriptionStatus);
    }

    return {
      items,
      total: query.subscriptionStatus ? items.length : total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil((query.subscriptionStatus ? items.length : total) / pageSize), 1),
    };
  }

  async getUserDetailAdmin(id: string): Promise<CloudUserDetail> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException("用户不存在。");
    const summary = await this.serializeUserSummary(user);

    const [subscriptions, redemptionsAsInviter, redemptionAsInviteeRaw, world] = await Promise.all([
      this.subscription.listUserSubscriptions(user.id),
      this.redemptionRepo.find({
        where: { inviterUserId: user.id },
        order: { createdAt: "DESC" },
        take: 50,
      }),
      this.redemptionRepo.findOne({
        where: { inviteeUserId: user.id },
      }),
      user.phone
        ? this.worldRepo.findOne({ where: { phone: user.phone } })
        : Promise.resolve(null),
    ]);

    const redemptionAsInvitee = redemptionAsInviteeRaw
      ? this.invite.serializeSummary(redemptionAsInviteeRaw)
      : null;

    return {
      ...summary,
      subscriptions,
      redemptionsAsInviter: redemptionsAsInviter.map((record) => this.invite.serializeSummary(record)),
      redemptionAsInvitee,
      worldId: world?.id ?? null,
      worldStatus: world?.status ?? null,
      worldApiBaseUrl: world?.apiBaseUrl ?? null,
    };
  }

  async banUser(id: string, reason: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException("用户不存在。");
    user.status = "banned";
    user.bannedReason = reason;
    return this.userRepo.save(user);
  }

  async unbanUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException("用户不存在。");
    user.status = "active";
    user.bannedReason = null;
    return this.userRepo.save(user);
  }

  async serializeUserSummary(user: CloudUserEntity): Promise<CloudUserSummary> {
    const [active, latest, ownInviteCode, inviter, world] = await Promise.all([
      this.subscription.findActiveSubscription(user.id),
      this.subscription.findLatestSubscription(user.id),
      user.inviteCodeId
        ? this.inviteCodeRepo.findOne({ where: { id: user.inviteCodeId } })
        : this.inviteCodeRepo.findOne({ where: { ownerUserId: user.id } }),
      user.invitedByCodeId
        ? this.resolveInviterPhoneByCodeId(user.invitedByCodeId)
        : Promise.resolve(null),
      user.phone
        ? this.worldRepo.findOne({ where: { phone: user.phone } })
        : Promise.resolve(null),
    ]);

    let subscriptionStatus: SubscriptionStatus = "none";
    if (active) subscriptionStatus = "active";
    else if (latest) subscriptionStatus = "expired";

    return {
      id: user.id,
      phone: user.phone ?? "",
      email: user.email,
      displayName: user.displayName,
      status: user.status as CloudUserStatus,
      subscriptionStatus,
      subscriptionExpiresAt: active?.expiresAt.toISOString() ?? latest?.expiresAt.toISOString() ?? null,
      currentPlanCode: active?.planCode ?? latest?.planCode ?? null,
      worldStatus: world?.status ?? null,
      inviterPhone: inviter,
      inviteCode: ownInviteCode?.code ?? null,
      redeemCount: ownInviteCode?.redeemCount ?? 0,
      registrationIp: user.registrationIp,
      lastLoginIp: user.lastLoginIp,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  private async resolveInviterPhoneByCodeId(codeId: string) {
    const code = await this.inviteCodeRepo.findOne({ where: { id: codeId } });
    if (!code) return null;
    const inviter = await this.userRepo.findOne({ where: { id: code.ownerUserId } });
    return inviter?.phone ?? null;
  }
}
// i18n-ignore-end
