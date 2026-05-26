#!/usr/bin/env node
// 共享 world 多租户迁移 step1：在「每用户独占库」上为新增的 ownerId 列回填归属。
//
// 背景：存量 LPP 每用户库每库只有 1 个 world_owner。本轮给 feed/moments/messages/groups/
// favorites 等表加了 nullable ownerId 列（synchronize 加列后值为 NULL）。step1 把这些
// NULL 回填成该库 world_owner 的 id，让每行自描述归属，为 step2 union 合并进共享库做准备。
//
// 安全性：幂等（只改 ownerId IS NULL 的行），事务包裹，结束 WAL checkpoint。**先对副本跑**：
//   cp data/accounts/<phone>/database.sqlite /tmp/x.sqlite
//   node scripts/migrations/2026-mt-step1-backfill-owner.mjs /tmp/x.sqlite
//
// ⚠️ 不含「确定性 id 实体复合主键重建」(characters/conversations 的 (ownerId,id))——那一步
//   高危、需逐库 schema 读取重建 + shared 库 synchronize:false 协调，单列为 step1b，见文末 TODO。
//   step1（本脚本）只做安全的加列 + 回填，可独立先行。

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: node 2026-mt-step1-backfill-owner.mjs <database.sqlite>');
  process.exit(1);
}

// 本轮新加 ownerId 列的表（与 entity @Column ownerId / scoped-entities.ts 对齐）。
// 已带 ownerId 的存量表（conversations.userId / friendships.userId 等）值已就绪，不在此列。
const OWNER_COLUMN_TABLES = [
  'characters', // 需要 ownerId（step1b 再据此建复合主键 (ownerId,id)）
  'feed_posts', 'feed_comments', 'feed_post_likes',
  'moment_posts', 'moment_comments', 'moment_likes', 'moments',
  'messages', 'groups', 'group_members', 'group_messages',
  'group_reply_tasks', 'reply_artifact_jobs', 'media_insight_jobs',
  'chat_favorites', 'chat_favorite_notes',
  'world_contexts',
  'ai_relationships', 'character_friendships',
];
// 注：conversations 不在此列——它已有 owner 列（DB 列名 userId，ConversationEntity 映射），
// 值已就绪。step1b 对 conversations 用 userId 建复合主键 (userId,id)。

const db = new BetterSqlite3(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

function tableExists(name) {
  return !!db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
}
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

// 1) 解析该库唯一 world_owner（每用户库只有一个；忽略 legacy system / wiki_member）。
//    存量 LPP 库可能还没 cloudPhone 列（新代码才加），只取 id（step1 回填只需 owner id；
//    phone→owner 映射是 step2 的事，可由账号目录名得出）。
const owners = db
  .prepare(`SELECT id FROM users WHERE userType='world_owner' ORDER BY createdAt ASC`)
  .all();
if (owners.length === 0) {
  console.error('该库没有 world_owner 行，跳过（可能是 wiki/系统库）。');
  process.exit(0);
}
if (owners.length > 1) {
  // 已经是合并后的共享库或异常；step1 只处理单 owner 的存量库。
  console.error(`该库有 ${owners.length} 个 world_owner，疑似已是共享库；step1 拒绝运行以防误回填。`);
  process.exit(2);
}
const ownerId = owners[0].id;
console.log(`world_owner = ${ownerId}`);

// wiki 域表的 userId 指向 wiki_member（非 world_owner），且 wiki 已是独立库，不回填到 owner。
const WIKI_EXCLUDE = /^wiki_/i;
const WIKI_EXTRA = new Set(['user_wiki_profiles']);
const allTables = () =>
  db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);
// owner 列：优先 ownerId，否则 userId（与 step0/step1b/step2 一致）。
function ownerColOf(table) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  if (cols.includes('ownerId')) return 'ownerId';
  if (cols.includes('userId')) return 'userId';
  return null;
}

let totalAddedCols = 0;
let totalBackfilled = 0;

const run = db.transaction(() => {
  // 1) 给「本轮新加 ownerId 列」的表确保列存在（旧 LPP 库 synchronize 还没加过）。
  for (const table of OWNER_COLUMN_TABLES) {
    if (!tableExists(table)) continue;
    if (!hasColumn(table, 'ownerId')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ownerId TEXT`);
      totalAddedCols++;
    }
  }
  // 2) 回填：覆盖**全部** owner-scoped 表（自动发现，排除 wiki 域），把 owner 列的 NULL 行
  //    回填成该库唯一 world_owner。早期版本只回填硬编码 OWNER_COLUMN_TABLES，漏掉了
  //    ai_usage_ledger 等「已带 ownerId 但有历史 NULL 行」的存量表，导致 step1b 复合主键
  //    重建撞 NULL（如 ai_usage_ledger 331 行 ownerId NULL 的角色级 token 用量）。单 owner
  //    库里每行都归该 owner，回填 NULL 永远正确且幂等。
  for (const table of allTables()) {
    if (WIKI_EXCLUDE.test(table) || WIKI_EXTRA.has(table)) continue;
    const oc = ownerColOf(table);
    if (!oc) continue;
    const res = db
      .prepare(`UPDATE "${table}" SET "${oc}" = ? WHERE "${oc}" IS NULL`)
      .run(ownerId);
    if (res.changes > 0) {
      console.log(`  ${table}.${oc}: 回填 ${res.changes} 行`);
      totalBackfilled += res.changes;
    }
  }
});

run();
db.pragma('wal_checkpoint(TRUNCATE)');

// 校验：确认**全部** owner-scoped 表（排除 wiki）无残留 NULL owner 列——这是 step1b 复合主键
// 重建的前置（NULL 进不了复合 PK）。
let leftoverNull = 0;
for (const table of allTables()) {
  if (WIKI_EXCLUDE.test(table) || WIKI_EXTRA.has(table)) continue;
  const oc = ownerColOf(table);
  if (!oc) continue;
  const n = db.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE "${oc}" IS NULL`).get().n;
  if (n > 0) {
    console.error(`  ⚠️ ${table}.${oc} 仍有 ${n} 行 NULL`);
    leftoverNull += n;
  }
}

db.close();
console.log(`\nstep1 完成：新增列 ${totalAddedCols}，回填 ${totalBackfilled} 行，残留 NULL ${leftoverNull}。`);

// =============================================================================
// TODO step1b（高危，单独做）：确定性 id 实体复合主键重建 (ownerId, id)
//   - characters / conversations（+ 核 groups/messages 是否确定性 id）
//   - SQLite 不能 ALTER PK：须读 sqlite_master 的 CREATE TABLE sql → 注入 ownerId 入 PK
//     → 建新表 → INSERT SELECT → drop → rename，事务内逐表做，且 shared 库须 synchronize:false。
//   - 单 owner 库其实不撞（id 仍唯一），step1b 的价值在 step2 合并成多 owner 库时；
//     因此可在 step2 之前、对「即将合并的源库」或「合并后的目标库」统一做。
// =============================================================================
process.exit(leftoverNull > 0 ? 3 : 0);
