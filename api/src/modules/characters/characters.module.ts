import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';
import { CharacterEntity } from './character.entity';
import { CharacterBlueprintEntity } from './character-blueprint.entity';
import { CharacterBlueprintRevisionEntity } from './character-blueprint-revision.entity';
import { CharacterBlueprintService } from './character-blueprint.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CharacterEntity,
      CharacterBlueprintEntity,
      CharacterBlueprintRevisionEntity,
    ]),
  ],
  providers: [CharactersService, CharacterBlueprintService],
  controllers: [CharactersController],
  exports: [CharactersService, CharacterBlueprintService],
})
export class CharactersModule {}
