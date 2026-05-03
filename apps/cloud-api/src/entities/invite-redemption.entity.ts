import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("invite_redemptions")
export class InviteRedemptionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column()
  codeId: string;

  @Column()
  inviterUserId: string;

  @Index({ unique: true })
  @Column()
  inviteeUserId: string;

  @Index()
  @Column()
  inviteePhone: string;

  @Index()
  @Column({ type: "text", nullable: true })
  inviteeIp: string | null;

  @Index()
  @Column({ type: "text", nullable: true })
  inviteeDeviceFingerprint: string | null;

  @Column({ default: "rewarded" })
  status: string;

  @Column({ type: "text", nullable: true })
  rejectReason: string | null;

  @Column({ type: "text", nullable: true })
  rewardSubscriptionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
