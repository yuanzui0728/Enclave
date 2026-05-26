// i18n-ignore-start: backend service, errors are domain codes (no user-facing zh strings).
import { Injectable, Logger } from '@nestjs/common';
import type {
  WikiGameArtifact,
  WikiGameSpec,
  WikiGameConversationTurn,
} from '../wiki-game.types';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import type { AiUsageContext } from '../../ai/ai.types';
import { GameGenerationJobService } from './game-generation-job.service';
import { WikiGameService } from './wiki-game.service';
import {
  GAME_SPEC_SYSTEM_PROMPT,
  buildGameCodeSystemPrompt,
  buildGameCodeUserPrompt,
  buildGameRefineSystemPrompt,
  buildGameSpecUserPrompt,
} from './wiki-game-ai.prompts';

/** 单文件游戏产物体积上限（字节）。超过判定生成异常（多半是模型跑飞）。 */
const MAX_HTML_BYTES = 1_500_000;
/** code 阶段 token 预算：HTML 大 + 推理模型 reasoning 占用，给足但有界。 */
const CODE_MAX_TOKENS = 12000;
const SPEC_MAX_TOKENS = 900;

@Injectable()
export class WikiGameAiService {
  private readonly logger = new Logger(WikiGameAiService.name);

  constructor(
    private readonly orchestrator: AiOrchestratorService,
    private readonly jobService: GameGenerationJobService,
    private readonly gameService: WikiGameService,
  ) {}

  /**
   * 后台异步执行入口。controller enqueue 后用 setImmediate 调度，与 HTTP 解耦。
   * 任何异常都吞掉并 markFailed —— 调用栈是 setImmediate，没人接错误。
   */
  async runGameJobInBackground(jobId: string): Promise<void> {
    const job = await this.jobService.getByIdInternal(jobId).catch(() => null);
    if (!job) {
      this.logger.warn(`game-generation-job ${jobId} not found, abort`);
      return;
    }

    let input: { prompt?: string; title?: string; instruction?: string };
    try {
      input = JSON.parse(job.inputSnapshot) ?? {};
    } catch (err) {
      await this.jobService.markFailed(
        jobId,
        `输入反序列化失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    try {
      const revision =
        job.scope === 'game_create'
          ? await this.runCreate(job.ownerUserId, job.gameId, input)
          : await this.runRefine(job.ownerUserId, job.gameId, input);
      await this.jobService.markReady(jobId, revision.id, revision.version);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`game-generation-job ${jobId} failed: ${message}`);
      await this.jobService.markFailed(jobId, message);
    }
  }

  private async runCreate(
    ownerUserId: string,
    gameId: string,
    input: { prompt?: string; title?: string },
  ): Promise<{ id: string; version: number }> {
    const prompt = (input.prompt ?? '').trim();
    if (!prompt) throw new Error('缺少游戏描述');

    const usage = this.usage(ownerUserId, 'wiki_game_generate_spec');
    // stage 1：spec
    const specRaw = await this.orchestrator.generateJsonObject({
      prompt: `${GAME_SPEC_SYSTEM_PROMPT}\n\n---\n\n${buildGameSpecUserPrompt({ prompt, title: input.title })}`,
      usageContext: usage,
      temperature: 0.5,
      maxTokens: SPEC_MAX_TOKENS,
    });
    const spec = normalizeSpec(specRaw, prompt, input.title);

    // stage 2：code
    const html = await this.generateHtml(
      ownerUserId,
      'wiki_game_generate_code',
      [
        { role: 'system' as const, content: buildGameCodeSystemPrompt() },
        { role: 'user' as const, content: buildGameCodeUserPrompt({ prompt, spec }) },
      ],
    );

    const artifact = buildArtifact({
      spec,
      prompt,
      html,
      conversation: [
        { role: 'user', text: prompt, at: new Date().toISOString() },
        { role: 'assistant', text: `已生成《${spec.title}》初版`, version: 1, at: new Date().toISOString() },
      ],
      generatedModel: 'minimax',
    });

    return this.gameService.appendRevision({
      gameId,
      artifact,
      instruction: prompt,
      changeSource: 'ai_create',
      editorUserId: ownerUserId,
    });
  }

  private async runRefine(
    ownerUserId: string,
    gameId: string,
    input: { instruction?: string },
  ): Promise<{ id: string; version: number }> {
    const instruction = (input.instruction ?? '').trim();
    if (!instruction) throw new Error('缺少修改指令');

    const prev = await this.gameService.loadLatestArtifact(gameId);
    if (!prev) throw new Error('找不到要修改的游戏产物');

    const userMsg = [
      '当前游戏的完整 HTML：',
      prev.html,
      '',
      `修改指令：${instruction}`,
      '',
      '请输出修改后的完整 HTML。',
    ].join('\n');

    const html = await this.generateHtml(
      ownerUserId,
      'wiki_game_refine',
      [
        { role: 'system' as const, content: buildGameRefineSystemPrompt() },
        { role: 'user' as const, content: userMsg },
      ],
    );

    const conversation: WikiGameConversationTurn[] = [
      ...prev.conversation,
      { role: 'user', text: instruction, at: new Date().toISOString() },
      { role: 'assistant', text: '已应用修改', at: new Date().toISOString() },
    ];

    const artifact = buildArtifact({
      spec: prev.spec,
      prompt: prev.prompt,
      html,
      conversation,
      generatedModel: 'minimax',
    });

    return this.gameService.appendRevision({
      gameId,
      artifact,
      instruction,
      changeSource: 'ai_refine',
      editorUserId: ownerUserId,
    });
  }

  /** 跑 code/refine 的 LLM 调用 + 抽取 + 校验，返回干净的 HTML。 */
  private async generateHtml(
    ownerUserId: string,
    scene: string,
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    const text = await this.orchestrator.generateWithMessages({
      messages,
      usageContext: this.usage(ownerUserId, scene),
      temperature: 0.6,
      maxTokens: CODE_MAX_TOKENS,
    });
    const html = parseHtmlFromModelOutput(text);
    if (!html) throw new Error('模型未产出可用的 HTML');
    if (!/<\/html\s*>/i.test(html)) {
      throw new Error('生成的 HTML 不完整（疑似被截断），请重试或简化需求');
    }
    if (byteLength(html) > MAX_HTML_BYTES) {
      throw new Error('生成的游戏体积过大，请简化需求后重试');
    }
    return html;
  }

  private usage(ownerId: string, scene: string): AiUsageContext {
    return { surface: 'app', scene, scopeType: 'world', ownerId };
  }
}

// ───────── helpers ─────────

function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

function trimStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeSpec(
  raw: Record<string, unknown>,
  prompt: string,
  fallbackTitle?: string,
): WikiGameSpec {
  return {
    title: trimStr(raw.title, 30) || (fallbackTitle?.trim() || prompt.slice(0, 14) || '小游戏'),
    pitch: trimStr(raw.pitch, 60) || prompt.slice(0, 30),
    genre: trimStr(raw.genre, 20) || '休闲',
    rules: trimStr(raw.rules, 800) || prompt,
    controls: trimStr(raw.controls, 200) || '触屏点击',
    winLose: trimStr(raw.winLose, 300) || '达成目标即胜利',
  };
}

/**
 * 从模型输出里抽出干净的 HTML 文档：
 * 1. 剥 ```html ... ``` markdown 围栏（generatePlainText/withMessages 不剥 fence）
 * 2. 取从 <!doctype 或 <html 到最后一个 </html> 的片段
 * （<think> 块已被 sanitizeAiText 提前剥掉）
 */
function parseHtmlFromModelOutput(text: string): string | null {
  if (!text) return null;
  let body = text.trim();

  // markdown fence：```html\n...\n``` 或 ```\n...\n```
  const fence = body.match(/```(?:html|HTML)?\s*([\s\S]*?)```/);
  if (fence && fence[1].trim()) {
    body = fence[1].trim();
  } else {
    // 未闭合 fence：```html 起到末尾
    const openFence = body.match(/```(?:html|HTML)?\s*([\s\S]+)$/);
    if (openFence && openFence[1].includes('<')) {
      body = openFence[1].trim();
    }
  }

  const lower = body.toLowerCase();
  let start = lower.indexOf('<!doctype');
  if (start < 0) start = lower.indexOf('<html');
  const end = lower.lastIndexOf('</html>');
  if (start >= 0 && end > start) {
    return body.slice(start, end + '</html>'.length);
  }
  // 没有规范 html 标签：兜底返回原文（让上层的 </html> 校验拦截截断）
  return body.includes('<') ? body : null;
}

function detectExternalRefs(html: string): boolean {
  return (
    /<script[^>]+src\s*=/i.test(html) ||
    /<link[^>]+href\s*=/i.test(html) ||
    /\bfetch\s*\(/i.test(html) ||
    /\bXMLHttpRequest\b/i.test(html) ||
    /\bnew\s+WebSocket\b/i.test(html) ||
    /https?:\/\/(?!localhost)/i.test(html)
  );
}

function buildArtifact(input: {
  spec: WikiGameSpec;
  prompt: string;
  html: string;
  conversation: WikiGameConversationTurn[];
  generatedModel?: string | null;
}): WikiGameArtifact {
  const html = input.html;
  return {
    schemaVersion: 1,
    spec: input.spec,
    prompt: input.prompt,
    conversation: input.conversation,
    html,
    meta: {
      estimatedBytes: byteLength(html),
      hasExternalRefs: detectExternalRefs(html),
      generatedModel: input.generatedModel ?? null,
      truncated: !/<\/html\s*>/i.test(html),
    },
  };
}
// i18n-ignore-end
