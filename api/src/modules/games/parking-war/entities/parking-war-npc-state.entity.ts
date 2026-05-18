import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  PARKING_WAR_DEFAULT_BALANCE_CENTS,
  PARKING_WAR_DEFAULT_LOT_MULTIPLIER_BP,
  PARKING_WAR_DEFAULT_LOT_SIZE,
  PARKING_WAR_DEFAULT_LOT_SURFACE,
} from '../parking-war.constants';
import type {
  ParkingWarHomeSlot,
  ParkingWarLotSurface,
  ParkingWarMood,
  ParkingWarOwnedCar,
} from '../parking-war.types';

@Entity('parking_war_npc_states')
@Index('IDX_parking_war_npc_owner_acted', ['ownerId', 'lastActedAt'])
export class ParkingWarNpcStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  characterId: string;

  @Column()
  ownerId: string;

  @Column({ type: 'integer', default: PARKING_WAR_DEFAULT_BALANCE_CENTS })
  balanceCents: number;

  @Column({ type: 'integer', default: 0 })
  totalEarnedCents: number;

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

  @Column('simple-json', { nullable: true })
  moodPayload?: ParkingWarMood | null;

  @Column({ type: 'datetime', nullable: true })
  lastActedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastTickAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
