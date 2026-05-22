// i18n-ignore-start: backend infra — log/system-prompt strings only.
import { Injectable, Logger } from '@nestjs/common';
import { MinimaxClient, MinimaxClientError } from '../minimax/minimax.client';
import { MinimaxQuotaService } from '../minimax/minimax-quota.service';

// 触发"实时知识"搜索的关键词清单（中英混用，覆盖典型时效性追问）。
// 命中任一即认为这条用户消息可能需要联网；不命中则跳过避免烧配额。
const TRIGGER_PATTERNS: readonly RegExp[] = [
  // 中文：时间相关
  /\b最近\b/, /\b今天\b/, /\b现在\b/, /\b最新\b/, /\b刚刚\b/, /\b这两天\b/,
  /\b近期\b/, /\b前几天\b/, /\b今年\b/, /\b目前\b/, /\b最新版\b/, /\b最近发生\b/,
  /\b几号\b/, /\b几月\b/, /\b上周\b/, /\b这周\b/,
  // 英文
  /\brecently\b/i, /\btoday\b/i, /\blatest\b/i, /\bbreaking\b/i,
  /\bcurrent(ly)?\b/i, /\bright now\b/i, /\bjust announced\b/i,
  /\bthis week\b/i, /\bthis month\b/i,
];

const QUOTA_MODEL = 'web-search';
const MAX_RESULTS_INJECTED = 5;

export interface WebSearchInjection {
  query: string;
  markdown: string;
  hits: number;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  constructor(
    private readonly minimax: MinimaxClient,
    private readonly quota: MinimaxQuotaService,
  ) {}

  // 是否值得对这条用户文本触发联网搜索。调用方判完角色 flag 后再调这个。
  shouldTriggerForUserMessage(text: string | null | undefined): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length < 2 || trimmed.length > 500) return false;
    return TRIGGER_PATTERNS.some((re) => re.test(trimmed));
  }

  // 实际去搜并返回可注入 system prompt 的 markdown 片段。
  // 任何失败（client 配置缺失 / quota 耗尽 / 网络）都 swallow 并返回 null
  // → 调用方退回到不带搜索的原 prompt。
  async searchAndFormat(query: string): Promise<WebSearchInjection | null> {
    const cleaned = query.trim();
    if (!cleaned) return null;
    if (!this.minimax.isConfigured()) return null;

    // 走标准 quota 三步：reserve → call → commit/release
    const reserved = await this.quota.tryReserve(QUOTA_MODEL);
    if (!reserved) {
      this.logger.debug(
        `web search skipped: quota reserve failed for "${cleaned.slice(0, 60)}"`,
      );
      return null;
    }

    try {
      const result = await this.minimax.searchWeb({ query: cleaned });
      await this.quota.commit(QUOTA_MODEL);
      if (!result.organic.length) return null;
      const top = result.organic.slice(0, MAX_RESULTS_INJECTED);
      const lines = top.map((item, idx) => {
        const dateSuffix = item.date ? `（${item.date}）` : '';
        return `${idx + 1}. ${item.title}${dateSuffix}\n   ${item.snippet}\n   来源：${item.link}`;
      });
      const markdown =
        `## 实时搜索结果（来自 MiniMax web_search · "${cleaned}"）\n` +
        lines.join('\n') +
        '\n\n如果用到上述资料，请在回复末尾用 `（来源：URL）` 形式标注引用。';
      return { query: cleaned, markdown, hits: top.length };
    } catch (err) {
      await this.quota.release(QUOTA_MODEL).catch(() => undefined);
      if (
        err instanceof MinimaxClientError &&
        err.code === 'MINIMAX_QUOTA_EXHAUSTED'
      ) {
        await this.quota.markExhaustedToday(QUOTA_MODEL);
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `web search failed query="${cleaned.slice(0, 60)}" err=${message}`,
      );
      return null;
    }
  }
}
// i18n-ignore-end
