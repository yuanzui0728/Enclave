import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from "typeorm";

@Entity("cloud_worlds")
export class CloudWorldEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  phone: string;

  @Column()
  name: string;

  @Column()
  status: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  slug: string | null;

  @Column({ default: "running" })
  desiredState: string;

  @Column({ default: "mock" })
  provisionStrategy: string;

  @Column({ type: "text", nullable: true })
  providerKey: string | null;

  @Column({ type: "text", nullable: true })
  providerRegion: string | null;

  @Column({ type: "text", nullable: true })
  providerZone: string | null;

  @Column({ type: "text", nullable: true })
  runtimeVersion: string | null;

  @Column({ type: "text", nullable: true })
  apiBaseUrl: string | null;

  @Column({ type: "text", nullable: true })
  adminUrl: string | null;

  @Column({ type: "text", nullable: true })
  callbackToken: string | null;

  @Column({ type: "text", nullable: true })
  healthStatus: string | null;

  @Column({ type: "text", nullable: true })
  healthMessage: string | null;

  @Column({ type: "datetime", nullable: true })
  lastAccessedAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastInteractiveAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastBootedAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastSuspendedAt: Date | null;

  @Column({ type: "text", nullable: true })
  failureCode: string | null;

  @Column({ type: "text", nullable: true })
  failureMessage: string | null;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
