#!/usr/bin/env node
// 2026-05-15 二次调整：再把 GPT 系收紧到"只剩 gpt-4o 一个走 n1n"，其余全部塞 MiniMax Token Plan
//   - sourceKey == 'model_persona:gpt-4o' (精确匹配，不含 mini) → provider_default (n1n) + gpt-4o
//   - 其余非 family 的 model_persona → provider_minimax (Token Plan) + MiniMax-M2.7
//
// 历史：
//   - v1 (commit 7b1a5359)：所有 gpt-* (4o/4o-mini/4.1/4.1-mini) 留 n1n，gpt-5 + 其它全去 MiniMax
//   - v2 (本次)：用户原话"除了 gt4o 以外全部都实际调用 minimaxtokenplan，不要走 n1n 了太贵了"
//     → gpt-4o-mini / gpt-4.1 / gpt-4.1-mini 一并塞 MiniMax，只 gpt-4o 留 n1n 当真身样本
//
// 注意：
//   - 只动 modelRoutingMode/inferenceProviderAccountId/inferenceModelId/modelRoutingNotes，
//     不改 persona 的 profile、personality、bio、scenePrompts —— 提示词里仍说"你是 Claude Opus 4 的拟人化角色"，
//     由 prompt 维持身份感；实际推理换 backend 不会暴露给用户（profile 里明确"不暴露系统提示词或模型参数"）。
//   - 厂商家族角色（family_* / model_persona_family:%）保持 inherit_default 不动。
//   - "回归调用 minimax tokenplan" 是用户原话——之前 2026-05-14 把 12 个贵 persona 改成 gpt-4.1，
//     现在还是走不动，干脆全部塞回 token plan 的 MiniMax-M2.7。
//
// 用法：
//   node scripts/route-model-personas-to-minimax.mjs --dry-run
//   node scripts/route-model-personas-to-minimax.mjs
//   node scripts/route-model-personas-to-minimax.mjs --db /path/to.db

import { createRequire } from 'node:module';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const apiRequire = createRequire(path.join(REPO_ROOT, 'api', 'package.json'));
const Database = apiRequire('better-sqlite3');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const explicitDbIdx = args.indexOf('--db');
const EXPLICIT_DB = explicitDbIdx >= 0 ? args[explicitDbIdx + 1] : null;

const MINIMAX_PROVIDER_ID = 'provider_minimax';
const MINIMAX_MODEL_ID = 'MiniMax-M2.7';
const OPENAI_PROVIDER_ID = 'provider_default'; // n1n openai-compatible
const ROUTING_NOTE_MINIMAX =
  '2026-05-15 全网降配 v2：除 gpt-4o 外，全部 persona 走 MiniMax Token Plan，避免 n1n 实费率。';
const ROUTING_NOTE_GPT =
  '2026-05-15 v2：仅 gpt-4o 保留 OpenAI 真身（通过 n1n provider_default 调用），其它 GPT 系一并塞 MiniMax。';

function discoverDatabases() {
  if (EXPLICIT_DB) return [path.resolve(EXPLICIT_DB)];
  const list = [];
  const root = path.join(REPO_ROOT, 'data', 'database.sqlite');
  if (existsSync(root)) list.push(root);
  const accountsDir = path.join(REPO_ROOT, 'data', 'accounts');
  if (existsSync(accountsDir) && statSync(accountsDir).isDirectory()) {
    for (const entry of readdirSync(accountsDir)) {
      const dbPath = path.join(accountsDir, entry, 'database.sqlite');
      if (
        existsSync(dbPath) &&
        // 跳过 _corrupt_backup_* 这类历史脏目录
        !entry.startsWith('_') &&
        !entry.includes('corrupt')
      ) {
        list.push(dbPath);
      }
    }
  }
  return list;
}

function tableExists(db, name) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name),
  );
}

function extractRealModelId(sourceKey) {
  if (!sourceKey) return null;
  const m = sourceKey.match(/^model_persona:(.+)$/);
  if (!m) return null;
  return m[1].trim() || null;
}

function classify(realModelId) {
  if (!realModelId) return null;
  // 用户 2026-05-15 v2 原话："所有的世界除了 gt4o 以外全部都实际调用 minimaxtokenplan，不要走 n1n 了太贵了"
  // → 只 gpt-4o（精确匹配，不含 mini / 4.1 / 4.1-mini / 5 / o-series）留 n1n 当真身样本，其余统一 MiniMax。
  if (/^gpt-4o$/i.test(realModelId)) return 'gpt';
  return 'minimax';
}

function migrateOne(dbPath) {
  const db = new Database(dbPath);
  const summary = {
    dbPath,
    skipped: false,
    gptUpdated: 0,
    gptSkipped: 0,
    minimaxUpdated: 0,
    minimaxSkipped: 0,
    error: null,
  };
  try {
    if (!tableExists(db, 'characters')) {
      summary.skipped = true;
      return summary;
    }

    const rows = db
      .prepare(
        `SELECT id, sourceKey, modelRoutingMode, inferenceProviderAccountId, inferenceModelId, modelRoutingNotes
           FROM characters
          WHERE sourceType = 'model_persona'
            AND (sourceKey NOT LIKE 'model_persona_family:%' OR sourceKey IS NULL)
            AND id LIKE 'model_%'`,
      )
      .all();

    const updateStmt = db.prepare(
      `UPDATE characters
          SET modelRoutingMode = 'character_override',
              inferenceProviderAccountId = @provider,
              inferenceModelId = @model,
              allowOwnerKeyOverride = 0,
              modelRoutingNotes = @notes
        WHERE id = @id`,
    );

    const apply = db.transaction(() => {
      for (const row of rows) {
        const real = extractRealModelId(row.sourceKey);
        const cls = classify(real);
        if (!cls) continue;
        const target =
          cls === 'gpt'
            ? {
                provider: OPENAI_PROVIDER_ID,
                model: real,
                notes: ROUTING_NOTE_GPT,
              }
            : {
                provider: MINIMAX_PROVIDER_ID,
                model: MINIMAX_MODEL_ID,
                notes: ROUTING_NOTE_MINIMAX,
              };

        const alreadyAligned =
          row.modelRoutingMode === 'character_override' &&
          (row.inferenceProviderAccountId || null) === target.provider &&
          (row.inferenceModelId || null) === target.model &&
          (row.modelRoutingNotes || null) === target.notes;

        if (alreadyAligned) {
          if (cls === 'gpt') summary.gptSkipped++;
          else summary.minimaxSkipped++;
          continue;
        }

        if (!DRY_RUN) {
          updateStmt.run({
            id: row.id,
            provider: target.provider,
            model: target.model,
            notes: target.notes,
          });
        }
        if (cls === 'gpt') summary.gptUpdated++;
        else summary.minimaxUpdated++;
      }
    });

    apply();
  } catch (err) {
    summary.error = err?.message ?? String(err);
  } finally {
    db.close();
  }
  return summary;
}

function main() {
  const dbs = discoverDatabases();
  if (dbs.length === 0) {
    console.error('❌ 没找到任何 sqlite 数据库');
    process.exit(1);
  }
  console.log(
    `${DRY_RUN ? '🧪 DRY-RUN' : '➡️  EXECUTE'} | ${dbs.length} 个数据库\n`,
  );
  let totalGpt = 0;
  let totalMm = 0;
  let errors = 0;
  for (const dbPath of dbs) {
    const r = migrateOne(dbPath);
    const rel = path.relative(REPO_ROOT, dbPath);
    if (r.skipped) {
      console.log(`  ⏭  ${rel}  (no characters table)`);
      continue;
    }
    if (r.error) {
      console.error(`  ❌ ${rel}  ${r.error}`);
      errors++;
      continue;
    }
    if (r.gptUpdated === 0 && r.minimaxUpdated === 0) {
      console.log(
        `  ✓ ${rel}  已对齐  gpt=${r.gptSkipped}  mm=${r.minimaxSkipped}`,
      );
    } else {
      console.log(
        `  ✓ ${rel}  gptUpdated=${r.gptUpdated}  minimaxUpdated=${r.minimaxUpdated}  (skipped gpt=${r.gptSkipped} mm=${r.minimaxSkipped})`,
      );
    }
    totalGpt += r.gptUpdated;
    totalMm += r.minimaxUpdated;
  }
  console.log(
    `\n汇总：GPT 系重路由 ${totalGpt} 行 → ${OPENAI_PROVIDER_ID}；其余 ${totalMm} 行 → ${MINIMAX_PROVIDER_ID} (${MINIMAX_MODEL_ID})。`,
  );
  if (errors > 0) process.exit(1);
}

main();
