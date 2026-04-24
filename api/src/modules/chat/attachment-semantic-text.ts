import { resolveGeneratedAttachmentHistoryText } from './assistant-attachment-history';
import type { GroupMessage, Message, MessageAttachment } from './chat.types';

const DEFAULT_MESSAGE_PREVIEW_CHARS = 180;
const DEFAULT_ATTACHMENT_DETAIL_CHARS = 200;

type SearchableThreadMessage = Pick<Message | GroupMessage, 'text' | 'attachment' | 'type'>;

export function resolveMessageSemanticPreview(
  message: SearchableThreadMessage,
  options?: {
    maxChars?: number;
  },
) {
  const normalizedText = message.text.trim();
  if (normalizedText) {
    return normalizedText;
  }

  const semanticText = resolveAttachmentSemanticText(message.attachment, {
    maxChars: options?.maxChars ?? DEFAULT_MESSAGE_PREVIEW_CHARS,
  });
  if (semanticText) {
    return semanticText;
  }

  return buildAttachmentFallbackLabel(message.attachment);
}

export function resolveAttachmentSearchableText(attachment?: MessageAttachment) {
  if (!attachment) {
    return '';
  }

  const parts: string[] = [];
  const generatedHistoryText = resolveGeneratedAttachmentHistoryText(attachment);
  if (generatedHistoryText) {
    parts.push(generatedHistoryText);
  }

  if (attachment.kind === 'image') {
    if (attachment.generatedContext?.imagePrompt?.trim()) {
      parts.push(attachment.generatedContext.imagePrompt.trim());
    }
  } else if (attachment.kind === 'file') {
    if (attachment.transcriptText?.trim()) {
      parts.push(attachment.transcriptText.trim());
    }
    if (attachment.extractedText?.trim()) {
      parts.push(attachment.extractedText.trim());
    }
    if (attachment.documentInsight?.previewText?.trim()) {
      parts.push(attachment.documentInsight.previewText.trim());
    }
  } else if (attachment.kind === 'voice') {
    if (attachment.transcriptText?.trim()) {
      parts.push(attachment.transcriptText.trim());
    }
  } else if (attachment.kind === 'contact_card') {
    parts.push(attachment.name, attachment.relationship ?? '', attachment.bio ?? '');
  } else if (attachment.kind === 'location_card') {
    parts.push(attachment.title, attachment.subtitle ?? '');
  } else if (attachment.kind === 'note_card') {
    parts.push(
      attachment.title,
      attachment.excerpt,
      attachment.tags.join(' '),
    );
  } else if (attachment.kind === 'sticker') {
    parts.push(attachment.label ?? '', attachment.stickerId);
  }

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
}

export function describeAttachmentForDisplay(
  attachment?: MessageAttachment,
  options?: {
    maxChars?: number;
  },
) {
  if (!attachment) {
    return '无';
  }

  const fallbackLabel = buildAttachmentFallbackLabel(attachment);
  const semanticText = resolveAttachmentSemanticText(attachment, {
    maxChars: options?.maxChars ?? DEFAULT_ATTACHMENT_DETAIL_CHARS,
  });
  if (!semanticText) {
    return fallbackLabel;
  }

  if (semanticText === fallbackLabel) {
    return semanticText;
  }

  return `${fallbackLabel} · ${semanticText}`;
}

export function resolveAttachmentSemanticText(
  attachment?: MessageAttachment,
  options?: {
    maxChars?: number;
  },
) {
  if (!attachment) {
    return '';
  }

  const maxChars = Math.max(40, options?.maxChars ?? DEFAULT_MESSAGE_PREVIEW_CHARS);
  const generatedHistoryText = resolveGeneratedAttachmentHistoryText(attachment);
  if (generatedHistoryText) {
    return truncateSemanticText(generatedHistoryText, maxChars);
  }

  if (attachment.kind === 'image') {
    const imagePrompt = attachment.generatedContext?.imagePrompt?.trim();
    return imagePrompt ? truncateSemanticText(imagePrompt, maxChars) : '';
  }

  if (attachment.kind === 'file') {
    if (attachment.transcriptText?.trim()) {
      return truncateSemanticText(attachment.transcriptText.trim(), maxChars);
    }

    const documentText =
      attachment.documentInsight?.previewText?.trim() ||
      attachment.extractedText?.trim() ||
      '';
    return documentText ? truncateSemanticText(documentText, maxChars) : '';
  }

  if (attachment.kind === 'voice') {
    return attachment.transcriptText?.trim()
      ? truncateSemanticText(attachment.transcriptText.trim(), maxChars)
      : '';
  }

  if (attachment.kind === 'contact_card') {
    return truncateSemanticText(
      [
        attachment.name,
        attachment.relationship ? `关系：${attachment.relationship}` : '',
        attachment.bio ? `简介：${attachment.bio}` : '',
      ]
        .filter(Boolean)
        .join('，'),
      maxChars,
    );
  }

  if (attachment.kind === 'location_card') {
    return truncateSemanticText(
      [attachment.title, attachment.subtitle ?? ''].filter(Boolean).join('，'),
      maxChars,
    );
  }

  if (attachment.kind === 'note_card') {
    return truncateSemanticText(
      [attachment.title, attachment.excerpt].filter(Boolean).join('，'),
      maxChars,
    );
  }

  return truncateSemanticText(attachment.label ?? attachment.stickerId, maxChars);
}

function buildAttachmentFallbackLabel(attachment?: MessageAttachment) {
  if (!attachment) {
    return '';
  }

  if (attachment.kind === 'image') {
    return attachment.fileName ? `图片 · ${attachment.fileName}` : '图片';
  }

  if (attachment.kind === 'file') {
    const hasDocumentText = Boolean(
      attachment.extractedText?.trim() || attachment.documentInsight?.previewText?.trim(),
    );
    if (hasDocumentText) {
      return attachment.fileName ? `文档 · ${attachment.fileName}` : '文档';
    }

    return attachment.fileName ? `文件 · ${attachment.fileName}` : '文件';
  }

  if (attachment.kind === 'voice') {
    return attachment.fileName ? `语音 · ${attachment.fileName}` : '语音';
  }

  if (attachment.kind === 'contact_card') {
    return attachment.name ? `名片 · ${attachment.name}` : '名片';
  }

  if (attachment.kind === 'location_card') {
    return attachment.title ? `位置 · ${attachment.title}` : '位置';
  }

  if (attachment.kind === 'note_card') {
    return attachment.title ? `笔记 · ${attachment.title}` : '笔记';
  }

  return attachment.label ? `表情 · ${attachment.label}` : '表情';
}

function truncateSemanticText(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars).trim()}…`;
}
