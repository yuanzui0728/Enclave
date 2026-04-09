import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('narrative_arcs')
export class NarrativeArcEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  ownerId: string;

  @Column()
  characterId: string;

  @Column()
  title: string;

  @Column({ default: 'active' })
  status: string; // 'active' | 'completed' | 'paused'

  @Column({ default: 0 })
  progress: number; // 0-100

  @Column('simple-json', { nullable: true })
  milestones?: { label: string; completedAt?: Date }[];

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  completedAt?: Date;
}
