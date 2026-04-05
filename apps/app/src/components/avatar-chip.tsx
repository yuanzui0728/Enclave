import { initials } from "../lib/format";

export function AvatarChip({ name, src, size = "md" }: { name?: string | null; src?: string | null; size?: "sm" | "md" | "lg" }) {
  const classes =
    size === "sm"
      ? "h-9 w-9 text-sm"
      : size === "lg"
        ? "h-14 w-14 text-xl"
        : "h-11 w-11 text-base";

  if (src && src.trim()) {
    return <img src={src} alt={name ?? "avatar"} className={`${classes} rounded-full object-cover`} />;
  }

  return (
    <div className={`${classes} flex items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(249,115,22,0.85),rgba(251,191,36,0.85))] font-semibold text-white`}>
      {initials(name)}
    </div>
  );
}
