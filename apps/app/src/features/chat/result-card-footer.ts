export type ResultCardFooterTone = "muted" | "info" | "success" | "warning";

export type ResultCardFooterCopy = {
  description: string;
  actionLabel: string;
  tone: ResultCardFooterTone;
  ariaLabel: string;
};

export function resolveResultCardFooterActionClassName(
  tone: ResultCardFooterTone,
) {
  if (tone === "success") {
    return "text-[#15803d]";
  }

  if (tone === "warning") {
    return "text-[#b45309]";
  }

  if (tone === "muted") {
    return "text-[color:var(--text-muted)]";
  }

  return "text-[#2563eb]";
}
