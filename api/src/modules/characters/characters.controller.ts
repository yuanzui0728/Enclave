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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const char = await this.charactersService.findById(id);
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
