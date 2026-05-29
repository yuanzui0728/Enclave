#!/usr/bin/env node
// 给「视频号(channels)全局共享池」播种内容：把现有健康的角色视频镜像成 global-world-owner
// 名下的 channels 帖，并把媒体文件复制进 owners/global-world-owner/moments-media/。
//
// 为什么需要：共享 world 多租户下 channels 内容严格按 owner 隔离，且没有像广场那样的
// 自动铺帖管线 → 绝大多数用户视频号长期 0 帖（空白）。channels 查询本就含全局池分支
// (ownerId='global-world-owner' AND authorType='character' AND visibility<>'private')，
// 但全局池一直是空的、且全局池媒体此前无法跨租户读取。配合本仓改动：
//   1) resolveReadableMomentMediaPath 共享模式回退到全局公共池目录（已改）
//   2) 本脚本把健康视频镜像进全局池 + 复制媒体到全局目录
// 上线(重启 :4100)后，所有用户视频号「推荐」都能看到这批全局内容。
//
// 用法：
//   node scripts/seed-global-channels-pool.mjs                 # dry-run，报告将镜像哪些
//   node scripts/seed-global-channels-pool.mjs --apply         # 真正写库 + 复制文件
//   N=40 node scripts/seed-global-channels-pool.mjs --apply    # 控制镜像条数(默认30)
//   node scripts/seed-global-channels-pool.mjs --include-audio --apply   # 同时镜像音频
//   DB=/tmp/x/database.sqlite DATA_ROOT=/tmp/x node ... # 隔离副本验证
//
// 幂等：按 statsPayload.seededFromId 去重，重复跑不产生重复全局帖。
// ⚠️ --apply 写 live 库 + 落盘属生产操作，先在 /tmp 副本验证。

import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Database = require(path.join(repoRoot, 'api/node_modules/better-sqlite3'));

const GLOBAL_WORLD_OWNER_ID = 'global-world-owner';
const apply = process.argv.includes('--apply');
const includeAudio = process.argv.includes('--include-audio');
const limit = Number(process.env.N ?? 30);
const dbPath = process.env.DB
  ? path.resolve(process.env.DB)
  : path.join(repoRoot, 'data/shared-world/database.sqlite');
const dataRoot = process.env.DATA_ROOT
  ? path.resolve(process.env.DATA_ROOT)
  : path.join(repoRoot, 'data/shared-world');

const globalMediaDir = path.join(dataRoot, 'owners', GLOBAL_WORLD_OWNER_ID, 'moments-media');

function ownerFile(ownerId, fileName) {
  return path.join(dataRoot, 'owners', ownerId ?? '', 'moments-media', fileName);
}
function basenameFromUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/api/moments/media/')) return null;
  const clean = url.split('?')[0].split('#')[0];
  const fn = path.basename(clean.slice('/api/moments/media/'.length)).trim();
  return fn || null;
}
// 收集一条帖引用的所有本地媒体文件名（mediaUrl + coverUrl + mediaPayload[].url/.posterUrl）
function localFilesOf(row) {
  const files = new Set();
  const add = (u) => {
    const fn = basenameFromUrl(u);
    if (fn) files.add(fn);
  };
  add(row.mediaUrl);
  add(row.coverUrl);
  try {
    const arr = JSON.parse(row.mediaPayload ?? '[]');
    for (const a of Array.isArray(arr) ? arr : []) {
      add(a?.url);
      add(a?.posterUrl);
    }
  } catch {
    /* ignore */
  }
  return [...files];
}

const db = new Database(dbPath, { readonly: !apply });

const types = includeAudio ? ['video', 'audio'] : ['video'];
const placeholders = types.map(() => '?').join(',');
const candidates = db
  .prepare(
    `SELECT * FROM feed_posts
     WHERE surface='channels' AND publishStatus='published'
       AND authorType='character'
       AND mediaType IN (${placeholders})
       AND (ownerId IS NULL OR ownerId <> ?)
     ORDER BY createdAt DESC`,
  )
  .all(...types, GLOBAL_WORLD_OWNER_ID);

// 已镜像过的源 id（幂等）
const seededIds = new Set(
  db
    .prepare(
      `SELECT statsPayload FROM feed_posts WHERE surface='channels' AND ownerId=? AND statsPayload LIKE '%"globalPoolSeed":true%'`,
    )
    .all(GLOBAL_WORLD_OWNER_ID)
    .map((r) => {
      try {
        return JSON.parse(r.statsPayload)?.seededFromId;
      } catch {
        return null;
      }
    })
    .filter(Boolean),
);

const seenFiles = new Set(); // 同一媒体只镜像一次
const plan = [];
for (const row of candidates) {
  if (plan.length >= limit) break;
  if (seededIds.has(row.id)) continue;
  const files = localFilesOf(row);
  const primary = basenameFromUrl(row.mediaUrl) ?? files[0];
  if (!primary) continue;
  if (seenFiles.has(primary)) continue;
  // 源文件必须真实存在（在源 owner 目录）
  const missing = files.filter((f) => !existsSync(ownerFile(row.ownerId, f)));
  if (missing.length) continue;
  seenFiles.add(primary);
  plan.push({ row, files });
}

console.log(`DB=${dbPath}`);
console.log(`DATA_ROOT=${dataRoot}`);
console.log(`候选健康帖: ${candidates.length} (types=${types.join(',')})`);
console.log(`已在全局池(去重跳过): ${seededIds.size}`);
console.log(`将镜像进全局池: ${plan.length} (上限 ${limit})`);
for (const p of plan.slice(0, 10)) {
  console.log(`  - "${(p.row.text ?? '').slice(0, 24)}" by ${p.row.authorName} [${p.row.mediaType}] files=${p.files.length}`);
}

if (!plan.length) {
  console.log('没有可镜像的内容。');
  db.close();
  process.exit(0);
}

if (!apply) {
  console.log('（dry-run，未写库/未复制文件；加 --apply 执行）');
  db.close();
  process.exit(0);
}

mkdirSync(globalMediaDir, { recursive: true });
const insert = db.prepare(
  `INSERT INTO feed_posts
   (id, authorId, authorName, authorAvatar, authorType, surface, text, title,
    mediaUrl, mediaPayload, coverUrl, mediaType, durationMs, aspectRatio, topicTags,
    publishStatus, sourceKind, recommendationScore, statsPayload, createdAt, visibility, ownerId)
   VALUES (@id, @authorId, @authorName, @authorAvatar, @authorType, 'channels', @text, @title,
    @mediaUrl, @mediaPayload, @coverUrl, @mediaType, @durationMs, @aspectRatio, @topicTags,
    'published', 'character_generated', 100, @statsPayload, datetime('now'), 'public', @ownerId)`,
);

let copied = 0;
const tx = db.transaction((items) => {
  for (const { row, files } of items) {
    for (const f of files) {
      const dst = path.join(globalMediaDir, f);
      if (!existsSync(dst)) {
        copyFileSync(ownerFile(row.ownerId, f), dst);
        copied++;
      }
    }
    insert.run({
      id: randomUUID(),
      authorId: row.authorId,
      authorName: row.authorName,
      authorAvatar: row.authorAvatar,
      authorType: 'character',
      text: row.text,
      title: row.title,
      mediaUrl: row.mediaUrl,
      mediaPayload: row.mediaPayload,
      coverUrl: row.coverUrl,
      mediaType: row.mediaType,
      durationMs: row.durationMs,
      aspectRatio: row.aspectRatio,
      topicTags: row.topicTags,
      statsPayload: JSON.stringify({
        globalPoolSeed: true,
        seededFromId: row.id,
        seededFromOwner: row.ownerId,
      }),
      ownerId: GLOBAL_WORLD_OWNER_ID,
    });
  }
});
tx(plan);
console.log(`✅ 已镜像 ${plan.length} 条到全局池，复制媒体文件 ${copied} 个 → ${globalMediaDir}`);
db.close();
