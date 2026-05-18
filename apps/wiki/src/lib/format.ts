import { formatDateTime as runtimeFormatDateTime } from "@yinjie/i18n";

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
};

// 原写法 toLocaleString(undefined, ...) 走的是浏览器 navigator.language，跟
// wiki 顶栏的"界面语言"切换器（lingui activeLocale）解耦：UA 是 en-US 的用户
// 即便在 wiki 里选了简体中文，recent-changes/history/protection-log 的时间戳
// 仍然渲染成 "Jan 15, 2026, 14:30"，反过来也一样。改走 @yinjie/i18n 的运行时
// 格式化（先 resolveRuntimeLocale 拿 activeLocale，再用 Intl.DateTimeFormat），
// 时间显示与界面语言保持一致。
export function formatDateTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return runtimeFormatDateTime(d, DATE_TIME_OPTIONS);
}

export function formatDate(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return runtimeFormatDateTime(d, DATE_OPTIONS);
}
