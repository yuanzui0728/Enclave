import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  RealWorldSyncRunStatusValue,
  RealWorldSyncRunTypeValue,
} from './real-world-sync.types';

@Entity('character_real_world_sync_runs')
export class CharacterRealWorldSyncRunEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  characterId: string;

  @Column('text')
  runType: RealWorldSyncRunTypeValue;

  @Column('text')
  status: RealWorldSyncRunStatusValue;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt?: Date | null;

  @Column('text', { nullable: true })
  searchQuery?: string | null;

  @Column({ default: 0 })
  acceptedSignalCount: number;

  @Column({ default: 0 })
  filteredSignalCount: number;

  @Column('text', { nullable: true })
  digestId?: string | null;

  @Column('text', { nullable: true })
  errorMessage?: string | null;

  @Column('simple-json', { nullable: true })
  errorPayload?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
