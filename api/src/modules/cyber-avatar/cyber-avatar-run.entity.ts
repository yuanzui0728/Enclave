import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

@Entity('cyber_avatar_runs')
export class CyberAvatarRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 模式感知主键（见文件末尾）：run id 跨 owner 重复（DB 已是复合 (ownerId,id)），
  // shared 下复合主键防 save/reload-by-id 跨租户。LPP 为普通列。
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

// 模式感知主键：shared=复合 (ownerId,id)；LPP/wiki/prep=单 id + 普通可空 ownerId 列。
applyOwnerIdColumn(CyberAvatarRunEntity.prototype, 'ownerId', {
  type: 'text',
  nullable: true,
});

