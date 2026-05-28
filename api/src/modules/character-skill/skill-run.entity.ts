import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { AnyArtifactSpec } from './renderers/renderer.types';
import type { SkillRunStatus } from './character-skill.types';

// 一次「角色技能产出」的跨回合状态行（报价→确认→扣费→渲染）。
// 仿 ActionRunEntity 的状态机 + 计费字段。owner-scoped（直接 ownerId 列，job 在 owner 帧跑）。
@Entity('skill_runs')
@Index('idx_skill_runs_conv_char_status', [
  'conversationId',
  'characterId',
  'status',
])
@Index('idx_skill_runs_owner_status', ['ownerId', 'status'])
export class SkillRunEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  ownerId: string;

  @Column()
  conversationId: string;

  @Column()
  characterId: string;

  @Column()
  characterSourceKey: string;

  @Column()
  skillKey: string;

  @Column()
  artifactType: string;

  @Column()
  billingActionKey: string;

  @Column('text')
  status: SkillRunStatus;

  @Column('text')
  userGoal: string;

  @Column('simple-json')
  slotPayload: Record<string, unknown>;

  @Column('simple-json')
  missingSlots: string[];

  // 报价回合产出的轻量大纲（算量用，渲染 job 据此扩成完整 spec）。
  @Column('simple-json', { nullable: true })
  outlineSpec?: AnyArtifactSpec | Record<string, unknown> | null;

  @Column('integer', { nullable: true })
  quantity?: number | null;

  @Column('integer', { nullable: true })
  quotedPriceCents?: number | null;

  // charge / refund 全程同一把（建 run 进入 awaiting_confirmation 时生成）。
  @Column('text')
  billingIdempotencyKey: string;

  @Column('text', { nullable: true })
  sourceMessageId?: string | null;

  @Column('datetime', { nullable: true })
  sourceMessageCreatedAt?: Date | null;

  // 防死循环：反复刷确认/补槽的次数上限。
  @Column('integer', { default: 0 })
  pendingFollowups: number;

  @Column('text', { nullable: true })
  artifactMessageId?: string | null;

  @Column('text', { nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
