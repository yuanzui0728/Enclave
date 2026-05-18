import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  ParkingWarActorKind,
  ParkingWarEventKind,
} from '../parking-war.types';

@Entity('parking_war_event_logs')
@Index('IDX_parking_war_event_owner_created', ['ownerId', 'createdAt'])
export class ParkingWarEventLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column({ type: 'text' })
  actorKind: ParkingWarActorKind;

  @Column()
  actorId: string;

  @Column()
  actorName: string;

  @Column({ type: 'text', nullable: true })
  targetKind?: ParkingWarActorKind | null;

  @Column({ type: 'text', nullable: true })
  targetId?: string | null;

  @Column({ type: 'text', nullable: true })
  targetName?: string | null;

  @Column({ type: 'text' })
  kind: ParkingWarEventKind;

  @Column({ type: 'integer', nullable: true })
  amountCents?: number | null;

  @Column('simple-json', { nullable: true })
  payloadJson?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
