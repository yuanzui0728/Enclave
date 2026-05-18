import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  ParkingWarActorKind,
  ParkingWarCarTier,
  ParkingWarRarity,
} from '../parking-war.types';

/**
 * 跨用户的「我把车停在你家」关系。
 *
 * 唯一复合索引 (lotOwnerKind, lotOwnerId, slotIndex) 与
 * (visitorKind, visitorId, carId) **不**写为 @Index({unique: true})，
 * 因为 TypeORM synchronize 早于 onModuleInit，旧库里若已存在重复行会卡死服务启动
 * （见 memory feedback_entity_unique_index_synchronize_trap.md）。
 * 这两个唯一索引由 ParkingWarStateService.onModuleInit() 里
 * `CREATE UNIQUE INDEX IF NOT EXISTS` 兜底。
 */
@Entity('parking_war_occupancies')
@Index('IDX_parking_war_occupancy_lot', ['lotOwnerKind', 'lotOwnerId'])
@Index('IDX_parking_war_occupancy_visitor', ['visitorKind', 'visitorId'])
export class ParkingWarOccupancyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  lotOwnerKind: ParkingWarActorKind;

  @Column()
  lotOwnerId: string;

  @Column({ type: 'integer' })
  slotIndex: number;

  @Column({ type: 'text' })
  visitorKind: ParkingWarActorKind;

  @Column()
  visitorId: string;

  @Column()
  carId: string;

  @Column({ type: 'text' })
  carTier: ParkingWarCarTier;

  @Column({ type: 'text' })
  carRarity: ParkingWarRarity;

  @Column({ type: 'integer', default: 1 })
  carLevel: number;

  @Column({ type: 'integer', default: 0 })
  carPaintIndex: number;

  @Column({ type: 'text', nullable: true })
  carPlate?: string | null;

  @Column({ type: 'bigint' })
  parkedAtMs: number;

  @Column({ type: 'integer', default: 0 })
  pendingEarningsCents: number;

  @Column({ type: 'integer', default: 0 })
  warningLevel: number;

  @Column({ type: 'bigint', nullable: true })
  warnedAtMs?: number | null;

  @Column({ type: 'bigint', nullable: true })
  ticketedAtMs?: number | null;

  @Column({ type: 'bigint', nullable: true })
  towableAtMs?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
