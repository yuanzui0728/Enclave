import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('video_channel_follows')
@Index(['ownerId', 'authorId'], { unique: true })
export class VideoChannelFollowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  authorId: string;

  @Column({ default: 'character' })
  authorType: string; // 'user' | 'character'

  @Column({ default: false })
  muted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
