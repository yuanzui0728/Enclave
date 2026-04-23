import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('inference_provider_accounts')
export class InferenceProviderAccountEntity {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { default: 'openai_compatible' })
  providerKind: string;

  @Column('text')
  endpoint: string;

  @Column('text')
  defaultModelId: string;

  @Column('text', { nullable: true })
  apiKeyEncrypted?: string | null;

  @Column('text', { default: 'cloud' })
  mode: string;

  @Column('text', { default: 'openai-chat-completions' })
  apiStyle: string;

  @Column('text', { nullable: true })
  transcriptionEndpoint?: string | null;

  @Column('text', { nullable: true })
  transcriptionModel?: string | null;

  @Column('text', { nullable: true })
  transcriptionApiKeyEncrypted?: string | null;

  @Column('text', { nullable: true })
  ttsEndpoint?: string | null;

  @Column('text', { nullable: true })
  ttsApiKeyEncrypted?: string | null;

  @Column('text', { nullable: true })
  ttsModel?: string | null;

  @Column('text', { nullable: true })
  ttsVoice?: string | null;

  @Column('text', { nullable: true })
  imageGenerationEndpoint?: string | null;

  @Column('text', { nullable: true })
  imageGenerationModel?: string | null;

  @Column('text', { nullable: true })
  imageGenerationApiKeyEncrypted?: string | null;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: true })
  isEnabled: boolean;

  @Column('text', { nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
