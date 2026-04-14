import path from 'node:path';

export function sanitizeMomentMediaFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function guessMomentMediaExtension(mimeType: string) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return '.jpg';
  }

  if (mimeType === 'image/png') {
    return '.png';
  }

  if (mimeType === 'image/webp') {
    return '.webp';
  }

  if (mimeType === 'image/gif') {
    return '.gif';
  }

  if (mimeType === 'image/heic') {
    return '.heic';
  }

  if (mimeType === 'image/heif') {
    return '.heif';
  }

  if (mimeType === 'video/mp4') {
    return '.mp4';
  }

  if (mimeType === 'video/quicktime') {
    return '.mov';
  }

  if (mimeType === 'video/webm') {
    return '.webm';
  }

  return '.bin';
}

export function normalizeMomentMediaDisplayName(
  originalName: string | undefined,
  fallbackBaseName: string,
  mimeType: string,
) {
  const rawName = (originalName ?? '').trim();
  const baseName = rawName ? path.basename(rawName) : fallbackBaseName;
  const extension =
    path.extname(baseName) || guessMomentMediaExtension(mimeType);
  const nameWithoutExtension =
    path.basename(baseName, extension).trim() || fallbackBaseName;

  return `${nameWithoutExtension}${extension}`;
}

export function normalizeOptionalPositiveNumber(value?: number) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value);
}
