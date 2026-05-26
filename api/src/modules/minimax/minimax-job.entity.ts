import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  MinimaxJobKind,
  MinimaxJobStatus,
  MinimaxJobTargetType,
} from './minimax-job.types';

@Entity('minimax_jobs')
@Index('idx_minimax_jobs_status_execute_after', ['status', 'executeAfter'])
@Index('idx_minimax_jobs_kind_status', ['kind', 'status'])
@Index('idx_minimax_jobs_target', ['targetType', 'targetId'])
export class MinimaxJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  kind!: MinimaxJobKind;

  @Column({ default: 'pending' })
  status!: MinimaxJobStatus;

  @Column('text')
  inputPayload!: string;

  @Column()
  model!: string;

  @Column()
  targetType!: MinimaxJobTargetType;

  @Column({ type: 'text', nullable: true })
  targetId?: string | null;

  @Column()
  characterId!: string;

  @Column()
  characterName!: string;

  @Column({ type: 'text', nullable: true })
  characterAvatar?: string | null;

  // 共享 world：入队时（请求/cron 帧内）捕获租户，处理 job 的 @Cron 轮询脱帧后据此
  // runForOwner 重建帧再 persist 媒体（owners/<ownerId>/）+ 写回 target。LPP 为 NULL。
  @Column({ type: 'text', nullable: true })
  ownerId?: string | null;

  @Column({ type: 'text', nullable: true })
  phone?: string | null;

  @Column({ type: 'text', nullable: true })
  taskId?: string | null;

  @Column({ type: 'text', nullable: true })
  fileId?: string | null;

  @Column({ type: 'text', nullable: true })
  remoteDownloadUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  localFileName?: string | null;

  @Column({ type: 'text', nullable: true })
  localUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  localMimeType?: string | null;

  @Column({ type: 'integer', nullable: true })
  localDurationMs?: number | null;

  @Column({ type: 'integer', nullable: true })
  localSize?: number | null;

  @Column({ type: 'text', nullable: true })
  coverFileName?: string | null;

  @Column({ type: 'text', nullable: true })
  coverUrl?: string | null;

  @Column({ default: 0 })
  attemptCount!: number;

  @Column('datetime')
  executeAfter!: Date;

  @Column('datetime', { nullable: true })
  lastAttemptAt?: Date | null;

  @Column('datetime', { nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  errorCode?: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
