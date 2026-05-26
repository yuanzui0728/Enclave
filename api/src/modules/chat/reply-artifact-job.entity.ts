import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ReplyArtifactJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type ReplyArtifactJobThreadType = 'conversation' | 'group';
export type ReplyArtifactJobArtifactType = 'image' | 'voice';

@Entity('reply_artifact_jobs')
@Index('idx_reply_artifact_jobs_status_execute_after', ['status', 'executeAfter'])
@Index('idx_reply_artifact_jobs_thread_status', ['threadType', 'threadId', 'status'])
@Index('idx_reply_artifact_jobs_source_status', [
  'threadType',
  'threadId',
  'sourceMessageId',
  'status',
])
export class ReplyArtifactJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属用户（后台任务必须不跨租户）。LPP 为 NULL，shared 盖当前 owner。
  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

  @Column()
  threadType: ReplyArtifactJobThreadType;

  @Column()
  threadId: string;

  @Column()
  sourceMessageId: string;

  @Column('datetime')
  sourceMessageCreatedAt: Date;

  @Column('text', { nullable: true })
  groupReplyTaskId?: string | null;

  @Column()
  characterId: string;

  @Column()
  characterName: string;

  @Column('text', { nullable: true })
  characterAvatar?: string | null;

  @Column()
  artifactType: ReplyArtifactJobArtifactType;

  @Column({ default: 'pending' })
  status: ReplyArtifactJobStatus;

  @Column('datetime')
  executeAfter: Date;

  @Column('text')
  inputPayload: string;

  @Column('text', { nullable: true })
  artifactMessageId?: string | null;

  @Column('text', { nullable: true })
  cancelReason?: string | null;

  @Column('text', { nullable: true })
  errorMessage?: string | null;

  @Column('datetime', { nullable: true })
  lastAttemptAt?: Date | null;

  @Column('datetime', { nullable: true })
  completedAt?: Date | null;

  @Column('datetime', { nullable: true })
  cancelledAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
