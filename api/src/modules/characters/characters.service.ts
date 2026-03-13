import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterEntity } from './character.entity';
import { PersonalityProfile } from '../ai/ai.types';

export type Character = CharacterEntity;

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(CharacterEntity)
    private repo: Repository<CharacterEntity>,
  ) {}

  findAll(): Promise<CharacterEntity[]> {
    return this.repo.find();
  }

  findById(id: string): Promise<CharacterEntity | null> {
    return this.repo.findOneBy({ id });
  }

  async findByDomains(domains: string[]): Promise<CharacterEntity[]> {
    const all = await this.findAll();
    return all.filter((c) => c.expertDomains.some((d) => domains.includes(d)));
  }

  async getProfile(id: string): Promise<PersonalityProfile | undefined> {
    const char = await this.repo.findOneBy({ id });
    return char?.profile;
  }

  async upsert(character: CharacterEntity): Promise<void> {
    await this.repo.save(character);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
