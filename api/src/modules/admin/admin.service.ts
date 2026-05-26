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
import { CharactersService } from '../characters/characters.service';
import { FriendshipEntity } from '../social/friendship.entity';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
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
    @InjectRepository(FriendshipEntity)
    private friendshipRepo: Repository<FriendshipEntity>,
    private readonly config: ConfigService,
    private readonly charactersService: CharactersService,
  ) {}

  // 世界进程内的 admin 是「当前 owner 自己的后台」（跨 owner 平台管理在 cloud-console，
  // 不在此进程）。所以角色读写都经租户作用域 repo：shared 模式按 ALS owner 限定 + 复合
  // 主键写盖章；LPP 透传（零变化）。
  private get scopedCharacters(): TenantRepository<CharacterEntity> {
    return new TenantRepository(this.characterRepo);
  }

  async getStats() {
    const [ownerCount, characterCount, totalMessages, aiMessages] = await Promise.all([
      this.userRepo.count({ where: { userType: 'world_owner' } }),
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

  async getFriendCharacterIds(): Promise<string[]> {
    const friendships = await this.friendshipRepo.find({
      select: ['characterId'],
      where: { status: 'friend' },
    });
    return friendships.map((f) => f.characterId);
  }

  findAllCharacters() {
    return this.scopedCharacters.find({ order: { name: 'ASC' } });
  }

  listCharacterPresets() {
    return this.charactersService.listCelebrityPresets();
  }

  installCharacterPreset(presetKey: string) {
    return this.charactersService.installCelebrityPreset(presetKey);
  }

  installCharacterPresetBatch(presetKeys: string[]) {
    return this.charactersService.installCelebrityPresetBatch(presetKeys);
  }

  async createCharacter(data: Partial<CharacterEntity>) {
    const entity = this.characterRepo.create(data);
    return this.scopedCharacters.save(entity);
  }

  async updateCharacter(id: string, data: Partial<CharacterEntity>) {
    const existing = await this.scopedCharacters.findOneBy({ id });
    const sanitized = { ...data };
    if (
      existing &&
      sanitized.sourceType != null &&
      sanitized.sourceType !== existing.sourceType
    ) {
      // 后台不允许改变历史角色的 sourceType（不同 sourceType 走的运行时分支不同，
      // 例如 wechat_import / preset_catalog 强绑定 import 流程）
      delete sanitized.sourceType;
    }
    // scoped：复合主键下标量 id 不再成立，共享库按 ownerId 限定 WHERE。
    await this.scopedCharacters.update({ id }, sanitized);
    return this.scopedCharacters.findOneBy({ id });
  }

  async deleteCharacter(id: string) {
    await this.charactersService.delete(id);
    return { success: true };
  }
}
// i18n-ignore-end
