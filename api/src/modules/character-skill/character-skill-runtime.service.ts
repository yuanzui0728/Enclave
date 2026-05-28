import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';

import { AppError } from '../../common/app-error.exception';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CloudWalletClient } from '../billing/cloud-wallet.client';
import type { CharacterEntity } from '../characters/character.entity';
import type {
  SkillHandlingResult,
  SkillRunStatus,
} from './character-skill.types';
import {
  buildBillingUnavailableMessage,
  buildCancelledMessage,
  buildInsufficientMessage,
  buildQuoteMessage,
  buildSlotQuestionMessage,
  buildStartedMessage,
} from './skill-messages';
import {
  estimatePriceCents,
  getSkillForSourceKey,
  type SkillDefinition,
} from './skill-registry';
import { SkillArtifactJobEntity } from './skill-artifact-job.entity';
import { SkillRunEntity } from './skill-run.entity';

const MAX_PENDING_FOLLOWUPS = 3;
const PENDING_RUN_STALE_MS = 30 * 60 * 1000; // 30 分钟没动 → 视为陈旧，放行新意图

const CONFIRM_KEYWORDS = [
  '确认',
  '确定',
  '可以',
  '做吧',
  '开始',
  '就这样',
  '就这么做',
  '好的',
  '好',
  '行',
  'ok',
];
const REJECT_KEYWORDS = [
  '取消',
  '算了',
  '先别',
  '不用了',
  '不要了',
  '暂停',
  '先不做',
];

export interface SkillTurnInput {
  conversationId: string;
  ownerId: string;
  character: CharacterEntity;
  userMessage: string;
  sourceMessageId: string;
  sourceMessageCreatedAt: Date;
  characterName: string;
  characterAvatar?: string | null;
}

@Injectable()
export class CharacterSkillRuntimeService {
  private readonly logger = new Logger(CharacterSkillRuntimeService.name);

  constructor(
    @InjectRepository(SkillRunEntity)
    private readonly skillRunRepo: Repository<SkillRunEntity>,
    @InjectRepository(SkillArtifactJobEntity)
    private readonly skillJobRepo: Repository<SkillArtifactJobEntity>,
    @Inject(forwardRef(() => AiOrchestratorService))
    private readonly ai: AiOrchestratorService,
    private readonly wallet: CloudWalletClient,
  ) {}

  async handleConversationTurn(
    input: SkillTurnInput,
  ): Promise<SkillHandlingResult> {
    const skill = getSkillForSourceKey(input.character.sourceKey);
    if (!skill) return { handled: false };

    const msg = input.userMessage?.trim();
    if (!msg) return { handled: false };

    const pending = await this.findPendingRun(
      input.conversationId,
      input.ownerId,
      input.character.id,
    );

    if (pending) {
      if (this.isStale(pending)) {
        await this.cancelRun(pending, 'stale');
        // 落到下面按全新意图重新规划
      } else {
        return this.handlePendingRun(pending, skill, msg, input);
      }
    }

    // 新意图：先关键词门控，零成本放行非产出消息
    if (!this.hasIntent(skill, msg)) return { handled: false };

    const extraction = await this.extractSlots(skill, msg, {}, input);
    if (!extraction.isProductionRequest) return { handled: false };

    const slots = extraction.slots;
    const missing = this.computeMissing(skill, slots);
    if (missing.length) {
      await this.createRun(input, skill, {
        status: 'awaiting_slots',
        userGoal: msg,
        slots,
        missingSlots: missing.map((s) => s.key),
      });
      return {
        handled: true,
        responseText: buildSlotQuestionMessage({
          artifactName: skill.artifactName,
          questions: missing.map((s) => s.ask),
        }),
      };
    }

    return this.produceQuote(input, skill, msg, slots, null);
  }

  // ---- pending run 处理 ----
  private async handlePendingRun(
    run: SkillRunEntity,
    skill: SkillDefinition,
    msg: string,
    input: SkillTurnInput,
  ): Promise<SkillHandlingResult> {
    if (this.matches(msg, REJECT_KEYWORDS)) {
      await this.cancelRun(run, 'user_rejected');
      return {
        handled: true,
        responseText: buildCancelledMessage(skill.artifactName),
      };
    }

    if (run.pendingFollowups >= MAX_PENDING_FOLLOWUPS) {
      await this.cancelRun(run, 'max_followups');
      return {
        handled: true,
        responseText: buildCancelledMessage(skill.artifactName),
      };
    }

    if (
      run.status === 'awaiting_confirmation' &&
      this.looksLikeConfirm(msg)
    ) {
      return this.confirmAndCharge(run, skill, input);
    }

    // 否则当作"补充/修改需求"：合并语料重新抽槽
    const accumulatedGoal = `${run.userGoal}\n${msg}`;
    const extraction = await this.extractSlots(
      skill,
      accumulatedGoal,
      run.slotPayload,
      input,
    );
    const mergedSlots = { ...run.slotPayload, ...extraction.slots };
    const missing = this.computeMissing(skill, mergedSlots);

    run.pendingFollowups += 1;
    run.userGoal = accumulatedGoal;
    run.slotPayload = mergedSlots;

    if (missing.length) {
      run.status = 'awaiting_slots';
      run.missingSlots = missing.map((s) => s.key);
      await this.skillRunRepo.save(run);
      return {
        handled: true,
        responseText: buildSlotQuestionMessage({
          artifactName: skill.artifactName,
          questions: missing.map((s) => s.ask),
        }),
      };
    }

    return this.produceQuote(input, skill, accumulatedGoal, mergedSlots, run);
  }

  // ---- 出大纲 + 报价（信息齐时）----
  private async produceQuote(
    input: SkillTurnInput,
    skill: SkillDefinition,
    userGoal: string,
    slots: Record<string, unknown>,
    existing: SkillRunEntity | null,
  ): Promise<SkillHandlingResult> {
    const outline = await this.ai.generateJsonObject({
      prompt: skill.outlinePromptBuilder({
        characterName: input.characterName,
        userGoal,
        slots,
      }),
      usageContext: this.usageContext(input, 'skill_outline'),
      maxTokens: 1200,
      temperature: 0.4,
      fallback: {},
    });
    const quantity = skill.quantityFromOutline(outline);
    const priceCents = estimatePriceCents(skill.billingActionKey, quantity);
    // 系统/全局/未托管 → charge 会 skipped；报价提前用 resolveOwnerPhone 粗判免费态。
    const skipped = !this.wallet.resolveOwnerPhone();

    const run =
      existing ??
      this.skillRunRepo.create({
        id: this.newRunId(),
        ownerId: input.ownerId,
        conversationId: input.conversationId,
        characterId: input.character.id,
        characterSourceKey: input.character.sourceKey ?? '',
        skillKey: skill.skillKey,
        artifactType: skill.artifactType,
        billingActionKey: skill.billingActionKey,
        sourceMessageId: input.sourceMessageId,
        sourceMessageCreatedAt: input.sourceMessageCreatedAt,
        pendingFollowups: 0,
      } as Partial<SkillRunEntity>);

    run.status = 'awaiting_confirmation';
    run.userGoal = userGoal;
    run.slotPayload = slots;
    run.missingSlots = [];
    run.outlineSpec = outline;
    run.quantity = quantity;
    run.quotedPriceCents = priceCents;
    if (!run.billingIdempotencyKey) {
      run.billingIdempotencyKey = `skill:${run.id}`;
    }
    await this.skillRunRepo.save(run);

    return {
      handled: true,
      responseText: buildQuoteMessage({
        artifactName: skill.artifactName,
        quantity,
        unit: skill.unit,
        priceCents,
        skipped,
      }),
    };
  }

  // ---- 确认 → 扣费 → 排渲染 job ----
  private async confirmAndCharge(
    run: SkillRunEntity,
    skill: SkillDefinition,
    input: SkillTurnInput,
  ): Promise<SkillHandlingResult> {
    try {
      await this.wallet.charge(
        skill.billingActionKey,
        run.billingIdempotencyKey,
        run.quantity ?? 1,
      );
    } catch (err) {
      const body =
        err instanceof AppError
          ? (err.getResponse() as {
              code?: string;
              params?: Record<string, unknown>;
            })
          : null;
      if (body?.code === 'WALLET_INSUFFICIENT') {
        const priceCents =
          (body.params?.priceCents as number | undefined) ??
          run.quotedPriceCents ??
          0;
        return {
          handled: true,
          responseText: buildInsufficientMessage({
            artifactName: skill.artifactName,
            priceCents,
          }),
        };
      }
      if (body?.code === 'WALLET_CHARGE_UNAVAILABLE') {
        return {
          handled: true,
          responseText: buildBillingUnavailableMessage(skill.artifactName),
        };
      }
      throw err;
    }

    run.status = 'charged';
    await this.skillRunRepo.save(run);

    const job = this.skillJobRepo.create({
      id: `skj_${Date.now()}_${randomUUID().slice(0, 8)}`,
      ownerId: input.ownerId,
      skillRunId: run.id,
      conversationId: input.conversationId,
      characterId: input.character.id,
      characterName: input.characterName,
      characterAvatar: input.characterAvatar ?? null,
      artifactType: skill.artifactType,
      billingActionKey: skill.billingActionKey,
      billingIdempotencyKey: run.billingIdempotencyKey,
      sourceMessageId: input.sourceMessageId,
      sourceMessageCreatedAt: input.sourceMessageCreatedAt,
      status: 'pending',
      executeAfter: new Date(),
      inputPayload: JSON.stringify({ skillRunId: run.id }),
    });
    await this.skillJobRepo.save(job);

    return {
      handled: true,
      responseText: buildStartedMessage(skill.artifactName),
    };
  }

  // ---- helpers ----
  private async findPendingRun(
    conversationId: string,
    ownerId: string,
    characterId: string,
  ): Promise<SkillRunEntity | null> {
    return this.skillRunRepo.findOne({
      where: {
        conversationId,
        ownerId,
        characterId,
        status: In(['awaiting_slots', 'awaiting_confirmation']),
      },
      order: { updatedAt: 'DESC' },
    });
  }

  private async createRun(
    input: SkillTurnInput,
    skill: SkillDefinition,
    fields: {
      status: SkillRunStatus;
      userGoal: string;
      slots: Record<string, unknown>;
      missingSlots: string[];
    },
  ): Promise<SkillRunEntity> {
    const id = this.newRunId();
    const run = this.skillRunRepo.create({
      id,
      ownerId: input.ownerId,
      conversationId: input.conversationId,
      characterId: input.character.id,
      characterSourceKey: input.character.sourceKey ?? '',
      skillKey: skill.skillKey,
      artifactType: skill.artifactType,
      billingActionKey: skill.billingActionKey,
      status: fields.status,
      userGoal: fields.userGoal,
      slotPayload: fields.slots,
      missingSlots: fields.missingSlots,
      billingIdempotencyKey: `skill:${id}`,
      sourceMessageId: input.sourceMessageId,
      sourceMessageCreatedAt: input.sourceMessageCreatedAt,
      pendingFollowups: 0,
    });
    return this.skillRunRepo.save(run);
  }

  private async cancelRun(run: SkillRunEntity, reason: string): Promise<void> {
    run.status = 'cancelled';
    run.errorMessage = reason;
    await this.skillRunRepo.save(run);
  }

  private isStale(run: SkillRunEntity): boolean {
    const ts = run.updatedAt?.getTime?.() ?? 0;
    return Date.now() - ts > PENDING_RUN_STALE_MS;
  }

  private hasIntent(skill: SkillDefinition, msg: string): boolean {
    const lower = msg.toLowerCase();
    return skill.intentKeywords.some((kw) =>
      lower.includes(kw.toLowerCase()),
    );
  }

  private matches(msg: string, keywords: string[]): boolean {
    const lower = msg.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  // 确认仅当命中确认词且消息短（避免"好的，不过再加一页"被当确认而提前扣费）。
  private looksLikeConfirm(msg: string): boolean {
    if (this.matches(msg, REJECT_KEYWORDS)) return false;
    return this.matches(msg, CONFIRM_KEYWORDS) && msg.trim().length <= 15;
  }

  private computeMissing(
    skill: SkillDefinition,
    slots: Record<string, unknown>,
  ): SkillDefinition['requiredSlots'] {
    return skill.requiredSlots.filter((s) => {
      const v = slots[s.key];
      return typeof v !== 'string' || v.trim().length === 0;
    });
  }

  private async extractSlots(
    skill: SkillDefinition,
    userGoal: string,
    knownSlots: Record<string, unknown>,
    input: SkillTurnInput,
  ): Promise<{ isProductionRequest: boolean; slots: Record<string, unknown> }> {
    const slotDesc = skill.requiredSlots
      .map((s) => `${s.key}(${s.label})`)
      .join('、');
    const prompt = `你在判断用户是否真的想让「${input.characterName}」直接产出一份可下载的${skill.artifactName}成品文件，还是只是在咨询方法/思路。
并从对话里抽取这些字段的值（能确定才填，拿不准就留空字符串）：${slotDesc}
已知（之前已收集）：${JSON.stringify(knownSlots)}
用户诉求：${userGoal}
只输出 JSON：{"isProductionRequest": true 或 false, "slots": {${skill.requiredSlots
      .map((s) => `"${s.key}": ""`)
      .join(', ')}}}
判定规则：仅当用户明确想要"做出/生成/出一份/帮我做"成品文件时 isProductionRequest=true；若只是问"怎么做""该放什么""有什么建议"等方法咨询，则 false。`;

    const result = await this.ai.generateJsonObject({
      prompt,
      usageContext: this.usageContext(input, 'skill_slot_extract'),
      maxTokens: 700,
      temperature: 0.2,
      fallback: { isProductionRequest: false, slots: {} },
    });

    const rawSlots =
      result && typeof result.slots === 'object' && result.slots
        ? (result.slots as Record<string, unknown>)
        : {};
    const slots: Record<string, unknown> = { ...knownSlots };
    for (const s of skill.requiredSlots) {
      const v = rawSlots[s.key];
      if (typeof v === 'string' && v.trim().length > 0) {
        slots[s.key] = v.trim();
      }
    }
    return {
      isProductionRequest: result?.isProductionRequest === true,
      slots,
    };
  }

  private usageContext(input: SkillTurnInput, scene: string) {
    return {
      surface: 'app' as const,
      scene,
      scopeType: 'conversation' as const,
      scopeId: input.conversationId,
      ownerId: input.ownerId,
      characterId: input.character.id,
      characterName: input.characterName,
      conversationId: input.conversationId,
    };
  }

  private newRunId(): string {
    return `skr_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }
}
