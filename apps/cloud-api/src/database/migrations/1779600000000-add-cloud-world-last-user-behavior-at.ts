import type { MigrationInterface, QueryRunner } from "typeorm";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
// cloud_worlds 加 lastUserBehaviorAt 列：world runtime 上报的"上次真人行为"时间
// （朋友圈/广场/视频号 评论·点赞·分享·收藏·浏览·关注，authorType='user' / ownerId
// 最新 createdAt），与「用户行为」后台页同源。供 cloud-console 世界列表展示 + 排序。
//
// 区别于既有两列：lastUserMessageAt（纯聊天，senderType='user'）、lastInteractiveAt
// （会话/群 lastActivityAt，含 AI 回复触发的更新）。老行 = NULL，等各 world child
// 升级到带上报逻辑的新代码并重启后，下一次心跳即回填。
const UP_QUERIES = [
  `ALTER TABLE "cloud_worlds" ADD COLUMN "lastUserBehaviorAt" datetime`,
];

const DOWN_QUERIES = [
  `ALTER TABLE "cloud_worlds" DROP COLUMN "lastUserBehaviorAt"`,
];

export class AddCloudWorldLastUserBehaviorAt1779600000000
  implements MigrationInterface
{
  name = "AddCloudWorldLastUserBehaviorAt1779600000000";

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
