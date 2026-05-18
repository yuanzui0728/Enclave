import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  PARKING_WAR_DEFAULT_BALANCE_CENTS,
  PARKING_WAR_DEFAULT_GARAGE_SLOTS,
  PARKING_WAR_DEFAULT_LOT_MULTIPLIER_BP,
  PARKING_WAR_DEFAULT_LOT_SIZE,
  PARKING_WAR_DEFAULT_LOT_SURFACE,
} from '../parking-war.constants';
import type {
  ParkingWarDailyTasksPayload,
  ParkingWarHomeSlot,
  ParkingWarLotSurface,
  ParkingWarOwnedCar,
} from '../parking-war.types';

@Entity('parking_war_player_states')
export class ParkingWarPlayerStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ownerId: string;

  @Column({ type: 'integer', default: PARKING_WAR_DEFAULT_BALANCE_CENTS })
  balanceCents: number;

  @Column({ type: 'integer', default: 0 })
  totalEarnedCents: number;

  @Column({ type: 'integer', default: PARKING_WAR_DEFAULT_GARAGE_SLOTS })
  garageSlots: number;

  @Column({ type: 'integer', default: PARKING_WAR_DEFAULT_LOT_SIZE })
  lotSize: number;

  @Column({ type: 'text', default: PARKING_WAR_DEFAULT_LOT_SURFACE })
  lotSurface: ParkingWarLotSurface;

  @Column({ type: 'integer', default: PARKING_WAR_DEFAULT_LOT_MULTIPLIER_BP })
  lotMultiplierBp: number;

  @Column('simple-json', { nullable: true })
  ownedCarsPayload?: ParkingWarOwnedCar[] | null;

  @Column('simple-json', { nullable: true })
  homeSlotsPayload?: ParkingWarHomeSlot[] | null;

  @Column({ type: 'datetime', nullable: true })
  lastTickAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  lastDailyBonusKey?: string | null;

  @Column({ type: 'integer', default: 0 })
  streakDays: number;

  @Column('simple-json', { nullable: true })
  dailyTasksPayload?: ParkingWarDailyTasksPayload | null;

  @Column({ type: 'integer', default: 0 })
  dailyShieldRemaining: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
