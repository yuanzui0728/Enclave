import { HttpStatus, Logger } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';

// i18n-ignore-start: provider adapter — error/log strings only.

const MINIMAX_HOST_REGEX = /(api\.minimaxi\.com|api\.minimax\.chat)/i;
// 走查 yuanzui0728 本次 R2：原版 fetch 完全没有 timeout。Node fetch 默认
// 无 timeout，MiniMax 上游网络 hang / cloudflare 中转停滞时整个 postJson
// 永远等下去 —— 而 ai-orchestrator 的 fallback 链根本无法 fallback 到
// OpenAI，因为还卡在 MiniMax attempt 的 fetch 里。新 MinimaxClient（不
// 是这个 Native 类）已经用 fetchWithTimeout(30s) 兜底；Native 这边漏了。
// 给同样的 30s timeout（TTS / image 一般 ≤20s 完成，30s 是 MinimaxClient
// 同款值）。
const NATIVE_REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  // 走查 yuanzui0728 本次 R1：刻意不 clearTimeout（同 MinimaxClient line 48-51
  // 注释解释）—— fetch 在 headers 到时就 resolve，body 流读 (response.text /
  // arrayBuffer) 还可能再卡几十秒；让 timer 自然到期触发 abort，body 读取也会
  // 抛 AbortError，否则 fetchWithTimeout 返回后 body 读取就裸跑无超时保护。
  // 但加 .unref() 让这个 timer 不阻塞 event loop —— SIGTERM 时 Node 不再等
  // 最后一批 30s timer 烧完才退出。process 真的还活着时 timer 该 firing 还是
  // firing（保护 body 流），但 pm2 reload / cloud-api 重启没有"挂 30s"的代价。
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return fetch(url, { ...init, signal: controller.signal });
}

type MinimaxBaseResp = {
  status_code: number;
  status_msg?: string;
};

type MinimaxImageResponse = {
  data?: { image_urls?: string[] };
  base_resp?: MinimaxBaseResp;
};

type MinimaxTtsResponse = {
  data?: { audio?: string };
  base_resp?: MinimaxBaseResp;
};

export type MinimaxImageInput = {
  model: string;
  prompt: string;
  aspectRatio?: string;
  size?: string;
};

export type MinimaxImageResult = {
  buffer: Buffer;
  mimeType: string;
};

export type MinimaxTtsInput = {
  model: string;
  text: string;
  voiceId: string;
  speed?: number;
  vol?: number;
  pitch?: number;
};

export type MinimaxTtsResult = {
  buffer: Buffer;
  mimeType: 'audio/mpeg';
};

export type MinimaxVoiceCloneUploadInput = {
  buffer: Buffer;
  mime: string;
  fileName: string;
  groupId: string;
};

export type MinimaxVoiceCloneInput = {
  fileId: string;
  voiceId: string;
  groupId: string;
};

export class MinimaxNativeClient {
  private readonly logger = new Logger(MinimaxNativeClient.name);
  private readonly baseUrl: string;

  constructor(endpoint: string, private readonly apiKey: string) {
    this.baseUrl = endpoint.replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new AppError('MINIMAX_API_KEY_MISSING', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: 'MiniMax API Key 未配置。',
      });
    }
  }

  static isMinimaxEndpoint(endpoint?: string | null): boolean {
    if (!endpoint) {
      return false;
    }
    return MINIMAX_HOST_REGEX.test(endpoint);
  }

  async generateImage(input: MinimaxImageInput): Promise<MinimaxImageResult> {
    const aspect = this.normalizeAspectRatio(input.aspectRatio ?? input.size);
    const body = {
      model: input.model,
      prompt: input.prompt,
      aspect_ratio: aspect,
      n: 1,
      response_format: 'url',
      prompt_optimizer: false,
    };

    const response = await this.postJson<MinimaxImageResponse>(
      '/image_generation',
      body,
    );
    this.assertSuccess(response.base_resp, 'image generation');

    const url = response.data?.image_urls?.[0];
    if (!url) {
      throw new AppError('AI_IMAGE_EMPTY', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '图片生成结果为空，请稍后再试。',
      });
    }

    const fetchRes = await fetch(url);
    if (!fetchRes.ok) {
      throw new AppError('AI_IMAGE_DOWNLOAD_FAILED', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '图片下载失败，请稍后再试。',
      });
    }
    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      throw new AppError('AI_IMAGE_EMPTY', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '图片生成结果为空，请稍后再试。',
      });
    }

    const mimeType =
      fetchRes.headers.get('content-type') || this.guessMimeFromUrl(url);
    return { buffer, mimeType };
  }

  async synthesizeSpeech(input: MinimaxTtsInput): Promise<MinimaxTtsResult> {
    const body = {
      model: input.model,
      text: input.text,
      stream: false,
      voice_setting: {
        voice_id: input.voiceId,
        speed: input.speed ?? 1.0,
        vol: input.vol ?? 1.0,
        pitch: input.pitch ?? 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    };

    const response = await this.postJson<MinimaxTtsResponse>('/t2a_v2', body);
    this.assertSuccess(response.base_resp, 'speech synthesis');

    const hex = response.data?.audio?.trim();
    if (!hex) {
      throw new AppError('AI_TTS_EMPTY', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '语音生成结果为空，请稍后再试。',
      });
    }

    const buffer = Buffer.from(hex, 'hex');
    if (!buffer.length) {
      throw new AppError('AI_TTS_EMPTY', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '语音生成结果为空，请稍后再试。',
      });
    }

    return { buffer, mimeType: 'audio/mpeg' };
  }

  // 声音克隆第 1 步：上传样本音频到 MiniMax files（purpose=voice_clone）。
  // ⚠️ files/upload + voice_clone 是 MiniMax 标准平台能力，需 GroupId + 克隆可用的 key；
  // 当前「coding/token plan」key 可能不支持，调用失败会抛 AppError 由上层降级。
  async uploadVoiceCloneSample(
    input: MinimaxVoiceCloneUploadInput,
  ): Promise<{ fileId: string }> {
    const form = new FormData();
    form.append('purpose', 'voice_clone');
    form.append(
      'file',
      new Blob([new Uint8Array(input.buffer)], { type: input.mime }),
      input.fileName,
    );
    const response = await this.postMultipart<{
      file?: { file_id?: number | string };
      base_resp?: MinimaxBaseResp;
    }>(`/files/upload?GroupId=${encodeURIComponent(input.groupId)}`, form);
    this.assertSuccess(response.base_resp, 'voice clone upload');
    const fileId = response.file?.file_id;
    if (fileId === undefined || fileId === null || `${fileId}` === '') {
      throw new AppError('AI_VOICE_CLONE_UPLOAD_EMPTY', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: '声音样本上传失败，请稍后再试。',
      });
    }
    return { fileId: `${fileId}` };
  }

  // 声音克隆第 2 步：用上传的 file_id + 自定义 voice_id 触发克隆。
  // voice_id 须字母开头、字母数字、≥8 位（MiniMax 约束）。成功后该 voice_id 即可
  // 当作 t2a_v2 的 voice_setting.voice_id 使用。
  async cloneVoice(input: MinimaxVoiceCloneInput): Promise<void> {
    const response = await this.postJson<{ base_resp?: MinimaxBaseResp }>(
      `/voice_clone?GroupId=${encodeURIComponent(input.groupId)}`,
      { file_id: input.fileId, voice_id: input.voiceId },
    );
    this.assertSuccess(response.base_resp, 'voice clone');
  }

  private async postMultipart<T>(path: string, form: FormData): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    let text: string;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          // 故意不设 Content-Type：fetch 会按 FormData 自动加 multipart boundary。
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body: form,
        },
        NATIVE_REQUEST_TIMEOUT_MS,
      );
      text = await response.text();
    } catch (error) {
      const err = error as Error & { name?: string };
      const isTimeout = err?.name === 'AbortError';
      this.logger.error('minimax multipart network failure', {
        url,
        error: err?.message,
        timeout: isTimeout,
      });
      throw new AppError(
        isTimeout ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE',
        {
          status: HttpStatus.BAD_GATEWAY,
          legacyMessage: isTimeout
            ? `MiniMax 接口 ${NATIVE_REQUEST_TIMEOUT_MS}ms 超时，请稍后再试。`
            : 'MiniMax 网关暂不可达，请稍后再试。',
        },
      );
    }
    if (!response.ok) {
      this.logger.warn('minimax multipart http error', {
        url,
        status: response.status,
        bodyPreview: text.slice(0, 500),
      });
      throw new AppError('AI_PROVIDER_HTTP_ERROR', {
        status:
          response.status >= 500 ? HttpStatus.BAD_GATEWAY : response.status,
        legacyMessage: `MiniMax 接口返回 ${response.status}。`,
      });
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AppError('AI_PROVIDER_INVALID_RESPONSE', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: 'MiniMax 返回数据格式异常。',
      });
    }
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    let text: string;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        NATIVE_REQUEST_TIMEOUT_MS,
      );
      // 走查 yuanzui0728 本次 R1：原版 await response.text() 在 try/catch 外。
      // fetch 在收到 headers 就 resolve；body 是流式读取，TTS HD 的 hex
      // 音频响应 ~MB 级，body 流可能再卡几十秒。timer 到期触发 abort 时
      // response.text() 也会抛 AbortError，但因为在 try 外，AbortError 直接
      // 漏成裸 Error 而非 AppError('AI_PROVIDER_TIMEOUT')，orchestrator 的
      // isTransientSpeechFailure 既识不出 'AbortError' 关键词也匹配不到
      // legacyMessage，fallback 链 / retry 都走不到。MinimaxClient（非 Native
      // 这条）已经把 body 读取放在 try 里了，Native 这边漏了。
      text = await response.text();
    } catch (error) {
      const err = error as Error & { name?: string };
      const isTimeout = err?.name === 'AbortError';
      this.logger.error('minimax network failure', {
        url,
        error: err?.message,
        timeout: isTimeout,
      });
      throw new AppError(
        isTimeout ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE',
        {
          status: HttpStatus.BAD_GATEWAY,
          legacyMessage: isTimeout
            ? `MiniMax 接口 ${NATIVE_REQUEST_TIMEOUT_MS}ms 超时，请稍后再试。`
            : 'MiniMax 网关暂不可达，请稍后再试。',
        },
      );
    }

    if (!response.ok) {
      this.logger.warn('minimax http error', {
        url,
        status: response.status,
        bodyPreview: text.slice(0, 500),
      });
      throw new AppError('AI_PROVIDER_HTTP_ERROR', {
        status:
          response.status >= 500 ? HttpStatus.BAD_GATEWAY : response.status,
        legacyMessage: `MiniMax 接口返回 ${response.status}。`,
      });
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      this.logger.warn('minimax non-json response', {
        url,
        bodyPreview: text.slice(0, 500),
      });
      throw new AppError('AI_PROVIDER_INVALID_RESPONSE', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: 'MiniMax 返回数据格式异常。',
      });
    }
  }

  private assertSuccess(resp: MinimaxBaseResp | undefined, context: string) {
    if (!resp) {
      return;
    }
    if (resp.status_code === 0) {
      return;
    }
    const msg = resp.status_msg ?? `code=${resp.status_code}`;
    this.logger.warn(`minimax ${context} failed`, {
      status_code: resp.status_code,
      status_msg: resp.status_msg,
    });
    if (resp.status_code === 2061) {
      throw new AppError('AI_MODEL_NOT_IN_TOKEN_PLAN', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: `当前 Token Plan 不支持该模型：${msg}`,
      });
    }
    if (resp.status_code === 2056) {
      // Token Plan 整体当日额度耗尽（lyrics / chat / music / tts 共享同一池子）
      throw new AppError('MINIMAX_TOKEN_PLAN_EXHAUSTED', {
        status: HttpStatus.TOO_MANY_REQUESTS,
        legacyMessage: `MiniMax Token Plan 当日额度已用完：${msg}`,
      });
    }
    if (resp.status_code === 2013) {
      throw new AppError('AI_REQUEST_INVALID_PARAMS', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: `MiniMax 参数错误：${msg}`,
      });
    }
    throw new AppError('AI_PROVIDER_FAILED', {
      status: HttpStatus.BAD_GATEWAY,
      legacyMessage: `MiniMax 调用失败：${msg}`,
    });
  }

  private normalizeAspectRatio(value?: string): string {
    if (!value) {
      return '1:1';
    }
    const trimmed = value.trim();
    if (/^\d+:\d+$/.test(trimmed)) {
      return trimmed;
    }
    const m = trimmed.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (m) {
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (w > 0 && h > 0) {
        const g = this.gcd(w, h);
        return `${w / g}:${h / g}`;
      }
    }
    return '1:1';
  }

  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b);
  }

  private guessMimeFromUrl(url: string): string {
    if (/\.(jpe?g)(\?|$)/i.test(url)) {
      return 'image/jpeg';
    }
    if (/\.webp(\?|$)/i.test(url)) {
      return 'image/webp';
    }
    return 'image/png';
  }
}
// i18n-ignore-end
