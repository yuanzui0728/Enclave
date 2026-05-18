import type { MigrationInterface, QueryRunner } from "typeorm";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
// 双边奖励落地后，admin 拒兑只能 revoke inviter 的那张订阅——被邀请人那张
// 没人引用、回不掉。这条列把"受邀人那份 invite_reward 订阅"挂回 redemption
// 行，rejectRedemption 一次干净两边。
export class AddInviteeRewardSubscriptionId1778664000000
  implements MigrationInterface
{
  name = "AddInviteeRewardSubscriptionId1778664000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invite_redemptions" ADD COLUMN "inviteeRewardSubscriptionId" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite 不支持 DROP COLUMN（旧版本），生产用 better-sqlite3 ≥ 3.35 可以直接 drop。
    await queryRunner.query(
      `ALTER TABLE "invite_redemptions" DROP COLUMN "inviteeRewardSubscriptionId"`,
    );
  }
}
// i18n-ignore-end
