import { msg } from "@lingui/macro";
import type { GroupMessage, Message, MessageAttachment } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { sanitizeDisplayedChatText } from "./chat-text";

const t = translateRuntimeMessage;

const DEFAULT_MESSAGE_PREVIEW_CHARS = 180;
const DEFAULT_ATTACHMENT_DETAIL_CHARS = 200;

type SearchableChatMessage = Pick<Message | GroupMessage, "text" | "attachment">;

export function resolveMessageSemanticPreview(
  message: SearchableChatMessage,
  options?: {
    maxChars?: number;
    bracketedFallback?: boolean;
  },
) {
  const normalizedText = sanitizeDisplayedChatText(message.text).trim();
  if (normalizedText) {
    return normalizedText;
  }

  const semanticText = resolveAttachmentSemanticText(message.attachment, {
    maxChars: options?.maxChars ?? DEFAULT_MESSAGE_PREVIEW_CHARS,
  });
  if (semanticText) {
    return semanticText;
  }

  return buildAttachmentFallbackLabel(
    message.attachment,
    options?.bracketedFallback ?? false,
  );
}

export function resolveAttachmentSearchableText(attachment?: MessageAttachment) {
  if (!attachment) {
    return "";
  }

  const parts: string[] = [];
  const generatedHistoryText = resolveGeneratedAttachmentHistoryText(attachment);
  if (generatedHistoryText) {
    parts.push(generatedHistoryText);
  }

  if (attachment.kind === "image") {
    if (attachment.generatedContext?.imagePrompt?.trim()) {
      parts.push(attachment.generatedContext.imagePrompt.trim());
    }
  } else if (attachment.kind === "file") {
    if (attachment.transcriptText?.trim()) {
      parts.push(attachment.transcriptText.trim());
    }
    if (attachment.extractedText?.trim()) {
      parts.push(attachment.extractedText.trim());
    }
    if (attachment.documentInsight?.previewText?.trim()) {
      parts.push(attachment.documentInsight.previewText.trim());
    }
  } else if (attachment.kind === "voice") {
    if (attachment.transcriptText?.trim()) {
      parts.push(attachment.transcriptText.trim());
    }
  } else if (attachment.kind === "contact_card") {
    parts.push(attachment.name, attachment.relationship ?? "", attachment.bio ?? "");
  } else if (attachment.kind === "location_card") {
    parts.push(attachment.title, attachment.subtitle ?? "");
  } else if (attachment.kind === "note_card") {
    parts.push(attachment.title, attachment.excerpt, attachment.tags.join(" "));
  } else if (attachment.kind === "feed_post_card") {
    parts.push(
      attachment.authorName,
      attachment.title ?? "",
      attachment.excerpt,
    );
  } else if (attachment.kind === "sticker") {
    parts.push(attachment.label ?? "", attachment.stickerId);
  }

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

export function describeAttachmentForDisplay(
  attachment?: MessageAttachment,
  options?: {
    maxChars?: number;
    bracketedFallback?: boolean;
  },
) {
  if (!attachment) {
    return "";
  }

  const fallbackLabel = buildAttachmentFallbackLabel(
    attachment,
    options?.bracketedFallback ?? false,
  );
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
    return "";
  }

  const maxChars = Math.max(40, options?.maxChars ?? DEFAULT_MESSAGE_PREVIEW_CHARS);
  const generatedHistoryText = resolveGeneratedAttachmentHistoryText(attachment);
  if (generatedHistoryText) {
    return truncateSemanticText(generatedHistoryText, maxChars);
  }

  if (attachment.kind === "image") {
    const imagePrompt = attachment.generatedContext?.imagePrompt?.trim();
    return imagePrompt ? truncateSemanticText(imagePrompt, maxChars) : "";
  }

  if (attachment.kind === "file") {
    if (attachment.transcriptText?.trim()) {
      return truncateSemanticText(attachment.transcriptText.trim(), maxChars);
    }

    const documentText =
      attachment.documentInsight?.previewText?.trim() ||
      attachment.extractedText?.trim() ||
      "";
    return documentText ? truncateSemanticText(documentText, maxChars) : "";
  }

  if (attachment.kind === "voice") {
    return attachment.transcriptText?.trim()
      ? truncateSemanticText(attachment.transcriptText.trim(), maxChars)
      : "";
  }

  if (attachment.kind === "contact_card") {
    return truncateSemanticText(
      [
        attachment.name,
        attachment.relationship
          ? t(msg`关系：${attachment.relationship}`)
          : "",
        attachment.bio ? t(msg`简介：${attachment.bio}`) : "",
      ]
        .filter(Boolean)
        .join(t(msg`，`)),
      maxChars,
    );
  }

  if (attachment.kind === "location_card") {
    return truncateSemanticText(
      [attachment.title, attachment.subtitle ?? ""].filter(Boolean).join(t(msg`，`)),
      maxChars,
    );
  }

  if (attachment.kind === "note_card") {
    return truncateSemanticText(
      [attachment.title, attachment.excerpt].filter(Boolean).join(t(msg`，`)),
      maxChars,
    );
  }

  if (attachment.kind === "feed_post_card") {
    return truncateSemanticText(
      [
        t(msg`${attachment.authorName} 的视频号`),
        attachment.title ?? "",
        attachment.excerpt,
      ]
        .filter(Boolean)
        .join(t(msg`，`)),
      maxChars,
    );
  }

  return truncateSemanticText(attachment.label ?? attachment.stickerId, maxChars);
}

function resolveGeneratedAttachmentHistoryText(attachment?: MessageAttachment) {
  if (attachment?.kind !== "image") {
    return "";
  }

  return attachment.generatedContext?.historyText?.trim() || "";
}

function buildAttachmentFallbackLabel(
  attachment?: MessageAttachment,
  bracketed = false,
) {
  if (!attachment) {
    return "";
  }

  if (attachment.kind === "image") {
    return buildNamedFallbackLabel(t(msg`图片`), attachment.fileName, bracketed);
  }

  if (attachment.kind === "file") {
    const hasDocumentText = Boolean(
      attachment.extractedText?.trim() || attachment.documentInsight?.previewText?.trim(),
    );
    return buildNamedFallbackLabel(
      hasDocumentText ? t(msg`文档`) : t(msg`文件`),
      attachment.fileName,
      bracketed,
    );
  }

  if (attachment.kind === "voice") {
    return buildNamedFallbackLabel(t(msg`语音`), attachment.fileName, bracketed);
  }

  if (attachment.kind === "contact_card") {
    return buildNamedFallbackLabel(t(msg`名片`), attachment.name, bracketed);
  }

  if (attachment.kind === "location_card") {
    return buildNamedFallbackLabel(t(msg`位置`), attachment.title, bracketed);
  }

  if (attachment.kind === "note_card") {
    return buildNamedFallbackLabel(t(msg`笔记`), attachment.title, bracketed);
  }

  if (attachment.kind === "feed_post_card") {
    const detail = attachment.title?.trim() || attachment.authorName;
    return buildNamedFallbackLabel(t(msg`视频号`), detail, bracketed);
  }

  return buildNamedFallbackLabel(
    t(msg`表情`),
    attachment.label ?? attachment.stickerId,
    bracketed,
  );
}

function buildNamedFallbackLabel(label: string, detail?: string, bracketed = false) {
  const normalizedDetail = detail?.trim();
  if (bracketed) {
    return normalizedDetail ? `[${label}] ${normalizedDetail}` : `[${label}]`;
  }

  return normalizedDetail ? `${label} · ${normalizedDetail}` : label;
}

function truncateSemanticText(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars).trim()}…`;
}
