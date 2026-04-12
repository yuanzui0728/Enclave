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

  // AI relationship network
  @Column('simple-json', { nullable: true })
  aiRelationships?: { characterId: string; relationshipType: string; strength: number }[];

  @Column({ nullable: true })
  currentStatus?: string;

  @Column({ nullable: true })
  currentActivity?: string; // 'working' | 'eating' | 'resting' | 'commuting' | 'free' | 'sleeping'

  @Column({ default: 'auto' })
  activityMode: string;
}
