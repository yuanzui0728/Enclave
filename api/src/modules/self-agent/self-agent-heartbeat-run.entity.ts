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
