import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("waiting_session_sync_tasks")
export class WaitingSessionSyncTaskEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  taskKey: string;

  @Column()
  taskType: string;

  @Column({ type: "text" })
  targetValue: string;

  @Column({ type: "text" })
  context: string;

  @Column({ default: 1 })
  attempt: number;

  @Column({ default: 3 })
  maxAttempts: number;

  @Index()
  @Column({ default: "pending" })
  status: string;

  @Index()
  @Column({ type: "datetime" })
  availableAt: Date;

  @Column({ type: "text", nullable: true })
  leaseOwner: string | null;

  @Column({ type: "datetime", nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: "text", nullable: true })
  lastError: string | null;

  @Column({ type: "datetime", nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
