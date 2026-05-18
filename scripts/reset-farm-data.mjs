#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FARM_TABLES = ['farm_event_logs', 'farm_npc_states', 'farm_player_states'];

function listSqliteFiles() {
  const candidates = [];
  const dataDb = join(REPO_ROOT, 'data', 'database.sqlite');
  if (existsSync(dataDb)) candidates.push(dataDb);

  const accountsDir = join(REPO_ROOT, 'data', 'accounts');
  if (existsSync(accountsDir)) {
    for (const entry of readdirSync(accountsDir)) {
      const sub = join(accountsDir, entry);
      try {
        if (statSync(sub).isDirectory()) {
          const db = join(sub, 'database.sqlite');
          if (existsSync(db)) candidates.push(db);
        }
      } catch {}
    }
  }
  return candidates;
}

function sql(dbPath, statement) {
  return execFileSync('sqlite3', [dbPath, statement], { encoding: 'utf8' }).trim();
}

function hasFarmTables(dbPath) {
  const rows = sql(
    dbPath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'farm_%';",
  )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return FARM_TABLES.every((t) => rows.includes(t));
}

function resetOne(dbPath) {
  if (!hasFarmTables(dbPath)) return { dbPath, skipped: true, before: 0 };
  const before = Number(sql(dbPath, 'SELECT COUNT(*) FROM farm_player_states;')) || 0;
  const stmt = FARM_TABLES.map((t) => `DELETE FROM ${t};`).join(' ');
  sql(dbPath, `BEGIN; ${stmt} COMMIT;`);
  const after = Number(sql(dbPath, 'SELECT COUNT(*) FROM farm_player_states;')) || 0;
  return { dbPath, skipped: false, before, after };
}

function main() {
  const dbs = listSqliteFiles();
  console.log(`[reset-farm-data] scanning ${dbs.length} sqlite files`);
  let totalCleared = 0;
  let touched = 0;
  for (const db of dbs) {
    try {
      const r = resetOne(db);
      if (r.skipped) {
        console.log(`  - skip (no farm tables): ${db}`);
        continue;
      }
      touched += 1;
      totalCleared += r.before;
      console.log(`  - cleared ${r.before} player rows in ${db} (after=${r.after})`);
    } catch (err) {
      console.error(`  ! failed on ${db}:`, err.message);
    }
  }
  console.log(
    `[reset-farm-data] done. touched=${touched} dbs, cleared=${totalCleared} player rows total`,
  );
}

main();
