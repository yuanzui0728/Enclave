import { sanitizeAiText } from '../ai/ai-text-sanitizer';

// 推理 / 思考模型偶发把"任务回声 + 候选评估 + 自我商榷"原样吐出来当回复
// （没有 <think> 包裹，sanitizeAiText 抓不到）。这种文本永远不应该真的发到用户面前，
// 触发任一条命中就走静态 fallback。
const LEAKED_REASONING_PATTERNS: RegExp[] = [
  /20\s*字以内/, // 任务原文里的"20字以内"被原样回声
  /20\s*个字以内/,
  /20\s*words/i,
  /用户要求/,
  /任务[:：]/,
  /^\s*好的[，,]/,
  /^\s*让我/,
  /考虑到/,
  /或者[:：]/,
  /不对[，,。]/,
  /括号动作/, // 任务里"不要用括号动作"被回声
  /自我介绍名片/, // 任务里"不要写成自我介绍名片"被回声
];

const GREETING_HARD_MAX_CHARS = 80;
// 任务要求 20 字以内，4 行还干净的"开场白"几乎不存在；> 3 行 = 在自我商榷。
const GREETING_MAX_LINES = 3;

export function sanitizeGreeting(raw: string, fallback: string): string {
  const cleaned = sanitizeAiText(raw || '');
  if (!cleaned) return fallback;

  if (LEAKED_REASONING_PATTERNS.some((re) => re.test(cleaned))) {
    return fallback;
  }

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return fallback;
  if (lines.length > GREETING_MAX_LINES) return fallback;

  let firstLine = lines[0];
  firstLine = firstLine.replace(/^[「『"""'']+/, '').replace(/[」』"""'']+$/, '');
  firstLine = firstLine.replace(/^[-*•]+\s*/, '');
  if (!firstLine) return fallback;

  if (firstLine.length > GREETING_HARD_MAX_CHARS) {
    return firstLine.slice(0, GREETING_HARD_MAX_CHARS);
  }

  return firstLine;
}
