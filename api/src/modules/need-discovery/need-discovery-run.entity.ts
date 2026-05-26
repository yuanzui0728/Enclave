import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('need_discovery_runs')
export class NeedDiscoveryRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属（Phase 8s——need-discovery run-ledger 原漏建 ownerId，
  // 致 cron 的「上次成功执行」节奏门跨 owner 全局判定 → 抑制其余 owner 的发现）。
  @Column({ type: 'text', nullable: true })
  ownerId?: string | null;

  @Column()
  cadenceType: string;

  @Column()
  status: string;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  windowStartedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  windowEndedAt?: Date | null;

  @Column({ default: 0 })
  signalCount: number;

  @Column({ type: 'datetime', nullable: true })
  latestSignalAt?: Date | null;

  @Column('text', { nullable: true })
  summary?: string | null;

  @Column('simple-json', { nullable: true })
  selectedNeedKeys?: string[] | null;

  @Column('text', { nullable: true })
  skipReason?: string | null;

  @Column('text', { nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
