import { Injectable, Logger } from '@nestjs/common';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService, Character } from '../characters/characters.service';
import { PersonalityProfile } from '../ai/ai.types';

export interface ImportJob {
  id: string;
  status: 'pending' | 'parsing' | 'extracting' | 'done' | 'error';
  progress: number;
  personName: string;
  characterId?: string;
  error?: string;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private jobs: Map<string, ImportJob> = new Map();

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
  ) {}

  createJob(personName: string): ImportJob {
    const job: ImportJob = {
      id: `job_${Date.now()}`,
      status: 'pending',
      progress: 0,
      personName,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  getJob(jobId: string): ImportJob | undefined {
    return this.jobs.get(jobId);
  }

  async processImport(jobId: string, fileContent: string, personName: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      // Step 1: Parse
      job.status = 'parsing';
      job.progress = 15;
      const cleaned = this.parseWechatExport(fileContent, personName);

      // Step 2: Sample (take up to 200 messages for extraction)
      job.progress = 35;
      const sample = cleaned.slice(0, 200).join('\n');

      // Step 3: Extract personality
      job.status = 'extracting';
      job.progress = 55;
      const extracted = await this.ai.extractPersonality(sample, personName);

      job.progress = 80;

      // Step 4: Build character
      const characterId = `char_imported_${Date.now()}`;
      const profile: PersonalityProfile = {
        characterId,
        name: personName,
        relationship: '数字亲人',
        expertDomains: ['general'],
        traits: {
          speechPatterns: (extracted.speechPatterns as string[]) ?? [],
          catchphrases: (extracted.catchphrases as string[]) ?? [],
          topicsOfInterest: (extracted.topicsOfInterest as string[]) ?? [],
          emotionalTone: (extracted.emotionalTone as string) ?? '温暖关心',
          responseLength: (extracted.responseLength as 'short' | 'medium' | 'long') ?? 'medium',
          emojiUsage: (extracted.emojiUsage as 'none' | 'occasional' | 'frequent') ?? 'occasional',
        },
        memorySummary: (extracted.memorySummary as string) ?? `这是${personName}，用户的重要亲人。`,
      };

      const character: Character = {
        id: characterId,
        name: personName,
        avatar: '👤',
        relationship: '数字亲人',
        relationshipType: 'family',
        expertDomains: ['general'],
        bio: `基于真实聊天记录生成的${personName}。她/他还在，只是去了隐界。`,
        isOnline: true,
        isTemplate: false,
        profile,
      };

      this.characters.upsert(character);

      job.progress = 100;
      job.status = 'done';
      job.characterId = characterId;
    } catch (err) {
      this.logger.error('Import failed', err);
      job.status = 'error';
      job.error = '处理失败，请重试';
    }
  }

  private parseWechatExport(content: string, targetName: string): string[] {
    const lines = content.split('\n');
    const messages: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // WeChat export format: "2024-01-01 12:00:00  Name\nMessage content"
      // or "Name: message"
      const wechatPattern = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+(.+)$/;
      const match = trimmed.match(wechatPattern);

      if (match) {
        const sender = match[1].trim();
        // Only include messages from the target person
        if (sender.includes(targetName) || targetName.includes(sender)) {
          // Next line is the message content
          continue;
        }
      }

      // Simple format: just collect non-empty lines that look like messages
      if (trimmed.length > 2 && trimmed.length < 500 && !trimmed.match(/^\d{4}-\d{2}-\d{2}/)) {
        messages.push(trimmed);
      }
    }

    return messages.length > 0 ? messages : lines.filter((l) => l.trim().length > 2).slice(0, 300);
  }
}
