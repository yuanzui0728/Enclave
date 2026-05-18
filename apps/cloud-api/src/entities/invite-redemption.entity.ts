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

  // 注意：这里 typeorm 装饰器 *不要* 写 unique。
  // 真正的唯一约束是 partial unique（只对 status='rewarded' 行）——见迁移
  // 1778665000000-partial-unique-invitee-redemption。TypeORM 不支持 partial
  // 索引装饰器，所以这边只挂普通索引，靠迁移建 partial 唯一。
  @Index()
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

  // 被邀请人那一份 invite_reward 订阅；admin 拒兑时双边一起 revoke，否则只回退
  // inviter 这一份会留下"邀请人扣了，被邀请人没扣"的漏洞。
  @Column({ type: "text", nullable: true })
  inviteeRewardSubscriptionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
