#!/usr/bin/env node
// 角色技能(skill)真实执行框架：新增两张表 skill_runs + skill_artifact_jobs。
//
// 为什么需要单独脚本（不能靠 synchronize）：shared-world 以 `synchronize:false` 启动
// （app.module.ts），新实体的表不会在 :4100 启动时自动建出——必须在部署新码**之前**手动建表，
// 否则新 dist 一启动，SkillArtifactJobService 的 Cron 第一次轮询就 `no such table` 全崩。
// （wiki / LPP 进程 synchronize:true 会自动建，不需要本脚本。）
//
// 为什么安全：纯新建表（CREATE TABLE IF NOT EXISTS），不碰任何现存表 / 数据，幂等可重复跑。
//
// 🔴 部署顺序（生产操作，需用户显式授权）：
//   1) cd api && pnpm build
//   2) 先对 /tmp 真实库副本跑本脚本验证
//   3) 对 live 库跑：node api/scripts/migrations/2026-05-29-character-skill-tables.mjs data/shared-world/database.sqlite
//   4) 再按 runbook 分步重启 :4100 上新码
//
// 用法: node 2026-05-29-character-skill-tables.mjs <database.sqlite>

import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath || !existsSync(dbPath)) {
  console.error(
    '用法: node 2026-05-29-character-skill-tables.mjs <database.sqlite>',
  );
  process.exit(1);
}

const db = new BetterSqlite3(dbPath);
db.pragma('busy_timeout = 5000');

const statements = [
  `CREATE TABLE IF NOT EXISTS skill_runs (
    id text PRIMARY KEY,
    ownerId text NOT NULL,
    conversationId text NOT NULL,
    characterId text NOT NULL,
    characterSourceKey text NOT NULL,
    skillKey text NOT NULL,
    artifactType text NOT NULL,
    billingActionKey text NOT NULL,
    status text NOT NULL DEFAULT 'awaiting_slots',
    userGoal text NOT NULL,
    slotPayload text NOT NULL DEFAULT '{}',
    missingSlots text NOT NULL DEFAULT '[]',
    outlineSpec text,
    quantity integer,
    quotedPriceCents integer,
    billingIdempotencyKey text NOT NULL,
    sourceMessageId text,
    sourceMessageCreatedAt datetime,
    pendingFollowups integer NOT NULL DEFAULT 0,
    artifactMessageId text,
    errorMessage text,
    createdAt datetime NOT NULL DEFAULT (datetime('now')),
    updatedAt datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_skill_runs_conv_char_status ON skill_runs (conversationId, characterId, status)`,
  `CREATE INDEX IF NOT EXISTS idx_skill_runs_owner_status ON skill_runs (ownerId, status)`,
  `CREATE TABLE IF NOT EXISTS skill_artifact_jobs (
    id text PRIMARY KEY,
    ownerId text,
    skillRunId text NOT NULL,
    conversationId text NOT NULL,
    characterId text NOT NULL,
    characterName text NOT NULL,
    characterAvatar text,
    artifactType text NOT NULL,
    billingActionKey text NOT NULL,
    billingIdempotencyKey text NOT NULL,
    sourceMessageId text,
    sourceMessageCreatedAt datetime,
    status text NOT NULL DEFAULT 'pending',
    executeAfter datetime NOT NULL DEFAULT (datetime('now')),
    inputPayload text NOT NULL DEFAULT '{}',
    artifactMessageId text,
    errorMessage text,
    lastAttemptAt datetime,
    completedAt datetime,
    createdAt datetime NOT NULL DEFAULT (datetime('now')),
    updatedAt datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_skill_artifact_jobs_status_execute_after ON skill_artifact_jobs (status, executeAfter)`,
];

const tx = db.transaction(() => {
  for (const sql of statements) {
    db.prepare(sql).run();
  }
});
tx();

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('skill_runs','skill_artifact_jobs') ORDER BY name`,
  )
  .all()
  .map((r) => r.name);
db.close();

console.log(`character-skill 建表完成，现存表：[${tables.join(', ')}]`);
