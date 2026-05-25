/**
 * 把后端 revision 的英文枚举字段映射成本地化标签。
 *
 * 之前 recent-changes / pending-reviews / character-page 的修订卡都裸渲染
 * `<StatusPill>{rev.operation}</StatusPill>`，中文 UI 里和 "高风险" "当前版本"
 * 并列时屏幕上出现 "approved create recipe edit" 这样的英文串，跟 wiki 顶栏
 * 切换"简体中文/日本語/한국어"完全脱节。集中放在这里方便统一翻译并未来扩展。
 */
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

const STATUS_LABELS: Record<string, MessageDescriptor> = {
  pending: msg`待审`,
  approved: msg`已通过`,
  rejected: msg`已驳回`,
  needs_changes: msg`需修改`,
  // 后端 status 枚举（character-revision.entity）含 'reverted'：被新修订回滚后旧
  // 版的终态。漏掉它 → recent-changes 里被回滚的版本 pill 直接渲染英文 "reverted"，
  // 跟同行"已通过/待审"夹一起像漏译（2026-05-25 走查发现）。
  reverted: msg`已回滚`,
  superseded: msg`已被取代`,
};

const OPERATION_LABELS: Record<string, MessageDescriptor> = {
  create: msg`创建`,
  edit: msg`编辑`,
  soft_delete: msg`删除`,
  restore: msg`恢复`,
  revert: msg`回滚`,
};

const REVISION_KIND_LABELS: Record<string, MessageDescriptor> = {
  content: msg`档案`,
  recipe: msg`逻辑`,
  lifecycle: msg`生命周期`,
  metadata: msg`元数据`,
};

const CHANGE_SOURCE_LABELS: Record<string, MessageDescriptor> = {
  edit: msg`编辑`,
  // 后端 changeSource 枚举（character-revision.entity）实为
  // 'edit' | 'revert' | 'admin_override' | 'merge' | 'ai_regen'。原 map 只覆盖了
  // edit + 三个历史值(system/migration/import)，漏了真正会出现在 recent-changes
  // 里的 revert / admin_override / merge / ai_regen —— 这些 changeSource !== 'edit'
  // 会渲染 pill，直接漏出英文枚举（2026-05-25 走查发现 reverted/revert/admin_override）。
  revert: msg`回滚`,
  admin_override: msg`管理员覆写`,
  merge: msg`合并`,
  ai_regen: msg`AI 重生成`,
  system: msg`系统`,
  migration: msg`迁移`,
  import: msg`导入`,
};

// admin/reports / admin/blocks 卡片用：targetType / reportStatus / blockScope
// 同样从后端拿英文字面量，原写法都裸渲染。
const REPORT_TARGET_LABELS: Record<string, MessageDescriptor> = {
  wiki_page: msg`词条`,
  wiki_revision: msg`修订`,
  wiki_talk_post: msg`讨论回复`,
};

const REPORT_STATUS_LABELS: Record<string, MessageDescriptor> = {
  open: msg`未处理`,
  resolved: msg`已处理`,
  dismissed: msg`已驳回`,
};

const BLOCK_SCOPE_LABELS: Record<string, MessageDescriptor> = {
  global: msg`全站`,
  page: msg`单条目`,
  talk: msg`讨论`,
};

// admin-abuse-filters 卡片用 ActionPill 自带本地化；admin-stats 的"过滤器
// 命中（近 7 天）"列表却直接拼 `动作：{filter.action}` 渲染英文枚举。
const ABUSE_FILTER_ACTION_LABELS: Record<string, MessageDescriptor> = {
  block: msg`拦截`,
  tag_high_risk: msg`标高风险`,
  warn: msg`警告`,
  log: msg`记录`,
};

// admin-abuse-filters FilterCard 原写法 `范围：{filter.scope}` 渲染英文枚举
// （"all" / "content" / "recipe"），跟 CreateFilterForm 下拉里"全部 / 仅档案 /
// 仅角色逻辑"完全对不上号。集中映射。
const ABUSE_FILTER_SCOPE_LABELS: Record<string, MessageDescriptor> = {
  all: msg`全部`,
  content: msg`仅档案`,
  recipe: msg`仅角色逻辑`,
};

function lookup(
  map: Record<string, MessageDescriptor>,
  value: string | null | undefined,
): string {
  if (!value) return "";
  const hit = map[value];
  return hit ? translateRuntimeMessage(hit) : value;
}

export const revisionStatusLabel = (v: string | null | undefined) =>
  lookup(STATUS_LABELS, v);
export const revisionOperationLabel = (v: string | null | undefined) =>
  lookup(OPERATION_LABELS, v);
export const revisionKindLabel = (v: string | null | undefined) =>
  lookup(REVISION_KIND_LABELS, v);
export const revisionChangeSourceLabel = (v: string | null | undefined) =>
  lookup(CHANGE_SOURCE_LABELS, v);
export const reportTargetLabel = (v: string | null | undefined) =>
  lookup(REPORT_TARGET_LABELS, v);
export const reportStatusLabel = (v: string | null | undefined) =>
  lookup(REPORT_STATUS_LABELS, v);
export const blockScopeLabel = (v: string | null | undefined) =>
  lookup(BLOCK_SCOPE_LABELS, v);
export const abuseFilterActionLabel = (v: string | null | undefined) =>
  lookup(ABUSE_FILTER_ACTION_LABELS, v);
export const abuseFilterScopeLabel = (v: string | null | undefined) =>
  lookup(ABUSE_FILTER_SCOPE_LABELS, v);

// ── 修订 diff 的 changed 字段列表本地化 ──
// changed 里既有真实字段路径（bio / region / prompting.coreLogic /
// lifeStrategy.activeHoursStart），也有内部哨兵（__create__ / __delete__ /
// __restore__ / __revert__ / __sync_from_character__）。recent-changes /
// character-page / pending-reviews 三处原本都 `changed.join(", ")` 裸渲染，
// 中/英/日/韩 UI 上直接漏出英文 key，甚至把哨兵显示成「字段：__create__」
// 「字段：__sync_from_character__」（2026-05-25 走查发现）。
// 处理：哨兵不是字段（其语义已由 operation/changeSource pill 表达），整组过滤；
// 真实路径走精确映射，未知路径按命名空间前缀回落到分类名，最后才兜底原 key。
const SENTINEL_FIELDS = new Set([
  "__create__",
  "__delete__",
  "__restore__",
  "__revert__",
  "__sync_from_character__",
]);

const FIELD_PATH_LABELS: Record<string, MessageDescriptor> = {
  name: msg`名称`,
  avatar: msg`头像`,
  bio: msg`简介`,
  personality: msg`性格`,
  expertDomains: msg`专长领域`,
  triggerScenes: msg`触发场景`,
  relationship: msg`关系描述`,
  relationshipType: msg`关系类型`,
  region: msg`地区`,
  "prompting.coreLogic": msg`核心逻辑`,
  "lifeStrategy.activeHoursStart": msg`活跃时段开始`,
  "lifeStrategy.activeHoursEnd": msg`活跃时段结束`,
  "lifeStrategy.momentsFrequency": msg`动态频率`,
  "lifeStrategy.feedFrequency": msg`广场频率`,
  "tone.emotionalTone": msg`情绪基调`,
};

const FIELD_NAMESPACE_LABELS: Record<string, MessageDescriptor> = {
  prompting: msg`提示词`,
  memorySeed: msg`初始记忆`,
  reasoning: msg`推理设置`,
  lifeStrategy: msg`生活策略`,
  tone: msg`语气`,
  expertise: msg`专长`,
  publishMapping: msg`发布映射`,
  identity: msg`身份`,
};

function fieldPathLabel(path: string): string {
  const exact = FIELD_PATH_LABELS[path];
  if (exact) return translateRuntimeMessage(exact);
  // recipe 改动走 diffPaths()，emit 的是带命名空间的点路径（identity.bio /
  // expertise.expertDomains / lifeStrategy.triggerScenes）；content 改动走
  // diffFields()，emit 的是扁平叶子键（bio / expertDomains / triggerScenes）。
  // 同一字段两种来源 → 点路径之前只命中下面的命名空间回落：改简介(identity.bio)
  // 被标成「身份」、改专长领域(expertise.expertDomains)被标成「专长」、改触发场景
  // (lifeStrategy.triggerScenes)被标成「生活策略」，跟扁平来源标签对不上号
  // （2026-05-25 admin 走查发现 recipe revision「字段：身份」实为只改了简介）。
  // 先用叶子段复用已映射(且已翻译)的扁平标签，命中即用精确字段名；点路径上的
  // identity.* 等叶子语义与同名扁平字段完全一致，不会误配。
  if (path.includes(".")) {
    const leaf = path.slice(path.lastIndexOf(".") + 1);
    const leafHit = FIELD_PATH_LABELS[leaf];
    if (leafHit) return translateRuntimeMessage(leafHit);
  }
  const ns = path.includes(".") ? path.split(".")[0] : undefined;
  const nsHit = ns ? FIELD_NAMESPACE_LABELS[ns] : undefined;
  if (nsHit) return translateRuntimeMessage(nsHit);
  return path;
}

/** 过滤内部哨兵后，把真实字段路径本地化并 join；全是哨兵时返回 ""（调用方据此隐藏整行）。 */
export function revisionChangedFieldsLabel(
  changed: string[] | null | undefined,
): string {
  if (!changed?.length) return "";
  const labels = changed
    .filter((c) => !SENTINEL_FIELDS.has(c))
    .map(fieldPathLabel);
  // 多个点路径回落到同一命名空间标签时去重：一次 recipe 编辑常同时动
  // reasoning.enableCoT / enableReflection / enableRouting，三者都回落到
  // 「推理设置」，原写法渲染成「字段：推理设置, 推理设置, 推理设置」。Set 去重
  // 保留首次出现顺序，消除重复串（2026-05-25 admin 走查发现）。
  return [...new Set(labels)].join(", ");
}

// ── editSummary 本地化（仅针对机器自动生成的 revert 摘要）──
// revert 版本的 editSummary 由后端 wiki-review.service.revert() 拼成
// `Revert to v{N}: {reason}`；反破坏机器人 revert 时 reason 形如
// `antivandal_bot:rapid_repeated_edits_3_in_30min` / `antivandal_bot:critical_field_cleared`。
// recent-changes / character-page / pending-reviews 都把 editSummary 当正文裸渲染，
// zh-first UI 的"回滚"行正文于是直接漏出英文前缀 + snake_case 内部码
// （2026-05-25 patroller 走查发现，如「Revert to v25: antivandal_bot:rapid_repeated_edits_3_in_30min」）。
// editSummary 后端存的是静态文本、不知道访问者 locale，只能在展示期本地化
// （同 revisionChangedFieldsLabel / use-username-map.friendlyName 的客户端口径）。
// 不匹配机器模式的 editSummary（人工自由填写，可能是任意语言）原样返回，绝不误伤。
function localizeRevertReason(reason: string): string {
  const r = reason.trim();
  if (!r) return "";
  const bot = /^antivandal_bot:(.+)$/.exec(r);
  if (!bot) return r; // 人工填写的回滚理由，原样保留
  const code = bot[1];
  const rapid = /^rapid_repeated_edits_(\d+)_in_30min$/.exec(code);
  if (rapid) {
    const count = rapid[1];
    return translateRuntimeMessage(
      msg`反破坏机器人检测到 30 分钟内连续 ${count} 次编辑`,
    );
  }
  if (code === "critical_field_cleared") {
    return translateRuntimeMessage(msg`反破坏机器人检测到关键字段被清空`);
  }
  return translateRuntimeMessage(msg`反破坏机器人自动回滚`);
}

/** revert 版本的机器自动摘要本地化；非 revert / 人工摘要原样返回。 */
export function revisionEditSummaryLabel(
  summary: string | null | undefined,
): string {
  const s = (summary ?? "").trim();
  if (!s) return "";
  const m = /^Revert to v(\d+):\s*(.*)$/.exec(s);
  if (!m) return s;
  const version = m[1];
  const reason = localizeRevertReason(m[2]);
  return reason
    ? translateRuntimeMessage(msg`回滚到 v${version}：${reason}`)
    : translateRuntimeMessage(msg`回滚到 v${version}`);
}
