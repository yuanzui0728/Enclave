import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MediaInsightJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type MediaInsightJobThreadType = 'conversation' | 'group';
export type MediaInsightKind =
  | 'audio_transcription'
  | 'video_transcription'
  | 'document_text_extraction';

@Entity('media_insight_jobs')
@Index('idx_media_insight_jobs_status_execute_after', ['status', 'executeAfter'])
@Index('idx_media_insight_jobs_thread_status', ['threadType', 'threadId', 'status'])
@Index('idx_media_insight_jobs_source_unique', ['threadType', 'threadId', 'sourceMessageId'], {
  unique: true,
})
export class MediaInsightJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  threadType: MediaInsightJobThreadType;

  @Column()
  threadId: string;

  @Column()
  sourceMessageId: string;

  @Column('datetime')
  sourceMessageCreatedAt: Date;

  @Column()
  insightKind: MediaInsightKind;

  @Column({ default: 'pending' })
  status: MediaInsightJobStatus;

  @Column('datetime')
  executeAfter: Date;

  @Column({ default: 0 })
  attemptCount: number;

  @Column('text')
  sourceUrl: string;

  @Column('text', { nullable: true })
  mimeType?: string | null;

  @Column('text', { nullable: true })
  fileName?: string | null;

  @Column('text', { nullable: true })
  characterId?: string | null;

  @Column('text', { nullable: true })
  resultPayload?: string | null;

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
