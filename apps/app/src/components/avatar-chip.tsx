import { initials } from "../lib/format";

export function AvatarChip({
  name,
  src,
  size = "md",
}: {
  name?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "wechat";
}) {
  const classes =
    size === "sm"
      ? "h-9 w-9 text-sm"
      : size === "wechat"
        ? "h-12 w-12 rounded-xl text-base"
      : size === "lg"
        ? "h-14 w-14 rounded-full text-xl"
        : "h-11 w-11 rounded-full text-base";

  if (src && src.trim()) {
    return <img src={src} alt={name ?? "avatar"} className={`${classes} object-cover`} />;
  }

  return (
    <div className={`${classes} flex items-center justify-center bg-[linear-gradient(135deg,rgba(249,115,22,0.85),rgba(251,191,36,0.85))] font-semibold text-white`}>
      {initials(name)}
    </div>
  );
}
