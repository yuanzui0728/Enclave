import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("subscription_plans")
export class SubscriptionPlanEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ type: "integer" })
  durationDays: number;

  @Column({ type: "integer", default: 0 })
  priceCents: number;

  @Column({ default: "CNY" })
  currency: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isTrial: boolean;

  @Column({ default: true })
  isPubliclyPurchasable: boolean;

  @Column({ type: "integer", default: 0 })
  sortOrder: number;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
