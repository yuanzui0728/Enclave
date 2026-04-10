export function parseTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);
  const timestamp = Number.isNaN(numericValue) ? Date.parse(value) : numericValue;
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function formatTimestamp(value?: string | null) {
  if (!value) {
    return "刚刚";
  }

  const timestamp = parseTimestamp(value);
  if (timestamp === null) {
    return value;
  }

  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatConversationTimestamp(value?: string | null) {
  const date = parseDateValue(value);
  if (!date) {
    return "刚刚";
  }

  const now = new Date();
  const sameDay = isSameDay(date, now);
  if (sameDay) {
    return formatTime(date);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return "昨天";
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatMessageTimestamp(value?: string | null) {
  const date = parseDateValue(value);
  if (!date) {
    return "刚刚";
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) {
    return formatTime(date);
  }

  if (isSameDay(date, yesterday)) {
    return `昨天 ${formatTime(date)}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDetailedMessageTimestamp(value?: string | null) {
  const date = parseDateValue(value);
  if (!date) {
    return "刚刚";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
