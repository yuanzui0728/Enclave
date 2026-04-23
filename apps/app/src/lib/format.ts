import {
  formatDateTime,
  getJustNowLabel,
  getYesterdayLabel,
} from "@yinjie/i18n";

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
  return formatDateTime(date, {
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
    return formatDateTime(date, {
      month: "numeric",
      day: "numeric",
    });
  }

  return formatDateTime(date, {
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
    return formatDateTime(date, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return formatDateTime(date, {
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
    return formatDateTime(date, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return formatDateTime(date, {
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

  return formatDateTime(date, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name?: string | null) {
  return name?.trim().slice(0, 1) || "隐";
}

function parseDateValue(value?: string | null) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) {
    return null;
  }

  return new Date(timestamp);
}

function formatTime(date: Date) {
  return formatDateTime(date, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWeekday(date: Date) {
  return formatDateTime(date, {
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
