// i18n-ignore-start: backend boot service; logs are operational, not user-facing.
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPrivateCharacterEntity } from '../entities/user-private-character.entity';
import { stripRejectedRecipeFields } from './wiki-private-character.service';

/**
 * 一次性数据迁移：扫 user_private_characters 表，把每行 recipe JSON 里 wiki UI
 * 已砍掉的字段清空，并把顶层 personality 列设为 null。对齐 2026-05-15 起的
 * 「wiki 编辑器只暴露 admin character-editor-page 字段」决策。
 *
 * 触发：每次 cloud-api 应用启动都跑一次（onApplicationBootstrap）。幂等 —— 已经
 * 干净的行扫到时 stripRejectedRecipeFields 返回结构与原值字段集等价，会跳过 save。
 * 因此重启风险为零。
 *
 * 仓库惯例：仓库 TypeORM `synchronize: true`、无独立 migrations 目录，应用层
 * bootstrap hook 是既定的"轻量级一次性数据修复"模式（同模块的
 * WikiSystemUserService.onModuleInit、AbuseFilterService、WikiFieldProtectionService
 * 都走这个套路）。无需独立 admin-only sentinel 表来标记"已跑过"。
 */
@Injectable()
export class WikiPrivateCharacterCleanupService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(WikiPrivateCharacterCleanupService.name);

  constructor(
    @InjectRepository(UserPrivateCharacterEntity)
    private readonly repo: Repository<UserPrivateCharacterEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    let scanned = 0;
    let recipeStripped = 0;
    let personalityCleared = 0;

    // 分批扫表，避免一次 load 几万行进内存（虽然 wiki 私有角色目前总量小，
    // 但留出余量；500 行/batch 与全仓 batch 模式一致）。
    const BATCH = 500;
    let cursor: string | undefined;
    while (true) {
      // uuid PK 字符串自然序稳定 → 用 id > cursor 翻页避免漏行。
      const qb = this.repo
        .createQueryBuilder('upc')
        .orderBy('upc.id', 'ASC')
        .limit(BATCH);
      if (cursor) qb.where('upc.id > :cursor', { cursor });
      const rows = await qb.getMany();
      if (rows.length === 0) break;
      for (const row of rows) {
        scanned += 1;
        let changed = false;
        if (row.recipe) {
          const before = JSON.stringify(row.recipe);
          const stripped = stripRejectedRecipeFields(row.recipe);
          const after = stripped ? JSON.stringify(stripped) : 'null';
          if (before !== after) {
            row.recipe = stripped;
            recipeStripped += 1;
            changed = true;
          }
        }
        // personality 顶层列：wiki 已不再编辑该字段，把已存的清空。
        if (row.personality != null && row.personality !== '') {
          row.personality = null;
          personalityCleared += 1;
          changed = true;
        }
        if (changed) {
          await this.repo.save(row);
        }
      }
      const lastId = rows[rows.length - 1]?.id;
      if (!lastId || lastId === cursor) break; // 防御死循环
      cursor = lastId;
      if (rows.length < BATCH) break;
    }

    // 启动总是打一行，便于运维确认 onApplicationBootstrap 钩子是否被 NestJS
    // 调起；scanned=0 时也打（表空 / 已迁移完）。
    this.logger.log(
      `boot scanned=${scanned} recipe_stripped=${recipeStripped} personality_cleared=${personalityCleared}`,
    );
  }
}
// i18n-ignore-end
