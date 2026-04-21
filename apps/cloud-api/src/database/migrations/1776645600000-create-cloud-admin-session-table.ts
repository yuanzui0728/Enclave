import type { MigrationInterface, QueryRunner } from "typeorm";

const UP_QUERIES = [
  `CREATE TABLE IF NOT EXISTS "cloud_admin_sessions" (
    "id" varchar PRIMARY KEY NOT NULL,
    "currentRefreshTokenId" varchar NOT NULL,
    "expiresAt" datetime NOT NULL,
    "lastUsedAt" datetime,
    "lastRefreshedAt" datetime,
    "revokedAt" datetime,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cloud_admin_sessions_currentRefreshTokenId" ON "cloud_admin_sessions" ("currentRefreshTokenId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_cloud_admin_sessions_revokedAt" ON "cloud_admin_sessions" ("revokedAt")`,
];

const DOWN_QUERIES = [
  `DROP INDEX IF EXISTS "IDX_cloud_admin_sessions_revokedAt"`,
  `DROP INDEX IF EXISTS "IDX_cloud_admin_sessions_currentRefreshTokenId"`,
  `DROP TABLE IF EXISTS "cloud_admin_sessions"`,
];

export class CreateCloudAdminSessionTable1776645600000 implements MigrationInterface {
  name = "CreateCloudAdminSessionTable1776645600000";

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
