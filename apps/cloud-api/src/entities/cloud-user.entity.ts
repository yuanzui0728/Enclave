import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("cloud_users")
export class CloudUserEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "text", nullable: true })
  phone: string | null;

  @Column({ type: "text", nullable: true })
  email: string | null;

  @Column({ type: "datetime", nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: "text", nullable: true })
  displayName: string | null;

  @Index()
  @Column({ default: "active" })
  status: string;

  @Column({ type: "datetime", nullable: true })
  firstLoginAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastLoginAt: Date | null;

  // 会员到期 + 24h 未登录被 sweeper 设为 now；guard 比 JWT 的 iat：
  // iat*1000 <= sessionInvalidAfter 时抛 401。重新登录拿到 iat=now 的新 JWT 自然
  // > 此字段，无需手动 reset；续费成功路径里也会主动清回 null 让旧 JWT 复活。
  @Column({ type: "datetime", nullable: true })
  sessionInvalidAfter: Date | null;

  @Column({ type: "text", nullable: true })
  inviteCodeId: string | null;

  @Index()
  @Column({ type: "text", nullable: true })
  invitedByCodeId: string | null;

  @Column({ default: false })
  invitedRewardGranted: boolean;

  @Column({ type: "text", nullable: true })
  registrationIp: string | null;

  @Column({ type: "text", nullable: true })
  lastLoginIp: string | null;

  // 'mobile' | 'desktop' | null（未识别 / 未登录过）
  // 写入：4 条登录路径都调 classifyDeviceType()：先看前端上报的 clientPlatform
  // (ios/android/desktop)，web 或缺省回落到 server-side UA。device 无法回填，
  // 老用户保持 null 直到下次登录。
  @Column({ type: "text", nullable: true })
  lastLoginDeviceType: string | null;

  // 末次登录 IP 经 IpRegionService 解析后的省/州（中文优先，ipinfo.io 命中走
  // cn-region-i18n 翻译）。和 lastLoginIp 同时写。null 表示未解析或解析失败。
  @Column({ type: "text", nullable: true })
  lastLoginRegion: string | null;

  // ISO-3166-1 alpha-2，供「国内 vs 海外」聚合 / 国旗图标使用。
  @Column({ type: "text", nullable: true })
  lastLoginCountryCode: string | null;

  @Index()
  @Column({ type: "text", nullable: true })
  registrationDeviceFingerprint: string | null;

  @Column({ type: "text", nullable: true })
  bannedReason: string | null;

  @Column({ type: "text", nullable: true })
  passwordHash: string | null;

  @Column({ type: "datetime", nullable: true })
  passwordUpdatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
