import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { MessageEntity } from '../chat/message.entity';
import { SystemConfigEntity } from '../config/config.entity';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { resolveDatabasePath } from '../../database/database-path';

@Injectable()
export class AdminService {
  private readonly startTime = new Date();

  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(CharacterEntity)
    private characterRepo: Repository<CharacterEntity>,
    @InjectRepository(MessageEntity)
    private messageRepo: Repository<MessageEntity>,
    @InjectRepository(SystemConfigEntity)
    private configRepo: Repository<SystemConfigEntity>,
    private readonly config: ConfigService,
  ) {}

  async getStats() {
    const [ownerCount, characterCount, totalMessages, aiMessages] = await Promise.all([
      this.userRepo.count(),
      this.characterRepo.count(),
      this.messageRepo.count(),
      this.messageRepo.count({ where: { senderType: 'character' } }),
    ]);

    return { ownerCount, characterCount, totalMessages, aiMessages };
  }

  getSystemInfo() {
    const dbPath = resolveDatabasePath(this.config.get<string>('DATABASE_PATH'));
    let dbSizeBytes = 0;
    try {
      const stat = fs.statSync(dbPath);
      dbSizeBytes = stat.size;
    } catch {
      // ignore if file not accessible
    }

    const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    return {
      version: process.env.npm_package_version ?? '0.0.0',
      nodeVersion: process.version,
      uptimeSeconds,
      dbSizeBytes,
      dbPath,
    };
  }

  async getConfig() {
    const entries = await this.configRepo.find();
    return Object.fromEntries(entries.map((e) => [e.key, e.value]));
  }

  async setConfig(key: string, value: string) {
    const existing = await this.configRepo.findOneBy({ key });
    if (existing) {
      existing.value = value;
      await this.configRepo.save(existing);
    } else {
      await this.configRepo.save(this.configRepo.create({ key, value }));
    }
    return { success: true };
  }

  findAllCharacters() {
    return this.characterRepo.find();
  }

  async createCharacter(data: Partial<CharacterEntity>) {
    const entity = this.characterRepo.create(data);
    return this.characterRepo.save(entity);
  }

  async updateCharacter(id: string, data: Partial<CharacterEntity>) {
    await this.characterRepo.update(id, data);
    return this.characterRepo.findOneBy({ id });
  }

  async deleteCharacter(id: string) {
    await this.characterRepo.delete(id);
    return { success: true };
  }
}
