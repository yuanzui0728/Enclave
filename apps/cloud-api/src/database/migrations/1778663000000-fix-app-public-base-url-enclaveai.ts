import type { MigrationInterface, QueryRunner } from "typeorm";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
const STALE = '"https://enclaveai.top"';
const REAL = '"https://1gw06751dd053.vicp.fun"';

// enclaveai.top 还没上线，存量库里 app.publicBaseUrl 被设过去会让所有邀请链接
// 落到 404。把这个具体值替换成已经 nginx 反代上线的 vicp.fun host；只在等值
// 时改写，运营手工配的其他域名一律保留。
export class FixAppPublicBaseUrlEnclaveai1778663000000
  implements MigrationInterface
{
  name = "FixAppPublicBaseUrlEnclaveai1778663000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "cloud_configs" SET "value" = ? WHERE "key" = 'app.publicBaseUrl' AND "value" = ?`,
      [REAL, STALE],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "cloud_configs" SET "value" = ? WHERE "key" = 'app.publicBaseUrl' AND "value" = ?`,
      [STALE, REAL],
    );
  }
}
// i18n-ignore-end
