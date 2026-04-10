import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  CharacterBlueprintAiGenerationTraceValue,
  CharacterBlueprintRecipeValue,
} from './character-blueprint.types';

@Entity('character_blueprints')
export class CharacterBlueprintEntity {
  @PrimaryColumn()
  id: string;

  @Column({ unique: true })
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
