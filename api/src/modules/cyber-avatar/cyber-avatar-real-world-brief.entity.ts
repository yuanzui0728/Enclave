import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

@Entity('cyber_avatar_real_world_briefs')
export class CyberAvatarRealWorldBriefEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 模式感知主键（见文件末尾）：brief id 跨 owner 重复（DB 已是复合 (ownerId,id)），
  // shared 下复合主键防 save/reload-by-id 跨租户。LPP 为普通列。
  ownerId: string;

  @Column({ default: 'active' })
  status: string;

  @Column()
  briefDate: string;

  @Column('text')
  title: string;

  @Column('text')
  summary: string;

  @Column('simple-json', { nullable: true })
  bulletPoints?: string[] | null;

  @Column('simple-json', { nullable: true })
  queryHints?: string[] | null;

  @Column('simple-json', { nullable: true })
  needSignals?: string[] | null;

  @Column('simple-json', { nullable: true })
  relatedItemIds?: string[] | null;

  @Column('simple-json', { nullable: true })
  metadataPayload?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// 模式感知主键：shared=复合 (ownerId,id)；LPP/wiki/prep=单 id + 普通可空 ownerId 列。
applyOwnerIdColumn(CyberAvatarRealWorldBriefEntity.prototype, 'ownerId', {
  type: 'text',
  nullable: true,
});
