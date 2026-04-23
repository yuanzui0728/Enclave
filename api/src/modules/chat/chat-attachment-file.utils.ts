import path from 'node:path';

export function sanitizeChatAttachmentFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function guessChatAttachmentExtension(mimeType: string) {
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

  if (mimeType === 'application/pdf') {
    return '.pdf';
  }

  if (mimeType === 'audio/webm' || mimeType === 'audio/webm;codecs=opus') {
    return '.webm';
  }

  if (mimeType === 'audio/ogg' || mimeType === 'audio/ogg;codecs=opus') {
    return '.ogg';
  }

  if (mimeType === 'audio/mp4') {
    return '.m4a';
  }

  if (mimeType === 'audio/mpeg') {
    return '.mp3';
  }

  if (mimeType === 'audio/wav') {
    return '.wav';
  }

  if (mimeType === 'text/plain') {
    return '.txt';
  }

  if (mimeType === 'application/zip') {
    return '.zip';
  }

  return '.bin';
}

export function normalizeChatAttachmentDisplayName(
  originalName: string | undefined,
  fallbackBaseName: string,
  mimeType: string,
) {
  const rawName = (originalName ?? '').trim();
  const baseName = rawName ? path.basename(rawName) : fallbackBaseName;
  const extension =
    path.extname(baseName) || guessChatAttachmentExtension(mimeType);
  const nameWithoutExtension =
    path.basename(baseName, extension).trim() || fallbackBaseName;

  return `${nameWithoutExtension}${extension}`;
}

export function resolveChatPublicApiBaseUrl() {
  return (
    process.env.PUBLIC_API_BASE_URL?.trim() ||
    `http://localhost:${process.env.PORT ?? 3000}`
  ).replace(/\/+$/, '');
}
