import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
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
    const existing = await this.redemptionRepo.findOne({ where: { inviteeUserId } });
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

    const [maxPerCode, maxIp, maxDevice, rewardDays] = await Promise.all([
      this.cloudConfig.getNumber("invite.maxRedeemPerCode", 50),
      this.cloudConfig.getNumber("invite.maxRedeemPerIpPerDay", 3),
      this.cloudConfig.getNumber("invite.maxRedeemPerDevicePerDay", 2),
      this.cloudConfig.getNumber("invite.rewardDays", 30),
    ]);

    if (payload.code.redeemCount >= maxPerCode) {
      const rejected = await this.persistRedemption(payload, "rejected", "邀请码累计兑换已达上限");
      await this.bumpCodeStats(payload.code.id, false);
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
        await this.bumpCodeStats(payload.code.id, false);
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
        await this.bumpCodeStats(payload.code.id, false);
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

    const redemption = await this.persistRedemption(payload, "rewarded", null, reward.id);
    await this.bumpCodeStats(payload.code.id, true, rewardDays);

    const invitee = await this.userRepo.findOne({ where: { id: payload.inviteeUserId } });
    if (invitee && !invitee.invitedRewardGranted) {
      invitee.invitedRewardGranted = true;
      await this.userRepo.save(invitee);
    }

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
      }),
    );
  }

  private async bumpCodeStats(codeId: string, rewarded: boolean, rewardDays = 0) {
    const code = await this.codeRepo.findOne({ where: { id: codeId } });
    if (!code) return;
    code.redeemCount += 1;
    if (rewarded) {
      code.rewardDaysGranted += rewardDays;
    }
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

    const shareUrl =
      publicBaseUrl && code
        ? `${publicBaseUrl.replace(/\/+$/, "")}/?invite=${encodeURIComponent(code.code)}`
        : null;

    return {
      enabled,
      code: code?.code ?? null,
      shareTitle,
      shareBody,
      shareUrl,
      rewardDays,
      redeemCount: code?.redeemCount ?? 0,
      rewardDaysGranted: code?.rewardDaysGranted ?? 0,
      recentRedemptions: redemptions.map((record) => this.serializeSummary(record)),
    };
  }

  serializeSummary(record: InviteRedemptionEntity): InviteRedemptionSummary {
    return {
      id: record.id,
      inviteePhoneMasked: maskPhone(record.inviteePhone),
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
    record.status = "rejected";
    record.rejectReason = reason;
    if (record.rewardSubscriptionId) {
      await this.subscription.revokeSubscription(
        record.rewardSubscriptionId,
        `${actor ?? "admin"}: ${reason}`,
      );
      record.rewardSubscriptionId = null;
    }
    return this.redemptionRepo.save(record);
  }
}
