import { resolveGeneratedAttachmentHistoryText } from './assistant-attachment-history';
import type { GroupMessage, Message, MessageAttachment } from './chat.types';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
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
  } else if (attachment.kind === 'feed_post_card') {
    parts.push(
      attachment.title ?? '',
      attachment.excerpt,
      attachment.authorName,
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

  // 走查 R1：location_card / contact_card / note_card / feed_post_card 的
  // semanticText 都以 attachment 的 primary identifier（title / name）开头，
  // 而 fallbackLabel 又是 `${kind} · ${primary}`，直接拼会重复一次。
  // 例：`位置 · 公园` + ` · ` + `公园，树荫…` → `位置 · 公园 · 公园，树荫…`。
  // 把 semanticText 里的 primary 前缀剥掉，得到 `位置 · 公园 · 树荫…`。
  const detail = stripSemanticPrimaryPrefix(semanticText, attachment);
  if (!detail) {
    return fallbackLabel;
  }
  return `${fallbackLabel} · ${detail}`;
}

function stripSemanticPrimaryPrefix(
  semanticText: string,
  attachment: MessageAttachment,
): string {
  const primary = getAttachmentPrimaryIdentifier(attachment);
  if (!primary) {
    return semanticText;
  }
  if (semanticText === primary) {
    return '';
  }
  const prefix = `${primary}，`;
  if (semanticText.startsWith(prefix)) {
    return semanticText.slice(prefix.length);
  }
  return semanticText;
}

function getAttachmentPrimaryIdentifier(
  attachment: MessageAttachment,
): string {
  if (attachment.kind === 'contact_card') {
    return attachment.name;
  }
  if (
    attachment.kind === 'location_card' ||
    attachment.kind === 'note_card'
  ) {
    return attachment.title;
  }
  // feed_post_card 的 fallback 用 `title || authorName`，而 semanticText 起
  // 头是 `${authorName} 的视频号`——并非严格前缀重复，先不夹这个 kind。
  return '';
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

  if (attachment.kind === 'feed_post_card') {
    return truncateSemanticText(
      [
        `${attachment.authorName} 的视频号`,
        attachment.title ?? '',
        attachment.excerpt,
      ]
        .filter(Boolean)
        .join('，'),
      maxChars,
    );
  }

  if (attachment.kind === 'call_log') {
    return '';
  }

  // 走查 2026-05-18 移动端单聊 R9 server-side 镜像：和 client
  // apps/app/src/lib/message-attachment-semantic.ts 同款 ?? vs || 漏防 —— sticker.label
  // 是 `string | undefined`，老 wiki import / 旧 reminder 卡 / 用户自定义贴纸都见过
  // label === '' 落库；?? 不防空串导致 server 端 message-search.utils
  // / chat-records-admin 吐回客户端 / admin 控制台的 previewText 漏白。改 || 让空
  // 串也命中 stickerId fallback（stickerId 必填非空 string）。client / server 这条
  // 函数本来就要求一起改（见 client 文件 stripSemanticPrimaryPrefix 上方注释）。
  return truncateSemanticText(
    attachment.label || attachment.stickerId,
    maxChars,
  );
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

  if (attachment.kind === 'feed_post_card') {
    const label = attachment.title?.trim() || attachment.authorName;
    return label ? `视频号 · ${label}` : '视频号';
  }

  if (attachment.kind === 'call_log') {
    const modeLabel = attachment.mode === 'video' ? '视频通话' : '语音通话';
    const minutes = Math.floor(attachment.durationSec / 60);
    const seconds = attachment.durationSec % 60;
    const duration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (attachment.endedReason === 'timeout') {
      return `${modeLabel} · 已超时 ${duration}`;
    }
    if (attachment.endedReason === 'error') {
      return `${modeLabel} · 连接异常`;
    }
    return `${modeLabel} · 通话时长 ${duration}`;
  }

  // 走查 R14：和 client apps/app/src/lib/message-attachment-semantic.ts:313-317
  // 同款 sticker label/stickerId fallback —— 客户端 R9 (commit 154b556fe) 已经
  // 改过 `|| stickerId` 让空串也命中 fallback。server 端这条 buildAttachmentFallbackLabel
  // 是 server-side 全局 message-search / chat-records-admin 的 fallback 路径，
  // 之前只在 attachment.label 非空时给 `表情 · ${label}`，空串/缺失时返回
  // 裸 '表情'，client 走 `||` 兜底拿到 stickerId 拼成 '表情 · {stickerId}'。
  // 用户在 /tabs/search 全局搜索能看到 server 预览，client 在 chat-list /
  // forward dialog 用本地预览，两边对同一条空 label 自定义贴纸的预览不一致。
  // stickerId 是必填非空 string，永远有兜底；改成同款 `||` 让空串也命中。
  const stickerDetail = attachment.label || attachment.stickerId;
  return stickerDetail ? `表情 · ${stickerDetail}` : '表情';
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
// i18n-ignore-end
