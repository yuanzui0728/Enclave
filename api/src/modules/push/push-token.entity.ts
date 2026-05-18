import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('push_tokens')
@Unique('uniq_push_token_per_bundle', ['platform', 'bundleId', 'token'])
@Index('idx_push_tokens_user_platform', ['userId', 'platform'])
export class PushTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  userId: string;

  // 'ios' | 'android'
  @Column({ type: 'text' })
  platform: string;

  @Column({ type: 'text' })
  token: string;

  // bundle / package id —— 区分 dev / 不同 build
  @Column({ type: 'text' })
  bundleId: string;

  // 'production' | 'development' (iOS) / 默认 'production' (Android)
  @Column({ type: 'text', default: 'production' })
  environment: string;

  @Column({ type: 'text', nullable: true })
  appVersion: string | null;

  @Column({ type: 'text', nullable: true })
  locale: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
