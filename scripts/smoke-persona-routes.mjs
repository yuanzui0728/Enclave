#!/usr/bin/env node
// Smoke test the two backends used after 2026-05-15 persona reroute:
//   - provider_minimax + MiniMax-M2.7  (28 个非 GPT persona，含 gpt-5)
//   - provider_default  + gpt-4o / 4o-mini / 4.1 / 4.1-mini  (4 个 GPT 真身)
// gpt-5 不再走 n1n —— 它是纯 reasoning 模型，普通 chat max_tokens 全被 reasoning_tokens 吃光、content="" 永远空回复，已塞回 MiniMax。

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const apiRequire = createRequire(path.join(REPO_ROOT, 'api', 'package.json'));
const Database = apiRequire('better-sqlite3');

const dbPath = path.join(REPO_ROOT, 'data/database.sqlite');
if (!existsSync(dbPath)) {
  console.error('❌ DB not found:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const providers = db
  .prepare(
    `SELECT * FROM inference_provider_accounts WHERE id IN ('provider_minimax','provider_default')`,
  )
  .all();
db.close();

const byId = new Map(providers.map((p) => [p.id, p]));

function decodeSecret(value) {
  if (!value) return '';
  const v = String(value).trim();
  if (v.startsWith('plain:')) return v.slice(6).trim();
  if (v.startsWith('enc:')) return '';
  return v;
}

async function smoke(providerId, model) {
  const provider = byId.get(providerId);
  if (!provider) {
    return { providerId, model, ok: false, error: 'provider 不存在' };
  }
  if (!provider.isEnabled) {
    return { providerId, model, ok: false, error: 'provider 未启用' };
  }
  const apiKey = decodeSecret(provider.apiKeyEncrypted);
  if (!apiKey) {
    return { providerId, model, ok: false, error: 'apiKey 为空（可能是 enc: 加密，需要 inference.service 解密）' };
  }
  try {
    const res = await fetch(`${provider.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '请用 6 个字以内回答："今天好"' }],
        max_tokens: 30,
      }),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { providerId, model, ok: false, http: res.status, raw: text.slice(0, 200) };
    }
    const reply = parsed?.choices?.[0]?.message?.content?.trim();
    if (reply) return { providerId, model, ok: true, http: res.status, reply };
    return {
      providerId,
      model,
      ok: false,
      http: res.status,
      error: parsed?.error?.message || parsed?.message || JSON.stringify(parsed).slice(0, 200),
    };
  } catch (err) {
    return { providerId, model, ok: false, error: err?.message ?? String(err) };
  }
}

const cases = [
  ['provider_minimax', 'MiniMax-M2.7'],
  ['provider_default', 'gpt-4o'],
  ['provider_default', 'gpt-4o-mini'],
  ['provider_default', 'gpt-4.1'],
  ['provider_default', 'gpt-4.1-mini'],
];

console.log('🧪 Persona routing smoke (2026-05-15 reroute)\n');
let allOk = true;
for (const [providerId, model] of cases) {
  const r = await smoke(providerId, model);
  const flag = r.ok ? '✓' : '✗';
  if (!r.ok) allOk = false;
  const detail = r.ok
    ? `→ "${r.reply}"`
    : `HTTP=${r.http ?? '-'} err=${r.error ?? '(no body)'}`;
  console.log(`  ${flag} ${providerId} / ${model}  ${detail}`);
}
process.exit(allOk ? 0 : 1);
