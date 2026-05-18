import type { MigrationInterface, QueryRunner } from "typeorm";

// i18n-ignore-start: data / schema migration — internal only.
// 把 cloud_minimax_call_hourly.rateLimitedCount 拆成
// rpmLimitedCount (1002/2003/2062 + HTTP 429) 与 quotaLimitedCount (1042/2056)。
// 历史观测 89% 的 rateLimited 都是 2056 quota，整列搬过去更接近真相。
const UP_QUERIES = [
  `ALTER TABLE "cloud_minimax_call_hourly" ADD COLUMN "rpmLimitedCount" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "cloud_minimax_call_hourly" ADD COLUMN "quotaLimitedCount" integer NOT NULL DEFAULT 0`,
  `UPDATE "cloud_minimax_call_hourly" SET "quotaLimitedCount" = "rateLimitedCount"`,
  `ALTER TABLE "cloud_minimax_call_hourly" DROP COLUMN "rateLimitedCount"`,
];

const DOWN_QUERIES = [
  `ALTER TABLE "cloud_minimax_call_hourly" ADD COLUMN "rateLimitedCount" integer NOT NULL DEFAULT 0`,
  `UPDATE "cloud_minimax_call_hourly" SET "rateLimitedCount" = "rpmLimitedCount" + "quotaLimitedCount"`,
  `ALTER TABLE "cloud_minimax_call_hourly" DROP COLUMN "quotaLimitedCount"`,
  `ALTER TABLE "cloud_minimax_call_hourly" DROP COLUMN "rpmLimitedCount"`,
];

export class SplitMinimaxRateColumns1778660000000
  implements MigrationInterface
{
  name = "SplitMinimaxRateColumns1778660000000";

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
// i18n-ignore-end
