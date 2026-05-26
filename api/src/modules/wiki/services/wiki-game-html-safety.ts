// i18n-ignore-start: backend safety util; messages are domain codes surfaced via 400.
/**
 * 发布前的自包含 HTML 安全校验。游戏在隐界 App 里跑在 sandbox iframe + CSP
 * connect-src 'none'，外部引用本就会被 CSP 拦死、游戏跑不起来，且是数据外泄/
 * 滥用的载体。所以发布到公共板块前**硬拒**这些；字体/图片外链只软标记。
 */

const HARD_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /<script[^>]+\bsrc\s*=/i, label: '外部 <script src>' },
  { re: /\bfetch\s*\(/i, label: 'fetch()' },
  { re: /\bXMLHttpRequest\b/i, label: 'XMLHttpRequest' },
  { re: /\bnew\s+WebSocket\b/i, label: 'WebSocket' },
  { re: /\bimport\s*\(/i, label: '动态 import()' },
  { re: /<iframe\b/i, label: '嵌套 <iframe>' },
  // script/JS 上下文里的外部 http(s) URL（排除 localhost）。
  { re: /(?:src|href)\s*=\s*["']https?:\/\/(?!localhost)/i, label: '外部资源链接' },
];

/** 返回硬违规列表（空 = 通过）。 */
export function findHardExternalRefs(html: string): string[] {
  const hits: string[] = [];
  for (const { re, label } of HARD_PATTERNS) {
    if (re.test(html)) hits.push(label);
  }
  return hits;
}

/** 体积上限（与生成阶段一致）。 */
export const MAX_PUBLISH_HTML_BYTES = 1_500_000;
// i18n-ignore-end
