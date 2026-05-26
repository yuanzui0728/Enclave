#!/usr/bin/env node
// 共享 world 多租户迁移 prep（**最先跑**，在 step0 之前）：把源账号库的 schema 加性补齐到
// 当前实体定义——建出缺的表、加上缺的列。这样后续 step2 union 出的共享库自带所有当前列，
// shared-world 以 synchronize:false 启动时才不会因缺列/缺表崩（实测 boot 曾崩
// `no such column: CharacterEntity.defaultVoiceReply`）。
//
// 为什么需要：部分账号库 schema 落后于当前实体（其 LPP world child 没用最新码重启过
// synchronize 自愈）。实测 17328883137 只有 79 表/35 char 列，live 91173587559732 有
// 92 表/38 列。LPP 靠 synchronize:true 每次 boot 加性自愈；shared 关了 synchronize，
// 所以必须在迁移期把每个源库一次性补到当前 schema。
//
// 机制：用一个独立 TypeORM DataSource（synchronize:true）扫 `dist/**/*.entity.js` glob 跑一次
// 同步。glob 会顺带建出 wiki 等非 world 表（空表，step1b 跳过 / step2 当全局，无害）。**只做
// 加性**：源库此时仍是单列主键（== 实体声明的单 id PK），synchronize 只会 ALTER ADD COLUMN /
// CREATE TABLE，不重建已有表、不动主键。
//
// 🔴 顺序硬约束：**必须在 step1b（建复合主键）之前跑**。若在 step1b 之后跑，synchronize 会
//   发现实体单 id PK 与库内复合主键 (ownerId,id) 不一致 → 把表重建回单 id PK，毁掉 step1b。
//   本脚本启动即校验 characters 仍是单 id PK，否则拒绝运行。
// 前置：先 `cd api && pnpm build`（要有 dist 实体）。**先对 /tmp 副本跑**。
//
// 用法: node 2026-mt-prep-schema-catchup.mjs <database.sqlite>
//   完整管线：copy → **prep(本脚本)** → step0 → step1 → step1b → step2 → verify

import { DataSource } from 'typeorm';
import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: node 2026-mt-prep-schema-catchup.mjs <database.sqlite>');
  process.exit(1);
}
const distGlob = resolve(__dirname, '../../dist/**/*.entity.js');
if (!existsSync(resolve(__dirname, '../../dist'))) {
  console.error('缺 dist/——先 `cd api && pnpm build`。');
  process.exit(1);
}

// 计数 + 安全校验（同步前）。
function snapshot(path) {
  const db = new BetterSqlite3(path, { readonly: true });
  const tables = db.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).get().n;
  const charCols = db.prepare(`PRAGMA table_info(characters)`).all();
  const charPk = charCols.filter((c) => c.pk > 0).map((c) => c.name);
  db.close();
  return { tables, charColCount: charCols.length, charPk };
}

const before = snapshot(dbPath);
// 🔴 硬门禁：catch-up 只能在 step1b 之前（单 id PK）跑，否则 synchronize 会拆掉复合主键。
if (!(before.charPk.length === 1 && before.charPk[0] === 'id')) {
  console.error(
    `❌ characters 主键为 (${before.charPk.join(',')})，疑似已过 step1b。\n` +
      `   schema catch-up 必须在 step1b 之前跑（否则 synchronize 会把复合主键重建回单 id PK，毁掉迁移）。`,
  );
  process.exit(2);
}
console.log(`catch-up 前：${before.tables} 表，characters ${before.charColCount} 列，PK=(${before.charPk.join(',')})`);

// 🔴 防御：实体（tenant-entity.ts applyOwnerIdColumn）在 import 期按 MAIN_MODE 决定主键
// 形状。prep 必须以「单 id 主键」实体跑 synchronize（只加性补列/补表）。若环境里残留了
// MAIN_MODE=shared-world，dist 实体会声明复合主键，synchronize 会尝试把单 id 库重建成
// 复合 → 毁迁移。这里在 glob 加载实体前清掉它（下方还有 after.charPk 双保险）。
delete process.env.MAIN_MODE;

const ds = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  entities: [distGlob],
  synchronize: true,
  logging: ['error', 'warn'],
});

const t0 = Date.now();
await ds.initialize();
await ds.destroy();

const after = snapshot(dbPath);
// 同步后再校验主键没被动（理论上不会，单 id == 单 id；双保险）。
if (!(after.charPk.length === 1 && after.charPk[0] === 'id')) {
  console.error(`❌ catch-up 后 characters PK 变成 (${after.charPk.join(',')})——异常，请检查。`);
  process.exit(3);
}
console.log(
  `catch-up 后：${after.tables} 表（+${after.tables - before.tables}），characters ${after.charColCount} 列` +
    `（+${after.charColCount - before.charColCount}），PK 未变。`,
);
console.log(`\nprep schema catch-up 完成 ${Date.now() - t0}ms。下一步：step0。`);
