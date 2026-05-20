#!/usr/bin/env node
/**
 * migrate-wiki-to-standalone.mjs
 *
 * 把寄生在 91173587559732/database.sqlite 里的 wiki 数据搬到独立的 data/wiki/wiki.sqlite。
 *
 * 迁移内容：
 *   - 4 个 wiki_member 用户 + 2 个 system bot 用户 → users
 *   - user_wiki_profiles 全量（3 行）
 *   - characters 表里被 character_pages 引用的子集（77 行）
 *   - character_blueprints / character_blueprint_revisions（按 character.id 过滤掉 orphan）
 *   - character_pages / character_revisions / character_drafts 全量
 *   - wiki_* 表（edit_submissions / protection_logs / field_protections / blocks /
 *     abuse_filters / abuse_filter_hits / watchlist / talk_threads / talk_posts）全量
 *   - moderation_reports 中 entityKind 含 'wiki' 的子集
 *   - data/accounts/91173587559732/wiki-avatars/ → data/wiki/wiki-avatars/ 文件拷贝
 *
 * 调用：
 *   node scripts/migrate-wiki-to-standalone.mjs [--dry-run]
 *
 * 幂等性：脚本是"重置式"迁移——目标 wiki sqlite 中相关表会先 DROP 再重建并 INSERT。
 * 多次跑结果一致（前提是源库快照不变）。脚本不动源库。
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const apiRequire = createRequire(path.join(REPO_ROOT, 'api', 'package.json'));
const Database = apiRequire('better-sqlite3');
const SRC_DB = path.join(REPO_ROOT, 'data/accounts/91173587559732/database.sqlite');
const DST_DB = path.join(REPO_ROOT, 'data/wiki/wiki.sqlite');
const AVATAR_SRC = path.join(REPO_ROOT, 'data/accounts/91173587559732/wiki-avatars');
const AVATAR_DST = path.join(REPO_ROOT, 'data/wiki/wiki-avatars');

const DRY_RUN = process.argv.includes('--dry-run');

const FULL_TABLES = [
  'user_wiki_profiles',
  'character_pages',
  'character_revisions',
  'character_drafts',
  'wiki_edit_submissions',
  'wiki_protection_logs',
  'wiki_field_protections',
  'wiki_blocks',
  'wiki_abuse_filters',
  'wiki_abuse_filter_hits',
  'wiki_watchlist',
  'wiki_talk_threads',
  'wiki_talk_posts',
];

const FILTERED_TABLES = [
  {
    name: 'users',
    // 4 wiki_member + 2 system bot
    where: "userType = 'wiki_member' OR username LIKE '\\_\\_system\\_%' ESCAPE '\\'",
  },
  {
    name: 'characters',
    where: 'id IN (SELECT characterId FROM character_pages)',
  },
  {
    name: 'character_blueprints',
    where: 'characterId IN (SELECT characterId FROM character_pages)',
  },
  {
    name: 'character_blueprint_revisions',
    where:
      'blueprintId IN (SELECT id FROM character_blueprints WHERE characterId IN (SELECT characterId FROM character_pages))',
  },
  {
    name: 'moderation_reports',
    // wiki report 走的是这张共享表，按 targetType 中含 wiki 关键字筛
    where:
      "targetType LIKE 'wiki%' OR targetType LIKE '%revision%' OR targetType LIKE '%talk%' OR targetType LIKE 'character_%'",
  },
];

const log = (...args) => console.log('[migrate-wiki]', ...args);

function tableExists(db, name) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name),
  );
}

function getCreateTableSql(db, name) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return row?.sql;
}

function getIndexSqls(db, tableName) {
  return db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL",
    )
    .all(tableName)
    .map((r) => r.sql);
}

function migrateTable(src, dst, name, where) {
  if (!tableExists(src, name)) {
    log(`SKIP ${name} (not in source DB)`);
    return { rows: 0, skipped: true };
  }
  const srcCount = src.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get().c;
  const filteredCount = src
    .prepare(`SELECT COUNT(*) AS c FROM ${name} WHERE ${where}`)
    .get().c;

  if (DRY_RUN) {
    log(`DRY ${name}: src=${srcCount}, would-migrate=${filteredCount} (WHERE ${where})`);
    return { rows: filteredCount, skipped: false };
  }

  const createSql = getCreateTableSql(src, name);
  dst.exec(`DROP TABLE IF EXISTS ${name}`);
  dst.exec(createSql);
  for (const idxSql of getIndexSqls(src, name)) {
    try {
      dst.exec(idxSql);
    } catch (err) {
      // 索引名冲突等 → 容忍
      log(`  index recreate warn (${name}): ${err.message}`);
    }
  }

  if (filteredCount === 0) {
    log(`${name}: 0 rows migrated (table schema created)`);
    return { rows: 0, skipped: false };
  }

  const rows = src.prepare(`SELECT * FROM ${name} WHERE ${where}`).all();
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => '?').join(',');
  const insertStmt = dst.prepare(
    `INSERT INTO ${name} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`,
  );
  const tx = dst.transaction((rs) => {
    for (const r of rs) {
      const vals = cols.map((c) => {
        const v = r[c];
        // sqlite 不接受 boolean / Date 直接写，确保字符串/数字
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v instanceof Date) return v.toISOString();
        return v;
      });
      insertStmt.run(vals);
    }
  });
  tx(rows);
  log(`${name}: migrated ${rows.length} rows (src had ${srcCount})`);
  return { rows: rows.length, skipped: false };
}

function copyAvatars() {
  if (!fs.existsSync(AVATAR_SRC)) {
    log(`avatar src not found: ${AVATAR_SRC} → skip`);
    return 0;
  }
  if (DRY_RUN) {
    const files = fs.readdirSync(AVATAR_SRC);
    log(`DRY avatars: would copy ${files.length} files from ${AVATAR_SRC} to ${AVATAR_DST}`);
    return files.length;
  }
  fs.mkdirSync(AVATAR_DST, { recursive: true });
  let copied = 0;
  for (const f of fs.readdirSync(AVATAR_SRC)) {
    const srcPath = path.join(AVATAR_SRC, f);
    const dstPath = path.join(AVATAR_DST, f);
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, dstPath);
      copied += 1;
    }
  }
  log(`avatars: copied ${copied} files → ${AVATAR_DST}`);
  return copied;
}

async function main() {
  log(`mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);
  log(`source DB: ${SRC_DB}`);
  log(`target DB: ${DST_DB}`);

  if (!fs.existsSync(SRC_DB)) {
    console.error(`Source DB not found: ${SRC_DB}`);
    process.exit(1);
  }

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(DST_DB), { recursive: true });
  }

  const src = new Database(SRC_DB, { readonly: true });
  const dst = DRY_RUN
    ? new Database(':memory:')
    : new Database(DST_DB);

  if (!DRY_RUN) {
    dst.pragma('journal_mode = WAL');
    dst.pragma('synchronous = NORMAL');
    dst.pragma('busy_timeout = 5000');
  }

  let totalRows = 0;
  let totalTables = 0;

  // 顺序：先 users / characters / blueprint 这些被外键软引用的"主"表
  for (const spec of FILTERED_TABLES) {
    const r = migrateTable(src, dst, spec.name, spec.where);
    if (!r.skipped) {
      totalTables += 1;
      totalRows += r.rows;
    }
  }

  for (const name of FULL_TABLES) {
    const r = migrateTable(src, dst, name, '1=1');
    if (!r.skipped) {
      totalTables += 1;
      totalRows += r.rows;
    }
  }

  const avatarCount = copyAvatars();

  src.close();
  if (!DRY_RUN) dst.close();

  log('---');
  log(`完成：迁移了 ${totalTables} 张表，共 ${totalRows} 行数据；${avatarCount} 个头像文件。`);
  log(`目标 DB: ${DST_DB}`);
  if (DRY_RUN) {
    log('注意：本次为 dry-run，未实际写盘。去掉 --dry-run 跑真正迁移。');
  } else {
    log('下一步：启动 wiki-api 让 TypeORM synchronize 补建剩余 chat-side 空表 + 跑 system-users seed。');
  }
}

main().catch((err) => {
  console.error('[migrate-wiki] FATAL:', err);
  process.exit(1);
});
