import { randomUUID } from 'crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import {
  resolveApiPath,
  resolveOwnerDataPath,
} from '../../database/database-path';
import { isSharedWorldMode } from '../tenancy/tenant-context';

@Injectable()
export class AiSpeechAssetsService {
  async saveGeneratedSpeech(
    buffer: Buffer,
    options: {
      mimeType: string;
      fileExtension: string;
      baseName?: string;
    },
  ) {
    const storageDir = resolvePrimaryAiSpeechStorageDir();
    const safeBaseName = sanitizeSpeechAssetBaseName(options.baseName);
    const extension = normalizeSpeechExtension(options.fileExtension);
    const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeBaseName}.${extension}`;

    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, fileName), buffer);

    // 存相对 URL 而非快照 PUBLIC_API_BASE_URL：前端 chat-message-list / channels-page
      // 已经把 audioUrl 过 resolveAppMediaUrl absolutize（含公网 /cloud/world-api 反代 + token）。
      // 若再写绝对 URL，公网入口端口/协议变更后老缓存里的 URL 会 404。
    return {
      fileName,
      audioUrl: `/api/ai/speech/${fileName}`,
      mimeType: options.mimeType,
    };
  }

  getStorageDir() {
    return resolvePrimaryAiSpeechStorageDir();
  }

  resolveReadablePath(fileName: string) {
    return resolveReadableAiSpeechPath(this.normalizeFileName(fileName));
  }

  normalizeFileName(fileName: string) {
    const normalized = path.basename(fileName).trim();
    if (!normalized) {
      throw new AppError('AI_SPEECH_ASSET_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: 'Speech asset not found',
      });
    }

    return normalized;
  }
}

// ai-orchestrator 在喂历史音频给 LLM 时需要从 URL 反推磁盘路径走 base64
// data-URI（裸 URL 经 /cloud/world-api 反代是 token-gated，外部 LLM fetch 会
// 401）。和 chat-attachment-storage.ts:resolveReadableChatAttachmentPath
// 同样的 free function 形态，避免在 ai-orchestrator 里注入 AiSpeechAssetsService
// 引入模块内循环依赖。
export function resolvePrimaryAiSpeechStorageDir() {
  return resolveOwnerDataPath('ai-speech');
}

export function resolveLegacyAiSpeechStorageDir() {
  return resolveApiPath('storage', 'ai-speech');
}

export function resolveReadableAiSpeechPath(fileName: string) {
  // 共享模式只在当前 owner 子树找；绝不回退扁平 legacy（跨 owner）。
  const candidatePaths = isSharedWorldMode()
    ? [path.join(resolvePrimaryAiSpeechStorageDir(), fileName)]
    : [
        path.join(resolvePrimaryAiSpeechStorageDir(), fileName),
        path.join(resolveLegacyAiSpeechStorageDir(), fileName),
      ];
  return (
    candidatePaths.find((candidatePath) => existsSync(candidatePath)) ??
    candidatePaths[0]
  );
}

function sanitizeSpeechAssetBaseName(value?: string) {
  const normalized = (value ?? 'speech')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'speech';
}

function normalizeSpeechExtension(value: string) {
  const normalized = value.trim().replace(/^\./, '').toLowerCase();
  return normalized || 'mp3';
}
