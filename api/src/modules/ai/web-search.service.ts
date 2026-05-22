// i18n-ignore-start: backend infra — log/system-prompt strings only.
import { Injectable, Logger } from '@nestjs/common';
import { MinimaxClient, MinimaxClientError } from '../minimax/minimax.client';
import { MinimaxQuotaService } from '../minimax/minimax-quota.service';

// 触发"实时知识"搜索的关键词清单（中英混用，覆盖典型时效性追问）。
// 命中任一即认为这条用户消息可能需要联网；不命中则跳过避免烧配额。
//
// 走查 R2：原版中文模式全部用 `\b...\b` —— JS regex 的 `\b` 是 ASCII word
// boundary（[A-Za-z0-9_] 与非 word 字符之间），中文字符是非 word，意味着
// "最近怎么样" "今天天气" 这类 100% 中文输入里 `\b最近\b` 永远匹配不到。
// 实测确认：5 条典型中文样本里 0 hit。整个 web_search 功能对中文用户=死的。
// 修法：中文模式纯子串匹配（不要 `\b`），英文模式继续用 `\b` 防止
// "recently" 被嵌在 "torrent ly" 之类里误触。
const TRIGGER_PATTERNS: readonly RegExp[] = [
  // 中文：时间相关（必须纯子串匹配，中文无 word boundary）
  /最近/, /今天/, /现在/, /最新/, /刚刚/, /这两天/,
  /近期/, /前几天/, /今年/, /目前/, /最新版/,
  /几号/, /几月/, /上周/, /这周/, /本周/, /本月/,
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
