#!/usr/bin/env node
// 把 30 个 model persona 角色合并为 12 个厂商家族角色（family_openai 等）。
// 一次性数据迁移：把 12+ 张表里指向旧 persona id 的字段 UPDATE 到新 family id，
// 处理 JSON 数组字段，清理 ai_relationships 自环，最后删除旧 persona character 行。
//
// 前置条件：
//   admin UI 已点击过"安装/重置厂商家族角色"，确保 12 个 family_* character 已存在。
//   （脚本会校验，缺则报错。）
//
// 用法：
//   node scripts/migrate-model-persona-merge.mjs --dry-run          # 不写入
//   node scripts/migrate-model-persona-merge.mjs                    # 实际执行（带备份提示）
//   node scripts/migrate-model-persona-merge.mjs --db /path/to.db   # 指定单个 db
//   node scripts/migrate-model-persona-merge.mjs --template-db data/database.sqlite
//                                                                    # 缺 family 时从此 DB 复制 12 行

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
const EXPLICIT_DB =
  explicitDbIdx >= 0 ? args[explicitDbIdx + 1] : null;
const templateDbIdx = args.indexOf('--template-db');
const TEMPLATE_DB =
  templateDbIdx >= 0 ? args[templateDbIdx + 1] : null;

// 模型 id → 家族 id（必须与 inference-catalog.seed.ts 中 VENDOR_FAMILY_PERSONAS 保持一致）
const FAMILY_BY_MODEL = {
  'gpt-4.1': 'family_openai',
  'gpt-4.1-mini': 'family_openai',
  'gpt-4o': 'family_openai',
  'gpt-4o-mini': 'family_openai',
  'gpt-5': 'family_openai',
  o1: 'family_openai',
  o3: 'family_openai',
  'o4-mini-all': 'family_openai',
  'claude-opus-4-20250514': 'family_anthropic',
  'claude-sonnet-4-5': 'family_anthropic',
  'claude-haiku-4-5-20251001-thinking': 'family_anthropic',
  'gemini-2.5-pro': 'family_google',
  'gemini-2.5-flash': 'family_google',
  'grok-4.1': 'family_xai',
  'grok-4.1-fast': 'family_xai',
  'deepseek-chat': 'family_deepseek',
  'deepseek-r1': 'family_deepseek',
  'deepseek-v3': 'family_deepseek',
  'qwen3-max': 'family_aliyun',
  'qwen3-coder-plus': 'family_aliyun',
  'qwen-turbo-2025-07-15': 'family_aliyun',
  'qvq-max': 'family_aliyun',
  'ERNIE-Tiny-8K': 'family_baidu',
  'glm-4.5': 'family_zhipu',
  'glm-4.5-air': 'family_zhipu',
  'kimi-k2': 'family_moonshot',
  'kimi-latest': 'family_moonshot',
  'hunyuan-t1': 'family_tencent',
  'MiniMax-M2.7': 'family_minimax',
  'MiniMax-M2.7-highspeed': 'family_minimax',
  'MiniMax-M1': 'family_minimax',
  'llama-3.2-1b-instruct': 'family_meta',
};
const ALL_FAMILY_IDS = Array.from(new Set(Object.values(FAMILY_BY_MODEL)));

// 有 UNIQUE 约束（单列或复合）的列，旧→新可能撞约束。
// 模式：UPDATE OR IGNORE，然后 DELETE 落单的旧 id 行。
const UNIQUE_FK_COLUMNS = new Set([
  'character_blueprints.characterId',
  'character_pages.characterId',
  'character_revisions.characterId', // 复合 UNIQUE (characterId, version)
  'farm_npc_states.characterId',
  'parking_war_npc_states.characterId',
  'feed_post_likes.authorId', // 复合 UNIQUE (postId, authorId)：多 persona 点赞同贴合并后撞车
  'moment_likes.authorId', // 复合 UNIQUE (postId, authorId)
  'video_channel_follows.authorId',
  'wiki_watchlist.characterId',
]);

// 二元关系表（A,B 复合 UNIQUE，需要自环清理 + dedupe + 顺序规范化）
// orderedPair=true 表示业务侧强制 A<B（character_friendships.orderPair / ai_relationships seed.sort）。
// 迁移后必须 normalize：A>B 的行 swap；如果 swap 后 (B,A) 已存在则 dedup。
const PAIR_RELATIONSHIP_TABLES = [
  { table: 'ai_relationships', colA: 'characterIdA', colB: 'characterIdB', orderedPair: true },
  { table: 'character_friendships', colA: 'characterAId', colB: 'characterBId', orderedPair: true },
];

// 单值字段：UPDATE table SET col = new WHERE col = old
const SCALAR_TABLES = [
  ['action_runs', 'characterId'],
  ['ai_behavior_logs', 'characterId'],
  // ai_behavior_logs.targetId / farm_event_logs.targetId / minimax_jobs.targetId /
  // moderation_reports.targetId 是 polymorphic 引用（targetType 区分）。
  // oldIds 是高度特异的 model_<id>_<hash> 模式，不会撞到 user/其他实体 ID，
  // 所以无需按 targetType 过滤即可安全 UPDATE。
  ['ai_behavior_logs', 'targetId'],
  ['ai_usage_ledger', 'characterId'],
  ['character_blueprint_revisions', 'characterId'],
  ['character_blueprints', 'characterId'],
  ['character_pages', 'characterId'],
  ['character_real_world_digests', 'characterId'],
  ['character_real_world_signals', 'characterId'],
  ['character_real_world_sync_runs', 'characterId'],
  ['character_revisions', 'characterId'],
  ['farm_event_logs', 'targetId'],
  ['farm_npc_states', 'characterId'],
  ['feed_comments', 'authorId'],
  ['feed_comments', 'replyToAuthorId'],
  ['feed_post_likes', 'authorId'],
  ['feed_posts', 'authorId'],
  ['followup_recommendations', 'recommenderCharacterId'],
  ['followup_recommendations', 'targetCharacterId'],
  ['friend_requests', 'characterId'],
  ['friendships', 'characterId'],
  ['game_catalog_entries', 'sourceCharacterId'],
  ['game_submissions', 'sourceCharacterId'],
  ['group_members', 'memberId'],
  ['group_messages', 'senderId'],
  ['group_reply_tasks', 'actorCharacterId'],
  ['media_insight_jobs', 'characterId'],
  ['messages', 'senderId'],
  ['minimax_jobs', 'characterId'],
  ['minimax_jobs', 'targetId'],
  ['moderation_reports', 'targetId'],
  ['moment_comments', 'authorId'],
  ['moment_comments', 'replyToAuthorId'],
  ['moment_likes', 'authorId'],
  ['moment_posts', 'authorId'],
  ['moments', 'authorId'],
  ['narrative_arcs', 'characterId'],
  ['need_discovery_candidates', 'characterId'],
  ['parking_war_npc_states', 'characterId'],
  ['reminder_tasks', 'characterId'],
  ['reply_artifact_jobs', 'characterId'],
  ['self_agent_runs', 'characterId'],
  ['video_channel_follows', 'authorId'],
  ['wiki_abuse_filter_hits', 'characterId'],
  ['wiki_blocks', 'targetCharacterId'],
  ['wiki_edit_submissions', 'characterId'],
  ['wiki_field_protections', 'characterId'],
  ['wiki_protection_logs', 'characterId'],
  ['wiki_talk_posts', 'authorId'],
  ['wiki_talk_threads', 'authorId'],
  ['wiki_talk_threads', 'characterId'],
  ['wiki_watchlist', 'characterId'],
];

// JSON 数组字段：read-modify-write，把数组里的旧 id 替换为新 id（去重）
const JSON_ARRAY_COLUMNS = [
  ['conversations', 'id', 'participants'],
  ['followup_open_loops', 'id', 'sourceCharacterIds'],
];

// JSON 对象列表字段：[{ characterId: ... }] 这种，characters.aiRelationships 是典型
const JSON_OBJECT_LIST_COLUMNS = [
  ['characters', 'id', 'aiRelationships', 'characterId'],
];

function discoverDatabases() {
  if (EXPLICIT_DB) {
    if (!existsSync(EXPLICIT_DB)) {
      console.error(`❌ --db 指向的文件不存在：${EXPLICIT_DB}`);
      process.exit(1);
    }
    return [EXPLICIT_DB];
  }
  const candidates = [];
  const root = path.join(REPO_ROOT, 'data', 'database.sqlite');
  if (existsSync(root)) candidates.push(root);
  const accountsDir = path.join(REPO_ROOT, 'data', 'accounts');
  if (existsSync(accountsDir) && statSync(accountsDir).isDirectory()) {
    for (const entry of readdirSync(accountsDir)) {
      const dbPath = path.join(accountsDir, entry, 'database.sqlite');
      if (existsSync(dbPath)) candidates.push(dbPath);
    }
  }
  return candidates;
}

function tableExists(db, name) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name),
  );
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function ensureFamilyFromTemplate(db, templateDb) {
  // 找出目标 DB 缺的 family ids
  const targetFamilies = new Set(
    db
      .prepare(
        "SELECT id FROM characters WHERE sourceKey LIKE 'model_persona_family:%'",
      )
      .all()
      .map((r) => r.id),
  );
  const templateRows = templateDb
    .prepare(
      "SELECT * FROM characters WHERE sourceKey LIKE 'model_persona_family:%'",
    )
    .all();
  if (templateRows.length === 0) {
    return { copied: 0, alreadyPresent: targetFamilies.size, missing: [] };
  }

  // 拿目标 DB 的列定义，确保 INSERT 列与 schema 对齐（模板可能多/少几列）
  const targetCols = db
    .prepare('PRAGMA table_info(characters)')
    .all()
    .map((c) => c.name);
  const targetColSet = new Set(targetCols);

  let copied = 0;
  const missingBefore = templateRows
    .map((r) => r.id)
    .filter((id) => !targetFamilies.has(id));
  for (const row of templateRows) {
    if (targetFamilies.has(row.id)) continue;
    // 清空运行时字段
    const cleaned = { ...row };
    cleaned.aiRelationships = null;
    cleaned.lastActiveAt = null;
    cleaned.intimacyLevel = 0;
    cleaned.currentStatus = null;
    if (typeof cleaned.profile === 'string') {
      try {
        const profile = JSON.parse(cleaned.profile);
        if (profile && typeof profile === 'object') {
          if (profile.memory && typeof profile.memory === 'object') {
            profile.memory = {
              coreMemory: '',
              recentSummary: '',
              forgettingCurve: profile.memory.forgettingCurve ?? 70,
            };
          }
          delete profile.realWorldContext;
          delete profile.wechatSyncImport;
          cleaned.profile = JSON.stringify(profile);
        }
      } catch {
        // 模板 profile 解析失败就原样 INSERT
      }
    }
    // 只保留目标 schema 里有的列
    const cols = Object.keys(cleaned).filter((c) => targetColSet.has(c));
    const placeholders = cols.map(() => '?').join(',');
    const values = cols.map((c) => cleaned[c]);
    db.prepare(
      `INSERT OR IGNORE INTO characters (${cols.join(',')}) VALUES (${placeholders})`,
    ).run(...values);
    copied += 1;
  }

  return { copied, alreadyPresent: targetFamilies.size, missing: missingBefore };
}

function migrateOne(dbPath, templateDb) {
  const db = new Database(dbPath);
  const summary = {
    dbPath,
    skipped: false,
    reason: null,
    oldPersonaCount: 0,
    mapping: {},
    scalarUpdates: {},
    jsonUpdates: {},
    objectListUpdates: {},
    selfLoopsRemoved: 0,
    deletedPersonaRows: 0,
    familyEnsured: null,
    error: null,
  };

  try {
    if (!tableExists(db, 'characters')) {
      summary.skipped = true;
      summary.reason = 'characters 表不存在';
      return summary;
    }

    // 1. 收集旧 persona character 与映射
    const oldPersonas = db
      .prepare(
        `SELECT id, sourceKey, inferenceModelId
         FROM characters
         WHERE sourceType = 'model_persona' AND sourceKey LIKE 'model_persona:%'`,
      )
      .all();
    summary.oldPersonaCount = oldPersonas.length;
    if (oldPersonas.length === 0) {
      summary.skipped = true;
      summary.reason = '没有旧 model_persona 角色，已是迁移后状态';
      return summary;
    }

    const mapping = {}; // oldId → newFamilyId
    const unmapped = [];
    for (const row of oldPersonas) {
      const modelId =
        row.inferenceModelId?.trim() ||
        (row.sourceKey?.startsWith('model_persona:')
          ? row.sourceKey.slice('model_persona:'.length).trim()
          : '');
      const familyId = FAMILY_BY_MODEL[modelId];
      if (!familyId) {
        unmapped.push({ id: row.id, modelId });
        continue;
      }
      mapping[row.id] = familyId;
    }
    if (unmapped.length > 0) {
      throw new Error(
        `无法映射的旧 persona：${JSON.stringify(unmapped)}（请扩展 FAMILY_BY_MODEL）`,
      );
    }
    summary.mapping = mapping;

    // 1.5 缺 family 时从 template DB 复制
    if (templateDb && !DRY_RUN) {
      summary.familyEnsured = ensureFamilyFromTemplate(db, templateDb);
    }

    // 2. 校验 12 个家族角色都已存在
    const targetIds = Array.from(new Set(Object.values(mapping)));
    const existingFamilyIds = new Set(
      db
        .prepare(
          `SELECT id FROM characters WHERE id IN (${targetIds.map(() => '?').join(',')})`,
        )
        .all(...targetIds)
        .map((r) => r.id),
    );
    const missingFamily = targetIds.filter((id) => !existingFamilyIds.has(id));
    if (missingFamily.length > 0) {
      // dry-run 模式下只警告，不抛错（让 dry-run 看完整 summary）
      if (DRY_RUN) {
        console.warn(
          `⚠️ DRY-RUN：缺家族 ${missingFamily.length} 个；跑实际迁移时请加 --template-db。`,
        );
      } else {
        throw new Error(
          `缺少家族角色：${missingFamily.join(', ')}\n请加 --template-db <已含 family 的 DB> 或先在 admin UI 跑安装。`,
        );
      }
    }

    // 3. 单值字段批量更新（事务）
    const oldIds = Object.keys(mapping);
    const placeholders = oldIds.map(() => '?').join(',');
    summary.uniqueDropped = {};
    const exec = db.transaction(() => {
      for (const [tbl, col] of SCALAR_TABLES) {
        if (!columnExists(db, tbl, col)) continue;
        const beforeQuery = db
          .prepare(
            `SELECT ${col} AS v, COUNT(*) AS c FROM ${tbl} WHERE ${col} IN (${placeholders}) GROUP BY ${col}`,
          )
          .all(...oldIds);
        const totalAffected = beforeQuery.reduce((sum, r) => sum + r.c, 0);
        if (totalAffected === 0) continue;
        const isUnique = UNIQUE_FK_COLUMNS.has(`${tbl}.${col}`);
        const verb = isUnique ? 'UPDATE OR IGNORE' : 'UPDATE';
        if (!DRY_RUN) {
          for (const oldId of oldIds) {
            db.prepare(
              `${verb} ${tbl} SET ${col} = ? WHERE ${col} = ?`,
            ).run(mapping[oldId], oldId);
          }
          if (isUnique) {
            // 撞 UNIQUE 约束没换成功的旧行：丢弃（家族角色已存在该侧记录）
            const drop = db
              .prepare(
                `DELETE FROM ${tbl} WHERE ${col} IN (${placeholders})`,
              )
              .run(...oldIds);
            if (drop.changes > 0) {
              summary.uniqueDropped[`${tbl}.${col}`] = drop.changes;
            }
          }
        }
        summary.scalarUpdates[`${tbl}.${col}`] = totalAffected;
      }

      // 4. JSON 数组字段
      for (const [tbl, idCol, col] of JSON_ARRAY_COLUMNS) {
        if (!columnExists(db, tbl, col)) continue;
        const rows = db
          .prepare(
            `SELECT ${idCol} AS rowId, ${col} AS payload FROM ${tbl} WHERE ${col} IS NOT NULL`,
          )
          .all();
        let touched = 0;
        for (const row of rows) {
          let arr;
          try {
            arr = JSON.parse(row.payload);
          } catch {
            continue;
          }
          if (!Array.isArray(arr)) continue;
          let changed = false;
          const next = [];
          for (const item of arr) {
            if (typeof item === 'string' && mapping[item]) {
              next.push(mapping[item]);
              changed = true;
            } else {
              next.push(item);
            }
          }
          if (!changed) continue;
          // 去重保持插入顺序
          const seen = new Set();
          const dedup = next.filter((v) => {
            const key = typeof v === 'string' ? v : JSON.stringify(v);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          touched += 1;
          if (!DRY_RUN) {
            db.prepare(
              `UPDATE ${tbl} SET ${col} = ? WHERE ${idCol} = ?`,
            ).run(JSON.stringify(dedup), row.rowId);
          }
        }
        if (touched > 0) summary.jsonUpdates[`${tbl}.${col}`] = touched;
      }

      // 5. JSON 对象列表字段（characters.aiRelationships）
      for (const [tbl, idCol, col, fieldKey] of JSON_OBJECT_LIST_COLUMNS) {
        if (!columnExists(db, tbl, col)) continue;
        const rows = db
          .prepare(
            `SELECT ${idCol} AS rowId, ${col} AS payload FROM ${tbl} WHERE ${col} IS NOT NULL`,
          )
          .all();
        let touched = 0;
        for (const row of rows) {
          let arr;
          try {
            arr = JSON.parse(row.payload);
          } catch {
            continue;
          }
          if (!Array.isArray(arr)) continue;
          let changed = false;
          const next = [];
          for (const item of arr) {
            if (
              item &&
              typeof item === 'object' &&
              typeof item[fieldKey] === 'string' &&
              mapping[item[fieldKey]]
            ) {
              next.push({ ...item, [fieldKey]: mapping[item[fieldKey]] });
              changed = true;
            } else {
              next.push(item);
            }
          }
          if (!changed) continue;
          // 同 rowId 不能给自己建关系：合并后可能出现 row.rowId === item.fieldKey，过滤掉
          const filtered = next.filter(
            (item) =>
              !(
                item &&
                typeof item === 'object' &&
                item[fieldKey] === row.rowId
              ),
          );
          // 同一对手只保留一条
          const seenKeys = new Set();
          const dedup = filtered.filter((item) => {
            if (!item || typeof item !== 'object') return true;
            const k = item[fieldKey];
            if (seenKeys.has(k)) return false;
            seenKeys.add(k);
            return true;
          });
          touched += 1;
          if (!DRY_RUN) {
            db.prepare(
              `UPDATE ${tbl} SET ${col} = ? WHERE ${idCol} = ?`,
            ).run(JSON.stringify(dedup), row.rowId);
          }
        }
        if (touched > 0) summary.objectListUpdates[`${tbl}.${col}`] = touched;
      }

      // 6. 二元关系表：把 A/B 都改写到家族 id；删自环；dedupe；规范顺序
      summary.selfLoopsRemoved = {};
      summary.pairDeduped = {};
      summary.pairReordered = {};
      for (const pair of PAIR_RELATIONSHIP_TABLES) {
        const { table: tbl, colA, colB, orderedPair } = pair;
        if (
          !tableExists(db, tbl) ||
          !columnExists(db, tbl, colA) ||
          !columnExists(db, tbl, colB)
        ) {
          continue;
        }
        // 6a. UPDATE OR IGNORE 把 A/B 改写到家族 id（避开 (A,B) 复合 UNIQUE 撞车）
        if (!DRY_RUN) {
          for (const oldId of oldIds) {
            db.prepare(
              `UPDATE OR IGNORE ${tbl} SET ${colA} = ? WHERE ${colA} = ?`,
            ).run(mapping[oldId], oldId);
            db.prepare(
              `UPDATE OR IGNORE ${tbl} SET ${colB} = ? WHERE ${colB} = ?`,
            ).run(mapping[oldId], oldId);
          }
          // 没换成功的（撞复合 UNIQUE）：丢弃
          db.prepare(
            `DELETE FROM ${tbl} WHERE ${colA} IN (${placeholders}) OR ${colB} IN (${placeholders})`,
          ).run(...oldIds, ...oldIds);
        }
        // 6b. 删自环（合并后 A==B）
        const selfLoops = db
          .prepare(
            `SELECT COUNT(*) AS c FROM ${tbl} WHERE ${colA} = ${colB}`,
          )
          .get();
        summary.selfLoopsRemoved[tbl] = selfLoops.c;
        if (!DRY_RUN && selfLoops.c > 0) {
          db.prepare(
            `DELETE FROM ${tbl} WHERE ${colA} = ${colB}`,
          ).run();
        }
        // 6c. dedupe：同 (A,B) 多行只保留 id 最小
        if (!DRY_RUN) {
          const dropped = db
            .prepare(
              `DELETE FROM ${tbl}
               WHERE id NOT IN (
                 SELECT MIN(id) FROM ${tbl} GROUP BY ${colA}, ${colB}
               )`,
            )
            .run();
          summary.pairDeduped[tbl] = dropped.changes;
        }
        // 6d. 顺序规范化（业务侧 orderPair 要求 A<B）
        if (orderedPair) {
          const offenders = db
            .prepare(
              `SELECT id, ${colA} AS a, ${colB} AS b FROM ${tbl} WHERE ${colA} > ${colB}`,
            )
            .all();
          let reordered = 0;
          let droppedAfterReorder = 0;
          for (const row of offenders) {
            if (DRY_RUN) {
              reordered += 1;
              continue;
            }
            // swap 后 (b,a) 是否已存在？已存在则丢弃这条；否则 swap
            const conflict = db
              .prepare(
                `SELECT id FROM ${tbl} WHERE ${colA} = ? AND ${colB} = ?`,
              )
              .get(row.b, row.a);
            if (conflict) {
              db.prepare(`DELETE FROM ${tbl} WHERE id = ?`).run(row.id);
              droppedAfterReorder += 1;
            } else {
              db.prepare(
                `UPDATE ${tbl} SET ${colA} = ?, ${colB} = ? WHERE id = ?`,
              ).run(row.b, row.a, row.id);
              reordered += 1;
            }
          }
          summary.pairReordered[tbl] = {
            reordered,
            droppedAfterReorder,
          };
        }
      }

      // 6.5 把旧 persona 的 aiRelationships cache 字段合并到目标家族角色
      // （characters.aiRelationships 是 character_friendships 的快照，被 blueprint
      //  /wiki / friend-seed 用；旧 persona DELETE 后这些条目本会丢失。）
      summary.aiRelationshipsMerged = 0;
      if (
        tableExists(db, 'characters') &&
        columnExists(db, 'characters', 'aiRelationships')
      ) {
        const oldRows = db
          .prepare(
            `SELECT id, aiRelationships FROM characters WHERE id IN (${placeholders}) AND aiRelationships IS NOT NULL`,
          )
          .all(...oldIds);
        // 按目标 family 聚合
        const familyAccum = new Map(); // familyId → Map<peerId, item>
        for (const row of oldRows) {
          const familyId = mapping[row.id];
          if (!familyId) continue;
          let arr;
          try {
            arr = JSON.parse(row.aiRelationships);
          } catch {
            continue;
          }
          if (!Array.isArray(arr)) continue;
          if (!familyAccum.has(familyId)) familyAccum.set(familyId, new Map());
          const acc = familyAccum.get(familyId);
          for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const rawPeer = item.characterId;
            if (typeof rawPeer !== 'string') continue;
            // 旧 persona → 家族；其它 id 不变
            const peer = mapping[rawPeer] ?? rawPeer;
            // 跳过自环（合并后指向自己）
            if (peer === familyId) continue;
            // 同一 peer 只记一条（第一条的 strength/relationshipType 胜出）
            if (!acc.has(peer)) {
              acc.set(peer, { ...item, characterId: peer });
            }
          }
        }
        // 合并进家族角色当前的 aiRelationships
        for (const [familyId, peerMap] of familyAccum.entries()) {
          if (peerMap.size === 0) continue;
          const current = db
            .prepare(
              'SELECT aiRelationships FROM characters WHERE id = ?',
            )
            .get(familyId);
          let existing = [];
          if (current?.aiRelationships) {
            try {
              const parsed = JSON.parse(current.aiRelationships);
              if (Array.isArray(parsed)) existing = parsed;
            } catch {}
          }
          const merged = new Map();
          for (const item of existing) {
            if (
              item &&
              typeof item === 'object' &&
              typeof item.characterId === 'string' &&
              item.characterId !== familyId
            ) {
              merged.set(item.characterId, item);
            }
          }
          for (const [peer, item] of peerMap.entries()) {
            if (!merged.has(peer)) merged.set(peer, item);
          }
          summary.aiRelationshipsMerged += peerMap.size;
          if (!DRY_RUN) {
            db.prepare(
              'UPDATE characters SET aiRelationships = ? WHERE id = ?',
            ).run(JSON.stringify(Array.from(merged.values())), familyId);
          }
        }
      }

      // 7. 最后删除旧 persona character 行
      if (!DRY_RUN) {
        const del = db
          .prepare(
            `DELETE FROM characters WHERE id IN (${placeholders})`,
          )
          .run(...oldIds);
        summary.deletedPersonaRows = del.changes;
      } else {
        summary.deletedPersonaRows = oldIds.length;
      }
    });

    exec();
  } catch (error) {
    summary.error = error.message;
  } finally {
    db.close();
  }

  return summary;
}

function printReport(s) {
  console.log(`\n=== ${s.dbPath} ===`);
  if (s.skipped) {
    console.log(`  跳过：${s.reason}`);
    return;
  }
  if (s.error) {
    console.log(`  ❌ 失败：${s.error}`);
    return;
  }
  console.log(`  旧 persona 角色：${s.oldPersonaCount}`);
  console.log(`  映射条目：${Object.keys(s.mapping).length}`);
  console.log(`  目标家族 id：${ALL_FAMILY_IDS.length} 个`);
  console.log(`  单值字段更新（受影响行数 / 表.列）：`);
  for (const [k, v] of Object.entries(s.scalarUpdates)) {
    console.log(`    ${k}: ${v}`);
  }
  if (Object.keys(s.jsonUpdates).length > 0) {
    console.log(`  JSON 数组字段（受影响行数）：`);
    for (const [k, v] of Object.entries(s.jsonUpdates)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  if (Object.keys(s.objectListUpdates).length > 0) {
    console.log(`  JSON 对象列表（受影响行数）：`);
    for (const [k, v] of Object.entries(s.objectListUpdates)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  if (s.uniqueDropped && Object.keys(s.uniqueDropped).length > 0) {
    console.log(`  UNIQUE 冲突丢弃的旧行：`);
    for (const [k, v] of Object.entries(s.uniqueDropped)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  if (s.selfLoopsRemoved && Object.keys(s.selfLoopsRemoved).length > 0) {
    console.log(`  二元关系表自环：`);
    for (const [k, v] of Object.entries(s.selfLoopsRemoved)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  if (s.pairDeduped && Object.keys(s.pairDeduped).length > 0) {
    console.log(`  二元关系表 dedupe 删除：`);
    for (const [k, v] of Object.entries(s.pairDeduped)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  if (s.pairReordered && Object.keys(s.pairReordered).length > 0) {
    console.log(`  二元关系表 A<B 规范化：`);
    for (const [k, v] of Object.entries(s.pairReordered)) {
      console.log(
        `    ${k}: 交换=${v.reordered}, 撞冲突丢弃=${v.droppedAfterReorder}`,
      );
    }
  }
  if (s.aiRelationshipsMerged !== undefined) {
    console.log(
      `  characters.aiRelationships 合并到家族角色的关系条目：${s.aiRelationshipsMerged}`,
    );
  }
  if (s.familyEnsured) {
    console.log(
      `  从模板复制的 family 角色：copied=${s.familyEnsured.copied}, alreadyPresent=${s.familyEnsured.alreadyPresent}`,
    );
  }
  console.log(`  删除的旧 persona 行：${s.deletedPersonaRows}`);
}

console.log(
  DRY_RUN
    ? '🔍 DRY-RUN 模式：只计数，不写入。'
    : '⚠️  实际执行模式。请确认已备份 data/database.sqlite。',
);

const dbs = discoverDatabases();
if (dbs.length === 0) {
  console.error('❌ 没找到任何数据库（root 或 data/accounts/*/database.sqlite）');
  process.exit(1);
}

// 准备 template DB 句柄（如果有）
let templateDb = null;
if (TEMPLATE_DB) {
  if (!existsSync(TEMPLATE_DB)) {
    console.error(`❌ --template-db 指向的文件不存在：${TEMPLATE_DB}`);
    process.exit(1);
  }
  templateDb = new Database(TEMPLATE_DB, { readonly: true });
  console.log(`📋 模板 DB：${TEMPLATE_DB}`);
}

let hadError = false;
for (const dbPath of dbs) {
  // 跳过自身做模板的 DB（避免对模板做修改）
  if (TEMPLATE_DB && path.resolve(dbPath) === path.resolve(TEMPLATE_DB)) {
    console.log(`\n=== ${dbPath} ===\n  跳过：模板 DB 不参与自身迁移`);
    continue;
  }
  const summary = migrateOne(dbPath, templateDb);
  printReport(summary);
  if (summary.error) hadError = true;
}

if (templateDb) templateDb.close();

if (hadError) {
  console.log('\n❌ 至少一个 DB 失败，请回滚备份后排查。');
  process.exit(2);
}
console.log('\n✅ 完成。');
