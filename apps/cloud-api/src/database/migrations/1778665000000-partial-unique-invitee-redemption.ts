import type { MigrationInterface, QueryRunner } from "typeorm";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
// invitee_user_id 的 unique 索引太严：admin 拒兑后 rejected 行还在 → 受邀人再
// 也不能用别的合法 invite 码（hasRedemptionForInvitee 返 true 永久拦死）。
// 改成 partial unique，只对 status='rewarded' 行强制唯一；rejected 行可以共存，
// app 层 hasRedemptionForInvitee 也只看 rewarded。
//
// 注意 SQLite 不支持原地 DROP/ALTER INDEX 然后重建一个 name 相同的索引；
// 这里直接 DROP 旧索引、CREATE 新 partial 索引（不同 name 防 typeorm
// synchronize 路径误判）。
export class PartialUniqueInviteeRedemption1778665000000
  implements MigrationInterface
{
  name = "PartialUniqueInviteeRedemption1778665000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_invite_redemptions_inviteeUserId"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invite_redemptions_inviteeUserId_rewarded"
       ON "invite_redemptions" ("inviteeUserId") WHERE "status" = 'rewarded'`,
    );
    // 给 rejected 行也建一条普通索引，admin 列表 / hasRedemptionForInvitee
    // 这种"任意 status 查一个 invitee"路径还是要走索引。
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invite_redemptions_inviteeUserId_any"
       ON "invite_redemptions" ("inviteeUserId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_invite_redemptions_inviteeUserId_any"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_invite_redemptions_inviteeUserId_rewarded"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invite_redemptions_inviteeUserId"
       ON "invite_redemptions" ("inviteeUserId")`,
    );
  }
}
// i18n-ignore-end
