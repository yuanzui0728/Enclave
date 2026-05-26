import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  RealWorldSignalStatusValue,
  RealWorldSignalTypeValue,
} from './real-world-sync.types';

@Entity('character_real_world_signals')
export class CharacterRealWorldSignalEntity {
  @PrimaryColumn()
  id: string;

  // 共享 world 多租户归属（Phase 8r·9——real-world-sync 子系统原漏建 ownerId）。
  @Column({ type: 'text', nullable: true })
  ownerId?: string | null;

  @Column()
  characterId: string;

  @Column()
  syncDate: string;

  @Column('text')
  signalType: RealWorldSignalTypeValue;

  @Column('text')
  title: string;

  @Column()
  sourceName: string;

  @Column('text', { nullable: true })
  sourceUrl?: string | null;

  @Column({ type: 'datetime', nullable: true })
  publishedAt?: Date | null;

  @Column({ type: 'datetime' })
  capturedAt: Date;

  @Column('text', { nullable: true })
  snippet?: string | null;

  @Column('text', { nullable: true })
  normalizedSummary?: string | null;

  @Column('float', { default: 0 })
  credibilityScore: number;

  @Column('float', { default: 0 })
  relevanceScore: number;

  @Column('float', { default: 0 })
  identityMatchScore: number;

  @Column()
  dedupeHash: string;

  @Column('text')
  status: RealWorldSignalStatusValue;

  @Column('simple-json', { nullable: true })
  metadataPayload?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
