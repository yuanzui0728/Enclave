import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  SubscriptionCopyBundle,
  SubscriptionLookupResponse,
  SubscriptionPlanSummary,
  SubscriptionRecordSummary,
  SubscriptionStateResponse,
  SubscriptionStatus,
} from "@yinjie/contracts";
import { In, MoreThan, Repository } from "typeorm";
import { CloudConfigService } from "../cloud-config/cloud-config.service";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { InviteCodeEntity } from "../entities/invite-code.entity";
import { SubscriptionPlanEntity } from "../entities/subscription-plan.entity";
import { UserSubscriptionEntity } from "../entities/user-subscription.entity";

const ACTIVE_STATUSES = ["active"] as const;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(SubscriptionPlanEntity)
    private readonly planRepo: Repository<SubscriptionPlanEntity>,
    @InjectRepository(UserSubscriptionEntity)
    private readonly subscriptionRepo: Repository<UserSubscriptionEntity>,
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
    @InjectRepository(InviteCodeEntity)
    private readonly inviteCodeRepo: Repository<InviteCodeEntity>,
    private readonly cloudConfig: CloudConfigService,
  ) {}

  async listActivePlans(): Promise<SubscriptionPlanSummary[]> {
    const plans = await this.planRepo.find({
      where: { isActive: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    return plans.map((plan) => this.serializePlan(plan));
  }

  async listAllPlans(): Promise<SubscriptionPlanSummary[]> {
    const plans = await this.planRepo.find({ order: { sortOrder: "ASC", createdAt: "ASC" } });
    return plans.map((plan) => this.serializePlan(plan));
  }

  async getPlanByCode(code: string) {
    return this.planRepo.findOne({ where: { code } });
  }

  async upsertPlan(payload: {
    id?: string;
    code: string;
    name: string;
    durationDays: number;
    priceCents: number;
    currency?: string;
    isActive?: boolean;
    isTrial?: boolean;
    isPubliclyPurchasable?: boolean;
    sortOrder?: number;
    description?: string | null;
  }): Promise<SubscriptionPlanSummary> {
    const existing = payload.id
      ? await this.planRepo.findOne({ where: { id: payload.id } })
      : await this.planRepo.findOne({ where: { code: payload.code } });
    const plan = existing ?? this.planRepo.create();
    plan.code = payload.code;
    plan.name = payload.name;
    plan.durationDays = payload.durationDays;
    plan.priceCents = payload.priceCents;
    if (payload.currency !== undefined) plan.currency = payload.currency;
    if (payload.isActive !== undefined) plan.isActive = payload.isActive;
    if (payload.isTrial !== undefined) plan.isTrial = payload.isTrial;
    if (payload.isPubliclyPurchasable !== undefined)
      plan.isPubliclyPurchasable = payload.isPubliclyPurchasable;
    if (payload.sortOrder !== undefined) plan.sortOrder = payload.sortOrder;
    if (payload.description !== undefined) plan.description = payload.description ?? null;
    const saved = await this.planRepo.save(plan);
    return this.serializePlan(saved);
  }

  async findActiveSubscription(userId: string) {
    return this.subscriptionRepo.findOne({
      where: {
        userId,
        status: "active",
        expiresAt: MoreThan(new Date()),
      },
      order: { expiresAt: "DESC" },
    });
  }

  async findLatestSubscription(userId: string) {
    return this.subscriptionRepo.findOne({
      where: { userId },
      order: { expiresAt: "DESC" },
    });
  }

  async listUserSubscriptions(userId: string) {
    const records = await this.subscriptionRepo.find({
      where: { userId },
      order: { expiresAt: "DESC" },
    });
    const planCodes = Array.from(new Set(records.map((r) => r.planCode)));
    const plans =
      planCodes.length > 0
        ? await this.planRepo.find({ where: { code: In(planCodes) } })
        : [];
    const planMap = new Map(plans.map((plan) => [plan.code, plan]));
    return records.map((record) => this.serializeRecord(record, planMap.get(record.planCode)?.name));
  }

  async grantTrialIfNeeded(userId: string, createdBy: string | null = null) {
    const trialEnabled = await this.cloudConfig.getBoolean("trial.enabled", true);
    if (!trialEnabled) return null;
    const days = await this.cloudConfig.getNumber("trial.days", 7);
    const existingTrial = await this.subscriptionRepo.findOne({
      where: { userId, source: "trial" },
    });
    if (existingTrial) return null;
    const plan =
      (await this.planRepo.findOne({ where: { code: "trial" } })) ??
      (await this.planRepo.findOne({ where: { isTrial: true } }));
    const planCode = plan?.code ?? "trial";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.subscriptionRepo.save(
      this.subscriptionRepo.create({
        userId,
        planCode,
        source: "trial",
        status: "active",
        startsAt: now,
        expiresAt,
        amountCents: 0,
        externalOrderId: null,
        note: "新用户首次登录自动赠送试用",
        createdBy,
      }),
    );
  }

  async grantSubscription(payload: {
    userId: string;
    planCode?: string;
    durationDays?: number;
    source: "trial" | "purchase" | "invite_reward" | "admin_grant";
    note?: string;
    createdBy?: string | null;
  }): Promise<UserSubscriptionEntity> {
    let durationDays = payload.durationDays;
    let planCode = payload.planCode;
    let amountCents = 0;

    if (planCode) {
      const plan = await this.planRepo.findOne({ where: { code: planCode } });
      if (!plan) throw new NotFoundException("套餐不存在。");
      if (durationDays === undefined) durationDays = plan.durationDays;
      if (payload.source === "purchase") {
        amountCents = plan.priceCents;
      }
    }
    if (!planCode && payload.source === "invite_reward") {
      planCode = "invite_reward";
    }
    if (!planCode && payload.source === "admin_grant") {
      planCode = "admin_grant";
    }
    if (!durationDays || durationDays <= 0) {
      throw new BadRequestException("durationDays 必须为正数。");
    }
    if (!planCode) {
      throw new BadRequestException("缺少 planCode。");
    }

    const now = new Date();
    const active = await this.findActiveSubscription(payload.userId);
    let startsAt = now;
    let expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    if (active) {
      // 累加到现有有效订阅之后
      startsAt = active.expiresAt;
      expiresAt = new Date(active.expiresAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    return this.subscriptionRepo.save(
      this.subscriptionRepo.create({
        userId: payload.userId,
        planCode,
        source: payload.source,
        status: "active",
        startsAt,
        expiresAt,
        amountCents,
        externalOrderId: null,
        note: payload.note ?? null,
        createdBy: payload.createdBy ?? null,
      }),
    );
  }

  async revokeSubscription(subscriptionId: string, reason: string) {
    const record = await this.subscriptionRepo.findOne({ where: { id: subscriptionId } });
    if (!record) return null;
    record.status = "cancelled";
    record.note = `${record.note ? record.note + " | " : ""}已撤销：${reason}`;
    return this.subscriptionRepo.save(record);
  }

  async expireDueSubscriptions(now = new Date()) {
    const due = await this.subscriptionRepo.find({
      where: { status: "active" },
    });
    const expired: UserSubscriptionEntity[] = [];
    for (const record of due) {
      if (record.expiresAt.getTime() <= now.getTime()) {
        record.status = "expired";
        expired.push(record);
      }
    }
    if (expired.length > 0) {
      await this.subscriptionRepo.save(expired);
      this.logger.log(`Expired ${expired.length} subscriptions.`);
    }
    return expired.length;
  }

  async loadCopy(): Promise<SubscriptionCopyBundle> {
    const [
      expiredTitle,
      expiredMessage,
      expiredCta,
      expiredHint,
      checkoutManualHint,
      checkoutContactInfo,
      inviteShareTitle,
      inviteShareBody,
      welcomePromoBanner,
    ] = await Promise.all([
      this.cloudConfig.getString("copy.subscriptionExpiredTitle", "会员已到期"),
      this.cloudConfig.getString(
        "copy.subscriptionExpiredMessage",
        "你的隐界会员已到期，AI 能力暂时无法使用。",
      ),
      this.cloudConfig.getString("copy.subscriptionExpiredCta", "立即续费"),
      this.cloudConfig.getString(
        "copy.subscriptionExpiredHint",
        "你仍可查看历史记录，AI 功能恢复需要会员",
      ),
      this.cloudConfig.getString(
        "copy.checkoutManualHint",
        "请联系运营开通会员，开通后将自动到账",
      ),
      this.cloudConfig.getString("copy.checkoutContactInfo", ""),
      this.cloudConfig.getString(
        "copy.inviteShareTitle",
        "快来加入隐界，免费体验 AI 社交世界",
      ),
      this.cloudConfig.getString(
        "copy.inviteShareBody",
        "使用我的邀请码注册，我们都能获得 30 天会员奖励。",
      ),
      this.cloudConfig.getNullableString("copy.welcomePromoBanner", null),
    ]);
    return {
      expiredTitle,
      expiredMessage,
      expiredCta,
      expiredHint,
      checkoutManualHint,
      checkoutContactInfo,
      inviteShareTitle,
      inviteShareBody,
      welcomePromoBanner,
    };
  }

  async resolveStatus(userId: string): Promise<SubscriptionStatus> {
    const active = await this.findActiveSubscription(userId);
    if (active) return "active";
    const latest = await this.findLatestSubscription(userId);
    return latest ? "expired" : "none";
  }

  async buildClientState(user: CloudUserEntity): Promise<SubscriptionStateResponse> {
    const [active, plans, copy] = await Promise.all([
      this.findActiveSubscription(user.id),
      this.listActivePlans(),
      this.loadCopy(),
    ]);

    let inviteCodeValue: string | null = null;
    if (user.inviteCodeId) {
      const inviteCode = await this.inviteCodeRepo.findOne({
        where: { id: user.inviteCodeId },
      });
      inviteCodeValue = inviteCode?.code ?? null;
    }
    if (!inviteCodeValue) {
      const inviteCode = await this.inviteCodeRepo.findOne({
        where: { ownerUserId: user.id },
      });
      inviteCodeValue = inviteCode?.code ?? null;
    }

    const planMap = new Map(plans.map((plan) => [plan.code, plan]));
    const status: SubscriptionStatus = active
      ? "active"
      : (await this.findLatestSubscription(user.id))
        ? "expired"
        : "none";

    const publicAppBaseUrl = await this.cloudConfig.getString("app.publicBaseUrl", "");

    return {
      status,
      expiresAt: active?.expiresAt.toISOString() ?? null,
      currentPlanCode: active?.planCode ?? null,
      currentPlanName: active ? (planMap.get(active.planCode)?.name ?? active.planCode) : null,
      isTrial: active?.source === "trial",
      source: (active?.source as SubscriptionStateResponse["source"]) ?? null,
      plans,
      copy,
      inviteCode: inviteCodeValue,
      publicAppBaseUrl,
    };
  }

  async buildLookupResponse(phone: string): Promise<SubscriptionLookupResponse> {
    const [user, copy, plans, hardBlock] = await Promise.all([
      this.userRepo.findOne({ where: { phone } }),
      this.loadCopy(),
      this.listActivePlans(),
      this.cloudConfig.getBoolean("feature.aiHardBlock", true),
    ]);
    if (!user) {
      return {
        status: "none",
        expiresAt: null,
        planCode: null,
        isTrial: false,
        hardBlockEnabled: hardBlock,
        copy,
        plans,
      };
    }
    const active = await this.findActiveSubscription(user.id);
    if (active) {
      return {
        status: "active",
        expiresAt: active.expiresAt.toISOString(),
        planCode: active.planCode,
        isTrial: active.source === "trial",
        hardBlockEnabled: hardBlock,
        copy,
        plans,
      };
    }
    const latest = await this.findLatestSubscription(user.id);
    return {
      status: latest ? "expired" : "none",
      expiresAt: latest?.expiresAt.toISOString() ?? null,
      planCode: latest?.planCode ?? null,
      isTrial: latest?.source === "trial",
      hardBlockEnabled: hardBlock,
      copy,
      plans,
    };
  }

  serializePlan(plan: SubscriptionPlanEntity): SubscriptionPlanSummary {
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      durationDays: plan.durationDays,
      priceCents: plan.priceCents,
      currency: plan.currency,
      isActive: !!plan.isActive,
      isTrial: !!plan.isTrial,
      isPubliclyPurchasable: !!plan.isPubliclyPurchasable,
      sortOrder: plan.sortOrder,
      description: plan.description,
    };
  }

  serializeRecord(
    record: UserSubscriptionEntity,
    planName?: string,
  ): SubscriptionRecordSummary {
    return {
      id: record.id,
      planCode: record.planCode,
      planName: planName ?? record.planCode,
      source: record.source as SubscriptionRecordSummary["source"],
      status: record.status as SubscriptionRecordSummary["status"],
      startsAt: record.startsAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      amountCents: record.amountCents,
      note: record.note,
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
