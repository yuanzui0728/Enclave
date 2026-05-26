#!/usr/bin/env node
// 共享 world 多租户迁移 fleet 走查（**只读**，安全）：扫全部 data/accounts/<phone>/database.sqlite，
// 出一份「迁移就绪度」报告，供 bulk 迁移/cutover 前评估，不改任何库。
//
// 报告每账号：world_owner id + 个数、表数/characters 列数（schema 陈旧度 = 需不需要 prep
// catch-up）、外部 owner 污染行数（owner-scoped 表里 owner ∉ 本库 world_owner 的行，wiki
// 寄主账号才有，见 mother 账号 91173587559732）。汇总：唯一 owner id 数（验证 31 重复/73 唯一）、
// 需 prep 的账号数、有污染的账号数。
//
// 只读打开（readonly），不与在线 LPP child 冲突。用法: node 2026-mt-fleet-survey.mjs [accountsDir]

import BetterSqlite3 from 'better-sqlite3';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const accountsDir = resolve(process.argv[2] || resolve(process.cwd(), '../data/accounts'));
if (!existsSync(accountsDir)) {
  console.error(`账号目录不存在: ${accountsDir}（在 repo 根或传参）`);
  process.exit(1);
}

// 当前实体基线（schema 陈旧度判据，来自 live 账号实测）。
const CURRENT_TABLES = 92;
const CURRENT_CHAR_COLS = 38;
// 检查外部 owner 污染的代表表（mother 账号实测命中这几张）。
const POLLUTION_TABLES = ['conversations', 'ai_usage_ledger', 'moderation_reports'];
const ownerColOf = (db, t) => {
  const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
  return cols.includes('ownerId') ? 'ownerId' : cols.includes('userId') ? 'userId' : null;
};
const tableExists = (db, t) =>
  !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t);

const phones = readdirSync(accountsDir).filter((d) =>
  existsSync(resolve(accountsDir, d, 'database.sqlite')),
);

const rows = [];
const ownerIdCounts = new Map();
let stale = 0;
let polluted = 0;
let multiOwner = 0;
let errored = 0;

for (const phone of phones) {
  const path = resolve(accountsDir, phone, 'database.sqlite');
  let db;
  try {
    db = new BetterSqlite3(path, { readonly: true, fileMustExist: true });
    const owners = db.prepare(`SELECT id FROM users WHERE userType='world_owner'`).all().map((r) => r.id);
    const ownerSet = new Set(owners);
    for (const o of owners) ownerIdCounts.set(o, (ownerIdCounts.get(o) || 0) + 1);
    const tables = db.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).get().n;
    const charCols = tableExists(db, 'characters')
      ? db.prepare(`PRAGMA table_info(characters)`).all().length
      : 0;
    const isStale = tables < CURRENT_TABLES || charCols < CURRENT_CHAR_COLS;

    // 污染：owner-scoped 表里 owner 列值 ∉ 本库 world_owner（非本人数据）。
    let pollutionRows = 0;
    if (ownerSet.size > 0) {
      const placeholders = owners.map(() => '?').join(',') || "''";
      for (const t of POLLUTION_TABLES) {
        if (!tableExists(db, t)) continue;
        const oc = ownerColOf(db, t);
        if (!oc) continue;
        pollutionRows += db
          .prepare(`SELECT COUNT(*) n FROM "${t}" WHERE "${oc}" IS NOT NULL AND "${oc}" NOT IN (${placeholders})`)
          .get(...owners).n;
      }
    }

    if (isStale) stale++;
    if (pollutionRows > 0) polluted++;
    if (owners.length !== 1) multiOwner++;
    rows.push({ phone, owner: owners[0]?.slice(0, 8) ?? '∅', owners: owners.length, tables, charCols, isStale, pollutionRows });
    db.close();
  } catch (e) {
    errored++;
    rows.push({ phone, error: e.message });
    try { db?.close(); } catch { /* noop */ }
  }
}

// 明细（只打印异常/陈旧/污染/多 owner 的，干净的折叠）。
console.log(`=== fleet 走查：${phones.length} 个账号 ===`);
const flagged = rows.filter((r) => r.error || r.isStale || r.pollutionRows > 0 || r.owners !== 1);
console.log(`\n需关注 ${flagged.length} 个：`);
for (const r of flagged) {
  if (r.error) { console.log(`  ✗ ${r.phone}: ERROR ${r.error}`); continue; }
  const flags = [
    r.owners !== 1 ? `owners=${r.owners}` : '',
    r.isStale ? `陈旧(${r.tables}表/${r.charCols}列)` : '',
    r.pollutionRows > 0 ? `污染${r.pollutionRows}行` : '',
  ].filter(Boolean).join(' ');
  console.log(`  ${r.phone} owner=${r.owner} ${flags}`);
}

// owner id 重复分布
const dupes = [...ownerIdCounts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
console.log(`\n=== owner id 唯一性 ===`);
console.log(`不同 owner id 数: ${ownerIdCounts.size}（账号 ${phones.length}）`);
for (const [id, n] of dupes) console.log(`  ${id} 被 ${n} 个账号共用`);

console.log(`\n=== 汇总 ===`);
console.log(`总账号 ${phones.length}；schema 陈旧(需 prep) ${stale}；外部 owner 污染 ${polluted}；非单 owner ${multiOwner}；读取失败 ${errored}`);
console.log(`迁移就绪度：${phones.length - stale - errored} 个无需 prep 直走 step0；${stale} 个需先 prep catch-up；${polluted} 个建议先清污染行。`);
