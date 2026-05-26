#!/usr/bin/env node
// 共享 world 多租户迁移 step0：把单个源账号库的 world_owner id 重映射成「按 phone 唯一」的
// 确定性新 id，并改写库内**所有**引用该 owner id 的列。这是 step2 union 合并的关键前置。
//
// 为什么必须有这一步（真实数据走查发现）：账号库由模板播种，owner id 跨账号大量重复——
//   实测 103 个账号只有 73 个不同 world_owner id，其中 31 个账号共用同一个 816d9761…。
//   若不先把每账号的 owner id 改成唯一值，step2 直接 union 会把多个真实用户的数据并到同一
//   owner id 下 = 灾难性串号 / 隐私泄漏。step2 已对 owner id 冲突硬拒绝，必须先跑本脚本。
//
// 唯一性来源：NEW = uuidv5(NAMESPACE, phone)。确定性 ⇒ 幂等（重跑 OLD==NEW 即 no-op）、
//   可复现、按 phone 天然不撞。统一对**所有**账号重映射（不只 31 个重复的），合并后全 fleet
//   的 owner id 都是 phone 派生值，零冲突、无需特判。
//
// 「列全 owner 引用列清单再写」——本脚本不用静态列清单（真实库里 owner id 散落在 ~49 列：
//   ownerId / userId / authorId / replyToAuthorId / senderId / creatorId / memberId / scopeId /
//   ownerUserId / sourceEntityId / targetId / lotOwnerId / visitorId 以及 cyber_avatar_* /
//   farm_* / parking_war_* 整族，外加 system_config.value / *Payload / *Snapshot / dedupeKey 等
//   JSON 内嵌；任何手写清单都会漏列 → 串号）。改用**动态发现**：扫描每张表每一列，凡是出现
//   OLD id 的列一律 REPLACE(col, OLD, NEW)。因 OLD 是完整 36 字符 UUID，子串替换零误伤
//   （没有任何无关值会把一个完整 UUID 当子串），所以「精确等于」与「JSON 内嵌」用同一机制覆盖。
//
// 顺序：copy 源库 → **step0(本脚本)** → step1(加列回填) → step1b(复合主键) → step2(union)。
//   step0 先跑：step1 随后读 world_owner.id 得到 NEW 回填新加的 ownerId 列，全程一致。
//
// 用法（**先对 /tmp 副本跑**）：
//   cp data/accounts/<phone>/database.sqlite /tmp/x.sqlite
//   node scripts/migrations/2026-mt-step0-remap-owner-id.mjs /tmp/x.sqlite <phone> [--dry-run]
//   phone 省略时尝试从 data/accounts/<phone>/ 路径推断（仅作兜底，建议显式传）。
//
// 安全性：单 owner 库前置（>1 拒绝）、事务包裹、foreign_keys=OFF、结束 WAL checkpoint、
//   --dry-run 只打印发现的列不写、收尾校验 OLD 零残留 + NEW 就位 + cloudPhone 落地。

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// 固定命名空间 UUID（本次迁移专用，随机生成一次后写死，保证全 fleet 派生一致）。
const NAMESPACE = '6f1d3e2a-9c4b-5f87-a3d1-7e0b2c45a9f0';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));
const dbPath = positional[0];
let phone = positional[1];

if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: node 2026-mt-step0-remap-owner-id.mjs <database.sqlite> <phone> [--dry-run]');
  process.exit(1);
}
// phone 兜底推断：.../data/accounts/<phone>/database.sqlite
if (!phone) {
  const m = resolve(dbPath).match(/accounts\/([^/]+)\/database\.sqlite$/);
  if (m) {
    phone = m[1];
    console.warn(`⚠️ 未传 phone，从路径推断 phone=${phone}（建议显式传参）`);
  }
}
if (!phone) {
  console.error('缺少 phone 参数，且无法从路径推断。请显式传入源账号 phone。');
  process.exit(1);
}
phone = phone.trim();

// 标准 RFC 4122 UUIDv5（SHA1）。namespace 转 16 字节 + name(utf8) → sha1 → 取前 16 字节
// → 写入 version=5 / variant=10。
function uuidv5(name, namespace) {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  if (nsBytes.length !== 16) throw new Error('NAMESPACE 必须是合法 UUID');
  const hash = createHash('sha1')
    .update(nsBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const db = new BetterSqlite3(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = OFF');

// 1) 单 owner 前置：每用户存量库只有 1 个 world_owner。>1 = 已是共享库或异常，拒绝。
const owners = db
  .prepare(`SELECT id FROM users WHERE userType='world_owner' ORDER BY createdAt ASC`)
  .all();
if (owners.length === 0) {
  console.error('该库没有 world_owner 行，跳过（可能是 wiki/系统库）。');
  process.exit(0);
}
if (owners.length > 1) {
  console.error(`该库有 ${owners.length} 个 world_owner，疑似已是共享库；step0 拒绝运行以防误改。`);
  process.exit(2);
}
const OLD = owners[0].id;
const NEW = uuidv5(phone, NAMESPACE);
console.log(`phone=${phone}`);
console.log(`OLD owner id = ${OLD}`);
console.log(`NEW owner id = ${NEW}  (uuidv5)`);

function allTables() {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);
}
function columnsOf(t) {
  return db.prepare(`PRAGMA table_info("${t}")`).all();
}

// 1.5) 重建 users 表去掉内联 UNIQUE(username/email)。TypeORM 生成的是表级
//   `CONSTRAINT "UQ_..." UNIQUE ("username")`，对应 sqlite_autoindex（sql=NULL，DROP INDEX
//   删不掉）。账号库模板播种导致 username/email 跨账号重复（实测都叫 'w'），不去掉则 step2
//   union 第二个 owner 会被 INSERT OR IGNORE 静默吃掉（只剩 1 个 world_owner）。共享 world
//   的 owner 身份靠 cloudPhone，不需要 username/email 全局唯一（wiki 是独立库）。
//   shared 运行须 synchronize:false 防 TypeORM 把这些 UNIQUE 重建回去。幂等：无 UNIQUE 则跳过。
function rebuildUsersDropUnique() {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get();
  if (!row) return;
  const hasInlineUnique = /CONSTRAINT\s+"[^"]+"\s+UNIQUE\s*\(/i.test(row.sql);
  if (!hasInlineUnique) {
    return; // 已无内联 UNIQUE（幂等）
  }
  const before = db.prepare(`SELECT COUNT(*) n FROM users`).get().n;
  const cols = columnsOf('users').map((c) => `"${c.name}"`).join(', ');
  // 去掉所有 `, CONSTRAINT "..." UNIQUE (...)` 表级唯一约束子句，保留 PRIMARY KEY。
  let newSql = row.sql.replace(/,\s*CONSTRAINT\s+"[^"]+"\s+UNIQUE\s*\([^)]*\)/gi, '');
  newSql = newSql.replace(/CREATE TABLE\s+"users"/i, 'CREATE TABLE "users__mt_new"');
  const idxs = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='users' AND sql IS NOT NULL`)
    .all()
    .map((r) => r.sql);
  db.exec(newSql);
  db.exec(`INSERT INTO "users__mt_new" (${cols}) SELECT ${cols} FROM users`);
  db.exec(`DROP TABLE users`);
  db.exec(`ALTER TABLE "users__mt_new" RENAME TO users`);
  for (const s of idxs) db.exec(s); // 非 UNIQUE 命名索引重放（UNIQUE 的 sql 已不在清单里）
  const after = db.prepare(`SELECT COUNT(*) n FROM users`).get().n;
  if (after !== before) throw new Error(`users 重建行数不一致 ${before}→${after}`);
  console.log(`  users 重建：去掉内联 UNIQUE(username/email)，${after} 行保持`);
}
db.transaction(rebuildUsersDropUnique)();

// 2) 动态发现：扫描每张表每一列，凡出现 OLD（精确或子串）即纳入改写清单。

const targets = []; // { table, col, exact, sub }
for (const t of allTables()) {
  for (const c of columnsOf(t)) {
    let nExact = 0;
    let nSub = 0;
    try {
      nExact = db.prepare(`SELECT COUNT(*) n FROM "${t}" WHERE "${c.name}" = ?`).get(OLD).n;
      nSub = db
        .prepare(`SELECT COUNT(*) n FROM "${t}" WHERE "${c.name}" LIKE ? AND "${c.name}" <> ?`)
        .get('%' + OLD + '%', OLD).n;
    } catch {
      continue; // blob/不可比较列，跳过
    }
    if (nExact > 0 || nSub > 0) targets.push({ table: t, col: c.name, exact: nExact, sub: nSub });
  }
}

console.log(`\n发现 ${targets.length} 个含 owner id 的列：`);
for (const x of targets) {
  console.log(`  ${x.table}.${x.col}  精确 x${x.exact}${x.sub ? `  子串 x${x.sub}` : ''}`);
}

if (OLD === NEW) {
  console.log('\nOLD == NEW（已重映射过），跳过改写；仅校验 cloudPhone。');
}

// cloudPhone 列是否存在（旧 LPP 库还没有，新代码才加）。
function hasColumn(table, col) {
  return columnsOf(table).some((c) => c.name === col);
}

if (dryRun) {
  console.log('\n--dry-run：不写入。以上为将被 REPLACE(OLD→NEW) 的列。');
  db.close();
  process.exit(0);
}

// 3) 改写：单一机制 REPLACE(col, OLD, NEW) 覆盖「精确等于」与「JSON 内嵌」两种形态。
let totalChanged = 0;
const run = db.transaction(() => {
  if (OLD !== NEW) {
    for (const x of targets) {
      const res = db
        .prepare(`UPDATE "${x.table}" SET "${x.col}" = REPLACE("${x.col}", ?, ?) WHERE "${x.col}" LIKE ?`)
        .run(OLD, NEW, '%' + OLD + '%');
      if (res.changes > 0) totalChanged += res.changes;
    }
  }
  // 4) cloudPhone：共享库靠它解析 owner。确保列存在并落本账号 phone 到 world_owner 行。
  if (!hasColumn('users', 'cloudPhone')) {
    db.exec(`ALTER TABLE users ADD COLUMN cloudPhone TEXT`);
    console.log('  users 加列 cloudPhone');
  }
  const cp = db
    .prepare(`UPDATE users SET cloudPhone = ? WHERE id = ? AND userType='world_owner'`)
    .run(phone, NEW);
  console.log(`  cloudPhone 落地 ${cp.changes} 行 = ${phone}`);
});
run();
db.pragma('wal_checkpoint(TRUNCATE)');

// 5) 收尾校验：OLD 零残留 + NEW 就位 + cloudPhone 正确。
let leftover = 0;
for (const t of allTables()) {
  for (const c of columnsOf(t)) {
    let n = 0;
    try {
      n = db.prepare(`SELECT COUNT(*) n FROM "${t}" WHERE "${c.name}" LIKE ?`).get('%' + OLD + '%').n;
    } catch {
      continue;
    }
    if (n > 0 && OLD !== NEW) {
      console.error(`  ⚠️ ${t}.${c.name} 仍残留 ${n} 处 OLD`);
      leftover += n;
    }
  }
}
const ownerRow = db
  .prepare(`SELECT id, cloudPhone FROM users WHERE userType='world_owner'`)
  .get();
const ok =
  ownerRow &&
  ownerRow.id === NEW &&
  ownerRow.cloudPhone === phone &&
  (OLD === NEW || leftover === 0);

db.close();
console.log(
  `\nstep0 完成：改写 ${totalChanged} 处，owner id ${OLD.slice(0, 8)}→${NEW.slice(0, 8)}，` +
    `cloudPhone=${ownerRow?.cloudPhone}，OLD 残留 ${leftover}。`,
);
if (!ok) {
  console.error('❌ 校验未通过（owner id / cloudPhone / 残留）。');
  process.exit(3);
}
process.exit(0);
