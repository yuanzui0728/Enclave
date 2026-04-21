import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  RealWorldDigestApplyModeValue,
  RealWorldDigestStatusValue,
  RealWorldScenePatchPayloadValue,
} from './real-world-sync.types';

@Entity('character_real_world_digests')
export class CharacterRealWorldDigestEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  characterId: string;

  @Column()
  syncDate: string;

  @Column('text')
  status: RealWorldDigestStatusValue;

  @Column('simple-json')
  signalIds: string[];

  @Column('text')
  dailySummary: string;

  @Column('text', { nullable: true })
  behaviorSummary?: string | null;

  @Column('text', { nullable: true })
  stanceShiftSummary?: string | null;

  @Column('simple-json')
  scenePatchPayload: RealWorldScenePatchPayloadValue;

  @Column('text', { nullable: true })
  globalOverlay?: string | null;

  @Column('text', { nullable: true })
  realityMomentAnchorSignalId?: string | null;

  @Column('text', { nullable: true })
  realityMomentBrief?: string | null;

  @Column('text', { nullable: true })
  appliedMode?: RealWorldDigestApplyModeValue | null;

  @Column({ type: 'datetime', nullable: true })
  appliedAt?: Date | null;

  @Column('simple-json', { nullable: true })
  generationTracePayload?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
