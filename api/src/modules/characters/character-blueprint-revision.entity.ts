import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { CharacterBlueprintRecipeValue } from './character-blueprint.types';

@Entity('character_blueprint_revisions')
export class CharacterBlueprintRevisionEntity {
  @PrimaryColumn()
  id: string;

  // 共享 world 多租户归属用户。LPP 为 NULL；shared 模式由 TenantRepository/subscriber
  // 盖当前 owner（id 为 blueprint_revision_<uuid> 全局唯一，无需复合主键）。
  @Column({ type: 'text', nullable: true })
  ownerId?: string | null;

  @Column()
  blueprintId: string;

  @Column()
  characterId: string;

  @Column()
  version: number;

  @Column('simple-json')
  recipe: CharacterBlueprintRecipeValue;

  @Column('text', { nullable: true })
  summary?: string | null;

  @Column()
  changeSource: string;

  @CreateDateColumn()
  createdAt: Date;
}
