import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('self_agent_heartbeat_runs')
export class SelfAgentHeartbeatRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户：每条心跳 run 归属一个 owner（同 SelfAgentRunEntity）。id 是全局唯一
  // uuid → 不会跨 owner 碰撞，普通可空列即可（不走复合主键）。登记 scoped-entities 后 afterLoad
  // 守卫 + beforeInsert 盖章生效；旧行 ownerId=NULL 被守卫白名单忽略。
  @Column({ type: 'text', nullable: true })
  ownerId?: string | null;

  @Column({ default: 'manual' })
  triggerType: string;

  @Column({ default: 'noop' })
  status: string;

  @Column('text')
  summary: string;

  @Column('text', { nullable: true })
  suggestedMessage?: string | null;

  @Column('simple-json', { nullable: true })
  findingsPayload?: Array<Record<string, unknown>> | null;

  @Column('text', { nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
