#!/usr/bin/env node
// 清理「视频号(channels)死链帖」：媒体文件已不在磁盘的 video/audio 帖 → 标 publishStatus='hidden'。
//
// 背景：共享 world 模式下 cleanupBrokenChannelPosts() 在 boot 期直接 return（无租户帧，
// 裸全局 find/update 会 fail-closed）。于是死链帖只能靠运行时 isPostMediaPlayable 过滤，
// DB 里仍残留 published 行。本脚本离线按 per-owner 校验媒体文件存在性，把死链帖落库为
// hidden，与运行时过滤行为对齐，便于排查/统计，不依赖重启 :4100。
//
// 用法：
//   node scripts/cleanup-broken-channel-posts.mjs                 # dry-run，只报告
//   node scripts/cleanup-broken-channel-posts.mjs --apply         # 真正写库
//   DB=/path/db.sqlite DATA_ROOT=/path/data node scripts/cleanup-broken-channel-posts.mjs
//
// 默认 DB=data/shared-world/database.sqlite，DATA_ROOT=data/shared-world。
// ⚠️ --apply 是写库操作；live :4100 在跑时直接改 live 库属生产操作，请先在 /tmp 副本验证。

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Database = require(path.join(repoRoot, 'api/node_modules/better-sqlite3'));

const DEAD_MEDIA_HOSTS = new Set(['commondatastorage.googleapis.com']);
const GLOBAL_WORLD_OWNER_ID = 'global-world-owner';

const apply = process.argv.includes('--apply');
const dbPath = process.env.DB
  ? path.resolve(process.env.DB)
  : path.join(repoRoot, 'data/shared-world/database.sqlite');
const dataRoot = process.env.DATA_ROOT
  ? path.resolve(process.env.DATA_ROOT)
  : path.join(repoRoot, 'data/shared-world');

function ownerMediaPath(ownerId, fileName) {
  // 共享模式：owners/<ownerId>/moments-media/<file>，回退到全局公共池目录。
  const candidates = [
    path.join(dataRoot, 'owners', ownerId ?? '', 'moments-media', fileName),
    path.join(dataRoot, 'owners', GLOBAL_WORLD_OWNER_ID, 'moments-media', fileName),
  ];
  return candidates.some((p) => existsSync(p));
}

function collectUrls(row) {
  const urls = [];
  try {
    const arr = JSON.parse(row.mediaPayload ?? '[]');
    for (const a of Array.isArray(arr) ? arr : []) {
      if (a?.kind === row.mediaType && typeof a.url === 'string' && a.url.trim()) {
        urls.push(a.url.trim());
      }
    }
  } catch {
    /* malformed → fall through to legacy mediaUrl */
  }
  if (row.mediaUrl?.trim()) urls.push(row.mediaUrl.trim());
  return urls;
}

function isPlayable(row) {
  if (row.mediaType !== 'video' && row.mediaType !== 'audio') return true;
  const urls = collectUrls(row);
  if (urls.length === 0) return false;
  return urls.some((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return true;
    if (url.startsWith('/api/moments/media/')) {
      const cleanPath = url.split('?')[0].split('#')[0];
      const fileName = path.basename(cleanPath.slice('/api/moments/media/'.length)).trim();
      if (!fileName) return false;
      return ownerMediaPath(row.ownerId, fileName);
    }
    if (url.startsWith('/')) return true; // cloud-api 中心媒体等站内绝对路径
    try {
      return !DEAD_MEDIA_HOSTS.has(new URL(url).hostname.toLowerCase());
    } catch {
      return false;
    }
  });
}

const db = new Database(dbPath, { readonly: !apply });
const rows = db
  .prepare(
    `SELECT id, ownerId, mediaType, mediaUrl, mediaPayload
     FROM feed_posts
     WHERE surface='channels' AND publishStatus='published'
       AND mediaType IN ('video','audio')`,
  )
  .all();

const broken = rows.filter((r) => !isPlayable(r));
console.log(`DB=${dbPath}`);
console.log(`DATA_ROOT=${dataRoot}`);
console.log(`已检查 published channels video/audio 帖: ${rows.length}`);
console.log(`判定死链(将标 hidden): ${broken.length}`);

const byOwner = {};
for (const b of broken) byOwner[b.ownerId ?? 'NULL'] = (byOwner[b.ownerId ?? 'NULL'] ?? 0) + 1;
for (const [o, n] of Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  owner ${String(o).slice(0, 12)}: ${n}`);
}

if (broken.length && apply) {
  const upd = db.prepare(`UPDATE feed_posts SET publishStatus='hidden' WHERE id=?`);
  const tx = db.transaction((ids) => ids.forEach((id) => upd.run(id)));
  tx(broken.map((b) => b.id));
  console.log(`✅ 已把 ${broken.length} 条死链帖标为 hidden`);
} else if (broken.length) {
  console.log('（dry-run，未写库；加 --apply 落库）');
} else {
  console.log('没有需要清理的死链帖 ✅');
}
db.close();
