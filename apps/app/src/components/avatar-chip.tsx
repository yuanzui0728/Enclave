import { memo, useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import defaultAvatarDusk from "../assets/default-avatar-dusk.svg";
import defaultAvatarEmber from "../assets/default-avatar-ember.svg";
import defaultAvatarMint from "../assets/default-avatar-mint.svg";
import defaultOwnerAvatar from "../assets/default-owner-avatar.svg";
import { resolveAppMediaUrl } from "../lib/media-url";

const fallbackAvatars = [
  defaultOwnerAvatar,
  defaultAvatarEmber,
  defaultAvatarMint,
  defaultAvatarDusk,
];

// 走查电脑端单聊 R124：和姊妹 GroupAvatarChip R1（commit 已挂 memo）同款 perf
// 修法 —— GroupAvatarChip 注释里说"和 AvatarChip / 其它 atom 组件口径对齐"
// 但 AvatarChip 自己一直没挂 memo。全站 grep 115 处使用，chat-message-list
// 长聊 200+ 消息每条都挂一张发送者头像，桌面端单聊里父帧（typing tick / socket
// echo / setQueriesData / mutation pending 翻转）每秒重渲多次 → 每帧把所有
// 头像组件的 useState/useEffect/useMemo 全跑一遍 + className 三元字符串重组。
// 用户在长聊里典型场景：AI 正在 streaming 一条长回复，typing tick 一秒触发
// 多次 setMessages → ChatMessageList re-render → 200+ AvatarChip × 5+ hook
// 调用全跑。挂 memo 让 name/src/size 都是 string 引用稳定时跳过整个函数体。
export const AvatarChip = memo(function AvatarChip({
  name,
  src,
  size = "md",
}: {
  name?: string | null;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "wechat";
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const classes =
    size === "xs"
      ? "h-7 w-7 rounded-[var(--radius-sm)] text-xs"
      : size === "sm"
        ? "h-9 w-9 rounded-[var(--radius-md)] text-sm"
        : size === "xl"
          ? "h-16 w-16 rounded-full text-2xl"
          : size === "wechat"
            ? "h-12 w-12 rounded-xl text-base"
            : size === "lg"
              ? "h-14 w-14 rounded-full text-xl"
              : "h-11 w-11 rounded-full text-base";
  // 第三轮新会话 R2：之前 src?.trim() 在 render 函数体里裸跑——AvatarChip 全
  // 站用 113 次，profile-info-avatar-page 用户在 URL 输入框敲字时，1MB data URL
  // 头像每个 keystroke 都被 trim() 复制一次（O(n) 但生成新字符串副本，更重）。
  // 长列表（contacts / chat / moments）滚动时每个可视 chip 同样命中，CPU 抖动
  // 肉眼可感。src 多数时候是稳定引用（store / contract data），用 useMemo([src])
  // 就能把 trim 成本控在「src 真换了才再跑」。
  const trimmedSrc = useMemo(() => src?.trim() ?? "", [src]);

  useEffect(() => {
    setLoadFailed(false);
  }, [trimmedSrc]);

  // 走查 R1：fallbackSrc useMemo 原来挂在 emoji 早 return 之后，hook 顺序受
  // isEmojiAvatar(trimmedSrc) 影响——emoji 串只跑 3 个 hook（useState/useMemo/
  // useEffect），非 emoji 串跑 4 个。同一个 AvatarChip 实例的 src 在 emoji 与
  // 图片之间切换时（典型：角色资料里 emoji 头像，后端推一次真实 avatar URL；或
  // 反向：头像清空回退到 emoji），React 会撞到「Rendered fewer hooks than
  // expected」并被 CatchBoundary 整片接管，移动端单聊 details / 群聊 details /
  // contact-profile 都会渲染成 "Something went wrong!" 空页面，长按消息时弹出
  // 的 MessageAvatarPopover 同样砸掉。Rules of Hooks：所有 hook 必须无条件、
  // 同顺序调用。把 fallbackSrc useMemo 提到任何 conditional return 之前。
  // 角色 / 好友请求里 avatar 经常被存成单 emoji（比如 🌙 / 💬 / ☀️），
  // 之前 isLikelyImageSource 直接 false → 全部回落到默认渐变头像，导致「新的朋友」
  // 里 4/5 张头像都长得一样、看不出谁是谁。这里把 emoji 直接当文字 glyph 渲染，
  // 背景仍然走稳定 hash 出的渐变色，肉眼能立刻区分。
  // 第三轮新会话 R3：pickFallbackAvatar 之前裸跑每次 render。其中
  //   for (const character of seed) hash = ... char.codePointAt(0) ...
  // 把整段 seed（含 src）一字一字过一遍。1MB data URL 头像走这条 = 1M+ 次
  // codePointAt，hash 用不上时也照样跑（图片加载成功的常规路径就不需要 fallback）。
  // useMemo([name, trimmedSrc]) 让 fallbackSrc 只在 src 真变化时重算；
  // pickFallbackAvatar 内部把 seed 截到 256 字符上限（短串保持原 hash 行为，
  //   长 data URL 也只过头 256 个 byte 算 hash，足够分散）。
  const fallbackSrc = useMemo(
    () => pickFallbackAvatar(name, trimmedSrc),
    [name, trimmedSrc],
  );

  if (!isLikelyImageSource(trimmedSrc) && isEmojiAvatar(trimmedSrc)) {
    const emojiTextSize =
      size === "xs"
        ? "text-[length:var(--text-body)]"
        : size === "sm"
          ? "text-[18px]"
          : size === "xl"
            ? "text-[34px]"
            : size === "wechat"
              ? "text-[24px]"
              : size === "lg"
                ? "text-[length:var(--text-display)]"
                : "text-[length:var(--text-section)]";
    return (
      <span
        // 走查电脑端群聊 R11：和姊妹 GroupAvatarChip R11 同款 ?? vs || 漏防 +
        // hardcoded English fallback。群聊场景下 group_members.memberName / 角色
        // character.name 都允许 trim 成空（旧数据 + 老 conversation schema
        // normalize 前过渡），?? 让 aria-label="" → SR 跳过整张 emoji 头像；
        // "avatar" 写死英文 zh-CN/ja-JP/ko-KR 用户听到英文 fallback。
        //
        // 走查电脑端群聊 R107：和姊妹 R105 GroupAvatarChip / R106 unread badge
        // 同款 — 裸 <span> 挂 aria-label 没 role，按 ARIA 1.2 spec 在 generic
        // 元素上 aria-label 行为 implementation-defined。AvatarChip emoji 分支
        // 在群里高频出现（角色没头像 URL 时所有 member 头像 + 消息气泡头像都
        // 走这条），盲人 SR 在群消息列表 / 添加成员 picker / 群通话面板 / 详情
        // 头像 grid 上听到大量 generic 元素悬空。补 role="img" 把整张 emoji 头像
        // 当一张被命名的视觉元素；inner <span aria-hidden="true">emoji 字符</span>
        // 不被 SR 朗读。
        role="img"
        aria-label={name?.trim() || translateRuntimeMessage(msg`头像`)}
        className={`${classes} ${emojiTextSize} yj-no-callout flex items-center justify-center border border-white/80 bg-[color:var(--surface-console,#f5f1e6)] leading-none shadow-[var(--avatar-ring,0_0_0_0_transparent),var(--shadow-soft)]`}
      >
        <span aria-hidden="true">{trimmedSrc}</span>
      </span>
    );
  }
  const resolvedSrc =
    !loadFailed && isLikelyImageSource(trimmedSrc)
      ? resolveAvatarSource(trimmedSrc)
      : fallbackSrc;

  return (
    <img
      src={resolvedSrc}
      // 走查电脑端群聊 R11：同上 ?? → || + 翻译。img alt="" 屏幕阅读器把头像
      // 当 decorative image 整张跳过；hardcoded English 同款问题。
      alt={name?.trim() || translateRuntimeMessage(msg`头像`)}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (!loadFailed) {
          setLoadFailed(true);
        }
      }}
      draggable={false}
      className={`${classes} yj-no-callout border border-white/80 object-cover shadow-[var(--avatar-ring,0_0_0_0_transparent),var(--shadow-soft)]`}
    />
  );
});

const EMOJI_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
// 数学/字母变体（𝕏 / 𝓜 / 𝟙 等）的 Unicode 一般类别其实是 Lu/Ll/Nd，不是 Symbol，
// 所以 \p{S} / Extended_Pictographic 都 catch 不到。但它们都落在 SMP plane
// (U+10000 - U+10FFFF)，单 codepoint 拿来做角色头像 logo 是常见用法（xAI 用 "𝕏"）。
// 旧 isEmojiAvatar 判 false → 一律 fallback 默认渐变头像，xAI 的 logo 认不出。
// 补一条：单 codepoint 且落在 SMP 以上 → 也按 glyph 渲染。
const SMP_OR_HIGHER_GLYPH = /^[\u{10000}-\u{10FFFF}]$/u;

function isEmojiAvatar(value: string) {
  if (!value) {
    return false;
  }
  // 限定到「短串 + 含 emoji code point」：避免把名字里有 emoji 的长字符串当 emoji
  // 头像渲染（那种应该走文字 fallback）。一个复合 emoji（带 ZWJ / 修饰符）大概
  // 6~8 个 UTF-16 code unit，这里给 12 留点余地。
  if (value.length > 12) {
    return false;
  }
  if (EMOJI_PICTOGRAPHIC.test(value)) {
    return true;
  }
  // 单 codepoint && SMP+ → glyph。Array.from 按 codepoint 拆分（避免 surrogate
  // pair 被算成 2 个 length 误判成 "A𝕏" 这种组合）。
  const codepoints = Array.from(value);
  if (codepoints.length === 1 && SMP_OR_HIGHER_GLYPH.test(codepoints[0]!)) {
    return true;
  }
  return false;
}

// 走查 2026-05-18 新会话 R1（移动端视频号）：原逻辑里两条放行规则会让 <img>
// 替用户的浏览器去打陌生 host：
//   1) 任意 `./` / `../` / 裸 `xxx.png` 都被当图片渲染——结果 `<img src="x.png">`
//      在 `/tabs/channels` 这种页面上被浏览器按当前 URL 相对路径解析（实测落到
//      `/api/x.png`、`/tabs/x.png` 都拿不到），每打开一次转发 picker / 作者列表
//      就给 cloud-api 打一炮 404，referer 还把 channels 页面 URL 透出去。
//   2) `//evil.example/icon.png` 这种 scheme-relative 串前两个字符以两个「斜杠
//      类」字符开头（`/`、`\` 互相组合）的，被 URL parser 一规范化就跑到外部
//      第三方 host（隐私探针 / 跟踪像素 / 内网 SSRF）。后端
//      `isSafeAvatarValueBackend` 已经按这条规则在写入端 reject（见
//      api/src/modules/characters/characters.service.ts:1287），但 DB 里历史脏
//      数据 + curl 直 PUT 绕过仍能存进来——前端渲染要再守一道。
// 收紧成「必有可识别 scheme / 站内绝对路径前缀」：emoji / 文字会落到 isEmoji-
// Avatar 通道，外部 http(s) 头像（可信 CDN）仍然放行，裸字符串走 fallback 渐变。
const SCHEME_RELATIVE_AVATAR_RE = /^[/\\][/\\]/;
function isLikelyImageSource(value: string) {
  if (!value) {
    return false;
  }
  if (SCHEME_RELATIVE_AVATAR_RE.test(value)) {
    return false;
  }
  return (
    value.startsWith("/") ||
    value.startsWith("blob:") ||
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value)
  );
}

function resolveAvatarSource(value: string) {
  if (!value.startsWith("/api/")) {
    return value;
  }
  // 走 resolveAppMediaUrl 统一处理：(a) 拼前缀时保留 /cloud/world-api，
  // (b) 远程公网入口下追加 ?token= 让 cloud-api guard 放行（commit 1c20a2fe
  // 把裸 /api/ 在公网 Host 一律 403 兜底防匿名直通本机 owner db）。
  return resolveAppMediaUrl(value);
}

// 第三轮新会话 R3：fallback hash 只是用来从 4 个备用头像里挑一个，整个串过
// codePointAt 是浪费——前 256 字符给 4 个 bucket 分散已经足够（其实更短都够）。
// legacy 1MB data URL 头像走这条之前要 1M+ 次迭代，截短到 256 是 4000x 提速。
const PICK_FALLBACK_SEED_MAX = 256;

function pickFallbackAvatar(name?: string | null, src?: string | null) {
  const seedParts = [name?.trim(), src?.trim()].filter(Boolean);
  const seedRaw = seedParts.join(":") || "yinjie-avatar";
  const seed =
    seedRaw.length > PICK_FALLBACK_SEED_MAX
      ? seedRaw.slice(0, PICK_FALLBACK_SEED_MAX)
      : seedRaw;
  let hash = 0;

  for (const character of seed) {
    hash = (hash * 33 + (character.codePointAt(0) ?? 0)) >>> 0;
  }

  return fallbackAvatars[hash % fallbackAvatars.length] ?? defaultOwnerAvatar;
}
