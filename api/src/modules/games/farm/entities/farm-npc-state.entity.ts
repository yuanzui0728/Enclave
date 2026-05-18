import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  FarmCharacterMood,
  FarmPlot,
  FARM_DEFAULT_NPC_COINS,
  FARM_DEFAULT_NPC_PLOT_COUNT,
} from '../farm.types';

@Entity('farm_npc_states')
@Index('IDX_farm_npc_owner_acted', ['ownerId', 'lastActedAt'])
export class FarmNpcStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  characterId: string;

  @Column()
  ownerId: string;

  @Column({ type: 'integer', default: FARM_DEFAULT_NPC_COINS })
  coins: number;

  @Column({ type: 'integer', default: 1 })
  level: number;

  @Column({ type: 'integer', default: 0 })
  totalHarvested: number;

  @Column({ type: 'integer', default: FARM_DEFAULT_NPC_PLOT_COUNT })
  plotCount: number;

  @Column('simple-json', { nullable: true })
  plotsPayload?: FarmPlot[] | null;

  @Column('simple-json', { nullable: true })
  warehousePayload?: Record<string, number> | null;

  @Column('simple-json', { nullable: true })
  moodPayload?: FarmCharacterMood | null;

  @Column({ type: 'datetime', nullable: true })
  lastActedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastTickAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
