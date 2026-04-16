import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_usage_ledger')
export class AiUsageLedgerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt: Date;

  @Column({ type: 'text', nullable: true })
  requestId?: string | null;

  @Column({ default: 'success' })
  status: string;

  @Column()
  surface: string;

  @Column()
  scene: string;

  @Column()
  scopeType: string;

  @Column({ type: 'text', nullable: true })
  scopeId?: string | null;

  @Column({ type: 'text', nullable: true })
  scopeLabel?: string | null;

  @Column({ type: 'text', nullable: true })
  ownerId?: string | null;

  @Column({ type: 'text', nullable: true })
  characterId?: string | null;

  @Column({ type: 'text', nullable: true })
  characterName?: string | null;

  @Column({ type: 'text', nullable: true })
  conversationId?: string | null;

  @Column({ type: 'text', nullable: true })
  groupId?: string | null;

  @Column({ type: 'text', nullable: true })
  providerKey?: string | null;

  @Column({ type: 'text', nullable: true })
  providerMode?: string | null;

  @Column({ type: 'text', nullable: true })
  model?: string | null;

  @Column({ type: 'text', nullable: true })
  apiStyle?: string | null;

  @Column({ type: 'text', nullable: true })
  billingSource?: string | null;

  @Column({ type: 'integer', nullable: true })
  promptTokens?: number | null;

  @Column({ type: 'integer', nullable: true })
  completionTokens?: number | null;

  @Column({ type: 'integer', nullable: true })
  totalTokens?: number | null;

  @Column({ type: 'float', nullable: true })
  inputUnitPrice?: number | null;

  @Column({ type: 'float', nullable: true })
  outputUnitPrice?: number | null;

  @Column({ type: 'float', nullable: true })
  estimatedCost?: number | null;

  @Column({ default: 'CNY' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  rawUsagePayload?: string | null;

  @Column({ type: 'text', nullable: true })
  errorCode?: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
