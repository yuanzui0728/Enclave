#!/usr/bin/env node
// 修复每个 world DB 里 provider_minimax 的 apiKey：
//   - 旧状态：所有 world 都被灌的是 process.env.MINIMAX_API_KEY（单 key 兜底），
//     导致 cloud-api 那边的"按 worldId hash 派 key"在文本生成链路上完全没生效。
//   - 修复：按 cloud-api/src/orchestration/minimax-key-pool.ts 的 hash 算法
//     给每个 world 算一遍 assigned key，再把 inference_provider_accounts 里
//     apiKeyEncrypted / ttsApiKeyEncrypted / imageGenerationApiKeyEncrypted
//     三列改写成 enc:<encrypted>（顺手把 plain: 换成 GCM 加密格式）。
//
// 用法：
//   node scripts/fix-minimax-provider-key.mjs --dry-run
//   node scripts/fix-minimax-provider-key.mjs
//
// 环境变量（必填，从 .env / api/.env 自动加载，不需要 export）：
//   MINIMAX_API_KEYS                — 逗号分隔的 token plan key 池
//   MINIMAX_API_KEY                 — 单 key 兜底（池为空时回落）
//   USER_API_KEY_ENCRYPTION_SECRET  — 用来生成 enc:<envelope>

import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const apiRequire = createRequire(path.join(REPO_ROOT, 'api', 'package.json'));
const Database = apiRequire('better-sqlite3');

function loadDotenv(filePath) {
  if (!existsSync(filePath)) return;
  const txt = readFileSync(filePath, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k] !== undefined && process.env[k] !== '') continue;
    let v = vRaw;
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadDotenv(path.join(REPO_ROOT, '.env'));
loadDotenv(path.join(REPO_ROOT, 'api', '.env'));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');

const PROVIDER_ID = 'provider_minimax';

// ——— 加载 key 池（与 apps/cloud-api/src/orchestration/minimax-key-pool.ts 对齐） ———
function parsePool(rawKeys, rawSingle) {
  const fromCsv = (rawKeys ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (fromCsv.length > 0) return fromCsv;
  const single = (rawSingle ?? '').trim();
  return single ? [single] : [];
}

function pickKey(worldId, pool) {
  if (pool.length === 0) return null;
  const digest = createHash('sha1').update(worldId).digest();
  const h = digest.readUInt32BE(0);
  const idx = h % pool.length;
  return { key: pool[idx], index: idx + 1, total: pool.length, fingerprint: pool[idx].slice(-4) };
}

const POOL = parsePool(
  process.env.MINIMAX_API_KEYS,
  process.env.MINIMAX_API_KEY,
);
if (POOL.length === 0) {
  console.error('❌ MINIMAX_API_KEYS / MINIMAX_API_KEY 都没设置');
  process.exit(1);
}
console.log(
  `🔑 池子大小=${POOL.length}: [${POOL.map((k) => '…' + k.slice(-4)).join(', ')}]`,
);

// ——— 加密工具（与 api/src/modules/auth/api-key-crypto.ts 对齐） ———
function resolveEncryptionSecret() {
  const secret = process.env.USER_API_KEY_ENCRYPTION_SECRET?.trim();
  if (!secret) {
    throw new Error('USER_API_KEY_ENCRYPTION_SECRET is required');
  }
  return secret;
}

function buildEncryptionKey() {
  return createHash('sha256').update(resolveEncryptionSecret()).digest();
}

function encryptUserApiKey(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', buildEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    value: encrypted.toString('base64'),
  });
}

// 与 api/src/modules/inference/inference.service.ts:encodeSecret 一致：
// 有 USER_API_KEY_ENCRYPTION_SECRET 就写 enc:，没有就 fallback 到 plain:。
function encodeSecret(value) {
  try {
    return `enc:${encryptUserApiKey(value)}`;
  } catch {
    return `plain:${value}`;
  }
}

const ENCRYPTION_AVAILABLE = (() => {
  try {
    resolveEncryptionSecret();
    return true;
  } catch {
    return false;
  }
})();
console.log(
  `🔐 加密：${ENCRYPTION_AVAILABLE ? 'enc: (AES-256-GCM)' : 'plain: (USER_API_KEY_ENCRYPTION_SECRET 未设置, 与现行 api 行为一致)'}`,
);

// 当前存储格式 → 明文（用来对比是否需要写）
function decodeStored(stored) {
  if (!stored) return '';
  const trimmed = stored.trim();
  if (trimmed.startsWith('plain:')) return trimmed.slice(6).trim();
  if (trimmed.startsWith('enc:')) {
    // 解 enc: 需要 USER_API_KEY_ENCRYPTION_SECRET；不解密，只跟 enc:<...> 形式比对
    // 这里我们不解密，而是用"末 4 位 fingerprint"的间接方式：
    // 由于 enc: 是非确定加密（随机 IV），无法直接比较密文。我们改在 SELECT 时拉出
    // 现状（已知历史是 plain:<key>），不可逆比对的部分由"已经 enc:" 标记跳过。
    return '__enc_unknown__';
  }
  // legacy bare value
  return trimmed;
}

// ——— DB 发现 ———
function discoverDatabases() {
  const accountsDir = path.join(REPO_ROOT, 'data', 'accounts');
  if (!existsSync(accountsDir) || !statSync(accountsDir).isDirectory()) {
    return [];
  }
  const dbs = [];
  for (const entry of readdirSync(accountsDir)) {
    const dbPath = path.join(accountsDir, entry, 'database.sqlite');
    if (existsSync(dbPath)) dbs.push({ phone: entry, dbPath });
  }
  return dbs;
}

// ——— cloud_worlds: phone → worldId 映射 ———
function loadPhoneToWorldId() {
  const platformDb = path.join(REPO_ROOT, 'cloud-platform.sqlite');
  if (!existsSync(platformDb)) {
    console.error('❌ cloud-platform.sqlite 未找到，无法把 phone 关联回 worldId');
    process.exit(1);
  }
  const db = new Database(platformDb, { readonly: true });
  try {
    const rows = db
      .prepare('SELECT id, phone, name, desiredState FROM cloud_worlds')
      .all();
    const m = new Map();
    for (const r of rows) {
      m.set(String(r.phone), {
        worldId: String(r.id),
        name: String(r.name ?? ''),
        state: String(r.desiredState ?? ''),
      });
    }
    return m;
  } finally {
    db.close();
  }
}

// ——— 单库修复 ———
function fixOne({ phone, dbPath }, phoneToWorld) {
  const meta = phoneToWorld.get(phone);
  if (!meta) {
    return { phone, dbPath, skipped: 'phone not in cloud_worlds' };
  }
  const alloc = pickKey(meta.worldId, POOL);
  if (!alloc) {
    return { phone, dbPath, skipped: 'no key in pool' };
  }

  const db = new Database(dbPath);
  try {
    const tableExists = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='inference_provider_accounts'",
      )
      .get();
    if (!tableExists) {
      return { phone, dbPath, skipped: 'no inference_provider_accounts table' };
    }
    const row = db
      .prepare(
        'SELECT apiKeyEncrypted, ttsApiKeyEncrypted, imageGenerationApiKeyEncrypted FROM inference_provider_accounts WHERE id = ?',
      )
      .get(PROVIDER_ID);
    if (!row) {
      return { phone, dbPath, skipped: 'no provider_minimax row' };
    }

    const expectedKey = alloc.key;
    const before = {
      api: decodeStored(row.apiKeyEncrypted),
      tts: decodeStored(row.ttsApiKeyEncrypted),
      img: decodeStored(row.imageGenerationApiKeyEncrypted),
    };
    // 触发改写的条件：
    //   - 值不对（不是当前 hash 应得的 key）
    //   - 或者 ENCRYPTION_AVAILABLE 但当前还是 plain:（顺手升级到 enc:）
    //   - 或者 enc:<opaque> 无法解密的（保守视为不一致）
    const needsUpgrade = (rawStored) =>
      ENCRYPTION_AVAILABLE && typeof rawStored === 'string' && rawStored.trim().startsWith('plain:');
    const needsApi =
      before.api !== expectedKey || needsUpgrade(row.apiKeyEncrypted);
    const needsTts =
      before.tts !== expectedKey || needsUpgrade(row.ttsApiKeyEncrypted);
    const needsImg =
      before.img !== expectedKey || needsUpgrade(row.imageGenerationApiKeyEncrypted);

    const summary = {
      phone,
      worldId: meta.worldId.slice(0, 8),
      name: meta.name,
      state: meta.state,
      assignedKey: `…${alloc.fingerprint} (#${alloc.index}/${alloc.total})`,
      before: {
        api: before.api === '__enc_unknown__'
          ? 'enc:<opaque>'
          : '…' + before.api.slice(-4),
        tts: before.tts === '__enc_unknown__'
          ? 'enc:<opaque>'
          : '…' + (before.tts ? before.tts.slice(-4) : '<empty>'),
        img: before.img === '__enc_unknown__'
          ? 'enc:<opaque>'
          : '…' + (before.img ? before.img.slice(-4) : '<empty>'),
      },
      changed: needsApi || needsTts || needsImg,
      diff: { api: needsApi, tts: needsTts, img: needsImg },
    };

    if (!summary.changed) {
      return summary;
    }

    if (!DRY_RUN) {
      const now = new Date().toISOString();
      // 每一列都用独立 encrypt（不同 IV），且只改需要改的列
      const sets = [];
      const params = { id: PROVIDER_ID, now };
      if (needsApi) {
        sets.push('apiKeyEncrypted = @apiEnc');
        params.apiEnc = encodeSecret(expectedKey);
      }
      if (needsTts) {
        sets.push('ttsApiKeyEncrypted = @ttsEnc');
        params.ttsEnc = encodeSecret(expectedKey);
      }
      if (needsImg) {
        sets.push('imageGenerationApiKeyEncrypted = @imgEnc');
        params.imgEnc = encodeSecret(expectedKey);
      }
      sets.push('updatedAt = @now');
      const sql = `UPDATE inference_provider_accounts SET ${sets.join(', ')} WHERE id = @id`;
      const res = db.prepare(sql).run(params);
      summary.dbChanges = res.changes;
    }

    return summary;
  } finally {
    db.close();
  }
}

function main() {
  const phoneToWorld = loadPhoneToWorldId();
  const dbs = discoverDatabases();
  if (dbs.length === 0) {
    console.error('❌ 没找到 data/accounts/*/database.sqlite');
    process.exit(1);
  }
  console.log(
    `${DRY_RUN ? '🧪 DRY-RUN' : '✏️  APPLY'} | ${dbs.length} 个 world DB\n`,
  );

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  const perKey = {};

  for (const d of dbs) {
    const r = fixOne(d, phoneToWorld);
    if (r.skipped) {
      skipped++;
      console.log(`  ⏭️  ${d.phone}: ${r.skipped}`);
      continue;
    }
    perKey[r.assignedKey] = (perKey[r.assignedKey] ?? 0) + 1;
    const flag = r.changed ? (DRY_RUN ? '➜ WILL CHANGE' : '✅ CHANGED') : '☑️  ok';
    console.log(
      `  ${flag.padEnd(15)} world=${r.worldId} ${r.name.padEnd(14)} state=${r.state.padEnd(8)} → ${r.assignedKey}  | api=${r.before.api}${
        r.changed ? `  diff:[${r.diff.api ? 'api' : ''}${r.diff.tts ? ' tts' : ''}${r.diff.img ? ' img' : ''}]` : ''
      }`,
    );
    if (r.changed) changed++;
    else unchanged++;
  }

  console.log(
    `\n汇总：${DRY_RUN ? 'WILL CHANGE' : 'CHANGED'} = ${changed}, unchanged = ${unchanged}, skipped = ${skipped}`,
  );
  console.log('Per-key 分配:');
  for (const [k, n] of Object.entries(perKey)) {
    console.log(`  ${k}: ${n}`);
  }
  if (DRY_RUN) {
    console.log('\n（dry-run，没有改库；去掉 --dry-run 再跑一次正式应用）');
  }
}

main();
