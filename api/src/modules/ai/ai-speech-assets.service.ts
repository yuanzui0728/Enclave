import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';

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
    const storageDir = this.resolveStorageDir();
    const safeBaseName = sanitizeSpeechAssetBaseName(options.baseName);
    const extension = normalizeSpeechExtension(options.fileExtension);
    const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeBaseName}.${extension}`;

    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, fileName), buffer);

    return {
      fileName,
      audioUrl: `${this.resolvePublicApiBaseUrl()}/api/ai/speech/${fileName}`,
      mimeType: options.mimeType,
    };
  }

  getStorageDir() {
    return this.resolveStorageDir();
  }

  normalizeFileName(fileName: string) {
    const normalized = path.basename(fileName).trim();
    if (!normalized) {
      throw new NotFoundException('Speech asset not found');
    }

    return normalized;
  }

  private resolveStorageDir() {
    const apiRoot = path.resolve(__dirname, '../../..');
    return path.join(apiRoot, 'storage', 'ai-speech');
  }

  private resolvePublicApiBaseUrl() {
    return (
      process.env.PUBLIC_API_BASE_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? '3000'}`
    );
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
