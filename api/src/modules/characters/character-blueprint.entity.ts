import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';
import type {
  CharacterBlueprintAiGenerationTraceValue,
  CharacterBlueprintRecipeValue,
} from './character-blueprint.types';

@Entity('character_blueprints')
export class CharacterBlueprintEntity {
  @PrimaryColumn()
  id: string;

  // 共享 world 多租户：blueprint id = `blueprint_<characterId>`，preset/默认角色 id 跨
  // 租户重合 → id 与 characterId 都会撞。shared 模式把 ownerId 设为复合主键 (id,ownerId)
  // 的一部分（DB 由 step1b 建成），LPP 保持单 id 主键 + 普通 ownerId 列。见文件末尾。
  ownerId: string;

  // 原 `@Column({ unique: true })`：因 id 由 characterId 唯一派生，复合主键 (ownerId,id)
  // 已等价保证 per-owner-per-character 唯一，故去掉冗余的 owner-blind 单列 unique（否则
  // 多 owner 下同 preset characterId 撞全局 unique）。
  @Column()
  characterId: string;

  @Column()
  sourceType: string;

  @Column()
  status: string;

  @Column('simple-json')
  draftRecipe: CharacterBlueprintRecipeValue;

  @Column('simple-json', { nullable: true })
  publishedRecipe?: CharacterBlueprintRecipeValue | null;

  @Column('text', { nullable: true })
  publishedRevisionId?: string | null;

  @Column({ default: 0 })
  publishedVersion: number;

  @Column('simple-json', { nullable: true })
  lastAiGeneration?: CharacterBlueprintAiGenerationTraceValue | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// 模式感知主键：shared=复合 (id,ownerId)；LPP/wiki/prep=单 id + 普通可空 ownerId 列。
applyOwnerIdColumn(CharacterBlueprintEntity.prototype, 'ownerId');
