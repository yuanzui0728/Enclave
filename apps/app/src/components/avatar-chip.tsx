import { useEffect, useState } from "react";
import defaultAvatarDusk from "../assets/default-avatar-dusk.svg";
import defaultAvatarEmber from "../assets/default-avatar-ember.svg";
import defaultAvatarMint from "../assets/default-avatar-mint.svg";
import defaultOwnerAvatar from "../assets/default-owner-avatar.svg";

const fallbackAvatars = [
  defaultOwnerAvatar,
  defaultAvatarEmber,
  defaultAvatarMint,
  defaultAvatarDusk,
];

export function AvatarChip({
  name,
  src,
  size = "md",
}: {
  name?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | "wechat";
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const classes =
    size === "sm"
      ? "h-9 w-9 rounded-[16px] text-sm"
      : size === "xl"
        ? "h-16 w-16 rounded-full text-2xl"
        : size === "wechat"
          ? "h-12 w-12 rounded-xl text-base"
          : size === "lg"
            ? "h-14 w-14 rounded-full text-xl"
            : "h-11 w-11 rounded-full text-base";
  const trimmedSrc = src?.trim() ?? "";
  const fallbackSrc = pickFallbackAvatar(name, trimmedSrc);
  const resolvedSrc = !loadFailed && isLikelyImageSource(trimmedSrc) ? trimmedSrc : fallbackSrc;

  useEffect(() => {
    setLoadFailed(false);
  }, [trimmedSrc]);

  return (
    <img
      src={resolvedSrc}
      alt={name ?? "avatar"}
      loading="lazy"
      onError={() => {
        if (!loadFailed) {
          setLoadFailed(true);
        }
      }}
      className={`${classes} border border-white/80 object-cover shadow-[var(--shadow-soft)]`}
    />
  );
}

function isLikelyImageSource(value: string) {
  if (!value) {
    return false;
  }

  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("blob:") ||
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value)
  );
}

function pickFallbackAvatar(name?: string | null, src?: string | null) {
  const seedParts = [name?.trim(), src?.trim()].filter(Boolean);
  const seed = seedParts.join(":") || "yinjie-avatar";
  let hash = 0;

  for (const character of seed) {
    hash = (hash * 33 + (character.codePointAt(0) ?? 0)) >>> 0;
  }

  return fallbackAvatars[hash % fallbackAvatars.length] ?? defaultOwnerAvatar;
}
