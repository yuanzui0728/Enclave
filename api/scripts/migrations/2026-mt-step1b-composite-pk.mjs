#!/usr/bin/env node
// 共享 world 多租户迁移 step1b：把 world-owner-scoped 实体重建为复合主键 (ownerCol, ...原PK)。
//
// 为什么：源账号库由模板播种，**大量表的行 id 跨账号完全相同**（实测两账号 ai_relationships
// 各 2850 行、2836 个 id 重合；world_contexts/cyber_avatar_runs/narrative_arcs/friendships…
// 同样重合）。step2 把多个 owner 的库 union 进同一共享库时，这些固定/种子 id 会撞全局主键
// （实测报 `UNIQUE constraint failed: world_contexts.id` 等）。改成复合主键 (ownerCol, id) 后
// 每个 owner 各有一份，代码里 SELF_CHARACTER_ID / 固定会话 id 等常量照用（按当前 owner 作用域命中）。
//
// ⚠️ 早期版本只覆盖 characters/conversations 两表——真实数据 union 走查证明远远不够：
//   几乎所有 world-owner-scoped 表都因模板播种而 id 重合。故本版**自动发现**全部需要复合主键
//   的表（与 step0 同思路，自动发现比手写清单可靠），而非写死两张表。
//
// 自动发现规则：表含 ownerId 或 userId 列、且当前 PK **未**包含该 owner 列、且非 wiki 域表
//   （wiki_* / user_wiki_profiles 的 userId 指向 wiki_member 而非 world_owner，wiki 已是独立库
//   data/wiki/wiki.sqlite，不进共享 world，不在此重建）。owner 列优先 ownerId，否则 userId。
//   已含 owner 列的 PK（characters(ownerId,id) / conversations(userId,id) / wiki_watchlist …）跳过。
//
// SQLite 不能 ALTER PK：读 sqlite_master 的 CREATE TABLE sql → 去掉单列 PK 列的内联 PRIMARY KEY
//   → 末尾加表级 PRIMARY KEY("ownerCol", "<pk>") → 建新表→拷→drop→rename→重建非自动索引。
// 前置：先跑 step0（owner id 唯一化）+ step1（ownerId 列已加且回填）。幂等：已是复合主键则跳过。
//   **先对副本跑验证**，结束做行数守恒校验（不一致即回滚抛错）。
//
// 用法: node 2026-mt-step1b-composite-pk.mjs <database.sqlite> [table1 table2 ...]
//   不传 tables = 自动发现全部需要复合主键的 world-owner-scoped 表（推荐）。

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
const explicitTables = process.argv.slice(3);

if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: node 2026-mt-step1b-composite-pk.mjs <database.sqlite> [tables...]');
  process.exit(1);
}

const db = new BetterSqlite3(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = OFF');

// wiki 域 owner-scoped 表（userId 指向 wiki_member，不进共享 world，跳过）。
const WIKI_EXCLUDE = /^wiki_/i;
const WIKI_EXTRA = new Set(['user_wiki_profiles']);

function tableInfo(table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all();
}
function columnNames(table) {
  return tableInfo(table).map((c) => c.name);
}
function pkColumns(table) {
  return tableInfo(table)
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);
}
// owner 列：优先 ownerId，否则 userId（与 step0/step2 一致）。
function ownerColOf(table) {
  const cols = columnNames(table);
  if (cols.includes('ownerId')) return 'ownerId';
  if (cols.includes('userId')) return 'userId';
  return null;
}

function autoDiscoverTables() {
  const all = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);
  const picked = [];
  for (const t of all) {
    if (WIKI_EXCLUDE.test(t) || WIKI_EXTRA.has(t)) continue;
    const oc = ownerColOf(t);
    if (!oc) continue; // 非 owner-scoped
    const pk = pkColumns(t);
    if (pk.length === 0) continue; // 无 PK（不会撞）
    if (pk.includes(oc)) continue; // 已含 owner 列
    picked.push(t);
  }
  return picked;
}

const TARGET_TABLES = explicitTables.length ? explicitTables : autoDiscoverTables();
console.log(`待重建复合主键的表（${TARGET_TABLES.length}）：${TARGET_TABLES.join(', ')}`);

// 把 CREATE TABLE sql 改成复合主键：去掉单 PK 列的内联 PRIMARY KEY，末尾加表级 PK(ownerCol,pkCol)。
function rewriteCreateSql(originalSql, newTableName, ownerCol, pkCol) {
  let sql = originalSql;
  // 表名换成新表名（只换第一处 CREATE TABLE "x" / x）。
  sql = sql.replace(
    /CREATE TABLE\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)/i,
    `CREATE TABLE "${newTableName}"`,
  );
  // 去掉 pk 列上的内联 PRIMARY KEY（形如 "id" varchar PRIMARY KEY NOT NULL）。
  const inlinePk = new RegExp(`("${pkCol}"\\s+[A-Za-z0-9_()]+\\s+)PRIMARY KEY(\\s)`, 'i');
  if (!inlinePk.test(sql)) {
    throw new Error(`无法在 CREATE TABLE 中定位 "${pkCol}" 的内联 PRIMARY KEY，拒绝重建`);
  }
  sql = sql.replace(inlinePk, '$1$2');
  // owner-blind 的表级 UNIQUE 约束（如 farm_npc_states 的 UNIQUE("characterId")、
  // push_tokens 的 UNIQUE("platform","bundleId","token")）并入 owner 列——否则多 owner
  // union 进同库时不同 owner 的同 characterId/同 token 撞 UNIQUE（实测 8 账号 union 报
  // farm_npc_states.characterId 冲突）。已含 owner 列的（UNIQUE("ownerId"…)）原样保留。
  sql = sql.replace(
    /(CONSTRAINT\s+"[^"]+"\s+UNIQUE\s*\()([^)]*)(\))/gi,
    (full, pre, cols, post) => {
      const names = cols
        .split(',')
        .map((c) => c.trim().replace(/^["'`[]+|["'`\]]+$/g, '').split(/\s+/)[0]);
      if (names.includes(ownerCol)) return full;
      return `${pre}"${ownerCol}", ${cols}${post}`;
    },
  );
  // 末尾右括号前插入表级复合主键。
  const lastParen = sql.lastIndexOf(')');
  if (lastParen < 0) throw new Error('无法定位 CREATE TABLE 结尾右括号');
  sql = sql.slice(0, lastParen) + `, PRIMARY KEY ("${ownerCol}", "${pkCol}")` + sql.slice(lastParen);
  return sql;
}

// 把 owner-scoped 表的 UNIQUE 索引改成「owner 列在前」的复合唯一，确保多 owner union 不撞。
// 只动 UNIQUE 索引（普通索引不影响 union）；已含 owner 列的（如 (userId,postId,type)）原样返回。
function ownerScopeUniqueIndexSql(idxSql, ownerCol) {
  if (!/CREATE\s+UNIQUE\s+INDEX/i.test(idxSql)) return idxSql;
  const m = idxSql.match(/\(([^)]*)\)/); // 第一组括号 = 列清单
  if (!m) return idxSql;
  const colNames = m[1]
    .split(',')
    .map((c) => c.trim().replace(/^["'`[]+|["'`\]]+$/g, '').split(/\s+/)[0]);
  if (colNames.includes(ownerCol)) return idxSql; // 已是 owner-aware
  return idxSql.replace(/\(([^)]*)\)/, `("${ownerCol}", $1)`);
}

let rebuilt = 0;
let skipped = 0;
const migrate = db.transaction(() => {
  for (const table of TARGET_TABLES) {
    const exists = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    if (!exists) {
      console.log(`  ${table}: 表不存在，跳过`);
      continue;
    }
    const ownerCol = ownerColOf(table);
    if (!ownerCol) {
      throw new Error(`${table} 没有 ownerId/userId 列，不该出现在目标清单`);
    }
    const cols = columnNames(table);
    const pk = pkColumns(table);
    if (pk.length >= 2 && pk.includes(ownerCol)) {
      console.log(`  ${table}: 已是复合主键 (${pk.join(',')})，跳过`);
      skipped++;
      continue;
    }
    if (pk.length !== 1) {
      throw new Error(`${table} 当前主键为 [${pk.join(',')}]（非单列且不含 owner），拒绝重建`);
    }
    const pkCol = pk[0];
    if (pkCol === ownerCol) {
      console.log(`  ${table}: PK 即 owner 列，跳过`);
      skipped++;
      continue;
    }

    const beforeCount = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
    // 残留 NULL owner 进不了复合 PK（语义错），先卡死。
    const nullOwner = db
      .prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE "${ownerCol}" IS NULL`)
      .get().n;
    if (nullOwner > 0) {
      throw new Error(`${table} 有 ${nullOwner} 行 ${ownerCol} NULL——请先跑 step1 回填`);
    }

    // 非自动索引（自动索引 sql 为 NULL，随表重建自动重生）。
    const indexes = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`)
      .all(table)
      .map((r) => r.sql);

    const tmpName = `${table}__mt_new`;
    const newSql = rewriteCreateSql(exists.sql, tmpName, ownerCol, pkCol);
    const colList = cols.map((c) => `"${c}"`).join(', ');

    db.exec(newSql);
    db.exec(`INSERT INTO "${tmpName}" (${colList}) SELECT ${colList} FROM "${table}"`);
    db.exec(`DROP TABLE "${table}"`);
    db.exec(`ALTER TABLE "${tmpName}" RENAME TO "${table}"`);
    for (const idxSql of indexes) {
      // owner-scoped 表的 owner-blind UNIQUE 索引（如 character_friendships 的
      // (characterAId,characterBId)、media_insight_jobs 的 (threadType,threadId,sourceMessageId)）
      // 必须把 owner 列并进去——否则 step2 把多个 owner union 进同库时，不同 owner 的同一对/同
      // 一组键会撞 UNIQUE（实测 8 账号 union 报 SQLITE_CONSTRAINT_UNIQUE）。普通索引不影响 union，原样重放。
      db.exec(ownerScopeUniqueIndexSql(idxSql, ownerCol));
    }

    const afterCount = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
    if (afterCount !== beforeCount) {
      throw new Error(`${table} 行数不一致：${beforeCount} → ${afterCount}，回滚`);
    }
    console.log(`  ${table}: 重建为复合主键 (${ownerCol},${pkCol})，${afterCount} 行保持`);
    rebuilt++;
  }
});

migrate();
db.pragma('wal_checkpoint(TRUNCATE)');

// 校验复合主键已就位。
let unsafe = 0;
for (const table of TARGET_TABLES) {
  const t = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  if (!t) continue;
  const oc = ownerColOf(table);
  const pk = pkColumns(table);
  const ok = pk.includes(oc);
  if (!ok) {
    console.error(`  ❌ [verify] ${table} PK=(${pk.join(',')}) 未含 owner 列 ${oc}`);
    unsafe++;
  }
}

db.close();
console.log(`\nstep1b 完成：重建 ${rebuilt} 张，跳过 ${skipped} 张${unsafe ? `，⚠️ ${unsafe} 张未达成` : ''}。`);
process.exit(unsafe > 0 ? 3 : 0);
