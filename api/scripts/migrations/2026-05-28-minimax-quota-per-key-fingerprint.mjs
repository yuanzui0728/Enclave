#!/usr/bin/env node
// MiniMax 配额按 token-plan key 分桶迁移：给 minimax_quota_usage 加 keyFingerprint
// 列，并把唯一索引从 (model, usageDate) 升级为 (model, usageDate, keyFingerprint)。
//
// 背景：shared-world 单进程持有多把 token-plan key（MINIMAX_API_KEYS）。改造前配额/
// 熔断只按 (model, usageDate) 计 → 一把 plan 撞 2056 把整个 model 标 exhausted，另一把
// plan 的剩余额度被一起锁死。分桶后每把 key 独立计量，互不连累。
//
// 为什么需要单独脚本（不能靠 synchronize）：shared-world 以 `synchronize:false` 启动；
// 新列不会在 :4100 启动时自动建出。新 dist 一启动就 SELECT ... keyFingerprint →
// 全员崩。必须在部署新码**之前**先把列+索引补上。
//
// 为什么安全：minimax_quota_usage 在 shared 模式仍是单 id 主键表；ALTER ADD COLUMN
// （带默认 ''）是纯元数据操作，瞬时完成。幂等：列/索引已存在则跳过，回填只动 '' 行。
//
// 存量行回填：历史所有文本流量都跑在单数 MINIMAX_API_KEY（plan A）上，故把存量 ''
// 行回填到那把 key 的 fingerprint（末 4 位），让今日已计数据延续到 A 桶，不重复计。
// 回填 fingerprint 取值优先级：CLI 第 2 参 > 环境变量 MINIMAX_API_KEY 末 4 位 >
// 不回填（留 ''，单桶，仅今日剩余时段轻微少计，安全）。
//
// 🔴 部署顺序（生产操作，需用户显式授权）：
//   1) cd api && pnpm build
//   2) 先对 /tmp 真实库副本跑本脚本验证
//   3) 对 live 库跑：MINIMAX_API_KEY=<...> node api/scripts/migrations/2026-05-28-minimax-quota-per-key-fingerprint.mjs data/shared-world/database.sqlite
//   4) 再按 runbook 分步重启 :4100 上新码
//
// 用法: node 2026-05-28-minimax-quota-per-key-fingerprint.mjs <database.sqlite> [backfillFingerprint]

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error(
    '用法: node 2026-05-28-minimax-quota-per-key-fingerprint.mjs <database.sqlite> [backfillFingerprint]',
  );
  process.exit(1);
}

const TABLE = 'minimax_quota_usage';
const OLD_INDEX = 'uq_minimax_quota_model_date';
const NEW_INDEX = 'uq_minimax_quota_model_date_key';

// 回填 fingerprint：CLI arg > env MINIMAX_API_KEY 末4 > 空（不回填）
const argFp = (process.argv[3] ?? '').trim();
const envKey = (process.env.MINIMAX_API_KEY ?? '').trim();
const backfillFp = argFp || (envKey ? envKey.slice(-4) : '');

const db = new BetterSqlite3(dbPath);
db.pragma('busy_timeout = 5000');

const cols = db.prepare(`PRAGMA table_info(${TABLE})`).all();
if (cols.length === 0) {
  console.error(`❌ ${TABLE} 表不存在 / 为空 schema——库路径是否正确？`);
  db.close();
  process.exit(2);
}
const hasColumn = cols.some((c) => c.name === 'keyFingerprint');

let added = false;
let backfilled = 0;
const tx = db.transaction(() => {
  // 1) 加列
  if (!hasColumn) {
    db.prepare(
      `ALTER TABLE ${TABLE} ADD COLUMN keyFingerprint TEXT NOT NULL DEFAULT ''`,
    ).run();
    added = true;
  }

  // 2) 回填存量 '' 行到承载历史文本的那把 key
  if (backfillFp) {
    const res = db
      .prepare(
        `UPDATE ${TABLE} SET keyFingerprint = ? WHERE keyFingerprint = ''`,
      )
      .run(backfillFp);
    backfilled = res.changes;
  }

  // 3) 换唯一索引：先删旧（含 TypeORM 自动建的同名），再建新（幂等）
  db.prepare(`DROP INDEX IF EXISTS ${OLD_INDEX}`).run();
  db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${NEW_INDEX} ON ${TABLE}(model, usageDate, keyFingerprint)`,
  ).run();
});
tx();

// 校验
const idxNames = db
  .prepare(`PRAGMA index_list(${TABLE})`)
  .all()
  .map((i) => i.name);
db.close();

console.log(
  `minimax_quota_usage per-key 迁移完成：\n` +
    `  - keyFingerprint 列：${added ? '新增' : '已存在(跳过)'}\n` +
    `  - 回填 '' → '${backfillFp || '(未提供，跳过)'}'：${backfilled} 行\n` +
    `  - 旧索引 ${OLD_INDEX}：已 DROP IF EXISTS\n` +
    `  - 新唯一索引 ${NEW_INDEX}：${idxNames.includes(NEW_INDEX) ? '✓ 就位' : '✗ 缺失!'}`,
);
if (!idxNames.includes(NEW_INDEX)) process.exit(3);
