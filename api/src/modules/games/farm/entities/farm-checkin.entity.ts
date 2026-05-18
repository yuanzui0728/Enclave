import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('farm_checkin_states')
export class FarmCheckinEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ownerId: string;

  // YYYY-MM-DD（本地时区）；签到时与 today 比对，断 1 天就重置 streak。
  @Column({ type: 'text', nullable: true })
  lastCheckinDate?: string | null;

  @Column({ type: 'integer', default: 0 })
  streak: number;

  @Column({ type: 'integer', default: 0 })
  totalCheckins: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
