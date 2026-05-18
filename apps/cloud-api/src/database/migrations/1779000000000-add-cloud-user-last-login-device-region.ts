import type { MigrationInterface, QueryRunner } from "typeorm";

// i18n-ignore-start: data / seed / migration — not user-facing UI.
const UP_QUERIES = [
  `ALTER TABLE "cloud_users" ADD COLUMN "lastLoginDeviceType" text`,
  `ALTER TABLE "cloud_users" ADD COLUMN "lastLoginRegion" text`,
  `ALTER TABLE "cloud_users" ADD COLUMN "lastLoginCountryCode" text`,
];

const DOWN_QUERIES = [
  `ALTER TABLE "cloud_users" DROP COLUMN "lastLoginCountryCode"`,
  `ALTER TABLE "cloud_users" DROP COLUMN "lastLoginRegion"`,
  `ALTER TABLE "cloud_users" DROP COLUMN "lastLoginDeviceType"`,
];

export class AddCloudUserLastLoginDeviceRegion1779000000000
  implements MigrationInterface
{
  name = "AddCloudUserLastLoginDeviceRegion1779000000000";

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
