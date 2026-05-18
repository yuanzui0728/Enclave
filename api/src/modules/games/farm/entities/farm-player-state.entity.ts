import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  FarmConsumableId,
  FarmDecorationId,
  FarmDecorationPlacement,
  FarmDogState,
  FarmPlot,
  FarmStolenLogEntry,
  FARM_DEFAULT_PLAYER_COINS,
  FARM_DEFAULT_PLOT_COUNT,
} from '../farm.types';

@Entity('farm_player_states')
export class FarmPlayerStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ownerId: string;

  @Column({ type: 'integer', default: FARM_DEFAULT_PLAYER_COINS })
  coins: number;

  @Column({ type: 'integer', default: 0 })
  experience: number;

  @Column({ type: 'integer', default: 1 })
  level: number;

  // 累计收获作物数（用于排行榜），harvest 时 += amount。
  @Column({ type: 'integer', default: 0 })
  totalHarvested: number;

  @Column({ type: 'integer', default: FARM_DEFAULT_PLOT_COUNT })
  plotCount: number;

  @Column('simple-json', { nullable: true })
  plotsPayload?: FarmPlot[] | null;

  @Column('simple-json', { nullable: true })
  warehousePayload?: Record<string, number> | null;

  @Column('simple-json', { nullable: true })
  seedBagPayload?: Record<string, number> | null;

  @Column('simple-json', { nullable: true })
  weeklyStolenLogPayload?: FarmStolenLogEntry[] | null;

  // 化肥 / 农药 / 狗粮 数量，按 FarmConsumableId 索引。
  @Column('simple-json', { nullable: true })
  consumablesPayload?: Partial<Record<FarmConsumableId, number>> | null;

  // 看家狗：level=0 表示未购买；energy 0-100；lastFedAt ms。
  @Column('simple-json', { nullable: true })
  dogPayload?: FarmDogState | null;

  // 已购但还未摆出的装饰物库存（按 type 计数）。
  @Column('simple-json', { nullable: true })
  decorationInventoryPayload?: Partial<Record<FarmDecorationId, number>> | null;

  // 实际摆在农场背景层的装饰物实例。
  @Column('simple-json', { nullable: true })
  placedDecorationsPayload?: FarmDecorationPlacement[] | null;

  @Column({ type: 'datetime', nullable: true })
  lastTickAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
