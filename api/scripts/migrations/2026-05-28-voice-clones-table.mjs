#!/usr/bin/env node
// 为「用户声音克隆」建 owner-scoped voice_clones 表。
//
// 为什么需要：shared-world 跑 synchronize:false，新实体 VoiceCloneEntity 直接上新码
// 会 "no such table: voice_clones" 全员崩。必须先跑本幂等迁移建表，再重启 :4100。
// 为什么安全：CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS，重复跑无副作用；
// 不动任何现存表/行。
// 部署顺序：cd api && pnpm build → node api/scripts/migrations/2026-05-28-voice-clones-table.mjs
//   data/shared-world/database.sqlite → 重启 :4100（生产操作，需用户显式授权）。

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error(
    '用法: node 2026-05-28-voice-clones-table.mjs <database.sqlite>',
  );
  process.exit(1);
}

const db = new BetterSqlite3(dbPath);
db.pragma('busy_timeout = 5000');

const statements = [
  `CREATE TABLE IF NOT EXISTS voice_clones (
    id text PRIMARY KEY,
    ownerId text,
    displayName text NOT NULL,
    minimaxVoiceId text,
    status text NOT NULL DEFAULT 'pending',
    sampleFileId text,
    failReason text,
    createdAt datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_voice_clones_owner ON voice_clones (ownerId)`,
];

const tx = db.transaction(() => {
  for (const sql of statements) {
    db.prepare(sql).run();
  }
});
tx();

const exists = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='voice_clones'`,
  )
  .all()
  .map((r) => r.name);
db.close();

console.log(`voice_clones 建表完成，现存：[${exists.join(', ')}]`);
