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
  system: msg`系统`,
  migration: msg`迁移`,
  import: msg`导入`,
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
