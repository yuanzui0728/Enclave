const thoughtBlockPattern = /<thought\b[^>]*>[\s\S]*?<\/thought>/gi;
const internalReasoningBlockPattern =
  /<internal_reasoning\b[^>]*>[\s\S]*?<\/internal_reasoning>/gi;
const thoughtTagPattern = /<\/?thought\b[^>]*>/gi;
const internalReasoningTagPattern = /<\/?internal_reasoning\b[^>]*>/gi;
const internalSpeakerPrefixPattern = /^\[[^\]\n]{1,120}\]:\s*/gm;

export function sanitizeDisplayedChatText(text: string): string {
  return text
    .replace(internalReasoningBlockPattern, "")
    .replace(thoughtBlockPattern, "")
    .replace(internalReasoningTagPattern, "")
    .replace(thoughtTagPattern, "")
    .replace(internalSpeakerPrefixPattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
