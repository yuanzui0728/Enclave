import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ai_relationships')
export class AIRelationshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属用户（角色-角色关系按 world 隔离，因角色本身 per-owner）。
  // LPP 为 NULL，shared 模式盖当前 owner。
  @Column({ type: 'text', nullable: true })
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
