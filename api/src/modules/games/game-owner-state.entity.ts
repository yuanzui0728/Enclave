import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('game_owner_states')
export class GameOwnerStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ownerId: string;

  @Column('text', { nullable: true })
  activeGameId?: string | null;

  @Column('simple-json', { nullable: true })
  recentGameIdsPayload?: string[] | null;

  @Column('simple-json', { nullable: true })
  pinnedGameIdsPayload?: string[] | null;

  @Column('simple-json', { nullable: true })
  launchCountByIdPayload?: Record<string, number> | null;

  @Column('simple-json', { nullable: true })
  lastOpenedAtByIdPayload?: Record<string, string> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
