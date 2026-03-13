import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';
import { CharacterEntity } from './character.entity';
import { seedCharacters } from './characters.seed';

@Module({
  imports: [TypeOrmModule.forFeature([CharacterEntity])],
  providers: [CharactersService],
  controllers: [CharactersController],
  exports: [CharactersService],
})
export class CharactersModule implements OnModuleInit {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async onModuleInit() {
    await seedCharacters(this.dataSource);
  }
}
