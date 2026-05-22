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
// 走查本次 R2：searchAndFormat 调用方多样（shake-discovery 的 topTopic、
// moments 的 expertDomains+"最新"、wiki-private AI 的 name+bio），其中
// shake-discovery 直接吃 cyberAvatar.focus 字段，理论无长度上限。MiniMax
// /v1/coding_plan/search docs 推荐 "3-5 keywords 效果最好"，超长 query 至少
// 4xx + 烧 200/天 quota 一次，且即便不 4xx 也搜不出有意义结果。给一个软上
// 限：超 200 字裁掉。和 shouldTriggerForUserMessage 的 500 字 gate 区分:
// gate 是 "不应该触发"，cap 是 "已决定触发但 query 不能太长"。
const MAX_SEARCH_QUERY_CHARS = 200;
// 走查 yuanzui0728 本次 R1：群聊 group-reply-task scheduleTurn 会按 N 个
// actor 创建 N 行 task；每行 task 跑 generateTaskReply 时各自独立调
// webSearch.searchAndFormat(baseUserPrompt)。如果 3 个 actor 都开了
// webSearchEnabled，同一条触发消息会烧 3 份 200/天 配额——而 in-process
// executeTurn 路径 R2 时已经预取共享了，task 路径漏了。也覆盖：
//  - 用户连发两条同 query "今天天气" 短时间内
//  - shake-discovery + moments 同 owner 同 expertDomains 撞同 query
//  - 同 turn 内 in-process generateTaskReply 与异步 task 并行
// in-flight 共享 Promise；成功结果再缓存 60s，期间命中直接返回老 markdown。
// 60s 远小于 200/天 配额恢复周期，对时效性影响可忽略（"最近发生" 不会 60s
// 内换主角）。失败/null 不缓存（避免 quota 临时拒后被锁死 60s）。
const RESULT_CACHE_TTL_MS = 60_000;

export interface WebSearchInjection {
  query: string;
  markdown: string;
  hits: number;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  // 同 query 的 in-flight Promise 共享，避免群聊 N actor 并发 fan-out 烧 N 份配额。
  private readonly inFlight = new Map<
    string,
    Promise<WebSearchInjection | null>
  >();
  // 成功结果短 TTL 缓存（仅缓存有结果的 injection；null/failure 不缓存以保留
  // 重试机会）。同 query 60s 内复用同一份 markdown。
  private readonly resultCache = new Map<
    string,
    { injection: WebSearchInjection; expiresAt: number }
  >();

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
    const trimmed = query.trim();
    if (!trimmed) return null;
    if (!this.minimax.isConfigured()) return null;
    // 软裁防 200/天 quota 烧在必败超长 query 上（shake-discovery 直接传
    // cyberAvatar.focus 字段无上限）。
    const cleaned =
      trimmed.length > MAX_SEARCH_QUERY_CHARS
        ? trimmed.slice(0, MAX_SEARCH_QUERY_CHARS)
        : trimmed;

    // 命中 60s 缓存直接返回。
    const now = Date.now();
    const cached = this.resultCache.get(cleaned);
    if (cached) {
      if (cached.expiresAt > now) {
        return cached.injection;
      }
      this.resultCache.delete(cleaned);
    }
    // 已有同 query 在飞 → 共享同一 Promise，省一份 quota。
    const existing = this.inFlight.get(cleaned);
    if (existing) return existing;

    const job = (async (): Promise<WebSearchInjection | null> => {
      try {
        const result = await this.performSearch(cleaned);
        if (result) {
          this.resultCache.set(cleaned, {
            injection: result,
            expiresAt: Date.now() + RESULT_CACHE_TTL_MS,
          });
          this.pruneExpiredCache();
        }
        return result;
      } finally {
        this.inFlight.delete(cleaned);
      }
    })();
    this.inFlight.set(cleaned, job);
    return job;
  }

  private async performSearch(
    cleaned: string,
  ): Promise<WebSearchInjection | null> {
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

  // 一次 set 时顺手清过期 entry；进程内能在飞的 query 同时数 << 上百，无需 LRU。
  private pruneExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.resultCache) {
      if (entry.expiresAt <= now) {
        this.resultCache.delete(key);
      }
    }
  }
}
// i18n-ignore-end
