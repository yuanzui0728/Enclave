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

  // 走查 yuanzui0728 本次 R5：MiniMax 2056 status_msg 携带的 "resets at <ISO>"。
  // 5h-window 撞 2056 时通常 1-5h 后；daily limit 撞 2056 时通常 next-day 00:00 Shanghai。
  // 旧行 NULL → isExhaustedToday 兜底沿用 next-day 00:00 Shanghai（与改前等价）。
  // tryReserve / isExhausted 比对 Date.now() 决定是否仍熔断，让 5h-window 一恢复
  // 当 process 就立刻继续消费，不再每个 5h-window 都被锁到明天。
  @Column({ type: 'datetime', nullable: true })
  exhaustedUntil!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
