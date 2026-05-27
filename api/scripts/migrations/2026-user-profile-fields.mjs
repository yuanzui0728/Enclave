#!/usr/bin/env node
// 个人资料字段迁移：给共享 world 库的 users 表加性补 7 个可空列（gender/age/occupation/
// region/interests/aiAddressTone/avoidTopics），供「个人资料」录入 + 注入 AI prompt。
//
// 为什么需要单独脚本（不能靠 synchronize）：shared-world 以 `synchronize:false` 启动
// （app.module.ts：迁移产出的复合主键库一旦开 synchronize 会被重建回单 id PK → 串号/卡死）。
// 所以新加的实体列不会在 :4100 启动时自动建出——必须在部署新码**之前**手动把列补上，
// 否则新 dist 一启动，getOwnerOrThrow 的 SELECT * FROM users 命中不存在的列 → 每个请求
// 的 owner 查询全崩（全员故障）。
//
// 为什么安全：users 表在 shared 模式仍是单 id 主键（不是 owner-scoped 复合主键表），
// 且 SQLite 的 `ALTER TABLE ... ADD COLUMN`（可空、无默认）是纯元数据操作，不重写表，
// 1.8GB 库也是瞬时完成。幂等：已存在的列跳过。
//
// 🔴 部署顺序（生产操作，需用户显式授权）：
//   1) cd api && pnpm build
//   2) 先对 /tmp 真实库副本跑本脚本验证
//   3) 对 live 库跑：node api/scripts/migrations/2026-user-profile-fields.mjs data/shared-world/database.sqlite
//   4) 再按 runbook 分步重启 :4100 上新码
//
// 用法: node 2026-user-profile-fields.mjs <database.sqlite>

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: node 2026-user-profile-fields.mjs <database.sqlite>');
  process.exit(1);
}

// 列名 → SQLite 类型。与 UserEntity 的列声明一致（age 是 int，其余 text）。
const COLUMNS = [
  ['gender', 'text'],
  ['age', 'integer'],
  ['occupation', 'text'],
  ['region', 'text'],
  ['interests', 'text'],
  ['aiAddressTone', 'text'],
  ['avoidTopics', 'text'],
];

const db = new BetterSqlite3(dbPath);
db.pragma('busy_timeout = 5000');

const existing = new Set(
  db.prepare('PRAGMA table_info(users)').all().map((c) => c.name),
);
if (existing.size === 0) {
  console.error('❌ users 表不存在 / 为空 schema——库路径是否正确？');
  db.close();
  process.exit(2);
}

const added = [];
const skipped = [];
const tx = db.transaction(() => {
  for (const [name, type] of COLUMNS) {
    if (existing.has(name)) {
      skipped.push(name);
      continue;
    }
    // 列名/类型来自上面写死的常量，非外部输入，拼接安全。
    db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${type}`).run();
    added.push(name);
  }
});
tx();
db.close();

console.log(
  `users 个人资料列迁移完成：新增 ${added.length} 列 [${added.join(', ') || '无'}]，` +
    `已存在跳过 ${skipped.length} 列 [${skipped.join(', ') || '无'}]。`,
);
