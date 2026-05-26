import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ type: 'text', nullable: true, unique: true })
  email: string | null;

  @Column({ type: 'datetime', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  passwordHash: string | null;

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

  // 共享 world 多租户：把每个 world_owner 行映射到一个云端用户 phone。LPP 每用户
  // 进程里的旧 owner 行 / wiki_member 行没有 phone（NULL）；SQLite 下多个 NULL 在
  // UNIQUE 索引里互不冲突，所以存量行不受影响。shared 模式下 ensureOwnerForPhone
  // 用它建档 + 查回当前请求的 owner。
  @Column({ type: 'text', nullable: true, unique: true })
  cloudPhone: string | null;

  @Column({ default: 'newcomer' })
  role: string; // wiki RBAC: 'newcomer' | 'autoconfirmed' | 'patroller' | 'admin'

  @Column({ type: 'datetime', nullable: true })
  roleGrantedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  roleGrantedBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
