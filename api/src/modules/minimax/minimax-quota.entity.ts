import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('minimax_quota_usage')
@Index('uq_minimax_quota_model_date', ['model', 'usageDate'], { unique: true })
export class MinimaxQuotaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  model!: string;

  @Column()
  usageDate!: string;

  @Column({ default: 0 })
  reserved!: number;

  @Column({ default: 0 })
  committed!: number;

  // minimax 返回 2056/1042 时写入；同一 usageDate 内任何进程命中此列即直接熔断。
  // 跨日（usageDate 变化）后新行 NULL → 自然解封。null = 当日未耗尽。
  @Column({ type: 'datetime', nullable: true })
  exhaustedAt!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
