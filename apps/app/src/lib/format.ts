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

export function initials(name?: string | null) {
  return name?.trim().slice(0, 1) || "隐";
}
