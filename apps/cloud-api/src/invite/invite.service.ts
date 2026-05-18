import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  InviteRedemptionAdminRecord,
  InviteRedemptionStatus,
  InviteRedemptionSummary,
  InviteSummaryResponse,
  RedeemInviteResponse,
} from "@yinjie/contracts";
import { Between, MoreThan, Repository } from "typeorm";

function maskPhone(phone: string) {
  const trimmed = phone.replace(/\s+/g, "");
  if (trimmed.length <= 4) return "****";
  if (trimmed.length <= 7) return `${trimmed.slice(0, 3)}****`;
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

// email 用户的 cloudUser.phone 是 synthesizePhoneFromEmail 合成出来的 "9" + 13 位
// 哈希，maskPhone 后形如 "911****2771"，对邀请人来说是个完全没意义的伪手机。
// 这里把它识别出来，落到邀请人 UI 时改用「displayName / 邮箱本地名（脱敏）/ 兜底文案」，
// 不再展示伪手机段。检测条件必须和 email-auth.service.ts 的合成规则严格对齐。
const SYNTHESIZED_EMAIL_PHONE_PATTERN = /^9\d{13}$/;

function maskEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return "";
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 2) return `${local[0] ?? ""}***${domain}`;
  if (local.length <= 4) {
    return `${local.slice(0, 1)}***${local.slice(-1)}${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}${domain}`;
}

function formatInviteeIdentifier(
  invitee: { phone: string | null; email: string | null; displayName: string | null } | undefined,
  fallbackPhone: string,
) {
  // 优先用合成手机识别 email 用户（前端 isSynthesizedEmailPhone 同款规则），
  // 如果没拿到用户实体就只能退化成 maskPhone(fallback)。
  const phone = invitee?.phone ?? fallbackPhone;
  const isSynth = phone ? SYNTHESIZED_EMAIL_PHONE_PATTERN.test(phone) : false;
  if (isSynth) {
    const email = invitee?.email?.trim();
    if (email) return maskEmail(email);
    const name = invitee?.displayName?.trim();
    if (name) return name;
    return "邮箱用户";
  }
  return maskPhone(phone);
}
import { CloudConfigService } from "../cloud-config/cloud-config.service";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { InviteCodeEntity } from "../entities/invite-code.entity";
import { InviteRedemptionEntity } from "../entities/invite-redemption.entity";
import { SubscriptionService } from "../subscription/subscription.service";

const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INVITE_CODE_LENGTH = 6;

export type InviteRiskContext = {
  inviteePhone: string;
  inviteeIp: string | null;
  inviteeDeviceFingerprint: string | null;
};

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    @InjectRepository(InviteCodeEntity)
    private readonly codeRepo: Repository<InviteCodeEntity>,
    @InjectRepository(InviteRedemptionEntity)
    private readonly redemptionRepo: Repository<InviteRedemptionEntity>,
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
    private readonly cloudConfig: CloudConfigService,
    private readonly subscription: SubscriptionService,
  ) {}

  async ensureCodeForUser(userId: string): Promise<InviteCodeEntity> {
    const existing = await this.codeRepo.findOne({ where: { ownerUserId: userId } });
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = this.generateCode();
      const conflict = await this.codeRepo.findOne({ where: { code } });
      if (conflict) continue;
      const created = await this.codeRepo.save(
        this.codeRepo.create({
          code,
          ownerUserId: userId,
        }),
      );
      return created;
    }
    throw new Error("生成邀请码失败：连续冲突。");
  }

  private generateCode() {
    let result = "";
    for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
      const idx = Math.floor(Math.random() * INVITE_CODE_ALPHABET.length);
      result += INVITE_CODE_ALPHABET[idx];
    }
    return result;
  }

  async findCodeByCodeString(codeString: string) {
    const normalized = codeString.trim().toUpperCase();
    if (!normalized) return null;
    return this.codeRepo.findOne({ where: { code: normalized, isActive: true } });
  }

  async hasRedemptionForInvitee(inviteeUserId: string) {
    // 只看 rewarded 行——admin 拒兑后留下的 rejected 行不该再挡受邀人去用别的
    // 合法邀请码（之前是直接 findOne 任何 status，导致 fraud 清理后受邀人永远
    // 失去再被邀请的资格）。partial unique 索引也是同样的口径只保护 rewarded 唯一。
    const existing = await this.redemptionRepo.findOne({
      where: { inviteeUserId, status: "rewarded" },
    });
    return !!existing;
  }

  async assessAndRecordRedemption(payload: {
    inviterUserId: string;
    code: InviteCodeEntity;
    inviteeUserId: string;
    context: InviteRiskContext;
  }): Promise<{ status: InviteRedemptionStatus; rejectReason: string | null; rewardDays: number }> {
    if (await this.hasRedemptionForInvitee(payload.inviteeUserId)) {
      this.logger.warn(`Duplicate redemption for invitee=${payload.inviteeUserId}`);
      return { status: "rejected", rejectReason: "重复兑换", rewardDays: 0 };
    }

    const enabled = await this.cloudConfig.getBoolean("invite.enabled", true);
    if (!enabled) {
      const rejected = await this.persistRedemption(payload, "rejected", "邀请功能已关闭");
      return { status: "rejected", rejectReason: rejected.rejectReason, rewardDays: 0 };
    }

    // 防 sockpuppet 套现：被封 / 归档的邀请人即使有活动 code、即使被邀请人是真人，
    // 也不发奖励。否则封号只挡了登录，攒着的旧 code 还能继续 farm 出 invite_reward
    // 订阅。redemption 行落库（status=rejected）便于运营审计，但不动 codeStats。
    const inviter = await this.userRepo.findOne({ where: { id: payload.inviterUserId } });
    if (!inviter || inviter.status !== "active") {
      const rejected = await this.persistRedemption(
        payload,
        "rejected",
        inviter ? "邀请人账号已停用" : "邀请人不存在",
      );
      return { status: "rejected", rejectReason: rejected.rejectReason, rewardDays: 0 };
    }

    const [maxPerCode, maxIp, maxDevice, rewardDays] = await Promise.all([
      this.cloudConfig.getNumber("invite.maxRedeemPerCode", 50),
      this.cloudConfig.getNumber("invite.maxRedeemPerIpPerDay", 3),
      this.cloudConfig.getNumber("invite.maxRedeemPerDevicePerDay", 2),
      this.cloudConfig.getNumber("invite.rewardDays", 30),
    ]);

    if (payload.code.redeemCount >= maxPerCode) {
      const rejected = await this.persistRedemption(payload, "rejected", "邀请码累计兑换已达上限");
      return { status: "rejected", rejectReason: rejected.rejectReason, rewardDays: 0 };
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (payload.context.inviteeIp) {
      const ipCount = await this.redemptionRepo.count({
        where: {
          inviteeIp: payload.context.inviteeIp,
          createdAt: MoreThan(since),
        },
      });
      if (ipCount >= maxIp) {
        const rejected = await this.persistRedemption(payload, "rejected", "同一 IP 兑换次数过多");
        return { status: "rejected", rejectReason: rejected.rejectReason, rewardDays: 0 };
      }
    }

    if (payload.context.inviteeDeviceFingerprint) {
      const deviceCount = await this.redemptionRepo.count({
        where: {
          inviteeDeviceFingerprint: payload.context.inviteeDeviceFingerprint,
          createdAt: MoreThan(since),
        },
      });
      if (deviceCount >= maxDevice) {
        const rejected = await this.persistRedemption(payload, "rejected", "同一设备兑换次数过多");
        return { status: "rejected", rejectReason: rejected.rejectReason, rewardDays: 0 };
      }
    }

    const reward = await this.subscription.grantSubscription({
      userId: payload.inviterUserId,
      source: "invite_reward",
      durationDays: rewardDays,
      planCode: "invite_reward",
      note: `邀请奖励：被邀请人 ${maskPhone(payload.context.inviteePhone)}`,
      createdBy: "invite-service",
    });

    // 邀请奖励是双边的（share 文案承诺"我们都能获得 30 天会员奖励"），所以这里
    // 给被邀请人也发一份 invite_reward。两张订阅都把 id 挂回 redemption 行
    // （rewardSubscriptionId / inviteeRewardSubscriptionId），admin 拒兑时双边
    // 一起 revoke。invitee 失败只 warn 不影响主流程——inviter 已经拿到奖励，重
    // 发被邀请人的奖励可以靠 invitedRewardGranted=false 的兜底脚本补。
    let inviteeRewardId: string | null = null;
    const invitee = await this.userRepo.findOne({ where: { id: payload.inviteeUserId } });
    if (invitee && !invitee.invitedRewardGranted) {
      try {
        const inviteeReward = await this.subscription.grantSubscription({
          userId: payload.inviteeUserId,
          source: "invite_reward",
          durationDays: rewardDays,
          planCode: "invite_reward",
          note: `受邀奖励：来自邀请码 ${payload.code.code}`,
          createdBy: "invite-service",
        });
        inviteeRewardId = inviteeReward.id;
        invitee.invitedRewardGranted = true;
        await this.userRepo.save(invitee);
      } catch (error) {
        this.logger.warn(
          `Invitee reward grant failed for user=${payload.inviteeUserId}: ${(error as Error).message}`,
        );
      }
    }

    const redemption = await this.persistRedemption(
      payload,
      "rewarded",
      null,
      reward.id,
      inviteeRewardId,
    );
    await this.bumpCodeStats(payload.code.id, rewardDays);

    return { status: redemption.status as InviteRedemptionStatus, rejectReason: null, rewardDays };
  }

  private async persistRedemption(
    payload: {
      inviterUserId: string;
      code: InviteCodeEntity;
      inviteeUserId: string;
      context: InviteRiskContext;
    },
    status: InviteRedemptionStatus,
    rejectReason: string | null,
    rewardSubscriptionId: string | null = null,
    inviteeRewardSubscriptionId: string | null = null,
  ) {
    return this.redemptionRepo.save(
      this.redemptionRepo.create({
        codeId: payload.code.id,
        inviterUserId: payload.inviterUserId,
        inviteeUserId: payload.inviteeUserId,
        inviteePhone: payload.context.inviteePhone,
        inviteeIp: payload.context.inviteeIp,
        inviteeDeviceFingerprint: payload.context.inviteeDeviceFingerprint,
        status,
        rejectReason,
        rewardSubscriptionId,
        inviteeRewardSubscriptionId,
      }),
    );
  }

  // 只在 rewarded 路径调用：让 redeemCount 真正等价于"成功邀请人数"（与 UI 的
  // "成功邀请: N" 语义一致），fraud / rate-limit / banned-inviter 等被拒兑换都
  // 留 invite_redemptions 行供运营审计，但不污染 inviter 的计数。早先 IP / device
  // / maxPerCode 这三条 rejection 也 bump 过，结果同一 IP 的 4 次注册让 inviter
  // 看见 "成功邀请: 4 / 累计奖励: 90 天"——天数对、人数虚高 1。
  private async bumpCodeStats(codeId: string, rewardDays: number) {
    const code = await this.codeRepo.findOne({ where: { id: codeId } });
    if (!code) return;
    code.redeemCount += 1;
    code.rewardDaysGranted += rewardDays;
    await this.codeRepo.save(code);
  }

  // 跟 bumpCodeStats(rewarded=true) 对称：admin 撤销一条已发放奖励的兑换时调用，
  // 把当初加上去的 redeemCount + rewardDaysGranted 减回去。Math.max 兜底负值，
  // 防御历史数据脏（迁移前的旧行 codeId 找不到等）。
  private async unbumpCodeStats(codeId: string, rewardDays: number) {
    const code = await this.codeRepo.findOne({ where: { id: codeId } });
    if (!code) return;
    code.redeemCount = Math.max(0, code.redeemCount - 1);
    code.rewardDaysGranted = Math.max(0, code.rewardDaysGranted - rewardDays);
    await this.codeRepo.save(code);
  }

  async buildClientSummary(userId: string): Promise<InviteSummaryResponse> {
    const [enabled, rewardDays, code, redemptions, shareTitle, shareBody, publicBaseUrl] =
      await Promise.all([
        this.cloudConfig.getBoolean("invite.enabled", true),
        this.cloudConfig.getNumber("invite.rewardDays", 30),
        this.codeRepo.findOne({ where: { ownerUserId: userId } }),
        this.redemptionRepo.find({
          where: { inviterUserId: userId },
          order: { createdAt: "DESC" },
          take: 20,
        }),
        this.cloudConfig.getString(
          "copy.inviteShareTitle",
          "快来加入隐界，免费体验 AI 社交世界",
        ),
        this.cloudConfig.getString(
          "copy.inviteShareBody",
          "使用我的邀请码注册，我们都能获得 30 天会员奖励。",
        ),
        this.cloudConfig.getString("app.publicBaseUrl", ""),
      ]);

    // 被管理员 deactivate 的 code 不能再被兑换（findCodeByCodeString 会过滤掉
    // isActive=false），但 summary 里如果照样回这个 code，邀请人发出去的 share
    // URL 朋友点开就 404"邀请码不存在或已停用"。这里跟兑换端对齐：deactivate
    // 的 code 一律视作"没 code"，让 UI 进入空态，不要给用户一条死链。
    const shareableCode = code?.isActive ? code : null;

    const trimmedBaseUrl = publicBaseUrl.replace(/\/+$/, "");
    const isPlaceholderBase =
      !trimmedBaseUrl || trimmedBaseUrl === "https://app.example.com";
    const effectiveBaseUrl = isPlaceholderBase ? null : trimmedBaseUrl;
    const shareUrl =
      effectiveBaseUrl && shareableCode
        ? `${effectiveBaseUrl}/?invite=${encodeURIComponent(shareableCode.code)}`
        : null;

    // 客户端 recentRedemptions 要把 email 用户的合成手机替换成邮箱脱敏/昵称，
    // 一次性 IN 查出所有 invitee，再传给 serializeSummary 用。
    const inviteeIds = Array.from(
      new Set(redemptions.map((r) => r.inviteeUserId).filter(Boolean)),
    );
    const invitees = inviteeIds.length
      ? await this.userRepo
          .createQueryBuilder("user")
          .whereInIds(inviteeIds)
          .getMany()
      : [];
    const inviteeMap = new Map(invitees.map((u) => [u.id, u]));

    return {
      enabled,
      code: shareableCode?.code ?? null,
      shareTitle,
      shareBody,
      shareUrl,
      publicAppBaseUrl: effectiveBaseUrl,
      rewardDays,
      // redeemCount / rewardDaysGranted 是历史累计统计，即使 code 被 deactivate
      // 也保留展示——隐藏会让"我邀请过多少人"这一栏在 deactivate 后突然清零，
      // 比展示活动 code 的旧数据更诡异。
      redeemCount: code?.redeemCount ?? 0,
      rewardDaysGranted: code?.rewardDaysGranted ?? 0,
      recentRedemptions: redemptions.map((record) =>
        this.serializeSummary(record, inviteeMap.get(record.inviteeUserId)),
      ),
    };
  }

  serializeSummary(
    record: InviteRedemptionEntity,
    invitee?: CloudUserEntity,
  ): InviteRedemptionSummary {
    return {
      id: record.id,
      inviteePhoneMasked: formatInviteeIdentifier(invitee, record.inviteePhone),
      status: record.status as InviteRedemptionStatus,
      rejectReason: record.rejectReason,
      rewardSubscriptionId: record.rewardSubscriptionId,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async listRedemptionsAdmin(query: {
    query?: string;
    status?: InviteRedemptionStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
    const where: Record<string, unknown> = {};
    if (query.status) {
      where.status = query.status;
    }
    const [records, total] = await this.redemptionRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const userIds = Array.from(
      new Set(
        records
          .flatMap((r) => [r.inviterUserId, r.inviteeUserId])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const users = userIds.length
      ? await this.userRepo
          .createQueryBuilder("user")
          .whereInIds(userIds)
          .getMany()
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const codeIds = Array.from(new Set(records.map((r) => r.codeId)));
    const codes = codeIds.length
      ? await this.codeRepo
          .createQueryBuilder("code")
          .whereInIds(codeIds)
          .getMany()
      : [];
    const codeMap = new Map(codes.map((c) => [c.id, c]));

    let items: InviteRedemptionAdminRecord[] = records.map((record) => ({
      id: record.id,
      inviteeUserId: record.inviteeUserId,
      inviteePhone: record.inviteePhone,
      inviteeIp: record.inviteeIp,
      inviteeDeviceFingerprint: record.inviteeDeviceFingerprint,
      inviterUserId: record.inviterUserId,
      inviterPhone: userMap.get(record.inviterUserId)?.phone ?? "",
      codeId: record.codeId,
      inviteCode: codeMap.get(record.codeId)?.code ?? "",
      status: record.status as InviteRedemptionStatus,
      rejectReason: record.rejectReason,
      rewardSubscriptionId: record.rewardSubscriptionId,
      createdAt: record.createdAt.toISOString(),
    }));

    if (query.query) {
      const q = query.query.trim().toLowerCase();
      items = items.filter(
        (item) =>
          item.inviteePhone.toLowerCase().includes(q) ||
          item.inviterPhone.toLowerCase().includes(q) ||
          item.inviteCode.toLowerCase().includes(q),
      );
    }

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async rejectRedemption(redemptionId: string, reason: string, actor: string | null) {
    const record = await this.redemptionRepo.findOne({ where: { id: redemptionId } });
    if (!record) return null;
    if (record.status === "rejected") return record;
    const wasRewarded = record.status === "rewarded";
    record.status = "rejected";
    record.rejectReason = reason;
    const note = `${actor ?? "admin"}: ${reason}`;
    // 撤回前先抓住 inviter 那张订阅的实际 grant 天数，用于稍后回滚 code 累计
    // 统计。inviter / invitee 两张是同时同长 grant，挑任意一张算就行。
    let rewardDaysToRevert = 0;
    if (wasRewarded && record.rewardSubscriptionId) {
      const revoked = await this.subscription.revokeSubscription(
        record.rewardSubscriptionId,
        note,
      );
      if (revoked) {
        rewardDaysToRevert = Math.round(
          (revoked.expiresAt.getTime() - revoked.startsAt.getTime()) /
            (24 * 60 * 60 * 1000),
        );
      }
      record.rewardSubscriptionId = null;
    }
    if (record.inviteeRewardSubscriptionId) {
      await this.subscription.revokeSubscription(
        record.inviteeRewardSubscriptionId,
        note,
      );
      record.inviteeRewardSubscriptionId = null;
    }
    // 当初 grant 时 bumpCodeStats 在 inviter 的 invite_codes 上 +1 redeemCount
    // / +rewardDays。撤销时必须对称回退，否则 /summary 上 inviter 看到的"我邀
    // 请了 N 人 / 累计 M 天"长期虚高、跟实际能用的 active 订阅对不上。
    if (wasRewarded && record.codeId) {
      await this.unbumpCodeStats(record.codeId, rewardDaysToRevert);
    }
    // 同步把 invitee.invitedRewardGranted 翻回 false，运维之后想给同一个被邀
    // 请人补发（换个 inviter 重新跑兑换）才不会被 grant 时的 guard 拦掉。
    if (record.inviteeUserId) {
      const invitee = await this.userRepo.findOne({ where: { id: record.inviteeUserId } });
      if (invitee && invitee.invitedRewardGranted) {
        invitee.invitedRewardGranted = false;
        await this.userRepo.save(invitee);
      }
    }
    return this.redemptionRepo.save(record);
  }
}
// i18n-ignore-end
