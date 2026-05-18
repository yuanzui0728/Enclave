import { msg } from "@lingui/macro";
import {
  getActiveLocale,
  getJustNowLabel,
  getYesterdayLabel,
  translateRuntimeMessage,
} from "@yinjie/i18n";

const t = translateRuntimeMessage;

// 走查电脑端朋友圈 R3：formatDateTime 内部 `new Intl.DateTimeFormat(locale, opts)`
// 每次调用都重新构造一个 Intl 实例 —— V8 上 ~0.5-1ms。/tabs/moments 200 条
// moment 首屏 × formatTimestamp 1 次/条 = 100-200ms 纯 CPU 烧在 toolbar /
// feed 首挂上；conversation list、chat 消息列表、profile-moments 日期列等
// 也踩同坑。整张 app 的 formatDateTime 调用走一层 (locale, options) 维度的
// 缓存 —— 同 (locale, options) 组合二次起命中 Map.get 直接复用 Intl 实例，
// 内存上界 = 4 locale × ~10 unique options 组合 ≈ 40 条 entry，可忽略。
//
// 由于 lib/format.ts 是 app 本地 lib（@yinjie/i18n 是跨 app 共享 package），
// 缓存放这一层即可不影响 admin / cloud-console / wiki，更安全。
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
// 走查 R9：导出 formatDateTimeCached 让 chat-message-list 的 formatReminderSummary
// 也能复用缓存。原 toLocaleTimeString / toLocaleDateString 直接调用 V8 每次内部
// 都重建 Intl 实例（~0.5-1ms / 调用）；reminder badge 渲染在消息列表的 render
// hot path 里，每个 typing tick / setQueriesData 都跑一遍，长聊几条带 reminder
// 的消息每帧白烧 5-10ms。
export function formatDateTimeCached(
  date: Date | number,
  options: Intl.DateTimeFormatOptions,
) {
  const locale = getActiveLocale() ?? "zh-CN";
  // JSON.stringify 在小 options 对象上是 1-2us，比 new Intl 便宜 3 个量级；
  // 用它当 cache key 后缀。不同 key 顺序会算成不同 key，但 lib/format.ts
  // 内所有调用方都是字面量对象、顺序稳定，不会出现等价 options 多 key 的
  // 情况。即便出现，上限 ~40 仍然安全。
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateTimeFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatterCache.set(key, formatter);
  }
  return formatter.format(date);
}

export function parseTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);
  const timestamp = Number.isNaN(numericValue)
    ? Date.parse(value)
    : numericValue;
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function formatTimestamp(value?: string | null) {
  if (!value) {
    return getJustNowLabel();
  }

  const timestamp = parseTimestamp(value);
  if (timestamp === null) {
    return value;
  }

  const date = new Date(timestamp);
  return formatDateTimeCached(date, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatConversationTimestamp(value?: string | null) {
  const date = parseDateValue(value);
  if (!date) {
    return getJustNowLabel();
  }

  const now = new Date();
  const sameDay = isSameDay(date, now);
  if (sameDay) {
    return formatTime(date);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return getYesterdayLabel();
  }

  if (date.getFullYear() === now.getFullYear()) {
    return formatDateTimeCached(date, {
      month: "numeric",
      day: "numeric",
    });
  }

  return formatDateTimeCached(date, {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}

export function formatMessageTimestamp(value?: string | null) {
  const date = parseDateValue(value);
  if (!date) {
    return getJustNowLabel();
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) {
    return formatTime(date);
  }

  if (isSameDay(date, yesterday)) {
    return `${getYesterdayLabel()} ${formatTime(date)}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return formatDateTimeCached(date, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return formatDateTimeCached(date, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDesktopMessageTimestamp(value?: string | null) {
  const date = parseDateValue(value);
  if (!date) {
    return getJustNowLabel();
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) {
    return formatTime(date);
  }

  if (isSameDay(date, yesterday)) {
    return `${getYesterdayLabel()} ${formatTime(date)}`;
  }

  if (isInSameWeek(date, now)) {
    return `${formatWeekday(date)} ${formatTime(date)}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return formatDateTimeCached(date, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return formatDateTimeCached(date, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDetailedMessageTimestamp(value?: string | null) {
  const date = parseDateValue(value);
  if (!date) {
    return getJustNowLabel();
  }

  return formatDateTimeCached(date, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name?: string | null) {
  return name?.trim().slice(0, 1) || t(msg`隐`);
}

function parseDateValue(value?: string | null) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) {
    return null;
  }

  return new Date(timestamp);
}

function formatTime(date: Date) {
  return formatDateTimeCached(date, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWeekday(date: Date) {
  return formatDateTimeCached(date, {
    weekday: "long",
  });
}

function isInSameWeek(left: Date, right: Date) {
  const leftStart = startOfWeek(left);
  const rightStart = startOfWeek(right);
  return leftStart.getTime() === rightStart.getTime();
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? 6 : day - 1;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return start;
}
