import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { SkillArtifactJobStatus } from './character-skill.types';

// 异步渲染 job（仿 ReplyArtifactJobEntity）。Cron 全局轮询，故冗余 conversation/character/billing
// 字段以免每次 join SkillRun。真正的规格从 SkillRun.outlineSpec 读。
@Entity('skill_artifact_jobs')
@Index('idx_skill_artifact_jobs_status_execute_after', [
  'status',
  'executeAfter',
])
export class SkillArtifactJobEntity {
  @PrimaryColumn()
  id: string;

  // 共享 world 多租户归属（后台任务必须不跨租户）。LPP 为 NULL，shared 盖当前 owner。
  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

  @Column()
  skillRunId: string;

  @Column()
  conversationId: string;

  @Column()
  characterId: string;

  @Column()
  characterName: string;

  @Column('text', { nullable: true })
  characterAvatar?: string | null;

  @Column()
  artifactType: string;

  @Column()
  billingActionKey: string;

  @Column('text')
  billingIdempotencyKey: string;

  @Column('text', { nullable: true })
  sourceMessageId?: string | null;

  @Column('datetime', { nullable: true })
  sourceMessageCreatedAt?: Date | null;

  @Column({ type: 'text', default: 'pending' })
  status: SkillArtifactJobStatus;

  @Column('datetime')
  executeAfter: Date;

  @Column('text')
  inputPayload: string;

  @Column('text', { nullable: true })
  artifactMessageId?: string | null;

  @Column('text', { nullable: true })
  errorMessage?: string | null;

  @Column('datetime', { nullable: true })
  lastAttemptAt?: Date | null;

  @Column('datetime', { nullable: true })
  completedAt?: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
