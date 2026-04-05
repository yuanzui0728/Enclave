export function formatTimestamp(value?: string | null) {
  if (!value) {
    return "刚刚";
  }

  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

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
