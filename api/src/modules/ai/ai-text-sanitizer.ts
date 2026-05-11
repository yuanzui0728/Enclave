const THOUGHT_BLOCK_PATTERN = /<thought\b[^>]*>[\s\S]*?<\/thought>/gi;
const INTERNAL_REASONING_BLOCK_PATTERN =
  /<internal_reasoning\b[^>]*>[\s\S]*?<\/internal_reasoning>/gi;
// MiniMax / DeepSeek-R1 / Qwen-QvQ 等推理模型会把思考过程包在 <think>...</think> 中。
const THINK_BLOCK_PATTERN = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
const THOUGHT_TAG_PATTERN = /<\/?thought\b[^>]*>/gi;
const INTERNAL_REASONING_TAG_PATTERN = /<\/?internal_reasoning\b[^>]*>/gi;
const THINK_TAG_PATTERN = /<\/?think\b[^>]*>/gi;
const INTERNAL_SPEAKER_PREFIX_PATTERN = /^\[[^\]\n]{1,120}\]:\s*/gm;

export function sanitizeAiText(text: string): string {
  return text
    .replace(INTERNAL_REASONING_BLOCK_PATTERN, '')
    .replace(THOUGHT_BLOCK_PATTERN, '')
    .replace(THINK_BLOCK_PATTERN, '')
    .replace(INTERNAL_REASONING_TAG_PATTERN, '')
    .replace(THOUGHT_TAG_PATTERN, '')
    .replace(THINK_TAG_PATTERN, '')
    .replace(INTERNAL_SPEAKER_PREFIX_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const JSON_CODE_FENCE_PATTERN = /```(?:json|JSON)?\s*([\s\S]*?)```/;

// 推理模型（DeepSeek-R1 / Qwen-QvQ / MiniMax 等）即使设置了 response_format=json_object，
// 仍可能在输出里夹带 <think> 块或 ```json``` 代码栅栏。直接 JSON.parse 会失败。
// 这里把推理痕迹剥掉，再依次按"代码栅栏 → 首个 { ... 最后一个 } → 原文"的顺序提取 JSON 候选串。
export function extractJsonFromModelOutput(raw: string): string {
  const cleaned = sanitizeAiText(raw);
  const fenceMatch = cleaned.match(JSON_CODE_FENCE_PATTERN);
  if (fenceMatch && fenceMatch[1].trim()) {
    return fenceMatch[1].trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}
