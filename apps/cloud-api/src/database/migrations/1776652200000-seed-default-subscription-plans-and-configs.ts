import { randomUUID } from "node:crypto";
import type { MigrationInterface, QueryRunner } from "typeorm";

type PlanSeed = {
  code: string;
  name: string;
  durationDays: number;
  priceCents: number;
  isTrial: boolean;
  isPubliclyPurchasable: boolean;
  sortOrder: number;
  description: string;
};

const PLAN_SEEDS: PlanSeed[] = [
  {
    code: "trial",
    name: "新用户试用",
    durationDays: 7,
    priceCents: 0,
    isTrial: true,
    isPubliclyPurchasable: false,
    sortOrder: 0,
    description: "新用户首次登录自动获得，7 天免费试用全部 AI 能力",
  },
  {
    code: "monthly",
    name: "月度会员",
    durationDays: 30,
    priceCents: 4990,
    isTrial: false,
    isPubliclyPurchasable: true,
    sortOrder: 10,
    description: "月度订阅，解锁全部 AI 能力",
  },
  {
    code: "quarterly",
    name: "季度会员",
    durationDays: 90,
    priceCents: 13990,
    isTrial: false,
    isPubliclyPurchasable: true,
    sortOrder: 20,
    description: "季度订阅，享受更优价格",
  },
  {
    code: "yearly",
    name: "年度会员",
    durationDays: 365,
    priceCents: 49900,
    isTrial: false,
    isPubliclyPurchasable: true,
    sortOrder: 30,
    description: "年度订阅，超值长期方案",
  },
  {
    code: "invite_reward",
    name: "邀请奖励",
    durationDays: 30,
    priceCents: 0,
    isTrial: false,
    isPubliclyPurchasable: false,
    sortOrder: 40,
    description: "成功邀请新用户的奖励，自动累加 30 天会员",
  },
];

type ConfigSeed = {
  key: string;
  value: string;
  description: string;
};

const CONFIG_SEEDS: ConfigSeed[] = [
  { key: "trial.enabled", value: "true", description: "是否启用新用户 7 天试用" },
  { key: "trial.days", value: "7", description: "新用户试用天数" },
  { key: "invite.enabled", value: "true", description: "是否启用邀请机制" },
  { key: "invite.rewardDays", value: "30", description: "邀请成功的奖励天数（发给邀请人）" },
  { key: "invite.maxRedeemPerCode", value: "50", description: "单个邀请码累计最大兑换次数" },
  { key: "invite.maxRedeemPerIpPerDay", value: "3", description: "同一 IP 每 24 小时最多兑换次数" },
  { key: "invite.maxRedeemPerDevicePerDay", value: "2", description: "同一设备指纹每 24 小时最多兑换次数" },
  { key: "feature.aiHardBlock", value: "true", description: "AI 拦截总开关，false 时允许全员使用 AI（兜底）" },
  { key: "app.publicBaseUrl", value: '"https://app.example.com"', description: "主 App 公网访问地址（用于邀请链接）" },
  { key: "copy.subscriptionExpiredTitle", value: '"会员已到期"', description: "AI 到期弹窗标题" },
  { key: "copy.subscriptionExpiredMessage", value: '"你的隐界会员已到期，AI 能力暂时无法使用。"', description: "AI 到期弹窗正文" },
  { key: "copy.subscriptionExpiredCta", value: '"立即续费"', description: "AI 到期弹窗主按钮文案" },
  { key: "copy.subscriptionExpiredHint", value: '"你仍可查看历史记录，AI 功能恢复需要会员"', description: "AI 到期弹窗提示文案" },
  { key: "copy.checkoutManualHint", value: '"请联系运营开通会员，开通后将自动到账"', description: "续费占位提示" },
  { key: "copy.checkoutContactInfo", value: '""', description: "续费占位联系方式（运营 wechat / 微信号 / 邮箱等）" },
  { key: "copy.inviteShareTitle", value: '"快来加入隐界，免费体验 AI 社交世界"', description: "邀请分享标题" },
  { key: "copy.inviteShareBody", value: '"使用我的邀请码注册，我们都能获得 30 天会员奖励。"', description: "邀请分享正文" },
  { key: "copy.welcomePromoBanner", value: "null", description: "欢迎页运营 banner 文案，null 时不展示" },
];

export class SeedDefaultSubscriptionPlansAndConfigs1776652200000
  implements MigrationInterface
{
  name = "SeedDefaultSubscriptionPlansAndConfigs1776652200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const seed of PLAN_SEEDS) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "subscription_plans" (
          "id", "code", "name", "durationDays", "priceCents", "currency",
          "isActive", "isTrial", "isPubliclyPurchasable", "sortOrder", "description",
          "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, 'CNY', 1, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          randomUUID(),
          seed.code,
          seed.name,
          seed.durationDays,
          seed.priceCents,
          seed.isTrial ? 1 : 0,
          seed.isPubliclyPurchasable ? 1 : 0,
          seed.sortOrder,
          seed.description,
        ],
      );
    }

    for (const seed of CONFIG_SEEDS) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "cloud_configs" ("key", "value", "description", "updatedBy", "updatedAt")
         VALUES (?, ?, ?, NULL, datetime('now'))`,
        [seed.key, seed.value, seed.description],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const seed of CONFIG_SEEDS) {
      await queryRunner.query(`DELETE FROM "cloud_configs" WHERE "key" = ?`, [seed.key]);
    }
    for (const seed of PLAN_SEEDS) {
      await queryRunner.query(`DELETE FROM "subscription_plans" WHERE "code" = ?`, [seed.code]);
    }
  }
}
