import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @Column({ default: false })
  onboardingCompleted: boolean;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ nullable: true })
  signature?: string;

  @Column({ nullable: true })
  locationLat?: number;

  @Column({ nullable: true })
  locationLng?: number;

  @Column({ nullable: true })
  locationName?: string;

  @CreateDateColumn()
  createdAt: Date;
}
