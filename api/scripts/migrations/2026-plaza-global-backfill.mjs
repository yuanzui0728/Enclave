#!/usr/bin/env node
// 广场动态「全员共享池」历史回填：把某个源 owner（默认 yuanzui，phone 91173587559732）名下
// 的「角色公开广场帖 + 角色间 AI 互动（评论/点赞）」改归属（re-stamp ownerId）到全局哨兵
// owner（GLOBAL_WORLD_OWNER_ID），让所有用户（含新用户）经广场读 union 立刻看到这份历史。
//
// 为什么 move（re-stamp）而不是 copy：
//   - 保留同 post id → feed_comments.postId / feed_post_likes.postId 引用零改写
//   - 广场读路径是 (全局池 ∪ 本人帖) union，源 owner 仍能看到自己的帖（改从全局分支来），不丢内容
//   - authorId = 稳定 preset 角色 id，保持不动 → 点进去仍落各用户自己的角色副本
//
// 只搬「角色」内容：
//   - posts:   surface='feed' AND authorType='character' AND publishStatus='published'
//   - comments: 上述 post 的 authorType='character'（AI 角色评论）AND status='published'
//   - likes:    上述 post 的 authorType='character'（AI 角色点赞）
//   用户自己（authorType='user' / type='like' 的 user_feed_interactions）的赞评**保持原 owner 不动**
//   → move 后正好成为该用户对全局帖的「本人增量」（服务端读时合并），符合隐私模型。
//   不搬 moment_posts（朋友圈是私有 per-owner 面；历史角色广场若来自 moment→feed sync 已在 feed_posts 里）。
//
// 幂等：ledger 表记已搬 postId；已是全局 ownerId 的跳过；comments/likes 只搬 ownerId 仍=源 的行。
// 安全：默认 dry-run（只统计 + 采样，不写）；--commit 才落库。务必先对 /tmp 克隆跑过 + verify 再上 live。
//
// 用法:
//   node 2026-plaza-global-backfill.mjs <shared.sqlite> [--source-phone=91173587559732]
//        [--source-owner=<ownerId>] [--global-owner=global-world-owner] [--commit]

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const dbPath = args.find((a) => !a.startsWith('--'));
const getOpt = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const COMMIT = args.includes('--commit');
const SOURCE_PHONE = getOpt('source-phone', '91173587559732');
const SOURCE_OWNER_OVERRIDE = getOpt('source-owner', null);
const GLOBAL_OWNER = getOpt('global-owner', 'global-world-owner');

if (!dbPath || !existsSync(dbPath)) {
  console.error(
    '用法: node 2026-plaza-global-backfill.mjs <shared.sqlite> [--source-phone=..] [--source-owner=..] [--global-owner=global-world-owner] [--commit]',
  );
  process.exit(1);
}

const db = new BetterSqlite3(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// ── 解析源 owner ────────────────────────────────────────────────────
let sourceOwner = SOURCE_OWNER_OVERRIDE;
if (!sourceOwner) {
  const row = db
    .prepare(
      `SELECT id FROM users WHERE userType='world_owner' AND cloudPhone = ?`,
    )
    .get(SOURCE_PHONE);
  if (!row) {
    console.error(
      `找不到源 owner：userType='world_owner' AND cloudPhone='${SOURCE_PHONE}'。用 --source-owner=<id> 显式指定。`,
    );
    process.exit(1);
  }
  sourceOwner = row.id;
}
if (sourceOwner === GLOBAL_OWNER) {
  console.error('源 owner 不能等于全局哨兵 owner。');
  process.exit(1);
}

// 校验全局 owner 行已存在（应由 GlobalWorldSeedService 在 world 启动时建好）。
const globalRow = db.prepare(`SELECT id FROM users WHERE id = ?`).get(GLOBAL_OWNER);
if (!globalRow) {
  console.error(
    `全局哨兵 owner 行不存在（id='${GLOBAL_OWNER}'）。请先启动 shared-world（GlobalWorldSeedService 会建它）或确认 --global-owner 取值。`,
  );
  process.exit(1);
}

console.log(
  `[plaza-backfill] db=${dbPath} source=${sourceOwner} global=${GLOBAL_OWNER} mode=${COMMIT ? 'COMMIT' : 'DRY-RUN'}`,
);

// ── ledger（幂等）────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS plaza_global_backfill_ledger (
    postId TEXT PRIMARY KEY,
    sourceOwner TEXT,
    migratedAt TEXT
  )
`);

// ── 候选 posts ───────────────────────────────────────────────────────
const candidatePosts = db
  .prepare(
    `SELECT id FROM feed_posts
     WHERE ownerId = ?
       AND surface = 'feed'
       AND authorType = 'character'
       AND publishStatus = 'published'
       AND id NOT IN (SELECT postId FROM plaza_global_backfill_ledger)`,
  )
  .all(sourceOwner)
  .map((r) => r.id);

if (!candidatePosts.length) {
  console.log('[plaza-backfill] 没有可搬的角色广场帖（可能已全部回填）。退出。');
  process.exit(0);
}

// 统计 comments / likes 规模（仅角色内容，且 ownerId 仍=源）
const placeholders = candidatePosts.map(() => '?').join(',');
const countOf = (sql) => db.prepare(sql).get(sourceOwner, ...candidatePosts).c;
const commentCount = countOf(
  `SELECT COUNT(*) c FROM feed_comments
   WHERE ownerId = ? AND authorType='character' AND status='published'
     AND postId IN (${placeholders})`,
);
const likeCount = countOf(
  `SELECT COUNT(*) c FROM feed_post_likes
   WHERE ownerId = ? AND authorType='character'
     AND postId IN (${placeholders})`,
);

console.log(
  `[plaza-backfill] 待搬: posts=${candidatePosts.length} comments(角色)=${commentCount} likes(角色)=${likeCount}`,
);

// 采样打印前 5 条 post 文本
const sample = db
  .prepare(
    `SELECT id, authorName, substr(text,1,40) AS t FROM feed_posts WHERE id IN (${candidatePosts.slice(0, 5).map(() => '?').join(',')})`,
  )
  .all(...candidatePosts.slice(0, 5));
for (const s of sample) {
  console.log(`   · ${s.id} [${s.authorName}] ${s.t}`);
}

if (!COMMIT) {
  console.log('[plaza-backfill] DRY-RUN 结束，未写库。加 --commit 落库。');
  process.exit(0);
}

// ── COMMIT：单事务搬迁 + 重算基数 ────────────────────────────────────
const now = new Date().toISOString();
const txn = db.transaction(() => {
  const movePost = db.prepare(
    `UPDATE feed_posts SET ownerId = ? WHERE id = ? AND ownerId = ?`,
  );
  const recordLedger = db.prepare(
    `INSERT OR IGNORE INTO plaza_global_backfill_ledger (postId, sourceOwner, migratedAt) VALUES (?,?,?)`,
  );
  // 角色评论 / 点赞改归属（仅 ownerId 仍=源 的行；点赞用 OR IGNORE 防撞全局唯一索引）
  const moveComments = db.prepare(
    `UPDATE feed_comments SET ownerId = ?
     WHERE postId = ? AND ownerId = ? AND authorType='character' AND status='published'`,
  );
  const moveLikes = db.prepare(
    `UPDATE OR IGNORE feed_post_likes SET ownerId = ?
     WHERE postId = ? AND ownerId = ? AND authorType='character'`,
  );
  // OR IGNORE 撞唯一索引留下的源残行清掉，避免脏数据
  const cleanupLeftoverLikes = db.prepare(
    `DELETE FROM feed_post_likes
     WHERE postId = ? AND ownerId = ? AND authorType='character'`,
  );
  // 重算全局基数：likeCount/commentCount 只数全局子行（与服务端 ensureFeedUniqueIndexes
  // 的 shared 关联一致），用户的赞/评保持在源 owner 名下 → 作为本人增量读时合并。
  const recountLike = db.prepare(
    `UPDATE feed_posts SET likeCount = COALESCE(
       (SELECT COUNT(*) FROM feed_post_likes WHERE postId = ? AND ownerId = ?), 0)
     WHERE id = ?`,
  );
  const recountComment = db.prepare(
    `UPDATE feed_posts SET commentCount = COALESCE(
       (SELECT COUNT(*) FROM feed_comments WHERE postId = ? AND ownerId = ? AND status='published'), 0)
     WHERE id = ?`,
  );

  let moved = 0;
  for (const postId of candidatePosts) {
    const res = movePost.run(GLOBAL_OWNER, postId, sourceOwner);
    if (res.changes === 0) continue; // 已被并发搬走 / 不再匹配
    recordLedger.run(postId, sourceOwner, now);
    moveComments.run(GLOBAL_OWNER, postId, sourceOwner);
    moveLikes.run(GLOBAL_OWNER, postId, sourceOwner);
    cleanupLeftoverLikes.run(postId, sourceOwner);
    recountLike.run(postId, GLOBAL_OWNER, postId);
    recountComment.run(postId, GLOBAL_OWNER, postId);
    moved += 1;
  }
  return moved;
});

const moved = txn();
db.pragma('wal_checkpoint(TRUNCATE)');
console.log(`[plaza-backfill] 完成：搬迁 ${moved} 条角色广场帖到全局池（含其角色评论/点赞 + 基数重算）。`);

// 落地校验
const globalNow = db
  .prepare(
    `SELECT COUNT(*) c FROM feed_posts WHERE ownerId = ? AND surface='feed' AND authorType='character' AND publishStatus='published'`,
  )
  .get(GLOBAL_OWNER).c;
console.log(`[plaza-backfill] 全局池现有角色广场帖: ${globalNow}`);
db.close();
