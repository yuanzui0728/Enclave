// i18n-ignore-start: provider adapter — log strings only.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  resolvePrimaryMomentMediaStorageDir,
  resolveReadableMomentMediaPath,
} from '../moments/moment-media.storage';

const execFileAsync = promisify(execFile);

export interface PersistedAsset {
  fileName: string;
  publicUrl: string;
  size: number;
  mimeType: string;
}

@Injectable()
export class MinimaxAssetStorage {
  private readonly logger = new Logger(MinimaxAssetStorage.name);
  private readonly serverBaseUrl: string;

  constructor(config: ConfigService) {
    // 仅服务端内部 fetch (e.g. 视频转录) 用得到，客户端用相对路径不会读它。
    this.serverBaseUrl = (
      config.get<string>('PUBLIC_API_BASE_URL') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  async persist(input: {
    buffer: Buffer;
    mimeType: string;
    kind: 'video' | 'music' | 'image';
    suffix?: string;
  }): Promise<PersistedAsset> {
    const dir = resolvePrimaryMomentMediaStorageDir();
    await mkdir(dir, { recursive: true });
    const ext = pickExtension(input.mimeType, input.kind);
    const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-minimax-${input.kind}${input.suffix ?? ''}.${ext}`;
    const target = path.join(dir, fileName);
    await writeFile(target, input.buffer);
    // 关键：返回相对路径而非绝对 URL。客户端基于自己 origin 拼接（公网/局域网/原生壳都通用），
    // 服务端如果要 fetch（如转录）再用 absolutize() 拼上 PUBLIC_API_BASE_URL。
    // 之前写绝对 URL `http://localhost:3000/...` 导致从公网域名打开的浏览器把 mediaUrl 当成
    // 用户自己的 localhost，全部 404。
    return {
      fileName,
      publicUrl: `/api/moments/media/${fileName}`,
      size: input.buffer.length,
      mimeType: input.mimeType,
    };
  }

  absolutize(maybeRelative: string | null | undefined): string | null {
    if (!maybeRelative) return null;
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    if (maybeRelative.startsWith('/')) return `${this.serverBaseUrl}${maybeRelative}`;
    return `${this.serverBaseUrl}/${maybeRelative}`;
  }

  // 把已落地的视频文件和 BGM 音频文件混音成新的 mp4：
  // - 视频流不重编码（-c:v copy），仅替换音轨
  // - BGM 转 AAC，输出取最短（视频 6s，BGM 通常更长）
  // 成功 → 返回新落地的 PersistedAsset；失败 → 返回 null（调用方自行降级）。
  async mixVideoWithAudio(args: {
    videoFileName: string;
    audioFileName: string;
  }): Promise<PersistedAsset | null> {
    const videoPath = resolveReadableMomentMediaPath(args.videoFileName);
    const audioPath = resolveReadableMomentMediaPath(args.audioFileName);
    const dir = resolvePrimaryMomentMediaStorageDir();
    await mkdir(dir, { recursive: true });
    const outName = `${Date.now()}-${randomUUID().slice(0, 8)}-minimax-video-bgm.mp4`;
    const outPath = path.join(dir, outName);
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-i',
          videoPath,
          '-i',
          audioPath,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-shortest',
          outPath,
        ],
        { timeout: 60_000 },
      );
      const fileStat = await stat(outPath);
      this.logger.log(
        `mixed video ${args.videoFileName} + bgm ${args.audioFileName} -> ${outName} (${fileStat.size}B)`,
      );
      return {
        fileName: outName,
        publicUrl: `/api/moments/media/${outName}`,
        size: fileStat.size,
        mimeType: 'video/mp4',
      };
    } catch (err) {
      this.logger.warn(
        `mixVideoWithAudio failed (${args.videoFileName} + ${args.audioFileName}): ${(err as Error)?.message}`,
      );
      // 不要留半截输出文件
      try {
        await unlink(outPath);
      } catch {
        /* noop */
      }
      return null;
    }
  }

  // 容错删除：文件不存在或路径异常都静默通过；仅记日志，不抛异常。
  // 用于 markFailed 时回收磁盘，避免失败任务的中间产物永留。
  async unlinkIfExists(fileName: string | null | undefined): Promise<void> {
    if (!fileName) return;
    const target = resolveReadableMomentMediaPath(fileName);
    try {
      await unlink(target);
      this.logger.debug(`unlinked minimax asset ${fileName}`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        this.logger.warn(
          `unlink ${fileName} failed: ${(err as Error)?.message}`,
        );
      }
    }
  }
}

function pickExtension(mimeType: string, kind: 'video' | 'music' | 'image'): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mp4')) return 'mp4';
  if (lower.includes('webm')) return 'webm';
  if (lower.includes('mpeg') && kind === 'music') return 'mp3';
  if (lower.includes('audio/mp3')) return 'mp3';
  if (lower.includes('wav')) return 'wav';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (kind === 'video') return 'mp4';
  if (kind === 'music') return 'mp3';
  return 'bin';
}

// i18n-ignore-end
