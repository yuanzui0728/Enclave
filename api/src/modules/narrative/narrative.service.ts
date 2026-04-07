import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NarrativeArcEntity } from './narrative-arc.entity';

type RecordConversationTurnInput = {
  userId: string;
  characterId: string;
  characterName?: string;
  messageCount: number;
};

@Injectable()
export class NarrativeService {
  constructor(
    @InjectRepository(NarrativeArcEntity)
    private readonly narrativeRepo: Repository<NarrativeArcEntity>,
  ) {}

  async getByUser(userId: string): Promise<NarrativeArcEntity[]> {
    return this.narrativeRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async ensureArc(
    userId: string,
    characterId: string,
    characterName?: string,
  ): Promise<NarrativeArcEntity> {
    const existing = await this.narrativeRepo.findOne({
      where: { userId, characterId, status: 'active' },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      return existing;
    }

    const arc = this.narrativeRepo.create({
      userId,
      characterId,
      title: `${characterName ?? characterId} relationship arc`,
      status: 'active',
      progress: 10,
      milestones: [{ label: 'connected', completedAt: new Date() }],
    });

    return this.narrativeRepo.save(arc);
  }

  async recordConversationTurn(input: RecordConversationTurnInput): Promise<NarrativeArcEntity | null> {
    if (input.messageCount < 4) {
      return null;
    }

    const arc = await this.ensureArc(input.userId, input.characterId, input.characterName);
    const nextProgress = this.getProgressFromMessageCount(input.messageCount);
    const nextMilestones = this.mergeMilestones(arc.milestones ?? [], input.messageCount);

    let shouldSave = false;
    if (nextProgress > arc.progress) {
      arc.progress = nextProgress;
      shouldSave = true;
    }

    if (nextMilestones.length !== (arc.milestones ?? []).length) {
      arc.milestones = nextMilestones;
      shouldSave = true;
    }

    if (arc.progress >= 100 && arc.status !== 'completed') {
      arc.status = 'completed';
      arc.completedAt = new Date();
      shouldSave = true;
    }

    if (!shouldSave) {
      return arc;
    }

    return this.narrativeRepo.save(arc);
  }

  private getProgressFromMessageCount(messageCount: number): number {
    if (messageCount >= 24) return 100;
    if (messageCount >= 18) return 78;
    if (messageCount >= 12) return 54;
    if (messageCount >= 8) return 32;
    return 15;
  }

  private mergeMilestones(
    current: { label: string; completedAt?: Date }[],
    messageCount: number,
  ) {
    const next = [...current];
    const existingLabels = new Set(current.map((item) => item.label));
    const milestoneMap = [
      { threshold: 4, label: 'first_breakthrough' },
      { threshold: 8, label: 'shared_context' },
      { threshold: 12, label: 'growing_trust' },
      { threshold: 18, label: 'inner_circle' },
      { threshold: 24, label: 'story_complete' },
    ];

    for (const milestone of milestoneMap) {
      if (messageCount < milestone.threshold || existingLabels.has(milestone.label)) {
        continue;
      }

      next.push({
        label: milestone.label,
        completedAt: new Date(),
      });
    }

    return next;
  }
}
