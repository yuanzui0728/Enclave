import type { SkillArtifactType } from './renderers/renderer.types';

// SkillRun 状态机：
//   awaiting_slots       — 已识别产出意图但必填信息不全，正在追问
//   awaiting_confirmation — 信息齐、已出大纲并报价，等用户回「确认」
//   charged              — 用户已确认且扣费成功，已排渲染 job（job 未跑完）
//   rendering            — 渲染 job 正在生成
//   completed            — 文件已交付
//   cancelled            — 用户拒绝 / 陈旧自动取消
//   failed               — 渲染失败（已退费 + 道歉）
export type SkillRunStatus =
  | 'awaiting_slots'
  | 'awaiting_confirmation'
  | 'charged'
  | 'rendering'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type SkillArtifactJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed';

// 技能层 handleConversationTurn 的返回值，与 chat.service 其余三层拦截同型。
export interface SkillHandlingResult {
  handled: boolean;
  responseText?: string;
}

// 渲染 job 的 inputPayload（JSON 序列化存 text 列）。其余从 SkillRun 读。
export interface SkillArtifactJobInput {
  skillRunId: string;
}

export type { SkillArtifactType };
