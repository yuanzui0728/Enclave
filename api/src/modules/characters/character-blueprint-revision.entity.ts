import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { CharacterBlueprintRecipeValue } from './character-blueprint.types';

@Entity('character_blueprint_revisions')
export class CharacterBlueprintRevisionEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  blueprintId: string;

  @Column()
  characterId: string;

  @Column()
  version: number;

  @Column('simple-json')
  recipe: CharacterBlueprintRecipeValue;

  @Column({ nullable: true })
  summary?: string | null;

  @Column()
  changeSource: string;

  @CreateDateColumn()
  createdAt: Date;
}
