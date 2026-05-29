import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../common/app-error.exception';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import type { AiUsageContext } from '../ai/ai.types';
import { WorldOwnerService } from '../auth/world-owner.service';
import { MessageEntity } from '../chat/message.entity';
import { CyberAvatarService } from './cyber-avatar.service';
import { CyberAvatarRulesService } from './cyber-avatar-rules.service';
import type { CyberAvatarSelfFacingPromptConfig } from './cyber-avatar.types';

// 用户态「赛博分身」——把已有的分身画像（cyber-avatar 信号沉淀）包成"面向本人"的薄壳：
// 查看画像 / 与分身对话（第一人称镜像）/ 结论分析报告 / 重建。owner 由请求级
// TenantContext 决定（getOwnerOrThrow），天然按 ownerId 隔离。
// i18n-ignore-start: 后端 prompt / 分身回复兜底文案，非前端可本地化 UI。

// 分身对话复用 messages 表，固定保留会话 id（已加进 conversation-visibility 屏蔽前缀，
// 不出现在正常聊天列表）。直接用 repo 读写，绝不走 ChatService/Gateway，避免触发普通 AI 回复管线。
const SELF_AVATAR_CONVERSATION_ID = 'self_avatar';
const SELF_AVATAR_SENDER_ID = 'self_avatar';
const SELF_AVATAR_SENDER_NAME = '赛博分身';
const CHAT_HISTORY_LIMIT = 40;
const REBUILD_COOLDOWN_MS = {
  incremental: 5 * 60 * 1000,
  full: 30 * 60 * 1000,
} as const;

// 与 cyber-avatar.service.ts 的 renderTemplate 同语义：把 {{key}} 占位符替换成变量值。
function renderTemplate(
  template: string,
  variables: Record<string, string | undefined | null>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

type CyberAvatarReadiness = 'empty' | 'building' | 'ready';

type SerializedProfile = Awaited<ReturnType<CyberAvatarService['getProfile']>>;

export interface CyberAvatarSelfChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class CyberAvatarSelfService {
  constructor(
    private readonly cyberAvatar: CyberAvatarService,
    private readonly rules: CyberAvatarRulesService,
    private readonly ai: AiOrchestratorService,
    private readonly worldOwnerService: WorldOwnerService,
    @InjectRepository(MessageEntity)
    private readonly msgRepo: Repository<MessageEntity>,
  ) {}

  // ---- GET /cyber-avatar/me ------------------------------------------------
  async getSelfProfile() {
    const profile = await this.cyberAvatar.getProfile();
    return this.toSelfProfile(profile);
  }

  // ---- GET /cyber-avatar/chat/history --------------------------------------
  async getChatHistory(): Promise<{ turns: CyberAvatarSelfChatTurn[] }> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const turns = await this.loadHistory(owner.id, CHAT_HISTORY_LIMIT);
    return { turns };
  }

  // ---- POST /cyber-avatar/chat ---------------------------------------------
  async chat(rawMessage: string): Promise<{
    reply: string;
    readiness: CyberAvatarReadiness;
    signalCount: number;
  }> {
    const message = (rawMessage ?? '').trim();
    if (!message) {
      throw new AppError('CYBER_AVATAR_CHAT_EMPTY_MESSAGE', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '请先输入内容。',
      });
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const profile = await this.cyberAvatar.getProfile();
    const rules = await this.rules.getRules();
    const readiness = this.deriveReadiness(profile);
    const signalCount = profile.signalCount ?? 0;

    // 0 信号短路：不调 LLM、不落库（前台低数据态本就不进对话 tab，这是防御路径）。
    if (signalCount <= 0) {
      return {
        reply: rules.selfFacing.chatNoDataReply,
        readiness,
        signalCount,
      };
    }

    const history = await this.loadHistory(owner.id, CHAT_HISTORY_LIMIT);
    const systemPrompt = this.buildSelfChatSystemPrompt(
      profile,
      rules.selfFacing,
    );
    const usageContext: AiUsageContext = {
      surface: 'app',
      scene: 'cyber_avatar_self_chat',
      scopeType: 'world',
      scopeId: owner.id,
      scopeLabel: owner.username?.trim() || 'world-owner',
      ownerId: owner.id,
    };

    // fallback 用空串：generateWithMessages 内部吞错后返回 fallback。若拿到空串＝生成失败，
    // 此时**不落库**（否则会把道歉文案当成真实分身回复永久写进历史），抛错让前台显示重发。
    const reply = await this.ai.generateWithMessages({
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: 'user', content: message },
      ],
      usageContext,
      maxTokens: 700,
      temperature: 0.7,
      fallback: '',
    });

    if (!reply.trim()) {
      throw new AppError('CYBER_AVATAR_CHAT_FAILED', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '赛博分身暂时没法回应，请稍后再试。',
      });
    }

    // 用户轮 + 分身轮都落库（服务端持久化为准），分身能跨会话记住历史。
    // createdAt 是秒级精度，两轮可能落在同一秒——给 assistant 的 id/时间 +1ms，
    // 并在 loadHistory 里按 (createdAt, id) 排序，保证用户问在前、分身答在后。
    const baseMs = Date.now();
    await this.persistTurn(owner.id, 'user', owner.id, message, baseMs);
    await this.persistTurn(
      owner.id,
      'character',
      SELF_AVATAR_SENDER_ID,
      reply,
      baseMs + 1,
    );

    return { reply, readiness, signalCount };
  }

  // ---- POST /cyber-avatar/analysis -----------------------------------------
  async analysis() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const profile = await this.cyberAvatar.getProfile();
    const selfFacing = (await this.rules.getRules()).selfFacing;
    const signalCount = profile.signalCount ?? 0;
    const confidenceLevel = this.deriveConfidenceLevel(profile);

    if (signalCount <= 0) {
      return this.emptyReport(signalCount, selfFacing);
    }

    const usageContext: AiUsageContext = {
      surface: 'app',
      scene: 'cyber_avatar_self_analysis',
      scopeType: 'world',
      scopeId: owner.id,
      scopeLabel: owner.username?.trim() || 'world-owner',
      ownerId: owner.id,
    };

    const profileForPrompt = {
      liveState: profile.liveState,
      recentState: profile.recentState,
      stableCore: profile.stableCore,
      confidence: profile.confidence,
      sourceCoverage: profile.sourceCoverage,
      signalCount,
    };

    const llm = await this.ai.generateJsonObject({
      prompt: renderTemplate(selfFacing.analysisPrompt, {
        profile: JSON.stringify(profileForPrompt, null, 2),
      }),
      usageContext,
      maxTokens: 1400,
      temperature: 0.3,
      fallback: {},
    });

    // generatedAt / basedOnSignalCount / confidenceLevel 由服务端用真实画像覆盖，不信 LLM。
    const report = {
      generatedAt: new Date().toISOString(),
      basedOnSignalCount: signalCount,
      confidenceLevel,
      headline: this.str(llm.headline),
      personalitySummary: this.str(llm.personalitySummary),
      strengths: this.strList(llm.strengths),
      blindSpots: this.strList(llm.blindSpots),
      recurringPatterns: this.strList(llm.recurringPatterns),
      socialStyle: this.str(llm.socialStyle),
      suggestions: this.strList(llm.suggestions),
      caveat: this.str(llm.caveat) || selfFacing.analysisDefaultCaveat,
    };

    // LLM 失败时 generateJsonObject 返回 {}，上面除 caveat 全空——这不是有效报告。
    // 抛错让前台显示"生成失败 + 重试"，而不是渲染一张只有免责声明的空报告。
    const hasContent =
      report.headline ||
      report.personalitySummary ||
      report.socialStyle ||
      report.strengths.length > 0 ||
      report.blindSpots.length > 0 ||
      report.recurringPatterns.length > 0 ||
      report.suggestions.length > 0;
    if (!hasContent) {
      throw new AppError('CYBER_AVATAR_ANALYSIS_FAILED', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '结论生成失败，请稍后再试。',
      });
    }

    return report;
  }

  // ---- POST /cyber-avatar/rebuild ------------------------------------------
  async rebuild(rawMode?: string) {
    const mode: 'incremental' | 'full' =
      rawMode === 'full' ? 'full' : 'incremental';
    const profile = await this.cyberAvatar.getProfile();

    // 冷却：仅对"已经成功构建过"的画像生效（lastBuiltAt 非空）。新用户 / 仅 skip 过的
    // 画像 lastBuiltAt 为空，可立即重试（skip 不耗 AI）。
    const lastBuiltAt = profile.lastBuiltAt
      ? new Date(profile.lastBuiltAt)
      : null;
    const cooldownMs = REBUILD_COOLDOWN_MS[mode];
    if (lastBuiltAt && Date.now() - lastBuiltAt.getTime() < cooldownMs) {
      const retryAfterSeconds = Math.ceil(
        (cooldownMs - (Date.now() - lastBuiltAt.getTime())) / 1000,
      );
      throw new AppError('CYBER_AVATAR_REBUILD_COOLDOWN', {
        status: HttpStatus.TOO_MANY_REQUESTS,
        params: { retryAfterSeconds },
        legacyMessage: '赛博分身刚刚更新过，请稍后再试。',
      });
    }

    const run =
      mode === 'full'
        ? await this.cyberAvatar.runFullRebuild({ trigger: 'manual' })
        : await this.cyberAvatar.runIncrementalRefresh({ trigger: 'manual' });

    const cooldownUntil =
      run.status === 'success' || run.status === 'partial'
        ? new Date(Date.now() + cooldownMs).toISOString()
        : null;

    return {
      status: run.status,
      mode: run.mode,
      signalCount: run.signalCount ?? 0,
      profileVersion: run.profileVersion ?? profile.version ?? 0,
      skipReason: run.skipReason ?? null,
      cooldownUntil,
    };
  }

  // ---- helpers -------------------------------------------------------------

  private toSelfProfile(profile: SerializedProfile) {
    return {
      status: profile.status,
      readiness: this.deriveReadiness(profile),
      version: profile.version,
      liveState: profile.liveState,
      recentState: profile.recentState,
      stableCore: profile.stableCore,
      confidence: profile.confidence,
      sourceCoverage: profile.sourceCoverage,
      signalCount: profile.signalCount ?? 0,
      pendingSignalCount: profile.pendingSignalCount ?? 0,
      lastBuiltAt: profile.lastBuiltAt ?? null,
      lastSignalAt: profile.lastSignalAt ?? null,
      portraitImageUrl: profile.portraitImageUrl ?? null,
      portraitUpdatedAt: profile.portraitUpdatedAt ?? null,
      // 状态由有无图派生（生成中/失败是前台 mutation 瞬时态，不落库）。
      portraitStatus: (profile.portraitImageUrl ? 'ready' : 'none') as
        | 'ready'
        | 'none',
    };
  }

  private deriveReadiness(profile: SerializedProfile): CyberAvatarReadiness {
    const signalCount = profile.signalCount ?? 0;
    if (signalCount <= 0) {
      return 'empty';
    }
    return profile.status === 'ready' ? 'ready' : 'building';
  }

  private deriveConfidenceLevel(
    profile: SerializedProfile,
  ): 'low' | 'medium' | 'high' {
    const score = profile.confidence?.stableCore ?? 0;
    if (score >= 0.66) {
      return 'high';
    }
    if (score >= 0.34) {
      return 'medium';
    }
    return 'low';
  }

  // 模板（rules.selfFacing.chatSystemPrompt）保留固定的身份引子 + 对话规则；动态的画像认知块用
  // {{knowledge}} 注入、投影核心约束用 {{coreInstruction}}、低置信附言用 {{lowConfidenceNote}}（均按需填空）。
  private buildSelfChatSystemPrompt(
    profile: SerializedProfile,
    selfFacing: CyberAvatarSelfFacingPromptConfig,
  ): string {
    const live = profile.liveState;
    const recent = profile.recentState;
    const core = profile.stableCore;
    const knowledge = [
      this.kv('身份概述', core?.identitySummary),
      this.kv('沟通风格', core?.communicationStyle),
      this.kv('决策风格', core?.decisionStyle),
      this.kv('偏好模型', core?.preferenceModel),
      this.kv('社交姿态', core?.socialPosture),
      this.kv('边界', core?.boundaries),
      this.kv('风险偏好', core?.riskTolerance),
      this.kv('最近在意', live?.activeTopics),
      this.kv('当前情绪', live?.mood),
      this.kv('当前精力', live?.energy),
      this.kv('反复出现的主题', recent?.recurringTopics),
      this.kv('最近的目标', recent?.recentGoals),
    ]
      .filter(Boolean)
      .join('\n');

    const coreInstructionText = profile.promptProjection?.coreInstruction?.trim();
    const coreInstruction = coreInstructionText
      ? `\n\n【内部约束（来自画像投影，仅供你保持一致，不要原样念给用户）】\n${coreInstructionText}`
      : '';

    const lowConfidenceNote =
      (profile.confidence?.stableCore ?? 0) < 0.4
        ? `\n${selfFacing.chatLowConfidenceNote}`
        : '';

    return renderTemplate(selfFacing.chatSystemPrompt, {
      knowledge,
      coreInstruction,
      lowConfidenceNote,
    });
  }

  private kv(label: string, value?: string | string[] | null): string {
    if (!value) {
      return '';
    }
    const text = Array.isArray(value)
      ? value
          .filter((item) => typeof item === 'string' && item.trim())
          .join('、')
      : value.trim();
    return text ? `${label}：${text}` : '';
  }

  private emptyReport(
    signalCount: number,
    selfFacing: CyberAvatarSelfFacingPromptConfig,
  ) {
    return {
      generatedAt: new Date().toISOString(),
      basedOnSignalCount: signalCount,
      confidenceLevel: 'low' as const,
      headline: selfFacing.analysisEmptyHeadline,
      personalitySummary: '',
      strengths: [],
      blindSpots: [],
      recurringPatterns: [],
      socialStyle: '',
      suggestions: [],
      caveat: selfFacing.analysisEmptyCaveat,
    };
  }

  private async loadHistory(
    ownerId: string,
    limit: number,
  ): Promise<CyberAvatarSelfChatTurn[]> {
    // 取**最近** limit 条（DESC + take），否则长对话只会拿到最早的 40 条 —— reload 看到远古
    // 历史、LLM 上下文也只剩开头、分身"忘掉"近期对话。再 reverse 回时间正序用于展示/拼 prompt。
    // createdAt 秒级精度，同一秒内两轮靠 id（含毫秒时间戳，单调递增）做次序兜底。
    const rows = await this.msgRepo.find({
      where: { conversationId: SELF_AVATAR_CONVERSATION_ID, ownerId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    rows.reverse();
    return rows.map((row) => ({
      role: row.senderType === 'user' ? 'user' : 'assistant',
      content: row.text,
    }));
  }

  private async persistTurn(
    ownerId: string,
    senderType: 'user' | 'character',
    senderId: string,
    text: string,
    idMs: number,
  ): Promise<void> {
    // id 前缀用传入的毫秒时间戳（user < assistant），与 loadHistory 的 id 次序排序对齐。
    const entity = this.msgRepo.create({
      id: `msg_${idMs}_${randomUUID().slice(0, 8)}`,
      createdAt: new Date(idMs),
      ownerId,
      conversationId: SELF_AVATAR_CONVERSATION_ID,
      senderType,
      senderId,
      senderName: senderType === 'user' ? '我' : SELF_AVATAR_SENDER_NAME,
      type: 'text',
      text,
    });
    await this.msgRepo.save(entity);
  }

  private str(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private strList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(
        (item): item is string => typeof item === 'string' && !!item.trim(),
      )
      .map((item) => item.trim())
      .slice(0, 5);
  }
}
// i18n-ignore-end
