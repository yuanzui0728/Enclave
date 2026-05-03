import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_wiki_profiles')
export class UserWikiProfileEntity {
  @PrimaryColumn()
  userId: string;

  @Column({ default: 0 })
  editCount: number;

  @Column({ default: 0 })
  approvedEditCount: number;

  @Column({ default: 0 })
  revertedCount: number;

  @Column({ default: 0 })
  patrolledCount: number;

  @Column({ type: 'datetime', nullable: true })
  lastEditAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  autoconfirmedAt?: Date | null;
}
