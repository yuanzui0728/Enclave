import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  assertPasswordStrength,
  hashPassword,
} from "../auth/password-policy";
import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  CloudUserDetail,
  CloudUserDistribution,
  CloudUserDistributionBucket,
  CloudUserListResponse,
  CloudUserStats,
  CloudUserStatus,
  CloudUserSummary,
  SubscriptionStatus,
} from "@yinjie/contracts";
import { Between, Brackets, In, Repository, type SelectQueryBuilder } from "typeorm";
import { classifyDeviceType } from "../auth/device-type";
import { EmailAuthService } from "../auth/email-auth.service";
import {
  GoogleAuthService,
  type GoogleVerifiedProfile,
} from "../auth/google-auth.service";
import { PhoneAuthService } from "../auth/phone-auth.service";
import { ClientTelemetryEventEntity } from "../entities/client-telemetry-event.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { InviteCodeEntity } from "../entities/invite-code.entity";
import { InviteRedemptionEntity } from "../entities/invite-redemption.entity";
import { UserSubscriptionEntity } from "../entities/user-subscription.entity";
import { InviteService } from "../invite/invite.service";
import { SubscriptionService } from "../subscription/subscription.service";
import { IpRegionService } from "./ip-region.service";

export type EnsureUserContext = {
  inviteCode?: string | null;
  ip?: string | null;
  deviceFingerprint?: string | null;
  userAgent?: string | null;
  clientPlatform?: string | null;
  // 注册时一并设置的初始登录密码。仅在 isNewUser=true 时落盘；
  // 老用户即便传了也会被忽略，避免静默覆盖。
  setPasswordOnRegister?: string | null;
};

// e2e / smoke / playwright / Twilio 测试号会把"用户"tab 灌得到处是脏数据，运营
// 看不清真实账号。判别用「正向白名单 + 反向黑名单」两道筛：
//   生产手机注册的 phone 一律是 14 位、9 开头的 hash id（91/92/.../99…）。所以
//   反过来：phone 不是 NULL 也不是 14 位 9 开头 → 必然不是正式注册路径，全部
//   归为测试。这一刀覆盖了：
//     - "+" 开头 E.164（+86…/+15005550001 这种自动化测试号）
//     - 11 位裸国内号（138/139/177/173 之类的演示号、demo 号、手动塞的种子号）
//   email 再加一层后备：smoke- 前缀 / @example.com / smoke 脚本固定的 a/b/c.com
//   这几个 RFC2606 保留 + 内部约定的"垃圾域名"——主要 catch 没填 phone 的纯
//   email 注册测试号。
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
    @InjectRepository(ClientTelemetryEventEntity)
    private readonly telemetryRepo: Repository<ClientTelemetryEventEntity>,
    private readonly subscription: SubscriptionService,
    private readonly invite: InviteService,
    private readonly phoneAuth: PhoneAuthService,
    private readonly emailAuth: EmailAuthService,
    private readonly googleAuth: GoogleAuthService,
    private readonly ipRegion: IpRegionService,
  ) {}

  // 异步解析 IP region 并更新 cloud_users.lastLoginRegion / lastLoginCountryCode。
  // 登录路径用 void 调用，不阻塞响应：IpRegionService 5s × 2 provider 在首次/
  // 未缓存 IP 时会拖慢登录，cache 命中 7d 后又零延迟。fire-and-forget 让
  // 用户立刻拿到 accessToken；几百 ms 内后台再写入。解析失败保留旧值。
  private async resolveAndUpdateLastLoginRegion(userId: string, ip: string) {
    try {
      const lookup = await this.ipRegion.resolve(ip);
      const patch: Partial<CloudUserEntity> = {};
      if (lookup.region) patch.lastLoginRegion = lookup.region;
      if (lookup.countryCode) patch.lastLoginCountryCode = lookup.countryCode;
      if (Object.keys(patch).length > 0) {
        await this.userRepo.update(userId, patch);
      }
    } catch (error) {
      this.logger.warn(
        `lastLoginRegion async resolve failed user=${userId} ip=${ip}: ${(error as Error).message}`,
      );
    }
  }

  onModuleInit() {
    this.phoneAuth.registerPostVerifyHook(async (phone, extras) => {
      try {
        await this.ensureUser(phone, {
          inviteCode: extras.inviteCode ?? null,
          ip: extras.ip ?? null,
          deviceFingerprint: extras.deviceFingerprint ?? null,
          userAgent: extras.userAgent ?? null,
          clientPlatform: extras.clientPlatform ?? null,
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
          userAgent: extras.userAgent ?? null,
          clientPlatform: extras.clientPlatform ?? null,
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
        userAgent: extras.userAgent ?? null,
        clientPlatform: extras.clientPlatform ?? null,
      });
    });

    // 老用户回填 region：扫 lastLoginIp 非空且 lastLoginRegion 为空的账号，
    // 串行调 IpRegionService（7d 缓存命中后零延迟），失败/解析不到的保留 null。
    // 不 await — 后台异步跑，不阻塞 Nest 启动。
    void this.backfillLastLoginRegions();
  }

  async ensureUser(phone: string, context: EnsureUserContext = {}) {
    const now = new Date();
    const device = classifyDeviceType(context.clientPlatform, context.userAgent);
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
        lastLoginDeviceType: device,
      });
      user = await this.userRepo.save(user);
    } else {
      user.lastLoginAt = now;
      if (context.ip) user.lastLoginIp = context.ip;
      if (!user.registrationIp && context.ip) user.registrationIp = context.ip;
      if (!user.registrationDeviceFingerprint && context.deviceFingerprint) {
        user.registrationDeviceFingerprint = context.deviceFingerprint;
      }
      if (device) user.lastLoginDeviceType = device;
      user = await this.userRepo.save(user);
    }

    // Region 异步写入，不阻塞登录响应。见 resolveAndUpdateLastLoginRegion 注释。
    if (context.ip) {
      void this.resolveAndUpdateLastLoginRegion(user.id, context.ip);
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
    const device = classifyDeviceType(context.clientPlatform, context.userAgent);
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
        lastLoginDeviceType: device,
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
      if (device) user.lastLoginDeviceType = device;
      user = await this.userRepo.save(user);
    }

    // Region 异步写入，不阻塞登录响应。
    if (context.ip) {
      void this.resolveAndUpdateLastLoginRegion(user.id, context.ip);
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

  // 给老用户一次性回填 lastLoginRegion / lastLoginCountryCode。挑 lastLoginIp
  // 不为空且 lastLoginRegion 为空的账号串行跑。ipRegion 解析有 5s 超时 + 7d 缓存，
  // 串行避免连续打爆 ip-api 限频。重启第二次起条件不再命中，自然跳过。
  private async backfillLastLoginRegions() {
    try {
      const candidates = await this.userRepo
        .createQueryBuilder("u")
        .select(["u.id", "u.lastLoginIp"])
        .where("u.lastLoginIp IS NOT NULL")
        .andWhere("u.lastLoginRegion IS NULL")
        .getMany();

      if (candidates.length === 0) return;

      this.logger.log(
        `[backfill] resolving lastLoginRegion for ${candidates.length} cloud users`,
      );

      let resolved = 0;
      for (const candidate of candidates) {
        const ip = candidate.lastLoginIp;
        if (!ip) continue;
        try {
          const lookup = await this.ipRegion.resolve(ip);
          if (lookup.region || lookup.countryCode) {
            await this.userRepo.update(candidate.id, {
              lastLoginRegion: lookup.region ?? null,
              lastLoginCountryCode: lookup.countryCode ?? null,
            });
            resolved += 1;
          }
        } catch (error) {
          this.logger.warn(
            `[backfill] resolve failed for user=${candidate.id} ip=${ip}: ${(error as Error).message}`,
          );
        }
      }

      this.logger.log(
        `[backfill] lastLoginRegion resolved ${resolved}/${candidates.length}`,
      );
    } catch (error) {
      this.logger.warn(
        `[backfill] lastLoginRegion task failed: ${(error as Error).message}`,
      );
    }
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
    orderBy?: "expires" | "registered" | "lastLogin" | "lastChatMessage";
    orderDir?: "asc" | "desc";
  }): Promise<CloudUserListResponse> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);

    const builder = this.userRepo.createQueryBuilder("user");
    if (!query.includeTestAccounts) {
      // 默认隐藏 smoke / e2e / Twilio / 演示号，让"用户"tab 干净。运营临时排查
      // 需要看测试账号时 UI 上勾选 includeTestAccounts=true 即可放回来。
      this.applyProductionUserFilter(builder);
    }
    if (query.query) {
      // 生产 phone 是 14 位 hash，运营记不住；同一行又有 email/displayName 显式
      // 展示。搜索框要同时模糊匹配三列，否则按 email 搜永远空。
      const like = `%${query.query.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("user.phone LIKE :userQueryLike", { userQueryLike: like })
            .orWhere("user.email LIKE :userQueryLike", { userQueryLike: like })
            .orWhere("user.displayName LIKE :userQueryLike", {
              userQueryLike: like,
            });
        }),
      );
    }
    if (query.status) {
      builder.andWhere("user.status = :status", { status: query.status });
    }
    if (query.subscriptionStatus) {
      // subscriptionStatus 必须在 LIMIT 之前过滤，否则就是"先取 20 条 + JS 过滤"
      // → 选 expired 经常只看到 0–5 条且没下一页（实际全库可能几十条）。
      //   active  = 存在 status='active' 且未过期的订阅
      //   expired = 至少有一条订阅 但 不存在 active 行
      //   none    = 完全没有订阅记录
      // 这套口径必须跟 serializeUserSummary 里 active/latest 的推导保持一致。
      const now = new Date();
      if (query.subscriptionStatus === "active") {
        builder.andWhere(
          `EXISTS (SELECT 1 FROM "user_subscriptions" "subStatus"
            WHERE "subStatus"."userId" = "user"."id"
              AND "subStatus"."status" = 'active'
              AND "subStatus"."startsAt" <= :subStatusNow
              AND "subStatus"."expiresAt" > :subStatusNow)`,
          { subStatusNow: now },
        );
      } else if (query.subscriptionStatus === "none") {
        builder.andWhere(
          `NOT EXISTS (SELECT 1 FROM "user_subscriptions" "subStatus"
            WHERE "subStatus"."userId" = "user"."id")`,
        );
      } else if (query.subscriptionStatus === "expired") {
        builder
          .andWhere(
            `EXISTS (SELECT 1 FROM "user_subscriptions" "subStatusAny"
              WHERE "subStatusAny"."userId" = "user"."id")`,
          )
          .andWhere(
            `NOT EXISTS (SELECT 1 FROM "user_subscriptions" "subStatusActive"
              WHERE "subStatusActive"."userId" = "user"."id"
                AND "subStatusActive"."status" = 'active'
                AND "subStatusActive"."startsAt" <= :subStatusNow
                AND "subStatusActive"."expiresAt" > :subStatusNow)`,
            { subStatusNow: now },
          );
      }
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

    // 在 getCount() 之后再挂排序相关的 join，避免影响 count 行数（subquery
    // 已经 GROUP BY userId，是 1:1 join，但仍按"先 count 后 join"留一层保险）。
    const orderBy = query.orderBy ?? "registered";
    const orderDir: "ASC" | "DESC" =
      (query.orderDir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    if (orderBy === "expires") {
      // subscriptionExpiresAt 在序列化时取「active 或 latest」的 expiresAt，等价
      // 于 MAX(expiresAt) per user（active 永远 > expired），所以这里直接 MAX
      // 就够，不用区分 status。
      // 用相关子查询而不是 leftJoin：TypeORM .take() 会把整个 SELECT 包成分页
      // 子查询，子查询里访问 leftJoin 出来的别名列容易"unknown column"，相关
      // 子查询贴在 ORDER BY 里则不依赖任何额外 SELECT。
      const latestExpiresSql =
        '(SELECT MAX("us"."expiresAt") FROM "user_subscriptions" "us" WHERE "us"."userId" = "user"."id")';
      builder
        // NULL 永远排到末尾，匹配前端老逻辑里 av===null 返回 1 的语义；
        // 不依赖 SQLite/PG 的 NULLS LAST 方言。
        .orderBy(`CASE WHEN ${latestExpiresSql} IS NULL THEN 1 ELSE 0 END`, "ASC")
        .addOrderBy(latestExpiresSql, orderDir)
        .addOrderBy("user.createdAt", "DESC");
    } else if (orderBy === "lastLogin") {
      builder
        .orderBy("CASE WHEN user.lastLoginAt IS NULL THEN 1 ELSE 0 END", "ASC")
        .addOrderBy("user.lastLoginAt", orderDir)
        .addOrderBy("user.createdAt", "DESC");
    } else if (orderBy === "lastChatMessage") {
      // 跟 expires 一样走相关子查询贴 ORDER BY，避免 leftJoin 撞上 TypeORM
      // 分页二段查询的列别名问题。索引命中 IDX_..._user_time(userId,occurredAt)
      // + IDX_..._app_name_time(appId,eventName,occurredAt)。
      const lastChatSql =
        '(SELECT MAX("ce"."occurredAt") FROM "client_telemetry_events" "ce"' +
        ' WHERE "ce"."userId" = "user"."id" AND "ce"."eventName" = \'chat_message_sent\')';
      builder
        .orderBy(`CASE WHEN ${lastChatSql} IS NULL THEN 1 ELSE 0 END`, "ASC")
        .addOrderBy(lastChatSql, orderDir)
        .addOrderBy("user.createdAt", "DESC");
    } else {
      builder.orderBy("user.createdAt", orderDir);
    }

    const records = await builder
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const items = await Promise.all(
      records.map((user) => this.serializeUserSummary(user)),
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
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
    const [active, latest, ownInviteCode, inviter, world, lastChat] = await Promise.all([
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
      this.telemetryRepo
        .createQueryBuilder("ce")
        .select("MAX(ce.occurredAt)", "lastChatAt")
        .where("ce.userId = :userId", { userId: user.id })
        .andWhere("ce.eventName = 'chat_message_sent'")
        .getRawOne<{ lastChatAt: string | null }>(),
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
      lastLoginDeviceType:
        user.lastLoginDeviceType === "mobile" ||
        user.lastLoginDeviceType === "desktop"
          ? user.lastLoginDeviceType
          : null,
      lastLoginRegion: user.lastLoginRegion,
      lastLoginCountryCode: user.lastLoginCountryCode,
      // SQLite 把 datetime 当 TEXT 存，getRawOne 出来就是字符串；空表 MAX 返回
      // null，正好对应"该用户从没发过 chat_message_sent"。统一转成 ISO 防止
      // "2026-05-18 03:31:59.441" 这种空格分隔被前端 new Date 在 Safari 上 NaN。
      lastChatMessageAt: normalizeSqliteIsoTimestamp(lastChat?.lastChatAt ?? null),
    };
  }

  // 顶部"用户总数 / 会员用户数"卡片。口径固定为生产用户（永远剔除测试账号），
  // 不受当前列表筛选器影响——运营随便切 status/subscriptionStatus/搜索，看到的
  // 卡片数字依然是真实总量。
  // 用户分布饼图数据：地区维度 top 10 + "其他"聚合（避免长尾国家压扁饼图）；
  // 设备维度 mobile/desktop/unknown 三档（unknown = lastLoginDeviceType 为空，
  // 通常是该字段上线之前已存在的老用户）。剔除测试账号，与 getUserStatsAdmin
  // 同口径。
  async getUserDistributionAdmin(): Promise<CloudUserDistribution> {
    const REGION_TOP_N = 10;
    const UNKNOWN_REGION_LABEL = "未知";
    const OTHER_REGION_LABEL = "其他";

    // 地区聚合：lastLoginRegion 为空时归到 "未知"。生产口径用
    // applyProductionUserFilter 复用同一套测试号过滤。
    const regionBuilder = this.userRepo
      .createQueryBuilder("user")
      .select(
        "COALESCE(NULLIF(TRIM(user.lastLoginRegion), ''), :unknownRegion)",
        "label",
      )
      .addSelect("COUNT(*)", "count")
      .setParameter("unknownRegion", UNKNOWN_REGION_LABEL)
      .groupBy("label")
      .orderBy("count", "DESC");
    this.applyProductionUserFilter(regionBuilder);
    const rawRegions = await regionBuilder.getRawMany<{
      label: string;
      count: string | number;
    }>();

    const regionBuckets: CloudUserDistributionBucket[] = rawRegions.map((r) => ({
      label: r.label || UNKNOWN_REGION_LABEL,
      count: Number(r.count),
    }));
    let byRegion: CloudUserDistributionBucket[];
    if (regionBuckets.length <= REGION_TOP_N) {
      byRegion = regionBuckets;
    } else {
      const head = regionBuckets.slice(0, REGION_TOP_N);
      const tail = regionBuckets.slice(REGION_TOP_N);
      const tailSum = tail.reduce((acc, b) => acc + b.count, 0);
      byRegion = [...head, { label: OTHER_REGION_LABEL, count: tailSum }];
    }

    // 设备聚合：把 NULL 归到 "unknown"，避免漏算；其他值（mobile/desktop）原样。
    const deviceBuilder = this.userRepo
      .createQueryBuilder("user")
      .select(
        "COALESCE(NULLIF(TRIM(user.lastLoginDeviceType), ''), 'unknown')",
        "label",
      )
      .addSelect("COUNT(*)", "count")
      .groupBy("label")
      .orderBy("count", "DESC");
    this.applyProductionUserFilter(deviceBuilder);
    const rawDevices = await deviceBuilder.getRawMany<{
      label: string;
      count: string | number;
    }>();
    const byDevice: CloudUserDistributionBucket[] = rawDevices.map((r) => ({
      label: r.label || "unknown",
      count: Number(r.count),
    }));

    return { byRegion, byDevice };
  }

  async getUserStatsAdmin(): Promise<CloudUserStats> {
    const baseBuilder = this.userRepo.createQueryBuilder("user");
    this.applyProductionUserFilter(baseBuilder);
    const totalUsers = await baseBuilder.getCount();

    // 会员定义跟列表 subscriptionStatus=active 完全同口径：当下存在 status=active
    // 且未过期的订阅行。这样卡片 + 列表筛选选 active 时数字必然一致。
    const memberBuilder = baseBuilder.clone();
    const now = new Date();
    memberBuilder.andWhere(
      `EXISTS (SELECT 1 FROM "user_subscriptions" "subStatus"
        WHERE "subStatus"."userId" = "user"."id"
          AND "subStatus"."status" = 'active'
          AND "subStatus"."startsAt" <= :subStatusNow
          AND "subStatus"."expiresAt" > :subStatusNow)`,
      { subStatusNow: now },
    );
    const memberUsers = await memberBuilder.getCount();

    return { totalUsers, memberUsers };
  }

  private applyProductionUserFilter(
    builder: SelectQueryBuilder<CloudUserEntity>,
  ) {
    builder.andWhere(
      new Brackets((qb) => {
        // phone 白名单：要么没填（纯 email/Google 注册），要么是 14 位 9 开头
        // 的生产 hash。两者都不是 → 测试号（"+"E.164 / 11 位裸号 / 演示号）。
        //
        // 必须用最外层 () 把这条 OR 包住——SQL 里 AND 优先级高于 OR，TypeORM
        // 把 `qb.where("A OR B").andWhere("C").andWhere("D")` 拼成
        // `A OR B AND C AND D`，会被解释成 `A OR (B AND C AND D)`：phone IS
        // NULL 的 e2e-test@example.com 直接短路绕开整段 email 黑名单。
        qb.where(
          "(user.phone IS NULL OR (LENGTH(user.phone) = 14 AND user.phone GLOB '9*'))",
        );
        TEST_ACCOUNT_EMAIL_PATTERNS.forEach((pattern, idx) => {
          qb.andWhere(
            `(user.email IS NULL OR user.email NOT LIKE :testEmailPattern${idx})`,
            { [`testEmailPattern${idx}`]: pattern },
          );
        });
      }),
    );
  }

  private async resolveInviterPhoneByCodeId(codeId: string) {
    const code = await this.inviteCodeRepo.findOne({ where: { id: codeId } });
    if (!code) return null;
    const inviter = await this.userRepo.findOne({ where: { id: code.ownerUserId } });
    return inviter?.phone ?? null;
  }
}

function normalizeSqliteIsoTimestamp(raw: string | null): string | null {
  if (!raw) return null;
  // 已经是 ISO（含 T 和 Z/offset）就不动
  if (raw.includes("T")) return raw;
  // "2026-05-18 03:31:59.441" → "2026-05-18T03:31:59.441Z"
  // SQLite datetime() / Date.toISOString() 写入的都是 UTC，没有时区后缀
  // 时浏览器 new Date 会按本地时区解释，导致跨用户显示错位。
  const parsed = new Date(raw.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}
// i18n-ignore-end
