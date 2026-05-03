import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @Column({ default: false })
  onboardingCompleted: boolean;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ nullable: true })
  signature?: string;

  @Column({ nullable: true })
  locationLat?: number;

  @Column({ nullable: true })
  locationLng?: number;

  @Column({ nullable: true })
  locationName?: string;

  // 用户自定义 AI APIKey（优先于服务器配置）
  @Column({ nullable: true, type: 'text' })
  customApiKey: string | null;

  @Column({ nullable: true, type: 'text' })
  customApiBase: string | null;

  @Column({ nullable: true, type: 'text' })
  defaultChatBackgroundPayload: string | null;

  @Column({ default: 'world_owner' })
  userType: string; // 'world_owner' | 'wiki_member'

  @Column({ default: 'newcomer' })
  role: string; // wiki RBAC: 'newcomer' | 'autoconfirmed' | 'patroller' | 'admin'

  @Column({ type: 'datetime', nullable: true })
  roleGrantedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  roleGrantedBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
