import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("cloud_users")
export class CloudUserEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  phone: string;

  @Column({ type: "text", nullable: true })
  displayName: string | null;

  @Index()
  @Column({ default: "active" })
  status: string;

  @Column({ type: "datetime", nullable: true })
  firstLoginAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: "text", nullable: true })
  inviteCodeId: string | null;

  @Index()
  @Column({ type: "text", nullable: true })
  invitedByCodeId: string | null;

  @Column({ default: false })
  invitedRewardGranted: boolean;

  @Column({ type: "text", nullable: true })
  registrationIp: string | null;

  @Index()
  @Column({ type: "text", nullable: true })
  registrationDeviceFingerprint: string | null;

  @Column({ type: "text", nullable: true })
  bannedReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
