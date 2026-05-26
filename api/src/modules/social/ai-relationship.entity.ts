import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

@Entity('ai_relationships')
export class AIRelationshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属用户（角色-角色关系按 world 隔离，因角色本身 per-owner）。
  // LPP 为 NULL，shared 模式盖当前 owner。列定义按模式应用（见文件末尾）：shared 下是
  // 复合主键 (ownerId,id) 的一部分——模板播种的关系 id 跨租户重复（step1b 实测 2836/2850
  // 重合），靠复合主键避免 save(loadedRow) 误覆盖其他租户的同 id 关系。
  ownerId: string | null;

  @Column()
  characterIdA: string;

  @Column()
  characterIdB: string;

  @Column({ default: 'acquaintance' })
  relationshipType: string; // 'acquaintance' | 'friend' | 'rival' | 'mentor' | 'romantic'

  @Column({ default: 50 })
  strength: number; // 0-100

  @Column({ nullable: true })
  backstory?: string;

  @CreateDateColumn()
  createdAt: Date;
}

// 模式感知主键：shared=复合 (ownerId,id)；LPP/wiki/prep=单 id（生成 uuid）+ 普通可空列。
applyOwnerIdColumn(AIRelationshipEntity.prototype, 'ownerId', {
  type: 'text',
  nullable: true,
});
