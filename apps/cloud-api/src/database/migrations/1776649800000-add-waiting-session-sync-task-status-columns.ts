import type { MigrationInterface, QueryRunner } from "typeorm";

const UP_QUERIES = [
  `ALTER TABLE "waiting_session_sync_tasks" ADD COLUMN "status" varchar NOT NULL DEFAULT ('pending')`,
  `ALTER TABLE "waiting_session_sync_tasks" ADD COLUMN "finishedAt" datetime`,
  `CREATE INDEX IF NOT EXISTS "IDX_waiting_session_sync_tasks_status" ON "waiting_session_sync_tasks" ("status")`,
];

const DOWN_QUERIES = [
  `DROP INDEX IF EXISTS "IDX_waiting_session_sync_tasks_status"`,
  `ALTER TABLE "waiting_session_sync_tasks" DROP COLUMN "finishedAt"`,
  `ALTER TABLE "waiting_session_sync_tasks" DROP COLUMN "status"`,
];

export class AddWaitingSessionSyncTaskStatusColumns1776649800000
  implements MigrationInterface
{
  name = "AddWaitingSessionSyncTaskStatusColumns1776649800000";

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
