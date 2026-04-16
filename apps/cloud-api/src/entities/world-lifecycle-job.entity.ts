import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("world_lifecycle_jobs")
export class WorldLifecycleJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column()
  worldId: string;

  @Column()
  jobType: string;

  @Index()
  @Column()
  status: string;

  @Column({ default: 100 })
  priority: number;

  @Column({ type: "simple-json", nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ default: 0 })
  attempt: number;

  @Column({ default: 3 })
  maxAttempts: number;

  @Column({ type: "text", nullable: true })
  leaseOwner: string | null;

  @Column({ type: "datetime", nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  availableAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  startedAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  finishedAt: Date | null;

  @Column({ type: "text", nullable: true })
  failureCode: string | null;

  @Column({ type: "text", nullable: true })
  failureMessage: string | null;

  @Column({ type: "simple-json", nullable: true })
  resultPayload: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
