import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterEntity } from '../../characters/character.entity';
import { CharacterPageEntity } from '../entities/character-page.entity';
import {
  CharacterRevisionEntity,
  type WikiContentSnapshot,
} from '../entities/character-revision.entity';
import { snapshotFromCharacter } from '../wiki.types';

export type WikiPageView = {
  characterId: string;
  page: CharacterPageEntity;
  currentRevision: CharacterRevisionEntity | null;
  content: WikiContentSnapshot;
  exists: boolean;
};

@Injectable()
export class WikiPageService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterPageEntity)
    private readonly pageRepo: Repository<CharacterPageEntity>,
    @InjectRepository(CharacterRevisionEntity)
    private readonly revisionRepo: Repository<CharacterRevisionEntity>,
  ) {}

  async getOrInitPage(characterId: string): Promise<CharacterPageEntity> {
    let page = await this.pageRepo.findOne({ where: { characterId } });
    if (page) return page;
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) {
      throw new NotFoundException(`角色 ${characterId} 不存在`);
    }
    page = this.pageRepo.create({
      characterId,
      currentRevisionId: null,
      protectionLevel: character.sourceType === 'ai_generated' ? 'semi' : 'none',
      isPatrolled: false,
      watcherCount: 0,
      editCount: 0,
      isDeleted: false,
    });
    return this.pageRepo.save(page);
  }

  async getPageView(characterId: string): Promise<WikiPageView> {
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
    });
    if (!character) {
      throw new NotFoundException(`角色 ${characterId} 不存在`);
    }
    const page = await this.getOrInitPage(characterId);
    let currentRevision: CharacterRevisionEntity | null = null;
    if (page.currentRevisionId) {
      currentRevision = await this.revisionRepo.findOne({
        where: { id: page.currentRevisionId },
      });
    }
    const content = currentRevision
      ? currentRevision.contentSnapshot
      : snapshotFromCharacter(character as unknown as Record<string, unknown>);
    return {
      characterId,
      page,
      currentRevision,
      content,
      exists: !page.isDeleted,
    };
  }

  async getHistory(
    characterId: string,
    limit = 50,
  ): Promise<CharacterRevisionEntity[]> {
    return this.revisionRepo.find({
      where: { characterId },
      order: { version: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async getRevisionOrThrow(id: string): Promise<CharacterRevisionEntity> {
    const rev = await this.revisionRepo.findOne({ where: { id } });
    if (!rev) throw new NotFoundException(`版本 ${id} 不存在`);
    return rev;
  }

  async listRecentChanges(input: {
    limit?: number;
    onlyUnpatrolled?: boolean;
  }): Promise<CharacterRevisionEntity[]> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const qb = this.revisionRepo
      .createQueryBuilder('r')
      .orderBy('r.createdAt', 'DESC')
      .take(limit);
    if (input.onlyUnpatrolled) {
      qb.where('r.status = :status AND r.isPatrolled = :patrolled', {
        status: 'approved',
        patrolled: false,
      });
    } else {
      qb.where('r.status IN (:...statuses)', {
        statuses: ['approved', 'pending', 'reverted'],
      });
    }
    return qb.getMany();
  }
}
