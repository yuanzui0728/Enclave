import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

@Entity('cyber_avatar_profiles')
export class CyberAvatarProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 模式感知主键（见文件末尾 applyOwnerIdColumn）：shared 模式下 ownerId 是复合主键
  // (ownerId,id) 的一部分（DB 已由 cutover step1b 建成复合主键）。profile 的 id 是空模板
  // 播种的固定 uuid（31 个 owner 共用同一个 4a1f13a0…）→ 单 id 主键下 save(loadedProfile)
  // 会按 WHERE id=? reload 命中最早 owner 的行 → afterLoad 泄漏 + 跨租户覆盖。LPP 为普通列。
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

// 模式感知主键：shared=复合 (ownerId,id)；LPP/wiki/prep=单 id + 普通可空 ownerId 列。
applyOwnerIdColumn(CyberAvatarProfileEntity.prototype, 'ownerId', {
  type: 'text',
  nullable: true,
});

