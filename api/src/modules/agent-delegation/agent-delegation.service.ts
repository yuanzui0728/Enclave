import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService } from '../characters/characters.service';
import { CharacterEntity } from '../characters/character.entity';
import {
  SELF_CHARACTER_ID,
} from '../characters/default-characters';
import { REMINDER_CHARACTER_ID } from '../characters/reminder-character';
import { TenantContextStore } from '../tenancy/tenant-context';
import { AgentDelegationEntity } from './agent-delegation.entity';
import { AgentDelegationMessageEntity } from './agent-delegation-message.entity';
import type {
  // i18n-ignore-start: 运行时类型，非前端 UI。
  AgentDelegationDispatchHandle,
  AgentDelegationStatus,
  AgentDelegationTranscriptSenderType,
  // i18n-ignore-end
} from './agent-delegation.types';

// 处理时长保护：working 超过这个时长视为卡死，重新入队（仿 reply-artifact-job 的 stale requeue）。
const DELEGATION_PROCESSING_RETRY_MS = 2 * 60 * 1000;
// pending_anchor 超过这个时长仍没回填 anchor = 孤儿（ack 未落库），标 failed 清理。
const PENDING_ANCHOR_STALE_MS = 5 * 60 * 1000;
// 单轮最多派给几个专家（控成本，也避免「我」一次拉一群人开会）。
const MAX_EXPERTS_PER_DISPATCH = 2;
// 太短的消息（寒暄/语气词）直接跳过派发，零开销。
const MIN_MESSAGE_LENGTH_FOR_TRIAGE = 10;
// 任务意图启发式：只有像「具体求助 / 任务」的消息才值得尝试派发。否则「我」自己聊。
// 这一层把 triage LLM 调用从「每条消息」降到「看起来像活儿的消息」，也强化「明显领域才转」。
const TASK_INTENT_PATTERN =
  /帮我|帮忙|帮我?看看|怎么|如何|怎样|方案|分析|分析一下|写一?[个份篇条]|做一?[个份]|起草|拟一?[个份]|计划|规划|报告|汇报|总结|梳理|标书|投标|招标|竞品|会议|纪要|策划|选品|文案|PPT|ppt|复盘|流程|自动化|优化|评估|对标|提取|整理|搜集|收集|调研|建议|拆解|清单|模板|话术|预算|排期|时间表/;

@Injectable()
export class AgentDelegationService {
  private readonly logger = new Logger(AgentDelegationService.name);

  constructor(
    @InjectRepository(AgentDelegationEntity)
    private readonly delegationRepo: Repository<AgentDelegationEntity>,
    @InjectRepository(AgentDelegationMessageEntity)
    private readonly transcriptRepo: Repository<AgentDelegationMessageEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
  ) {}

  // ───────────────────────── triage + 建批次（SelfAgentService 调） ─────────────────────────

  // 「我」收到一条消息后判断要不要找专家。仅在 owner 已安装专家、且明显落在某专家领域时才转。
  // 命中则建一批 delegation（pending_anchor）+ 初始 transcript，返回 ack 文案与 batchId；
  // 不命中（含任何异常）返回 null，由调用方回落普通自我对话。
  async triageAndCreateBatch(input: {
    conversationId: string;
    ownerId: string;
    userMessage: string;
    sourceMessageId: string;
  }): Promise<AgentDelegationDispatchHandle | null> {
    const message = input.userMessage?.trim() ?? '';
    if (message.length < MIN_MESSAGE_LENGTH_FOR_TRIAGE) {
      return null;
    }
    // 不像「具体任务 / 求助」的消息直接跳过——不花 triage LLM、不打断闲聊。
    if (!TASK_INTENT_PATTERN.test(message)) {
      return null;
    }

    const experts = await this.listInstalledExperts();
    if (!experts.length) {
      return null;
    }

    // 派发是否发生 = 确定性领域匹配（不让 LLM 否决）：消息是否明显落在某位已安装专家的
    // 领域（中文专家名/简介与任务关键词重合）。实测默认模型偏好自答、会一律 dispatch=false，
    // 所以「要不要转」用确定性匹配判，LLM 只负责措辞（ack + 任务简报）。
    const matched = this.matchExperts(message, experts);
    if (!matched.length) {
      return null;
    }
    this.logger.log(
      `[triage] matched=${JSON.stringify(matched.map((m) => `${m.expert.name}:${m.score}`))}`,
    );

    // LLM 仅润色 ack + 每位专家任务简报（不否决）；失败/缺失走模板兜底。
    const phrasing = await this.composeDispatchPhrasing(
      message,
      matched.map((m) => m.expert),
    );
    const chosen = matched.map((m) => ({
      expert: m.expert,
      taskBrief:
        phrasing.briefs[m.expert.id]?.trim() ||
        `用户的请求：${message}`,
    }));

    const batchId = randomUUID();
    const ackText =
      phrasing.ackText?.trim() ||
      this.buildFallbackAck(chosen.map((c) => c.expert.name));

    for (const { expert, taskBrief } of chosen) {
      const delegation = await this.delegationRepo.save(
        this.delegationRepo.create({
          ownerId: input.ownerId,
          batchId,
          parentConversationId: input.conversationId,
          anchorMessageId: null,
          triggerMessageId: input.sourceMessageId,
          triggerMessageText: message,
          expertCharacterId: expert.id,
          expertName: expert.name,
          taskBrief,
          status: 'pending_anchor',
          synthesized: false,
        }),
      );
      // 初始 transcript：「我」向专家抛出的任务简报（专家视角下是一条 user 提问）。
      await this.appendTranscript({
        delegationId: delegation.id,
        ownerId: input.ownerId,
        senderType: 'self',
        senderId: SELF_CHARACTER_ID,
        senderName: '我',
        text: taskBrief,
      });
    }

    return { batchId, ackText };
  }

  // chat.service 落库「我」ack 气泡后回填 anchor，并把 pending_anchor 翻成 queued（Cron 才会挑）。
  async attachAnchorMessage(batchId: string, anchorMessageId: string): Promise<void> {
    const rows = await this.delegationRepo.find({
      where: { batchId, status: 'pending_anchor' },
    });
    if (!rows.length) {
      return;
    }
    await this.delegationRepo.save(
      rows.map((row) => ({
        ...row,
        anchorMessageId,
        status: 'queued' as AgentDelegationStatus,
      })),
    );
  }

  // ───────────────────────── 查询（控制器 / 前端折叠用） ─────────────────────────

  // 当前 owner 帧内、某父会话下的全部协作线程（含 transcript）。按 ownerId 显式隔离防串号。
  async listForConversation(conversationId: string) {
    const ownerId = TenantContextStore.get()?.ownerId ?? null;
    const delegations = await this.delegationRepo.find({
      where: ownerId
        ? { parentConversationId: conversationId, ownerId }
        : { parentConversationId: conversationId },
      order: { createdAt: 'ASC' },
    });
    if (!delegations.length) {
      return [];
    }
    const transcripts = await this.transcriptRepo.find({
      where: { delegationId: In(delegations.map((d) => d.id)) },
      order: { createdAt: 'ASC' },
    });
    const transcriptByDelegation = new Map<string, AgentDelegationMessageEntity[]>();
    for (const message of transcripts) {
      const list = transcriptByDelegation.get(message.delegationId) ?? [];
      list.push(message);
      transcriptByDelegation.set(message.delegationId, list);
    }
    return delegations.map((delegation) =>
      this.serialize(delegation, transcriptByDelegation.get(delegation.id) ?? []),
    );
  }

  // ───────────────────────── 用户介入（控制器调） ─────────────────────────

  // 用户随时往某条协作线程里补一句上下文 → 追加 user transcript + 该 delegation 重新入队 +
  // 批次 synthesized 复位（让专家带新上下文重答后「我」重新综合追更）。
  async intervene(input: {
    delegationId: string;
    text: string;
  }): Promise<ReturnType<AgentDelegationService['serialize']> | null> {
    const ownerId = TenantContextStore.get()?.ownerId ?? null;
    const delegation = await this.delegationRepo.findOneBy({ id: input.delegationId });
    if (!delegation) {
      return null;
    }
    // 串号防护（fail-closed）：本实体不在 scoped-entities，无 afterLoad 读守卫兜底，
    // 这处手动校验是唯一隔离。shared 模式下 owner 必须严格一致——绝不能因 delegation.ownerId
    // 为空就放行（原 `ownerId && delegation.ownerId && …` 在 ownerId 缺失时 fail-open，
    // 等于让 A 介入 B 的协作线程）。非 shared(LPP) 单 owner 进程 ownerId 为 null，跳过。
    if (ownerId !== null && delegation.ownerId !== ownerId) {
      return null;
    }
    const text = input.text?.trim();
    if (!text) {
      return null;
    }

    await this.appendTranscript({
      delegationId: delegation.id,
      ownerId: delegation.ownerId,
      senderType: 'user',
      senderId: 'user',
      senderName: '我（你本人）',
      text,
    });

    delegation.status = 'queued';
    delegation.synthesized = false;
    delegation.errorMessage = null;
    await this.delegationRepo.save(delegation);
    // 批次内其它兄弟若已综合过，复位 synthesized 让综合重新触发（综合是按批次的）。
    await this.resetBatchSynthesized(delegation.batchId);

    const transcript = await this.getTranscript(delegation.id);
    return this.serialize(delegation, transcript);
  }

  // ───────────────────────── runner 内部用 ─────────────────────────

  // Cron 全 owner 轮询：挑 queued 的 delegation（不带租户过滤，按 ownerId 进各自帧处理）。
  async claimQueuedGlobally(limit: number): Promise<AgentDelegationEntity[]> {
    await this.requeueStaleProcessing();
    return this.delegationRepo.find({
      where: { status: 'queued' },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async getById(id: string): Promise<AgentDelegationEntity | null> {
    return this.delegationRepo.findOneBy({ id });
  }

  // 原子认领：仅当仍是 queued 时把它翻成 working（条件 UPDATE，SQLite 串行写 → 跨 tick/跨进程
  // 都不会被两次认领，杜绝专家被重复生成）。返回是否认领成功，由调用方据此决定是否执行。
  async tryClaimQueued(id: string): Promise<boolean> {
    const result = await this.delegationRepo
      .createQueryBuilder()
      .update(AgentDelegationEntity)
      .set({ status: 'working', lastAttemptAt: new Date() })
      .where('id = :id AND status = :status', { id, status: 'queued' })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async getBatchSiblings(batchId: string): Promise<AgentDelegationEntity[]> {
    return this.delegationRepo.find({ where: { batchId }, order: { createdAt: 'ASC' } });
  }

  async setStatus(
    id: string,
    status: AgentDelegationStatus,
    patch?: { errorMessage?: string | null; touchAttempt?: boolean },
  ): Promise<void> {
    const delegation = await this.delegationRepo.findOneBy({ id });
    if (!delegation) {
      return;
    }
    delegation.status = status;
    if (patch?.errorMessage !== undefined) {
      delegation.errorMessage = patch.errorMessage;
    }
    if (patch?.touchAttempt) {
      delegation.lastAttemptAt = new Date();
    }
    await this.delegationRepo.save(delegation);
  }

  // 把整批标记为已综合 + completed（综合成功后调），幂等防重复追更。
  async markBatchSynthesized(batchId: string): Promise<void> {
    const rows = await this.delegationRepo.find({ where: { batchId } });
    await this.delegationRepo.save(
      rows.map((row) => ({
        ...row,
        synthesized: true,
        status:
          row.status === 'failed'
            ? row.status
            : ('completed' as AgentDelegationStatus),
      })),
    );
  }

  async getTranscript(
    delegationId: string,
  ): Promise<AgentDelegationMessageEntity[]> {
    return this.transcriptRepo.find({
      where: { delegationId },
      order: { createdAt: 'ASC' },
    });
  }

  async appendTranscript(input: {
    delegationId: string;
    ownerId: string | null;
    senderType: AgentDelegationTranscriptSenderType;
    senderId: string;
    senderName: string;
    text: string;
  }): Promise<AgentDelegationMessageEntity> {
    return this.transcriptRepo.save(
      this.transcriptRepo.create({
        delegationId: input.delegationId,
        ownerId: input.ownerId,
        senderType: input.senderType,
        senderId: input.senderId,
        senderName: input.senderName,
        text: input.text,
      }),
    );
  }

  serialize(
    delegation: AgentDelegationEntity,
    transcript: AgentDelegationMessageEntity[],
  ) {
    return {
      id: delegation.id,
      batchId: delegation.batchId,
      parentConversationId: delegation.parentConversationId,
      anchorMessageId: delegation.anchorMessageId,
      expertCharacterId: delegation.expertCharacterId,
      expertName: delegation.expertName,
      taskBrief: delegation.taskBrief,
      status: delegation.status,
      messages: transcript.map((message) => ({
        id: message.id,
        senderType: message.senderType,
        senderId: message.senderId,
        senderName: message.senderName,
        text: message.text,
        createdAt: (message.createdAt ?? new Date()).toISOString(),
      })),
      createdAt: (delegation.createdAt ?? new Date()).toISOString(),
      updatedAt: (delegation.updatedAt ?? new Date()).toISOString(),
    };
  }

  // ───────────────────────── 私有 ─────────────────────────

  // 当前 owner 已安装、可作为子 agent 的专家：有领域标签、非「我」/非提醒助手。
  // 不截断——确定性匹配只是字符串打分，遍历全部很便宜；真实用户也只会装少量专家。
  private async listInstalledExperts(): Promise<CharacterEntity[]> {
    const characters = await this.characters.findAll();
    return characters.filter(
      (character) =>
        character.id !== SELF_CHARACTER_ID &&
        character.id !== REMINDER_CHARACTER_ID &&
        character.relationshipType !== 'self' &&
        Array.isArray(character.expertDomains) &&
        character.expertDomains.length > 0,
    );
  }

  // 角色名里的通用职衔后缀——比对领域时剥掉，只留领域核心词（如「招投标顾问」→「招投标」）。
  private static readonly ROLE_SUFFIX =
    /(顾问|助理|分析师|审核师|策划师|工程师|设计师|专家|经理|师|官|手|搭子)$/;

  // 确定性领域匹配：消息是否明显落在某位专家领域。**必须有强信号**（名核词 2-gram 命中
  // 或领域英文标签命中）才算对口——只靠简介通用词重合不足以派发，避免误命中啰嗦的人设/名人
  // 角色。简介重合与专家型角色只用于排序，不单独触发。返回 top 专家（最多 MAX_EXPERTS_PER_DISPATCH）。
  private matchExperts(
    message: string,
    experts: CharacterEntity[],
  ): Array<{ expert: CharacterEntity; score: number }> {
    const lowerMessage = message.toLowerCase();
    const scored = experts
      .map((expert) => {
        const { strong, weak } = this.scoreExpert(message, lowerMessage, expert);
        const boost = expert.relationshipType === 'expert' && strong > 0 ? 1 : 0;
        return { expert, strong, score: strong + weak + boost };
      })
      // 阈值卡在「强信号」上：strong>=3 = 至少一个名核词命中 / 足够的领域命中。
      .filter((item) => item.strong >= 3)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_EXPERTS_PER_DISPATCH);
  }

  private scoreExpert(
    message: string,
    lowerMessage: string,
    expert: CharacterEntity,
  ): { strong: number; weak: number } {
    let strong = 0;
    // 名核词（剥职衔后）的 2-gram 命中：最强信号（如「招投标」的「招投」「投标」）。
    const core = (expert.name ?? '').replace(AgentDelegationService.ROLE_SUFFIX, '');
    for (const gram of this.bigrams(core)) {
      if (message.includes(gram)) {
        strong += 3;
      }
    }
    // 领域英文标签直接命中（中文消息里少见，但命中即强相关）。
    for (const domain of expert.expertDomains ?? []) {
      const d = domain.trim().toLowerCase();
      if (d.length >= 3 && lowerMessage.includes(d)) {
        strong += 2;
      }
    }
    // 简介 2-gram 重合：弱信号，封顶 3 分，仅参与排序、不足以单独触发派发。
    let weak = 0;
    const bio = (expert.bio ?? '').replace(/\s+/g, '');
    const seen = new Set<string>();
    for (const gram of this.bigrams(bio)) {
      if (seen.has(gram)) continue;
      seen.add(gram);
      if (message.includes(gram)) {
        weak += 1;
        if (weak >= 3) break;
      }
    }
    return { strong, weak };
  }

  private bigrams(text: string): string[] {
    const cleaned = (text ?? '').replace(/[^一-龥a-zA-Z0-9]/g, '');
    const out: string[] = [];
    for (let i = 0; i + 2 <= cleaned.length; i += 1) {
      out.push(cleaned.slice(i, i + 2));
    }
    return out;
  }

  // LLM 仅负责措辞（不否决派发）：给定已选定的专家，产出 ack + 每位的任务简报。失败走模板。
  private async composeDispatchPhrasing(
    message: string,
    experts: CharacterEntity[],
  ): Promise<{ ackText: string; briefs: Record<string, string> }> {
    const roster = experts
      .map((e) => `- id="${e.id}" 名字="${e.name}"（${e.relationship}）`)
      .join('\n');
    const prompt = [
      '你是「我」——用户在这个世界里的分身、也是用户面对整个世界的唯一入口。',
      '用户发来一个任务，你已经决定把它交给下面这些对口的专家居民帮忙处理。',
      '请只做两件事：',
      '1) 用熟人口吻给用户一句话回执（ackText）：告诉对方你去找谁帮看一下、稍等，不要罗列、不超过两句。',
      '2) 给每位专家写一句任务简报（taskBrief）：把要他处理的事说清楚，可补充你从消息里读到的背景。',
      '',
      '专家名单：',
      roster,
      '',
      `用户消息：「${message}」`,
      '',
      '只输出 JSON：{ "ackText": "...", "briefs": { "<专家id>": "<任务简报>" } }',
    ].join('\n');

    try {
      const raw = await this.ai.generateJsonObject({
        prompt,
        usageContext: {
          surface: 'app',
          scene: 'expert_delegation_phrasing',
          scopeType: 'conversation',
          characterId: SELF_CHARACTER_ID,
        },
        maxTokens: 500,
        temperature: 0.4,
        // 内部措辞调用，不走会员硬拦——真正费钱的专家/综合调用在 runner 里会 gate。
        skipSubscriptionGate: true,
        fallback: { ackText: '', briefs: {} },
      });
      const briefsRaw =
        raw.briefs && typeof raw.briefs === 'object'
          ? (raw.briefs as Record<string, unknown>)
          : {};
      const briefs: Record<string, string> = {};
      for (const [id, value] of Object.entries(briefsRaw)) {
        if (typeof value === 'string' && value.trim()) {
          briefs[id] = value.trim();
        }
      }
      return {
        ackText: typeof raw.ackText === 'string' ? raw.ackText : '',
        briefs,
      };
    } catch {
      return { ackText: '', briefs: {} };
    }
  }

  private buildFallbackAck(expertNames: string[]): string {
    const names = expertNames.join('、');
    return `这块我让${names}帮你看一下，稍等我一下啊。`;
  }

  private async resetBatchSynthesized(batchId: string): Promise<void> {
    const rows = await this.delegationRepo.find({
      where: { batchId, synthesized: true },
    });
    if (!rows.length) {
      return;
    }
    await this.delegationRepo.save(
      rows.map((row) => ({ ...row, synthesized: false })),
    );
  }

  private async requeueStaleProcessing(): Promise<void> {
    const staleBefore = new Date(Date.now() - DELEGATION_PROCESSING_RETRY_MS);
    const stale = await this.delegationRepo.find({
      where: { status: 'working', lastAttemptAt: LessThanOrEqual(staleBefore) },
      take: 12,
    });
    if (stale.length) {
      await this.delegationRepo.save(
        stale.map((row) => ({
          ...row,
          status: 'queued' as AgentDelegationStatus,
          errorMessage: row.errorMessage ?? 'requeued_after_stale_processing',
        })),
      );
    }

    // 清理孤儿 pending_anchor：派发已建但「我」ack 气泡始终没落库回填 anchor（极少见，
    // 如 ack 生成异常）。这些行永远不会被处理（Cron 只挑 queued），超时标 failed 别堆着。
    const anchorStaleBefore = new Date(
      Date.now() - PENDING_ANCHOR_STALE_MS,
    );
    const orphans = await this.delegationRepo.find({
      where: {
        status: 'pending_anchor',
        createdAt: LessThanOrEqual(anchorStaleBefore),
      },
      take: 12,
    });
    if (orphans.length) {
      await this.delegationRepo.save(
        orphans.map((row) => ({
          ...row,
          status: 'failed' as AgentDelegationStatus,
          errorMessage: 'anchor_never_attached',
        })),
      );
    }
  }
}
