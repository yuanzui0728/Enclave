import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { resolveDataPath } from '../../../database/database-path';

export type UploadedWikiAvatarFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

export type WikiAvatarUploadResult = {
  url: string;
  fileName: string;
  mimeType: string;
};

// 头像图片单文件上限 4 MB —— 写真级别足够，避免 wiki child 内存被恶意大文件打爆。
export const WIKI_AVATAR_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

// 显式 allow-list，禁掉 image/svg+xml —— SVG 里可以塞 <script>，直接访问头像 URL
// 会在 wiki 同源里执行 JS → 偷 localStorage 里的 JWT。同理也禁掉 avif/heic 这类
// 不会主动出现在用户截图里、但可能藏 EXIF 解析漏洞的格式。
const ALLOWED_AVATAR_MIME = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

@Injectable()
export class WikiAvatarService {
  async saveUploadedAvatar(
    file: UploadedWikiAvatarFile,
  ): Promise<WikiAvatarUploadResult> {
    // 用 mimetype（multer 从 Content-Type 拿）查白名单。扩展名一律不信，避免
    // "evil.svg" 配 image/png mimetype 通过校验后还是按 .svg 落盘 → 静态服务
    // 又把它当 image/svg+xml 吐回去 → XSS。
    const safeExtension = ALLOWED_AVATAR_MIME.get(file.mimetype.toLowerCase());
    if (!safeExtension) {
      throw new AppError('WIKI_AVATAR_IMAGE_ONLY', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '头像只支持 PNG / JPG / WebP / GIF。',
      });
    }

    const originalName = sanitizeFileName(file.originalname ?? 'avatar');
    // basename 时把所有 . 之前都剥掉，避免 "foo.bar.html" 这种 baseName 带 ext。
    const baseName =
      sanitizeFileName(path.basename(originalName).replace(/\..*$/, '')) ||
      'avatar';
    const storedFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${baseName}${safeExtension}`;
    const storageDir = this.resolveStorageDir();

    await mkdir(storageDir, { recursive: true });
    await writeFile(path.join(storageDir, storedFileName), file.buffer);

    return {
      url: `/api/wiki/avatars/${storedFileName}`,
      fileName: storedFileName,
      mimeType: file.mimetype,
    };
  }

  resolveReadablePath(fileName: string) {
    const normalized = this.normalizeFileName(fileName);
    const candidate = path.join(this.resolveStorageDir(), normalized);
    if (!existsSync(candidate)) {
      throw new AppError('WIKI_AVATAR_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '头像文件不存在',
      });
    }
    return candidate;
  }

  normalizeFileName(fileName: string) {
    const normalized = path.basename(fileName).trim();
    // path.basename('..') 还是 '..'，path.basename('.') 还是 '.'。这两个值
    // join 进 storageDir 会指到目录本身或父级——express sendFile 对目录会报错，
    // 但我们仍然显式拒掉，免得 5xx 日志被噪声塞满。同时挡 NUL 字节。
    if (
      !normalized ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.includes('\0')
    ) {
      throw new AppError('WIKI_AVATAR_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '头像文件不存在',
      });
    }
    return normalized;
  }

  private resolveStorageDir() {
    return resolveDataPath('wiki-avatars');
  }
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
