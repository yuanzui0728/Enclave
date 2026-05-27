#!/usr/bin/env node
// 视频号「全局共享社交场」迁移：把存量 per-owner 自动生成的预设角色视频号帖（authorType=
// 'character'）连同其子行（评论 / 点赞 / 互动）一次性退役，让视频号从「每人一份隔离副本」
// 干净切到「全局共享池」。切换后全局帧的 check_channels_schedule 会重新铺全局池内容。
//
// 保留：
//   - surface='channels' 且 authorType='user' 的帖（用户自己上传）—— 仍是本人私有，不动。
//   - 私有角色「自然语言造视频」扇出副本（statsPayload 含 cloudVideoId）—— 仅导入者可见，不动。
//   - 已经归属全局哨兵 owner（ownerId='global-world-owner'）的帖 —— 已是全局池，不动。
//   - 朋友圈 / 广场（surface!='channels'）—— 完全不动。
//
// 用法：
//   node scripts/migrate-channels-to-global.mjs --db <path>            # dry-run（默认，只报数）
//   node scripts/migrate-channels-to-global.mjs --db <path> --apply    # 真删（事务包裹）
//
// ⚠️ 生产库（data/shared-world/database.sqlite）属 live :4100，跑前必须：先停机或快照备份、
//    经用户显式授权；务必先在 /tmp 库副本 dry-run + --apply 演练确认计数无误。

import { createRequire } from 'node:module';
// better-sqlite3 装在 api 包下（pnpm 不 hoist 到仓库根）；从 ../api 锚定解析。
const require = createRequire(new URL('../api/package.json', import.meta.url));
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const dbPath = (() => {
  const i = args.indexOf('--db');
  return i >= 0 ? args[i + 1] : null;
})();
const apply = args.includes('--apply');

if (!dbPath) {
  console.error('用法: node scripts/migrate-channels-to-global.mjs --db <path> [--apply]');
  process.exit(1);
}

const db = new Database(dbPath);

const GLOBAL = 'global-world-owner';

// 目标：per-owner（非全局）的 character-authored 视频号帖。排除私有角色扇出副本（保留）。
const WHERE_TARGET = `
  surface = 'channels'
  AND ownerId IS NOT 'global-world-owner'
  AND authorType = 'character'
  AND (statsPayload IS NULL OR statsPayload NOT LIKE '%cloudVideoId%')
`;

const targetCount = db
  .prepare(`SELECT count(*) c FROM feed_posts WHERE ${WHERE_TARGET}`)
  .get().c;
const userKept = db
  .prepare(
    `SELECT count(*) c FROM feed_posts WHERE surface='channels' AND ownerId IS NOT '${GLOBAL}' AND authorType='user'`,
  )
  .get().c;
const fanoutKept = db
  .prepare(
    `SELECT count(*) c FROM feed_posts WHERE surface='channels' AND ownerId IS NOT '${GLOBAL}' AND statsPayload LIKE '%cloudVideoId%'`,
  )
  .get().c;
const globalExisting = db
  .prepare(`SELECT count(*) c FROM feed_posts WHERE surface='channels' AND ownerId='${GLOBAL}'`)
  .get().c;

// 待删子行计数（按 postId 关联）
const idRows = db.prepare(`SELECT id FROM feed_posts WHERE ${WHERE_TARGET}`).all();
const ids = idRows.map((r) => r.id);
const countIn = (table, col) => {
  if (ids.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const ph = chunk.map(() => '?').join(',');
    n += db.prepare(`SELECT count(*) c FROM ${table} WHERE ${col} IN (${ph})`).get(...chunk).c;
  }
  return n;
};
const commentsToDel = countIn('feed_comments', 'postId');
const likesToDel = countIn('feed_post_likes', 'postId');
const interToDel = countIn('user_feed_interactions', 'postId');

console.log(`DB: ${dbPath}`);
console.log('--- 计划 ---');
console.log(`待退役 per-owner 预设角色视频号帖: ${targetCount}`);
console.log(`  连带删 feed_comments: ${commentsToDel}`);
console.log(`  连带删 feed_post_likes: ${likesToDel}`);
console.log(`  连带删 user_feed_interactions: ${interToDel}`);
console.log('--- 保留（不动）---');
console.log(`用户上传的视频号帖 (authorType=user): ${userKept}`);
console.log(`私有角色扇出副本 (statsPayload.cloudVideoId): ${fanoutKept}`);
console.log(`已属全局池的视频号帖 (ownerId=GLOBAL): ${globalExisting}`);

if (!apply) {
  console.log('\n[dry-run] 未改动。加 --apply 执行删除（事务包裹）。');
  db.close();
  process.exit(0);
}

const tx = db.transaction(() => {
  const delIn = (table, col) => {
    let affected = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const ph = chunk.map(() => '?').join(',');
      affected += db.prepare(`DELETE FROM ${table} WHERE ${col} IN (${ph})`).run(...chunk).changes;
    }
    return affected;
  };
  const c = delIn('feed_comments', 'postId');
  const l = delIn('feed_post_likes', 'postId');
  const it = delIn('user_feed_interactions', 'postId');
  const p = db.prepare(`DELETE FROM feed_posts WHERE ${WHERE_TARGET}`).run().changes;
  return { c, l, it, p };
});

const res = tx();
console.log('\n[applied] 已删除:');
console.log(`  feed_posts: ${res.p}`);
console.log(`  feed_comments: ${res.c}`);
console.log(`  feed_post_likes: ${res.l}`);
console.log(`  user_feed_interactions: ${res.it}`);
db.close();
