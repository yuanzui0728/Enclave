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

export function GroupAvatarChip({
  name,
  members = [],
  size = "md",
}: {
  name?: string | null;
  members?: string[];
  size?: "sm" | "md" | "wechat";
}) {
  const frameClassName =
    size === "sm"
      ? "h-9 w-9 rounded-[16px] p-[2px]"
      : size === "wechat"
        ? "h-12 w-12 rounded-xl p-[3px]"
        : "h-11 w-11 rounded-[18px] p-[2px]";
  const cellClassName =
    size === "sm"
      ? "rounded-[6px]"
      : size === "wechat"
        ? "rounded-[7px]"
        : "rounded-[7px]";
  const sources = buildGroupAvatarSources(name, members);

  return (
    <div
      className={`${frameClassName} grid grid-cols-2 gap-[2px] overflow-hidden border border-white/80 bg-[#ececec] shadow-[var(--shadow-soft)]`}
      aria-label={name ?? "group avatar"}
    >
      {sources.map((source, index) => (
        <img
          key={`${source}-${index}`}
          src={source}
          alt=""
          loading="lazy"
          className={`${cellClassName} h-full w-full object-cover`}
        />
      ))}
    </div>
  );
}

function buildGroupAvatarSources(name?: string | null, members: string[] = []) {
  const seeds = [name?.trim() ?? "", ...members.map((member) => member.trim())]
    .filter(Boolean)
    .slice(0, 4);
  const normalizedSeeds = seeds.length
    ? seeds
    : ["group-a", "group-b", "group-c", "group-d"];

  while (normalizedSeeds.length < 4) {
    normalizedSeeds.push(
      `${normalizedSeeds[normalizedSeeds.length - 1]}:${normalizedSeeds.length}`,
    );
  }

  return normalizedSeeds.slice(0, 4).map((seed) => {
    return (
      fallbackAvatars[hashSeed(seed) % fallbackAvatars.length] ??
      defaultOwnerAvatar
    );
  });
}

function hashSeed(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 33 + (character.codePointAt(0) ?? 0)) >>> 0;
  }

  return hash;
}
