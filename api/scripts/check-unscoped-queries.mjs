#!/usr/bin/env node
// 多租户读隔离静态守卫 / 工作清单生成器。
//
// 共享 world 模式下，租户级表（按 ownerId 隔离）的查询若不经 TenantRepository 注入
// ownerId，就可能读到别人的数据。运行时有 subscriber.afterLoad 兜底（读到别人行即抛
// TENANT_READ_LEAK），但那是最后一道防线；本脚本静态扫出需要改写的查询点：
//
//   HIGH  —— scoped repo 上的 .createQueryBuilder( / 裸 .query( / manager|dataSource
//            .getRepository(ScopedEntity)：绕过仓库层，afterLoad 之外没有任何过滤，
//            最危险，--strict 下导致非零退出。
//   INFO  —— scoped repo 上的 .find/.findOne/.findBy/.count/.update/.delete：迁到
//            tenants.scoped(repo) 即可，构成读改写工作清单。
//
// 用法：
//   node scripts/check-unscoped-queries.mjs            # 报告（exit 0）
//   node scripts/check-unscoped-queries.mjs --strict   # HIGH 非空则 exit 1（CI 门）
//
// 注意：scoped 实体清单需与 src/modules/tenancy/scoped-entities.ts 保持同步。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = join(SCRIPT_DIR, '..', 'src', 'modules');
const REPO_ROOT = join(SCRIPT_DIR, '..');

// 与 tenancy/scoped-entities.ts 同步：登记为租户级的实体类名。
const SCOPED_ENTITY_NAMES = new Set([
  // 存量已带 ownerId
  'ActionRunEntity', 'AdminConversationReviewEntity', 'AiUsageLedgerEntity',
  'UserFeedInteractionEntity', 'ConversationEntity', 'ChatCustomStickerEntity',
  'CyberAvatarProfileEntity', 'CyberAvatarRealWorldBriefEntity',
  'CyberAvatarRealWorldItemEntity', 'CyberAvatarRunEntity', 'CyberAvatarSignalEntity',
  'VideoChannelFollowEntity', 'FarmCheckinEntity', 'FarmEventLogEntity',
  'FarmNpcStateEntity', 'FarmPlayerStateEntity', 'FarmQuestProgressEntity',
  'GameOwnerStateEntity', 'ParkingWarEventLogEntity', 'ParkingWarNpcStateEntity',
  'ParkingWarPlayerStateEntity', 'ModerationReportEntity', 'NarrativeArcEntity',
  'OfficialAccountDeliveryEntity', 'OfficialAccountFollowEntity',
  'OfficialAccountServiceMessageEntity', 'ReminderTaskEntity', 'SelfAgentRunEntity',
  'FriendRequestEntity', 'FriendshipEntity',
  // 本轮新加 ownerId
  'FeedPostEntity', 'FeedCommentEntity', 'FeedPostLikeEntity', 'MomentPostEntity',
  'MomentCommentEntity', 'MomentLikeEntity', 'MomentEntity', 'MessageEntity',
  'GroupEntity', 'GroupMemberEntity', 'GroupMessageEntity', 'GroupReplyTaskEntity',
  'ReplyArtifactJobEntity', 'MediaInsightJobEntity', 'FavoriteEntity',
  'FavoriteNoteEntity', 'AIRelationshipEntity', 'CharacterFriendshipEntity',
  'WorldContextEntity', 'CharacterEntity',
]);

const HIGH_METHODS = ['createQueryBuilder', 'query'];
const INFO_METHODS = ['find', 'findOne', 'findOneBy', 'findBy', 'count', 'update', 'delete', 'findAndCount', 'increment', 'decrement', 'insert', 'upsert'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

// 解析 @InjectRepository(XEntity) ... fooRepo: 映射 repo 变量名 → 实体名。
function repoVarToEntity(src) {
  const map = new Map();
  const re = /@InjectRepository\(\s*(\w+)\s*\)[\s\S]{0,120}?(\w+)\s*:\s*Repository</g;
  let m;
  while ((m = re.exec(src))) {
    map.set(m[2], m[1]);
  }
  return map;
}

const high = [];
const info = [];

for (const file of walk(MODULES_DIR)) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes('Repository')) continue;
  const map = repoVarToEntity(src);
  // 只关心至少注入了一个 scoped repo 的文件
  const scopedVars = [...map.entries()].filter(([, ent]) => SCOPED_ENTITY_NAMES.has(ent));
  if (scopedVars.length === 0 && !/getRepository\(/.test(src)) continue;

  const lines = src.split('\n');
  lines.forEach((line, i) => {
    for (const [varName, ent] of scopedVars) {
      for (const method of HIGH_METHODS) {
        if (line.includes(`this.${varName}.${method}(`)) {
          high.push({ file, line: i + 1, ent, varName, method, text: line.trim() });
        }
      }
      for (const method of INFO_METHODS) {
        if (line.includes(`this.${varName}.${method}(`)) {
          info.push({ file, line: i + 1, ent, varName, method });
        }
      }
    }
    // 裸 getRepository(ScopedEntity)
    const gr = line.match(/getRepository\(\s*(\w+)\s*\)/);
    if (gr && SCOPED_ENTITY_NAMES.has(gr[1])) {
      high.push({ file, line: i + 1, ent: gr[1], varName: '(getRepository)', method: 'getRepository', text: line.trim() });
    }
  });
}

const rel = (f) => relative(REPO_ROOT, f);
const strict = process.argv.includes('--strict');

console.log(`\n=== 多租户读隔离扫描 ===`);
console.log(`HIGH（绕过仓库层，需手工加 ownerId 过滤）：${high.length}`);
for (const h of high) {
  console.log(`  ${rel(h.file)}:${h.line}  ${h.ent}.${h.method}  ${h.text ?? ''}`.slice(0, 160));
}

// INFO 按文件聚合，作为读改写工作清单
const byFile = new Map();
for (const it of info) {
  const key = rel(it.file);
  byFile.set(key, (byFile.get(key) ?? 0) + 1);
}
console.log(`\nINFO（scoped repo 直查，迁 tenants.scoped(repo) 工作清单）：${info.length} 处，分布：`);
for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}\t${f}`);
}

if (strict && high.length > 0) {
  console.error(`\n[strict] 存在 ${high.length} 处绕过仓库层的 scoped 查询，请加 ownerId 过滤。`);
  process.exit(1);
}
console.log('');
