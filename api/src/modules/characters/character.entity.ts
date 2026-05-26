import { Entity, PrimaryColumn, Column } from 'typeorm';
import type { PersonalityProfile } from '../ai/ai.types';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

@Entity('characters')
export class CharacterEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  avatar: string;

  @Column()
  relationship: string;

  @Column()
  relationshipType: string;

  @Column({ nullable: true })
  personality?: string;

  @Column()
  bio: string;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ default: 'auto' })
  onlineMode: string;

  @Column({ default: 'manual_admin' })
  sourceType: string;

  @Column('text', { nullable: true })
  sourceKey?: string | null;

  @Column({ default: 'archive_allowed' })
  deletionPolicy: string;

  @Column({ default: false })
  isTemplate: boolean;

  @Column('simple-json')
  expertDomains: string[];

  @Column('simple-json')
  profile: PersonalityProfile;

  // Activity scheduling
  @Column({ default: 'normal' })
  activityFrequency: string; // 'high' | 'normal' | 'low'

  @Column({ default: 1 })
  momentsFrequency: number; // posts per day

  @Column({ default: 1 })
  feedFrequency: number; // feed posts per week

  @Column({ nullable: true })
  activeHoursStart?: number; // 0-23

  @Column({ nullable: true })
  activeHoursEnd?: number; // 0-23

  // Scene triggers for friend requests
  @Column('simple-json', { nullable: true })
  triggerScenes?: string[]; // e.g. ['coffee_shop', 'gym', 'library']

  // Intimacy & relationship
  @Column({ default: 0 })
  intimacyLevel: number; // 0-100

  @Column({ type: 'datetime', nullable: true })
  lastActiveAt?: Date;

  // Social autonomy
  @Column({ default: 'normal' })
  socialOpenness: string; // 'open' | 'normal' | 'private'

  @Column({ type: 'float', default: 0.3 })
  proactiveBrowseChance: number; // 0-1, base probability of proactive browsing per autonomy tick

  // AI relationship network
  @Column('simple-json', { nullable: true })
  aiRelationships?: { characterId: string; relationshipType: string; strength: number }[];

  @Column({ nullable: true })
  currentStatus?: string;

  @Column({ nullable: true })
  currentActivity?: string; // 'working' | 'eating' | 'resting' | 'commuting' | 'free' | 'sleeping'

  @Column({ default: 'auto' })
  activityMode: string;

  @Column({ default: 'inherit_default' })
  modelRoutingMode: string;

  @Column('text', { nullable: true })
  inferenceProviderAccountId?: string | null;

  @Column('text', { nullable: true })
  inferenceModelId?: string | null;

  @Column({ default: true })
  allowOwnerKeyOverride: boolean;

  @Column('text', { nullable: true })
  modelRoutingNotes?: string | null;

  @Column('text', { nullable: true })
  region?: string | null;

  // 角色卡"默认用语音回复"：开启后所有 assistant 回复都会走 TTS
  // 消耗 speech-02-hd token plan 配额。
  @Column({ default: false })
  defaultVoiceReply: boolean;

  // 角色专属 MiniMax voice_id（如 male-qn-qingse / female-shaonv / audiobook_male_2）。
  // null/空 → 走 inference provider 的全局默认。所有合成都走 speech-02-hd。
  @Column('text', { nullable: true })
  voicePreset?: string | null;

  // 角色是否启用 web_search（/v1/coding_plan/search）。默认 false 避免无脑烧配额。
  // 开了之后仍需要 WebSearchService 关键词命中才会真发请求。
  @Column({ default: false })
  webSearchEnabled: boolean;

  // 共享 world 多租户归属用户。LPP 单库下为 NULL（物理隔离，findAll 不按 owner 过滤）；
  // shared 模式下迁移已回填、读查询按它过滤（见 findAllVisibleToOwner）。
  // 列定义按运行模式应用（见文件末尾 applyOwnerIdColumn）：shared 模式下 ownerId 是复合
  // 主键 (ownerId,id) 的一部分（DB 已由 step1b 建成复合主键），让 save() 按完整复合主键
  // 定位，杜绝固定 id 角色（char-default-self 等）被跨租户 save 覆盖；LPP 为普通可空列。
  ownerId: string | null;
}

// 模式感知主键：shared=复合 (ownerId,id)；LPP/wiki/prep=单 id + 普通可空 ownerId 列。
applyOwnerIdColumn(CharacterEntity.prototype, 'ownerId', {
  type: 'text',
  nullable: true,
});
