import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService } from '../characters/characters.service';
import { MomentEntity } from './moment.entity';

export interface MomentInteraction {
  characterId: string;
  characterName: string;
  type: 'like' | 'comment';
  commentText?: string;
  createdAt: Date;
}

export interface Moment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  location?: string;
  postedAt: Date;
  interactions: MomentInteraction[];
}

@Injectable()
export class MomentsService {
  private readonly logger = new Logger(MomentsService.name);

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    @InjectRepository(MomentEntity)
    private momentRepo: Repository<MomentEntity>,
  ) {}

  async getFeed(): Promise<Moment[]> {
    const entities = await this.momentRepo.find({ order: { postedAt: 'DESC' } });
    return entities.map(this._toMoment);
  }

  async generateMomentForCharacter(characterId: string): Promise<Moment | null> {
    const char = await this.characters.findById(characterId);
    const profile = await this.characters.getProfile(characterId);
    if (!char || !profile) return null;

    try {
      const text = await this.ai.generateMoment({ profile, currentTime: new Date() });
      if (!text) return null;

      const entity = this.momentRepo.create({
        id: `moment_${Date.now()}_${characterId}`,
        authorId: characterId,
        authorName: char.name,
        authorAvatar: char.avatar,
        text,
        interactions: [],
      });
      await this.momentRepo.save(entity);

      // Schedule interactions from other characters (async, non-blocking)
      this.scheduleInteractions(entity);

      return this._toMoment(entity);
    } catch (err) {
      this.logger.error(`Failed to generate moment for ${characterId}`, err);
      return null;
    }
  }

  async generateAllMoments(): Promise<Moment[]> {
    const chars = await this.characters.findAll();
    const results: Moment[] = [];
    for (const char of chars) {
      const moment = await this.generateMomentForCharacter(char.id);
      if (moment) results.push(moment);
    }
    return results;
  }

  private async scheduleInteractions(entity: MomentEntity) {
    const allChars = (await this.characters.findAll()).filter((c) => c.id !== entity.authorId);

    allChars.forEach((char, i) => {
      const shouldInteract = Math.random() < 0.45;
      if (!shouldInteract) return;

      const delay = (i + 1) * 8000 + Math.random() * 5000;
      setTimeout(async () => {
        const isComment = Math.random() < 0.4;
        let interaction: MomentInteraction | null = null;

        if (isComment) {
          const profile = await this.characters.getProfile(char.id);
          if (!profile) return;
          try {
            const reply = await this.ai.generateReply({
              profile,
              conversationHistory: [],
              userMessage: `你的朋友${entity.authorName}发了一条朋友圈："${entity.text}"，用一句话自然地评论一下，不超过20字。`,
            });
            interaction = {
              characterId: char.id,
              characterName: char.name,
              type: 'comment',
              commentText: reply.text,
              createdAt: new Date(),
            };
          } catch {
            return;
          }
        } else {
          interaction = {
            characterId: char.id,
            characterName: char.name,
            type: 'like',
            createdAt: new Date(),
          };
        }

        if (!interaction) return;

        // Reload entity from DB to avoid stale state, then append and save
        const fresh = await this.momentRepo.findOneBy({ id: entity.id });
        if (!fresh) return;
        fresh.interactions = [...fresh.interactions, interaction];
        await this.momentRepo.save(fresh);
      }, delay);
    });
  }

  private _toMoment(e: MomentEntity): Moment {
    return {
      id: e.id,
      authorId: e.authorId,
      authorName: e.authorName,
      authorAvatar: e.authorAvatar,
      text: e.text,
      location: e.location,
      postedAt: e.postedAt,
      interactions: e.interactions ?? [],
    };
  }
}
