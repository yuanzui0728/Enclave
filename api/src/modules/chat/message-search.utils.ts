import type { GroupMessage, Message, MessageAttachment } from './chat.types';
import {
  resolveAttachmentSearchableText,
  resolveMessageSemanticPreview,
} from './attachment-semantic-text';

export type MessageSearchCategory = 'all' | 'media' | 'files' | 'links';

export type MessageSearchQuery = {
  keyword?: string;
  category?: string;
  messageType?: string;
  senderId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
};

export type MessageSearchItem = {
  messageId: string;
  createdAt: Date;
  senderId: string;
  senderName: string;
  messageType: Message['type'] | GroupMessage['type'];
  previewText: string;
  categories: MessageSearchCategory[];
  attachment?: MessageAttachment;
};

export type MessageSearchResponse = {
  items: MessageSearchItem[];
  total: number;
  nextCursor?: string;
  hasMore: boolean;
};

type SearchableMessage = Message | GroupMessage;

const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 100;
const URL_PATTERN = /https?:\/\/[^\s]+/giu;

export function searchMessages(
  messages: SearchableMessage[],
  query: MessageSearchQuery,
): MessageSearchResponse {
  const normalized = normalizeMessageSearchQuery(query);
  const matched = messages
    .filter((message) => matchesMessageSearchQuery(message, normalized))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((message) => buildMessageSearchItem(message));

  const page = matched.slice(
    normalized.offset,
    normalized.offset + normalized.limit,
  );
  const nextOffset = normalized.offset + normalized.limit;

  return {
    items: page,
    total: matched.length,
    nextCursor: nextOffset < matched.length ? String(nextOffset) : undefined,
    hasMore: nextOffset < matched.length,
  };
}

export function sliceMessagesAround<T extends { id: string }>(
  messages: T[],
  aroundMessageId: string,
  before = 24,
  after = 24,
) {
  const targetIndex = messages.findIndex(
    (message) => message.id === aroundMessageId,
  );
  if (targetIndex === -1) {
    return null;
  }

  const safeBefore = normalizeWindowSize(before, 24);
  const safeAfter = normalizeWindowSize(after, 24);
  return messages.slice(
    Math.max(0, targetIndex - safeBefore),
    Math.min(messages.length, targetIndex + safeAfter + 1),
  );
}

function matchesMessageSearchQuery(
  message: SearchableMessage,
  query: ReturnType<typeof normalizeMessageSearchQuery>,
) {
  if (query.senderId && message.senderId !== query.senderId) {
    return false;
  }

  if (!matchesMessageType(message, query.messageType)) {
    return false;
  }

  if (!matchesMessageDate(message.createdAt, query.dateFrom, query.dateTo)) {
    return false;
  }

  const categories = resolveMessageSearchCategories(message);
  if (!categories.includes(query.category)) {
    return false;
  }

  if (!query.keyword) {
    return true;
  }

  return buildSearchableText(message).includes(query.keyword);
}

function buildMessageSearchItem(message: SearchableMessage): MessageSearchItem {
  return {
    messageId: message.id,
    createdAt: message.createdAt,
    senderId: message.senderId,
    senderName: message.senderName,
    messageType: message.type,
    previewText: resolveMessagePreview(message),
    categories: resolveMessageSearchCategories(message),
    attachment: message.attachment,
  };
}

function normalizeMessageSearchQuery(query: MessageSearchQuery) {
  const rawLimit =
    typeof query.limit === 'number' && Number.isFinite(query.limit)
      ? query.limit
      : Number(query.limit);
  const rawOffset =
    typeof query.cursor === 'string'
      ? Number(query.cursor)
      : Number(query.cursor);
  return {
    keyword: query.keyword?.trim().toLowerCase() ?? '',
    category: isMessageSearchCategory(query.category) ? query.category : 'all',
    messageType: query.messageType?.trim() || 'all',
    senderId: query.senderId?.trim() || undefined,
    dateFrom: parseDateBoundary(query.dateFrom, 'start'),
    dateTo: parseDateBoundary(query.dateTo, 'end'),
    limit:
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_SEARCH_LIMIT)
        : DEFAULT_SEARCH_LIMIT,
    offset:
      Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0,
  };
}

function normalizeWindowSize(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function matchesMessageType(message: SearchableMessage, filter: string) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'text') {
    return message.type === 'text' || message.type === 'proactive';
  }

  return message.type === filter;
}

function matchesMessageDate(createdAt: Date, dateFrom?: Date, dateTo?: Date) {
  const timestamp = createdAt.getTime();
  if (dateFrom && timestamp < dateFrom.getTime()) {
    return false;
  }

  if (dateTo && timestamp > dateTo.getTime()) {
    return false;
  }

  return true;
}

function buildSearchableText(message: SearchableMessage) {
  const attachment = message.attachment;
  const attachmentSemanticText = resolveAttachmentSearchableText(attachment);
  const parts = [
    message.senderName,
    message.text,
    resolveMessagePreview(message),
    attachmentSemanticText,
  ];

  if (attachment?.kind === 'image' || attachment?.kind === 'file') {
    parts.push(attachment.fileName, attachment.mimeType);
  }

  if (attachment?.kind === 'voice') {
    parts.push(attachment.fileName, attachment.mimeType, '语音');
  }

  if (attachment?.kind === 'contact_card') {
    parts.push(
      attachment.name,
      attachment.relationship ?? '',
      attachment.bio ?? '',
    );
  }

  if (attachment?.kind === 'location_card') {
    parts.push(attachment.title, attachment.subtitle ?? '');
  }

  if (attachment?.kind === 'sticker') {
    parts.push(attachment.label ?? '', attachment.stickerId, '表情');
  }

  const linkMatches = message.text.match(URL_PATTERN) ?? [];
  parts.push(...linkMatches);

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function resolveMessagePreview(message: SearchableMessage) {
  return resolveMessageSemanticPreview(message);
}

function resolveMessageSearchCategories(
  message: SearchableMessage,
): MessageSearchCategory[] {
  const categories: MessageSearchCategory[] = ['all'];

  if (message.type === 'image') {
    categories.push('media');
  }

  if (message.type === 'file') {
    categories.push('files');
  }

  if (URL_PATTERN.test(message.text)) {
    categories.push('links');
  }
  URL_PATTERN.lastIndex = 0;

  return categories;
}

function parseDateBoundary(value: string | undefined, mode: 'start' | 'end') {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(
      `${trimmed}T${mode === 'start' ? '00:00:00.000' : '23:59:59.999'}`,
    );
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function isMessageSearchCategory(
  value: string | undefined,
): value is MessageSearchCategory {
  return (
    value === 'all' ||
    value === 'media' ||
    value === 'files' ||
    value === 'links'
  );
}
