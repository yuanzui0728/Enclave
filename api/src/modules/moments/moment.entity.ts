import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { MomentInteraction } from './moments.service';

@Entity('moments')
export class MomentEntity {
  @PrimaryColumn()
  id: string;

  // 共享 world 多租户归属用户（legacy moments 表）。LPP 为 NULL，shared 盖当前 owner。
  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

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
