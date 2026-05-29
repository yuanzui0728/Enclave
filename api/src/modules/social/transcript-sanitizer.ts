import { sanitizeAiText } from '../ai/ai-text-sanitizer';

// 分身相遇对话脚本清洗（联系方式泄漏防御第 3 层，在 world 生成后、返回 cloud-api 前）。
// 真实联系方式只能在双方都「想要」后由 cloud-api DB join 披露，对话里绝不允许出现。

const CONTACT_LEAK_PATTERNS: RegExp[] = [
  /\b\d{11}\b/, // 11 位手机号
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // 邮箱（prompt 已禁止，这里兜底）
  /(微信|weixin|wechat|vx|wx|qq)号?\s*[:：是为]?\s*[A-Za-z0-9_-]{4,}/i,
  /(加|搜)\s*(我|一下)?\s*(微信|vx|wx|qq|联系方式|手机号)/i,
  /https?:\/\/\S+/i,
  /二维码|扫码|qr\s*code/i,
];

// 去掉 (动作) / 【场景】 / *旁白* 这类编剧旁白标记，让两位分身像真人对话。
function stripNarration(text: string): string {
  return text
    .replace(/[（(][^）)]{0,40}[）)]/g, '')
    .replace(/[[【][^\]】]{0,40}[\]】]/g, '')
    .replace(/\*[^*]{0,60}\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type RawTranscriptTurn = { speaker?: unknown; text?: unknown };

export function cleanTranscriptText(raw: string): string {
  return stripNarration(sanitizeAiText(raw || ''));
}

// 清洗 turns：剥 <think>/旁白、丢空行、丢任何疑似泄漏联系方式的整轮。
export function sanitizeTranscriptTurns(
  turns: RawTranscriptTurn[],
): Array<{ speaker: 'initiator' | 'recipient'; text: string }> {
  const out: Array<{ speaker: 'initiator' | 'recipient'; text: string }> = [];
  for (const turn of turns) {
    const speaker =
      turn?.speaker === 'recipient'
        ? 'recipient'
        : turn?.speaker === 'initiator'
          ? 'initiator'
          : null;
    if (!speaker) continue;
    const text = cleanTranscriptText(
      typeof turn?.text === 'string' ? turn.text : '',
    );
    if (!text) continue;
    if (CONTACT_LEAK_PATTERNS.some((re) => re.test(text))) continue;
    out.push({ speaker, text });
  }
  return out;
}
