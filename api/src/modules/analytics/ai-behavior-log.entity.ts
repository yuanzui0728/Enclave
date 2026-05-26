import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ai_behavior_logs')
export class AIBehaviorLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属用户。LPP 为 NULL；shared 模式由 TenantRepository/subscriber
  // 盖当前 owner（id 为 uuid 全局唯一，无需复合主键）。
  @Column({ type: 'text', nullable: true })
  ownerId?: string | null;

  @Column()
  characterId: string;

  @Column()
  behaviorType: string; // 'moment_post' | 'feed_post' | 'friend_request' | 'comment'

  @Column({ nullable: true })
  targetId?: string;

  @Column({ nullable: true })
  triggerReason?: string;

  @Column('simple-json', { nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
