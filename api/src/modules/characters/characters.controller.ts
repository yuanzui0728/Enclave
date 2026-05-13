import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { CharactersService } from './characters.service';
import { CharacterEntity } from './character.entity';
import { AdminGuard } from '../admin/admin.guard';

@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get()
  findAll() {
    return this.charactersService.findAllVisibleToOwner();
  }

  @Get('preset-catalog')
  listPresetCatalog() {
    return this.charactersService.listPresetCatalog();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const char =
      (await this.charactersService.findById(id)) ??
      (await this.charactersService.ensurePresetCharacterInstalled(id));
    if (!char)
      throw new AppError('CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { id },
        legacyMessage: `Character ${id} not found`,
      });
    return char;
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() body: Partial<CharacterEntity>) {
    const char = {
      ...body,
      id: body.id ?? `char_${Date.now()}`,
    } as CharacterEntity;
    await this.charactersService.upsert(char);
    return char;
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() body: Partial<CharacterEntity>) {
    const existing = await this.charactersService.findById(id);
    if (!existing)
      throw new AppError('CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { id },
        legacyMessage: `Character ${id} not found`,
      });
    const updated = { ...existing, ...body, id } as CharacterEntity;
    await this.charactersService.upsert(updated);
    return updated;
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async remove(@Param('id') id: string) {
    await this.charactersService.delete(id);
    return { success: true };
  }

  /**
   * Tenant-facing 导入端点：接收 wiki "我的私有角色" 导出 JSON，按 name upsert
   * 到 characters 表，并自动为 world-owner 建 friendship。
   * 同名→覆盖；不存在→新建。
   */
  @Post('import-personal')
  async importPersonal(@Body() body: unknown) {
    const parsed = parsePrivateCharacterImportBody(body);
    return this.charactersService.importPersonalCharacter({
      ...parsed,
      profile: parsed.profile as Parameters<
        CharactersService['importPersonalCharacter']
      >[0]['profile'],
    });
  }
}

const PRIVATE_CHARACTER_EXPORT_SCHEMA = 'yinjie-private-character/v1' as const;

function parsePrivateCharacterImportBody(payload: unknown): {
  name: string;
  avatar?: string;
  bio?: string;
  personality?: string | null;
  relationship?: string;
  relationshipType?: string;
  expertDomains?: string[];
  triggerScenes?: string[] | null;
  profile?: unknown;
} {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: '导入内容不是合法 JSON。',
    });
  }
  const p = payload as Record<string, unknown>;
  const schema = typeof p.$schema === 'string' ? p.$schema : null;
  if (schema && schema !== PRIVATE_CHARACTER_EXPORT_SCHEMA) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: `不支持的 schema：${schema}`,
    });
  }
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (!name) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: '导入文件缺少 name 字段。',
    });
  }
  return {
    name,
    avatar: typeof p.avatar === 'string' ? p.avatar : '',
    bio: typeof p.bio === 'string' ? p.bio : '',
    personality: typeof p.personality === 'string' ? p.personality : null,
    relationship: typeof p.relationship === 'string' ? p.relationship : '',
    relationshipType:
      typeof p.relationshipType === 'string' ? p.relationshipType : 'friend',
    expertDomains: Array.isArray(p.expertDomains)
      ? (p.expertDomains as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : [],
    triggerScenes: Array.isArray(p.triggerScenes)
      ? (p.triggerScenes as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : null,
    profile:
      p.profile && typeof p.profile === 'object' ? p.profile : null,
  };
}
