import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { CharactersService } from './characters.service';
import { CharacterEntity } from './character.entity';

@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get()
  findAll() {
    return this.charactersService.findAll();
  }

  /** 返回硬编码预设目录（不查 DB），供前台发现页使用 */
  @Get('preset-catalog')
  listPresetCatalog() {
    return this.charactersService.listPresetCatalog();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    // 优先读 DB；若不存在则尝试从预设目录懒安装（支持在未添加好友时浏览角色详情）
    const char =
      (await this.charactersService.findById(id)) ??
      (await this.charactersService.ensurePresetCharacterInstalled(id));
    if (!char) throw new NotFoundException(`Character ${id} not found`);
    return char;
  }

  @Post()
  async create(@Body() body: Partial<CharacterEntity>) {
    const char = {
      ...body,
      id: body.id ?? `char_${Date.now()}`,
    } as CharacterEntity;
    await this.charactersService.upsert(char);
    return char;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<CharacterEntity>) {
    const existing = await this.charactersService.findById(id);
    if (!existing) throw new NotFoundException(`Character ${id} not found`);
    const updated = { ...existing, ...body, id } as CharacterEntity;
    await this.charactersService.upsert(updated);
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.charactersService.delete(id);
    return { success: true };
  }
}
