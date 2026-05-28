#!/usr/bin/env node
// 共享 world (:4100) 启动前的幂等 schema 迁移 runner。
//
// 背景 / 为什么需要：shared-world 以 `synchronize:false` 启动（复合主键库一旦开
// synchronize 会被重建回单 id PK → 串号/卡死，见 app.module.ts）。所以新加的实体列 /
// 表**不会**在 boot 时自动建出——必须先跑手写迁移补 schema、再起新 dist。否则新码一上线
// 就 `no such column: ...` 全员故障。
//   🔴 2026-05-28 isPaid 事故就是这么来的：restart-all.sh 只 `pnpm build`+重启 :4100，
//      没跑 2026-05-28-character-paid-unlock 迁移 → characters 缺 isPaid 列 →
//      `GET /api/conversations` 全员 500 →「消息页暂时不可用」。本 runner 就是堵这个洞。
//
// 机制：
//   - 扫 api/scripts/migrations/*.mjs，按文件名排序。
//   - **排除 `2026-mt-*`**：那是多租户 cutover 的一次性脚本（step0..3 / prep / verify /
//     survey），重跑会毁库（prep 用 synchronize 会把复合主键表重建回单 id PK）。
//   - 用 DB 内 `_schema_migrations` ledger 记录已应用的文件名，跳过已跑过的。
//   - 其余迁移都遵循统一约定：`node <script> <dbPath>`，better-sqlite3 直连（无需 dist），
//     幂等加性（CREATE TABLE IF NOT EXISTS / ADD COLUMN if-missing）。即便 ledger 丢了，
//     重跑也安全。
//
// 任一迁移失败 → 本 runner 以非 0 退出，调用方（restart-shared-world.sh）据此**中止重启**，
// 绝不拿半迁移的 schema 起新码。
//
// 用法: node run-shared-world-migrations.mjs <database.sqlite>

import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, 'migrations');

const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: node run-shared-world-migrations.mjs <database.sqlite>');
  process.exit(1);
}

// 一次性 cutover 脚本前缀：绝不自动重跑。
const EXCLUDE_PREFIX = '2026-mt-';

const scripts = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.mjs'))
  .filter((f) => !f.startsWith(EXCLUDE_PREFIX))
  .sort();

const db = new BetterSqlite3(dbPath);
db.pragma('busy_timeout = 10000');
db.prepare(
  `CREATE TABLE IF NOT EXISTS _schema_migrations (
     name TEXT PRIMARY KEY,
     applied_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
).run();
const applied = new Set(
  db.prepare('SELECT name FROM _schema_migrations').all().map((r) => r.name),
);
db.close(); // 让出连接，子进程迁移自己开库写。

const pending = scripts.filter((f) => !applied.has(f));
if (pending.length === 0) {
  console.log(`[migrate] 无待应用迁移（已应用 ${applied.size} 个，跳过 ${EXCLUDE_PREFIX}* cutover）。`);
  process.exit(0);
}

console.log(`[migrate] 待应用 ${pending.length} 个迁移: ${pending.join(', ')}`);
const ran = [];
for (const file of pending) {
  const scriptPath = resolve(migrationsDir, file);
  console.log(`\n[migrate] ▶ ${file}`);
  const result = spawnSync('node', [scriptPath, dbPath], {
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`\n[migrate] ❌ ${file} 失败（exit ${result.status}）——中止，不再继续。`);
    process.exit(result.status ?? 1);
  }
  // 成功才记账（短开短关，避免与子进程争锁）。
  const ledger = new BetterSqlite3(dbPath);
  ledger.pragma('busy_timeout = 10000');
  ledger.prepare(
    `CREATE TABLE IF NOT EXISTS _schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  ).run();
  ledger.prepare('INSERT OR IGNORE INTO _schema_migrations (name) VALUES (?)').run(file);
  ledger.close();
  ran.push(file);
}

console.log(`\n[migrate] ✅ 应用完成 ${ran.length} 个: ${ran.join(', ')}`);
