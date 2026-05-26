#!/usr/bin/env node
// 共享 world 多租户迁移 step1b：把确定性 id 实体重建为复合主键 (ownerId, id)。
//
// 为什么：characters('char-default-self' 等固定 id) / conversations('direct_<char>') 的 id
// 在每用户库里唯一，但 step2 把多个 owner 的库 union 进同一共享库时，A 和 B 各自的
// 'char-default-self' 会撞全局 PK。改成复合主键 (ownerId, id) 后每 owner 各有一行，且
// 代码里 SELF_CHARACTER_ID 等常量照用（按当前 owner 作用域命中）。
//
// SQLite 不能 ALTER PK：读 sqlite_master 的 CREATE TABLE sql → 去掉 id 列内联 PRIMARY KEY
// → 末尾加表级 PRIMARY KEY("ownerId","id") → 建新表→拷→drop→rename→重建索引。
// 前置：必须先跑 step1（ownerId 列已加且回填，否则复合 PK 含 NULL 无意义）。
// 幂等：已是复合主键则跳过。**先对副本跑验证**。
//
// 用法: node 2026-mt-step1b-composite-pk.mjs <database.sqlite> [table1 table2 ...]
//   默认表: characters conversations

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
const tables = process.argv.slice(3);
const TARGET_TABLES = tables.length ? tables : ['characters', 'conversations'];

// 每张表的 owner 列名：characters 用新加的 ownerId；conversations 复用既有 userId
// （ConversationEntity 把 ownerId 映射到 DB 列 userId）。其余确定性 id 表按需补。
const OWNER_COLUMN = {
  characters: 'ownerId',
  conversations: 'userId',
};
function ownerColOf(table) {
  return OWNER_COLUMN[table] ?? 'ownerId';
}

if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: node 2026-mt-step1b-composite-pk.mjs <database.sqlite> [tables...]');
  process.exit(1);
}

const db = new BetterSqlite3(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

function pkColumns(table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);
}
function columnNames(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

// 把 CREATE TABLE sql 改成复合主键：去 id 列内联 PRIMARY KEY，末尾加表级 PK(ownerCol,id)。
function rewriteCreateSql(originalSql, newTableName, ownerCol) {
  let sql = originalSql;
  // 表名换成新表名（只换第一处 CREATE TABLE "x" / x）。
  sql = sql.replace(
    /CREATE TABLE\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)/i,
    `CREATE TABLE "${newTableName}"`,
  );
  // 去掉 id 列上的内联 PRIMARY KEY（形如 "id" varchar PRIMARY KEY NOT NULL）。
  sql = sql.replace(
    /("id"\s+[A-Za-z0-9_()]+\s+)PRIMARY KEY(\s)/i,
    '$1$2',
  );
  // 末尾右括号前插入表级复合主键。
  const lastParen = sql.lastIndexOf(')');
  if (lastParen < 0) throw new Error('无法定位 CREATE TABLE 结尾右括号');
  sql = sql.slice(0, lastParen) + `, PRIMARY KEY ("${ownerCol}", "id")` + sql.slice(lastParen);
  return sql;
}

let rebuilt = 0;
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
    const cols = columnNames(table);
    if (!cols.includes(ownerCol)) {
      throw new Error(`${table} 没有 owner 列 ${ownerCol}——请先跑 step1`);
    }
    const pk = pkColumns(table);
    if (pk.length === 2 && pk.includes(ownerCol) && pk.includes('id')) {
      console.log(`  ${table}: 已是复合主键 (${ownerCol},id)，跳过`);
      continue;
    }
    if (!(pk.length === 1 && pk[0] === 'id')) {
      throw new Error(`${table} 当前主键为 [${pk.join(',')}]，非预期单 id，拒绝重建`);
    }

    const beforeCount = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    // 残留 NULL owner 会进不了复合 PK（NULL 在 SQLite PK 里允许但语义错），先卡死。
    const nullOwner = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE "${ownerCol}" IS NULL`).get().n;
    if (nullOwner > 0) {
      throw new Error(`${table} 有 ${nullOwner} 行 ${ownerCol} NULL——请先跑 step1 回填`);
    }

    // 收集非自动索引（自动索引 sql 为 NULL，随表重建自动重生）。
    const indexes = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`)
      .all(table)
      .map((r) => r.sql);

    const tmpName = `${table}__mt_new`;
    const newSql = rewriteCreateSql(exists.sql, tmpName, ownerCol);
    const colList = cols.map((c) => `"${c}"`).join(', ');

    db.exec(newSql);
    db.exec(`INSERT INTO "${tmpName}" (${colList}) SELECT ${colList} FROM "${table}"`);
    db.exec(`DROP TABLE "${table}"`);
    db.exec(`ALTER TABLE "${tmpName}" RENAME TO "${table}"`);
    for (const idxSql of indexes) {
      db.exec(idxSql); // 索引定义里带表名，rename 后表名一致，直接重放
    }

    const afterCount = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    if (afterCount !== beforeCount) {
      throw new Error(`${table} 行数不一致：${beforeCount} → ${afterCount}，回滚`);
    }
    console.log(`  ${table}: 重建为复合主键 (ownerId,id)，${afterCount} 行保持`);
    rebuilt++;
  }
});

// 复合 PK 重建期间关外键检查（better-sqlite3 默认不开 FK，这里显式确保）。
db.pragma('foreign_keys = OFF');
migrate();
db.pragma('wal_checkpoint(TRUNCATE)');

// 校验复合主键已就位。
for (const table of TARGET_TABLES) {
  const t = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  if (!t) continue;
  const pk = pkColumns(table);
  console.log(`  [verify] ${table} PK = (${pk.join(', ')})`);
}

db.close();
console.log(`\nstep1b 完成：重建 ${rebuilt} 张表为复合主键。`);
