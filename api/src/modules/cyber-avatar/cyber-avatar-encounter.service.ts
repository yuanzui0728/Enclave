import { Injectable, Logger } from '@nestjs/common';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  cleanTranscriptText,
  sanitizeTranscriptTurns,
} from '../social/transcript-sanitizer';
import { CyberAvatarService } from './cyber-avatar.service';

export type CounterpartSnapshot = {
  personaSummary: string;
  interestTags: string[];
  displayName: string;
};

export type GeneratedTranscript = {
  summary: string;
  turns: Array<{ speaker: 'initiator' | 'recipient'; text: string }>;
};

// 分身相遇对话脚本生成（world 侧，由 cloud-api 通过 DOWN 调用触发）。
// 用本 world owner 的分身画像(initiator) + 对方快照(recipient) 让 AI 编一段自然对话。
@Injectable()
export class CyberAvatarEncounterService {
  private readonly logger = new Logger(CyberAvatarEncounterService.name);

  constructor(
    private readonly cyberAvatar: CyberAvatarService,
    private readonly ai: AiOrchestratorService,
    private readonly worldOwner: WorldOwnerService,
  ) {}

  async generateTranscript(input: {
    counterpartSnapshot: CounterpartSnapshot;
  }): Promise<GeneratedTranscript | null> {
    const owner = await this.worldOwner.getOwnerOrThrow();
    const selfPersona = (await this.cyberAvatar.buildPromptContext()).trim();
    const counterpart = input.counterpartSnapshot;

    const prompt = buildTranscriptPrompt({
      selfPersona,
      counterpartSummary: counterpart.personaSummary?.trim() || '',
      counterpartTags: (counterpart.interestTags ?? []).slice(0, 12),
    });

    const result = await this.ai.generateJsonObject({
      prompt,
      usageContext: {
        surface: 'app',
        scene: 'encounter_transcript',
        scopeType: 'world',
        scopeId: owner.id,
        scopeLabel: owner.username?.trim() || 'world-owner',
        ownerId: owner.id,
      },
      maxTokens: 4000,
      temperature: 0.7,
      fallback: {},
    });

    const rawTurns = Array.isArray(
      (result as { turns?: unknown }).turns,
    )
      ? ((result as { turns: unknown[] }).turns as Array<{
          speaker?: unknown;
          text?: unknown;
        }>)
      : [];
    const turns = sanitizeTranscriptTurns(rawTurns);
    if (turns.length === 0) {
      // generateJsonObject 失败会回 {}（吞错），或全被清洗掉 → 视为生成失败。
      this.logger.warn('Encounter transcript generation produced no usable turns.');
      return null;
    }

    const summaryRaw =
      typeof (result as { summary?: unknown }).summary === 'string'
        ? ((result as { summary: string }).summary)
        : '';
    return { summary: cleanTranscriptText(summaryRaw), turns };
  }
}

function buildTranscriptPrompt(input: {
  selfPersona: string;
  counterpartSummary: string;
  counterpartTags: string[];
}): string {
  const selfBlock = input.selfPersona
    ? input.selfPersona
    : '（暂无足够画像，请把"我方分身"演成一个友好、好奇、边界感正常的普通人。）';
  const counterpartBlock = input.counterpartSummary
    ? input.counterpartSummary
    : '（暂无足够画像，请把"对方分身"演成一个友好、好奇的普通人。）';
  const tags = input.counterpartTags.length
    ? input.counterpartTags.join('、')
    : '（未知）';

  return `你是隐界的"分身相遇"对话编剧。两个真实用户的赛博分身在一次偶遇里短暂交谈。
请根据双方画像，生成一段自然、克制、6-10 轮的对话，体现两人是否聊得来。

我方分身画像（initiator）：
${selfBlock}

对方分身画像（recipient）：
${counterpartBlock}
对方兴趣标签：${tags}

硬性规则：
- 绝对不要输出任何真实联系方式：手机号、微信号、QQ、邮箱、链接、二维码。
- 不要让任一分身说"加我微信 / 我的号码是…"。联系方式只有双方都选"想要"后由系统披露，对话里不得出现。
- 不要暴露这是 AI 生成；不要旁白；不要写 (动作) / 【场景】 / *神态*。
- 语气自然，像两个陌生人初次搭话，不要过度热络、不要下结论。
- initiator 与 recipient 交替发言，从打招呼到找到共同话题，自然收尾。

只输出 JSON（不要任何额外文字）：
{
  "summary": "一句话概括两人是否合拍",
  "turns": [
    { "speaker": "initiator", "text": "……" },
    { "speaker": "recipient", "text": "……" }
  ]
}`;
}
