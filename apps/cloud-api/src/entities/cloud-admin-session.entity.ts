import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("cloud_admin_sessions")
export class CloudAdminSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  currentRefreshTokenId: string;

  @Column({ type: "datetime" })
  expiresAt: Date;

  @Column({ type: "varchar", nullable: true })
  issuedFromIp: string | null;

  @Column({ type: "varchar", nullable: true })
  issuedUserAgent: string | null;

  @Column({ type: "datetime", nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: "varchar", nullable: true })
  lastUsedIp: string | null;

  @Column({ type: "varchar", nullable: true })
  lastUsedUserAgent: string | null;

  @Column({ type: "datetime", nullable: true })
  lastRefreshedAt: Date | null;

  @Index()
  @Column({ type: "datetime", nullable: true })
  revokedAt: Date | null;

  @Column({ type: "varchar", nullable: true })
  revokedBySessionId: string | null;

  @Column({ type: "varchar", nullable: true })
  revocationReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
