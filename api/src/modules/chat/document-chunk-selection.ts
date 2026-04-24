import type { FileAttachment } from './chat.types';

const DEFAULT_DOCUMENT_PROMPT_CHARS = 1800;
const DOCUMENT_CHUNK_TARGET_CHARS = 720;
const DOCUMENT_CHUNK_OVERLAP_CHARS = 120;
const MAX_SELECTED_DOCUMENT_CHUNKS = 3;
const STOP_WORDS = new Set([
  '这个',
  '那个',
  '帮我',
  '给我',
  '一下',
  '文档',
  '文件',
  '内容',
  '看看',
  '总结',
  '分析',
  '说明',
  '以及',
  '然后',
  '我们',
  '你们',
  '他们',
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
]);

export function buildDocumentPromptExcerpt(input: {
  attachment: Pick<FileAttachment, 'extractedText' | 'documentInsight'>;
  queryText?: string;
  maxChars?: number;
}) {
  const maxChars = Math.max(400, input.maxChars ?? DEFAULT_DOCUMENT_PROMPT_CHARS);
  const extractedText = input.attachment.extractedText?.trim() || '';
  const previewText = input.attachment.documentInsight?.previewText?.trim() || '';
  const sourceText = extractedText || previewText;
  if (!sourceText) {
    return '';
  }

  const normalizedSource = normalizeDocumentText(sourceText);
  if (!normalizedSource) {
    return '';
  }

  const fallbackExcerpt = truncateText(normalizedSource, maxChars);
  const terms = buildSearchTerms(input.queryText);
  if (!terms.length) {
    return fallbackExcerpt;
  }

  const chunks = buildDocumentChunks(normalizedSource);
  if (!chunks.length) {
    return fallbackExcerpt;
  }

  const scoredChunks = chunks
    .map((chunk, index) => ({
      chunk,
      index,
      score: scoreChunk(chunk, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, MAX_SELECTED_DOCUMENT_CHUNKS)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.chunk);

  if (!scoredChunks.length) {
    return fallbackExcerpt;
  }

  return truncateText(scoredChunks.join('\n...\n'), maxChars);
}

function buildDocumentChunks(text: string) {
  if (text.length <= DOCUMENT_CHUNK_TARGET_CHARS) {
    return [text];
  }

  const paragraphChunks = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (paragraphChunks.length <= 1) {
    return buildSlidingWindowChunks(text);
  }

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphChunks) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= DOCUMENT_CHUNK_TARGET_CHARS) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= DOCUMENT_CHUNK_TARGET_CHARS) {
      current = paragraph;
      continue;
    }

    chunks.push(...buildSlidingWindowChunks(paragraph));
    current = '';
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : buildSlidingWindowChunks(text);
}

function buildSlidingWindowChunks(text: string) {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = text.slice(cursor, cursor + DOCUMENT_CHUNK_TARGET_CHARS).trim();
    if (next) {
      chunks.push(next);
    }
    if (cursor + DOCUMENT_CHUNK_TARGET_CHARS >= text.length) {
      break;
    }
    cursor += DOCUMENT_CHUNK_TARGET_CHARS - DOCUMENT_CHUNK_OVERLAP_CHARS;
  }
  return chunks;
}

function buildSearchTerms(queryText?: string) {
  const normalizedQuery = normalizeDocumentText(queryText ?? '');
  if (!normalizedQuery) {
    return [];
  }

  const terms = new Set<string>();
  const loweredQuery = normalizedQuery.toLowerCase();
  if (loweredQuery.length >= 2) {
    terms.add(loweredQuery);
  }

  const lexicalTerms = loweredQuery.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  lexicalTerms
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
    .forEach((term) => terms.add(term));

  for (const segment of loweredQuery.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let index = 0; index <= segment.length - 2; index += 1) {
      const term = segment.slice(index, index + 2);
      if (term.length === 2 && !STOP_WORDS.has(term)) {
        terms.add(term);
      }
    }
  }

  return [...terms].slice(0, 32);
}

function scoreChunk(chunk: string, terms: string[]) {
  const loweredChunk = chunk.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const firstIndex = loweredChunk.indexOf(term);
    if (firstIndex === -1) {
      continue;
    }

    score += term.length * 2;
    if (firstIndex < 120) {
      score += 2;
    }
  }

  return score;
}

function normalizeDocumentText(text: string) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars).trim()}…`;
}
