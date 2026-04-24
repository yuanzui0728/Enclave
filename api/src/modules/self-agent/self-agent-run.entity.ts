import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  SelfAgentRunPolicyDecisionValue,
  SelfAgentRunRouteKeyValue,
  SelfAgentRunStatusValue,
  SelfAgentRunTriggerTypeValue,
} from './self-agent.types';

@Entity('self_agent_runs')
export class SelfAgentRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  triggerType: SelfAgentRunTriggerTypeValue;

  @Column()
  status: SelfAgentRunStatusValue;

  @Column()
  routeKey: SelfAgentRunRouteKeyValue;

  @Column()
  policyDecision: SelfAgentRunPolicyDecisionValue;

  @Column({ type: 'text', nullable: true })
  conversationId?: string | null;

  @Column({ type: 'text', nullable: true })
  sourceMessageId?: string | null;

  @Column({ type: 'text', nullable: true })
  ownerId?: string | null;

  @Column({ type: 'text', nullable: true })
  characterId?: string | null;

  @Column('text')
  summary: string;

  @Column('text', { nullable: true })
  inputPreview?: string | null;

  @Column('text', { nullable: true })
  outputPreview?: string | null;

  @Column('simple-json', { nullable: true })
  detailsPayload?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
