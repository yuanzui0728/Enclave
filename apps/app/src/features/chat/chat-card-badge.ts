export type ChatCardBadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export function resolveChatCardBadgeClassName(tone: ChatCardBadgeTone) {
  if (tone === "success") {
    return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[rgba(34,197,94,0.14)] text-[color:var(--brand-primary)]";
  }

  if (tone === "warning") {
    return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[rgba(245,158,11,0.16)] text-[color:var(--brand-primary)]";
  }

  if (tone === "danger") {
    return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[rgba(239,68,68,0.12)] text-[#d74b45]";
  }

  if (tone === "neutral") {
    return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[rgba(180,130,20,0.06)] text-[color:var(--text-secondary)]";
  }

  return "rounded-full px-2.5 py-1 text-[10px] font-medium bg-[rgba(59,130,246,0.12)] text-[#2563eb]";
}
