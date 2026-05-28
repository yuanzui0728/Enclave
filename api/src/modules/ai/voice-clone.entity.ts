import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

// 用户「克隆自己的声音」生成的专属音色（owner-scoped）。
// minimaxVoiceId 是克隆成功后 MiniMax 返回的自定义 voice_id，可直接当作
// character.voicePreset 用（透给 t2a_v2 的 voice_setting.voice_id）。
export type VoiceCloneStatus = 'pending' | 'ready' | 'failed';

@Entity('voice_clones')
@Index(['ownerId'])
export class VoiceCloneEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 模式感知主键的 owner 部分（见文件末尾 applyOwnerIdColumn）。shared 模式下
  // 是复合主键 (ownerId,id) 的一部分；LPP/wiki 为普通可空列。
  ownerId: string | null;

  @Column()
  displayName: string;

  // 克隆成功后落 MiniMax 自定义 voice_id；pending/failed 时为 null。
  @Column({ type: 'text', nullable: true })
  minimaxVoiceId?: string | null;

  @Column({ default: 'pending' })
  status: VoiceCloneStatus;

  // MiniMax files/upload 返回的 file_id（来源样本），便于排查/重试。
  @Column({ type: 'text', nullable: true })
  sampleFileId?: string | null;

  @Column({ type: 'text', nullable: true })
  failReason?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

applyOwnerIdColumn(VoiceCloneEntity.prototype, 'ownerId', {
  type: 'text',
  nullable: true,
});
