import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("world_access_sessions")
export class WorldAccessSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column()
  worldId: string;

  @Index()
  @Column()
  phone: string;

  @Index()
  @Column()
  status: string;

  @Column()
  phase: string;

  @Column({ type: "text" })
  displayStatus: string;

  @Column({ type: "text", nullable: true })
  resolvedApiBaseUrl: string | null;

  @Column({ default: 2 })
  retryAfterSeconds: number;

  @Column({ type: "int", nullable: true })
  estimatedWaitSeconds: number | null;

  @Column({ type: "text", nullable: true })
  failureReason: string | null;

  @Column({ type: "text", nullable: true })
  clientPlatform: string | null;

  @Column({ type: "text", nullable: true })
  clientVersion: string | null;

  @Column({ type: "datetime", nullable: true })
  expiresAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
