import { randomUUID } from 'crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import {
  resolveApiPath,
  resolveDataPath,
} from '../../database/database-path';

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
    const storageDir = this.resolvePrimaryStorageDir();
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
    return this.resolvePrimaryStorageDir();
  }

  resolveReadablePath(fileName: string) {
    const normalized = this.normalizeFileName(fileName);
    const candidates = [
      path.join(this.resolvePrimaryStorageDir(), normalized),
      path.join(this.resolveLegacyStorageDir(), normalized),
    ];
    return candidates.find((candidatePath) => existsSync(candidatePath)) ?? candidates[0];
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

  private resolvePrimaryStorageDir() {
    return resolveDataPath('ai-speech');
  }

  private resolveLegacyStorageDir() {
    return resolveApiPath('storage', 'ai-speech');
  }
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
