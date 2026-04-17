import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('game_catalog_entries')
export class GameCatalogEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  slogan: string;

  @Column('text')
  description: string;

  @Column('text')
  studio: string;

  @Column('text')
  badge: string;

  @Column('text')
  heroLabel: string;

  @Column('text')
  category: string;

  @Column('text')
  tone: string;

  @Column('text')
  playersLabel: string;

  @Column('text')
  friendsLabel: string;

  @Column('text')
  updateNote: string;

  @Column('text')
  deckLabel: string;

  @Column('text')
  estimatedDuration: string;

  @Column('text')
  rewardLabel: string;

  @Column('text')
  sessionObjective: string;

  @Column('simple-json')
  tagsPayload: string[];

  @Column('text')
  publisherKind: string;

  @Column('text')
  productionKind: string;

  @Column('text')
  runtimeMode: string;

  @Column('text')
  reviewStatus: string;

  @Column('text')
  visibilityScope: string;

  @Column('text', { nullable: true })
  sourceCharacterId?: string | null;

  @Column('text', { nullable: true })
  sourceCharacterName?: string | null;

  @Column('simple-json')
  aiHighlightsPayload: string[];

  @Column('integer', { default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
