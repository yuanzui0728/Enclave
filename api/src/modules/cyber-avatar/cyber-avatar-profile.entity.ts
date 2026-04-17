import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cyber_avatar_profiles')
export class CyberAvatarProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ownerId: string;

  @Column({ default: 'draft' })
  status: string;

  @Column({ default: 0 })
  version: number;

  @Column('simple-json', { nullable: true })
  liveStatePayload?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  recentStatePayload?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  stableCorePayload?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  confidencePayload?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  sourceCoveragePayload?: Record<string, unknown> | null;

  @Column('simple-json', { nullable: true })
  promptProjectionPayload?: Record<string, unknown> | null;

  @Column({ type: 'integer', default: 0 })
  signalCount: number;

  @Column({ type: 'integer', default: 0 })
  pendingSignalCount: number;

  @Column({ type: 'datetime', nullable: true })
  lastSignalAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastBuiltAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastProjectedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  lastRunId?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

