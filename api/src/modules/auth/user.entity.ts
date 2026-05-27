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

  // 分身相遇：仅在双方都「想要」时披露给对方的真实联系方式（微信/手机号等）。
  @Column({ type: 'text', nullable: true })
  encounterContactField: string | null;

  // 联系方式类型：'wechat' | 'phone' | 'other'，决定前端展示文案。
  @Column({ type: 'text', nullable: true })
  encounterContactKind: string | null;

  // 是否允许我的分身参与社交相遇。默认开启（产品决策：默认进池，设置里可关）。
  // SQLite ADD COLUMN DEFAULT 1 会把存量 owner 行回填为已开启。
  @Column({ default: true })
  encounterOptedIn: boolean;

  // 个人资料：用户主动填写的结构化信息，用于注入 AI 角色对话 prompt（让角色「知道」
  // 与自己对话的真人是谁），更好地服务用户。全部 nullable —— synchronize 加可空列是
  // 纯增量、存量行不受影响（注意：只有 unique 复合索引才是 synchronize 陷阱）。
  // 隐私边界：联系方式(encounterContactField) 故意不在此列、不进 prompt，仍仅用于分身相遇双向披露。
  @Column({ type: 'text', nullable: true })
  gender: string | null; // 'male' | 'female' | 'other'

  @Column({ type: 'int', nullable: true })
  age: number | null;

  @Column({ type: 'text', nullable: true })
  occupation: string | null;

  // 常驻城市/所在地：用户手填，跟 GPS 派生的 locationName（雷达/相遇定位）区分开。
  @Column({ type: 'text', nullable: true })
  region: string | null;

  @Column({ type: 'text', nullable: true })
  interests: string | null;

  // 希望 AI 怎么称呼你 / 语气偏好。
  @Column({ type: 'text', nullable: true })
  aiAddressTone: string | null;

  // 不希望聊到的话题。
  @Column({ type: 'text', nullable: true })
  avoidTopics: string | null;

  @Column({ default: 'newcomer' })
  role: string; // wiki RBAC: 'newcomer' | 'autoconfirmed' | 'patroller' | 'admin'

  @Column({ type: 'datetime', nullable: true })
  roleGrantedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  roleGrantedBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
