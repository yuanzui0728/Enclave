import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('followup_runs')
export class FollowupRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'scheduler' })
  triggerType: string;

  @Column({ default: 'skipped' })
  status: string;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sourceWindowStartedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sourceWindowEndedAt?: Date | null;

  @Column({ default: 0 })
  candidateLoopCount: number;

  @Column({ default: 0 })
  selectedLoopCount: number;

  @Column({ default: 0 })
  emittedRecommendationCount: number;

  @Column('text', { nullable: true })
  summary?: string | null;

  @Column('text', { nullable: true })
  skipReason?: string | null;

  @Column('simple-json', { nullable: true })
  inputSnapshot?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  promptSnapshot?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  llmOutputPayload?: Record<string, unknown> | null;

  @Column('text', { nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
