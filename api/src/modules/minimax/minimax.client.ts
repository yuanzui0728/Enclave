// i18n-ignore-start: provider adapter — error/log strings only.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

// 注意：故意不在 fetch 完成后 clearTimeout。fetch 在收到 headers 时就 resolve，
// 但 body 读取（response.text / arrayBuffer）是流式的，可能再卡几分钟。让 timer
// 自然到期触发 abort，body 读取也会抛 AbortError，避免完整生命周期失去超时保护。
// 正常完成路径下 timer 几十秒后过期，对资源无影响。
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
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
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = (config.get<string>('MINIMAX_API_KEY') ?? '').trim();
    this.baseUrl = (
      config.get<string>('MINIMAX_BASE_URL') ?? DEFAULT_BASE_URL
    )
      .replace(/\/+$/, '')
      // 路径都自带 /v1 前缀，base 末尾若也带 /v1 会拼成 /v1/v1/... → 404
      .replace(/\/v1$/, '');
    if (!this.apiKey) {
      this.logger.warn(
        'MINIMAX_API_KEY missing — token-plan video/music generation disabled',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async submitVideo(
    input: MinimaxVideoSubmitInput,
  ): Promise<MinimaxVideoSubmitResult> {
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
    const response = await this.postJson<{
      data?: { lyrics?: string };
      base_resp?: MinimaxBaseResp;
    }>('/v1/lyrics_generation', { prompt: input.prompt });
    this.assertSuccess(response.base_resp, 'lyrics generation');
    const lyrics = response.data?.lyrics?.trim();
    if (!lyrics) {
      throw new MinimaxClientError(
        'MINIMAX_LYRICS_EMPTY',
        'lyrics generation returned empty text',
        true,
      );
    }
    return { lyrics };
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
    if (!this.apiKey) {
      throw new MinimaxClientError(
        'MINIMAX_API_KEY_MISSING',
        'MINIMAX_API_KEY not configured',
        false,
      );
    }
    const url = `${this.baseUrl}${pathname}`;
    let response: Response;
    let text: string;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
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
    if (!response.ok) {
      // 优先解析 base_resp.status_code，确定性失败（如 1008 余额不足）
      // 不应被无脑标 retriable=true 触发指数退避重试。
      const providerCode = tryExtractProviderCode(text);
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
