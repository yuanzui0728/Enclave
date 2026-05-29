export type ChatCardBadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export function resolveChatCardBadgeClassName(tone: ChatCardBadgeTone) {
  if (tone === "success") {
    return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[color:var(--state-success-bg)] text-[color:var(--brand-primary)]";
  }

  if (tone === "warning") {
    return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[color:var(--brand-primary)]/16 text-[color:var(--brand-primary)]";
  }

  if (tone === "danger") {
    return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]";
  }

  if (tone === "neutral") {
    return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[color:var(--border-faint)] text-[color:var(--text-secondary)]";
  }

  return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[color:var(--state-info-bg)] text-[color:var(--state-info-text)]";
}
