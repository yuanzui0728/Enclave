import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NarrativeArcEntity } from './narrative-arc.entity';
import { WorldOwnerService } from '../auth/world-owner.service';
import { ReplyLogicRulesService } from '../ai/reply-logic-rules.service';

type RecordConversationTurnInput = {
  characterId: string;
  characterName?: string;
  messageCount: number;
};

@Injectable()
export class NarrativeService {
  constructor(
    @InjectRepository(NarrativeArcEntity)
    private readonly narrativeRepo: Repository<NarrativeArcEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly replyLogicRules: ReplyLogicRulesService,
  ) {}

  async getForCurrentWorld(): Promise<NarrativeArcEntity[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return this.narrativeRepo.find({
      where: { ownerId: owner.id },
      order: { createdAt: 'DESC' },
    });
  }

  async ensureArc(
    characterId: string,
    characterName?: string,
  ): Promise<NarrativeArcEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.narrativeRepo.findOne({
      where: { ownerId: owner.id, characterId, status: 'active' },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      return existing;
    }

    const arc = this.narrativeRepo.create({
      ownerId: owner.id,
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

    const runtimeRules = await this.replyLogicRules.getRules();
    const arc = await this.ensureArc(input.characterId, input.characterName);
    const nextProgress = this.getProgressFromMessageCount(
      input.messageCount,
      runtimeRules.narrativeMilestones,
    );
    const nextMilestones = this.mergeMilestones(
      arc.milestones ?? [],
      input.messageCount,
      runtimeRules.narrativeMilestones,
    );

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

  private getProgressFromMessageCount(
    messageCount: number,
    milestones: Array<{ threshold: number; label: string; progress: number }>,
  ): number {
    const matchedStep = [...milestones]
      .reverse()
      .find((step) => messageCount >= step.threshold);
    return matchedStep?.progress ?? 15;
  }

  private mergeMilestones(
    current: { label: string; completedAt?: Date }[],
    messageCount: number,
    milestones: Array<{ threshold: number; label: string; progress: number }>,
  ) {
    const next = [...current];
    const existingLabels = new Set(current.map((item) => item.label));
    for (const milestone of milestones) {
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
