import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [AiModule, CharactersModule],
  providers: [ImportService],
  controllers: [ImportController],
  exports: [ImportService],
})
export class ImportModule {}
