const THOUGHT_BLOCK_PATTERN = /<thought\b[^>]*>[\s\S]*?<\/thought>/gi;
const INTERNAL_REASONING_BLOCK_PATTERN =
  /<internal_reasoning\b[^>]*>[\s\S]*?<\/internal_reasoning>/gi;
// MiniMax / DeepSeek-R1 / Qwen-QvQ 等推理模型会把思考过程包在 <think>...</think> 中。
const THINK_BLOCK_PATTERN = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
// 模型 max_tokens 被 thinking 吃光、没来得及输出 </think> 闭合时的兜底：
// 把第一个 <think 起到末尾全部丢弃（包括没闭合的 thought / internal_reasoning）。
// 不加这个的话，<think> 里偶尔出现的 { ... } 会被后续 firstBrace/lastBrace
// 兜底当成 JSON 候选，JSON.parse 失败回退到 {}，调用方拿到空 result 完全看不出
// 是「AI 把 thinking 没说完就被截断」还是「真没结果」。
const UNCLOSED_REASONING_TAIL_PATTERN =
  /<(?:think|thought|internal_reasoning)\b[^>]*>[\s\S]*$/i;
const THOUGHT_TAG_PATTERN = /<\/?thought\b[^>]*>/gi;
const INTERNAL_REASONING_TAG_PATTERN = /<\/?internal_reasoning\b[^>]*>/gi;
const THINK_TAG_PATTERN = /<\/?think\b[^>]*>/gi;
const INTERNAL_SPEAKER_PREFIX_PATTERN = /^\[[^\]\n]{1,120}\]:\s*/gm;

export function sanitizeAiText(text: string): string {
  return text
    .replace(INTERNAL_REASONING_BLOCK_PATTERN, '')
    .replace(THOUGHT_BLOCK_PATTERN, '')
    .replace(THINK_BLOCK_PATTERN, '')
    .replace(UNCLOSED_REASONING_TAIL_PATTERN, '')
    .replace(INTERNAL_REASONING_TAG_PATTERN, '')
    .replace(THOUGHT_TAG_PATTERN, '')
    .replace(THINK_TAG_PATTERN, '')
    .replace(INTERNAL_SPEAKER_PREFIX_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const JSON_CODE_FENCE_PATTERN = /```(?:json|JSON)?\s*([\s\S]*?)```/;
// 兜底：max_tokens 在 thinking 之后吃到 JSON 中段，闭合的 ``` 没来得及输出。
// 这种 case 闭合 fence 正则不匹配 → 回退到 firstBrace/lastBrace 会切到一段
// 残缺 JSON → JSON.parse 失败 → generateJsonObject 返回 {} → 调用方拿到 0 个 directions。
// 抓住"```json 起，到末尾"这段，把里面残缺的 JSON 提取出来，交给下面 balance 兜底。
const JSON_OPEN_FENCE_PATTERN = /```(?:json|JSON)?\s*([\s\S]+)$/;

// 推理模型（DeepSeek-R1 / Qwen-QvQ / MiniMax 等）即使设置了 response_format=json_object，
// 仍可能在输出里夹带 <think> 块或 ```json``` 代码栅栏。直接 JSON.parse 会失败。
// 这里把推理痕迹剥掉，再依次按"闭合代码栅栏 → 未闭合代码栅栏 → 首个 { ... 最后一个 } → 原文"
// 的顺序提取 JSON 候选串，并对截断在 array/object 中间的情况做 brace balancing 兜底。
export function extractJsonFromModelOutput(raw: string): string {
  const cleaned = sanitizeAiText(raw);
  const fenceMatch = cleaned.match(JSON_CODE_FENCE_PATTERN);
  if (fenceMatch && fenceMatch[1].trim()) {
    return repairTruncatedJson(fenceMatch[1].trim());
  }
  const openFenceMatch = cleaned.match(JSON_OPEN_FENCE_PATTERN);
  if (openFenceMatch && openFenceMatch[1].trim()) {
    return repairTruncatedJson(openFenceMatch[1].trim());
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return repairTruncatedJson(cleaned.slice(firstBrace, lastBrace + 1));
  }
  if (firstBrace >= 0) {
    return repairTruncatedJson(cleaned.slice(firstBrace));
  }
  return cleaned;
}

// 把"在 array/object 中段截断"的 JSON 尽量还原到能 JSON.parse 的形状：
// - 先按 lastBrace 切到最后一个 }，避免末尾糊上半截字段
// - 仍跑一遍简易 balancer：跳过字符串、遇到截断的 string 直接补 "，把剩余的
//   open brace/bracket 反向补上，让 JSON.parse 能起码恢复出已经完成的字段。
function repairTruncatedJson(candidate: string): string {
  const lastBrace = candidate.lastIndexOf('}');
  let working =
    lastBrace > 0 && candidate.slice(-1) !== '}'
      ? candidate.slice(0, lastBrace + 1)
      : candidate;

  try {
    JSON.parse(working);
    return working;
  } catch {
    // 继续 balance
  }

  const stack: ('{' | '[')[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < working.length; i += 1) {
    const ch = working[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' && stack[stack.length - 1] === '{') stack.pop();
    else if (ch === ']' && stack[stack.length - 1] === '[') stack.pop();
  }

  if (inString) {
    working += '"';
  }
  // 截断常发生在 "key": "value 后跟 ,\n ... 或在 value 后没结束。
  // 直接按 stack 反向补；trailing comma 在 strict JSON 里非法，这里先把
  // 末尾可能的逗号/冒号清掉，再补 brackets。
  working = working.replace(/[,:\s]+$/, '');
  while (stack.length) {
    const top = stack.pop();
    working += top === '{' ? '}' : ']';
  }

  try {
    JSON.parse(working);
    return working;
  } catch {
    return candidate;
  }
}
