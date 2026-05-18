import { HttpStatus, Logger } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';

// i18n-ignore-start: provider adapter — error/log strings only.

const MINIMAX_HOST_REGEX = /(api\.minimaxi\.com|api\.minimax\.chat)/i;

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

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error('minimax network failure', {
        url,
        error: (error as Error)?.message,
      });
      throw new AppError('AI_PROVIDER_UNAVAILABLE', {
        status: HttpStatus.BAD_GATEWAY,
        legacyMessage: 'MiniMax 网关暂不可达，请稍后再试。',
      });
    }

    const text = await response.text();
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
