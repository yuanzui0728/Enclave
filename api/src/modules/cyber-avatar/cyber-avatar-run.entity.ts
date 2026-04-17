import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cyber_avatar_runs')
export class CyberAvatarRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  mode: string;

  @Column()
  trigger: string;

  @Column({ default: 'success' })
  status: string;

  @Column({ type: 'integer', default: 0 })
  signalCount: number;

  @Column({ type: 'integer', default: 0 })
  profileVersion: number;

  @Column({ type: 'datetime', nullable: true })
  windowStartedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  windowEndedAt?: Date | null;

  @Column('simple-json', { nullable: true })
  inputSnapshot?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  aggregationPayload?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  promptSnapshot?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  llmOutputPayload?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  mergeDiffPayload?: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  skipReason?: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

