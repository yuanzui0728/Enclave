import type { MigrationInterface, QueryRunner } from "typeorm";

const UP_QUERIES = [
  `ALTER TABLE "cloud_admin_sessions" ADD COLUMN "revokedBySessionId" varchar`,
  `ALTER TABLE "cloud_admin_sessions" ADD COLUMN "revocationReason" varchar`,
];

const DOWN_QUERIES = [
  `ALTER TABLE "cloud_admin_sessions" DROP COLUMN "revocationReason"`,
  `ALTER TABLE "cloud_admin_sessions" DROP COLUMN "revokedBySessionId"`,
];

export class AddCloudAdminSessionRevocationMetadata1776647400000
  implements MigrationInterface
{
  name = "AddCloudAdminSessionRevocationMetadata1776647400000";

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
