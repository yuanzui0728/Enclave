#!/usr/bin/env node
/**
 * cleanup-parasitic-wiki-tables.mjs
 *
 * 在 wiki 拆库（独立 wiki-api + data/wiki/wiki.sqlite）之后，把寄生在普通账户
 * world child sqlite 里的 wiki_* / character_pages / character_revisions / user_wiki_profiles
 * 表和 userType='wiki_member' 的脏行清理掉。
 *
 * 例：2026-05-20 真人用户 zozayaknore984@gmail.com (account 91696053125626) 注册之后，
 *   他的 world child sqlite 里被 typeorm synchronize 自动建出了 4 行 wiki_field_protections
 *   + 5 行 wiki_abuse_filters 模板，还有一个寄生的 yuanzui0728_821c wiki_member 用户。
 *   这些都应该删掉，因为这个账户不是 wiki host。
 *
 * 不动 91173587559732 的库（保留作为迁移源备份；上线后人工/未来另写脚本清理）。
 *
 * 调用：
 *   node scripts/cleanup-parasitic-wiki-tables.mjs [--dry-run]
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const apiRequire = createRequire(path.join(REPO_ROOT, 'api', 'package.json'));
const Database = apiRequire('better-sqlite3');
const ACCOUNTS_DIR = path.join(REPO_ROOT, 'data/accounts');
const WIKI_HOST_ACCOUNT = '91173587559732';

const DRY_RUN = process.argv.includes('--dry-run');

// 要 DROP 的寄生表（typeorm sync 会重建它们，但 AppModule 已不含这些 entity 了，
// 拆库后 chat 侧重启不会再 recreate）
const PARASITIC_TABLES = [
  'wiki_edit_submissions',
  'wiki_protection_logs',
  'wiki_field_protections',
  'wiki_blocks',
  'wiki_abuse_filters',
  'wiki_abuse_filter_hits',
  'wiki_watchlist',
  'wiki_talk_threads',
  'wiki_talk_posts',
  'user_wiki_profiles',
  'character_pages',
  'character_revisions',
  // character_drafts 不在此清单：chat 侧的 character draft 也用同名表（虽然语义不同）。
  //   为安全起见保留；该表本身没有 wiki 用户脏数据。
  // character_blueprints / character_blueprint_revisions：chat 侧 character 也用这两张表，
  //   不能 DROP。脏行(orphan blueprint refs)不影响 chat 业务。
];

const log = (...args) => console.log('[cleanup-wiki]', ...args);

function tableExists(db, name) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name),
  );
}

function processAccount(accountId, dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  const db = DRY_RUN
    ? new Database(dbPath, { readonly: true })
    : new Database(dbPath);
  if (!DRY_RUN) db.pragma('busy_timeout = 5000');

  const summary = {
    accountId,
    droppedTables: [],
    deletedWikiUsers: 0,
  };

  for (const t of PARASITIC_TABLES) {
    if (tableExists(db, t)) {
      const c = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
      if (DRY_RUN) {
        log(`  ${accountId}/${t}: would DROP (${c} rows)`);
      } else {
        db.exec(`DROP TABLE ${t}`);
        log(`  ${accountId}/${t}: DROPPED (${c} rows)`);
      }
      summary.droppedTables.push({ name: t, rows: c });
    }
  }

  if (tableExists(db, 'users')) {
    const wikiUsers = db
      .prepare(
        "SELECT id, username FROM users WHERE userType = 'wiki_member' OR userType = 'system' AND username LIKE '\\_\\_system\\_wiki%' ESCAPE '\\'",
      )
      .all();
    if (wikiUsers.length > 0) {
      if (DRY_RUN) {
        log(
          `  ${accountId}/users: would DELETE ${wikiUsers.length} wiki-related users: ${wikiUsers.map((u) => u.username).join(', ')}`,
        );
      } else {
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        const tx = db.transaction((ids) => {
          for (const id of ids) stmt.run(id);
        });
        tx(wikiUsers.map((u) => u.id));
        log(
          `  ${accountId}/users: DELETED ${wikiUsers.length} wiki-related users: ${wikiUsers.map((u) => u.username).join(', ')}`,
        );
      }
      summary.deletedWikiUsers = wikiUsers.length;
    }
  }

  db.close();
  return summary;
}

async function main() {
  log(`mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);

  const dirs = fs.readdirSync(ACCOUNTS_DIR);
  let processedAccounts = 0;
  let totalTablesDropped = 0;
  let totalUsersDeleted = 0;
  const accountsTouched = [];

  for (const accountId of dirs) {
    if (accountId === WIKI_HOST_ACCOUNT) {
      log(`SKIP ${accountId} (wiki host — leave intact)`);
      continue;
    }
    const dbPath = path.join(ACCOUNTS_DIR, accountId, 'database.sqlite');
    if (!fs.existsSync(dbPath)) continue;
    processedAccounts += 1;
    const s = processAccount(accountId, dbPath);
    if (!s) continue;
    if (s.droppedTables.length || s.deletedWikiUsers) {
      accountsTouched.push(s);
      totalTablesDropped += s.droppedTables.length;
      totalUsersDeleted += s.deletedWikiUsers;
    }
  }

  log('---');
  log(`扫描 ${processedAccounts} 个非 wiki host 账户库；${accountsTouched.length} 个有寄生数据。`);
  log(`共 DROP ${totalTablesDropped} 张表，DELETE ${totalUsersDeleted} 个 wiki 脏用户。`);
  if (DRY_RUN) {
    log('注意：本次为 dry-run，未实际写盘。去掉 --dry-run 跑真正清理。');
  }
}

main().catch((err) => {
  console.error('[cleanup-wiki] FATAL:', err);
  process.exit(1);
});
