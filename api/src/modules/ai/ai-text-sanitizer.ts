const THOUGHT_BLOCK_PATTERN = /<thought\b[^>]*>[\s\S]*?<\/thought>/gi;
const INTERNAL_REASONING_BLOCK_PATTERN =
  /<internal_reasoning\b[^>]*>[\s\S]*?<\/internal_reasoning>/gi;
const THOUGHT_TAG_PATTERN = /<\/?thought\b[^>]*>/gi;
const INTERNAL_REASONING_TAG_PATTERN = /<\/?internal_reasoning\b[^>]*>/gi;

export function sanitizeAiText(text: string): string {
  return text
    .replace(INTERNAL_REASONING_BLOCK_PATTERN, '')
    .replace(THOUGHT_BLOCK_PATTERN, '')
    .replace(INTERNAL_REASONING_TAG_PATTERN, '')
    .replace(THOUGHT_TAG_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
