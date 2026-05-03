import type { MigrationInterface, QueryRunner } from "typeorm";

const UP_QUERIES = [
  `CREATE TABLE IF NOT EXISTS "cloud_users" (
    "id" varchar PRIMARY KEY NOT NULL,
    "phone" varchar NOT NULL,
    "displayName" text,
    "status" varchar NOT NULL DEFAULT ('active'),
    "firstLoginAt" datetime,
    "lastLoginAt" datetime,
    "inviteCodeId" text,
    "invitedByCodeId" text,
    "invitedRewardGranted" boolean NOT NULL DEFAULT (0),
    "registrationIp" text,
    "registrationDeviceFingerprint" text,
    "bannedReason" text,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cloud_users_phone" ON "cloud_users" ("phone")`,
  `CREATE INDEX IF NOT EXISTS "IDX_cloud_users_status" ON "cloud_users" ("status")`,
  `CREATE INDEX IF NOT EXISTS "IDX_cloud_users_invitedByCodeId" ON "cloud_users" ("invitedByCodeId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_cloud_users_registrationDeviceFingerprint" ON "cloud_users" ("registrationDeviceFingerprint")`,

  `CREATE TABLE IF NOT EXISTS "subscription_plans" (
    "id" varchar PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "name" varchar NOT NULL,
    "durationDays" integer NOT NULL,
    "priceCents" integer NOT NULL DEFAULT (0),
    "currency" varchar NOT NULL DEFAULT ('CNY'),
    "isActive" boolean NOT NULL DEFAULT (1),
    "isTrial" boolean NOT NULL DEFAULT (0),
    "isPubliclyPurchasable" boolean NOT NULL DEFAULT (1),
    "sortOrder" integer NOT NULL DEFAULT (0),
    "description" text,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_subscription_plans_code" ON "subscription_plans" ("code")`,

  `CREATE TABLE IF NOT EXISTS "user_subscriptions" (
    "id" varchar PRIMARY KEY NOT NULL,
    "userId" varchar NOT NULL,
    "planCode" varchar NOT NULL,
    "source" varchar NOT NULL,
    "status" varchar NOT NULL,
    "startsAt" datetime NOT NULL,
    "expiresAt" datetime NOT NULL,
    "amountCents" integer NOT NULL DEFAULT (0),
    "externalOrderId" text,
    "note" text,
    "createdBy" text,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_userId" ON "user_subscriptions" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_status" ON "user_subscriptions" ("status")`,
  `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_expiresAt" ON "user_subscriptions" ("expiresAt")`,
  `CREATE INDEX IF NOT EXISTS "IDX_user_subscriptions_user_status_expires" ON "user_subscriptions" ("userId", "status", "expiresAt")`,
];

const DOWN_QUERIES = [
  `DROP INDEX IF EXISTS "IDX_user_subscriptions_user_status_expires"`,
  `DROP INDEX IF EXISTS "IDX_user_subscriptions_expiresAt"`,
  `DROP INDEX IF EXISTS "IDX_user_subscriptions_status"`,
  `DROP INDEX IF EXISTS "IDX_user_subscriptions_userId"`,
  `DROP TABLE IF EXISTS "user_subscriptions"`,
  `DROP INDEX IF EXISTS "IDX_subscription_plans_code"`,
  `DROP TABLE IF EXISTS "subscription_plans"`,
  `DROP INDEX IF EXISTS "IDX_cloud_users_registrationDeviceFingerprint"`,
  `DROP INDEX IF EXISTS "IDX_cloud_users_invitedByCodeId"`,
  `DROP INDEX IF EXISTS "IDX_cloud_users_status"`,
  `DROP INDEX IF EXISTS "IDX_cloud_users_phone"`,
  `DROP TABLE IF EXISTS "cloud_users"`,
];

export class CreateCloudUserAndSubscriptionTables1776651000000
  implements MigrationInterface
{
  name = "CreateCloudUserAndSubscriptionTables1776651000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const query of UP_QUERIES) {
      await queryRunner.query(query);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const query of DOWN_QUERIES) {
      await queryRunner.query(query);
    }
  }
}
