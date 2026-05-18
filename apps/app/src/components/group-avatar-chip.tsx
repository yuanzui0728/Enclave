import { memo } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
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

// 走查电脑端群聊 R1：上游 desktop-group-call-panel.tsx 已经特意把 members
// 数组 useMemo 锁住引用、姊妹路径 mobile-group-call-screen (commit 948078bb2)
// 也一样——但 GroupAvatarChip 没挂 React.memo，父级每次 re-render（typing
// tick / socket echo / mutation 翻 isPending / 30s 轮询 refetch 等）都会让
// 本组件函数体重跑：buildGroupAvatarSources 里 4 路 hashSeed × N 字符 + 4 个
// <img key=...> 的 reconciliation。chat-list-page 长会话列表里几十个群条目
// 同时挂着、群通话面板上 9 路 typing tick + 1200ms auto-sync + 30s 轮询并发
// 触发时，浏览器一帧画好几百次 hash 计算。和 AvatarChip / 其它 atom
// 组件口径对齐，挂 memo 让"members 引用稳定 + name 字符串稳定"时跳过 render。
export const GroupAvatarChip = memo(function GroupAvatarChip({
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
      className={`${frameClassName} yj-no-callout grid grid-cols-2 gap-[2px] overflow-hidden border border-white/80 bg-[#ececec] shadow-[var(--shadow-soft)]`}
      // 走查电脑端群聊 R11：原版 `name ?? "group avatar"` 有 2 个问题：
      // 1) ?? 漏防空串 — name === "" 时 aria-label="" 屏幕阅读器跳过整张
      //    group avatar 图，盲人在群聊列表 / 群通话面板 / 消息气泡里听不到群
      //    标识。group_members.memberName / groups.name 都允许 trim 成空（旧
      //    数据 + 老 conversation schema normalize 前过渡）。和姊妹 R10 移动端
      //    sticker label || displayText (commit 0b4539945) 同款 ?? → || 清扫。
      // 2) "group avatar" 写死英文，zh-CN / ja-JP / ko-KR 用户 SR 听到英文
      //    fallback。和 GroupChatThreadPanel header / 详情页 title 一致兜底
      //    "群聊" / "Group chat"。
      aria-label={name?.trim() || translateRuntimeMessage(msg`群聊`)}
    >
      {sources.map((source, index) => (
        <img
          key={`${source}-${index}`}
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`${cellClassName} h-full w-full object-cover`}
        />
      ))}
    </div>
  );
});

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
