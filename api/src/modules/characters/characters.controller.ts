import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
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
    if (!char) throw new NotFoundException(`Character ${id} not found`);
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
    if (!existing) throw new NotFoundException(`Character ${id} not found`);
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
}
