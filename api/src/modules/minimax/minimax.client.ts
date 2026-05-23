// i18n-ignore-start: provider adapter — error/log strings only.
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from '../subscription/subscription.service';
import { MinimaxUsageReporterService } from './minimax-usage-reporter.service';
import {
  type MinimaxBaseResp,
  type MinimaxBinary,
  type MinimaxFileRetrieveResult,
  type MinimaxImageInput,
  type MinimaxImageResult,
  type MinimaxLyricsInput,
  type MinimaxLyricsResult,
  type MinimaxMusicInput,
  type MinimaxMusicQueryResult,
  type MinimaxMusicResult,
  type MinimaxMusicStatus,
  type MinimaxVideoQueryResult,
  type MinimaxVideoStatus,
  type MinimaxVideoSubmitInput,
  type MinimaxVideoSubmitResult,
  type MinimaxWebSearchInput,
  type MinimaxWebSearchOrganicItem,
  type MinimaxWebSearchResult,
} from './minimax.types';

const DEFAULT_BASE_URL = 'https://api.minimaxi.com';
const DOWNLOAD_MAX_BYTES = 256 * 1024 * 1024; // 256 MB
const REQUEST_TIMEOUT_MS = 30_000; // API 请求 30s
const DOWNLOAD_TIMEOUT_MS = 120_000; // 二进制下载 120s

// MiniMax base_resp.status_code 分类
// 1008 余额不足 / 1042 单日 token 超限 / 2056 token plan daily/5h usage limit：
// 都是当天/当窗口确定性额度耗尽，重试浪费时间和日志。
const QUOTA_EXHAUSTED_CODES = new Set<number>([1008, 1042, 2056]);
// 1002 触发 RPM 限流 / 2003 模型并发数超限 / 1004 鉴权(可能瞬时网络) /
// 2062 token plan interactive-use concurrency 限流：可短期重试。
const RETRIABLE_PROVIDER_CODES = new Set<number>([1002, 1004, 2003, 2062]);
// 云控台遥测拆两列：
// - rpm：RPM/模型并发/token plan 并发 → 真节流，短期可恢复
// - quota：当日/当窗口额度耗尽 → 整天/小时内打过去就是浪费
// 1008 余额不足、1004 鉴权都不是限流口径，刻意排除。
const RPM_LIMITED_PROVIDER_CODES = new Set<number>([1002, 2003, 2062]);
const QUOTA_LIMITED_PROVIDER_CODES = new Set<number>([1042, 2056]);

export type MinimaxRateLimitKind = 'rpm' | 'quota' | null;

// 注意：故意不在 fetch 完成后 clearTimeout。fetch 在收到 headers 时就 resolve，
// 但 body 读取（response.text / arrayBuffer）是流式的，可能再卡几分钟。让 timer
// 自然到期触发 abort，body 读取也会抛 AbortError，避免完整生命周期失去超时保护。
// 正常完成路径下 timer 几十秒后过期，对资源无影响。
// 走查 yuanzui0728 本次 R2：加 .unref() 让 timer 不阻塞 event loop。pm2 reload
// / cloud-api 重启时 SIGTERM 不再等最后一批 30s timer 烧完才退出（之前最坏挂
// 30s，看似 hang）。process 真的还活着时 timer 该 firing 仍 firing 保护 body 流。
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return fetch(url, { ...init, signal: controller.signal });
}

export class MinimaxClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retriable: boolean,
    public readonly httpStatus?: number,
    public readonly providerStatusCode?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class MinimaxClient {
  private readonly logger = new Logger(MinimaxClient.name);
  // 同进程内的 token plan key 池。:3000 dev-watch 主进程读到根 .env 的
  // MINIMAX_API_KEYS（多 key）；cloud-api 派的 world child 那边 cloud-api 显式
  // delete 了 MINIMAX_API_KEYS、只注入单 MINIMAX_API_KEY——所以池子里就 1 个，
  // 行为与改造前等价。同进程内多 key 时按轮询挑，避免单进程偏置某一把。
  private readonly apiKeys: readonly string[];
  private readonly baseUrl: string;
  private callCounter = 0;

  constructor(
    config: ConfigService,
    private readonly subscription: SubscriptionService,
    @Optional()
    private readonly usageReporter?: MinimaxUsageReporterService,
  ) {
    const rawKeys = config.get<string>('MINIMAX_API_KEYS');
    const rawSingle = config.get<string>('MINIMAX_API_KEY');
    const fromCsv = (rawKeys ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const single = (rawSingle ?? '').trim();
    this.apiKeys = fromCsv.length > 0 ? fromCsv : single ? [single] : [];
    this.baseUrl = (
      config.get<string>('MINIMAX_BASE_URL') ?? DEFAULT_BASE_URL
    )
      .replace(/\/+$/, '')
      // 路径都自带 /v1 前缀，base 末尾若也带 /v1 会拼成 /v1/v1/... → 404
      .replace(/\/v1$/, '');
    if (this.apiKeys.length === 0) {
      this.logger.warn(
        'MINIMAX_API_KEY missing — token-plan video/music generation disabled',
      );
    } else if (this.apiKeys.length > 1) {
      const fps = this.apiKeys.map((k) => k.slice(-4)).join(',');
      this.logger.log(
        `MinimaxClient using ${this.apiKeys.length} keys round-robin: [${fps}]`,
      );
    }
  }

  isConfigured(): boolean {
    return this.apiKeys.length > 0;
  }

  private pickKey(): string {
    // 轮询：第 1 把、第 2 把、第 1 把… 进程内调用序号 % 池大小。
    // 单 key 池时永远返回同一把（与改造前等价）。
    const idx = this.callCounter++ % this.apiKeys.length;
    return this.apiKeys[idx];
  }

  async submitVideo(
    input: MinimaxVideoSubmitInput,
  ): Promise<MinimaxVideoSubmitResult> {
    await this.subscription.assertCanUseAi('image');
    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      duration: input.duration ?? 6,
      resolution: input.resolution ?? '768P',
    };
    if (input.firstFrameImageUrl) {
      body.first_frame_image = input.firstFrameImageUrl;
    }

    const response = await this.postJson<{
      task_id?: string;
      base_resp?: MinimaxBaseResp;
    }>('/v1/video_generation', body);
    this.assertSuccess(response.base_resp, 'video submit');
    const taskId = response.task_id?.trim();
    if (!taskId) {
      throw new MinimaxClientError(
        'MINIMAX_VIDEO_NO_TASK_ID',
        'video submit returned empty task_id',
        true,
      );
    }
    return { taskId };
  }

  async queryVideo(taskId: string): Promise<MinimaxVideoQueryResult> {
    const response = await this.getJson<{
      status?: string;
      file_id?: string;
      base_resp?: MinimaxBaseResp;
    }>(`/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`);
    // 不调用 assertSuccess：query 在任务失败时也会返回 base_resp.status_code != 0，
    // 但 top-level status='Fail' 已经表达了真实状态，应当读 status 而不是抛错。
    const status = (response.status ?? 'Unknown') as MinimaxVideoStatus;
    return {
      status,
      fileId: response.file_id ? String(response.file_id) : undefined,
      failReason: response.base_resp?.status_msg,
    };
  }

  async retrieveFile(fileId: string): Promise<MinimaxFileRetrieveResult> {
    const response = await this.getJson<{
      file?: {
        download_url?: string;
        backup_download_url?: string;
        filename?: string;
        bytes?: number;
      };
      base_resp?: MinimaxBaseResp;
    }>(`/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`);
    this.assertSuccess(response.base_resp, 'file retrieve');
    const url =
      response.file?.download_url ?? response.file?.backup_download_url;
    if (!url) {
      throw new MinimaxClientError(
        'MINIMAX_FILE_NO_URL',
        'file retrieve returned empty download_url',
        true,
      );
    }
    return {
      downloadUrl: url,
      fileName: response.file?.filename,
      size: response.file?.bytes,
    };
  }

  async generateImage(input: MinimaxImageInput): Promise<MinimaxImageResult> {
    await this.subscription.assertCanUseAi('image');
    const body = {
      model: input.model,
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? '1:1',
      n: input.n ?? 1,
      response_format: 'url',
      prompt_optimizer: false,
    };
    const response = await this.postJson<{
      data?: { image_urls?: string[] };
      base_resp?: MinimaxBaseResp;
    }>('/v1/image_generation', body);
    this.assertSuccess(response.base_resp, 'image generation');
    const url = response.data?.image_urls?.[0];
    if (!url) {
      throw new MinimaxClientError(
        'MINIMAX_IMAGE_EMPTY',
        'image generation returned no urls',
        true,
      );
    }
    const downloaded = await this.downloadBinary(url);
    return downloaded;
  }

  async generateMusic(input: MinimaxMusicInput): Promise<MinimaxMusicResult> {
    await this.subscription.assertCanUseAi('audio');
    const body: Record<string, unknown> = {
      model: input.model,
      audio_setting: {
        sample_rate: input.sampleRate ?? 44100,
        bitrate: input.bitrate ?? 256000,
        format: input.format ?? 'mp3',
      },
    };
    if (input.lyrics) {
      body.lyrics = input.lyrics;
    }
    if (input.prompt) {
      body.prompt = input.prompt;
    }
    if (input.referVoice) {
      body.refer_voice = input.referVoice;
    }

    const response = await this.postJson<{
      data?: { audio?: string; status?: number };
      task_id?: string;
      base_resp?: MinimaxBaseResp;
    }>('/v1/music_generation', body);
    this.assertSuccess(response.base_resp, 'music generation');

    const hex = response.data?.audio?.trim();
    if (hex) {
      const buffer = Buffer.from(hex, 'hex');
      if (!buffer.length) {
        throw new MinimaxClientError(
          'MINIMAX_MUSIC_EMPTY',
          'music generation returned empty buffer',
          true,
        );
      }
      return { kind: 'inline', buffer, mimeType: 'audio/mpeg' };
    }
    if (response.task_id) {
      return { kind: 'task', taskId: response.task_id };
    }
    throw new MinimaxClientError(
      'MINIMAX_MUSIC_EMPTY',
      'music generation returned no audio and no task_id',
      true,
    );
  }

  async queryMusic(taskId: string): Promise<MinimaxMusicQueryResult> {
    const response = await this.getJson<{
      status?: string;
      file_id?: string;
      data?: { audio?: string; status?: number };
      duration?: number;
      base_resp?: MinimaxBaseResp;
    }>(`/v1/query/music_generation?task_id=${encodeURIComponent(taskId)}`);
    // 与 queryVideo 一致：query 返回 base_resp 失败码也不抛错，
    // 优先读 status 判定真实状态。
    const status = (response.status ?? 'Unknown') as MinimaxMusicStatus;
    return {
      status,
      audioHex: response.data?.audio?.trim() || undefined,
      fileId: response.file_id ? String(response.file_id) : undefined,
      durationMs:
        typeof response.duration === 'number'
          ? Math.round(response.duration * 1000)
          : undefined,
      failReason: response.base_resp?.status_msg,
    };
  }

  async generateLyrics(
    input: MinimaxLyricsInput,
  ): Promise<MinimaxLyricsResult> {
    await this.subscription.assertCanUseAi('text');
    // mode 是必填字段；缺它 minimax 一律回 2013 invalid params。
    // 顶层字段：lyrics / song_title / style_tags（response 不再嵌在 data 里）。
    const response = await this.postJson<{
      lyrics?: string;
      song_title?: string;
      style_tags?: string;
      base_resp?: MinimaxBaseResp;
    }>('/v1/lyrics_generation', {
      mode: input.mode ?? 'write_full_song',
      prompt: input.prompt,
    });
    this.assertSuccess(response.base_resp, 'lyrics generation');
    const lyrics = response.lyrics?.trim();
    if (!lyrics) {
      throw new MinimaxClientError(
        'MINIMAX_LYRICS_EMPTY',
        'lyrics generation returned empty text',
        true,
      );
    }
    return {
      lyrics,
      songTitle: response.song_title?.trim() || undefined,
      styleTags: response.style_tags?.trim() || undefined,
    };
  }

  // Token Plan 图片理解（450 次 / 5h 窗口）走专用 /v1/coding_plan/vlm 端点；
  // chat completion / chatcompletion_v2 / /anthropic 三个端点对 image_url 一律静默丢图
  // （2026-05-22 实测确认）。/v1/coding_plan/vlm 跟 chat completion 完全无关，是 MCP
  // tool understand_image 走的同一条独立 VLM service——参考 PyPI 包
  // minimax-coding-plan-mcp 0.0.4 minimax_mcp/server.py + client.py。
  //
  // 入参：prompt（中文 OK），image（必须是 base64 dataUrl 或公网 https/http URL；
  // 本地 /api/moments/media 这种内网路径不行，调用方先转 dataUrl）。
  // 支持格式：JPEG / PNG / WebP（GIF 接口 docs 列了但 server.py 注释明确说不支持）
  // 上限 20MB。
  // 出参：content 一段 LLM 生成的描述文本；base_resp.status_code != 0 → 失败/熔断。
  async understandImage(input: {
    prompt: string;
    imageUrl: string; // base64 dataUrl 或 https URL
  }): Promise<{ content: string }> {
    await this.subscription.assertCanUseAi('text');
    const body = {
      prompt: input.prompt,
      image_url: input.imageUrl,
    };
    const response = await this.postJson<{
      content?: string;
      base_resp?: MinimaxBaseResp;
    }>('/v1/coding_plan/vlm', body);
    this.assertSuccess(response.base_resp, 'vlm');
    const content = response.content?.trim() ?? '';
    if (!content) {
      throw new MinimaxClientError(
        'MINIMAX_VLM_EMPTY',
        'vlm returned empty content',
        true,
      );
    }
    return { content };
  }

  // Token Plan 网络搜索（/v1/coding_plan/search）：与 VLM 同一类 coding_plan 端点。
  // 端点确认来源：PyPI 包 minimax-coding-plan-mcp 0.0.4 minimax_mcp/server.py:89。
  // 入参：q（搜索词，3-5 keywords 效果最好）。
  // 出参：organic[]={title,link,snippet,date}, related_searches[]={query},
  // base_resp.status_code != 0 → 失败/熔断。无官方公布日额度，先按估算软上限 200/天，
  // 撞 2056 走 markExhaustedToday 熔断。
  async searchWeb(input: MinimaxWebSearchInput): Promise<MinimaxWebSearchResult> {
    await this.subscription.assertCanUseAi('text');
    const query = input.query.trim();
    if (!query) {
      throw new MinimaxClientError(
        'MINIMAX_WEBSEARCH_EMPTY_QUERY',
        'web search query is empty',
        false,
      );
    }
    const response = await this.postJson<{
      organic?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
        date?: string;
      }>;
      related_searches?: Array<{ query?: string }>;
      base_resp?: MinimaxBaseResp;
    }>('/v1/coding_plan/search', { q: query });
    this.assertSuccess(response.base_resp, 'web search');
    const organic: MinimaxWebSearchOrganicItem[] = (response.organic ?? [])
      .map((item) => ({
        title: (item.title ?? '').trim(),
        link: (item.link ?? '').trim(),
        snippet: (item.snippet ?? '').trim(),
        date: item.date?.trim() || undefined,
      }))
      .filter((item) => item.title && item.link);
    const relatedSearches = (response.related_searches ?? [])
      .map((r) => r.query?.trim())
      .filter((q): q is string => !!q);
    return { organic, relatedSearches };
  }

  // MiniMax-M2.7 是 reasoning model：max_tokens 包含 reasoning_tokens，
  // ≤1000 时几乎全部 token 都被 reasoning 吃掉、content 为空。这里默认 2000，
  // 实测能稳定拿到完整 [verse]/[chorus] 输出。
  async chatCompletion(input: {
    model?: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string }> {
    await this.subscription.assertCanUseAi('text');
    const body = {
      model: input.model ?? 'MiniMax-M2.7',
      messages: input.messages,
      max_tokens: input.maxTokens ?? 2000,
      temperature: input.temperature ?? 0.9,
    };
    const response = await this.postJson<{
      choices?: Array<{ message?: { content?: string } }>;
      base_resp?: MinimaxBaseResp;
    }>('/v1/text/chatcompletion_v2', body);
    this.assertSuccess(response.base_resp, 'chat completion');
    const content = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (!content) {
      throw new MinimaxClientError(
        'MINIMAX_CHAT_EMPTY',
        'chat completion returned empty content',
        true,
      );
    }
    return { content };
  }

  async downloadBinary(
    url: string,
    opts?: { maxBytes?: number },
  ): Promise<MinimaxBinary> {
    const max = opts?.maxBytes ?? DOWNLOAD_MAX_BYTES;
    let res: Response;
    let arrayBuffer: ArrayBuffer;
    try {
      res = await fetchWithTimeout(url, {}, DOWNLOAD_TIMEOUT_MS);
      if (!res.ok) {
        throw new MinimaxClientError(
          'MINIMAX_DOWNLOAD_HTTP',
          `download http ${res.status}`,
          res.status >= 500 || res.status === 429,
          res.status,
        );
      }
      // 注意：body 读取也受 timer 保护，timer 到期会让 arrayBuffer() 抛 AbortError
      arrayBuffer = await res.arrayBuffer();
    } catch (error) {
      if (error instanceof MinimaxClientError) throw error;
      const err = error as Error & { name?: string };
      const isTimeout = err?.name === 'AbortError';
      throw new MinimaxClientError(
        isTimeout ? 'MINIMAX_DOWNLOAD_TIMEOUT' : 'MINIMAX_DOWNLOAD_NETWORK',
        isTimeout
          ? `download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`
          : `download network failure: ${err?.message}`,
        true,
      );
    }
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      throw new MinimaxClientError(
        'MINIMAX_DOWNLOAD_EMPTY',
        'downloaded buffer is empty',
        true,
      );
    }
    if (buffer.length > max) {
      throw new MinimaxClientError(
        'MINIMAX_DOWNLOAD_OVERSIZE',
        `downloaded buffer ${buffer.length} exceeds max ${max}`,
        false,
      );
    }
    const mimeType =
      res.headers.get('content-type') || guessMimeFromUrl(url);
    return { buffer, mimeType };
  }

  private async postJson<T>(pathname: string, body: unknown): Promise<T> {
    return this.requestJson<T>('POST', pathname, body);
  }

  private async getJson<T>(pathname: string): Promise<T> {
    return this.requestJson<T>('GET', pathname);
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    pathname: string,
    body?: unknown,
  ): Promise<T> {
    if (this.apiKeys.length === 0) {
      throw new MinimaxClientError(
        'MINIMAX_API_KEY_MISSING',
        'MINIMAX_API_KEY not configured',
        false,
      );
    }
    const apiKey = this.pickKey();
    const url = `${this.baseUrl}${pathname}`;
    let response: Response;
    let text: string;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
        },
        REQUEST_TIMEOUT_MS,
      );
      // body 读取也在 try 内：timer 到期触发 abort 时 text() 也会抛 AbortError
      text = await response.text();
    } catch (error) {
      const err = error as Error & { name?: string };
      const isTimeout = err?.name === 'AbortError';
      throw new MinimaxClientError(
        isTimeout ? 'MINIMAX_TIMEOUT' : 'MINIMAX_NETWORK',
        isTimeout
          ? `${pathname} timed out after ${REQUEST_TIMEOUT_MS}ms`
          : `network failure on ${pathname}: ${err?.message}`,
        true,
      );
    }
    // 拿到 HTTP 响应才计 1 次调用；网络/超时不计（没真打到 provider）。
    // 限流口径拆两列：
    // - rpm：HTTP 429 || provider code ∈ RPM_LIMITED_PROVIDER_CODES
    // - quota：provider code ∈ QUOTA_LIMITED_PROVIDER_CODES（1042/2056）
    // 优先级 quota > rpm（同一次响应都有时把它归到 quota，更接近真问题）。
    const providerCodeForTelemetry = tryExtractProviderCode(text);
    let rateLimitKind: MinimaxRateLimitKind = null;
    if (
      providerCodeForTelemetry !== null &&
      QUOTA_LIMITED_PROVIDER_CODES.has(providerCodeForTelemetry)
    ) {
      rateLimitKind = 'quota';
    } else if (
      response.status === 429 ||
      (providerCodeForTelemetry !== null &&
        RPM_LIMITED_PROVIDER_CODES.has(providerCodeForTelemetry))
    ) {
      rateLimitKind = 'rpm';
    }
    this.usageReporter?.recordCall(rateLimitKind);
    if (!response.ok) {
      // 优先解析 base_resp.status_code，确定性失败（如 1008 余额不足）
      // 不应被无脑标 retriable=true 触发指数退避重试。
      const providerCode = providerCodeForTelemetry;
      if (providerCode !== null && QUOTA_EXHAUSTED_CODES.has(providerCode)) {
        this.logger.warn(
          `minimax quota exhausted url=${url} status=${response.status} provider_code=${providerCode}`,
        );
        throw new MinimaxClientError(
          'MINIMAX_QUOTA_EXHAUSTED',
          `${pathname} provider quota exhausted (code=${providerCode})`,
          false,
          response.status,
          providerCode,
        );
      }
      const retriable =
        (providerCode !== null && RETRIABLE_PROVIDER_CODES.has(providerCode)) ||
        response.status >= 500 ||
        response.status === 429;
      this.logger.warn(
        `minimax http error url=${url} status=${response.status} provider_code=${providerCode ?? 'n/a'} body=${text.slice(0, 400)}`,
      );
      throw new MinimaxClientError(
        'MINIMAX_HTTP',
        `${pathname} returned ${response.status}${providerCode !== null ? ` provider=${providerCode}` : ''}: ${text.slice(0, 200)}`,
        retriable,
        response.status,
        providerCode ?? undefined,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new MinimaxClientError(
        'MINIMAX_INVALID_JSON',
        `${pathname} returned non-JSON body`,
        true,
      );
    }
  }

  private assertSuccess(
    resp: MinimaxBaseResp | undefined,
    context: string,
  ): void {
    if (!resp) return;
    if (resp.status_code === 0) return;
    const msg = resp.status_msg ?? `code=${resp.status_code}`;
    this.logger.warn(
      `minimax ${context} failed status_code=${resp.status_code} msg=${resp.status_msg ?? ''}`,
    );
    if (QUOTA_EXHAUSTED_CODES.has(resp.status_code)) {
      throw new MinimaxClientError(
        'MINIMAX_QUOTA_EXHAUSTED',
        `minimax ${context} quota exhausted: ${msg}`,
        false,
        undefined,
        resp.status_code,
      );
    }
    const retriable = RETRIABLE_PROVIDER_CODES.has(resp.status_code);
    throw new MinimaxClientError(
      'MINIMAX_PROVIDER',
      `minimax ${context} failed: ${msg}`,
      retriable,
      undefined,
      resp.status_code,
    );
  }
}

function tryExtractProviderCode(text: string): number | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { base_resp?: { status_code?: number } };
    const code = parsed?.base_resp?.status_code;
    return typeof code === 'number' ? code : null;
  } catch {
    return null;
  }
}

function guessMimeFromUrl(url: string): string {
  if (/\.mp4(\?|$)/i.test(url)) return 'video/mp4';
  if (/\.mp3(\?|$)/i.test(url)) return 'audio/mpeg';
  if (/\.wav(\?|$)/i.test(url)) return 'audio/wav';
  if (/\.jpe?g(\?|$)/i.test(url)) return 'image/jpeg';
  if (/\.png(\?|$)/i.test(url)) return 'image/png';
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp';
  return 'application/octet-stream';
}

// i18n-ignore-end
