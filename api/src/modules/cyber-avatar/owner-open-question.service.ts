// i18n-ignore-start: prompt/signal content — fed into LLM, not user-facing UI.
import { randomUUID } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { sleepForWorldJitter } from '../../common/cron-jitter.util';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SystemConfigService } from '../config/config.service';
import { MessageEntity } from '../chat/message.entity';
import { CyberAvatarRulesService } from './cyber-avatar-rules.service';

type StoredQuestion = {
  id: string;
  text: string;
  askedAt: string; // ISO
  status: 'open' | 'answered';
  domainTags?: string[];
};

type StoredBlob = {
  cursor?: string; // 上次处理到的最后一条消息 createdAt(ISO)，用于增量 + 限频
  items: StoredQuestion[];
};

/**
 * 单人世界中枢 · 显式「未解决疑问」捕获（用户定调的「什么问题还没解决」）。
 *
 * 区别于画像里隐式推断的 openLoops：这里用廉价 LLM 从近期对话里**显式**抽取「用户明确问了、
 * 但截至这段对话仍没被解答」的疑问，沉淀成 per-owner 列表，再由中枢渲染成 <world_open_questions>
 * 注入每个角色 prompt——让全世界角色都知道「Ta 还有哪些事没着落」，能主动接住。
 *
 * 设计取舍（并行会话碰撞期）：**不新建实体/迁移**（central entities 列表 app.module 正被并行编辑），
 * 直接存 system_config 的 per-owner 键 `cyber_avatar_open_questions`（≤20 条 JSON，足够渲染 top5）。
 * 抽取走 15min cron（不上聊天热路径加延迟）；闭环=LLM 判定已答 + 14 天 stale 兜底。
 * 红线：per-owner fan-out + getOwnerOrThrow 作用域；异常一律吞掉，绝不影响主路径。
 */
@Injectable()
export class OwnerOpenQuestionService {
  private readonly logger = new Logger(OwnerOpenQuestionService.name);

  private static readonly CONFIG_KEY = 'cyber_avatar_open_questions';
  private static readonly LOOKBACK_HOURS = 4;
  private static readonly MESSAGE_FETCH = 80;
  private static readonly MAX_STORED = 20;
  private static readonly OPEN_TTL_DAYS = 14;
  private static readonly RENDER_LIMIT = 5;
  private static readonly RENDER_MAX_CHARS = 400;
  private static readonly PER_LINE_MAX = 80;

  constructor(
    @InjectRepository(MessageEntity)
    private readonly msgRepo: Repository<MessageEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly systemConfig: SystemConfigService,
    private readonly rulesService: CyberAvatarRulesService,
  ) {}

  // 每 15 分钟(:22/:37/:52)抽一次，错开 cyber-avatar(:4-59/5)/feed-digest(:15)。
  @Cron('22-59/15 * * * *')
  async runExtractCron() {
    await sleepForWorldJitter(60_000);
    await this.worldOwnerService.forEachOwner(async () => {
      try {
        const rules = await this.rulesService.getRules();
        if (!rules.enabled || rules.pauseAutoUpdates) return;
        await this.runForCurrentOwner();
      } catch (error) {
        this.logger.debug(
          `open-question extract skipped for owner: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }, 'owner-open-question extract');
  }

  /** 当前租户帧内：增量抽取近期对话里未解答的疑问，合并进 per-owner 列表。 */
  async runForCurrentOwner(): Promise<void> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const blob = await this.loadBlob();

    const lookbackFloor = new Date(
      Date.now() - OwnerOpenQuestionService.LOOKBACK_HOURS * 3_600_000,
    );
    const cursorDate = blob.cursor ? new Date(blob.cursor) : null;
    const since =
      cursorDate && cursorDate > lookbackFloor ? cursorDate : lookbackFloor;

    const messages = await this.msgRepo.find({
      where: { ownerId: owner.id, createdAt: MoreThan(since) },
      order: { createdAt: 'ASC' },
      take: OwnerOpenQuestionService.MESSAGE_FETCH,
    });
    const userMsgs = messages.filter(
      (m) => m.senderType === 'user' && m.text?.trim(),
    );
    if (userMsgs.length === 0) {
      // 无新用户消息：仅做 stale 清理 + 持久化（限频：下次不重复扫旧消息）。
      const pruned = this.prune(blob.items);
      if (pruned.length !== blob.items.length) {
        await this.saveBlob({ cursor: blob.cursor, items: pruned });
      }
      return;
    }

    const transcript = messages
      .filter((m) => m.text?.trim() && m.senderType !== 'system')
      .map((m) => `[${m.senderType === 'user' ? '用户' : '角色'}] ${m.text.trim()}`)
      .join('\n')
      .slice(0, 4000);

    const openItems = blob.items.filter((i) => i.status === 'open');
    const openTextList = openItems
      .map((i, idx) => `${idx + 1}. ${i.text}`)
      .join('\n');

    const prompt = [
      '你在分析一个用户与若干 AI 角色的近期对话片段。任务：找出**用户明确提出、但截至这段对话结束仍未得到解答**的问题/疑惑。',
      '',
      '【近期对话片段】',
      transcript,
      '',
      openTextList
        ? `【此前已记录、仍待解决的问题】\n${openTextList}`
        : '【此前无已记录的待解决问题】',
      '',
      '只输出 JSON（不要解释）：',
      '{"stillOpen":[{"text":"用户的疑问，精炼成一句，≤40字","domainTags":["可选领域标签"]}],"nowAnswered":["此前列表中、现在已在片段里被解答的问题原文"]}',
      '规则：只算用户真正的疑问/求助；闲聊、反问、修辞问句不算；已经在片段里被回答的别放进 stillOpen；没有就给空数组。',
    ].join('\n');

    const result = await this.ai.generateJsonObject({
      prompt,
      usageContext: {
        surface: 'scheduler',
        scene: 'cyber_avatar_open_question',
        scopeType: 'world',
        scopeId: owner.id,
        scopeLabel: owner.username?.trim() || 'world-owner',
        ownerId: owner.id,
      },
      maxTokens: 700,
      temperature: 0.1,
      fallback: { stillOpen: [], nowAnswered: [] },
    });

    const stillOpen = this.parseStillOpen(result.stillOpen);
    const nowAnswered = this.parseStringList(result.nowAnswered);

    // 1) 标记已答
    const answeredSet = new Set(nowAnswered.map((t) => this.normalize(t)));
    for (const item of blob.items) {
      if (item.status === 'open' && answeredSet.has(this.normalize(item.text))) {
        item.status = 'answered';
      }
    }
    // 2) 加入新的待解决（按归一化文本去重）
    const existing = new Set(blob.items.map((i) => this.normalize(i.text)));
    const nowIso = new Date().toISOString();
    for (const q of stillOpen) {
      const norm = this.normalize(q.text);
      if (!norm || existing.has(norm)) continue;
      existing.add(norm);
      blob.items.push({
        id: randomUUID(),
        text: q.text.slice(0, 60),
        askedAt: nowIso,
        status: 'open',
        domainTags: q.domainTags?.slice(0, 4),
      });
    }
    // 3) 清理 + 截断 + 推进游标
    const lastMsg = messages[messages.length - 1];
    await this.saveBlob({
      cursor: lastMsg?.createdAt
        ? new Date(lastMsg.createdAt).toISOString()
        : blob.cursor,
      items: this.prune(blob.items),
    });
  }

  /** 中枢读取：当前 owner 仍未解决、且 14 天内的疑问，最多 N 条（最近优先）。 */
  async listOpenQuestions(
    limit = OwnerOpenQuestionService.RENDER_LIMIT,
  ): Promise<Array<{ text: string; askedAt: string }>> {
    const blob = await this.loadBlob();
    const ttlFloor =
      Date.now() - OwnerOpenQuestionService.OPEN_TTL_DAYS * 86_400_000;
    return blob.items
      .filter(
        (i) =>
          i.status === 'open' && new Date(i.askedAt).getTime() >= ttlFloor,
      )
      .sort(
        (a, b) => new Date(b.askedAt).getTime() - new Date(a.askedAt).getTime(),
      )
      .slice(0, limit)
      .map((i) => ({ text: i.text, askedAt: i.askedAt }));
  }

  /** 渲染成 prompt 块（中枢调用）。无未解决疑问 → ''。 */
  async renderOpenQuestionsBlock(): Promise<string> {
    try {
      const items = await this.listOpenQuestions();
      if (items.length === 0) return '';
      const lines = items.map((i) => {
        const when = this.relativeDayLabel(new Date(i.askedAt).getTime());
        const text =
          i.text.length > OwnerOpenQuestionService.PER_LINE_MAX
            ? `${i.text.slice(0, OwnerOpenQuestionService.PER_LINE_MAX).trimEnd()}…`
            : i.text;
        return `- ${when ? `${when}问过：` : ''}${text}`;
      });
      const body = lines.join('\n').slice(0, OwnerOpenQuestionService.RENDER_MAX_CHARS);
      return [
        '<world_open_questions>',
        '【这个用户最近抛出、但还没人接住的疑问——若自然且相关，可主动接续帮 Ta 想办法，',
        '但别逐条复读、别一次塞一堆、也别明知故问已经解决的】',
        body,
        '</world_open_questions>',
      ].join('\n');
    } catch (error) {
      this.logger.debug(
        `renderOpenQuestionsBlock skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return '';
    }
  }

  // ---- 内部 ----

  private prune(items: StoredQuestion[]): StoredQuestion[] {
    const ttlFloor =
      Date.now() - OwnerOpenQuestionService.OPEN_TTL_DAYS * 86_400_000;
    // 丢弃：已答的 + open 但超 14 天的 stale。
    const kept = items.filter(
      (i) => i.status === 'open' && new Date(i.askedAt).getTime() >= ttlFloor,
    );
    // 截断：保留最新 MAX_STORED 条。
    return kept
      .sort(
        (a, b) => new Date(b.askedAt).getTime() - new Date(a.askedAt).getTime(),
      )
      .slice(0, OwnerOpenQuestionService.MAX_STORED);
  }

  private async loadBlob(): Promise<StoredBlob> {
    try {
      const raw = await this.systemConfig.getConfig(
        OwnerOpenQuestionService.CONFIG_KEY,
      );
      if (!raw) return { items: [] };
      const parsed = JSON.parse(raw) as Partial<StoredBlob>;
      return {
        cursor: parsed.cursor,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return { items: [] };
    }
  }

  private async saveBlob(blob: StoredBlob): Promise<void> {
    await this.systemConfig.setConfig(
      OwnerOpenQuestionService.CONFIG_KEY,
      JSON.stringify(blob),
    );
  }

  private parseStillOpen(
    value: unknown,
  ): Array<{ text: string; domainTags?: string[] }> {
    if (!Array.isArray(value)) return [];
    const out: Array<{ text: string; domainTags?: string[] }> = [];
    for (const v of value) {
      if (v && typeof v === 'object' && typeof (v as any).text === 'string') {
        const text = (v as any).text.trim();
        if (!text) continue;
        const tags = (v as any).domainTags;
        out.push({
          text,
          domainTags: Array.isArray(tags)
            ? tags.filter((t: unknown) => typeof t === 'string')
            : undefined,
        });
      }
    }
    return out;
  }

  private parseStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && !!v.trim());
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[\s，。、？?！!,.；;：:"'「」『』（）()]/g, '')
      .trim();
  }

  private relativeDayLabel(occurredAtMs: number): string {
    if (!Number.isFinite(occurredAtMs)) return '';
    const diffMs = Date.now() - occurredAtMs;
    if (diffMs < 0) return '刚刚';
    const days = Math.floor(diffMs / 86_400_000);
    if (days <= 0) return '今天';
    if (days === 1) return '昨天';
    if (days <= 7) return `${days}天前`;
    if (days <= 30) return `${Math.floor(days / 7)}周前`;
    return `${Math.floor(days / 30)}个月前`;
  }
}
// i18n-ignore-end
