#!/usr/bin/env node
// 赛博分身「专属 AI 立绘」：给 cyber_avatar_profiles 加 3 个可空列——
//   portraitImageUrl（立绘相对 URL）、portraitUpdatedAt（最后生成时间）、
//   portraitPrompt（生成所用 prompt，留痕）。
//
// 为什么需要单独脚本（不能靠 synchronize）：shared-world 以 `synchronize:false`
// 启动（迁移产出的复合主键库一旦开 synchronize 会被重建回单 id PK → 串号/卡死）。
// 新加的实体列不会在 :4100 启动时自动建出——必须在部署新码**之前**手动补列，否则新
// dist 一启动 TypeORM 对 cyber_avatar_profiles 的 SELECT 命中不存在的列 → 分身画像
// 读路径全崩（全员故障，同 isPaid / favorite-notes 事故）。
//
// 为什么安全：cyber_avatar_profiles 在 shared 模式是 owner-scoped 复合主键表，但
// SQLite 的 `ALTER TABLE ... ADD COLUMN`（可空、无默认）是纯元数据操作，不重写表、
// 不动主键，大库也瞬时完成。幂等：已存在的列跳过；表不存在则跳过（早期空库）。
//
// 🔴 部署顺序（生产操作，需用户显式授权）：
//   1) cd api && pnpm build
//   2) 先对 /tmp 真实库副本跑本脚本验证
//   3) 对 live 库跑：node api/scripts/migrations/2026-05-29-cyber-avatar-portrait-columns.mjs data/shared-world/database.sqlite
//   4) 再按 runbook 分步重启 :4100 上新码
//   （run-shared-world-migrations.mjs 会自动发现并经 _schema_migrations ledger 跑本脚本）
//
// 用法: node 2026-05-29-cyber-avatar-portrait-columns.mjs <database.sqlite>

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error(
    '用法: node 2026-05-29-cyber-avatar-portrait-columns.mjs <database.sqlite>',
  );
  process.exit(1);
}

const db = new BetterSqlite3(dbPath);
db.pragma('busy_timeout = 5000');

const hasTable = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='cyber_avatar_profiles'`,
  )
  .get();

if (!hasTable) {
  console.log(
    'cyber_avatar_profiles 表尚不存在，跳过（首启 seed 建表后再补列）。',
  );
  db.close();
  process.exit(0);
}

const existing = new Set(
  db
    .prepare(`PRAGMA table_info(cyber_avatar_profiles)`)
    .all()
    .map((r) => r.name),
);

// 列名 → SQLite 类型，全部可空、无默认（null = 未生成立绘）。
const COLUMNS = [
  ['portraitImageUrl', 'text'],
  ['portraitUpdatedAt', 'datetime'],
  ['portraitPrompt', 'text'],
];

const added = [];
const skipped = [];
const tx = db.transaction(() => {
  for (const [name, type] of COLUMNS) {
    if (existing.has(name)) {
      skipped.push(name);
      continue;
    }
    // 列名/类型来自上面写死的常量，非外部输入，拼接安全。
    db.prepare(
      `ALTER TABLE cyber_avatar_profiles ADD COLUMN ${name} ${type}`,
    ).run();
    added.push(name);
  }
});
tx();
db.close();

console.log(
  `cyber_avatar_profiles 分身立绘列迁移完成：新增 ${added.length} 列 [${added.join(', ') || '无'}]，` +
    `已存在跳过 ${skipped.length} 列 [${skipped.join(', ') || '无'}]。`,
);
