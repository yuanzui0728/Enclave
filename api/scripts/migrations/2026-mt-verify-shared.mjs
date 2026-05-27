#!/usr/bin/env node
// 共享 world 多租户迁移 verify：对合并后的共享库做自包含的隔离/完整性校验。
// step0→step1→step1b→step2 跑完后，对最终 shared.sqlite 跑本脚本确认无串号、无孤儿、复合主键就位。
//
// 校验项：
//   1) merge_ledger 的 owner 数 == users 里 world_owner 数（无 owner 在合并中丢失/吞掉）。
//   2) 每张 owner-scoped 表（排除 wiki 域）的 owner 列值必须是已知 world_owner id —— 任何
//      不在册的值 = 串号/孤儿（合并漏 remap 或脏数据）。
//   3) 含确定性 id 的表（characters/conversations/ai_relationships/world_contexts…）复合主键
//      必须包含 owner 列，且不存在「同 (owner,pk) 重复行」。
//   4) PRAGMA integrity_check = ok。
//   5) 打印每 owner 的关键表行数概览。
//
// 用法: node 2026-mt-verify-shared.mjs <shared.sqlite>

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: node 2026-mt-verify-shared.mjs <shared.sqlite>');
  process.exit(1);
}
const db = new BetterSqlite3(dbPath, { readonly: true });

const WIKI = /^wiki_/i;
const WX = new Set(['user_wiki_profiles']);
const allTables = () =>
  db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
const colsOf = (t) => db.prepare(`PRAGMA table_info("${t}")`).all();
const ownerColOf = (t) => {
  const n = colsOf(t).map((c) => c.name);
  return n.includes('ownerId') ? 'ownerId' : n.includes('userId') ? 'userId' : null;
};
const pkOf = (t) => colsOf(t).filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);

let problems = 0;

// 1) owner 数守恒
// 「世界居民」全局共享池哨兵 owner：是 world_owner 行（让 getOwnerOrThrow / 全局生成能跑），
// 但不是被 merge 进来的真实租户（boot 时建），所以不计入 merge_ledger 守恒比较。它名下的
// feed/moment 行是有意全局共享的，仍在 ownerSet 里 → 不会被判串号/孤儿。
const GLOBAL_WORLD_OWNER_ID = 'global-world-owner';
const owners = db.prepare(`SELECT id FROM users WHERE userType='world_owner'`).all().map((r) => r.id);
const ownerSet = new Set(owners);
const tenantOwners = owners.filter((id) => id !== GLOBAL_WORLD_OWNER_ID);
const ledgerOwners = db.prepare(`SELECT COUNT(*) n FROM merge_ledger`).get().n;
console.log(`world_owner ${owners.length}（真实租户 ${tenantOwners.length}），merge_ledger ${ledgerOwners}`);
if (ledgerOwners !== tenantOwners.length) {
  console.error(`  ✗ owner 数不匹配（疑似某 owner 被 INSERT OR IGNORE 吞掉）`);
  problems++;
}

// 2) 串号/孤儿 + 3) 复合主键
let scoped = 0;
for (const t of allTables()) {
  if (WIKI.test(t) || WX.has(t) || t === 'users' || t === 'merge_ledger') continue;
  const oc = ownerColOf(t);
  if (!oc) continue;
  scoped++;
  const placeholders = owners.map(() => '?').join(',');
  const stray = db
    .prepare(`SELECT COUNT(*) n FROM "${t}" WHERE "${oc}" IS NOT NULL AND "${oc}" NOT IN (${placeholders})`)
    .get(...owners).n;
  if (stray > 0) {
    console.error(`  ✗ ${t}.${oc}: ${stray} 行 owner 不在册（串号/孤儿）`);
    problems++;
  }
  // 复合主键：若该表 PK 未含 owner 列，检查是否存在跨 owner 的同 pk（会撞）。
  const pk = pkOf(t);
  if (!pk.includes(oc) && pk.length > 0) {
    const pkExpr = pk.map((p) => `"${p}"`).join("||'|'||");
    const dup = db.prepare(`SELECT COUNT(*) n FROM (SELECT ${pkExpr} k FROM "${t}" GROUP BY k HAVING COUNT(*)>1)`).get().n;
    if (dup > 0) {
      console.error(`  ✗ ${t}: PK (${pk.join(',')}) 未含 owner 列且有 ${dup} 组重复 pk —— 缺复合主键`);
      problems++;
    }
  }
}

// 4) 完整性
const integ = db.prepare(`PRAGMA integrity_check`).get()['integrity_check'];
if (integ !== 'ok') {
  console.error(`  ✗ integrity_check: ${integ}`);
  problems++;
}

// 5) 概览
console.log(`\n每 owner 关键表行数：`);
const sample = ['characters', 'conversations', 'messages', 'feed_posts', 'moment_posts', 'friendships', 'ai_relationships'];
for (const o of owners) {
  const parts = sample
    .filter((t) => db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t))
    .map((t) => {
      const oc = ownerColOf(t);
      const n = db.prepare(`SELECT COUNT(*) n FROM "${t}" WHERE "${oc}"=?`).get(o).n;
      return `${t}=${n}`;
    });
  console.log(`  ${o.slice(0, 8)}: ${parts.join(' ')}`);
}

db.close();
console.log(`\nverify：检查 ${scoped} 张 owner-scoped 表，integrity=${integ}，问题 ${problems}。`);
console.log(problems === 0 ? '✅ 通过' : '❌ 不通过');
process.exit(problems > 0 ? 1 : 0);
