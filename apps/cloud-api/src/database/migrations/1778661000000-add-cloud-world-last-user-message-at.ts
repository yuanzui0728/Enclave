import type { MigrationInterface, QueryRunner } from "typeorm";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
const UP_QUERIES = [
  `ALTER TABLE "cloud_worlds" ADD COLUMN "lastUserMessageAt" datetime`,
];

const DOWN_QUERIES = [
  `ALTER TABLE "cloud_worlds" DROP COLUMN "lastUserMessageAt"`,
];

export class AddCloudWorldLastUserMessageAt1778661000000 implements MigrationInterface {
  name = "AddCloudWorldLastUserMessageAt1778661000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const query of UP_QUERIES) {
      await queryRunner.query(query);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const query of DOWN_QUERIES) {
      await queryRunner.query(query);
    }
  }
}
// i18n-ignore-end
