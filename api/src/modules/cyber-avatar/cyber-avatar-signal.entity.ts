import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

@Entity('cyber_avatar_signals')
export class CyberAvatarSignalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 模式感知主键（见文件末尾）：signal id 跨 owner 重复（DB 已是复合 (ownerId,id)），
  // shared 下复合主键防 save/update-by-id 跨租户。LPP 为普通列。
  ownerId: string;

  @Column()
  signalType: string;

  @Column()
  sourceSurface: string;

  @Column()
  sourceEntityType: string;

  @Column()
  sourceEntityId: string;

  @Column({ type: 'text', nullable: true })
  dedupeKey?: string | null;

  @Column('text')
  summaryText: string;

  @Column('simple-json', { nullable: true })
  payload?: Record<string, unknown> | null;

  @Column({ type: 'float', default: 1 })
  weight: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// 模式感知主键：shared=复合 (ownerId,id)；LPP/wiki/prep=单 id + 普通可空 ownerId 列。
applyOwnerIdColumn(CyberAvatarSignalEntity.prototype, 'ownerId', {
  type: 'text',
  nullable: true,
});

