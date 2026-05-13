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

  @Column('simple-json', { default: '[]' })
  expertDomains: string[];

  @Column('simple-json', { nullable: true })
  triggerScenes?: string[] | null;

  @Column('simple-json', { nullable: true })
  recipe?: CharacterBlueprintRecipeValue | null;

  @Column('simple-json', { nullable: true })
  profile?: PersonalityProfile | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
