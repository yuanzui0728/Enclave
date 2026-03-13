import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { MomentInteraction } from './moments.service';

@Entity('moments')
export class MomentEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  authorId: string;

  @Column()
  authorName: string;

  @Column()
  authorAvatar: string;

  @Column('text')
  text: string;

  @Column({ nullable: true })
  location?: string;

  @Column('simple-json')
  interactions: MomentInteraction[];

  @CreateDateColumn()
  postedAt: Date;
}
