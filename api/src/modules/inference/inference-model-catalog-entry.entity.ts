import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('inference_model_catalog_entries')
export class InferenceModelCatalogEntryEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  label: string;

  @Column('text')
  vendor: string;

  @Column('text')
  providerFamily: string;

  @Column('text')
  region: string;

  @Column('text')
  status: string;

  @Column({ default: true })
  supportsText: boolean;

  @Column({ default: false })
  supportsVision: boolean;

  @Column({ default: false })
  supportsAudio: boolean;

  @Column({ default: false })
  supportsReasoning: boolean;

  @Column('text')
  recommendedRoleName: string;

  @Column('text')
  defaultAvatar: string;

  @Column('text', { nullable: true })
  rolePromptHint?: string | null;

  @Column('text', { nullable: true })
  description?: string | null;

  @Column('integer', { default: 0 })
  sortOrder: number;
}
