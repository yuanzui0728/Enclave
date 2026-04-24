import type { ImageAttachment, MessageAttachment } from './chat.types';

const MAX_GENERATED_IMAGE_HISTORY_PROMPT_CHARS = 180;

export function buildGeneratedImageHistoryText(imagePrompt: string) {
  const normalizedPrompt = normalizeHistoryPrompt(imagePrompt);
  if (!normalizedPrompt) {
    return '随后发来一张图片。';
  }

  return `随后发来一张图片，内容大致是：${normalizedPrompt}`;
}

export function resolveGeneratedAttachmentHistoryText(
  attachment?: MessageAttachment,
) {
  if (!attachment || attachment.kind !== 'image') {
    return '';
  }

  return attachment.generatedContext?.historyText?.trim() || '';
}

export function applyGeneratedImageContext(
  attachment: ImageAttachment,
  input: {
    sourceReplyArtifactJobId: string;
    sourceMessageId: string;
    imagePrompt: string;
  },
): ImageAttachment {
  return {
    ...attachment,
    generatedContext: {
      sourceReplyArtifactJobId: input.sourceReplyArtifactJobId,
      sourceMessageId: input.sourceMessageId,
      imagePrompt: normalizeHistoryPrompt(input.imagePrompt),
      historyText: buildGeneratedImageHistoryText(input.imagePrompt),
    },
  };
}

function normalizeHistoryPrompt(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= MAX_GENERATED_IMAGE_HISTORY_PROMPT_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_GENERATED_IMAGE_HISTORY_PROMPT_CHARS).trim()}…`;
}
