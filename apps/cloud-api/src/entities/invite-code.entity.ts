import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("invite_codes")
export class InviteCodeEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @Index({ unique: true })
  @Column()
  ownerUserId: string;

  @Column({ type: "integer", default: 0 })
  redeemCount: number;

  @Column({ type: "integer", default: 0 })
  rewardDaysGranted: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
