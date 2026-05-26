#!/usr/bin/env node
// 共享 world 多租户迁移 step3：把各账号的媒体/文件目录拷到共享库的 owners/<ownerId>/ 下，
// 配套 Phase 8q 的 per-owner 存储（resolveOwnerDataPath → <dataRoot>/owners/<ownerId>/<seg>）。
// 没有这步，cutover 后用户看不到自己历史的朋友圈图片/聊天附件/语音/贴纸/背景/self-agent 文件。
//
// ownerId = uuidv5(phone, NAMESPACE)，与 step0-remap 完全一致（确定性 ⇒ 幂等，可重跑）。
// 用法: node 2026-mt-step3-copy-media.mjs <sharedDataRoot> <accountDir1> [accountDir2 ...]
//   accountDir 形如 <repo>/data/accounts/<phone>（basename 即 phone，与 step0 传的 phone 一致）。
//   sharedDataRoot 形如 <repo>/data/shared-world（即 shared-world 的 YINJIE_DATA_ROOT）。
//   先对副本/小批 dry 跑；大文件只拷盘不入库，幂等（重拷覆盖）。

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const NAMESPACE = '6f1d3e2a-9c4b-5f87-a3d1-7e0b2c45a9f0';

// 与 step0 逐字相同的 RFC4122 UUIDv5（SHA1）。
function uuidv5(name, namespace) {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  if (nsBytes.length !== 16) throw new Error('NAMESPACE 必须是合法 UUID');
  const hash = createHash('sha1')
    .update(nsBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// 与 8q 各存储 resolveOwnerDataPath('<seg>') 的 seg 一一对应。
const MEDIA_DIRS = [
  'moments-media',
  'chat-attachments',
  'chat-stickers',
  'chat-backgrounds',
  'ai-speech',
  'self-agent-workspace',
];

const sharedRoot = process.argv[2];
const accountDirs = process.argv.slice(3);
if (!sharedRoot || accountDirs.length === 0) {
  console.error(
    '用法: node 2026-mt-step3-copy-media.mjs <sharedDataRoot> <accountDir1> [accountDir2 ...]',
  );
  process.exit(1);
}

let owners = 0;
let copiedDirs = 0;
for (const dir of accountDirs) {
  if (!existsSync(dir)) {
    console.warn(`  跳过（不存在）：${dir}`);
    continue;
  }
  const phone = path.basename(dir.replace(/\/+$/, ''));
  const ownerId = uuidv5(phone, NAMESPACE);
  const destBase = path.join(sharedRoot, 'owners', ownerId);
  let did = 0;
  for (const md of MEDIA_DIRS) {
    const src = path.join(dir, md);
    if (!existsSync(src) || !statSync(src).isDirectory()) continue;
    const dest = path.join(destBase, md);
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    did++;
    copiedDirs++;
  }
  owners++;
  console.log(`  ${phone} → owners/${ownerId}/  (${did} 个媒体目录)`);
}
console.log(`\nstep3 完成：${owners} 个账号，拷 ${copiedDirs} 个媒体目录到 ${sharedRoot}/owners/。`);
