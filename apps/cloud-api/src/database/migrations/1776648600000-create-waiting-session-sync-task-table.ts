import type { MigrationInterface, QueryRunner } from "typeorm";

const UP_QUERIES = [
  `CREATE TABLE IF NOT EXISTS "waiting_session_sync_tasks" (
    "id" varchar PRIMARY KEY NOT NULL,
    "taskKey" varchar NOT NULL,
    "taskType" varchar NOT NULL,
    "targetValue" text NOT NULL,
    "context" text NOT NULL,
    "attempt" integer NOT NULL DEFAULT (1),
    "maxAttempts" integer NOT NULL DEFAULT (3),
    "availableAt" datetime NOT NULL,
    "leaseOwner" text,
    "leaseExpiresAt" datetime,
    "lastError" text,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_waiting_session_sync_tasks_taskKey" ON "waiting_session_sync_tasks" ("taskKey")`,
  `CREATE INDEX IF NOT EXISTS "IDX_waiting_session_sync_tasks_availableAt" ON "waiting_session_sync_tasks" ("availableAt")`,
];

const DOWN_QUERIES = [
  `DROP INDEX IF EXISTS "IDX_waiting_session_sync_tasks_availableAt"`,
  `DROP INDEX IF EXISTS "IDX_waiting_session_sync_tasks_taskKey"`,
  `DROP TABLE IF EXISTS "waiting_session_sync_tasks"`,
];

export class CreateWaitingSessionSyncTaskTable1776648600000
  implements MigrationInterface
{
  name = "CreateWaitingSessionSyncTaskTable1776648600000";

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
