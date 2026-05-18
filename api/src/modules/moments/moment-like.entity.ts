import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('moment_likes')
@Index('idx_moment_likes_postId', ['postId'])
// 注意：(postId, authorId) 的 UNIQUE 索引故意不通过 @Index({ unique: true }) 装饰器
// 声明——TypeORM synchronize 早于 onModuleInit 跑，老库残留的重复行会让
// synchronize 直接卡死整个 child 启动（见 CLAUDE.md 中 entity unique index 陷阱）。
// 改在 MomentsService.ensureMomentUniqueIndexes() 里 DELETE 去重后 CREATE UNIQUE
// INDEX IF NOT EXISTS（uniq_moment_likes_post_author），幂等。
export class MomentLikeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  postId: string;

  @Column()
  authorId: string;

  @Column()
  authorName: string;

  @Column()
  authorAvatar: string;

  @Column({ default: 'character' })
  authorType: string; // 'user' | 'character'

  @CreateDateColumn()
  createdAt: Date;
}
