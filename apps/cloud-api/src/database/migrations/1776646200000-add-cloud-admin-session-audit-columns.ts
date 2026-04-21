import type { MigrationInterface, QueryRunner } from "typeorm";

const UP_QUERIES = [
  `ALTER TABLE "cloud_admin_sessions" ADD COLUMN "issuedFromIp" varchar`,
  `ALTER TABLE "cloud_admin_sessions" ADD COLUMN "issuedUserAgent" varchar`,
  `ALTER TABLE "cloud_admin_sessions" ADD COLUMN "lastUsedIp" varchar`,
  `ALTER TABLE "cloud_admin_sessions" ADD COLUMN "lastUsedUserAgent" varchar`,
];

const DOWN_QUERIES = [
  `ALTER TABLE "cloud_admin_sessions" DROP COLUMN "lastUsedUserAgent"`,
  `ALTER TABLE "cloud_admin_sessions" DROP COLUMN "lastUsedIp"`,
  `ALTER TABLE "cloud_admin_sessions" DROP COLUMN "issuedUserAgent"`,
  `ALTER TABLE "cloud_admin_sessions" DROP COLUMN "issuedFromIp"`,
];

export class AddCloudAdminSessionAuditColumns1776646200000
  implements MigrationInterface
{
  name = "AddCloudAdminSessionAuditColumns1776646200000";

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
