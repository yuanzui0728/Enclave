import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { CharacterBlueprintRecipeValue } from '../../characters/character-blueprint.types';
import type { PersonalityProfile } from '../../ai/ai.types';

/**
 * 用户私有角色：与 character_pages（公开 wiki）平行，不走巡查审核流。
 * 同名覆盖语义由 (ownerUserId, name) 唯一索引保证。
 */
@Entity('user_private_characters')
@Unique('uq_user_private_characters_owner_name', ['ownerUserId', 'name'])
@Index(['ownerUserId', 'updatedAt'])
// 角色广场列表查询走 isPublic=true + 排序，加复合索引避免全表扫。
@Index(['isPublic', 'downloadCount'])
export class UserPrivateCharacterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerUserId: string;

  @Column()
  name: string;

  @Column({ default: '' })
  avatar: string;

  @Column({ default: '' })
  bio: string;

  @Column({ type: 'text', nullable: true })
  personality?: string | null;

  @Column({ default: '' })
  relationship: string;

  @Column({ default: 'friend' })
  relationshipType: string;

  @Column({ type: 'text', nullable: true })
  region?: string | null;

  @Column('simple-json', { default: '[]' })
  expertDomains: string[];

  @Column('simple-json', { nullable: true })
  triggerScenes?: string[] | null;

  @Column('simple-json', { nullable: true })
  recipe?: CharacterBlueprintRecipeValue | null;

  @Column('simple-json', { nullable: true })
  profile?: PersonalityProfile | null;

  // —— 2026-05-15 起：以下字段对齐隐界后台 character editor ——
  // wiki 编辑页只暴露 socialOpenness / proactiveBrowseChance / intimacyLevel
  // 这 3 个（社交参数 tab）；其余列（isOnline / isTemplate / sourceType /
  // sourceKey / deletionPolicy / onlineMode / activityMode / currentActivity /
  // aiRelationships）都是 admin-only，DB 列保留只是给 admin/cleanup 留口子。
  // model routing 字段在 WIKI_REJECTED_FIELDS 中由后端拦下，从来不入这张表。

  @Column({ type: 'boolean', default: false })
  isOnline: boolean;

  @Column({ default: 'auto' })
  onlineMode: string; // 'auto' | 'manual'

  @Column({ default: 'auto' })
  activityMode: string; // 'auto' | 'manual'

  @Column({ type: 'text', nullable: true })
  currentActivity?: string | null; // 'working' | 'eating' | 'resting' | 'commuting' | 'free' | 'sleeping'

  @Column({ default: 'manual_admin' })
  sourceType: string;

  @Column({ type: 'text', nullable: true })
  sourceKey?: string | null;

  @Column({ default: 'archive_allowed' })
  deletionPolicy: string; // 'protected' | 'archive_allowed'

  @Column({ type: 'boolean', default: false })
  isTemplate: boolean;

  @Column({ default: 'normal' })
  socialOpenness: string; // 'open' | 'normal' | 'private'

  @Column({ type: 'real', default: 0.3 })
  proactiveBrowseChance: number;

  @Column({ type: 'integer', default: 0 })
  intimacyLevel: number; // 0-100 种子，运行时会被 farm-state / social 服务自动改写

  @Column('simple-json', { nullable: true })
  aiRelationships?:
    | { characterId: string; relationshipType: string; strength: number }[]
    | null;

  // —— 2026-05-26 起：私有角色公开 / 角色广场 / 浏览·下载统计 ——
  // isPublic=true 时该角色进入「角色广场」，任何人可浏览、登录用户可下载导出。
  // viewCount / downloadCount 作为创作者激励（人工赠送会员时长）的数据基础，
  // 取消公开（isPublic=false）不清零统计，保留历史累计。publishedAt 记首次公开时间。
  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ type: 'integer', default: 0 })
  viewCount: number;

  @Column({ type: 'integer', default: 0 })
  downloadCount: number;

  @Column({ type: 'datetime', nullable: true })
  publishedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
