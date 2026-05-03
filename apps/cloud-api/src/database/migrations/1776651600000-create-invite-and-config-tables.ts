import type { MigrationInterface, QueryRunner } from "typeorm";

const UP_QUERIES = [
  `CREATE TABLE IF NOT EXISTS "invite_codes" (
    "id" varchar PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "ownerUserId" varchar NOT NULL,
    "redeemCount" integer NOT NULL DEFAULT (0),
    "rewardDaysGranted" integer NOT NULL DEFAULT (0),
    "isActive" boolean NOT NULL DEFAULT (1),
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invite_codes_code" ON "invite_codes" ("code")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invite_codes_ownerUserId" ON "invite_codes" ("ownerUserId")`,

  `CREATE TABLE IF NOT EXISTS "invite_redemptions" (
    "id" varchar PRIMARY KEY NOT NULL,
    "codeId" varchar NOT NULL,
    "inviterUserId" varchar NOT NULL,
    "inviteeUserId" varchar NOT NULL,
    "inviteePhone" varchar NOT NULL,
    "inviteeIp" text,
    "inviteeDeviceFingerprint" text,
    "status" varchar NOT NULL DEFAULT ('rewarded'),
    "rejectReason" text,
    "rewardSubscriptionId" text,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS "IDX_invite_redemptions_codeId" ON "invite_redemptions" ("codeId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invite_redemptions_inviteeUserId" ON "invite_redemptions" ("inviteeUserId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_invite_redemptions_inviteePhone" ON "invite_redemptions" ("inviteePhone")`,
  `CREATE INDEX IF NOT EXISTS "IDX_invite_redemptions_inviteeIp" ON "invite_redemptions" ("inviteeIp")`,
  `CREATE INDEX IF NOT EXISTS "IDX_invite_redemptions_inviteeDeviceFingerprint" ON "invite_redemptions" ("inviteeDeviceFingerprint")`,

  `CREATE TABLE IF NOT EXISTS "cloud_configs" (
    "key" varchar PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "description" text,
    "updatedBy" text,
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
];

const DOWN_QUERIES = [
  `DROP TABLE IF EXISTS "cloud_configs"`,
  `DROP INDEX IF EXISTS "IDX_invite_redemptions_inviteeDeviceFingerprint"`,
  `DROP INDEX IF EXISTS "IDX_invite_redemptions_inviteeIp"`,
  `DROP INDEX IF EXISTS "IDX_invite_redemptions_inviteePhone"`,
  `DROP INDEX IF EXISTS "IDX_invite_redemptions_inviteeUserId"`,
  `DROP INDEX IF EXISTS "IDX_invite_redemptions_codeId"`,
  `DROP TABLE IF EXISTS "invite_redemptions"`,
  `DROP INDEX IF EXISTS "IDX_invite_codes_ownerUserId"`,
  `DROP INDEX IF EXISTS "IDX_invite_codes_code"`,
  `DROP TABLE IF EXISTS "invite_codes"`,
];

export class CreateInviteAndConfigTables1776651600000
  implements MigrationInterface
{
  name = "CreateInviteAndConfigTables1776651600000";

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
