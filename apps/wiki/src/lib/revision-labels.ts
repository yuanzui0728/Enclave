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
