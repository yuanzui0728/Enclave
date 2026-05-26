#!/usr/bin/env node
// 共享 world 多租户迁移 step2：把多个 step1+step1b 迁好的每用户库 union 合并进一个共享库。
//
// ⚠️⚠️ 关键前置（真实数据走查发现）：**账号库由模板播种，owner id 跨账号大量重复**
//   （实测 103 个账号只有 73 个不同 world_owner id，其中 31 个账号共用同一个 816d9761…）。
//   直接 union 会把多个真实用户的数据并到同一个 owner id 下 = 灾难性串号/隐私泄漏。
//   因此**必须先给每个源账号重映射出唯一 owner id**（按 phone 唯一），并改写该库内所有
//   引用 owner id 的列（ownerId / userId / authorType='user' 的 authorId / senderType='user'
//   的 senderId / creatorType='user' 的 creatorId / participants 等）。这一步是 step0-remap，
//   尚未实现（见文末 TODO）。在它就绪前，step2 **检测到 owner id 冲突即硬拒绝**，绝不静默合并。
//
// 表分类（自动）：有 ownerId/userId 列 = owner-scoped（整表 union）；users 特例（只并
// world_owner，INSERT OR IGNORE by id）；其余 = 全局表（INSERT OR IGNORE 去重取首库）。
// 合并前 DROP users.username unique 索引（多 world_owner 可同名）。merge_ledger 幂等。
//
// 用法: node 2026-mt-step2-merge-into-shared.mjs <shared.sqlite(输出)> <src1> <src2> ...

import BetterSqlite3 from 'better-sqlite3';
import { existsSync, copyFileSync, rmSync } from 'node:fs';

const [outPath, ...sources] = process.argv.slice(2);
if (!outPath || sources.length < 1) {
  console.error('用法: node 2026-mt-step2-merge-into-shared.mjs <shared.sqlite> <src1> [src2 ...]');
  process.exit(1);
}
for (const s of sources) {
  if (!existsSync(s)) { console.error(`源库不存在: ${s}`); process.exit(1); }
}

for (const ext of ['', '-wal', '-shm']) rmSync(outPath + ext, { force: true });
copyFileSync(sources[0], outPath);
const db = new BetterSqlite3(outPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = OFF');

const allTables = () =>
  db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
const columnsOf = (t) => db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
const ownerColOf = (cols) => (cols.includes('ownerId') ? 'ownerId' : cols.includes('userId') ? 'userId' : null);
const srcColumnSet = (t) => new Set(db.prepare(`PRAGMA src.table_info("${t}")`).all().map((c) => c.name));

// DROP users 上所有 unique 索引（username / email 等）。共享 world 库不需要句柄/邮箱
// 全局唯一（wiki 是独立库；world_owner 身份靠 cloudPhone）；且账号库模板播种导致这些
// 字段跨账号重复，不 drop 则 union 第二个 owner 会被 INSERT OR IGNORE 静默吃掉。
// shared 运行须 synchronize:false 防 TypeORM 重建这些唯一索引。
for (const idx of db
  .prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='users' AND sql IS NOT NULL`)
  .all()) {
  if (/unique/i.test(idx.sql)) {
    db.exec(`DROP INDEX IF EXISTS "${idx.name}"`);
    console.log(`dropped unique index on users: ${idx.name}`);
  }
}

db.exec(`CREATE TABLE IF NOT EXISTS merge_ledger (ownerId TEXT PRIMARY KEY, srcPath TEXT, mergedAt TEXT)`);
const ledgerEntry = (ownerId) => db.prepare(`SELECT srcPath FROM merge_ledger WHERE ownerId=?`).get(ownerId);
const recordMerge = (ownerId, srcPath) =>
  db.prepare(`INSERT OR REPLACE INTO merge_ledger (ownerId, srcPath, mergedAt) VALUES (?,?,?)`)
    .run(ownerId, srcPath, new Date().toISOString());

// wiki 域表的 userId 指向 wiki_member（非 world_owner），且 wiki 已是独立库
// data/wiki/wiki.sqlite（AppModule 已剥离 WikiModule，shared world 不读/不 synchronize 这些表）。
// 不能按 world-owner union（模板播种导致 user_wiki_profiles.userId 等跨账号重复 → 撞 PK）。
// 当作全局表 INSERT OR IGNORE 取首库（非破坏性；是否彻底从 shared 库剔除留作后续清理）。
const WIKI_EXCLUDE = /^wiki_/i;
const WIKI_EXTRA = new Set(['user_wiki_profiles']);
const isWikiDomain = (t) => WIKI_EXCLUDE.test(t) || WIKI_EXTRA.has(t);

const tables = allTables();
const ownerScoped = [], globalTables = [];
for (const t of tables) {
  if (t === 'users' || t === 'merge_ledger') continue;
  // wiki 域强制归全局；其余按是否有 owner 列分类。
  const scoped = !isWikiDomain(t) && ownerColOf(columnsOf(t));
  (scoped ? ownerScoped : globalTables).push(t);
}
console.log(`owner-scoped 表 ${ownerScoped.length}，全局表 ${globalTables.length}`);

for (const o of db.prepare(`SELECT id FROM users WHERE userType='world_owner'`).all().map((r) => r.id)) {
  recordMerge(o, sources[0]);
}

let mergedOwners = 0;
for (let i = 1; i < sources.length; i++) {
  const src = sources[i];
  db.exec(`PRAGMA wal_checkpoint(TRUNCATE)`);
  db.prepare(`ATTACH DATABASE ? AS src`).run(src);
  try {
    const srcOwners = db.prepare(`SELECT id FROM src.users WHERE userType='world_owner'`).all().map((r) => r.id);
    // 冲突硬拒绝：owner id 已被「别的源库」占用 = 模板播种重复 id，必须先 step0-remap。
    for (const o of srcOwners) {
      const entry = ledgerEntry(o);
      if (entry && entry.srcPath !== src) {
        db.exec(`DETACH DATABASE src`);
        db.close();
        console.error(
          `\n❌ owner id 冲突：${o} 已属 ${entry.srcPath}，又出现在 ${src}。\n` +
            `   账号库模板播种导致 owner id 跨账号重复，必须先跑 step0-remap 给每账号唯一 owner id\n` +
            `   并改写其全部 owner 引用列后再合并。step2 拒绝静默合并以防串号。`,
        );
        process.exit(2);
      }
    }
    if (srcOwners.every((o) => ledgerEntry(o)?.srcPath === src)) {
      console.log(`  ${src}: 已合并过（同源），跳过`);
      db.exec(`DETACH DATABASE src`);
      continue;
    }
    const merge = db.transaction(() => {
      // 用显式列清单（不是 SELECT *）：陈旧账号即便过了 prep，users 列序/列集也可能和 main
      // （取自首库）不同，SELECT * 按位置映射会把值塞错列、触 NOT NULL → 被 OR IGNORE 静默吞掉，
      // 结果 world_owner 行没并进来、但它的角色/动态数据并进来了 = 孤儿（实测 8 账号 union 的
      // 陈旧账号 17757541197 正是如此）。显式列清单只并两边都有的列，稳。
      const userCols = columnsOf('users')
        .filter((c) => srcColumnSet('users').has(c))
        .map((c) => `"${c}"`)
        .join(',');
      db.exec(
        `INSERT OR IGNORE INTO main.users (${userCols}) SELECT ${userCols} FROM src.users WHERE userType='world_owner'`,
      );
      // 断言：每个 src world_owner 必须已落 main.users，否则它的 owner-scoped 数据会变孤儿。
      // 直接抛错回滚，绝不静默合并出孤儿（旧版就是因为没断言才悄悄留下 78 角色等孤儿行）。
      for (const o of srcOwners) {
        const landed = db
          .prepare(`SELECT 1 FROM main.users WHERE id=? AND userType='world_owner'`)
          .get(o);
        if (!landed) {
          throw new Error(
            `world_owner ${o}（src ${src}）未能并入 main.users（列不匹配/约束？），拒绝合并其数据以防孤儿`,
          );
        }
      }
      for (const t of ownerScoped) {
        if (!db.prepare(`SELECT 1 FROM src.sqlite_master WHERE type='table' AND name=?`).get(t)) continue;
        const srcCols = srcColumnSet(t);
        const colList = columnsOf(t).filter((c) => srcCols.has(c)).map((c) => `"${c}"`).join(',');
        db.exec(`INSERT INTO main."${t}" (${colList}) SELECT ${colList} FROM src."${t}"`);
      }
      for (const t of globalTables) {
        if (!db.prepare(`SELECT 1 FROM src.sqlite_master WHERE type='table' AND name=?`).get(t)) continue;
        const srcCols = srcColumnSet(t);
        const colList = columnsOf(t).filter((c) => srcCols.has(c)).map((c) => `"${c}"`).join(',');
        db.exec(`INSERT OR IGNORE INTO main."${t}" (${colList}) SELECT ${colList} FROM src."${t}"`);
      }
      for (const o of srcOwners) recordMerge(o, src);
    });
    merge();
    mergedOwners += srcOwners.length;
    console.log(`  ${src}: 合并 owner ${srcOwners.map((o) => o.slice(0, 8)).join(',')}`);
  } finally {
    try { db.exec(`DETACH DATABASE src`); } catch { /* already detached on conflict path */ }
  }
}

db.pragma('wal_checkpoint(TRUNCATE)');
const ownerCount = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE userType='world_owner'`).get().n;
let orphanRows = 0;
for (const t of ownerScoped) {
  const oc = ownerColOf(columnsOf(t));
  const n = db
    .prepare(`SELECT COUNT(*) AS n FROM main."${t}" WHERE "${oc}" IS NOT NULL AND "${oc}" NOT IN (SELECT ownerId FROM merge_ledger)`)
    .get().n;
  if (n > 0) { console.error(`  ⚠️ ${t}: ${n} 行 owner 不在 merge_ledger（可能是 legacy wiki 表）`); orphanRows += n; }
}
db.close();
console.log(`\nstep2 完成：world_owner ${ownerCount}，孤儿行 ${orphanRows}。`);
console.log('注：system_config per-owner 键此版按首库去重——Phase 8 (ownerId,key) 待办，运行时重建。');

// =============================================================================
// TODO step0-remap（关键，未实现）：合并前给每源账号唯一 owner id
//   - 真实数据：103 账号仅 73 个不同 world_owner id（31 个共用 816d9761…，模板播种）
//   - 每源库：新 owner id（按 phone 唯一）→ 改写所有 owner 引用列：
//     users.id / ownerId / userId / authorId(authorType='user') / senderId(senderType='user') /
//     creatorId(creatorType='user') / participants JSON / friendships.userId 等
//   - 之后 step2 union 才无冲突。在它就绪前 step2 对冲突硬拒绝（exit 2）。
// =============================================================================
process.exit(orphanRows > 0 ? 3 : 0);
