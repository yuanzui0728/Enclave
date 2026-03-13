import { Entity, PrimaryColumn, Column } from 'typeorm';
import type { PersonalityProfile } from '../ai/ai.types';

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

  @Column({ default: false })
  isTemplate: boolean;

  @Column('simple-json')
  expertDomains: string[];

  @Column('simple-json')
  profile: PersonalityProfile;
}
