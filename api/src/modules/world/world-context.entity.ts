import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
@Entity('world_contexts')
export class WorldContextEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属用户（每用户各自的世界时间/天气快照）。LPP 为 NULL，
  // shared 模式盖当前 owner；getLatest 等查询须按 ownerId 过滤，否则串号。
  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

  @Column()
  localTime: string; // "下午三点"

  @Column({ nullable: true })
  weather?: string; // "北京今天下雪"

  @Column({ nullable: true })
  location?: string; // "上海"

  @Column({ nullable: true })
  season?: string;

  @Column({ nullable: true })
  holiday?: string; // "除夕"

  @Column('simple-json', { nullable: true })
  recentEvents?: string[];

  @CreateDateColumn()
  timestamp: Date;
}
// i18n-ignore-end
