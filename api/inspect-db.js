const Database = require('better-sqlite3');
const path = require('node:path');

function main() {
  const dbPath = process.env.DATABASE_PATH
    ? path.isAbsolute(process.env.DATABASE_PATH)
      ? process.env.DATABASE_PATH
      : path.resolve(__dirname, '..', process.env.DATABASE_PATH)
    : path.resolve(__dirname, '..', 'data', 'database.sqlite');
  const db = new Database(dbPath);

  function tableExists(name) {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(name);
    return !!row;
  }

  const targetTables = [
    'users',
    'characters',
    'conversations',
    'messages',
  ];

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all();
  console.log('Database path:', dbPath);
  console.log('All tables:', tables.map((t) => t.name));

  for (const name of targetTables) {
    if (!tableExists(name)) {
      console.log(`\nTable ${name} does NOT exist`);
      continue;
    }
    const rows = db.prepare(`SELECT * FROM ${name} LIMIT 20`).all();
    console.log(`\n=== ${name} (first ${rows.length} rows) ===`);
    console.dir(rows, { depth: null });
  }

  db.close();
}

main();
