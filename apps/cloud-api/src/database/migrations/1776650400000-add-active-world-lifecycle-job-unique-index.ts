import type { MigrationInterface, QueryRunner } from "typeorm";

const ACTIVE_WORLD_LIFECYCLE_JOB_UNIQUE_INDEX =
  "IDX_world_lifecycle_jobs_active_world";

export class AddActiveWorldLifecycleJobUniqueIndex1776650400000
  implements MigrationInterface
{
  name = "AddActiveWorldLifecycleJobUniqueIndex1776650400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "world_lifecycle_jobs"
       WHERE "id" IN (
         SELECT "id"
         FROM (
           SELECT
             "id",
             ROW_NUMBER() OVER (
               PARTITION BY "worldId"
               ORDER BY
                 CASE WHEN "status" = 'running' THEN 0 ELSE 1 END,
                 COALESCE("leaseExpiresAt", datetime('1970-01-01')) DESC,
                 CASE
                   WHEN "jobType" = 'resume' THEN 0
                   WHEN "jobType" = 'provision' THEN 1
                   WHEN "jobType" = 'suspend' THEN 2
                   ELSE 3
                 END ASC,
                 "createdAt" DESC,
                 "id" DESC
             ) AS "rowNumber"
           FROM "world_lifecycle_jobs"
           WHERE "status" IN ('pending', 'running')
             AND "jobType" IN ('provision', 'resume', 'suspend')
         ) "rankedJobs"
         WHERE "rowNumber" > 1
       )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${ACTIVE_WORLD_LIFECYCLE_JOB_UNIQUE_INDEX}" ON "world_lifecycle_jobs" ("worldId") WHERE "status" IN ('pending', 'running') AND "jobType" IN ('provision', 'resume', 'suspend')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${ACTIVE_WORLD_LIFECYCLE_JOB_UNIQUE_INDEX}"`,
    );
  }
}
